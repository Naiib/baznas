import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-8-mutation-test-secret';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  const db = await getDb();
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE '%TEST%' OR provider_ref LIKE 'TX-MUT-%' OR transaction_number LIKE 'TRX-REV-TEST-%' OR transaction_number LIKE 'TRX-DIGI-VAL-%'");
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

function tokenFor({ id = 10, role = 'penerimaan', division = 'Bidang Pengumpulan & ZIS', level = 'staff', name = 'Staff Penerimaan' } = {}) {
  return jwt.sign({ id, name, role, division, level }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('POST /api/penerimaan/transaksi/manual: creates manual transaction and validates constraints', async () => {
  const token = tokenFor({ id: 101, role: 'penerimaan', level: 'staff', name: 'Ahmad Staff' });

  // 1. Invalid amount (< 0 or non-integer)
  const badAmountRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'counter_kasir',
      fund_type: 'zakat_maal',
      amount: -5000,
      muzakki_name: 'Donatur Test',
    }),
    token,
  });
  assert.equal(badAmountRes.status, 400);

  // 2. Successful creation
  const res = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'counter_kasir',
      fund_type: 'zakat_maal',
      amount: 2500000,
      muzakki_name: 'Budi Santoso',
      muzakki_phone: '081234567890',
      payment_method: 'cash',
      provider_ref: 'SLIP-TEST-001',
      notes: 'Zakat penghasilan bulan September',
    }),
    token,
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data.id);
  assert.ok(body.data.transaction_number.startsWith('TRX-'));
  assert.ok(body.data.receipt_number.startsWith('BSZ-'));
  assert.equal(body.data.amount, '2500000');
  assert.equal(body.data.status, 'Menunggu Validasi');
  assert.equal(body.data.workflow_version, 0);

  // 3. Duplicate provider_ref rejection (409)
  const dupRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'counter_kasir',
      fund_type: 'zakat_maal',
      amount: 1000000,
      muzakki_name: 'Budi Santoso 2',
      provider_ref: 'SLIP-TEST-001',
    }),
    token,
  });
  assert.equal(dupRes.status, 409);
});

test('POST /api/penerimaan/transaksi/bukti: uploads valid evidence file and returns URL', async () => {
  const token = tokenFor({ id: 101, role: 'penerimaan' });

  // 1. Missing file -> 400
  const missingRes = await request('/api/penerimaan/transaksi/bukti', {
    method: 'POST',
    token,
  });
  assert.equal(missingRes.status, 400);

  // 2. Valid upload with FormData
  const formData = new FormData();
  const fileContent = Buffer.from('%PDF-1.4 dummy test pdf content');
  const blob = new Blob([fileContent], { type: 'application/pdf' });
  formData.append('file', blob, 'bukti_setor_test.pdf');

  const res = await request('/api/penerimaan/transaksi/bukti', {
    method: 'POST',
    body: formData,
    token,
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data.file_url);
  assert.ok(body.data.file_url.startsWith('/uploads/'));
  assert.equal(body.data.file_name, 'bukti_setor_test.pdf');
});

test('Workflow mutations: validate, escalation, approve, self-approval guard, and optimistic concurrency', async () => {
  const staffToken = tokenFor({ id: 201, role: 'penerimaan', level: 'staff', name: 'Staf Penerimaan 1' });
  const leaderToken = tokenFor({ id: 202, role: 'penerimaan', level: 'leader', name: 'Kepala Bagian Penerimaan' });

  // A. Digital transaction (< 10M, is_manual = 0): validates directly to 'Menunggu Rekonsiliasi'
  const db = await getDb();
  await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, receipt_number, channel, channel_category, provider_name,
      muzakki_name, fund_type, amount, fee_amount, net_amount, status,
      is_manual, is_flagged, workflow_version, created_at, updated_at
    ) VALUES (
      'TRX-DIGI-VAL-001', 'BSZ-2026-9001', 'bank_transfer', 'digital', 'BSI',
      'Donatur Digital', 'infak', 1500000, 0, 1500000, 'Menunggu Validasi',
      0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
  const digiTx = await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-DIGI-VAL-001'");

  // Stale version conflict (expected_version: 999 vs current: 0) -> 409
  const conflictRes = await request(`/api/penerimaan/transaksi/${digiTx.id}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Validasi staf', expected_version: 999 }),
    token: staffToken,
  });
  assert.equal(conflictRes.status, 409);

  // Valid validate digital transaction -> transitions to Menunggu Rekonsiliasi
  const digiValRes = await request(`/api/penerimaan/transaksi/${digiTx.id}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Validasi staf sukses', expected_version: 0 }),
    token: staffToken,
  });
  assert.equal(digiValRes.status, 200);
  const digiValData = (await digiValRes.json()).data;
  assert.equal(digiValData.status, 'Menunggu Rekonsiliasi');
  assert.equal(digiValData.workflow_version, 1);

  // B. Manual transaction created by leader (is_manual = 1): validates and escalates to 'Menunggu Approval'
  const txHighRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'counter_kasir',
      fund_type: 'zakat_maal',
      amount: 25000000,
      muzakki_name: 'Donatur Korporat',
      provider_ref: 'TX-MUT-HIGH-001',
    }),
    token: leaderToken,
  });
  assert.equal(txHighRes.status, 201);
  const txHigh = (await txHighRes.json()).data;

  // Validate manual transaction -> escalates to 'Menunggu Approval'
  const valHighRes = await request(`/api/penerimaan/transaksi/${txHigh.id}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Validasi berkas lengkap' }),
    token: staffToken,
  });
  assert.equal(valHighRes.status, 200);
  const valHighData = (await valHighRes.json()).data;
  assert.equal(valHighData.status, 'Menunggu Approval');

  // Self-approval guard: leader created txHigh, so leader cannot approve it!
  const selfApproveRes = await request(`/api/penerimaan/transaksi/${txHigh.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Persetujuan mandiri' }),
    token: leaderToken, // user ID 202 is the creator
  });
  assert.equal(selfApproveRes.status, 403);

  // Another leader approves it
  const otherLeaderToken = tokenFor({ id: 203, role: 'penerimaan', level: 'leader', name: 'Wakil Kepala Bagian' });
  const approveRes = await request(`/api/penerimaan/transaksi/${txHigh.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Persetujuan disahkan' }),
    token: otherLeaderToken,
  });
  assert.equal(approveRes.status, 200);
  const approvedData = (await approveRes.json()).data;
  assert.equal(approvedData.status, 'Menunggu Rekonsiliasi');

  // Clean up
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number IN ('TRX-DIGI-VAL-001', 'TX-MUT-HIGH-001')");
});

test('Workflow mutations: reject, clarification cycle, and reversal permissions', async () => {
  const staffToken = tokenFor({ id: 301, role: 'penerimaan', level: 'staff', name: 'Staf 2' });
  const leaderToken = tokenFor({ id: 302, role: 'penerimaan', level: 'leader', name: 'Kabag 2' });

  // 1. Create transaction to test Clarification cycle
  const txRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'jemput_zakat',
      fund_type: 'infak',
      amount: 1500000,
      muzakki_name: 'Muzakki Clarify',
      provider_ref: 'TX-MUT-CLAR-001',
    }),
    token: staffToken,
  });
  const tx = (await txRes.json()).data;

  // Request Clarification -> Perlu Klarifikasi
  const reqClarRes = await request(`/api/penerimaan/transaksi/${tx.id}/request-clarification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Nomor telepon tidak aktif' }),
    token: staffToken,
  });
  assert.equal(reqClarRes.status, 200);
  const clarData = (await reqClarRes.json()).data;
  assert.equal(clarData.status, 'Perlu Klarifikasi');

  // Resolve Clarification -> Menunggu Validasi
  const resClarRes = await request(`/api/penerimaan/transaksi/${tx.id}/resolve-clarification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Nomor telepon telah diperbarui ke 08111111' }),
    token: staffToken,
  });
  assert.equal(resClarRes.status, 200);
  const resolvedData = (await resClarRes.json()).data;
  assert.equal(resolvedData.status, 'Menunggu Validasi');

  // 2. Reject transaction -> Ditolak
  const rejectRes = await request(`/api/penerimaan/transaksi/${tx.id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Dana fiktif setelah diverifikasi' }),
    token: staffToken,
  });
  assert.equal(rejectRes.status, 200);
  const rejectedData = (await rejectRes.json()).data;
  assert.equal(rejectedData.status, 'Ditolak');

  // 3. Reversal tests
  const db = await getDb();
  // Insert a Posted transaction
  await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'Posted', CURRENT_TIMESTAMP)
  `, ['TRX-REV-TEST-1', 'bank_transfer', 'digital', 'Muzakki Reversal', 'zakat_maal', 3000000, 3000000]);
  const postedTx = await db.get("SELECT id, workflow_version FROM penerimaan_transactions WHERE transaction_number = 'TRX-REV-TEST-1'");

  // Staff attempts reversal -> 403 Forbidden
  const staffRevRes = await request(`/api/penerimaan/transaksi/${postedTx.id}/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Salah input rekening' }),
    token: staffToken,
  });
  assert.equal(staffRevRes.status, 403);

  // Leader performs reversal -> Success (status = Dibatalkan)
  const leaderRevRes = await request(`/api/penerimaan/transaksi/${postedTx.id}/reverse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Koreksi pembukuan resmi', expected_version: postedTx.workflow_version }),
    token: leaderToken,
  });
  assert.equal(leaderRevRes.status, 200);
  const reversedData = (await leaderRevRes.json()).data;
  assert.equal(reversedData.status, 'Dibatalkan');

  // Clean up
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number IN ('TRX-REV-TEST-1', 'TRX-MUT-CLAR-001')");
});
