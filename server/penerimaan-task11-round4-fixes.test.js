import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
const moduleExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baznas-round4-worker-'));
process.env.PENERIMAAN_EXPORT_DIR = moduleExportDir;

const { initDb, getDb } = await import('./db.js');
const {
  getPenerimaanReportSummary,
  getPenerimaanReportTransactions,
  listMuzakki,
  getMuzakkiById,
  getPenerimaanOverview,
  getDuplicateMuzakkiSuggestions,
  listReconciliationBatches,
  getReconciliationBatchById,
  createPenerimaanExportJob,
  bulkValidatePenerimaanTransactions,
  updatePenerimaanSettings,
} = await import('./repository.js');
const {
  processPenerimaanExportJob,
  runPenerimaanExportStartupMaintenance,
} = await import('./penerimaan-export-jobs.js');

before(async () => {
  await initDb();
});

after(async () => {
  fs.rmSync(moduleExportDir, { recursive: true, force: true });
});

test('Round 4 final fix: report transaction and audit defaults stay bounded while null is unbounded', async () => {
  const db = await getDb();
  const marker = `ROUND4-BOUNDED-${crypto.randomUUID()}`;
  try {
    for (let i = 0; i < 60; i += 1) {
      await db.run(
        `INSERT INTO penerimaan_audit_events
         (entity_type, entity_id, action, actor_id, actor_name, actor_role, changes, metadata, created_at)
         VALUES ('transaction', 1, 'bounded-check', 993, $1, 'staff', '{}', '{}', $2)`,
        [marker, new Date(Date.now() + i).toISOString()]
      );
      await db.run(
        `INSERT INTO penerimaan_transactions
         (transaction_number, receipt_number, channel, channel_category, muzakki_name,
          fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
         VALUES ($1, $2, 'qris', 'digital', $3, 'infak', '1', '0', '1', 'Posted', $4, $5, $5)`,
        [`${marker}-tx-${i}`, `${marker}-receipt-${i}`, marker, `${marker}-provider-${i}`, new Date(Date.now() + i).toISOString()]
      );
    }
    assert.equal((await getPenerimaanReportTransactions({ view: 'audit', search: marker }, {}, db)).length, 50);
    assert.equal((await getPenerimaanReportTransactions({ view: 'audit', search: marker }, { limit: null }, db)).length, 60);
    assert.equal((await getPenerimaanReportTransactions({ search: marker }, {}, db)).length, 50);
    assert.equal((await getPenerimaanReportTransactions({ search: marker }, { limit: null }, db)).length, 60);
  } finally {
    await db.run('DELETE FROM penerimaan_audit_events WHERE actor_name = $1', [marker]);
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref LIKE $1', [`${marker}-provider-%`]);
  }
});

test('Round 4 final fix: audit preview and PDF/XLSX exports contain event semantics without money fields', async () => {
  const row = {
    audit_event_id: 77,
    id: 77,
    entity_type: 'transaction',
    entity_id: 44,
    action: 'approve',
    actor_name: 'Auditor Test',
    actor_role: 'leader',
    changes: '{"status":"Posted"}',
    metadata: '{}',
    created_at: '2026-09-12T10:00:00.000Z',
  };
  assert.equal(Object.hasOwn(row, 'amount'), false);
  const { generatePenerimaanPdfReport, generatePenerimaanExcelReport } = await import('./penerimaan-export.js');
  const pdf = await generatePenerimaanPdfReport({ meta: { view: 'audit', job_uuid: 'audit-job-77' }, transactions: [row], actor: { name: 'Auditor Test' } });
  const rawPdf = pdf.toString('latin1');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(rawPdf.includes('/Title 14 0 R') || rawPdf.includes('/Title'));
  assert.doesNotMatch(rawPdf, /Rp 0|TOTAL PENERIMAAN|RATA-RATA TRANSAKSI/);
  const xlsx = await generatePenerimaanExcelReport({ meta: { view: 'audit' }, transactions: [row], actor: { name: 'Auditor Test' } });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Audit Trail']);
  const values = workbook.worksheets[0].getSheetValues().flat().filter(Boolean).map(String).join(' ');
  assert.match(values, /approve/);
  assert.doesNotMatch(values, /Rp 0|Nominal|Rata-rata/);
});

test('Round 4 final fix: bulk validation preserves an above-safe odd amount before formatting', async () => {
  const db = await getDb();
  const marker = `ROUND4-BULK-${crypto.randomUUID()}`;
  const oddAmount = '9007199254740995';
  try {
    await updatePenerimaanSettings({ approval_threshold: '9007199254740996' }, { name: marker }, db);
    const result = await db.run(
      `INSERT INTO penerimaan_transactions
       (transaction_number, receipt_number, channel, channel_category, muzakki_name,
        fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
       VALUES ($1, $2, 'qris', 'digital', $3, 'infak', $4, '7', $4, 'Menunggu Validasi', $5, $6, $6)`,
      [`${marker}-tx`, `${marker}-receipt`, marker, oddAmount, `${marker}-provider`, new Date().toISOString()]
    );
    const response = await bulkValidatePenerimaanTransactions({ transaction_ids: [result.lastID], actor: { id: 994, name: marker, role: 'penerimaan', division: 'Divisi Penerimaan', level: 'staff' } }, db);
    assert.equal(response.validated_count, 1, JSON.stringify(response));
    assert.equal(response.failed_count, 0);
  } finally {
    await updatePenerimaanSettings({ approval_threshold: '10000000' }, { name: marker }, db);
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref = $1', [`${marker}-provider`]);
  }
});

test('Round 4 final fix: overview and Muzakki averages retain half-up semantics exactly', async () => {
  const db = await getDb();
  const marker = `ROUND4-HALFUP-${crypto.randomUUID()}`;
  let muzakkiId = null;
  try {
    const muzakki = await db.run(
      `INSERT INTO muzakki (name, type, phone, created_at, updated_at) VALUES ($1, 'individu', $2, $3, $3)`,
      [marker, `${marker}-phone`, new Date().toISOString()]
    );
    muzakkiId = muzakki.lastID;
    for (const [idx, amount] of ['2', '3'].entries()) {
      await db.run(
        `INSERT INTO penerimaan_transactions
         (transaction_number, receipt_number, channel, channel_category, muzakki_id, muzakki_name,
          fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
         VALUES ($1, $2, 'round4_avg', 'digital', $3, $4, 'infak', $5, '0', $5, 'Posted', $6, $7, $7)`,
        [`${marker}-tx-${idx}`, `${marker}-receipt-${idx}`, muzakkiId, marker, amount, `${marker}-provider-${idx}`, new Date().toISOString()]
      );
    }
    const overview = await getPenerimaanOverview({ period: '30d', channel: 'round4_avg' }, db);
    assert.equal(overview.metrics.average_amount, '3');
    const detail = await getMuzakkiById(muzakkiId, {}, db);
    assert.equal(detail.donation_summary.avg_amount, '3');
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref LIKE $1', [`${marker}-provider-%`]);
    if (muzakkiId) await db.run('DELETE FROM muzakki WHERE id = $1', [muzakkiId]);
  }
});

test('Round 4 final fix: overview breakdowns sort numeric totals while returning strings', async () => {
  const db = await getDb();
  const marker = `ROUND4-ORDER-${crypto.randomUUID()}`;
  try {
    const rows = [
      ['round4_order_fund_a', 'round4_order_a', '900'],
      ['round4_order_fund_b', 'round4_order_b', '90'],
      ['round4_order_fund_c', 'round4_order_c', '1000'],
    ];
    for (const [idx, [fundType, channel, amount]] of rows.entries()) {
      await db.run(
        `INSERT INTO penerimaan_transactions
         (transaction_number, receipt_number, channel, channel_category, muzakki_name,
          fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
         VALUES ($1, $2, $3, 'digital', $4, $5, $6, '0', $6, 'Posted', $7, $8, $8)`,
        [`${marker}-tx-${idx}`, `${marker}-receipt-${idx}`, channel, marker, fundType, amount, `${marker}-provider-${idx}`, new Date().toISOString()]
      );
    }
    const overview = await getPenerimaanOverview({ period: '30d' }, db);
    assert.deepEqual(overview.fund_type_breakdown.filter((row) => row.amount === '1000' || row.amount === '900' || row.amount === '90').map((row) => row.amount), ['1000', '900', '90'], JSON.stringify(overview.fund_type_breakdown));
    assert.deepEqual(overview.channel_breakdown.filter((row) => row.amount === '1000' || row.amount === '900' || row.amount === '90').map((row) => row.amount), ['1000', '900', '90']);
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref LIKE $1', [`${marker}-provider-%`]);
  }
});

test('Round 4 fix: audit report omits non-applicable money properties', async () => {
  const db = await getDb();
  const marker = `ROUND4-AUDIT-OMIT-${crypto.randomUUID()}`;
  try {
    await db.run(
      `INSERT INTO penerimaan_audit_events
       (entity_type, entity_id, action, actor_id, actor_name, actor_role, changes, metadata, created_at)
       VALUES ('transaction', 1, 'review', 991, $1, 'staff', '{}', '{}', $2)`,
      [marker, new Date().toISOString()]
    );
    const summary = await getPenerimaanReportSummary({ view: 'audit', search: marker }, db);
    assert.equal(Object.hasOwn(summary.kpis, 'total_amount'), false);
    assert.equal(Object.hasOwn(summary.kpis, 'total_revenue'), false);
    assert.equal(Object.hasOwn(summary.kpis, 'average_amount'), false);
    assert.equal(Object.hasOwn(summary.reports[0], 'total_amount'), false);
  } finally {
    await db.run('DELETE FROM penerimaan_audit_events WHERE actor_name = $1', [marker]);
  }
});

test('Round 4 fix: DB-backed money paths preserve an odd above-safe value', async () => {
  const db = await getDb();
  const marker = `ROUND4-EXACT-${crypto.randomUUID()}`;
  const value = '9007199254740995';
  let muzakkiIds = [];
  let batchId = null;
  try {
    const m1 = await db.run(
      `INSERT INTO muzakki (name, type, phone, email, created_at, updated_at)
       VALUES ($1, 'individu', $2, $3, $4, $4)`,
      [`${marker}-one`, `${marker}-phone`, `${marker}-one@example.test`, new Date().toISOString()]
    );
    const m2 = await db.run(
      `INSERT INTO muzakki (name, type, phone, email, created_at, updated_at)
       VALUES ($1, 'individu', $2, $3, $4, $4)`,
      [`${marker}-two`, `${marker}-phone`, `${marker}-two@example.test`, new Date().toISOString()]
    );
    muzakkiIds = [m1.lastID, m2.lastID];
    for (const [idx, muzakkiId] of muzakkiIds.entries()) {
      const donationAmount = idx === 0 ? value : '9007199254740997';
      await db.run(
        `INSERT INTO penerimaan_transactions
         (transaction_number, receipt_number, channel, channel_category, muzakki_id, muzakki_name,
          fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
         VALUES ($1, $2, 'qris', 'digital', $3, $4, 'infak', $5, $6, $7, 'Menunggu Rekonsiliasi', $8, $9, $9)`,
        [`${marker}-tx-${idx}`, `${marker}-rcpt-${idx}`, muzakkiId, `${marker}-${idx}`, donationAmount, '7', donationAmount, `${marker}-provider-${idx}`, new Date().toISOString()]
      );
    }

    const list = await listMuzakki({ search: `${marker}-one` }, db);
    assert.equal(list.items[0].total_donations_amount, value);
    const detail = await getMuzakkiById(muzakkiIds[0], {}, db);
    assert.equal(detail.total_donations_amount, value);
    assert.equal(detail.recent_transactions[0].amount, value);
    assert.equal(detail.recent_transactions[0].fee_amount, '7');
    assert.equal(detail.recent_transactions[0].net_amount, value);

    const duplicates = await getDuplicateMuzakkiSuggestions({}, db);
    const duplicateGroup = duplicates.find((item) => item.primary.name.startsWith(marker));
    assert.ok(duplicateGroup);
    assert.equal(duplicateGroup.primary.total_donations_amount, '9007199254740997');
    assert.equal(duplicateGroup.duplicates[0].total_donations_amount, value);

    const batchResult = await db.run(
      `INSERT INTO penerimaan_reconciliation_batches
       (batch_number, channel, period_start, period_end, total_expected_count,
        total_expected_amount, total_matched_count, total_matched_amount, discrepancy_amount, status)
       VALUES ($1, 'qris', $2, $3, 1, $4, 0, $5, $6, 'draft')`,
      [`${marker}-batch`, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.999Z', value, '0', value]
    );
    batchId = batchResult.lastID;
    await db.run(
      `INSERT INTO penerimaan_statement_lines
       (batch_id, line_number, transaction_date, reference_number, description, amount, status)
       VALUES ($1, 1, $2, $3, $4, $5, 'unmatched')`,
      [batchId, new Date().toISOString(), marker, marker, value]
    );
    const batches = await listReconciliationBatches({ channel: 'qris', limit: 100 }, db);
    const batch = batches.items.find((item) => item.batch_number === `${marker}-batch`);
    assert.equal(batch.total_expected_amount, value);
    assert.equal(batch.discrepancy_amount, value);
    const batchDetail = await getReconciliationBatchById(batchId, db);
    assert.equal(batchDetail.total_expected_amount, value);
    assert.equal(batchDetail.statement_lines[0].amount, value);
    const exactTransaction = batchDetail.unmatched_transactions.find(
      (transaction) => transaction.provider_ref === `${marker}-provider-0`
    );
    assert.ok(exactTransaction);
    assert.equal(exactTransaction.amount, value);
  } finally {
    if (batchId) {
      await db.run('DELETE FROM penerimaan_matches WHERE statement_line_id IN (SELECT id FROM penerimaan_statement_lines WHERE batch_id = $1)', [batchId]);
      await db.run('DELETE FROM penerimaan_statement_lines WHERE batch_id = $1', [batchId]);
      await db.run('DELETE FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    }
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref LIKE $1', [`${marker}-provider-%`]);
    for (const id of muzakkiIds) await db.run('DELETE FROM muzakki WHERE id = $1', [id]);
  }
});

test('Round 4 fix: report average keeps established integer truncation', async () => {
  const db = await getDb();
  const marker = `ROUND4-AVG-${crypto.randomUUID()}`;
  try {
    for (const [idx, amount] of ['2', '3'].entries()) {
      await db.run(
        `INSERT INTO penerimaan_transactions
         (transaction_number, receipt_number, channel, channel_category, muzakki_name,
          fund_type, amount, fee_amount, net_amount, status, provider_ref, created_at, updated_at)
         VALUES ($1, $2, 'qris', 'digital', $3, 'infak', $4, 0, $4, 'Posted', $5, $6, $6)`,
        [`${marker}-tx-${idx}`, `${marker}-rcpt-${idx}`, marker, amount, `${marker}-${idx}`, new Date().toISOString()]
      );
    }
    const summary = await getPenerimaanReportSummary({ search: marker }, db);
    assert.equal(summary.kpis.total_amount, '5');
    assert.equal(summary.kpis.total_count, 2);
    assert.equal(summary.kpis.average_amount, '2');
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref LIKE $1', [`${marker}-%`]);
  }
});

test('Round 4 fix: audit export worker passes all matching rows to the generator', async () => {
  const db = await getDb();
  const marker = `ROUND4-WORKER-${crypto.randomUUID()}`;
  const auditIds = [];
  let jobUuid = null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baznas-worker-case-'));
  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  process.env.PENERIMAAN_EXPORT_DIR = tmpDir;
  try {
    for (let i = 0; i < 60; i += 1) {
      const result = await db.run(
        `INSERT INTO penerimaan_audit_events
         (entity_type, entity_id, action, actor_id, actor_name, actor_role, changes, metadata, created_at)
         VALUES ('transaction', 1, 'worker-export', 992, $1, 'staff', '{}', '{}', $2)`,
        [marker, new Date(Date.now() + i).toISOString()]
      );
      auditIds.push(result.lastID);
    }
    const job = await createPenerimaanExportJob({
      format: 'pdf',
      filters: { view: 'audit', search: marker },
      actor: { id: 992, name: marker },
    }, db);
    jobUuid = job.job_uuid;
    let generatedTransactions = null;
    const completed = await processPenerimaanExportJob(jobUuid, {
      generatePdfReport: async ({ transactions }) => {
        generatedTransactions = transactions;
        return Buffer.from('worker-regression');
      },
    });
    assert.equal(completed.status, 'completed');
    assert.equal(generatedTransactions.length, 60);
    assert.ok(generatedTransactions.every((transaction) => !Object.hasOwn(transaction, 'amount')));
  } finally {
    if (jobUuid) await db.run('DELETE FROM penerimaan_export_jobs WHERE job_uuid = $1', [jobUuid]);
    await db.run('DELETE FROM penerimaan_audit_events WHERE actor_name = $1', [marker]);
    process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Round 4 fix: startup maintenance awaits cleanup before recovery', async () => {
  const events = [];
  const result = await runPenerimaanExportStartupMaintenance({
    cleanup: async () => {
      events.push('cleanup-start');
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push('cleanup-end');
    },
    recover: async () => {
      events.push('recovery');
      return { resumed: 0, failed: 0, skipped: 0 };
    },
  });
  assert.deepEqual(events, ['cleanup-start', 'cleanup-end', 'recovery']);
  assert.deepEqual(result, { resumed: 0, failed: 0, skipped: 0 });
});
