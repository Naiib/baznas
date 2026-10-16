import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-7-integration-test-secret';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const { getPenerimaanOverview } = await import('./repository.js');

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

test('GET /api/penerimaan/overview: rejects unauthenticated requests with 401', async () => {
  const res = await request('/api/penerimaan/overview');
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('GET /api/penerimaan/overview: rejects unauthorized role (surveyor) with 403', async () => {
  const token = tokenFor({ role: 'surveyor', division: 'Tim Asesmen & Survey Lapangan' });
  const res = await request('/api/penerimaan/overview', { token });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('GET /api/penerimaan/overview: accepts Staff Penerimaan, Leader Penerimaan, and Admin with 200', async () => {
  const staffToken = tokenFor({ role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'staff' });
  const leaderToken = tokenFor({ role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'leader' });
  const adminToken = tokenFor({ role: 'admin', division: 'Pimpinan & Super Admin', level: 'admin' });

  for (const token of [staffToken, leaderToken, adminToken]) {
    const res = await request('/api/penerimaan/overview', { token });
    assert.equal(res.status, 200, `Expected status 200 for token with role/division`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data);
    assert.ok(body.data.metrics);
  }
});

test('GET /api/penerimaan/overview: returns canonical metrics structure with explicit fields', async () => {
  const token = tokenFor({ role: 'penerimaan' });
  const res = await request('/api/penerimaan/overview?period=30d', { token });
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.success, true);
  const data = body.data;

  assert.equal(data.period, '30d');
  assert.ok(data.metrics, 'data.metrics must exist');
  assert.equal(typeof data.metrics.total_collected, 'string');
  assert.equal(typeof data.metrics.total_transactions, 'number');
  assert.equal(typeof data.metrics.validated_transaction_count, 'number', 'validated_transaction_count must be a number');
  assert.equal(typeof data.metrics.active_muzakki_count, 'number', 'active_muzakki_count must be a number');
  assert.equal(typeof data.metrics.pending_validation_count, 'number');
  assert.equal(typeof data.metrics.pending_approval_count, 'number');
  assert.equal(typeof data.metrics.unreconciled_count, 'number');
  assert.equal(typeof data.metrics.average_amount, 'string');
  assert.equal(typeof data.metrics.target_attainment_pct, 'number');
  assert.equal(typeof data.metrics.exception_count, 'number');

  assert.ok(Array.isArray(data.trend), 'trend must be an array');
  assert.ok(Array.isArray(data.fund_type_breakdown), 'fund_type_breakdown must be an array');
  assert.ok(Array.isArray(data.channel_breakdown), 'channel_breakdown must be an array');
  assert.ok(Array.isArray(data.action_queue), 'action_queue must be an array');
  assert.ok(Array.isArray(data.recent_activity), 'recent_activity must be an array');
});

test('getPenerimaanOverview: accurately aggregates transactions with custom period', async () => {
  const { open } = await import('sqlite');
  const sqlite3 = (await import('sqlite3')).default;
  const mem = await open({ filename: ':memory:', driver: sqlite3.Database });
  const adapt = (sql) => sql.replace(/\$\d+/g, '?').replace(/ILIKE/gi, 'LIKE');
  const testDb = {
    isPg: false,
    get: (sql, args = []) => mem.get(adapt(sql), args),
    all: (sql, args = []) => mem.all(adapt(sql), args),
    run: (sql, args = []) => mem.run(adapt(sql), args),
    exec: (sql) => mem.exec(sql),
  };

  await testDb.exec(`
    CREATE TABLE penerimaan_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_number TEXT UNIQUE NOT NULL,
      receipt_number TEXT,
      channel TEXT NOT NULL,
      channel_category TEXT DEFAULT 'digital',
      muzakki_name TEXT NOT NULL,
      fund_type TEXT DEFAULT 'zakat_maal',
      amount NUMERIC NOT NULL,
      fee_amount NUMERIC DEFAULT 0,
      net_amount NUMERIC NOT NULL,
      status TEXT DEFAULT 'Menunggu Validasi',
      is_flagged INTEGER DEFAULT 0,
      is_duplicate INTEGER DEFAULT 0,
      is_incomplete INTEGER DEFAULT 0,
      created_by_name TEXT,
      validated_at TEXT,
      approved_at TEXT,
      reconciled_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert mock transactions
  const now = new Date('2026-09-08T12:00:00Z');
  const d1 = new Date('2026-09-05T10:00:00Z').toISOString();
  const d2 = new Date('2026-09-06T11:00:00Z').toISOString();
  const d3 = new Date('2026-09-07T09:00:00Z').toISOString();
  const dOld = new Date('2026-07-01T09:00:00Z').toISOString(); // Outside 30d

  // 1. Validated transaction
  await testDb.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, created_at, validated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, ['TRX-001', 'bank_transfer', 'digital', 'Budi Santoso', 'zakat_maal', 2500000, 0, 2500000, 'Tervalidasi', d1, d1]);

  // 2. Pending validation transaction
  await testDb.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, ['TRX-002', 'qris', 'digital', 'Siti Rahma', 'infak', 150000, 0, 150000, 'Menunggu Validasi', d2]);

  // 3. High value pending approval transaction (same donor Budi Santoso)
  await testDb.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, is_flagged, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, ['TRX-003', 'bank_transfer', 'digital', 'Budi Santoso', 'zakat_maal', 15000000, 0, 15000000, 'Menunggu Approval', 1, d3]);

  // 4. Old transaction outside range
  await testDb.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, fund_type,
      amount, fee_amount, net_amount, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, ['TRX-OLD', 'counter_kasir', 'manual', 'Donatur Lama', 'sedekah', 50000, 0, 50000, 'Posted', dOld]);

  const overview = await getPenerimaanOverview({ period: '30d' }, testDb, now);

  assert.equal(overview.metrics.total_transactions, 3, 'Should only count 3 transactions in period');
  assert.equal(overview.metrics.total_collected, '17650000', 'Sum of amounts in period');
  assert.equal(overview.metrics.validated_transaction_count, 1, 'Only TRX-001 is validated');
  assert.equal(overview.metrics.active_muzakki_count, 2, 'Two unique donors: Budi Santoso and Siti Rahma');
  assert.equal(overview.metrics.pending_validation_count, 1, 'TRX-002 is waiting validation');
  assert.equal(overview.metrics.pending_approval_count, 1, 'TRX-003 is waiting approval');
  assert.equal(overview.metrics.exception_count, 1, 'TRX-003 is flagged');

  // Verify breakdowns
  const zakat = overview.fund_type_breakdown.find(f => f.fund_type === 'zakat_maal');
  assert.ok(zakat, 'zakat_maal breakdown should exist');
  assert.equal(zakat.amount, '17500000');

  await mem.close();
});
