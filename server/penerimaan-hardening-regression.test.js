import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JWT_SECRET = 'task-11-review-fixes-jwt-secret';
const TEST_PORTAL_WEBHOOK_SECRET = 'portal-webhook-secret-review-123';
const TEST_PROVIDER_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const testExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baznas-test-export-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.WEBHOOK_SECRET_PORTAL = TEST_PORTAL_WEBHOOK_SECRET;
process.env.PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY = TEST_PROVIDER_SECRET_ENCRYPTION_KEY;
process.env.PENERIMAAN_EXPORT_DIR = testExportDir;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const { normalizeWebhookPayload } = await import('./webhook-verification.js');
const { requiresLeaderApproval } = await import('./penerimaan-permissions.js');
const {
  getPenerimaanSettings,
  updatePenerimaanSettings,
  getPenerimaanOperationalPolicy,
  createPenerimaanChannel,
  updatePenerimaanChannel,
  createPenerimaanAccount,
  updatePenerimaanAccount,
  createPenerimaanFundCategory,
  updatePenerimaanFundCategory,
  listPenerimaanProviderConfigs,
  updatePenerimaanProviderConfig,
  createPenerimaanExportJob,
  getPenerimaanExportJob,
  markPenerimaanExportJobProcessing,
  failPenerimaanExportJob,
  completePenerimaanExportJob,
  getPenerimaanReportTransactions,
  getPenerimaanReportSummary,
  getPenerimaanOverview,
  getMuzakkiById,
  formatReconciliationBatchRow,
  getPenerimaanAggregatesForPenyaluran,
  formatPenerimaanTransactionRow,
  processRawWebhookEvent,
} = await import('./repository.js');
const { formatRupiah, generatePenerimaanExcelReport, generatePenerimaanPdfReport } = await import('./penerimaan-export.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  const db = await getDb();
  await db.run('DELETE FROM penerimaan_export_jobs');
  await db.run('DELETE FROM penerimaan_settings');
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE 'REV-%'");

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (testExportDir) {
    fs.rmSync(testExportDir, { recursive: true, force: true });
  }
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

function tokenFor({
  id = 101,
  role = 'penerimaan',
  division = 'Bidang Pengumpulan & ZIS',
  level = 'staff',
  name = 'Amil Review Staff A',
} = {}) {
  return jwt.sign({ id, name, role, division, level }, JWT_SECRET, { expiresIn: '15m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

// ─────────────────────────────────────────────────────────────────────────────
// GAP 1: Webhook status validation & provider-aware mapping
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 1: Webhook normalization rejects missing, empty, unknown, and cross-provider invalid statuses', async () => {
  // 1. Missing status
  assert.throws(
    () => normalizeWebhookPayload({ provider: 'portal', payload: { provider_ref: 'ref-1', amount: 10000 } }),
    /Status pembayaran|wajib diisi|tidak valid|bukan status final/i,
    'Must reject missing status'
  );

  // 2. Empty status
  assert.throws(
    () => normalizeWebhookPayload({ provider: 'portal', payload: { provider_ref: 'ref-2', amount: 10000, status: '   ' } }),
    /Status pembayaran|wajib diisi|tidak valid|bukan status final/i,
    'Must reject empty status'
  );

  // 3. Unknown status
  assert.throws(
    () => normalizeWebhookPayload({ provider: 'portal', payload: { provider_ref: 'ref-3', amount: 10000, status: 'unknown' } }),
    /Status pembayaran|bukan status final|tidak valid/i,
    'Must reject unknown status'
  );

  // 4. Non-success statuses
  for (const nonSuccess of ['cancelled', 'expired', 'denied', 'failed']) {
    assert.throws(
      () => normalizeWebhookPayload({ provider: 'portal', payload: { provider_ref: `ref-${nonSuccess}`, amount: 10000, status: nonSuccess } }),
      /bukan status final/i,
      `Must reject non-success status: ${nonSuccess}`
    );
  }

  // 5. Cross-provider validation: Midtrans status 'capture' with fraud_status 'challenge' must be rejected
  assert.throws(
    () => normalizeWebhookPayload({
      provider: 'midtrans',
      payload: { provider_ref: 'mid-chall', amount: 10000, status: 'capture', fraud_status: 'challenge' },
    }),
    /bukan status final|fraud/i,
    'Midtrans capture with fraud_status challenge must be rejected'
  );

  // 6. Cross-provider validation: 'paid' is valid for BSI/portal, but 'capture' is invalid for BSI
  assert.throws(
    () => normalizeWebhookPayload({
      provider: 'bsi',
      payload: { provider_ref: 'bsi-cap', amount: 10000, status: 'capture' },
    }),
    /bukan status final|tidak valid/i,
    'BSI must not accept capture status'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 2: Money exactness beyond Number.MAX_SAFE_INTEGER
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 2: Amount beyond Number.MAX_SAFE_INTEGER remains exact through normalization and threshold comparison', async () => {
  const largeAmount = '9007199254740995'; // 2^53 + 3

  const norm = normalizeWebhookPayload({
    provider: 'portal',
    payload: {
      provider_ref: 'large-money-1',
      amount: largeAmount,
      status: 'success',
    },
  });

  // Must preserve exact string / BigInt, not rounded float
  assert.equal(String(norm.amount), largeAmount, 'Normalized amount must equal exact string value');

  // Exact BigInt threshold comparison
  const isHigh1 = requiresLeaderApproval({ amount: largeAmount, is_manual: false }, { approval_threshold: '10000000' });
  assert.equal(isHigh1, true, 'large amount must exceed 10M threshold');

  const isHigh2 = requiresLeaderApproval({ amount: largeAmount, is_manual: false }, { approval_threshold: '9007199254740996' });
  assert.equal(isHigh2, false, 'large amount must be strictly less than threshold + 1');

  // Exact presentation formatting
  assert.equal(formatRupiah(largeAmount), 'Rp 9.007.199.254.740.995', 'formatRupiah must format exact Rupiah string without float loss');

  // Exact Excel export
  const tx = {
    id: 999,
    transaction_number: 'TRX-LARGE-1',
    channel: 'portal',
    fund_type: 'zakat_maal',
    amount: largeAmount,
    fee_amount: '0',
    net_amount: largeAmount,
    status: 'Posted',
    created_at: '2026-09-10T10:00:00.000Z',
  };
  const excelBuf = await generatePenerimaanExcelReport({
    meta: { period: '30d' },
    transactions: [tx],
    summary: { total_amount: largeAmount, total_count: 1 },
    actor: { name: 'Tester', role: 'admin' },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const detailSheet = wb.getWorksheet('Buku Besar Transaksi');
  const amountCell = detailSheet.getRow(2).getCell(11);
  assert.equal(String(amountCell.value), largeAmount, 'Excel cell must store exact BigInt digits without precision loss');

  // Exact PDF export
  const pdfBuf = await generatePenerimaanPdfReport({
    meta: { period: '30d' },
    transactions: [tx],
    summary: { total_amount: largeAmount, total_count: 1 },
    actor: { name: 'Tester', role: 'admin' },
  });
  assert.ok(Buffer.isBuffer(pdfBuf) && pdfBuf.length > 100, 'PDF report must generate successfully');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3: Report query contract (account_id, numeric program_id, audit view)
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 3: Report filters use exact account_id, numeric program_id, program_search, and audit view', async () => {
  const db = await getDb();
  await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, provider_ref, channel, channel_category, muzakki_name,
      fund_type, amount, fee_amount, net_amount, payment_method, transaction_date,
      status, is_manual, account_id, program_id
    ) VALUES
      ('TRX-REV-001', 'REV-1', 'bank_transfer', 'digital', 'Muzakki A', 'zakat_maal', 1000000, 0, 1000000, 'bank_transfer', CURRENT_TIMESTAMP, 'Posted', 0, 1, 10),
      ('TRX-REV-002', 'REV-2', 'bank_transfer', 'digital', 'Muzakki B', 'infak', 2000000, 0, 2000000, 'bank_transfer', CURRENT_TIMESTAMP, 'Posted', 0, 2, 20)
  `);

  // Filter by exact account_id = 1
  const resAccount = await getPenerimaanReportTransactions(db, { account_id: 1 });
  assert.equal(resAccount.every((t) => Number(t.account_id) === 1), true, 'account_id filter must match t.account_id');

  // Filter by exact numeric program_id = 10
  const resProg = await getPenerimaanReportTransactions(db, { program_id: 10 });
  assert.equal(resProg.every((t) => Number(t.program_id) === 10), true, 'program_id filter must match t.program_id');

  // Ensure at least one audit event exists for audit view assertion
  await db.run(`
    INSERT INTO penerimaan_audit_events (entity_type, entity_id, action, actor_name, actor_role, created_at)
    VALUES ('penerimaan_transaction', 'TRX-REV-001', 'create_transaction', 'Tester', 'admin', CURRENT_TIMESTAMP)
  `);

  // Audit view must return audit events
  const resAudit = await getPenerimaanReportTransactions(db, { view: 'audit' });
  assert.ok(Array.isArray(resAudit));
  assert.equal(resAudit.some((row) => row.audit_event_id !== undefined || row.entity_type !== undefined || row.action !== undefined), true, 'Audit view must return real audit records');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 6: Export creation rejects unsupported format & 404 on missing jobs
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 6: Export creation rejects unsupported format and 404s missing jobs without fabricating replacements', async () => {
  const token = tokenFor({ role: 'admin', level: 'admin' });

  // 1. Unsupported format 'csv' or 'exe' returns 400
  const badFormatRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'csv', period: '30d' }),
  });
  assert.equal(badFormatRes.status, 400, 'Unsupported format must return 400');

  // 2. Query status of non-existent job returns 404
  const missingJobRes = await request('/api/penerimaan/laporan/jobs/00000000-0000-0000-0000-000000000000', {
    token,
  });
  assert.equal(missingJobRes.status, 404, 'Non-existent job status must return 404');

  // 3. Download non-existent job returns 404 and NEVER fabricates a job
  const missingExpRes = await request('/api/penerimaan/laporan/export/00000000-0000-0000-0000-000000000000', {
    token,
  });
  assert.equal(missingExpRes.status, 404, 'Non-existent job export must return 404');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 7: Export job authorization & immutability
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 7: Export job authorization and parameter immutability', async () => {
  const userAToken = tokenFor({ id: 201, role: 'penerimaan', name: 'User A' });
  const userBToken = tokenFor({ id: 202, role: 'penerimaan', name: 'User B' });
  const adminToken = tokenFor({ id: 1, role: 'admin', name: 'Admin' });

  // User A creates job with format xlsx
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: userAToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', period: '30d' }),
  });
  assert.equal(genRes.status, 202);
  const genBody = await genRes.json();
  const jobUuid = genBody.data.id;

  // Wait for background worker to complete
  let jobStatus = 'queued';
  for (let i = 0; i < 60; i++) {
    const checkRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: userAToken });
    const checkBody = await checkRes.json();
    jobStatus = checkBody.data?.status;
    if (jobStatus === 'completed' || jobStatus === 'failed') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(jobStatus, 'completed');

  // User B (non-admin) tries to view/download User A's job -> must be 403 Forbidden
  const forbiddenJob = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: userBToken });
  assert.equal(forbiddenJob.status, 403, 'Non-admin user cannot access another user export job');

  const forbiddenExp = await request(`/api/penerimaan/laporan/export/${jobUuid}`, { token: userBToken });
  assert.equal(forbiddenExp.status, 403, 'Non-admin user cannot download another user export job');

  // Admin CAN view User A's job
  const adminJob = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: adminToken });
  assert.equal(adminJob.status, 200, 'Admin can access any export job');

  // Parameter immutability: Query parameter ?format=pdf cannot override stored format xlsx
  const expRes = await request(`/api/penerimaan/laporan/export/${jobUuid}?format=pdf`, { token: userAToken });
  assert.equal(expRes.status, 200);
  assert.ok(expRes.headers.get('content-type').includes('spreadsheetml'), 'Job must retain stored format xlsx');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 8: Concurrent job download state transition
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 8: Two concurrent download attempts cannot both transition/generate the same job', async () => {
  const token = tokenFor({ role: 'admin' });
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', period: '7d' }),
  });
  assert.equal(genRes.status, 202);
  const genBody = await genRes.json();
  const jobUuid = genBody.data.id;

  // Wait for background worker to complete
  let jobStatus = 'queued';
  for (let i = 0; i < 60; i++) {
    const checkRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token });
    const checkBody = await checkRes.json();
    jobStatus = checkBody.data?.status;
    if (jobStatus === 'completed' || jobStatus === 'failed') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(jobStatus, 'completed');

  // Run two parallel requests
  const [res1, res2] = await Promise.all([
    request(`/api/penerimaan/laporan/export/${jobUuid}`, { token }),
    request(`/api/penerimaan/laporan/export/${jobUuid}`, { token }),
  ]);

  // Both succeed with 200 reading the persisted artifact
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 9: Provider secret authenticated encryption
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 9: Provider secret ciphertext differs from plaintext and is absent from API and audit responses', async () => {
  const db = await getDb();
  const adminToken = tokenFor({ role: 'admin' });
  const rawSecret = 'secret-review-key-999';

  const portalRow = await db.get("SELECT id FROM penerimaan_provider_configs WHERE provider_name = 'portal'");

  // Update secret
  const updateRes = await request(`/api/penerimaan/master-data/providers/${portalRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret_key: rawSecret }),
  });
  assert.equal(updateRes.status, 200);

  // Check database stored value is NOT plaintext
  const storedRow = await db.get('SELECT webhook_secret_encrypted FROM penerimaan_provider_configs WHERE id = $1', [portalRow.id]);
  assert.notEqual(storedRow.webhook_secret_encrypted, rawSecret, 'Ciphertext must differ from plaintext');
  assert.ok(storedRow.webhook_secret_encrypted.startsWith('v1:'), 'Ciphertext must be versioned envelope');

  // Check API response masks secret
  const listRes = await request('/api/penerimaan/master-data/providers', { token: adminToken });
  const listBody = await listRes.json();
  const portalConfig = listBody.data.find((p) => p.provider_name === 'portal');
  assert.equal(portalConfig.secret_key, undefined, 'API response must never expose secret_key property');
  assert.equal(portalConfig.secret_masked, '••••••••');
  assert.equal(portalConfig.is_secret_set, true);

  // Check audit trail NEVER contains plaintext or ciphertext
  const auditRow = await db.get("SELECT changes FROM penerimaan_audit_events WHERE entity_id = $1 ORDER BY id DESC LIMIT 1", [`provider_config:${portalRow.id}`]);
  const auditStr = JSON.stringify(auditRow);
  assert.equal(auditStr.includes(rawSecret), false, 'Audit must never contain raw secret');
  assert.equal(auditStr.includes(storedRow.webhook_secret_encrypted), false, 'Audit must never contain ciphertext envelope');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 10: Settings validation rejects unknown keys, invalid booleans, unsafe thresholds
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 10: Settings writes reject unknown keys, string booleans, and unsafe thresholds', async () => {
  const adminToken = tokenFor({ role: 'admin' });

  // 1. Unknown keys in settings update
  const unknownKeyRes = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: 10000000, rogue_key: 'hacked' }),
  });
  assert.equal(unknownKeyRes.status, 400, 'Must reject unknown keys');

  // 2. String boolean instead of true boolean in channel update
  const channelRow = await (await getDb()).get('SELECT id FROM penerimaan_channels LIMIT 1');
  const stringBoolRes = await request(`/api/penerimaan/master-data/channels/${channelRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: 'false' }),
  });
  assert.equal(stringBoolRes.status, 400, 'Must reject string boolean in channel');

  // 3. String boolean in account update
  const accRow = await (await getDb()).get('SELECT id FROM penerimaan_accounts LIMIT 1');
  const accBoolRes = await request(`/api/penerimaan/master-data/accounts/${accRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: 'false' }),
  });
  assert.equal(accBoolRes.status, 400, 'Must reject string boolean in account');

  // 4. String boolean in provider update
  const provRow = await (await getDb()).get('SELECT id FROM penerimaan_provider_configs LIMIT 1');
  const provBoolRes = await request(`/api/penerimaan/master-data/providers/${provRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: 'false' }),
  });
  assert.equal(provBoolRes.status, 400, 'Must reject string boolean in provider');

  // 5. Unsafe threshold (negative or float)
  const badThresholdRes1 = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: -500 }),
  });
  assert.equal(badThresholdRes1.status, 400, 'Must reject negative threshold');

  const badThresholdRes2 = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: 10000000.5 }),
  });
  assert.equal(badThresholdRes2.status, 400, 'Must reject float threshold');

  // 6. Code immutability in channel update
  const codeMutateRes = await request(`/api/penerimaan/master-data/channels/${channelRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'illegal_code_change' }),
  });
  assert.equal(codeMutateRes.status, 400, 'Must reject code mutation on channel');

  // 7. Invalid foreign reference in account
  const invalidRefRes = await request(`/api/penerimaan/master-data/accounts/${accRow.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_id: 9999999 }),
  });
  assert.equal(invalidRefRes.status, 400, 'Must reject invalid channel reference in account');
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 11: Forced audit failure rolls back all resource mutations
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 11: Forced audit failure rolls back mutations across all settings resources', async () => {
  const db = await getDb();
  const adminActor = { id: 1, name: 'Admin', role: 'admin' };

  // Break audit table temporarily to simulate failure
  await db.run('ALTER TABLE penerimaan_audit_events RENAME TO penerimaan_audit_events_backup');

  try {
    // 1. Channel update must roll back
    const chBefore = await db.get('SELECT * FROM penerimaan_channels LIMIT 1');
    await assert.rejects(
      () => updatePenerimaanChannel(chBefore.id, { name: 'Rolled Back Name' }, adminActor, db),
      'Must reject when audit write fails'
    );
    const chAfter = await db.get('SELECT name FROM penerimaan_channels WHERE id = $1', [chBefore.id]);
    assert.equal(chAfter.name, chBefore.name, 'Channel update must be rolled back');

    // 2. Operational settings update must roll back
    const settingsBefore = await getPenerimaanSettings(db);
    await assert.rejects(
      () => updatePenerimaanSettings({ approval_threshold: 99999999 }, adminActor, db),
      'Must reject when audit write fails'
    );
    const settingsAfter = await getPenerimaanSettings(db);
    assert.equal(settingsAfter.approval_threshold, settingsBefore.approval_threshold, 'Settings update must be rolled back');

    // 3. Account update must roll back
    const accBefore = await db.get('SELECT * FROM penerimaan_accounts LIMIT 1');
    if (accBefore) {
      await assert.rejects(
        () => updatePenerimaanAccount(accBefore.id, { bank_name: 'Rolled Back Bank' }, adminActor, db),
        'Must reject when audit write fails'
      );
      const accAfter = await db.get('SELECT bank_name FROM penerimaan_accounts WHERE id = $1', [accBefore.id]);
      assert.equal(accAfter.bank_name, accBefore.bank_name, 'Account update must be rolled back');
    }

    // 4. Fund category update must roll back
    const catBefore = await db.get('SELECT * FROM penerimaan_fund_categories LIMIT 1');
    if (catBefore) {
      await assert.rejects(
        () => updatePenerimaanFundCategory(catBefore.id, { name: 'Rolled Back Cat' }, adminActor, db),
        'Must reject when audit write fails'
      );
      const catAfter = await db.get('SELECT name FROM penerimaan_fund_categories WHERE id = $1', [catBefore.id]);
      assert.equal(catAfter.name, catBefore.name, 'Fund category update must be rolled back');
    }

    // 5. Provider config update must roll back
    const provBefore = await db.get('SELECT * FROM penerimaan_provider_configs LIMIT 1');
    if (provBefore) {
      await assert.rejects(
        () => updatePenerimaanProviderConfig(provBefore.id, { display_name: 'Rolled Back Prov' }, adminActor, db),
        'Must reject when audit write fails'
      );
      const provAfter = await db.get('SELECT display_name FROM penerimaan_provider_configs WHERE id = $1', [provBefore.id]);
      assert.equal(provAfter.display_name, provBefore.display_name, 'Provider config update must be rolled back');
    }
  } finally {
    await db.run('ALTER TABLE penerimaan_audit_events_backup RENAME TO penerimaan_audit_events');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 12: Report freshness derived from stored data
// ─────────────────────────────────────────────────────────────────────────────
test('Gap 12: Report freshness is derived from stored records, not wall-clock time', async () => {
  const db = await getDb();
  const summary = await getPenerimaanReportSummary(db, { period: '30d' });

  // Freshness must either be a historical date string matching max updated_at, or a real record timestamp
  assert.ok(summary.meta);
  assert.notEqual(summary.meta.data_freshness, 'Real-time', 'Cannot be hardcoded Real-time');

  if (summary.meta.data_freshness) {
    const { buildPenerimaanReportFilterQuery } = await import('./penerimaan-report-query.js');
    const { whereSql, values } = buildPenerimaanReportFilterQuery({ period: '30d' }, '');
    const maxRow = await db.get(`SELECT MAX(updated_at) as max_updated FROM penerimaan_transactions ${whereSql}`, values);
    if (maxRow?.max_updated) {
      assert.equal(new Date(summary.meta.data_freshness).toISOString(), new Date(maxRow.max_updated).toISOString());
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1: Exact money across repository boundaries
// ─────────────────────────────────────────────────────────────────────────────
test('Task 1: repository money and webhook threshold exactness', async () => {
  const exact = '9007199254740995';
  const formatted = formatPenerimaanTransactionRow({ amount: exact });
  assert.equal(String(formatted.amount), exact);

  const db = await getDb();
  const uniqueRef = `EXACT-MONEY-${Date.now()}`;
  let rowId1 = null;
  let rowId2 = null;
  let txId1 = null;
  let txId2 = null;
  const initialSettings = await getPenerimaanSettings(db);

  try {
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, transaction_date, channel, channel_category,
         fund_type, amount, fee_amount, net_amount, status, provider_name, provider_ref,
         muzakki_name, created_by_name, created_at, updated_at
       ) VALUES ($1, $2, CURRENT_TIMESTAMP, 'bank_transfer', 'digital', 'zakat', $3, '0', $3, 'Verified', 'portal', $4, 'Test Donatur', 'Amil', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [`TX-${uniqueRef}`, `RC-${uniqueRef}`, exact, uniqueRef]
    );
    const rows = await getPenerimaanReportTransactions({ search: uniqueRef }, {}, db);
    assert.ok(rows.length > 0);
    assert.equal(String(rows[0].amount), exact);

    // Webhook transaction where amount is 9007199254740995 and threshold is 9007199254740996; assert it is not flagged.
    // Repeat with threshold 9007199254740994; assert it is flagged.
    await updatePenerimaanSettings({ approval_threshold: '9007199254740996' }, { id: 1, name: 'Admin' }, db);
    const key1 = `raw-key-1-${Date.now()}`;
    const eventRes1 = await db.run(
      `INSERT INTO penerimaan_raw_events (provider, idempotency_key, payload, status)
       VALUES ('portal', $1, $2, 'pending')`,
      [
        key1,
        JSON.stringify({
          order_id: `EV-1-${Date.now()}`,
          status: 'paid',
          amount: exact,
          transaction_time: new Date().toISOString(),
          donor_name: 'Donatur BigInt 1',
        }),
      ]
    );
    rowId1 = eventRes1.lastID || (await db.get('SELECT last_insert_rowid() as id')).id;
    const processed1 = await processRawWebhookEvent(rowId1, { id: 1, name: 'Amil' }, db);
    txId1 = processed1.transaction.id;
    const txRow1 = await db.get('SELECT * FROM penerimaan_transactions WHERE id = $1', [txId1]);
    assert.equal(Boolean(txRow1.is_flagged), false, 'Amount 9007199254740995 with threshold 9007199254740996 must NOT be flagged');

    await updatePenerimaanSettings({ approval_threshold: '9007199254740994' }, { id: 1, name: 'Admin' }, db);
    const key2 = `raw-key-2-${Date.now()}`;
    const eventRes2 = await db.run(
      `INSERT INTO penerimaan_raw_events (provider, idempotency_key, payload, status)
       VALUES ('portal', $1, $2, 'pending')`,
      [
        key2,
        JSON.stringify({
          order_id: `EV-2-${Date.now()}`,
          status: 'paid',
          amount: exact,
          transaction_time: new Date().toISOString(),
          donor_name: 'Donatur BigInt 2',
        }),
      ]
    );
    rowId2 = eventRes2.lastID || (await db.get('SELECT last_insert_rowid() as id')).id;
    const processed2 = await processRawWebhookEvent(rowId2, { id: 1, name: 'Amil' }, db);
    txId2 = processed2.transaction.id;
    const txRow2 = await db.get('SELECT * FROM penerimaan_transactions WHERE id = $1', [txId2]);
    assert.equal(Boolean(txRow2.is_flagged), true, 'Amount 9007199254740995 with threshold 9007199254740994 MUST be flagged');
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref = $1', [uniqueRef]);
    if (txId1) await db.run('DELETE FROM penerimaan_transactions WHERE id = $1', [txId1]);
    if (txId2) await db.run('DELETE FROM penerimaan_transactions WHERE id = $1', [txId2]);
    if (rowId1) await db.run('DELETE FROM penerimaan_raw_events WHERE id = $1', [rowId1]);
    if (rowId2) await db.run('DELETE FROM penerimaan_raw_events WHERE id = $1', [rowId2]);
    if (initialSettings?.approval_threshold) {
      await updatePenerimaanSettings({ approval_threshold: initialSettings.approval_threshold }, { id: 1, name: 'Admin' }, db);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2: Audit report summary and freshness use the audit dataset
// ─────────────────────────────────────────────────────────────────────────────
test('Task 2: audit report summary and freshness use the audit dataset', async () => {
  const db = await getDb();
  const start_date = '2026-03-01';
  const end_date = '2026-03-05';

  const auditTs1 = '2026-03-02T10:00:00.000Z';
  const auditTs2 = '2026-03-03T11:00:00.000Z';
  const auditTs3 = '2026-03-04T12:00:00.000Z';

  await db.run("DELETE FROM penerimaan_audit_events WHERE created_at >= '2026-03-01T00:00:00.000Z' AND created_at <= '2026-03-05T23:59:59.999Z'");

  const uniqueAuditTxRef = `REF-AUDIT-TEST-${Date.now()}`;
  try {
    await db.run(
      `INSERT INTO penerimaan_audit_events (entity_type, entity_id, action, actor_name, actor_role, created_at)
       VALUES ('transaction', 'tx-test-1', 'create', 'Amil 1', 'staff', $1)`,
      [auditTs1]
    );
    await db.run(
      `INSERT INTO penerimaan_audit_events (entity_type, entity_id, action, actor_name, actor_role, created_at)
       VALUES ('transaction', 'tx-test-2', 'approve', 'Amil 2', 'leader', $1)`,
      [auditTs2]
    );
    await db.run(
      `INSERT INTO penerimaan_audit_events (entity_type, entity_id, action, actor_name, actor_role, created_at)
       VALUES ('transaction', 'tx-test-3', 'verify', 'Amil 3', 'staff', $1)`,
      [auditTs3]
    );

    // Unrelated transaction with a different timestamp
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, transaction_date, channel, channel_category,
         fund_type, amount, fee_amount, net_amount, status, provider_name, provider_ref,
         muzakki_name, created_by_name, created_at, updated_at
       ) VALUES ($1, $2, '2026-03-05T20:00:00.000Z', 'bank_transfer', 'digital', 'zakat', '500000', '0', '500000', 'Verified', 'portal', $3, 'Donatur Audit', 'Amil', '2026-03-05T20:00:00.000Z', '2026-03-05T20:00:00.000Z')`,
      [`TX-${uniqueAuditTxRef}`, `RC-${uniqueAuditTxRef}`, uniqueAuditTxRef]
    );

    const report = await getPenerimaanReportSummary(db, { view: 'audit', period: 'custom', start_date, end_date });
    assert.equal(report.kpis.total_count, 3);
    assert.equal(new Date(report.meta.data_freshness).toISOString(), new Date(auditTs3).toISOString());
    assert.ok(report.preview_transactions.length >= 3);
    assert.ok(report.preview_transactions.every((row) => row.audit_event_id));
    assert.equal(Object.hasOwn(report.kpis, 'total_amount'), false, 'Audit KPI total_amount must be omitted');

    // Also verify normal view empty dataset returns data_freshness: null
    const emptyReport = await getPenerimaanReportSummary(db, { period: 'custom', start_date: '2019-01-01', end_date: '2019-01-02' });
    assert.equal(emptyReport.kpis.total_count, 0);
    assert.equal(emptyReport.meta.data_freshness, null, 'Empty report must have data_freshness null');
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref = $1', [uniqueAuditTxRef]);
    await db.run("DELETE FROM penerimaan_audit_events WHERE created_at >= '2026-03-01T00:00:00.000Z' AND created_at <= '2026-03-05T23:59:59.999Z'");
  }
});

test('Task 3: Export job state machine, atomic claim, persisted artifact, and authorization', async () => {
  const { processPenerimaanExportJob, getExportDirectory } = await import('./penerimaan-export-jobs.js');
  const adminToken = tokenFor({ id: 1, role: 'admin', name: 'Admin' });
  const userToken = tokenFor({ id: 250, role: 'penerimaan', name: 'User 250' });
  const otherUserToken = tokenFor({ id: 251, role: 'penerimaan', name: 'User 251' });

  // 1. POST generate -> 202 queued
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: userToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', period: '7d' }),
  });
  assert.equal(genRes.status, 202, 'Generate must return 202 Accepted');
  const genBody = await genRes.json();
  assert.equal(genBody.success, true);
  const jobUuid = genBody.data.id;
  assert.equal(genBody.data.status, 'queued');
  assert.ok(genBody.data.download_url.includes(jobUuid));

  // 2. GET export while queued -> 409
  const manualQueuedJob = await createPenerimaanExportJob({
    jobType: 'penerimaan_report',
    format: 'pdf',
    filters: { period: '30d' },
    actor: { id: 250, name: 'User 250' },
  });
  const pendingRes = await request(`/api/penerimaan/laporan/export/${manualQueuedJob.job_uuid}`, {
    token: userToken,
  });
  assert.equal(pendingRes.status, 409, 'GET export while queued must return 409 Conflict');
  const pendingBody = await pendingRes.json();
  assert.equal(pendingBody.code, 'EXPORT_JOB_PENDING');

  // 3. Worker claim -> processing using one conditional UPDATE
  const claimedJob = await markPenerimaanExportJobProcessing(manualQueuedJob.job_uuid, { id: 250 });
  assert.equal(claimedJob.status, 'processing');

  // Concurrent claim must fail with 409 conflict
  await assert.rejects(
    async () => {
      await markPenerimaanExportJobProcessing(manualQueuedJob.job_uuid, { id: 250 });
    },
    (err) => err.status === 409
  );

  // 4. GET export while processing -> 409
  const processingRes = await request(`/api/penerimaan/laporan/export/${manualQueuedJob.job_uuid}`, {
    token: userToken,
  });
  assert.equal(processingRes.status, 409, 'GET export while processing must return 409 Conflict');

  // Calling processPenerimaanExportJob on already processing job must reject with 409
  await assert.rejects(
    async () => {
      await processPenerimaanExportJob(manualQueuedJob.job_uuid);
    },
    (err) => err.status === 409
  );

  // 5. Worker success -> completed with one persisted artifact (processor wins queued -> processing)
  const generateJob = await createPenerimaanExportJob({
    jobType: 'penerimaan_report',
    format: 'pdf',
    filters: { period: '30d' },
    actor: { id: 250, name: 'User 250' },
  });
  const completedJob = await processPenerimaanExportJob(generateJob.job_uuid);
  assert.equal(completedJob.status, 'completed');
  assert.ok(completedJob.artifact_path, 'Completed job must have artifact_path');
  const fs = await import('node:fs');
  assert.ok(fs.existsSync(completedJob.artifact_path), 'Artifact file must exist on disk');

  // 6. Complete and fail require rowCount === 1 (cannot transition already completed job)
  await assert.rejects(
    async () => {
      await completePenerimaanExportJob(generateJob.job_uuid, { fileName: 'test.pdf', fileSize: 100 });
    },
    (err) => err.status === 409
  );
  await assert.rejects(
    async () => {
      await failPenerimaanExportJob(generateJob.job_uuid, 'Fail completed');
    },
    (err) => err.status === 409
  );

  // 7. GET export when completed -> 200, reads persisted artifact
  const downloadRes1 = await request(`/api/penerimaan/laporan/export/${generateJob.job_uuid}`, {
    token: userToken,
  });
  assert.equal(downloadRes1.status, 200);
  const bytes1 = Buffer.from(await downloadRes1.arrayBuffer());
  assert.ok(bytes1.length > 0);

  // 8. Completed downloads are repeatable without regenerating
  const downloadRes2 = await request(`/api/penerimaan/laporan/export/${generateJob.job_uuid}`, {
    token: userToken,
  });
  assert.equal(downloadRes2.status, 200);
  const bytes2 = Buffer.from(await downloadRes2.arrayBuffer());
  assert.equal(bytes1.length, bytes2.length);

  // 9. Jobs with a missing creator are denied to non-admin users
  const db = await getDb();
  const orphanJobUuid = crypto.randomUUID();
  await db.run(
    `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at)
     VALUES ($1, 'penerimaan_report', 'pdf', 'completed', NULL, $2)`,
    [orphanJobUuid, new Date().toISOString()]
  );
  const orphanJobRes = await request(`/api/penerimaan/laporan/jobs/${orphanJobUuid}`, {
    token: userToken,
  });
  assert.equal(orphanJobRes.status, 403, 'Missing creator job must be denied to non-admin on jobs route');

  const orphanExpRes = await request(`/api/penerimaan/laporan/export/${orphanJobUuid}`, {
    token: userToken,
  });
  assert.equal(orphanExpRes.status, 403, 'Missing creator job must be denied to non-admin on export route');

  // Admin can access orphan job
  const adminOrphanJobRes = await request(`/api/penerimaan/laporan/jobs/${orphanJobUuid}`, {
    token: adminToken,
  });
  assert.equal(adminOrphanJobRes.status, 200, 'Admin can access orphan job');

  // Non-owner non-admin user is denied access to user 250's job
  const otherUserExpRes = await request(`/api/penerimaan/laporan/export/${manualQueuedJob.job_uuid}`, {
    token: otherUserToken,
  });
  assert.equal(otherUserExpRes.status, 403, 'Non-owner must be denied access to export job');

  // 10. Worker failure -> failed with stable public error code
  const failJob = await createPenerimaanExportJob({
    jobType: 'penerimaan_report',
    format: 'pdf',
    filters: { period: '30d' },
    actor: { id: 250, name: 'User 250' },
  });
  await markPenerimaanExportJobProcessing(failJob.job_uuid, { id: 250 });
  await failPenerimaanExportJob(failJob.job_uuid, 'Worker database failure');
  const failedDownloadRes = await request(`/api/penerimaan/laporan/export/${failJob.job_uuid}`, {
    token: userToken,
  });
  assert.equal(failedDownloadRes.status, 422, 'Failed export job must return 422 Unprocessable Entity');
  const failedBody = await failedDownloadRes.json();
  assert.equal(failedBody.code, 'EXPORT_JOB_FAILED');
  assert.match(failedBody.message, /Worker database failure/);
});

test('Task 4: Strict report filter normalization and allowlisted sort', async () => {
  const { normalizeReportFilters } = await import('./penerimaan-report-query.js');

  // Strict rejection of malformed inputs
  assert.throws(() => normalizeReportFilters({ account_id: '12abc' }), /account_id/i);
  assert.throws(() => normalizeReportFilters({ is_manual: 'banana' }), /is_manual/i);
  assert.throws(() => normalizeReportFilters({ sort_by: 'amount; DROP TABLE' }), /sort_by/i);
  assert.throws(() => normalizeReportFilters({ program_id: 'bad-id' }), /program_id/i);
  assert.throws(() => normalizeReportFilters({ muzakki_id: 'xyz' }), /muzakki_id/i);
  assert.throws(() => normalizeReportFilters({ is_flagged: 'not-a-bool' }), /is_flagged/i);
  assert.throws(() => normalizeReportFilters({ view: 'hacked_view' }), /view/i);
  assert.throws(() => normalizeReportFilters({ reconciliation_status: 'unknown_status' }), /reconciliation_status/i);
  assert.throws(() => normalizeReportFilters({ sort_dir: 'SIDEWAYS' }), /sort_dir/i);

  // Valid inputs normalize correctly
  const normalized = normalizeReportFilters({
    account_id: '15',
    program_id: '42',
    muzakki_id: '100',
    mode: 'manual',
    is_flagged: 'true',
    view: 'audit',
    reconciliation_status: 'reconciled',
    sort_by: 'amount',
    sort_dir: 'ASC',
  });
  assert.equal(normalized.account_id, 15);
  assert.equal(normalized.program_id, 42);
  assert.equal(normalized.muzakki_id, 100);
  assert.equal(normalized.is_manual, 1);
  assert.equal(normalized.is_flagged, 1);
  assert.equal(normalized.view, 'audit');
  assert.equal(normalized.reconciliation_status, 'reconciled');
  assert.equal(normalized.sort_by, 'amount');
  assert.equal(normalized.sort_dir, 'ASC');
});

test('Task 5: Provider runtime fail-closed, exact allowlist, and inactive provider rejection', async () => {
  const { resolveConfiguredProviderSecret, SUPPORTED_PROVIDERS } = await import('./penerimaan-provider-secrets.js');
  const db = await getDb();

  // 1. Exact allowlist - unknown provider rejected
  await assert.rejects(
    async () => resolveConfiguredProviderSecret('unknown_gate', db),
    /not recognized or supported/i
  );

  // 2. Fuzzy match rejected
  await assert.rejects(
    async () => resolveConfiguredProviderSecret('portal_extra', db),
    /not recognized or supported/i
  );

  // 3. Supported providers exist and match allowlist
  for (const prov of SUPPORTED_PROVIDERS) {
    const row = await db.get('SELECT provider_name, is_active FROM penerimaan_provider_configs WHERE provider_name = $1', [prov]);
    assert.ok(row, `Provider ${prov} must exist in seed`);
  }

  // 4. Inactive provider rejection
  await db.run("UPDATE penerimaan_provider_configs SET is_active = 0 WHERE provider_name = 'portal'");
  try {
    await assert.rejects(
      async () => resolveConfiguredProviderSecret('portal', db),
      (err) => {
        assert.ok(/inactive/i.test(err.message));
        assert.equal(err.status, 403);
        return true;
      }
    );

    // Inactive webhook endpoint rejects with 403
    const res = await request('/api/penerimaan/webhook/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'dummy' },
      body: JSON.stringify({ dummy: 'payload' }),
    });
    assert.equal(res.status, 403);
  } finally {
    await db.run("UPDATE penerimaan_provider_configs SET is_active = 1 WHERE provider_name = 'portal'");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUND 3 - TASK 1: Private export artifacts and path containment
// ─────────────────────────────────────────────────────────────────────────────
test('Round 3 - Task 1: export artifact is private and cannot be read anonymously via /uploads/exports/', async () => {
  const { processPenerimaanExportJob } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const userToken = tokenFor({ id: 250, role: 'penerimaan', name: 'User 250' });

  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  const tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-export-test-'));
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  try {
    const job = await createPenerimaanExportJob({
      jobType: 'penerimaan_report',
      format: 'xlsx',
      filters: { period: '7d' },
      actor: { id: 250, name: 'User 250' },
    });

    const completed = await processPenerimaanExportJob(job.job_uuid);
    assert.ok(completed.artifact_path);
    const fileName = path.basename(completed.artifact_path);

    const anonStaticRes = await fetch(`${baseUrl}/uploads/exports/${fileName}`);
    assert.equal(anonStaticRes.status, 404, 'Anonymous request to /uploads/exports/ must return 404');
  } finally {
    if (originalExportDir !== undefined) {
      process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    } else {
      delete process.env.PENERIMAAN_EXPORT_DIR;
    }
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 3 - Task 1: artifact-path containment rejects prefix-sibling and traversal paths', async () => {
  const { getExportDirectory } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const adminToken = tokenFor({ id: 1, role: 'admin', name: 'Admin' });
  const db = await getDb();

  const exportDir = path.resolve(getExportDirectory());
  const evilSiblingDir = `${exportDir}-evil`;
  await fs.promises.mkdir(evilSiblingDir, { recursive: true });
  const evilFile = path.join(evilSiblingDir, 'evil.pdf');
  await fs.promises.writeFile(evilFile, '%PDF-1.4 fake evil content');

  try {
    const evilJobUuid = crypto.randomUUID();
    await db.run(
      `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, artifact_path, file_name)
       VALUES ($1, 'penerimaan_report', 'pdf', 'completed', 1, $2, $3, 'evil.pdf')`,
      [evilJobUuid, new Date().toISOString(), evilFile]
    );

    const res = await request(`/api/penerimaan/laporan/export/${evilJobUuid}`, {
      token: adminToken,
    });
    assert.equal(res.status, 404, 'Prefix-sibling path must be rejected with 404');
  } finally {
    await fs.promises.rm(evilSiblingDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 4 - export retention keeps active writes and removes only stale artifacts', async () => {
  const { cleanupExportDirectory, isContainedInExportDirectory } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const os = await import('node:os');
  const fs = await import('node:fs');

  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  const tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-cleanup-test-'));
  const siblingDir = `${tmpExportDir}-sibling`;
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  try {
    const recentTmp = path.join(tmpExportDir, '.recent.tmp');
    const staleTmp = path.join(tmpExportDir, '.stale.tmp');
    const recentArtifact = path.join(tmpExportDir, 'recent.pdf');
    const staleArtifact = path.join(tmpExportDir, 'stale.pdf');
    const siblingFile = path.join(siblingDir, 'sibling.pdf');
    await fs.promises.writeFile(recentTmp, 'active temp data');
    await fs.promises.writeFile(staleTmp, 'orphan temp data');
    await fs.promises.writeFile(recentArtifact, 'recent artifact');
    await fs.promises.writeFile(staleArtifact, 'stale artifact');
    await fs.promises.mkdir(siblingDir, { recursive: true });
    await fs.promises.writeFile(siblingFile, 'sibling artifact');
    const staleTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.promises.utimes(staleTmp, staleTime, staleTime);
    await fs.promises.utimes(staleArtifact, staleTime, staleTime);

    assert.ok(isContainedInExportDirectory(recentTmp, tmpExportDir));
    assert.ok(isContainedInExportDirectory(recentArtifact, tmpExportDir));
    assert.strictEqual(isContainedInExportDirectory(siblingFile, tmpExportDir), false);

    const result = await cleanupExportDirectory({ maxAgeMs: 60 * 60 * 1000, tempMaxAgeMs: 60 * 60 * 1000 });

    assert.deepEqual(result, { removedTemporary: 1, removedArtifacts: 1 });
    assert.equal(fs.existsSync(recentTmp), true, 'Recent temporary file must survive');
    assert.equal(fs.existsSync(staleTmp), false, 'Stale temporary file must be removed');
    assert.equal(fs.existsSync(recentArtifact), true, 'Recent artifact must survive');
    assert.equal(fs.existsSync(staleArtifact), false, 'Stale artifact must be removed');
    assert.equal(fs.existsSync(siblingFile), true, 'Prefix sibling file must survive');
  } finally {
    if (originalExportDir !== undefined) {
      process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    } else {
      delete process.env.PENERIMAAN_EXPORT_DIR;
    }
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
    await fs.promises.rm(siblingDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 4 - audit export is unbounded while preview remains paginated', async () => {
  const db = await getDb();
  const marker = `ROUND4-AUDIT-${crypto.randomUUID()}`;
  for (let i = 0; i < 60; i += 1) {
    await db.run(
      `INSERT INTO penerimaan_audit_events
        (entity_type, entity_id, action, actor_name, actor_role, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      ['transaction', `${marker}-${i}`, 'round4_audit_marker', marker, 'staff', '{}']
    );
  }

  const allRows = await getPenerimaanReportTransactions(
    { view: 'audit', search: marker },
    { limit: null },
    db
  );
  assert.equal(allRows.length, 60);

  const preview = await getPenerimaanReportTransactions(
    { view: 'audit', search: marker },
    { limit: 1, offset: 1 },
    db
  );
  assert.equal(preview.length, 1);
  assert.notEqual(preview[0].id, allRows[0].id);
});

test('Round 4 - every rupiah response preserves small and above-safe-integer values as strings', async () => {
  const oddValue = '9007199254740995';
  assert.equal(typeof formatPenerimaanTransactionRow({ amount: 125000, fee_amount: 0, net_amount: 125000 }).amount, 'string');
  assert.equal(formatPenerimaanTransactionRow({ amount: oddValue, fee_amount: oddValue, net_amount: oddValue }).amount, oddValue);

  const formattedBatch = formatReconciliationBatchRow({
    id: 1,
    total_expected_count: 2,
    total_expected_amount: oddValue,
    total_matched_count: 1,
    total_matched_amount: 125000,
    discrepancy_amount: oddValue,
  });
  assert.equal(formattedBatch.total_expected_amount, oddValue);
  assert.equal(formattedBatch.total_matched_amount, '125000');
  assert.equal(typeof formattedBatch.total_expected_count, 'number');

  const db = await getDb();
  const marker = `ROUND4-MONEY-${crypto.randomUUID()}`;
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE 'ROUND4-MONEY-%'");
  await db.run(
    `INSERT INTO penerimaan_transactions
      (transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status, created_at, updated_at)
     VALUES ($1, $1, 'qris', 'digital', $2, $3, 'qurban', $4, 0, $4, 'Posted', $5, $5)`,
    [marker, marker, marker, oddValue, '2026-09-12T10:00:00.000Z']
  );
  const overview = await getPenerimaanOverview({ period: 'custom', start_date: '2026-09-12', end_date: '2026-09-12', channel: 'qris', fund_type: 'qurban' }, db);
  assert.equal(overview.metrics.total_collected, oddValue);
  assert.equal(overview.metrics.average_amount, oddValue);
  assert.equal(overview.metrics.total_transactions, 1);
  assert.equal(typeof overview.trend[0].amount, 'string');
  assert.equal(typeof overview.channel_breakdown[0].percentage, 'number');

  const aggregates = await getPenerimaanAggregatesForPenyaluran({ channel: 'qris', fund_type: 'qurban' }, db);
  assert.equal(aggregates.total_posted_amount, oddValue);
  assert.equal(aggregates.by_fund_type.qurban, oddValue);
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUND 3 - TASK 2: Single-winner durable export state machine & recovery
// ─────────────────────────────────────────────────────────────────────────────
test('Round 3 - Task 2: concurrent invocations for one queued job generate exactly once (single winner)', async () => {
  const { processPenerimaanExportJob } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const os = await import('node:os');
  const fs = await import('node:fs');

  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  const tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-concurrent-test-'));
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  try {
    const job = await createPenerimaanExportJob({
      jobType: 'penerimaan_report',
      format: 'pdf',
      filters: { period: '7d' },
      actor: { id: 250, name: 'User 250' },
    });

    // Run two worker processes concurrently for the same queued job
    const results = await Promise.allSettled([
      processPenerimaanExportJob(job.job_uuid),
      processPenerimaanExportJob(job.job_uuid),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // At least one fulfilled; if one was rejected, it must be with 409 conflict
    assert.ok(fulfilled.length >= 1, 'At least one worker must fulfill');
    for (const rej of rejected) {
      assert.equal(rej.reason?.status, 409, 'Losing worker must be rejected with 409 conflict');
    }

    const db = await getDb();
    const finalJob = await db.get(`SELECT * FROM penerimaan_export_jobs WHERE job_uuid = $1`, [job.job_uuid]);
    assert.equal(finalJob.status, 'completed');
    assert.equal(Number(finalJob.attempt_count), 1, 'Attempt count must be exactly 1 for single winner');

    // Verify only ONE artifact file exists on disk
    const createdFiles = await fs.promises.readdir(tmpExportDir);
    assert.equal(createdFiles.length, 1, 'Exactly one artifact file must exist on disk');
  } finally {
    if (originalExportDir !== undefined) {
      process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    } else {
      delete process.env.PENERIMAAN_EXPORT_DIR;
    }
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 3 - Task 2: processor rejects already processing, completed, or failed jobs without generating', async () => {
  const { processPenerimaanExportJob } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const db = await getDb();

  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  const tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-states-test-'));
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  try {
    // 1. Processing job -> rejected with 409
    const procJobUuid = crypto.randomUUID();
    await db.run(
      `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, processing_started_at, attempt_count)
       VALUES ($1, 'penerimaan_report', 'pdf', 'processing', 250, $2, $2, 1)`,
      [procJobUuid, new Date().toISOString()]
    );

    await assert.rejects(
      async () => {
        await processPenerimaanExportJob(procJobUuid);
      },
      (err) => err.status === 409,
      'Already processing job must be rejected with 409'
    );

    // 2. Failed job -> rejected with 409
    const failJobUuid = crypto.randomUUID();
    await db.run(
      `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, error_message, created_by_id, created_at)
       VALUES ($1, 'penerimaan_report', 'pdf', 'failed', 'Previous failure', 250, $2)`,
      [failJobUuid, new Date().toISOString()]
    );

    await assert.rejects(
      async () => {
        await processPenerimaanExportJob(failJobUuid);
      },
      (err) => err.status === 409,
      'Failed job must be rejected with 409'
    );

    // Verify no files were created in export dir
    const files = await fs.promises.readdir(tmpExportDir);
    assert.equal(files.length, 0, 'No files should be generated for rejected states');
  } finally {
    if (originalExportDir !== undefined) {
      process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    } else {
      delete process.env.PENERIMAAN_EXPORT_DIR;
    }
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 3 - Task 2: stale worker completion rejection and artifact cleanup on completion failure', async () => {
  const { processPenerimaanExportJob } = await import('./penerimaan-export-jobs.js');
  const path = await import('node:path');
  const os = await import('node:os');
  const fs = await import('node:fs');
  const db = await getDb();

  const originalExportDir = process.env.PENERIMAAN_EXPORT_DIR;
  const tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-stale-test-'));
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  try {
    const job = await createPenerimaanExportJob({
      jobType: 'penerimaan_report',
      format: 'xlsx',
      filters: { period: '7d' },
      actor: { id: 250, name: 'User 250' },
    });

    // Directly test completePenerimaanExportJob with stale expectedProcessingStartedAt
    await markPenerimaanExportJobProcessing(job.job_uuid, { id: 250 });
    const staleStartedAt = new Date(Date.now() - 999999).toISOString();

    await assert.rejects(
      async () => {
        await completePenerimaanExportJob(job.job_uuid, {
          fileName: 'test.xlsx',
          fileSize: 100,
          artifactPath: path.join(tmpExportDir, 'fake.xlsx'),
          expectedProcessingStartedAt: staleStartedAt,
        });
      },
      (err) => err.status === 409,
      'Stale worker completion must fail with 409 conflict'
    );

    // Test that when completion fails during processPenerimaanExportJob, target artifact is cleaned up
    const failJob = await createPenerimaanExportJob({
      jobType: 'penerimaan_report',
      format: 'pdf',
      filters: { period: '7d' },
      actor: { id: 250, name: 'User 250' },
    });

    const mockRepo = {
      getPenerimaanExportJob,
      markPenerimaanExportJobProcessing,
      completePenerimaanExportJob: async () => {
        const err = new Error('Simulated database crash on completion');
        err.status = 500;
        throw err;
      },
      failPenerimaanExportJob,
      getPenerimaanReportSummary,
      getPenerimaanReportTransactions,
    };

    await assert.rejects(
      async () => {
        await processPenerimaanExportJob(failJob.job_uuid, { repository: mockRepo });
      },
      /Simulated database crash/
    );

    // Verify temp and target files were cleaned up from disk
    const remainingFiles = await fs.promises.readdir(tmpExportDir);
    assert.equal(remainingFiles.length, 0, 'Orphaned files must be removed on completion failure');
  } finally {
    if (originalExportDir !== undefined) {
      process.env.PENERIMAAN_EXPORT_DIR = originalExportDir;
    } else {
      delete process.env.PENERIMAAN_EXPORT_DIR;
    }
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
  }
});

test('Round 3 - Task 2: restart recovery reclaims stale processing jobs and resumes queued jobs', async () => {
  const { resumePendingPenerimaanExportJobs } = await import('./penerimaan-export-jobs.js');
  const db = await getDb();

  const now = Date.now();
  const staleDate = new Date(now - 3600000).toISOString(); // 1 hour ago
  const freshDate = new Date(now - 5000).toISOString(); // 5 seconds ago

  // 1. Queued job
  const qJobUuid = crypto.randomUUID();
  await db.run(
    `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, attempt_count)
     VALUES ($1, 'penerimaan_report', 'pdf', 'queued', 250, $2, 0)`,
    [qJobUuid, staleDate]
  );

  // 2. Stale processing job (attempt 1 -> can reclaim)
  const staleJobUuid = crypto.randomUUID();
  await db.run(
    `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, processing_started_at, attempt_count)
     VALUES ($1, 'penerimaan_report', 'pdf', 'processing', 250, $2, $2, 1)`,
    [staleJobUuid, staleDate]
  );

  // 3. Exhausted processing job (attempt 3 -> should fail)
  const exhaustJobUuid = crypto.randomUUID();
  await db.run(
    `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, processing_started_at, attempt_count)
     VALUES ($1, 'penerimaan_report', 'pdf', 'processing', 250, $2, $2, 3)`,
    [exhaustJobUuid, staleDate]
  );

  // 4. Fresh processing job (active lease -> skip)
  const freshJobUuid = crypto.randomUUID();
  await db.run(
    `INSERT INTO penerimaan_export_jobs (job_uuid, job_type, format, status, created_by_id, created_at, processing_started_at, attempt_count)
     VALUES ($1, 'penerimaan_report', 'pdf', 'processing', 250, $2, $2, 1)`,
    [freshJobUuid, freshDate]
  );

  // Run recovery with lease timeout 5 minutes, max attempts 3
  const recoveryResult = await resumePendingPenerimaanExportJobs({
    leaseTimeoutMs: 5 * 60 * 1000,
    maxAttempts: 3,
  });

  assert.ok(recoveryResult.resumed >= 2, 'At least 2 jobs (queued + stale) should be resumed');
  assert.ok(recoveryResult.failed >= 1, 'Exhausted job should be marked failed');
  assert.ok(recoveryResult.skipped >= 1, 'Fresh active lease job should be skipped');

  const exhaustRec = await db.get(`SELECT * FROM penerimaan_export_jobs WHERE job_uuid = $1`, [exhaustJobUuid]);
  assert.equal(exhaustRec.status, 'failed', 'Exhausted job must be marked failed');
  assert.ok(exhaustRec.error_message.includes('Batas percobaan'), 'Safe error message on exhausted job');

  const freshRec = await db.get(`SELECT * FROM penerimaan_export_jobs WHERE job_uuid = $1`, [freshJobUuid]);
  assert.equal(freshRec.status, 'processing', 'Fresh lease job must remain in processing');
});

test('Round 3 - Task 2: GET /api/penerimaan/laporan/export without :id returns 410 Gone', async () => {
  const staffToken = tokenFor({ id: 250, role: 'penerimaan', name: 'User 250' });
  const res = await request('/api/penerimaan/laporan/export?format=pdf', {
    token: staffToken,
  });

  assert.equal(res.status, 410, 'Direct synchronous export endpoint must return 410 Gone');
  const body = await res.json();
  assert.equal(body.code, 'EXPORT_ENDPOINT_DEPRECATED');
  assert.ok(body.message.includes('POST /api/penerimaan/laporan/generate') || body.message.includes('POST /api/penerimaan/laporan/export'));
});

test('Round 3 - Task 3: exactness regression using odd value 9007199254740995 for approval_threshold', async () => {
  const oddValue = '9007199254740995'; // 2^53 + 3, odd integer above MAX_SAFE_INTEGER
  const oneLess = '9007199254740994';
  const oneMore = '9007199254740996';

  // 1. Update settings with odd threshold as exact string
  await updatePenerimaanSettings({
    approval_threshold: oddValue,
    auto_reconcile_tolerance: '5000',
  }, { name: 'Admin Tester' });

  // 2. Assert getPenerimaanSettings & getPenerimaanOperationalPolicy return exact string
  const settings = await getPenerimaanSettings();
  assert.equal(settings.approval_threshold, oddValue, 'Settings approval_threshold must be exact string');
  assert.equal(typeof settings.approval_threshold, 'string');
  assert.equal(settings.auto_reconcile_tolerance, '5000');
  assert.equal(typeof settings.auto_reconcile_tolerance, 'string');

  const policy = await getPenerimaanOperationalPolicy();
  assert.equal(policy.approval_threshold, oddValue, 'Policy approval_threshold must be exact string without Number() float loss');
  assert.equal(typeof policy.approval_threshold, 'string');
  assert.equal(policy.auto_reconcile_tolerance, '5000');
  assert.equal(typeof policy.auto_reconcile_tolerance, 'string');

  // 3. Exact threshold boundary evaluation:
  // Transaction equal to threshold requires approval
  const equalTx = { amount: oddValue, is_manual: false };
  assert.equal(requiresLeaderApproval(equalTx, policy), true, 'Transaction equal to threshold requires approval');

  // Transaction one less does NOT require approval
  const lessTx = { amount: oneLess, is_manual: false };
  assert.equal(requiresLeaderApproval(lessTx, policy), false, 'Transaction one less than threshold does not require approval');

  // Transaction one more requires approval
  const moreTx = { amount: oneMore, is_manual: false };
  assert.equal(requiresLeaderApproval(moreTx, policy), true, 'Transaction one more than threshold requires approval');

  // 4. Boundary tests at, below, and above Number.MAX_SAFE_INTEGER
  const maxSafeStr = String(Number.MAX_SAFE_INTEGER); // '9007199254740991'
  const maxSafeMinusOne = '9007199254740990';
  const maxSafePlusOne = '9007199254740992';

  await updatePenerimaanSettings({ approval_threshold: maxSafeStr }, { name: 'Admin Tester' });
  const maxSafePolicy = await getPenerimaanOperationalPolicy();
  assert.equal(maxSafePolicy.approval_threshold, maxSafeStr);

  assert.equal(requiresLeaderApproval({ amount: maxSafeStr, is_manual: false }, maxSafePolicy), true);
  assert.equal(requiresLeaderApproval({ amount: maxSafeMinusOne, is_manual: false }, maxSafePolicy), false);
  assert.equal(requiresLeaderApproval({ amount: maxSafePlusOne, is_manual: false }, maxSafePolicy), true);

  // 5. Verify formatPenerimaanTransactionRow standardizes money fields to canonical strings
  const formattedRow = formatPenerimaanTransactionRow({
    id: 1001,
    amount: oddValue,
    fee_amount: '2500',
    net_amount: '9007199254740992',
    is_manual: 0,
    is_duplicate: 0,
    is_incomplete: 0,
    is_flagged: 0,
  });
  assert.equal(formattedRow.amount, oddValue);
  assert.equal(typeof formattedRow.amount, 'string');
  assert.equal(formattedRow.fee_amount, '2500');
  assert.equal(typeof formattedRow.fee_amount, 'string');
  assert.equal(formattedRow.net_amount, '9007199254740992');
  assert.equal(typeof formattedRow.net_amount, 'string');

  // Restore default settings
  await updatePenerimaanSettings({
    approval_threshold: '10000000',
    auto_reconcile_tolerance: '0',
  }, { name: 'Admin Tester' });
});

test('Round 3 - Task 4: report pagination honors caller limit and offset', async () => {
  // 1. Normal transactions summary with limit: 1
  const page1 = await getPenerimaanReportSummary({ limit: 1, offset: 0 });
  assert.equal(page1.preview_transactions.length, 1, 'Page 1 must return exactly 1 preview row');
  assert.ok(page1.kpis.total_count >= 2, 'Total count must reflect all rows, independent of page limit');

  const page2 = await getPenerimaanReportSummary({ limit: 1, offset: 1 });
  assert.equal(page2.preview_transactions.length, 1, 'Page 2 must return exactly 1 preview row');
  assert.notEqual(
    page1.preview_transactions[0].id,
    page2.preview_transactions[0].id,
    'Page 1 and Page 2 must return different transaction records'
  );

  // 2. Audit view summary with limit: 1
  const auditPage1 = await getPenerimaanReportSummary({ view: 'audit', limit: 1, offset: 0 });
  if (auditPage1.preview_transactions.length > 0) {
    assert.equal(auditPage1.preview_transactions.length, 1, 'Audit page 1 must return exactly 1 row when limit: 1');
    if (auditPage1.kpis.total_count >= 2) {
      const auditPage2 = await getPenerimaanReportSummary({ view: 'audit', limit: 1, offset: 1 });
      assert.equal(auditPage2.preview_transactions.length, 1, 'Audit page 2 must return exactly 1 row');
      assert.notEqual(
        auditPage1.preview_transactions[0].id,
        auditPage2.preview_transactions[0].id,
        'Audit page 1 and page 2 must return different rows'
      );
    }
  }
});
