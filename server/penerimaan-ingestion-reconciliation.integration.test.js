import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-10-ingestion-recon-secret';
const WEBHOOK_SECRET = 'test-webhook-secret-2026';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;

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

test('Webhook Ingestion: verifies signatures, enforces idempotency, handles failures and retries', async () => {
  const provider = 'bsi';
  const rawPayload = {
    order_id: `BSI-${Date.now()}-001`,
    amount: 1500000,
    status: 'paid',
    donor_name: 'H. Muhammad Ridwan',
    donor_phone: '081234567890',
    donor_email: 'ridwan@example.com',
    program_type: 'zakat_maal',
    payment_type: 'bank_transfer',
  };
  const bodyStr = JSON.stringify(rawPayload);

  // 1. Rejects invalid signature
  const badSigRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': 'invalid_signature_1234567890abcdef',
    },
    body: rawPayload,
  });
  assert.equal(badSigRes.status, 401);

  // 2. Accepts valid HMAC-SHA256 signature and normalizes into transaction
  const validSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(bodyStr).digest('hex');
  const goodRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': validSig,
    },
    body: rawPayload,
  });
  assert.equal(goodRes.status, 200);
  const goodData = await goodRes.json();
  assert.equal(goodData.success, true);
  assert.equal(goodData.data.duplicate, false);
  assert.equal(goodData.data.transaction.muzakki_name, 'H. Muhammad Ridwan');
  assert.equal(goodData.data.transaction.amount, '1500000');
  assert.equal(goodData.data.transaction.status, 'Menunggu Validasi');

  // 3. Enforces provider event idempotency on replay
  const dupRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': validSig,
    },
    body: rawPayload,
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.equal(dupData.success, true);
  assert.equal(dupData.duplicate, true);

  // 4. Handles malformed payload gracefully (records failed status in raw events)
  const malformedPayload = { order_id: `ERR-${Date.now()}`, amount: -500 };
  const malformedBodyStr = JSON.stringify(malformedPayload);
  const malformedSig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(malformedBodyStr).digest('hex');

  const malRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature': malformedSig,
    },
    body: malformedPayload,
  });
  assert.equal(malRes.status, 422);
  const malData = await malRes.json();
  assert.equal(malData.success, false);
  assert.ok(malData.event_id);

  // 5. Staff can view raw events and retry
  const staffToken = tokenFor({ id: 201, role: 'penerimaan', level: 'staff' });
  const eventsRes = await request('/api/penerimaan/ingestion/events', { token: staffToken });
  assert.equal(eventsRes.status, 200);
  const eventsData = await eventsRes.json();
  assert.ok(eventsData.data.items.length >= 2);

  // Retrying the malformed event should fail gracefully
  const retryRes = await request(`/api/penerimaan/ingestion/events/${malData.event_id}/retry`, {
    method: 'POST',
    token: staffToken,
  });
  assert.equal(retryRes.status, 400); // Bad request because amount is invalid
});

test('Transaction Bulk Import: partial import safety and row-level error reporting', async () => {
  const staffToken = tokenFor({ id: 202, role: 'penerimaan', level: 'staff' });

  // CSV with 2 valid rows and 1 invalid row (nominal 0)
  const csvContent = [
    'tanggal,nama,telepon,email,jenis_dana,nominal,referensi',
    `2026-09-01,Ibu Siti Khadijah,081122334455,siti@example.com,zakat_maal,2500000,REF-IMP-001`,
    `2026-09-02,H. Ahmad Dahlan,081199887766,ahmad@example.com,infak,0,REF-IMP-BAD`,
    `2026-09-03,Drs. H. Syarifudin,081233445566,syarif@example.com,sedekah,500000,REF-IMP-002`,
  ].join('\n');

  const formData = new FormData();
  const fileBlob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('file', fileBlob, 'transaksi_batch_september.csv');
  formData.append('channel', 'bank_transfer');

  const importRes = await request('/api/penerimaan/transaksi/import', {
    method: 'POST',
    token: staffToken,
    body: formData,
  });

  assert.equal(importRes.status, 200);
  const importData = await importRes.json();
  assert.equal(importData.success, true);
  assert.equal(importData.data.total_rows, 3);
  assert.equal(importData.data.success_rows, 2);
  assert.equal(importData.data.failed_rows, 1);
  assert.equal(importData.data.errors[0].row, 3); // row 3 is the invalid nominal 0 row

  // Check job status by ID
  const jobId = importData.data.job_id;
  const statusRes = await request(`/api/penerimaan/transaksi/import/${jobId}`, { token: staffToken });
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.data.status, 'completed');
  assert.equal(statusData.data.success_rows, 2);
  assert.equal(statusData.data.failed_rows, 1);
});

test('Reconciliation Batches: statement import, auto-match, manual match, unmatch, authority close, and immutability', async () => {
  const staffToken = tokenFor({ id: 203, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 204, role: 'penerimaan', level: 'leader' });

  // 1. First seed two transactions that need reconciliation
  const refCodeExact = `REF-EXACT-${Date.now()}`;
  const refCodeProximity = `REF-PROX-${Date.now()}`;

  const tx1Res = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    token: staffToken,
    body: {
      channel: 'bank_transfer',
      fund_type: 'zakat_maal',
      amount: 3000000,
      muzakki_name: 'Muzakki Transaksi Match 1',
      provider_ref: refCodeExact,
    },
  });
  const tx1 = (await tx1Res.json()).data;

  // Validate and approve tx1 so it enters 'Menunggu Rekonsiliasi'
  await request(`/api/penerimaan/transaksi/${tx1.id}/validate`, {
    method: 'POST',
    token: staffToken,
  });
  await request(`/api/penerimaan/transaksi/${tx1.id}/approve`, {
    method: 'POST',
    token: leaderToken,
  });

  const tx2Res = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    token: staffToken,
    body: {
      channel: 'bank_transfer',
      fund_type: 'infak',
      amount: 750000,
      muzakki_name: 'Muzakki Transaksi Match 2',
      provider_ref: refCodeProximity,
    },
  });
  const tx2 = (await tx2Res.json()).data;

  await request(`/api/penerimaan/transaksi/${tx2.id}/validate`, {
    method: 'POST',
    token: staffToken,
  });
  await request(`/api/penerimaan/transaksi/${tx2.id}/approve`, {
    method: 'POST',
    token: leaderToken,
  });

  // 2. Create Reconciliation Batch
  const createBatchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    body: {
      channel: 'bank_transfer',
      account_name: 'Bank Syariah Indonesia (BSI)',
      account_number: '7001122334',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
      notes: 'Batch Rekonsiliasi Bank BSI September 2026',
      physical_cash_count: 0,
    },
  });
  assert.equal(createBatchRes.status, 201);
  const batch = (await createBatchRes.json()).data;
  assert.ok(batch.batch_number.startsWith('REC-'));
  assert.equal(batch.status, 'draft');

  // 3. Import bank statement lines (contains exact match and a line for manual match)
  const statementCsv = [
    'tanggal,referensi,keterangan,nominal',
    `2026-09-05,${refCodeExact},Setoran Zakat Maal BSI,3000000`,
    `2026-09-06,UNMATCHED-REF-99,Transfer Kas BSI Infak,750000`,
  ].join('\n');

  const stmtForm = new FormData();
  stmtForm.append('file', new Blob([statementCsv], { type: 'text/csv' }), 'mutasi_bsi_sept.csv');

  const importStmtRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: stmtForm,
  });
  assert.equal(importStmtRes.status, 200);
  const importStmtData = await importStmtRes.json();
  assert.equal(importStmtData.data.imported_count, 2);

  // 4. Check batch detail after import & auto-match
  const detailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  assert.equal(detailRes.status, 200);
  const detailData = (await detailRes.json()).data;
  assert.equal(detailData.total_expected_count, 2);
  assert.equal(detailData.total_expected_amount, '3750000');

  // Statement line 1 should be matched exactly
  const line1 = detailData.statement_lines.find((l) => l.reference_number === refCodeExact);
  assert.ok(line1);
  assert.equal(line1.status, 'matched');
  assert.equal(line1.matched_transaction_id, tx1.id);

  // Statement line 2
  const line2 = detailData.statement_lines.find((l) => l.reference_number === 'UNMATCHED-REF-99');
  assert.ok(line2);

  // 5. Test Manual Match and Unmatch on line 2
  // If line 2 was matched by confidence or unmatched, let's test manual match explicitly
  if (line2.status === 'unmatched') {
    const matchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line2.id,
        transaction_id: tx2.id,
        notes: 'Manual match confirmed by staff',
      }),
    });
    assert.equal(matchRes.status, 200);
    assert.equal((await matchRes.json()).success, true);
  }

  // Fetch actual match_id for line2 from DB (unmatch requires match_id, not statement_line_id)
  const db = await getDb();
  const matchRecord = await db.get(
    'SELECT id FROM penerimaan_matches WHERE statement_line_id = $1 LIMIT 1',
    [line2.id]
  );
  assert.ok(matchRecord, 'line2 must have a match record before unmatch');

  // Test unmatch using the actual match_id (scoped to batch)
  const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchRecord.id}`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Pembatalan pencocokan untuk pengujian unmatch amil' }),
  });
  assert.equal(unmatchRes.status, 200);

  // Re-match line 2 for full settlement
  const rematchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line2.id,
      transaction_id: tx2.id,
      notes: 'Final manual match before closing batch',
    }),
  });
  assert.equal(rematchRes.status, 200);

  // 6. Test Batch Close Authority Policy
  // Staff cannot close batch -> 403 Forbidden
  const staffCloseRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
    method: 'POST',
    token: staffToken,
    body: { notes: 'Staff trying to close batch' },
  });
  assert.equal(staffCloseRes.status, 403);

  // Leader can close batch -> 200 OK
  const leaderCloseRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
    method: 'POST',
    token: leaderToken,
    body: { notes: 'Batch BSI September 2026 ditutup dan difinalisasi oleh Kepala Bagian' },
  });
  assert.equal(leaderCloseRes.status, 200);
  const closedBatchData = (await leaderCloseRes.json()).data;
  assert.equal(closedBatchData.status, 'closed');
  assert.ok(closedBatchData.closed_at);

  // 7. Test Closed Batch Immutability
  // Modifying closed batch should be rejected with 400
  const immutableRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/auto-match`, {
    method: 'POST',
    token: leaderToken,
  });
  assert.equal(immutableRes.status, 400);
  const immData = await immutableRes.json();
  assert.match(immData.message, /telah ditutup dan bersifat permanen/);

  // Re-closing already closed batch is also rejected
  const recloseRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
    method: 'POST',
    token: leaderToken,
  });
  assert.equal(recloseRes.status, 400);
});
