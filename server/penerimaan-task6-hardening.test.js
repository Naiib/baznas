import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'task-6-hardening-test-secret';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');
const {
  getPenerimaanOverview,
  listPenerimaanTransactions,
  getPenerimaanReportTransactions,
} = await import('./repository.js');
const { normalizeReportFilters } = await import('./penerimaan-report-query.js');
const { normalizeAccessActor, requireAnyRole } = await import('./access-policy.js');

let server;
let baseUrl;

before(async () => {
  await initDb();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function tokenFor(overrides = {}) {
  return jwt.sign({ id: 601, name: 'Task 6 User', role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'staff', ...overrides }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('custom Penerimaan periods require real calendar dates in ascending order', async () => {
  const db = await getDb();
  await assert.rejects(
    getPenerimaanOverview({ period: 'custom', start_date: '2026-02-30', end_date: '2026-03-01' }, db),
    (error) => error.status === 422 && error.code === 'INVALID_PENERIMAAN_PERIOD'
  );
  await assert.rejects(
    getPenerimaanOverview({ period: 'custom', start_date: '2026-09-10', end_date: '2026-09-01' }, db),
    (error) => error.status === 422 && error.code === 'INVALID_PENERIMAAN_PERIOD'
  );
  assert.throws(
    () => normalizeReportFilters({ period: 'custom', start_date: '2026-02-30', end_date: '2026-03-01' }),
    (error) => error.status === 422
  );
  assert.throws(
    () => normalizeReportFilters({ period: '30d', start_date: '2026-02-30', end_date: '2026-03-01' }),
    (error) => error.status === 422 && error.code === 'INVALID_PENERIMAAN_PERIOD'
  );
  assert.throws(
    () => normalizeReportFilters({ period: '30d', start_date: '2026-09-10', end_date: '2026-09-01' }),
    (error) => error.status === 422 && error.code === 'INVALID_PENERIMAAN_PERIOD'
  );

  const response = await request('/api/penerimaan/laporan?period=30d&start_date=2026-02-30&end_date=2026-03-01', {
    token: tokenFor(),
    headers: { 'x-correlation-id': 'TASK6-INVALID-PERIOD' },
  });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, 'INVALID_PENERIMAAN_PERIOD');
  assert.equal(body.correlation_id, 'TASK6-INVALID-PERIOD');
});

test('transaction list and report DTOs omit donor contact, bank, and evidence secrets', async () => {
  const db = await getDb();
  const marker = `TASK6-PII-${Date.now()}`;
  const inserted = await db.run(`
    INSERT INTO penerimaan_transactions (
      transaction_number, channel, channel_category, muzakki_name, muzakki_phone, muzakki_email,
      fund_type, amount, fee_amount, net_amount, status, evidence_url, bank_name, bank_account_number,
      provider_ref, created_at
    ) VALUES ($1, 'bank_transfer', 'digital', 'Task 6 Donor', '08123456789', 'donor-task6@example.test',
      'zakat_maal', 1000, 0, 1000, 'Posted', '/uploads/task6-private.pdf', 'Secret Bank', '1234567890',
      'TASK6-PII-REF', CURRENT_TIMESTAMP) RETURNING id`, [marker]);
  try {
    const list = await listPenerimaanTransactions({ search: marker }, db);
    const listRow = list.items[0];
    for (const field of ['muzakki_phone', 'muzakki_email', 'bank_name', 'bank_account_number', 'evidence_url']) {
      assert.equal(Object.hasOwn(listRow, field), false, `list must omit ${field}`);
    }

    const report = await getPenerimaanReportTransactions(db, { search: marker });
    const reportRow = report[0];
    for (const field of ['muzakki_phone', 'muzakki_email', 'bank_name', 'bank_account_number', 'evidence_url']) {
      assert.equal(Object.hasOwn(reportRow, field), false, `report must omit ${field}`);
    }
  } finally {
    await db.run('DELETE FROM penerimaan_transactions WHERE id = $1', [inserted.lastID]);
  }
});

test('Penerimaan 5xx responses are generic and carry a correlation id', async () => {
  const original = app.locals.dataAccessRepository.getPenerimaanOverview;
  app.locals.dataAccessRepository.getPenerimaanOverview = async () => {
    throw new Error('database password leaked by an internal failure');
  };
  try {
    const response = await request('/api/penerimaan/overview', {
      token: tokenFor(),
      headers: { 'x-correlation-id': 'TASK6-CORRELATION' },
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.message, 'Terjadi kesalahan sistem.');
    assert.equal(body.message.includes('database password'), false);
    assert.equal(body.correlation_id, 'TASK6-CORRELATION');
    assert.equal(response.headers.get('x-correlation-id'), 'TASK6-CORRELATION');
  } finally {
    app.locals.dataAccessRepository.getPenerimaanOverview = original;
  }
});

test('backend access normalization matches administrator and division representations', () => {
  assert.equal(normalizeAccessActor({ role: 'PENYALURAN', level: 'ADMIN' }).isAdmin, true);
  assert.equal(normalizeAccessActor({ role: 'staff', division: 'Bidang Pengumpulan & ZIS' }).isPenerimaan, true);

  const middleware = requireAnyRole('admin', 'penerimaan');
  const response = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json() {} };
  let nextCalled = false;
  middleware({ user: { role: 'STAFF', division: 'Bidang Pengumpulan & ZIS' } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
