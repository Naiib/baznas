import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-10-hardening-recon-secret';
const TEST_WEBHOOK_SECRET = 'hardening-webhook-secret-xyz';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb, withTransaction } = await import('./db.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  const db = await getDb();
  await db.run('DELETE FROM penerimaan_matches');
  await db.run('DELETE FROM penerimaan_statement_lines');
  await db.run('DELETE FROM penerimaan_reconciliation_batches');
  await db.run("DELETE FROM penerimaan_transactions WHERE provider_ref LIKE 'HARD-%' OR provider_ref LIKE 'ELIG-%' OR provider_ref LIKE 'REF-%' OR provider_ref LIKE 'SPLIT-%' OR provider_ref LIKE 'MERGE-%' OR provider_ref LIKE 'RB-%' OR provider_ref LIKE 'NEG-%' OR provider_ref LIKE 'CONC-%' OR provider_ref LIKE 'UNM-%' OR provider_ref LIKE 'DUP-%' OR provider_ref LIKE 'SP-%' OR provider_ref LIKE 'BIG-%' OR provider_ref LIKE 'MULTI-%'");
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

function tokenFor({ id = 15, role = 'penerimaan', division = 'Bidang Pengumpulan & ZIS', level = 'staff', name = 'Staff Amil' } = {}) {
  return jwt.sign({ id, name, role, division, level }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('Webhook Hardening: missing secret rejection, invalid signature, payload tampering, raw bytes, idempotency', async () => {
  const provider = 'midtrans';

  // 1. Missing secret should reject with 500 when no secret is configured
  const db = await getDb();
  const rawEventCountBefore = await db.get('SELECT COUNT(*) AS count FROM penerimaan_raw_events');
  const savedSecret = process.env.WEBHOOK_SECRET;
  delete process.env.WEBHOOK_SECRET;
  delete process.env.WEBHOOK_SECRET_MIDTRANS;
  const diagnostics = [];
  const originalConsoleError = console.error;
  console.error = (...args) => diagnostics.push(args);

  try {
    const noSecretRes = await request(`/api/penerimaan/webhook/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': 'any-sig' },
      body: JSON.stringify({ order_id: 'ORDER-NO-SEC-01', amount: 100000 }),
    });
    assert.equal(noSecretRes.status, 500);
    const noSecData = await noSecretRes.json();
    assert.equal(noSecData.success, false);
    assert.equal(noSecData.message, 'Terjadi kesalahan sistem.');
    assert.equal(noSecData.message.includes('secret'), false);
    assert.ok(noSecData.correlation_id);
    assert.equal(noSecretRes.headers.get('x-correlation-id'), noSecData.correlation_id);
    const rawEventCountAfter = await db.get('SELECT COUNT(*) AS count FROM penerimaan_raw_events');
    assert.equal(rawEventCountAfter.count, rawEventCountBefore.count, 'missing-secret webhook must not record a raw event');
    const rawEvent = await db.get(
      'SELECT id FROM penerimaan_raw_events WHERE idempotency_key = $1',
      [`${provider}:ORDER-NO-SEC-01`]
    );
    assert.equal(rawEvent, undefined, 'missing-secret webhook marker must not be persisted');
  } finally {
    console.error = originalConsoleError;
    process.env.WEBHOOK_SECRET = savedSecret;
  }
  assert.ok(diagnostics.some((args) => /webhook secret.*not configured/i.test(JSON.stringify(args))), 'missing-secret failure must be logged server-side');

  // 2. Invalid signature returns 401
  const rawPayload = {
    order_id: `HARD-BSI-${Date.now()}`,
    amount: 500000,
    status: 'settlement',
    donor_name: 'H. Amil Penguji',
    donor_phone: '081299998888',
    donor_email: 'amil@example.com',
    program_type: 'zakat_maal',
    payment_type: 'bank_transfer',
  };
  const rawBodyStr = JSON.stringify(rawPayload, null, 2); // With whitespace to test raw bytes

  const invalidSigRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': 'invalid_signature_hex_value' },
    body: rawBodyStr,
  });
  assert.equal(invalidSigRes.status, 401);

  // 3. Payload tampering: valid signature for different body fails on tampered body
  const originalSig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(rawBodyStr).digest('hex');
  const tamperedBodyStr = rawBodyStr.replace('500000', '900000');

  const tamperedRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': originalSig },
    body: tamperedBodyStr,
  });
  assert.equal(tamperedRes.status, 401);

  // 4. Exact raw bytes verification succeeds
  const successRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': originalSig },
    body: rawBodyStr,
  });
  assert.equal(successRes.status, 200);
  const successData = await successRes.json();
  assert.equal(successData.success, true);
  assert.equal(successData.duplicate, false);

  // 5. Duplicate webhook replay returns duplicate: true (idempotent)
  const dupRes = await request(`/api/penerimaan/webhook/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': originalSig },
    body: rawBodyStr,
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.equal(dupData.duplicate, true);
});

test('Reconciliation Status Eligibility: strictly forbids matching non-eligible statuses', async () => {
  const staffToken = tokenFor({ id: 25, role: 'penerimaan', level: 'staff' });
  const db = await getDb();

  // Create a reconciliation batch for bank_transfer
  const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      account_name: 'BSI Zakat Eligibility',
      account_number: '7788990011',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
      notes: 'Testing status eligibility rules',
    }),
  });
  assert.equal(batchRes.status, 201);
  const batch = (await batchRes.json()).data;

  // Import 1 statement line
  const stmtCsv = 'tanggal,referensi,uraian,nominal\n2026-09-10,ELIG-REF-001,Mutasi Donasi BSI,1000000';
  const stmtForm = new FormData();
  stmtForm.append('file', new Blob([stmtCsv], { type: 'text/csv' }), 'mutasi_elig.csv');

  const importRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: stmtForm,
  });
  assert.equal(importRes.status, 200);

  const detailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  const line = (await detailRes.json()).data.statement_lines[0];
  assert.ok(line);

  // Insert transactions with ineligible statuses:
  // Masuk, Menunggu Validasi, Menunggu Approval, Ditolak, Disputed, Posted
  const ineligibleStatuses = ['Masuk', 'Menunggu Validasi', 'Menunggu Approval', 'Ditolak', 'Disputed', 'Posted'];

  for (const ineligibleStatus of ineligibleStatuses) {
    const txNum = `TRX-INELIG-${ineligibleStatus.replace(/\s+/g, '-').toUpperCase()}-${Date.now()}`;
    const rcptNum = `BSZ-INELIG-${ineligibleStatus.replace(/\s+/g, '-').toUpperCase()}-${Date.now()}`;

    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ($1, $2, 'bank_transfer', 'digital', $3, 'Donatur Ineligible', 'zakat_maal', 1000000, 0, 1000000, $4, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [txNum, rcptNum, `REF-${ineligibleStatus}`, ineligibleStatus]
    );

    const insertedTx = await db.get('SELECT id, status FROM penerimaan_transactions WHERE transaction_number = $1', [txNum]);
    assert.equal(insertedTx.status, ineligibleStatus);

    // Attempt manual match -> MUST FAIL with 422
    const failMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: insertedTx.id,
        notes: `Attempting illegal match from status ${ineligibleStatus}`,
      }),
    });

    assert.equal(
      failMatchRes.status,
      422,
      `Transaction with status "${ineligibleStatus}" must be rejected from reconciliation match (expected 422, got ${failMatchRes.status})`
    );
    const failData = await failMatchRes.json();
    assert.match(failData.message, /tidak eligible/i);
  }

  // Now create an eligible transaction with status 'Menunggu Rekonsiliasi'
  const eligibleTxNum = `TRX-ELIG-OK-${Date.now()}`;
  const eligibleRcptNum = `BSZ-ELIG-OK-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ($1, $2, 'bank_transfer', 'digital', 'ELIG-REF-001', 'Donatur Sah', 'zakat_maal', 1000000, 0, 1000000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [eligibleTxNum, eligibleRcptNum]
  );
  const eligibleTx = await db.get('SELECT id FROM penerimaan_transactions WHERE transaction_number = $1', [eligibleTxNum]);

  // Matching eligible transaction succeeds
  const matchSuccessRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line.id,
      transaction_id: eligibleTx.id,
      notes: 'Pencocokan amil yang valid untuk status Menunggu Rekonsiliasi',
    }),
  });
  assert.equal(matchSuccessRes.status, 200);
});

test('Manual Match Validations: channel, version, duplicate match, closed batch, and mandatory reason', async () => {
  const staffToken = tokenFor({ id: 26, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 27, role: 'penerimaan', level: 'leader' });
  const db = await getDb();

  // Create bank batch
  const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      account_name: 'BSI Validations',
      account_number: '1122334455',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
    }),
  });
  const batch = (await batchRes.json()).data;

  // Import statement lines: 2 lines
  const stmtCsv = [
    'tanggal,referensi,uraian,nominal',
    '2026-09-05,LINE-VAL-01,Transfer Bank 1,500000',
    '2026-09-06,LINE-VAL-02,Transfer Bank 2,750000',
  ].join('\n');
  const stmtForm = new FormData();
  stmtForm.append('file', new Blob([stmtCsv], { type: 'text/csv' }), 'mutasi_val.csv');

  await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: stmtForm,
  });

  const detailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  const lines = (await detailRes.json()).data.statement_lines;
  const line1 = lines[0];
  const line2 = lines[1];

  // 1. Mandatory reason check: missing or whitespace-only reason rejected with 400
  const txBankRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      fund_type: 'infak',
      amount: 500000,
      muzakki_name: 'Donatur Bank 1',
    }),
  });
  const txBank = (await txBankRes.json()).data;
  // Move to Menunggu Rekonsiliasi
  await db.run("UPDATE penerimaan_transactions SET status = 'Menunggu Rekonsiliasi' WHERE id = $1", [txBank.id]);

  const noReasonRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txBank.id,
      notes: '   ', // whitespace only
    }),
  });
  assert.equal(noReasonRes.status, 400);
  assert.match((await noReasonRes.json()).message, /alasan.*wajib diisi/i);

  // 2. Channel mismatch check: QRIS transaction matched against bank_transfer batch rejected with 422
  const txQrisRes = await request('/api/penerimaan/transaksi/manual', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'qris',
      fund_type: 'sedekah',
      amount: 500000,
      muzakki_name: 'Donatur QRIS',
    }),
  });
  const txQris = (await txQrisRes.json()).data;
  await db.run("UPDATE penerimaan_transactions SET status = 'Menunggu Rekonsiliasi' WHERE id = $1", [txQris.id]);

  const channelMismatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txQris.id,
      notes: 'Attempting channel mismatch match',
    }),
  });
  assert.equal(channelMismatchRes.status, 422);
  assert.match((await channelMismatchRes.json()).message, /kanal.*tidak sesuai/i);

  // 3. Optimistic concurrency / version conflict check: stale expected_version rejected with 409
  const staleVerRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txBank.id,
      expected_version: 999, // stale version!
      notes: 'Pencocokan dengan versi kedaluwarsa',
    }),
  });
  assert.equal(staleVerRes.status, 409);

  // 4. Valid match succeeds
  const matchOkRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txBank.id,
      expected_version: 0,
      notes: 'Pencocokan manual valid dengan referensi cocok',
    }),
  });
  assert.equal(matchOkRes.status, 200);
  const matchOkData = await matchOkRes.json();
  const matchId1 = matchOkData.data?.match_id || matchOkData.data?.match_ids?.[0];
  assert.ok(matchId1, 'match endpoint must return match_id for unmatch operations');

  // 5. Duplicate match check: line1 is already matched -> matching line1 again fails with 409
  const dupLineMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txQris.id,
      notes: 'Attempting duplicate line match',
    }),
  });
  assert.equal(dupLineMatchRes.status, 409);

  // Duplicate match check: txBank is already matched -> matching txBank with line2 fails with 409
  const dupTxMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line2.id,
      transaction_id: txBank.id,
      notes: 'Attempting duplicate transaction match',
    }),
  });
  assert.equal(dupTxMatchRes.status, 409);

  // 6. Mandatory reason on unmatch: unmatching without reason rejected with 400
  const unmatchNoReasonRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchId1}`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: '' }),
  });
  assert.equal(unmatchNoReasonRes.status, 400);

  // Unmatch with valid reason succeeds (uses actual match_id, not statement_line_id)
  const unmatchOkRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchId1}`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Dibatalkan karena salah input amil' }),
  });
  assert.equal(unmatchOkRes.status, 200);

  // Re-match for closing batch; capture new match_id
  const rematchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line1.id,
      transaction_id: txBank.id,
      notes: 'Re-matching line1 for close batch test',
    }),
  });
  assert.equal(rematchRes.status, 200);

  // 7. Closing batch with discrepancy requires mandatory variance reason
  // line2 is still unmatched (amount 750000), so discrepancy is 750000
  const closeNoReasonRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
    method: 'POST',
    token: leaderToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: '' }),
  });
  assert.equal(closeNoReasonRes.status, 400);
  assert.match((await closeNoReasonRes.json()).message, /alasan.*selisih.*wajib diisi/i);

  // Close batch with variance reason succeeds
  const closeOkRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
    method: 'POST',
    token: leaderToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Selisih Rp 750.000 sedang dalam penelusuran amil antar-kantor' }),
  });
  assert.equal(closeOkRes.status, 200);

  // 8. Closed batch mutation: matching on closed batch fails with 400
  const closedMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line2.id,
      transaction_id: txBank.id,
      notes: 'Trying to mutate closed batch',
    }),
  });
  assert.equal(closedMatchRes.status, 400);
  assert.match((await closedMatchRes.json()).message, /telah ditutup/i);
});

test('Settlement Reconciliation: Split (1-to-N) and Merge (N-to-1) settlements', async () => {
  const staffToken = tokenFor({ id: 28, role: 'penerimaan', level: 'staff' });
  const db = await getDb();

  // Create batch for settlement testing
  const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      account_name: 'BSI Split Merge',
      account_number: '9988776655',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
    }),
  });
  const batch = (await batchRes.json()).data;

  // Import statement lines:
  // Line A: 1,500,000 (for split into 1,000,000 and 500,000)
  // Line B1: 300,000 & Line B2: 700,000 (for merge into 1,000,000)
  const stmtCsv = [
    'tanggal,referensi,uraian,nominal',
    '2026-09-12,SPLIT-LINE-01,Bulk Deposit Donatur Grup,1500000',
    '2026-09-13,MERGE-LINE-01,Cicilan Donasi Bagian 1,300000',
    '2026-09-14,MERGE-LINE-02,Cicilan Donasi Bagian 2,700000',
  ].join('\n');
  const stmtForm = new FormData();
  stmtForm.append('file', new Blob([stmtCsv], { type: 'text/csv' }), 'mutasi_split_merge.csv');

  await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: stmtForm,
  });

  const detailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  const lines = (await detailRes.json()).data.statement_lines;
  const splitLine = lines.find((l) => l.reference_number === 'SPLIT-LINE-01');
  const mergeLine1 = lines.find((l) => l.reference_number === 'MERGE-LINE-01');
  const mergeLine2 = lines.find((l) => l.reference_number === 'MERGE-LINE-02');

  // A. Test Split (1 statement line to 2 transactions)
  // Create 2 transactions in 'Menunggu Rekonsiliasi'
  const refSplitA = `SPLIT-A-${Date.now()}`;
  const refSplitB = `SPLIT-B-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES
     ('TRX-${refSplitA}', 'BSZ-${refSplitA}', 'bank_transfer', 'digital', $1, 'Muzakki A', 'zakat_maal', 1000000, 0, 1000000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
     ('TRX-${refSplitB}', 'BSZ-${refSplitB}', 'bank_transfer', 'digital', $2, 'Muzakki B', 'infak', 500000, 0, 500000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [refSplitA, refSplitB]
  );

  const txSplitA = await db.get('SELECT id, status FROM penerimaan_transactions WHERE provider_ref = $1', [refSplitA]);
  const txSplitB = await db.get('SELECT id, status FROM penerimaan_transactions WHERE provider_ref = $1', [refSplitB]);

  const splitMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: splitLine.id,
      transaction_ids: [txSplitA.id, txSplitB.id],
      notes: 'Pencocokan split settlement 1 transfer bank ke 2 penerimaan donatur',
    }),
  });
  assert.equal(splitMatchRes.status, 200);

  // Verify both transactions are now Terekonsiliasi
  const txAAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txSplitA.id]);
  const txBAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txSplitB.id]);
  assert.equal(txAAfter.status, 'Terekonsiliasi');
  assert.equal(txBAfter.status, 'Terekonsiliasi');
  assert.equal(txAAfter.reconciliation_batch_id, batch.id);
  assert.equal(txBAfter.reconciliation_batch_id, batch.id);

  // Verify statement line is matched
  const splitLineAfter = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [splitLine.id]);
  assert.equal(splitLineAfter.status, 'matched');

  // Verify penerimaan_matches entries have match_type = 'split'
  const splitMatches = await db.all('SELECT * FROM penerimaan_matches WHERE statement_line_id = $1', [splitLine.id]);
  assert.equal(splitMatches.length, 2);
  assert.ok(splitMatches.every((m) => m.match_type === 'split'));

  // B. Test Merge (2 statement lines to 1 transaction)
  // Create 1 transaction in 'Menunggu Rekonsiliasi' of 1,000,000
  const refMergeC = `MERGE-C-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES
     ('TRX-${refMergeC}', 'BSZ-${refMergeC}', 'bank_transfer', 'digital', $1, 'Muzakki C', 'zakat_profesi', 1000000, 0, 1000000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [refMergeC]
  );
  const txMergeC = await db.get('SELECT id, status FROM penerimaan_transactions WHERE provider_ref = $1', [refMergeC]);

  const mergeMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_ids: [mergeLine1.id, mergeLine2.id],
      transaction_id: txMergeC.id,
      notes: 'Pencocokan merge settlement 2 baris mutasi bank cicilan ke 1 transaksi zakat',
    }),
  });
  assert.equal(mergeMatchRes.status, 200);

  // Verify transaction is Terekonsiliasi
  const txCAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txMergeC.id]);
  assert.equal(txCAfter.status, 'Terekonsiliasi');
  assert.equal(txCAfter.reconciliation_batch_id, batch.id);

  // Verify both statement lines are matched
  const mergeLine1After = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [mergeLine1.id]);
  const mergeLine2After = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [mergeLine2.id]);
  assert.equal(mergeLine1After.status, 'matched');
  assert.equal(mergeLine2After.status, 'matched');

  // Verify penerimaan_matches entries have match_type = 'merge'
  const mergeMatches = await db.all('SELECT * FROM penerimaan_matches WHERE transaction_id = $1', [txMergeC.id]);
  assert.equal(mergeMatches.length, 2);
  assert.ok(mergeMatches.every((m) => m.match_type === 'merge'));
});

test('Atomic Rollback: database transactions rollback when audit or secondary operations fail', async () => {
  const staffToken = tokenFor({ id: 29, role: 'penerimaan', level: 'staff' });
  const db = await getDb();

  // Create batch
  const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      account_name: 'BSI Rollback Test',
      account_number: '1234567890',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
    }),
  });
  const batch = (await batchRes.json()).data;

  // Import 1 statement line
  const stmtCsv = 'tanggal,referensi,uraian,nominal\n2026-09-15,ROLLBACK-REF-01,Test Mutasi Rollback,500000';
  const stmtForm = new FormData();
  stmtForm.append('file', new Blob([stmtCsv], { type: 'text/csv' }), 'mutasi_rb.csv');
  await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: stmtForm,
  });

  const detailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  const line = (await detailRes.json()).data.statement_lines[0];

  // Insert transaction
  const txNum = `TRX-RB-${Date.now()}`;
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ($1, $2, 'bank_transfer', 'digital', 'RB-REF', 'Donatur Rollback', 'infak', 500000, 0, 500000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [txNum, `BSZ-RB-${Date.now()}`]
  );
  const tx = await db.get('SELECT id, status, workflow_version FROM penerimaan_transactions WHERE transaction_number = $1', [txNum]);

  // Import matchStatementLine directly and simulate an audit failure injection
  const { matchStatementLine } = await import('./repository.js');

  // Trigger match with simulated audit event failure
  const failingActor = {
    id: 9999,
    name: 'Failing Actor',
    role: 'penerimaan',
    __simulateAuditFailure: true, // Marker to trigger error inside audit event logging
  };

  await assert.rejects(
    async () => {
      await matchStatementLine({
        batchId: batch.id,
        statementLineId: line.id,
        transactionId: tx.id,
        notes: 'Testing rollback on audit failure',
        actor: failingActor,
      });
    },
    /simulated audit failure/i
  );


  // ASSERT: Entire operation was rolled back atomically!
  const lineAfter = await db.get('SELECT status, matched_transaction_id FROM penerimaan_statement_lines WHERE id = $1', [line.id]);
  assert.equal(lineAfter.status, 'unmatched', 'Statement line status must remain unmatched after rollback');
  assert.equal(lineAfter.matched_transaction_id, null, 'Statement line matched_transaction_id must remain null');

  const txAfter = await db.get('SELECT status, reconciliation_batch_id, workflow_version FROM penerimaan_transactions WHERE id = $1', [tx.id]);
  assert.equal(txAfter.status, 'Menunggu Rekonsiliasi', 'Transaction status must remain Menunggu Rekonsiliasi after rollback');
  assert.equal(txAfter.reconciliation_batch_id, null, 'Transaction reconciliation_batch_id must remain null after rollback');
  assert.equal(txAfter.workflow_version, 0, 'Transaction workflow_version must not be incremented after rollback');

  const matchRecord = await db.get('SELECT id FROM penerimaan_matches WHERE statement_line_id = $1 AND transaction_id = $2', [line.id, tx.id]);
  assert.equal(Boolean(matchRecord), false, 'No match record should exist in penerimaan_matches after rollback');

  // SQLite savepoint cleanup: also verify no leftover penerimaan_audit_events entry from failed match
  const auditRecord = await db.get(
    "SELECT id FROM penerimaan_audit_events WHERE entity_id = $1 AND action = 'manual_match' LIMIT 1",
    [batch.id]
  );
  assert.equal(Boolean(auditRecord), false, 'No audit event for manual_match should exist after rollback');
});

test('Reconciliation Negative Edge Cases: nominal imbalance, N-to-M, cross-batch unmatch, atomic concurrency, close-then-match race', async () => {
  const staffToken = tokenFor({ id: 30, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 31, role: 'penerimaan', level: 'leader' });
  const db = await getDb();

  /** Helper: create reconciliation batch */
  async function createBatch(suffix) {
    const res = await request('/api/penerimaan/rekonsiliasi/batches', {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'bank_transfer',
        account_name: `BSI Negative Test ${suffix}`,
        account_number: `000000000${suffix}`,
        period_start: '2026-09-01T00:00:00.000Z',
        period_end: '2026-09-30T23:59:59.999Z',
      }),
    });
    assert.equal(res.status, 201);
    return (await res.json()).data;
  }

  /** Helper: import a single statement line into batch */
  async function importLine(batchId, ref, amount) {
    const csv = `tanggal,referensi,uraian,nominal\n2026-09-15,${ref},Mutasi Negatif Test,${amount}`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'neg.csv');
    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/import`, {
      method: 'POST',
      token: staffToken,
      body: form,
    });
    assert.equal(res.status, 200);
    const detail = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}`, { token: staffToken });
    return (await detail.json()).data.statement_lines.find((l) => l.reference_number === ref);
  }

  /** Helper: insert a transaction in 'Menunggu Rekonsiliasi' */
  async function insertEligibleTx(ref, amount) {
    const txNum = `TRX-NEG-${ref}-${Date.now()}`;
    const rcptNum = `BSZ-NEG-${ref}-${Date.now()}`;
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ($1, $2, 'bank_transfer', 'digital', $3, 'Donatur Negatif', 'zakat_maal', $4, 0, $4, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [txNum, rcptNum, `NEG-${ref}`, amount]
    );
    return db.get('SELECT id, workflow_version FROM penerimaan_transactions WHERE transaction_number = $1', [txNum]);
  }

  // ─── Test 1: Split nominal imbalance ────────────────────────────────────────
  // 1 line (1,500,000) matched to 2 txs totaling 1,200,000 → must reject with 400
  {
    const batch = await createBatch(1);
    const line = await importLine(batch.id, 'NEG-SPLIT-IMB', 1500000);
    const txA = await insertEligibleTx('SPLIT-IMB-A', 800000);
    const txB = await insertEligibleTx('SPLIT-IMB-B', 400000); // total = 1,200,000 ≠ 1,500,000

    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_ids: [txA.id, txB.id],
        notes: 'Split imbalance test — nominal mismatch',
      }),
    });
    assert.equal(res.status, 400, `Split nominal imbalance must return 400 (got ${res.status})`);
    const body = await res.json();
    assert.match(body.message, /nominal tidak seimbang/i);

    // Statement line must remain unmatched
    const lineDb = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [line.id]);
    assert.equal(lineDb.status, 'unmatched');
  }

  // ─── Test 2: Merge nominal imbalance ────────────────────────────────────────
  // 2 lines (600,000 + 400,000 = 1,000,000) matched to 1 tx (800,000) → must reject with 400
  {
    const batch = await createBatch(2);
    const lineA = await importLine(batch.id, 'NEG-MERGE-IMB-A', 600000);
    const lineB = await importLine(batch.id, 'NEG-MERGE-IMB-B', 400000);
    const tx = await insertEligibleTx('MERGE-IMB-C', 800000); // 600+400 = 1,000,000 ≠ 800,000

    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_ids: [lineA.id, lineB.id],
        transaction_id: tx.id,
        notes: 'Merge imbalance test — nominal mismatch',
      }),
    });
    assert.equal(res.status, 400, `Merge nominal imbalance must return 400 (got ${res.status})`);
    const body = await res.json();
    assert.match(body.message, /nominal tidak seimbang/i);
  }

  // ─── Test 3: N-to-M request rejection ───────────────────────────────────────
  // 2 lines + 2 txs → must reject with 400
  {
    const batch = await createBatch(3);
    const lineA = await importLine(batch.id, 'NEG-NTM-LINE-A', 500000);
    const lineB = await importLine(batch.id, 'NEG-NTM-LINE-B', 500000);
    const txA = await insertEligibleTx('NTM-TX-A', 500000);
    const txB = await insertEligibleTx('NTM-TX-B', 500000);

    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_ids: [lineA.id, lineB.id],
        transaction_ids: [txA.id, txB.id],
        notes: 'N-to-M forbidden pattern test',
      }),
    });
    assert.equal(res.status, 400, `N-to-M match must return 400 (got ${res.status})`);
    const body = await res.json();
    assert.match(body.message, /N-to-M tidak diizinkan/i);
  }

  // ─── Test 4: Unmatch cross-batch scope ──────────────────────────────────────
  // Match a line in batchA. Attempt to unmatch using batchB's endpoint. Must return 404.
  {
    const batchA = await createBatch(4);
    const batchB = await createBatch(5);
    const line = await importLine(batchA.id, 'NEG-CROSS-BATCH-LINE', 300000);
    const tx = await insertEligibleTx('CROSS-BATCH-TX', 300000);

    // Match in batchA
    const matchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchA.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: tx.id,
        notes: 'Pencocokan untuk uji cross-batch unmatch',
      }),
    });
    assert.equal(matchRes.status, 200);
    const matchData = await matchRes.json();
    const matchId = matchData.data?.match_id || matchData.data?.match_ids?.[0];
    assert.ok(matchId, 'must have match_id');

    // Attempt unmatch using batchB's endpoint with batchA's match_id → must return 404
    const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchB.id}/unmatch/${matchId}`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Attempting cross-batch unmatch' }),
    });
    assert.equal(unmatchRes.status, 404, `Cross-batch unmatch must return 404 (got ${unmatchRes.status})`);
    const body = await unmatchRes.json();
    assert.match(body.message, /tidak ditemukan dalam batch/i);

    // Original match in batchA must still exist (rollback of unmatch attempt)
    const matchStillExists = await db.get('SELECT id FROM penerimaan_matches WHERE id = $1', [matchId]);
    assert.ok(matchStillExists, 'Match record in batchA must still exist after failed cross-batch unmatch');
  }

  // ─── Test 5: Atomic concurrency UPDATE — stale version at DB level ───────────
  // Manually bump workflow_version in DB after our read but before match UPDATE.
  // We simulate this by setting expected_version correctly, matching succeeds (version 0→1),
  // then attempt a second match of a different line to same tx — hits duplicate match check (409).
  // For the atomic DB-level race: directly UPDATE workflow_version mid-flight via direct DB call
  // after the version check passes, using the matchStatementLine repository function with a mock db.
  {
    const batch = await createBatch(6);
    const line = await importLine(batch.id, 'NEG-ATOMIC-LINE', 250000);
    const tx = await insertEligibleTx('ATOMIC-RACE-TX', 250000);

    // First match succeeds (version 0 → 1)
    const firstMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: tx.id,
        expected_version: 0,
        notes: 'First match succeeds at version 0',
      }),
    });
    assert.equal(firstMatchRes.status, 200, 'First match must succeed at version 0');

    // Simulate stale update: import a second line, insert a second tx at version 0,
    // then bump its version in DB BEFORE the match endpoint runs the WHERE-version UPDATE.
    // We do this via direct DB manipulation to test the atomic path.
    const line2 = await importLine(batch.id, 'NEG-ATOMIC-LINE-2', 500000);
    const tx2 = await insertEligibleTx('ATOMIC-RACE-TX-2', 500000);

    // Bump workflow_version in the DB directly to simulate a concurrent modification
    await db.run(
      'UPDATE penerimaan_transactions SET workflow_version = 5 WHERE id = $1',
      [tx2.id]
    );

    // Now try to match with expected_version = 0 (stale)
    const staleRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line2.id,
        transaction_id: tx2.id,
        expected_version: 0, // stale! DB has version 5
        notes: 'Stale version test: should fail with 409',
      }),
    });
    assert.equal(staleRes.status, 409, `Stale concurrency version must return 409 (got ${staleRes.status})`);

    // line2 and tx2 must remain unmatched after the failed attempt
    const line2Db = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [line2.id]);
    assert.equal(line2Db.status, 'unmatched', 'line2 must remain unmatched after stale version rejection');
    const tx2Db = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [tx2.id]);
    assert.equal(tx2Db.status, 'Menunggu Rekonsiliasi', 'tx2 must remain Menunggu Rekonsiliasi after stale version rejection');
    assert.equal(tx2Db.reconciliation_batch_id, null, 'tx2 reconciliation_batch_id must remain null');
  }

  // ─── Test 6: Close-then-Match race (closed batch immutability) ───────────────
  // Close batch first, then attempt match → must return 400 (batch closed).
  // Also attempt a second close → must return 400 (already closed via permission guard).
  {
    const batch = await createBatch(7);
    const line = await importLine(batch.id, 'NEG-CLOSE-RACE-LINE', 400000);
    const tx = await insertEligibleTx('CLOSE-RACE-TX', 400000);

    // Import a second line BEFORE close (it will be unmatched at close time)
    const line2 = await importLine(batch.id, 'NEG-CLOSE-RACE-LINE-2', 200000);
    const tx2 = await insertEligibleTx('CLOSE-RACE-TX-2', 200000);

    // Match line1 successfully
    const matchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: tx.id,
        notes: 'Match before close for race test',
      }),
    });
    assert.equal(matchRes.status, 200);

    // Close batch with discrepancy (line2 is unmatched, amount 200,000)
    const closeRes1 = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
      method: 'POST',
      token: leaderToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Penutupan batch dengan selisih Rp 200.000 dalam penelusuran' }),
    });
    assert.equal(closeRes1.status, 200, `First close must succeed (got ${closeRes1.status})`);

    // Second close attempt: canCloseReconciliationBatch detects status = 'closed' → 400.
    // The conditional UPDATE (Fix 6) guards against a true mid-flight race where two requests
    // pass the permission check simultaneously; in sequential tests the permission guard fires first.
    const closeRes2 = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
      method: 'POST',
      token: leaderToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Concurrent close attempt' }),
    });
    assert.equal(closeRes2.status, 400, `Second close on already-closed batch must return 400 (got ${closeRes2.status})`);
    const closeBody2 = await closeRes2.json();
    assert.match(closeBody2.message, /sudah berstatus/i);

    // Attempt match on closed batch (line2 and tx2 exist but batch is now closed) → must return 400
    const matchAfterClose = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line2.id,
        transaction_id: tx2.id,
        notes: 'Match after close — must be rejected',
      }),
    });
    assert.equal(matchAfterClose.status, 400, `Match on closed batch must return 400 (got ${matchAfterClose.status})`);
    assert.match((await matchAfterClose.json()).message, /telah ditutup/i);

    // Verify tx2 was not affected by the failed match-after-close
    const tx2Db = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [tx2.id]);
    assert.equal(tx2Db.status, 'Menunggu Rekonsiliasi', 'tx2 must remain Menunggu Rekonsiliasi after closed-batch match rejection');
    assert.equal(tx2Db.reconciliation_batch_id, null, 'tx2 reconciliation_batch_id must remain null');
  }
});

test('Concurrent Operations via Promise.all and Deterministic Barrier: serialization and atomic conflict rejection', async () => {
  const staffToken = tokenFor({ id: 35, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 36, role: 'penerimaan', level: 'leader' });
  const db = await getDb();

  async function createBatch(suffix) {
    const res = await request('/api/penerimaan/rekonsiliasi/batches', {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'bank_transfer',
        account_name: `BSI Concurrency Test ${suffix}`,
        account_number: `11112222${suffix}`,
        period_start: '2026-09-01T00:00:00.000Z',
        period_end: '2026-09-30T23:59:59.999Z',
      }),
    });
    assert.equal(res.status, 201);
    return (await res.json()).data;
  }

  async function importLine(batchId, ref, amount) {
    const csv = `tanggal,referensi,uraian,nominal\n2026-09-16,${ref},Mutasi Concurrency Test,${amount}`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'conc.csv');
    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/import`, {
      method: 'POST',
      token: staffToken,
      body: form,
    });
    assert.equal(res.status, 200);
    const detail = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}`, { token: staffToken });
    return (await detail.json()).data.statement_lines.find((l) => l.reference_number === ref);
  }

  async function insertEligibleTx(ref, amount) {
    const txNum = `TRX-CONC-${ref}-${Date.now()}`;
    const rcptNum = `BSZ-CONC-${ref}-${Date.now()}`;
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ($1, $2, 'bank_transfer', 'digital', $3, 'Donatur Concurrency', 'zakat_maal', $4, 0, $4, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [txNum, rcptNum, `CONC-${ref}`, amount]
    );
    return db.get('SELECT id, workflow_version FROM penerimaan_transactions WHERE transaction_number = $1', [txNum]);
  }

  // ─── Subtest 1: Dua match paralel pada statement yang sama via Promise.all ───
  // Dua request dikirim bersamaan. Hanya satu operasi yang boleh berhasil (200), yang lain ditolak (409).
  {
    const batch = await createBatch('PAR-1');
    const line = await importLine(batch.id, 'CONC-LINE-PAR-1', 500000);
    const txA = await insertEligibleTx('PAR-TX-A', 500000);
    const txB = await insertEligibleTx('PAR-TX-B', 500000);

    const matchFn = (txId, label) =>
      request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
        method: 'POST',
        token: staffToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement_line_id: line.id,
          transaction_id: txId,
          notes: `Parallel match attempt: ${label}`,
        }),
      });

    const [res1, res2] = await Promise.all([matchFn(txA.id, 'A'), matchFn(txB.id, 'B')]);
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [200, 409], 'Exactly one concurrent match must succeed (200) and the other must be rejected with conflict (409)');

    // Verify statement line has status 'matched' and exactly ONE match record exists in DB
    const lineDb = await db.get('SELECT status FROM penerimaan_statement_lines WHERE id = $1', [line.id]);
    assert.equal(lineDb.status, 'matched');
    const matchesCount = await db.get(
      'SELECT COUNT(*) as count FROM penerimaan_matches WHERE statement_line_id = $1',
      [line.id]
    );
    assert.equal(Number(matchesCount.count), 1, 'Only one match record should exist in penerimaan_matches');
  }

  // ─── Subtest 2: Deterministic Barrier Hook — conditional statement update ───
  // Membuktikan klausul WHERE id = ? AND batch_id = ? AND status = 'unmatched'
  // menggagalkan operasi yang membaca status 'unmatched' sebelum baris dicocokkan pihak lain.
  {
    const { matchStatementLine } = await import('./repository.js');
    const batch = await createBatch('BARRIER-1');
    const line = await importLine(batch.id, 'CONC-BARRIER-LINE', 750000);
    const tx1 = await insertEligibleTx('BARRIER-TX-1', 750000);
    const tx2 = await insertEligibleTx('BARRIER-TX-2', 750000);

    let releaseBarrier;
    const barrierPromise = new Promise((resolve) => {
      releaseBarrier = resolve;
    });

    // Operation 1 pauses right before updating the statement line
    const op1Promise = matchStatementLine({
      batchId: batch.id,
      statementLineId: line.id,
      transactionId: tx1.id,
      notes: 'Op1 waiting at barrier',
      actor: {
        id: 35,
        role: 'penerimaan',
        level: 'staff',
        __bypassBatchLock: true,
        __beforeStatementUpdateHook: async () => {
          // Pause here until Operation 2 completes
          await barrierPromise;
        },
      },
    });

    // Operation 2 runs and commits (marking line as matched)
    const op2Promise = (async () => {
      // Small tick to ensure op1 has read the line and is waiting at the hook
      await new Promise((r) => setTimeout(r, 50));
      const result = await matchStatementLine({
        batchId: batch.id,
        statementLineId: line.id,
        transactionId: tx2.id,
        notes: 'Op2 executes and claims line',
        actor: { id: 35, role: 'penerimaan', level: 'staff', __bypassBatchLock: true },
      });
      // Now release op1 to attempt its conditional UPDATE
      releaseBarrier();
      return result;
    })();

    const [op1Result, op2Result] = await Promise.allSettled([op1Promise, op2Promise]);
    assert.equal(op2Result.status, 'fulfilled', 'Op2 must succeed');
    assert.equal(op1Result.status, 'rejected', 'Op1 must be rejected by conditional statement update check');
    assert.equal(op1Result.reason?.status, 409, 'Op1 failure must have status 409');
    assert.match(op1Result.reason?.message, /konflik pencocokan baris mutasi/i);
  }

  // ─── Subtest 3: Manual match bersamaan dengan auto-match ──────────────────
  // Statement line yang sama dicoba dicocokkan secara manual dan auto-match secara paralel.
  {
    const batch = await createBatch('AUTO-MAN-1');
    const line = await importLine(batch.id, 'CONC-AUTO-REF-1', 600000);
    // Tx for auto-match (matching reference)
    const txAuto = await insertEligibleTx('AUTO-REF-1', 600000);
    // Tx for manual match
    const txManual = await insertEligibleTx('MAN-REF-1', 600000);

    const manualReq = request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: txManual.id,
        notes: 'Concurrent manual match with auto-match',
      }),
    });

    const { autoMatchBatchStatements } = await import('./repository.js');
    const autoReq = autoMatchBatchStatements(batch.id, { id: 35, role: 'penerimaan', level: 'staff' });

    const [manualRes, autoRes] = await Promise.all([manualReq, autoReq]);
    // Exactly one operation must have claimed the line:
    // If manual succeeded (status 200), auto-match should report 0 new matches
    // If auto-match claimed it (new_matches: 1), manual match would return 409
    const manualStatus = manualRes.status;
    const autoMatches = autoRes.new_matches;

    if (manualStatus === 200) {
      assert.equal(autoMatches, 0, 'Auto-match must find 0 new matches when manual match won');
    } else {
      assert.equal(manualStatus, 409, 'Manual match must return 409 when auto-match won');
      assert.equal(autoMatches, 1, 'Auto-match must have matched the line');
    }

    // Verify exactly ONE match record exists for this line
    const matchCount = await db.get('SELECT COUNT(*) as c FROM penerimaan_matches WHERE statement_line_id = $1', [line.id]);
    assert.equal(Number(matchCount.c), 1, 'Only one match record should exist for the line');
  }

  // ─── Subtest 4: Match bersamaan dengan close batch ────────────────────────
  // Close batch dikirim bersamaan dengan match statement line.
  {
    const batch = await createBatch('CLOSE-CONC-1');
    const line = await importLine(batch.id, 'CONC-CLOSE-LINE-1', 400000);
    const tx = await insertEligibleTx('CLOSE-TX-1', 400000);

    // Close batch (with notes so it is permitted whether discrepancy exists or not)
    const closeReq = request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
      method: 'POST',
      token: leaderToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Concurrent close attempt with valid reason' }),
    });

    const matchReq = request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_id: tx.id,
        notes: 'Match concurrent with close',
      }),
    });

    const [closeRes, matchRes] = await Promise.all([closeReq, matchReq]);
    // If close succeeded first (200), match must be rejected with 400 (batch closed)
    // If match succeeded first (200), close closes the batch afterward (200)
    // In neither case is a match allowed to be created while status is closed
    const batchFinal = await db.get('SELECT status FROM penerimaan_reconciliation_batches WHERE id = $1', [batch.id]);
    assert.equal(batchFinal.status, 'closed', 'Batch must end in closed state');

    if (matchRes.status === 400) {
      assert.match((await matchRes.json()).message, /telah ditutup/i);
    }
  }
});

test('Group-Level Unmatch: split and merge clean reversal without unbalanced partial relations', async () => {
  const staffToken = tokenFor({ id: 37, role: 'penerimaan', level: 'staff' });
  const db = await getDb();

  async function createBatch(suffix) {
    const res = await request('/api/penerimaan/rekonsiliasi/batches', {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'bank_transfer',
        account_name: `BSI Group Unmatch ${suffix}`,
        account_number: `33334444${suffix}`,
        period_start: '2026-09-01T00:00:00.000Z',
        period_end: '2026-09-30T23:59:59.999Z',
      }),
    });
    assert.equal(res.status, 201);
    return (await res.json()).data;
  }

  async function importLine(batchId, ref, amount) {
    const csv = `tanggal,referensi,uraian,nominal\n2026-09-17,${ref},Mutasi Group Unmatch,${amount}`;
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'unm.csv');
    const res = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/import`, {
      method: 'POST',
      token: staffToken,
      body: form,
    });
    assert.equal(res.status, 200);
    const detail = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}`, { token: staffToken });
    return (await detail.json()).data.statement_lines.find((l) => l.reference_number === ref);
  }

  async function insertEligibleTx(ref, amount) {
    const txNum = `TRX-UNM-${ref}-${Date.now()}`;
    const rcptNum = `BSZ-UNM-${ref}-${Date.now()}`;
    await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ($1, $2, 'bank_transfer', 'digital', $3, 'Donatur Group Unmatch', 'zakat_maal', $4, 0, $4, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [txNum, rcptNum, `UNM-${ref}`, amount]
    );
    return db.get('SELECT id, workflow_version FROM penerimaan_transactions WHERE transaction_number = $1', [txNum]);
  }

  // ─── A. Split Group Unmatch ────────────────────────────────────────────────
  // 1 baris mutasi (1.000.000) split ke 2 transaksi (600.000 + 400.000).
  // Saat salah satu match di-unmatch, seluruh relasi split harus dihapus,
  // kedua transaksi kembali ke Menunggu Rekonsiliasi, dan mutasi kembali ke unmatched.
  {
    const batch = await createBatch('SPLIT-1');
    const line = await importLine(batch.id, 'UNM-SPLIT-LINE', 1000000);
    const txA = await insertEligibleTx('SPLIT-TX-A', 600000);
    const txB = await insertEligibleTx('SPLIT-TX-B', 400000);

    const matchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_id: line.id,
        transaction_ids: [txA.id, txB.id],
        notes: 'Split 1 line into 2 transactions',
      }),
    });
    assert.equal(matchRes.status, 200);
    const matchData = await matchRes.json();
    const matchId = matchData.data?.match_id || matchData.data?.match_ids?.[0];
    assert.ok(matchId);

    // Verify 2 matches created in penerimaan_matches
    const matchesBefore = await db.all('SELECT * FROM penerimaan_matches WHERE statement_line_id = $1', [line.id]);
    assert.equal(matchesBefore.length, 2);

    // Unmatch using matchId
    const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchId}`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Batalkan split settlement group' }),
    });
    assert.equal(unmatchRes.status, 200);

    // Verify ALL matches for this statement line are deleted
    const matchesAfter = await db.all('SELECT * FROM penerimaan_matches WHERE statement_line_id = $1', [line.id]);
    assert.equal(matchesAfter.length, 0, 'No partial split matches should remain');

    // Verify statement line is reverted
    const lineAfter = await db.get('SELECT status, matched_transaction_id FROM penerimaan_statement_lines WHERE id = $1', [line.id]);
    assert.equal(lineAfter.status, 'unmatched');
    assert.equal(lineAfter.matched_transaction_id, null);

    // Verify both transactions are reverted
    const txAAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txA.id]);
    const txBAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txB.id]);
    assert.equal(txAAfter.status, 'Menunggu Rekonsiliasi');
    assert.equal(txAAfter.reconciliation_batch_id, null);
    assert.equal(txBAfter.status, 'Menunggu Rekonsiliasi');
    assert.equal(txBAfter.reconciliation_batch_id, null);
  }

  // ─── B. Merge Group Unmatch ────────────────────────────────────────────────
  // 2 baris mutasi (300.000 + 700.000) dimerge ke 1 transaksi (1.000.000).
  // Saat unmatch dipanggil pada salah satu match, seluruh relasi merge harus dihapus,
  // transaksi kembali ke Menunggu Rekonsiliasi, dan kedua mutasi kembali ke unmatched.
  {
    const batch = await createBatch('MERGE-1');
    const lineA = await importLine(batch.id, 'UNM-MERGE-LINE-A', 300000);
    const lineB = await importLine(batch.id, 'UNM-MERGE-LINE-B', 700000);
    const txC = await insertEligibleTx('MERGE-TX-C', 1000000);

    const matchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statement_line_ids: [lineA.id, lineB.id],
        transaction_id: txC.id,
        notes: 'Merge 2 lines into 1 transaction',
      }),
    });
    assert.equal(matchRes.status, 200);
    const matchData = await matchRes.json();
    const matchId = matchData.data?.match_id || matchData.data?.match_ids?.[0];
    assert.ok(matchId);

    // Verify 2 matches created in penerimaan_matches for txC
    const matchesBefore = await db.all('SELECT * FROM penerimaan_matches WHERE transaction_id = $1', [txC.id]);
    assert.equal(matchesBefore.length, 2);

    // Unmatch using matchId
    const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchId}`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Batalkan merge settlement group' }),
    });
    assert.equal(unmatchRes.status, 200);

    // Verify ALL matches for this transaction are deleted
    const matchesAfter = await db.all('SELECT * FROM penerimaan_matches WHERE transaction_id = $1', [txC.id]);
    assert.equal(matchesAfter.length, 0, 'No partial merge matches should remain');

    // Verify both statement lines are reverted
    const lineAAfter = await db.get('SELECT status, matched_transaction_id FROM penerimaan_statement_lines WHERE id = $1', [lineA.id]);
    const lineBAfter = await db.get('SELECT status, matched_transaction_id FROM penerimaan_statement_lines WHERE id = $1', [lineB.id]);
    assert.equal(lineAAfter.status, 'unmatched');
    assert.equal(lineAAfter.matched_transaction_id, null);
    assert.equal(lineBAfter.status, 'unmatched');
    assert.equal(lineBAfter.matched_transaction_id, null);

    // Verify transaction is reverted
    const txCAfter = await db.get('SELECT status, reconciliation_batch_id FROM penerimaan_transactions WHERE id = $1', [txC.id]);
    assert.equal(txCAfter.status, 'Menunggu Rekonsiliasi');
    assert.equal(txCAfter.reconciliation_batch_id, null);
  }
});

test('Validation Guards: duplicate IDs rejection and BigInt arithmetic', async () => {
  const staffToken = tokenFor({ id: 38, role: 'penerimaan', level: 'staff' });
  const db = await getDb();

  const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'bank_transfer',
      account_name: 'BSI Dup Validation',
      account_number: '7777888800',
      period_start: '2026-09-01T00:00:00.000Z',
      period_end: '2026-09-30T23:59:59.999Z',
    }),
  });
  const batch = (await batchRes.json()).data;

  // Import line
  const csv = 'tanggal,referensi,uraian,nominal\n2026-09-18,DUP-LINE-1,Mutasi Dup Test,500000';
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'dup.csv');
  await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
    method: 'POST',
    token: staffToken,
    body: form,
  });
  const detail = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
  const line = (await detail.json()).data.statement_lines[0];

  // Insert tx
  await db.run(
    `INSERT INTO penerimaan_transactions (
       transaction_number, receipt_number, channel, channel_category, provider_ref,
       muzakki_name, fund_type, amount, fee_amount, net_amount, status,
       is_manual, is_flagged, workflow_version, created_at, updated_at
     ) VALUES ('TRX-DUP-1', 'BSZ-DUP-1', 'bank_transfer', 'digital', 'DUP-REF-1', 'Donatur Dup', 'infak', 500000, 0, 500000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  const tx = await db.get('SELECT id FROM penerimaan_transactions WHERE provider_ref = $1', ['DUP-REF-1']);

  // 1. Duplicate statement_line_ids
  const dupLineRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_ids: [line.id, line.id],
      transaction_id: tx.id,
      notes: 'Testing duplicate line IDs',
    }),
  });
  assert.equal(dupLineRes.status, 400);
  assert.match((await dupLineRes.json()).message, /duplikasi.*baris mutasi/i);

  // 2. Duplicate transaction_ids
  const dupTxRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
    method: 'POST',
    token: staffToken,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      statement_line_id: line.id,
      transaction_ids: [tx.id, tx.id],
      notes: 'Testing duplicate transaction IDs',
    }),
  });
  assert.equal(dupTxRes.status, 400);
  assert.match((await dupTxRes.json()).message, /duplikasi.*transaksi/i);
});

test('Savepoint Cleanup: forced rollback followed by successful transaction leaves no lingering state', async () => {
  const db = await getDb();
  const failRef = `SP-FAIL-${Date.now()}`;
  const successRef = `SP-SUCCESS-${Date.now()}`;

  // 1. Force first transaction to rollback
  await assert.rejects(
    async () => {
      await withTransaction(null, async (txDb) => {
        await txDb.run(
          `INSERT INTO penerimaan_transactions (
             transaction_number, receipt_number, channel, channel_category, provider_ref,
             muzakki_name, fund_type, amount, fee_amount, net_amount, status,
             is_manual, is_flagged, workflow_version, created_at, updated_at
           ) VALUES ('TRX-SP-F', 'BSZ-SP-F', 'bank_transfer', 'digital', $1, 'Donatur Fail', 'infak', 100000, 0, 100000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [failRef]
        );
        throw new Error('Forced transaction rollback for savepoint cleanup test');
      });
    },
    /Forced transaction rollback/
  );

  // Verify first transaction is completely absent
  const rolledBackRow = await db.get('SELECT id FROM penerimaan_transactions WHERE provider_ref = $1', [failRef]);
  assert.equal(Boolean(rolledBackRow), false, 'First transaction row must not exist in DB');

  // 2. Run second transaction that succeeds
  await withTransaction(null, async (txDb) => {
    await txDb.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ('TRX-SP-S', 'BSZ-SP-S', 'bank_transfer', 'digital', $1, 'Donatur Success', 'infak', 200000, 0, 200000, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [successRef]
    );
  });

  // Verify second transaction row was committed
  const committedRow = await db.get('SELECT id, amount FROM penerimaan_transactions WHERE provider_ref = $1', [successRef]);
  assert.ok(committedRow, 'Second transaction row must exist in DB');
  assert.equal(Number(committedRow.amount), 200000);

  // 3. Verify clean state in third transaction
  await withTransaction(null, async (txDb) => {
    const count = await txDb.get('SELECT COUNT(*) as c FROM penerimaan_transactions WHERE provider_ref IN ($1, $2)', [failRef, successRef]);
    assert.equal(Number(count.c), 1, 'Only the second transaction should exist');
  });

  // Clean up
  await db.run('DELETE FROM penerimaan_transactions WHERE provider_ref = $1', [successRef]);
});

test('Multi-Batch Lifecycle & Queue Cleanup: create and resolve multiple batches with zero lock leaks', async () => {
  const { getBatchLockQueueSize } = await import('./repository.js');
  const db = await getDb();
  const staffToken = tokenFor({ id: 91, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 92, role: 'penerimaan', level: 'leader' });

  // 1. Initial lock queue size must be 0
  assert.equal(getBatchLockQueueSize(), 0, 'Initial lock queue size must be 0 before starting batches');

  const batchIndices = [1, 2, 3, 4, 5];
  const createdBatchIds = [];
  const createdTxIds = [];

  try {
    // 2. Create transactions, batches, and run full reconciliation lifecycles across distinct batches
    for (const idx of batchIndices) {
      const txRef = `MULTI-TX-CLEANUP-${idx}`;
      const amount = 100000 * idx;

      // Insert matching transaction
      const txRes = await db.run(
        `INSERT INTO penerimaan_transactions (
           transaction_number, receipt_number, channel, channel_category, provider_ref,
           muzakki_name, fund_type, amount, fee_amount, net_amount, status,
           is_manual, is_flagged, workflow_version, created_at, updated_at
         ) VALUES ($1, $2, 'bank_transfer', 'digital', $3, 'Donatur Multi', 'zakat', $4, 0, $4, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [`TRX-MULTI-${idx}`, `BSZ-MULTI-${idx}`, txRef, amount]
      );
      createdTxIds.push(txRes.lastID);

      // Create batch
      const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
        method: 'POST',
        token: staffToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'bank_transfer',
          account_name: `BSI Multi Batch ${idx}`,
          account_number: `554433220${idx}`,
          period_start: '2026-09-01T00:00:00.000Z',
          period_end: '2026-09-30T23:59:59.999Z',
          notes: `Testing multi-batch cleanup for index ${idx}`,
        }),
      });
      assert.equal(batchRes.status, 201);
      const batch = (await batchRes.json()).data;
      createdBatchIds.push(batch.id);

      // Import CSV which triggers auto-match
      const csvContent = `tanggal,referensi,uraian,nominal\n2026-09-10,${txRef},Donasi Zakat Multi ${idx},${amount}`;
      const form = new FormData();
      form.append('file', new Blob([csvContent], { type: 'text/csv' }), `multi_${idx}.csv`);

      const importRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/import`, {
        method: 'POST',
        token: staffToken,
        body: form,
      });
      assert.equal(importRes.status, 200);

      // Verify batch got auto-matched
      const batchDetailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}`, { token: staffToken });
      const batchDetail = (await batchDetailRes.json()).data;
      assert.equal(batchDetail.status, 'matched');
      assert.equal(batchDetail.total_matched_count, 1);
      assert.equal(batchDetail.discrepancy_amount, '0');

      // For batches 1 and 2: unmatch, then re-match to exercise full lifecycle
      if (idx <= 2) {
        const matchRow = await db.get('SELECT id, statement_line_id, transaction_id FROM penerimaan_matches WHERE transaction_id = $1', [txRes.lastID]);
        assert.ok(matchRow);

        const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/unmatch/${matchRow.id}`, {
          method: 'POST',
          token: staffToken,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Lifecycle unmatch test' }),
        });
        assert.equal(unmatchRes.status, 200);

        const rematchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/match`, {
          method: 'POST',
          token: staffToken,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statement_line_id: matchRow.statement_line_id,
            transaction_id: matchRow.transaction_id,
            notes: 'Lifecycle rematch',
          }),
        });
        assert.equal(rematchRes.status, 200);
      }

      // Close batch
      const closeRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batch.id}/close`, {
        method: 'POST',
        token: leaderToken,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Multi batch lifecycle close' }),
      });
      assert.equal(closeRes.status, 200);
    }

    // 3. Verify that after all concurrent batches complete, lock queue is completely empty
    assert.equal(getBatchLockQueueSize(), 0, 'Batch lock queue must not retain any lingering lock promises');

    // 4. Verify all batches in DB are closed
    for (const bId of createdBatchIds) {
      const bRow = await db.get('SELECT status, discrepancy_amount FROM penerimaan_reconciliation_batches WHERE id = $1', [bId]);
      assert.equal(bRow.status, 'closed');
      assert.equal(Number(bRow.discrepancy_amount), 0);
    }
  } finally {
    // Clean up
    for (const bId of createdBatchIds) {
      await db.run('DELETE FROM penerimaan_matches WHERE statement_line_id IN (SELECT id FROM penerimaan_statement_lines WHERE batch_id = $1)', [bId]);
      await db.run('DELETE FROM penerimaan_statement_lines WHERE batch_id = $1', [bId]);
      await db.run('DELETE FROM penerimaan_reconciliation_batches WHERE id = $1', [bId]);
    }
    if (createdTxIds.length > 0) {
      await db.run(`DELETE FROM penerimaan_transactions WHERE id IN (${createdTxIds.join(',')})`);
    }
    assert.equal(getBatchLockQueueSize(), 0, 'Lock queue must remain 0 after cleanup');
  }
});

test('Large BigInt Nominal Precision: exactness across import, auto-match, unmatch, and close', async () => {
  const { toIntegerCents, fromIntegerCents } = await import('./repository.js');
  const db = await getDb();
  const staffToken = tokenFor({ id: 93, role: 'penerimaan', level: 'staff' });
  const leaderToken = tokenFor({ id: 94, role: 'penerimaan', level: 'leader' });

  // 1. Verify unit conversions on large and edge values
  assert.equal(toIntegerCents('50000000000.50'), 5000000000050n);
  assert.equal(toIntegerCents('50.000.000.000,50'), 5000000000050n);
  assert.equal(toIntegerCents('50.000.000.000'), 5000000000000n);
  assert.equal(toIntegerCents('75000000000'), 7500000000000n);
  assert.equal(fromIntegerCents(5000000000050n), 50000000000.5);
  assert.equal(fromIntegerCents(5000000000000n), 50000000000);
  assert.equal(fromIntegerCents(12500000000000n), 125000000000);

  // Large amounts: 50 Billion and 75 Billion
  const amount1 = 50000000000;
  const amount2 = 75000000000;
  const totalAmount = 125000000000;

  const ref1 = 'BIG-REF-001';
  const ref2 = 'BIG-REF-002';

  let batchId;
  let tx1Id;
  let tx2Id;

  try {
    // 2. Pre-insert Transaction 1 before import to verify auto-match during importStatementLines
    const tx1Res = await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ('TRX-BIG-1', 'BSZ-BIG-1', 'bank_transfer', 'digital', $1, 'Donatur Korporasi A', 'wakaf', $2, 0, $2, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [ref1, amount1]
    );
    tx1Id = tx1Res.lastID;

    // Create batch
    const batchRes = await request('/api/penerimaan/rekonsiliasi/batches', {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'bank_transfer',
        account_name: 'BSI Zakat Wakaf Korporasi',
        account_number: '9988776655',
        period_start: '2026-09-01T00:00:00.000Z',
        period_end: '2026-09-30T23:59:59.999Z',
        notes: 'Testing BigInt nominal precision',
      }),
    });
    assert.equal(batchRes.status, 201);
    const batch = (await batchRes.json()).data;
    batchId = batch.id;

    // 3. Import statement lines with large nominals
    const csvContent = `tanggal,referensi,uraian,nominal\n2026-09-10,${ref1},Wakaf Tunai Korporasi A,${amount1}\n2026-09-10,${ref2},Wakaf Tunai Korporasi B,${amount2}`;
    const form = new FormData();
    form.append('file', new Blob([csvContent], { type: 'text/csv' }), 'big_nominals.csv');

    const importRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/import`, {
      method: 'POST',
      token: staffToken,
      body: form,
    });
    assert.equal(importRes.status, 200);

    // Verify batch totals after import:
    // Line 1 was auto-matched with Tx1
    // Line 2 is unmatched
    const batchAfterImport = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    assert.equal(Number(batchAfterImport.total_expected_count), 2);
    assert.equal(Number(batchAfterImport.total_expected_amount), totalAmount);
    assert.equal(Number(batchAfterImport.total_matched_count), 1);
    assert.equal(Number(batchAfterImport.total_matched_amount), amount1);
    assert.equal(Number(batchAfterImport.discrepancy_amount), amount2);
    assert.equal(batchAfterImport.status, 'in_progress');

    // 4. Insert Transaction 2 and trigger explicit auto-match
    const tx2Res = await db.run(
      `INSERT INTO penerimaan_transactions (
         transaction_number, receipt_number, channel, channel_category, provider_ref,
         muzakki_name, fund_type, amount, fee_amount, net_amount, status,
         is_manual, is_flagged, workflow_version, created_at, updated_at
       ) VALUES ('TRX-BIG-2', 'BSZ-BIG-2', 'bank_transfer', 'digital', $1, 'Donatur Korporasi B', 'wakaf', $2, 0, $2, 'Menunggu Rekonsiliasi', 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [ref2, amount2]
    );
    tx2Id = tx2Res.lastID;

    const autoMatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/auto-match`, {
      method: 'POST',
      token: staffToken,
    });
    assert.equal(autoMatchRes.status, 200);
    const autoMatchData = (await autoMatchRes.json()).data;
    assert.equal(autoMatchData.new_matches, 1);
    assert.equal(autoMatchData.matched_count, 2);
    assert.equal(Number(autoMatchData.matched_amount), totalAmount);
    assert.equal(Number(autoMatchData.discrepancy_amount), 0);
    assert.equal(autoMatchData.status, 'matched');

    const batchAfterAutoMatch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    assert.equal(Number(batchAfterAutoMatch.total_matched_count), 2);
    assert.equal(Number(batchAfterAutoMatch.total_matched_amount), totalAmount);
    assert.equal(Number(batchAfterAutoMatch.discrepancy_amount), 0);
    assert.equal(batchAfterAutoMatch.status, 'matched');

    // 5. Test unmatch: unmatch Line 2 and verify BigInt totals recalculation
    const line2 = await db.get('SELECT id FROM penerimaan_statement_lines WHERE batch_id = $1 AND reference_number = $2', [batchId, ref2]);
    assert.ok(line2);
    const match2 = await db.get('SELECT id FROM penerimaan_matches WHERE statement_line_id = $1', [line2.id]);
    assert.ok(match2);

    const unmatchRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/unmatch/${match2.id}`, {
      method: 'POST',
      token: staffToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Koreksi unmatch nominal besar 75 Miliar' }),
    });
    assert.equal(unmatchRes.status, 200);

    const batchAfterUnmatch = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    assert.equal(Number(batchAfterUnmatch.total_matched_count), 1);
    assert.equal(Number(batchAfterUnmatch.total_matched_amount), amount1);
    assert.equal(Number(batchAfterUnmatch.discrepancy_amount), amount2);
    assert.equal(batchAfterUnmatch.status, 'in_progress');

    // 6. Test close: closing with discrepancy requires variance reason
    const closeFailRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/close`, {
      method: 'POST',
      token: leaderToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '' }),
    });
    assert.equal(closeFailRes.status, 400);

    const closeSuccessRes = await request(`/api/penerimaan/rekonsiliasi/batches/${batchId}/close`, {
      method: 'POST',
      token: leaderToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Selisih Rp 75 Miliar belum tercatat di mutasi bank pending konfirmasi' }),
    });
    assert.equal(closeSuccessRes.status, 200);

    const batchAfterClose = await db.get('SELECT * FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    assert.equal(batchAfterClose.status, 'closed');
    assert.equal(Number(batchAfterClose.discrepancy_amount), amount2);
    assert.equal(Number(batchAfterClose.total_matched_amount), amount1);
    assert.equal(batchAfterClose.notes, 'Selisih Rp 75 Miliar belum tercatat di mutasi bank pending konfirmasi');
  } finally {
    if (batchId) {
      await db.run('DELETE FROM penerimaan_matches WHERE statement_line_id IN (SELECT id FROM penerimaan_statement_lines WHERE batch_id = $1)', [batchId]);
      await db.run('DELETE FROM penerimaan_statement_lines WHERE batch_id = $1', [batchId]);
      await db.run('DELETE FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
    }
    if (tx1Id) await db.run('DELETE FROM penerimaan_transactions WHERE id = $1', [tx1Id]);
    if (tx2Id) await db.run('DELETE FROM penerimaan_transactions WHERE id = $1', [tx2Id]);
  }
});
