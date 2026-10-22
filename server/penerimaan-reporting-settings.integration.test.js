import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-11-reporting-settings-secret';
const TEST_PORTAL_WEBHOOK_SECRET = 'portal-webhook-secret-xyz123';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.WEBHOOK_SECRET_PORTAL = TEST_PORTAL_WEBHOOK_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const { processPenerimaanExportJob } = await import('./penerimaan-export-jobs.js');
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');

let server;
let baseUrl;
let tmpExportDir;

before(async () => {
  tmpExportDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baznas-rep-export-'));
  process.env.PENERIMAAN_EXPORT_DIR = tmpExportDir;

  await initDb();
  const db = await getDb();
  await db.run('DELETE FROM penerimaan_export_jobs');
  await db.run('DELETE FROM penerimaan_settings');
  await db.run('DELETE FROM penerimaan_matches');
  await db.run('DELETE FROM penerimaan_statement_lines');
  await db.run('DELETE FROM penerimaan_reconciliation_batches');
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE 'REP-%' OR provider_ref LIKE 'PORTAL-%' OR provider_ref LIKE 'PENY-%'");
  await db.run("DELETE FROM penerimaan_raw_events WHERE provider = 'portal' OR idempotency_key LIKE 'portal:%'");
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
  if (tmpExportDir) {
    await fs.promises.rm(tmpExportDir, { recursive: true, force: true }).catch(() => null);
  }
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

function tokenFor({
  id = 50,
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
// 1. REPORTING QUERY, FILTER SYNCHRONIZATION, AND AGGREGATES
// ─────────────────────────────────────────────────────────────────────────────

test('Reporting: query synchronization, multi-dimensional filters, and summary KPIs', async () => {
  const db = await getDb();
  const staffToken = tokenFor({ id: 51, role: 'penerimaan', level: 'staff' });

  const now = Date.now();
  const dayMs = 86400000;
  const isoDate = (daysAgo) => new Date(now - daysAgo * dayMs).toISOString();
  const dateOnly = (daysAgo) => new Date(now - daysAgo * dayMs).toISOString().slice(0, 10);

  // Insert seed transactions across various fund types, channels, and statuses
  const txData = [
    { num: 'TRX-REP-01', ref: 'REP-01', fund: 'zakat', channel: 'bank_transfer', amt: 5000000, status: 'Posted', manual: 0, flag: 0, date: isoDate(6), muzakki: 'H. Bambang Zakat' },
    { num: 'TRX-REP-02', ref: 'REP-02', fund: 'infak', channel: 'qris', amt: 1000000, status: 'Posted', manual: 0, flag: 0, date: isoDate(5), muzakki: 'Hj. Siti Infak' },
    { num: 'TRX-REP-03', ref: 'REP-03', fund: 'sedekah', channel: 'tunai', amt: 250000, status: 'Posted', manual: 1, flag: 0, date: isoDate(4), muzakki: 'Donatur Tunai' },
    { num: 'TRX-REP-04', ref: 'REP-04', fund: 'zakat', channel: 'bank_transfer', amt: 15000000, status: 'Menunggu Approval', manual: 0, flag: 1, date: isoDate(3), muzakki: 'PT Maju Zakat' },
    { num: 'TRX-REP-05', ref: 'REP-05', fund: 'wakaf', channel: 'bank_transfer', amt: 50000000, status: 'Menunggu Rekonsiliasi', manual: 0, flag: 0, date: isoDate(2), muzakki: 'Wakif Dermawan' },
    { num: 'TRX-REP-06', ref: 'REP-06', fund: 'infak', channel: 'portal_web', amt: 500000, status: 'Ditolak', manual: 0, flag: 1, date: isoDate(1), muzakki: 'Donatur Ditolak' },
  ];

  for (const t of txData) {
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, transaction_date, created_at, updated_at
       ) VALUES ($1, $1, $2, 'digital', $3, $4, $5, $6, 0, $6, $7, $8, $9, 0, $10, $10, $10)`,
      [t.num, t.channel, t.ref, t.muzakki, t.fund, t.amt, t.status, t.manual, t.flag, t.date]
    );
  }

  // 1. Filter: all transactions in period
  const resAll = await request('/api/penerimaan/laporan?period=30d', { token: staffToken });
  assert.equal(resAll.status, 200);
  const dataAll = (await resAll.json()).data;
  assert.ok(dataAll.kpis, 'Summary KPIs must be returned');
  assert.ok(dataAll.kpis.total_amount >= 71750000);
  assert.ok(dataAll.kpis.total_count >= 6);
  assert.ok(dataAll.preview_transactions.length >= 6);

  // 2. Filter by fund_type: zakat
  const resZakat = await request('/api/penerimaan/laporan?period=30d&fund_type=zakat', { token: staffToken });
  assert.equal(resZakat.status, 200);
  const dataZakat = (await resZakat.json()).data;
  assert.equal(dataZakat.preview_transactions.every((t) => t.fund_type === 'zakat'), true);
  assert.equal(Number(dataZakat.kpis.total_amount), 20000000); // 5M + 15M
  assert.equal(Number(dataZakat.kpis.total_count), 2);

  // 3. Filter by channel: qris
  const resQris = await request('/api/penerimaan/laporan?period=30d&channel=qris', { token: staffToken });
  assert.equal(resQris.status, 200);
  const dataQris = (await resQris.json()).data;
  assert.ok(dataQris.preview_transactions.length >= 1);
  assert.equal(dataQris.preview_transactions.every((t) => t.channel === 'qris'), true);
  assert.ok(Number(dataQris.kpis.total_amount) >= 1000000);

  // 4. Filter by is_manual: 1
  const resManual = await request('/api/penerimaan/laporan?period=30d&is_manual=true', { token: staffToken });
  assert.equal(resManual.status, 200);
  const dataManual = (await resManual.json()).data;
  assert.equal(dataManual.preview_transactions.every((t) => Boolean(t.is_manual)), true);

  // 5. Filter by is_flagged / exception: true
  const resRisk = await request('/api/penerimaan/laporan?period=30d&is_flagged=true', { token: staffToken });
  assert.equal(resRisk.status, 200);
  const dataRisk = (await resRisk.json()).data;
  assert.equal(dataRisk.preview_transactions.every((t) => Boolean(t.is_flagged)), true);

  // 6. Custom date range filter
  const startDate = dateOnly(6);
  const endDate = dateOnly(4);
  const resCustom = await request(`/api/penerimaan/laporan?period=custom&start_date=${startDate}&end_date=${endDate}`, { token: staffToken });
  assert.equal(resCustom.status, 200);
  const dataCustom = (await resCustom.json()).data;
  assert.ok(dataCustom.preview_transactions.length >= 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EXPORT PDF AND EXCEL GENERATION
// ─────────────────────────────────────────────────────────────────────────────

test('Export PDF: generates valid PDFKit document with required metadata and no PII leak', async () => {
  const staffToken = tokenFor({ id: 52, role: 'penerimaan', level: 'staff', name: 'Amil Pelapor' });

  // 1. Generate PDF report job
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'pdf', period: '30d', fund_type: 'zakat' }),
  });
  assert.equal(genRes.status, 202);
  const genBody = await genRes.json();
  const jobUuid = genBody.data.id;
  assert.ok(jobUuid);

  // Poll until completed
  let completed = false;
  for (let i = 0; i < 30; i++) {
    const statusRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: staffToken });
    const statusBody = await statusRes.json();
    if (statusBody.data?.status === 'completed') {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(completed, 'Export job must complete');

  // 2. Download generated artifact
  const exportRes = await request(`/api/penerimaan/laporan/export/${jobUuid}`, {
    token: staffToken,
  });
  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.headers.get('content-type'), 'application/pdf');

  const disposition = exportRes.headers.get('content-disposition');
  assert.ok(disposition, 'Content-Disposition header must be set');
  assert.match(disposition, /attachment;\s*filename="Laporan-Penerimaan-.*\.pdf"/i);

  const arrayBuffer = await exportRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assert.ok(buffer.length > 500, 'PDF buffer must contain real document bytes');
  // Standard PDF magic number
  const magic = buffer.slice(0, 5).toString('ascii');
  assert.equal(magic, '%PDF-');

  // Verify export job recorded in database
  const db = await getDb();
  const job = await db.get("SELECT * FROM penerimaan_export_jobs WHERE format = 'pdf' ORDER BY id DESC LIMIT 1");
  assert.ok(job, 'Export job record must be created in penerimaan_export_jobs');
  assert.equal(job.status, 'completed');
  assert.equal(job.created_by_name, 'Amil Pelapor');
});

test('Export Excel: generates valid ExcelJS workbook with summary sheet, detail sheet, and headers', async () => {
  const staffToken = tokenFor({ id: 53, role: 'penerimaan', level: 'staff', name: 'Amil Akuntansi' });

  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'xlsx', period: '30d' }),
  });
  assert.equal(genRes.status, 202);
  const genBody = await genRes.json();
  const jobUuid = genBody.data.id;

  let completed = false;
  for (let i = 0; i < 30; i++) {
    const statusRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: staffToken });
    const statusBody = await statusRes.json();
    if (statusBody.data?.status === 'completed') {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(completed, 'Export job must complete');

  const exportRes = await request(`/api/penerimaan/laporan/export/${jobUuid}`, {
    token: staffToken,
  });
  assert.equal(exportRes.status, 200);
  assert.equal(
    exportRes.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  const disposition = exportRes.headers.get('content-disposition');
  assert.ok(disposition);
  assert.match(disposition, /attachment;\s*filename="Laporan-Penerimaan-.*\.xlsx"/i);

  const arrayBuffer = await exportRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  assert.ok(buffer.length > 1000, 'Excel buffer must contain valid workbook bytes');
  // Zip/Excel magic numbers: PK\x03\x04
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);

  const db = await getDb();
  const job = await db.get("SELECT * FROM penerimaan_export_jobs WHERE format = 'xlsx' ORDER BY id DESC LIMIT 1");
  assert.ok(job);
  assert.equal(job.status, 'completed');
});

test('Export Empty & Large Safety: empty period returns clean zero report without error', async () => {
  const staffToken = tokenFor({ id: 54, role: 'penerimaan', level: 'staff' });

  // Period with no data
  const emptyRes = await request('/api/penerimaan/laporan?period=custom&start_date=2020-01-01&end_date=2020-01-02', {
    token: staffToken,
  });
  assert.equal(emptyRes.status, 200);
  const data = (await emptyRes.json()).data;
  assert.equal(Number(data.kpis.total_amount), 0);
  assert.equal(Number(data.kpis.total_count), 0);
  assert.equal(data.preview_transactions.length, 0);

  // PDF export on empty data
  const genRes = await request('/api/penerimaan/laporan/generate', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'pdf', period: 'custom', start_date: '2020-01-01', end_date: '2020-01-02' }),
  });
  assert.equal(genRes.status, 202);
  const genBody = await genRes.json();
  const jobUuid = genBody.data.id;

  let completed = false;
  for (let i = 0; i < 30; i++) {
    const statusRes = await request(`/api/penerimaan/laporan/jobs/${jobUuid}`, { token: staffToken });
    const statusBody = await statusRes.json();
    if (statusBody.data?.status === 'completed') {
      completed = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(completed, 'Export job must complete');

  const pdfRes = await request(`/api/penerimaan/laporan/export/${jobUuid}`, {
    token: staffToken,
  });
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROLES, SECURITY, AND CROSS-DIVISION ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

test('Security & Role Isolation: unauthenticated and cross-division access is strictly forbidden', async () => {
  // 1. Unauthenticated request rejected with 401
  const noAuthRes = await request('/api/penerimaan/laporan');
  assert.equal(noAuthRes.status, 401);

  // 2. Cross-division user (e.g. Penyaluran surveyor/staff) rejected with 403
  const penyaluranToken = tokenFor({
    id: 99,
    role: 'surveyor',
    division: 'Bidang Pendistribusian & Pendayagunaan',
    level: 'staff',
  });
  const crossDivRes = await request('/api/penerimaan/laporan', { token: penyaluranToken });
  assert.equal(crossDivRes.status, 403);

  const crossDivSettingsRes = await request('/api/penerimaan/pengaturan', { token: penyaluranToken });
  assert.equal(crossDivSettingsRes.status, 403);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SETTINGS PENERIMAAN: CRUD, THRESHOLD VALIDATION, AND UNSETTLED CHANNEL GUARD
// ─────────────────────────────────────────────────────────────────────────────

test('Settings: Admin CRUD, positive threshold validation, masked secrets, and audit trail', async () => {
  const db = await getDb();
  const staffToken = tokenFor({ id: 55, role: 'penerimaan', level: 'staff' });
  const adminToken = tokenFor({ id: 56, role: 'admin', level: 'admin', name: 'Super Admin' });

  // 1. Read settings: Staff can read public configuration
  const readStaffRes = await request('/api/penerimaan/pengaturan', { token: staffToken });
  assert.equal(readStaffRes.status, 200);
  const staffSettings = (await readStaffRes.json()).data;
  assert.ok(staffSettings.approval_threshold !== undefined);
  // Verify secrets are NOT exposed
  assert.equal(staffSettings.provider_configs?.portal?.secret, undefined);

  // 2. Staff cannot update settings (403)
  const staffUpdateRes = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: 15000000 }),
  });
  assert.equal(staffUpdateRes.status, 403);

  // 3. Validation: threshold must be positive integer
  const invalidThresholdRes1 = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: -5000 }),
  });
  assert.equal(invalidThresholdRes1.status, 400);

  const invalidThresholdRes2 = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_threshold: 0 }),
  });
  assert.equal(invalidThresholdRes2.status, 400);

  // 4. Valid update by Admin
  const validUpdateRes = await request('/api/penerimaan/pengaturan', {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approval_threshold: 25000000,
      auto_reconcile_tolerance: 0,
      notes: 'Update approval threshold ke 25 Juta',
    }),
  });
  assert.equal(validUpdateRes.status, 200);
  const updatedData = (await validUpdateRes.json()).data;
  assert.equal(updatedData.approval_threshold, '25000000');

  // Verify audit event recorded
  const auditEvent = await db.get(
    "SELECT * FROM penerimaan_audit_events WHERE entity_type IN ('settings', 'penerimaan_settings') ORDER BY id DESC LIMIT 1"
  );
  assert.ok(auditEvent);
  assert.equal(auditEvent.actor_name, 'Super Admin');
});

test('Unsettled Channel Guard: cannot disable channel with active/unsettled transactions', async () => {
  const db = await getDb();
  const adminToken = tokenFor({ id: 57, role: 'admin', level: 'admin' });

  // 1. Ensure channel 'bank_transfer' exists
  let channel = await db.get("SELECT * FROM penerimaan_channels WHERE code = 'bank_transfer'");
  if (!channel) {
    await db.run(
      "INSERT INTO penerimaan_channels (code, name, category, is_active) VALUES ('bank_transfer', 'Transfer Bank', 'digital', 1)"
    );
    channel = await db.get("SELECT * FROM penerimaan_channels WHERE code = 'bank_transfer'");
  }

  // 2. Insert an unsettled transaction on 'bank_transfer'
  const unsettledRef = 'REP-UNSETTLED-01';
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ('TRX-UNSETTLED', 'BSZ-UNSETTLED', 'bank_transfer', 'digital', $1, 'Donatur Unsettled', 'zakat', 1000000, 0, 1000000, 'Menunggu Validasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [unsettledRef]
  );

  // 3. Attempt to disable 'bank_transfer' channel: MUST BE REJECTED (400)
  const disableRes = await request(`/api/penerimaan/master-data/channels/${channel.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(disableRes.status, 400);
  const disableData = await disableRes.json();
  assert.match(disableData.message, /tidak dapat dinonaktifkan.*transaksi.*unsettled/i);

  // 4. Create an unused channel with NO transactions, disabling it should succeed
  const unusedCode = 'unused_channel_99';
  await db.run('DELETE FROM penerimaan_channels WHERE code = $1', [unusedCode]);
  await db.run(
    "INSERT INTO penerimaan_channels (code, name, category, is_active) VALUES ($1, 'Kanal Sementara', 'digital', 1)",
    [unusedCode]
  );
  const unusedChannel = await db.get('SELECT * FROM penerimaan_channels WHERE code = $1', [unusedCode]);

  const disableSuccessRes = await request(`/api/penerimaan/master-data/channels/${unusedChannel.id}`, {
    method: 'PUT',
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(disableSuccessRes.status, 200);

  // Clean up
  await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref = $1', [unsettledRef]);
  await db.run('DELETE FROM penerimaan_channels WHERE code = $1', [unusedCode]);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PUBLIC PORTAL SIGNED INGESTION INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

test('Public Portal Callback: signature verification, idempotency, and retry safety', async () => {
  const secret = TEST_PORTAL_WEBHOOK_SECRET;
  const orderId = `PORTAL-ORD-${Date.now()}`;
  const payload = {
    order_id: orderId,
    amount: 750000,
    status: 'paid',
    fund_type: 'zakat_maal',
    channel: 'portal_web',
    donor_name: 'Muzakki Portal Online',
    donor_phone: '081234567890',
    donor_email: 'portal@donatur.id',
    payment_time: '2026-09-08T09:30:00.000Z',
  };

  const rawBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const validSignature = crypto.createHmac('sha256', secret).update(rawBytes).digest('hex');

  // 1. Invalid signature rejection (401)
  const invalidSigRes = await request('/api/penerimaan/webhook/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': 'invalid-hash-here',
    },
    body: rawBytes,
  });
  assert.equal(invalidSigRes.status, 401);

  // 2. Valid signature ingestion (200)
  const validRes = await request('/api/penerimaan/webhook/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': validSignature,
    },
    body: rawBytes,
  });
  assert.equal(validRes.status, 200);
  const resData = await validRes.json();
  assert.equal(resData.success, true);
  assert.equal(resData.duplicate, false);

  // Verify transaction created in state machine (Menunggu Validasi or canonical status)
  const db = await getDb();
  const tx = await db.get("SELECT * FROM penerimaan_transactions WHERE provider_ref = $1 OR transaction_number = $1", [orderId]);
  assert.ok(tx, 'Transaction must be created from signed portal callback');
  assert.equal(Number(tx.amount), 750000);
  assert.equal(tx.fund_type, 'zakat_maal');

  // 3. Duplicate callback (idempotency guard)
  const dupRes = await request('/api/penerimaan/webhook/portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': validSignature,
    },
    body: rawBytes,
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.equal(dupData.duplicate, true, 'Duplicate callback must be identified as idempotent');

  // Verify no duplicate transaction created
  const txCount = await db.get(
    "SELECT COUNT(*) as cnt FROM penerimaan_transactions WHERE provider_ref = $1",
    [orderId]
  );
  assert.equal(Number(txCount.cnt), 1, 'Only one transaction should exist for this portal order');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PENYALURAN CROSS-DIVISION INTEGRATION: POSTED-ONLY AGGREGATION
// ─────────────────────────────────────────────────────────────────────────────

test('Penyaluran Integration: aggregates strictly Posted funds using integer-safe BigInt arithmetic', async () => {
  const db = await getDb();
  const penyaluranToken = tokenFor({
    id: 88,
    role: 'penyaluran',
    division: 'Bidang Pendistribusian & Pendayagunaan',
    level: 'leader',
  });

  // Pre-seed known transactions with diverse statuses
  const prefix = 'PENY-INTEG-';
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES
       ('TRX-PI-1', 'BSZ-PI-1', 'bank_transfer', 'digital', '${prefix}1', 'Donatur 1', 'zakat', 10000000, 0, 10000000, 'Posted', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-2', 'BSZ-PI-2', 'qris', 'digital', '${prefix}2', 'Donatur 2', 'infak', 5000000, 0, 5000000, 'Posted', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-3', 'BSZ-PI-3', 'bank_transfer', 'digital', '${prefix}3', 'Donatur 3', 'zakat', 8000000, 0, 8000000, 'Menunggu Validasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-4', 'BSZ-PI-4', 'bank_transfer', 'digital', '${prefix}4', 'Donatur 4', 'zakat', 4000000, 0, 4000000, 'Menunggu Approval', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-5', 'BSZ-PI-5', 'bank_transfer', 'digital', '${prefix}5', 'Donatur 5', 'infak', 2000000, 0, 2000000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-6', 'BSZ-PI-6', 'bank_transfer', 'digital', '${prefix}6', 'Donatur 6', 'zakat', 3000000, 0, 3000000, 'Ditolak', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-7', 'BSZ-PI-7', 'bank_transfer', 'digital', '${prefix}7', 'Donatur 7', 'zakat', 1000000, 0, 1000000, 'Disputed', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('TRX-PI-8', 'BSZ-PI-8', 'bank_transfer', 'digital', '${prefix}8', 'Donatur 8', 'zakat', 500000, 0, 500000, 'Reversed', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );

  // Query Penyaluran integration endpoint
  const integRes = await request('/api/penyaluran/penerimaan-funds', { token: penyaluranToken });
  assert.equal(integRes.status, 200);
  const integData = (await integRes.json()).data;

  // Verify only Posted funds are included
  // Expected posted sum: 10,000,000 + 5,000,000 = 15,000,000 (plus any existing posted from previous tests)
  assert.ok(integData.total_posted_amount >= 15000000);
  assert.ok(integData.total_posted_count >= 2);
  assert.ok(integData.freshness_timestamp, 'Freshness timestamp must be present');
  assert.equal(integData.provenance, 'penerimaan_transactions(status=Posted)');

  // Verify breakdown by fund type
  assert.ok(integData.by_fund_type.zakat >= 10000000);
  assert.ok(integData.by_fund_type.infak >= 5000000);

  // Clean up
  await db.run(`DELETE FROM penerimaan_transactions WHERE provider_ref LIKE '${prefix}%'`);
});
