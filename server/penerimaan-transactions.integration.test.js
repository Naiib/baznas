import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-8-integration-test-secret';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const { listPenerimaanTransactions, getPenerimaanTransactionById } = await import('./repository.js');

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
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

function tokenFor({ id = 10, role = 'penerimaan', division = 'Bidang Pengumpulan & ZIS', level = 'staff' } = {}) {
  return jwt.sign({ id, name: `User ${role}`, role, division, level }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('GET /api/penerimaan/transaksi: requires authentication (401)', async () => {
  const res = await request('/api/penerimaan/transaksi');
  assert.equal(res.status, 401);
});

test('GET /api/penerimaan/transaksi: rejects non-penerimaan role (403)', async () => {
  const token = tokenFor({ role: 'surveyor', division: 'Tim Asesmen' });
  const res = await request('/api/penerimaan/transaksi', { token });
  assert.equal(res.status, 403);
});

test('GET /api/penerimaan/transaksi: returns cursor-paginated list for authorized user', async () => {
  const db = await getDb();
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number LIKE 'TRX-TXTEST-%'");

  // Insert 3 test transactions
  for (let i = 1; i <= 3; i++) {
    await db.run(`
      INSERT INTO penerimaan_transactions (
        transaction_number, receipt_number, channel, channel_category,
        muzakki_name, fund_type, amount, fee_amount, net_amount, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)
    `, [
      `TRX-TXTEST-${i}`, `RCP-TXTEST-${i}`, 'bank_transfer', 'digital',
      `Muzakki Isolasi ${i}`, 'zakat_maal', 1000000 * i, 1000000 * i,
      i === 1 ? 'Menunggu Validasi' : 'Tervalidasi',
      `2026-09-0${i}T10:00:00Z`
    ]);
  }

  const token = tokenFor({ role: 'penerimaan' });
  const res = await request('/api/penerimaan/transaksi?search=TXTEST&limit=2', { token });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data);
  assert.equal(body.data.items.length, 2);
  assert.equal(body.data.has_more, true);
  assert.ok(body.data.next_cursor);
});

test('GET /api/penerimaan/transaksi: filters by search, status, and channel', async () => {
  const token = tokenFor({ role: 'penerimaan' });

  // Filter by status=Menunggu Validasi and search=TXTEST
  const res = await request('/api/penerimaan/transaksi?search=TXTEST&status=Menunggu%20Validasi', { token });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.items.length, 1);
  assert.equal(body.data.items[0].transaction_number, 'TRX-TXTEST-1');

  // Filter by search specific
  const searchRes = await request('/api/penerimaan/transaksi?search=TRX-TXTEST-2', { token });
  assert.equal(searchRes.status, 200);
  const searchBody = await searchRes.json();
  assert.equal(searchBody.data.items.length, 1);
  assert.equal(searchBody.data.items[0].transaction_number, 'TRX-TXTEST-2');
});

test('GET /api/penerimaan/transaksi/:id: returns full transaction detail', async () => {
  const db = await getDb();
  const firstTx = await db.get('SELECT id FROM penerimaan_transactions WHERE transaction_number = $1', ['TRX-TXTEST-1']);
  assert.ok(firstTx, 'Transaction TRX-TXTEST-1 must exist');

  const token = tokenFor({ role: 'penerimaan' });
  const res = await request(`/api/penerimaan/transaksi/${firstTx.id}`, { token });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.transaction_number, 'TRX-TXTEST-1');
  assert.equal(body.data.status, 'Menunggu Validasi');
  assert.ok(Array.isArray(body.data.approvals));

  // Clean up
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number LIKE 'TRX-TXTEST-%'");
});

test('GET /api/penerimaan/transaksi/:id: returns 404 for non-existent transaction', async () => {
  const token = tokenFor({ role: 'penerimaan' });
  const res = await request('/api/penerimaan/transaksi/999999', { token });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('POST /api/penerimaan/transaksi/bulk-validate: validates only policy-eligible transactions', async () => {
  const db = await getDb();
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number LIKE 'TRX-BVTEST-%'");
  await db.run('DELETE FROM penerimaan_settings');

  // 1. Eligible: Menunggu Validasi, 5jt, not flagged
  const res1 = await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, is_flagged, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'Menunggu Validasi', 0, CURRENT_TIMESTAMP)
    RETURNING id
  `, ['TRX-BVTEST-1', 'bank_transfer', 'digital', 'Muzakki BV 1', 'zakat_maal', 5000000, 5000000]);

  // 2. Ineligible (high amount >= 10M): Menunggu Validasi, 15jt
  const res2 = await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, is_flagged, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'Menunggu Validasi', 0, CURRENT_TIMESTAMP)
    RETURNING id
  `, ['TRX-BVTEST-2', 'bank_transfer', 'digital', 'Muzakki BV 2', 'zakat_maal', 15000000, 15000000]);

  // 3. Ineligible (flagged)
  const res3 = await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, is_flagged, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'Menunggu Validasi', 1, CURRENT_TIMESTAMP)
    RETURNING id
  `, ['TRX-BVTEST-3', 'bank_transfer', 'digital', 'Muzakki BV 3', 'zakat_maal', 2000000, 2000000]);

  const id1 = res1.lastID || (await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-BVTEST-1'"))?.id;
  const id2 = res2.lastID || (await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-BVTEST-2'"))?.id;
  const id3 = res3.lastID || (await db.get("SELECT id FROM penerimaan_transactions WHERE transaction_number = 'TRX-BVTEST-3'"))?.id;

  const token = tokenFor({ role: 'penerimaan' });
  const res = await request('/api/penerimaan/transaksi/bulk-validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction_ids: [id1, id2, id3],
      notes: 'Validasi massal test',
    }),
    token,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.validated_count, 1);
  assert.equal(body.data.failed_count, 2);

  // Check in DB
  const row1 = await db.get('SELECT status FROM penerimaan_transactions WHERE id = $1', [id1]);
  assert.equal(row1.status, 'Menunggu Rekonsiliasi');

  const row2 = await db.get('SELECT status FROM penerimaan_transactions WHERE id = $1', [id2]);
  assert.equal(row2.status, 'Menunggu Validasi');

  // Clean up
  await db.run("DELETE FROM penerimaan_transactions WHERE transaction_number LIKE 'TRX-BVTEST-%'");
});
