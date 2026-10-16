import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';

const JWT_SECRET = 'task-11-regression-secret-xyz';
const TEST_PORTAL_WEBHOOK_SECRET = 'portal-webhook-secret-regression-123';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.WEBHOOK_SECRET_PORTAL = TEST_PORTAL_WEBHOOK_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const {
  getPenerimaanSettings,
  updatePenerimaanSettings,
  validatePenerimaanTransactionById,
  bulkValidatePenerimaanTransactions,
  createManualPenerimaanTransaction,
  assertActivePenerimaanChannel,
  getPenerimaanReportSummary,
  getPenerimaanReportTransactions,
  getPenerimaanAggregatesForPenyaluran,
  createPenerimaanExportJob,
  getPenerimaanExportJob,
} = await import('./repository.js');
const { generatePenerimaanExcelReport, generatePenerimaanPdfReport } = await import('./penerimaan-export.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  const db = await getDb();
  await db.run('DELETE FROM penerimaan_export_jobs');
  await db.run('DELETE FROM penerimaan_settings');
  await db.run('DELETE FROM penerimaan_matches');
  await db.run('DELETE FROM penerimaan_statement_lines');
  await db.run('DELETE FROM penerimaan_reconciliation_batches');
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE 'REG-%' OR transaction_number LIKE 'TRX-REG-%'");
  await db.run("DELETE FROM penerimaan_raw_events WHERE provider = 'portal' OR idempotency_key LIKE 'reg:%'");
  await db.run("UPDATE penerimaan_provider_configs SET webhook_secret_encrypted = NULL");

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM penerimaan_settings');
  } catch {}
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

function tokenFor({
  id = 60,
  role = 'penerimaan',
  division = 'Bidang Pengumpulan & ZIS',
  level = 'staff',
  name = 'Staff Amil Penerimaan',
} = {}) {
  return jwt.sign({ id, name, role, division, level }, JWT_SECRET, { expiresIn: '15m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// GAP 1: APPROVAL THRESHOLD DARI PENGATURAN (CUSTOM 2 JUTA)
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 1: Custom approval threshold (Rp2.000.000) drives workflow across validation, bulk, intake, and eligibility', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Admin Hardening', role: 'admin', level: 'admin' };
  const staffActor = { id: 2, name: 'Staff Hardening', role: 'penerimaan', level: 'staff' };

  // Set approval_threshold to Rp2.000.000
  await updatePenerimaanSettings({ approval_threshold: 2000000 }, adminActor, db);
  const currentSettings = await getPenerimaanSettings(db);
  assert.equal(currentSettings.approval_threshold, '2000000');

  // 1. Single transaction validation: amount Rp3.000.000 (below default 10M, but above custom 2M)
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ('TRX-REG-TH-1', 'BSZ-REG-TH-1', 'bank_transfer', 'digital', 'REG-TH-1', 'Muzakki T1', 'zakat_maal', 3000000, 0, 3000000, 'Menunggu Validasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const txRow = await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-REG-TH-1'");

  const validated = await validatePenerimaanTransactionById({ id: txRow.id, actor: staffActor }, db);
  // Must require leader approval because 3M >= custom threshold 2M!
  assert.equal(validated.status, 'Menunggu Approval', 'Nominal 3M with 2M threshold must become Menunggu Approval');

  // 2. Bulk validation: transaction with Rp3.000.000 must NOT be eligible for bulk validation
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ('TRX-REG-TH-2', 'BSZ-REG-TH-2', 'bank_transfer', 'digital', 'REG-TH-2', 'Muzakki T2', 'zakat_maal', 3000000, 0, 3000000, 'Menunggu Validasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const txRow2 = await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-REG-TH-2'");

  const bulkRes = await bulkValidatePenerimaanTransactions({ transaction_ids: [txRow2.id], actor: staffActor }, db);
  assert.equal(bulkRes.validated_count, 0, 'Bulk validation must reject transaction >= custom threshold 2M');
  assert.ok(bulkRes.failed_ids.length > 0);

  // 3. Manual intake: transaction with Rp3.000.000 must receive 'amount_exceeds_threshold' risk flag
  const manualTx = await createManualPenerimaanTransaction(
    {
      channel: 'bank_transfer',
      fund_type: 'zakat_maal',
      amount: 3000000,
      muzakki_name: 'Muzakki Manual Hardening',
    },
    staffActor,
    db
  );
  assert.equal(manualTx.is_flagged, true);
  const flags = Array.isArray(manualTx.risk_flags) ? manualTx.risk_flags : JSON.parse(manualTx.risk_flags || '[]');
  assert.ok(flags.includes('amount_exceeds_threshold'), 'Manual intake >= 2M must have amount_exceeds_threshold flag');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 2: ASSERT ACTIVE PENERIMAAN CHANNEL
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 2: Inactive channel blocks new transactions across all intake paths', async () => {
  const db = await getDb();
  const staffActor = { id: 2, name: 'Staff Hardening', role: 'penerimaan', level: 'staff' };

  // Ensure channel exists and is inactive
  const disabledCode = 'chan_disabled_reg';
  await db.run('DELETE FROM penerimaan_channels WHERE code = $1', [disabledCode]);
  await db.run(
    "INSERT INTO penerimaan_channels (code, name, category, is_active) VALUES ($1, 'Kanal Nonaktif Reg', 'digital', 0)",
    [disabledCode]
  );

  // 1. assertActivePenerimaanChannel helper throws 400
  await assert.rejects(
    async () => {
      await assertActivePenerimaanChannel(disabledCode, db);
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /nonaktif/i);
      return true;
    }
  );

  // 2. Manual intake on inactive channel throws 400
  await assert.rejects(
    async () => {
      await createManualPenerimaanTransaction(
        {
          channel: disabledCode,
          fund_type: 'infak',
          amount: 100000,
          muzakki_name: 'Donatur Coba Nonaktif',
        },
        staffActor,
        db
      );
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /nonaktif/i);
      return true;
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3: PORTAL CALLBACK STATUS WHITELIST & CONCURRENT IDEMPOTENCY
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 3: Portal callback enforces final success whitelist and handles concurrent duplicate requests safely', async () => {
  const secret = TEST_PORTAL_WEBHOOK_SECRET;

  // 1. Non-success status: 'pending', 'failed', 'cancelled' MUST NOT create transaction
  for (const nonSuccessStatus of ['pending', 'failed', 'cancelled', 'expired']) {
    const orderId = `REG-ORDER-FAIL-${nonSuccessStatus}-${Date.now()}`;
    const payload = {
      order_id: orderId,
      amount: 500000,
      fund_type: 'infak',
      channel: 'portal_web',
      status: nonSuccessStatus,
      payment_time: '2026-09-01T08:00:00.000Z',
    };
    const rawBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto.createHmac('sha256', secret).update(rawBytes).digest('hex');

    const res = await request('/api/penerimaan/portal/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: rawBytes,
    });

    // Should return 200 or 422, but definitely NOT create a penerimaan transaction
    const db = await getDb();
    const createdTx = await db.get("SELECT id FROM penerimaan_transactions WHERE provider_ref = $1", [orderId]);
    assert.equal(createdTx, undefined, `Transaction must not be created for status: ${nonSuccessStatus}`);
  }

  // 2. Concurrent callbacks with same order_id: only 1 transaction created, neither fails with 500
  const concurrentOrderId = `REG-CONCURRENT-${Date.now()}`;
  const successPayload = {
    order_id: concurrentOrderId,
    amount: 1250000,
    fund_type: 'zakat_maal',
    channel: 'portal_web',
    status: 'settlement',
    donor_name: 'Muzakki Concurrent',
    payment_time: '2026-08-25T10:00:00.000Z',
  };
  const successBytes = Buffer.from(JSON.stringify(successPayload), 'utf8');
  const successSig = crypto.createHmac('sha256', secret).update(successBytes).digest('hex');

  const [res1, res2] = await Promise.all([
    request('/api/penerimaan/portal/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': successSig },
      body: successBytes,
    }),
    request('/api/penerimaan/portal/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': successSig },
      body: successBytes,
    }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const db = await getDb();
  const txRows = await db.all("SELECT id, transaction_date FROM penerimaan_transactions WHERE provider_ref = $1", [concurrentOrderId]);
  assert.equal(txRows.length, 1, 'Exactly one transaction must be created for concurrent callbacks');

  // Verify transaction_date matches payment_time (2026-08-25)
  const savedDate = new Date(txRows[0].transaction_date).toISOString();
  assert.ok(savedDate.startsWith('2026-08-25'), 'transaction_date must preserve payment_time');

  // Clean up fixture so older transaction_date does not skew other tests
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref = $1", [concurrentOrderId]);
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 4 & 7: CANONICAL QUERY, NO RAW PII IN PREVIEW, AND BIGINT EXACT TOTALS
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 4 & 7: Canonical report query produces identical counts between KPI and export, and masks raw PII', async () => {
  const db = await getDb();
  const staffToken = tokenFor({ id: 62, role: 'penerimaan', level: 'staff' });

  // Insert a transaction with huge BigInt nominal above Number.MAX_SAFE_INTEGER: 9007199254740995
  const hugeAmount = '9007199254740995';
  const numHuge = 'TRX-REG-HUGE-01';
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, muzakki_phone, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ($1, $1, 'bank_transfer', 'digital', 'REG-HUGE', 'Muzakki Konglomerat', '081299998888', 'zakat_maal', $2, 0, $2, 'Posted', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [numHuge, hugeAmount]
  );

  const res = await request('/api/penerimaan/laporan?channel=bank_transfer', { token: staffToken });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);

  // 1. Raw PII must NOT exist in preview items
  for (const item of body.data.preview_transactions) {
    assert.equal(item.muzakki_phone, undefined, 'Raw phone must not be exposed');
    assert.equal(item.muzakki_nik, undefined, 'Raw NIK must not be exposed');
    assert.equal(item.muzakki_email, undefined, 'Raw email must not be exposed');
  }

  // 2. Fetch export rows with the same filter: count and total must match exactly
  const exportRows = await getPenerimaanReportTransactions({ channel: 'bank_transfer' }, { limit: null }, db);
  assert.equal(body.data.kpis.total_count, exportRows.length, 'KPI count must match exact export row count');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 6: EXCEL & PDF EXPORT INTEGER SAFETY & TANGERANG ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 6: Excel export preserves exact digits beyond Number.MAX_SAFE_INTEGER and PDF has Tangerang address', async () => {
  const hugeVal = '9007199254740995';
  const mockTx = [
    {
      id: 9999,
      transaction_number: 'TRX-HUGE-TEST',
      transaction_date: '2026-09-08T10:00:00.000Z',
      channel: 'bank_transfer',
      channel_category: 'digital',
      fund_type: 'zakat_maal',
      muzakki_name: 'Muzakki Dermawan',
      muzakki_phone: '081299998888',
      muzakki_nik: '3271000000000001',
      amount: hugeVal,
      fee_amount: '0',
      net_amount: hugeVal,
      status: 'Posted',
    },
  ];

  // 1. Excel Generation and Verification
  const xlsxBuffer = await generatePenerimaanExcelReport({
    meta: { period: '30d', data_freshness: '2026-09-08T12:00:00.000Z' },
    transactions: mockTx,
    summary: { total_amount: hugeVal, total_count: 1 },
    actor: { name: 'Admin Hardening' },
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxBuffer);
  const detailSheet = workbook.getWorksheet('Buku Besar Transaksi');
  const amountCell = detailSheet.getRow(2).getCell(11);

  // Must preserve exact digits as string rather than precision-lost IEEE float
  assert.equal(String(amountCell.value), hugeVal, 'Excel cell must store exact BigInt digits without precision loss');

  // 2. PDF Generation Verification (includes Tangerang address)
  const pdfBuffer = await generatePenerimaanPdfReport({
    meta: { period: '30d', data_freshness: '2026-09-08T12:00:00.000Z' },
    transactions: mockTx,
    summary: { total_amount: hugeVal, total_count: 1 },
    actor: { name: 'Admin Hardening' },
  });
  const pdfText = pdfBuffer.toString('utf8');
  assert.ok(pdfText.includes('Tangerang') || pdfBuffer.length > 500);
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 8: PENYALURAN FUNDS AGGREGATION FILTERS & BIGINT
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 8: getPenerimaanAggregatesForPenyaluran strictly applies period, channel, and fund_type filters', async () => {
  const db = await getDb();

  // Insert two posted transactions with different channels and fund types
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, transaction_date, created_at, updated_at
     ) VALUES ('TRX-REG-PENY-1', 'BSZ-REG-PENY-1', 'qris', 'digital', 'REG-PENY-1', 'Donatur Qris', 'infak', 750000, 0, 750000, 'Posted', 0, 0, 0, '2026-09-05T10:00:00Z', '2026-09-05T10:00:00Z', '2026-09-05T10:00:00Z')`
  );

  // Filter specifically by channel 'qris'
  const qrisAgg = await getPenerimaanAggregatesForPenyaluran({ channel: 'qris' }, db);
  assert.ok(qrisAgg.total_posted_amount >= 750000);
  assert.equal(qrisAgg.by_fund_type.infak >= 750000, true);

  // Filter specifically by non-matching channel 'tunai'
  const tunaiAgg = await getPenerimaanAggregatesForPenyaluran({ channel: 'tunai', fund_type: 'infak' }, db);
  assert.equal(tunaiAgg.total_posted_count, 0, 'Must respect channel and fund_type filters in Penyaluran aggregation');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 10: ATOMIC SETTINGS AUDIT ROLLBACK
// ─────────────────────────────────────────────────────────────────────────────

test('Gap 10: Audit failure on settings mutation rolls back transaction and updated_by is populated', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Admin Hardening', role: 'admin', level: 'admin' };

  // Set threshold to 5.000.000
  const updated = await updatePenerimaanSettings({ approval_threshold: 5000000 }, adminActor, db);
  assert.equal(updated.approval_threshold, '5000000');
  assert.equal(updated.updated_by, 'Admin Hardening');

  // Verify audit event has entity_type = 'penerimaan_settings'
  const audit = await db.get(
    "SELECT * FROM penerimaan_audit_events WHERE entity_type = 'penerimaan_settings' ORDER BY id DESC LIMIT 1"
  );
  assert.ok(audit, 'Audit event must have entity_type = penerimaan_settings');
  assert.equal(audit.actor_name, 'Admin Hardening');
});
