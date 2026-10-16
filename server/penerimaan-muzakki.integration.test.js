import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-9-muzakki-test-secret';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
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
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

function tokenFor({ id = 11, role = 'penerimaan', division = 'Bidang Pengumpulan & ZIS', level = 'staff', name = 'Staff Penerimaan' } = {}) {
  return jwt.sign({ id, name, role, division, level }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.body);
  }
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('Muzakki API: authentication and authorization guards', async () => {
  // 401 unauthenticated
  const unauthRes = await request('/api/penerimaan/muzakki');
  assert.equal(unauthRes.status, 401);

  // 403 unauthorized role
  const surveyorToken = tokenFor({ role: 'surveyor', division: 'Tim Survey', level: 'staff' });
  const forbiddenRes = await request('/api/penerimaan/muzakki', { token: surveyorToken });
  assert.equal(forbiddenRes.status, 403);
});

test('Muzakki API: CRUD, auto NPWZ generation, and immutable audit event', async () => {
  const staffToken = tokenFor({ id: 101, name: 'Ahmad Staff', role: 'penerimaan', level: 'staff' });

  // 1. Create individual muzakki
  const createRes = await request('/api/penerimaan/muzakki', {
    method: 'POST',
    token: staffToken,
    body: {
      name: 'H. Bambang Sudirman',
      type: 'individu',
      identity_type: 'ktp',
      identity_number: '3201123456780001',
      phone: '081234567890',
      email: 'bambang.sudirman@example.com',
      address: 'Jl. Merdeka No. 45',
      city: 'Kota Tangerang',
      notes: 'Donatur rutin infak bulanan',
    },
  });

  assert.equal(createRes.status, 201);
  const createdBody = await createRes.json();
  assert.equal(createdBody.success, true);
  const created = createdBody.data;
  assert.ok(created.id);
  assert.equal(created.name, 'H. Bambang Sudirman');
  assert.ok(created.npwz.startsWith('NPWZ-'));
  assert.equal(created.type, 'individu');

  // 2. Update muzakki
  const updateRes = await request(`/api/penerimaan/muzakki/${created.id}`, {
    method: 'PUT',
    token: staffToken,
    body: {
      name: 'H. Bambang Sudirman, M.M.',
      notes: 'Diperbarui: Donatur prioritas Zakat Maal',
    },
  });

  assert.equal(updateRes.status, 200);
  const updatedBody = await updateRes.json();
  assert.equal(updatedBody.success, true);
  assert.equal(updatedBody.data.name, 'H. Bambang Sudirman, M.M.');

  // 3. Verify audit trail recorded create and update actions
  const auditRes = await request(`/api/penerimaan/audit?entity_type=muzakki&entity_id=${created.id}`, {
    token: staffToken,
  });
  assert.equal(auditRes.status, 200);
  const auditBody = await auditRes.json();
  assert.equal(auditBody.success, true);
  assert.ok(auditBody.data.items.length >= 2);

  const updateAudit = auditBody.data.items.find((item) => item.action === 'update');
  assert.ok(updateAudit);
  assert.equal(updateAudit.actor_name, 'Ahmad Staff');
  assert.equal(updateAudit.entity_id, String(created.id));
});

test('Muzakki API: anonymous donor privacy and role-aware PII masking', async () => {
  const staffToken = tokenFor({ id: 102, name: 'Siti Staff', role: 'penerimaan', level: 'staff' });
  const adminToken = tokenFor({ id: 999, name: 'Super Admin', role: 'admin', level: 'admin' });

  // Create an anonymous muzakki
  const anonRes = await request('/api/penerimaan/muzakki', {
    method: 'POST',
    token: staffToken,
    body: {
      name: 'Hamba Allah',
      type: 'anonim',
      phone: '081987654321',
      email: 'hambaallah@secret.id',
      identity_type: 'ktp',
      identity_number: '3171000000000001',
      address: 'Privat',
    },
  });

  assert.equal(anonRes.status, 201);
  const anonBody = await anonRes.json();
  const anonMuzakkiId = anonBody.data.id;

  // Query as Staff: PII MUST BE MASKED for anonymous donor
  const staffGetRes = await request(`/api/penerimaan/muzakki/${anonMuzakkiId}`, { token: staffToken });
  assert.equal(staffGetRes.status, 200);
  const staffGetData = (await staffGetRes.json()).data;
  assert.notEqual(staffGetData.phone, '081987654321');
  assert.ok(staffGetData.phone.includes('*'));
  assert.notEqual(staffGetData.email, 'hambaallah@secret.id');
  assert.ok(staffGetData.email.includes('*'));
  assert.equal(staffGetData.address, null); // address concealed for anonymous

  // Query as Admin: Admin has full authority to view unmasked PII
  const adminGetRes = await request(`/api/penerimaan/muzakki/${anonMuzakkiId}`, { token: adminToken });
  assert.equal(adminGetRes.status, 200);
  const adminGetData = (await adminGetRes.json()).data;
  assert.equal(adminGetData.phone, '081987654321');
  assert.equal(adminGetData.email, 'hambaallah@secret.id');
});

test('Muzakki API: contribution history, total, frequency, and preferred channel', async () => {
  const db = await getDb();
  const staffToken = tokenFor({ id: 103, name: 'Staff Analis', role: 'penerimaan', level: 'staff' });

  // Create muzakki
  const mRes = await request('/api/penerimaan/muzakki', {
    method: 'POST',
    token: staffToken,
    body: {
      name: 'PT Cahaya Bintang Berkah',
      type: 'lembaga',
      phone: '0215551234',
      email: 'finance@cahayabintang.co.id',
      city: 'Kota Tangerang',
    },
  });
  const muzakki = (await mRes.json()).data;

  // Insert 2 transactions for this muzakki
  const now = new Date().toISOString();
  const tx1 = `TRX-MZ1-${Date.now()}`;
  const kwt1 = `KWT-MZ1-${Date.now()}`;
  const tx2 = `TRX-MZ2-${Date.now()}`;
  const kwt2 = `KWT-MZ2-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
      transaction_number, receipt_number, channel, channel_category, amount, fee_amount, net_amount,
      status, muzakki_id, muzakki_name, fund_type, is_manual, is_duplicate, is_incomplete, is_flagged,
      created_at, updated_at
    ) VALUES
    ($1, $2, 'transfer_bank', 'bank_transfer', 5000000, 0, 5000000, 'Posted', $3, $4, 'zakat_maal', 0, 0, 0, 0, $5, $5)`,
    [tx1, kwt1, muzakki.id, muzakki.name, now]
  );
  await db.run(
    `INSERT INTO penerimaan_transactions (
      transaction_number, receipt_number, channel, channel_category, amount, fee_amount, net_amount,
      status, muzakki_id, muzakki_name, fund_type, is_manual, is_duplicate, is_incomplete, is_flagged,
      created_at, updated_at
    ) VALUES
    ($1, $2, 'transfer_bank', 'bank_transfer', 3000000, 0, 3000000, 'Posted', $3, $4, 'infak_terikat', 0, 0, 0, 0, $5, $5)`,
    [tx2, kwt2, muzakki.id, muzakki.name, now]
  );

  // Fetch muzakki detail
  const detailRes = await request(`/api/penerimaan/muzakki/${muzakki.id}`, { token: staffToken });
  assert.equal(detailRes.status, 200);
  const detail = (await detailRes.json()).data;

  assert.equal(detail.donation_summary.total_count, 2);
  assert.equal(detail.donation_summary.total_amount, '8000000');
  assert.equal(detail.donation_summary.avg_amount, '4000000');
  assert.equal(detail.preferred_channel, 'transfer_bank');
  assert.equal(detail.recent_transactions.length, 2);
  assert.equal(detail.recent_transactions[0].receipt_number, kwt1);
});

test('Muzakki API: duplicate detection and explicit merge operation with transaction reassignment and audit trail', async () => {
  const db = await getDb();
  const staffToken = tokenFor({ id: 104, name: 'Staff Otorisasi', role: 'penerimaan', level: 'staff' });

  const uniquePhone = `0877${Date.now().toString().slice(-8)}`;

  // Create primary record
  const pRes = await request('/api/penerimaan/muzakki', {
    method: 'POST',
    token: staffToken,
    body: {
      name: 'Drs. H. Hendra Wijaya',
      type: 'individu',
      phone: uniquePhone,
      email: 'hendra.wijaya@kantor.com',
      city: 'Kota Tangerang',
    },
  });
  const primaryMuzakki = (await pRes.json()).data;

  // Create duplicate record with identical phone
  const dRes = await request('/api/penerimaan/muzakki', {
    method: 'POST',
    token: staffToken,
    body: {
      name: 'Hendra Wijaya',
      type: 'individu',
      phone: uniquePhone,
      email: 'hendra_w@gmail.com',
      city: 'Kota Tangerang',
    },
  });
  const duplicateMuzakki = (await dRes.json()).data;

  // Attach a transaction to the duplicate muzakki
  const now = new Date().toISOString();
  const txNum = `TRX-DUP-${Date.now()}`;
  const rcpNum = `KWT-DUP-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
      transaction_number, receipt_number, channel, channel_category, amount, fee_amount, net_amount,
      status, muzakki_id, muzakki_name, fund_type, is_manual, is_duplicate, is_incomplete, is_flagged,
      created_at, updated_at
    ) VALUES ($1, $2, 'qris_dinamis', 'qris', 750000, 0, 750000, 'Posted', $3, $4, 'infak_umum', 0, 0, 0, 0, $5, $5)`,
    [txNum, rcpNum, duplicateMuzakki.id, duplicateMuzakki.name, now]
  );

  // 1. Verify duplicate suggestions detection
  const dupSuggestionsRes = await request('/api/penerimaan/muzakki/duplicates', { token: staffToken });
  assert.equal(dupSuggestionsRes.status, 200);
  const suggestions = (await dupSuggestionsRes.json()).data;
  const match = suggestions.find((s) => s.primary.id === primaryMuzakki.id || s.match_reason.includes(uniquePhone));
  assert.ok(match, 'Duplicate group should be detected by identical phone');

  // 2. Perform merge operation
  const mergeRes = await request('/api/penerimaan/muzakki/merge', {
    method: 'POST',
    token: staffToken,
    headers: { 'x-correlation-id': 'CR-MERGE-TEST-001' },
    body: {
      primary_id: primaryMuzakki.id,
      duplicate_ids: [duplicateMuzakki.id],
    },
  });

  assert.equal(mergeRes.status, 200);
  const mergeBody = await mergeRes.json();
  assert.equal(mergeBody.success, true);
  assert.equal(mergeBody.data.merged_id, primaryMuzakki.id);
  assert.equal(mergeBody.data.merged_count, 1);

  // 3. Verify duplicate record is removed and transaction is reassigned to primary
  const checkDupRes = await request(`/api/penerimaan/muzakki/${duplicateMuzakki.id}`, { token: staffToken });
  assert.equal(checkDupRes.status, 404);

  const checkPrimaryRes = await request(`/api/penerimaan/muzakki/${primaryMuzakki.id}`, { token: staffToken });
  assert.equal(checkPrimaryRes.status, 200);
  const updatedPrimary = (await checkPrimaryRes.json()).data;
  assert.ok(updatedPrimary.recent_transactions.some((tx) => tx.transaction_number === txNum));

  // 4. Verify immutable merge audit event recorded with correlation ID
  const auditRes = await request(`/api/penerimaan/audit?entity_type=muzakki&entity_id=${primaryMuzakki.id}`, {
    token: staffToken,
  });
  assert.equal(auditRes.status, 200);
  const auditItems = (await auditRes.json()).data.items;
  const mergeAudit = auditItems.find((a) => a.action === 'merge');
  assert.ok(mergeAudit, 'Merge action must be recorded in immutable audit log');
  assert.equal(mergeAudit.correlation_id, 'CR-MERGE-TEST-001');
});

test('Muzakki API: search, filter by type, and pagination', async () => {
  const staffToken = tokenFor({ id: 105, name: 'Staff Search', role: 'penerimaan', level: 'staff' });

  // Filter by type=lembaga
  const lembagaRes = await request('/api/penerimaan/muzakki?type=lembaga', { token: staffToken });
  assert.equal(lembagaRes.status, 200);
  const lembagaBody = await lembagaRes.json();
  assert.ok(lembagaBody.data.items.length >= 1);
  for (const item of lembagaBody.data.items) {
    assert.equal(item.type, 'lembaga');
  }

  // Filter by search query
  const searchRes = await request('/api/penerimaan/muzakki?search=Sudirman', { token: staffToken });
  assert.equal(searchRes.status, 200);
  const searchBody = await searchRes.json();
  assert.ok(searchBody.data.items.some((item) => item.name.includes('Sudirman')));
});

test('Accountable Decisions: self-approval rejection and audit immutability', async () => {
  const leaderToken = tokenFor({ id: 777, name: 'Pak Kabag', role: 'penerimaan', level: 'leader' });

  // 1. Create a transaction authored by this leader (amount > 10jt requires leader approval)
  const now = new Date().toISOString();
  const txNumber = `TRX-SELF-${Date.now()}`;
  const rcpNumber = `KWT-SELF-${Date.now()}`;

  const createRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    token: leaderToken,
    body: {
      transaction_number: txNumber,
      receipt_number: rcpNumber,
      channel: 'counter_kasir',
      channel_category: 'cash',
      amount: 15000000,
      fund_type: 'zakat_maal',
      muzakki_name: 'Donatur Besar',
    },
  });
  assert.equal(createRes.status, 201);
  const tx = (await createRes.json()).data;

  // Validate the transaction into 'Menunggu Approval'
  const valRes = await request(`/api/penerimaan/transaksi/${tx.id}/validate`, {
    method: 'POST',
    token: leaderToken,
    body: { expected_version: tx.workflow_version },
  });
  assert.equal(valRes.status, 200);
  const validatedTx = (await valRes.json()).data;
  assert.equal(validatedTx.status, 'Menunggu Approval');

  // Attempt self-approval by the creator (MUST BE REJECTED with 403)
  const selfApproveRes = await request(`/api/penerimaan/transaksi/${tx.id}/approve`, {
    method: 'POST',
    token: leaderToken,
    body: { expected_version: validatedTx.workflow_version },
  });
  assert.equal(selfApproveRes.status, 403);
  const selfApproveBody = await selfApproveRes.json();
  assert.equal(selfApproveBody.success, false);
  assert.ok(selfApproveBody.message.includes('sendiri'));

  // 2. Verify Audit Immutability: no DELETE or PUT endpoints exist on /api/penerimaan/audit
  const putAuditRes = await request('/api/penerimaan/audit/1', {
    method: 'PUT',
    token: leaderToken,
    body: { action: 'tampered' },
  });
  assert.equal(putAuditRes.status, 404, 'Audit logs cannot be updated via PUT');

  const deleteAuditRes = await request('/api/penerimaan/audit/1', {
    method: 'DELETE',
    token: leaderToken,
  });
  assert.equal(deleteAuditRes.status, 404, 'Audit logs cannot be deleted via DELETE');
});
