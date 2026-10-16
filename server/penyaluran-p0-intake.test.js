import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { newDb } from 'pg-mem';
import { createP0Mustahik } from './penyaluran-p0/intake-service.js';
import { p0FlagGate, registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';

async function database() {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const Pool = memory.adapters.createPg().Pool;
  const pool = new Pool();
  const tableNames = ['mustahik', 'applications', 'activity_logs', 'p0_idempotency_keys'];
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    let snapshot;
    client.query = async (text, params = []) => {
      const command = String(text).trim().toUpperCase();
      if (command === 'BEGIN') {
        snapshot = {};
        for (const table of tableNames) snapshot[table] = (await pool.query(`SELECT * FROM ${table}`)).rows;
      }
      const result = await originalQuery(text, params);
      if (command === 'ROLLBACK' && snapshot) {
        for (const table of [...tableNames].reverse()) {
          const ids = snapshot[table].map((row) => row.id);
          if (ids.length) await pool.query(`DELETE FROM ${table} WHERE id NOT IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids);
          else await pool.query(`DELETE FROM ${table}`);
          for (const row of snapshot[table]) {
            const columns = Object.keys(row);
            const present = await pool.query(`SELECT id FROM ${table} WHERE id=$1`, [row.id]);
            if (!present.rows.length) await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, columns.map((column) => row[column]));
          }
        }
        snapshot = null;
      }
      if (command === 'COMMIT') snapshot = null;
      return result;
    };
    return client;
  };
  const db = {
    isPg: true,
    pool,
    async query(text, params = []) { return pool.query(text, params); },
    async get(text, params = []) { const result = await this.query(text, params); return result.rows?.[0] || null; },
    async all(text, params = []) { const result = await this.query(text, params); return result.rows || []; },
    async run(text, params = []) { const result = await this.query(text, params); return { rowCount: result.rowCount, rows: result.rows || [], lastID: result.rows?.[0]?.id ?? null }; },
    async exec(text) { return this.query(text); },
  };
  await db.exec(`
    CREATE TABLE mustahik (
      id SERIAL PRIMARY KEY, file_no TEXT UNIQUE, received_date TEXT, name TEXT NOT NULL,
      applicant_status TEXT, beneficiary_name TEXT, nik TEXT, phone TEXT, address TEXT,
      monthly_income NUMERIC DEFAULT 0, monthly_expense NUMERIC DEFAULT 0, remaining_income NUMERIC DEFAULT 0,
      family_dependents INTEGER DEFAULT 0, beneficiary_count INTEGER DEFAULT 1,
      marital_status TEXT, pob TEXT, occupation TEXT, work_place TEXT, education_level TEXT,
      rt_rw TEXT, kelurahan TEXT, kecamatan TEXT, kabupaten_kota TEXT, province TEXT,
      house_ownership TEXT, asnaf TEXT DEFAULT 'Fakir Miskin', fund_source TEXT, distribution_purpose TEXT,
      recommended_amount NUMERIC DEFAULT 0, notes TEXT,
      parent_occupation TEXT, payment_method TEXT, bank_name TEXT, bank_account_name TEXT, kk_number TEXT,
      application_count INTEGER DEFAULT 1, program TEXT,
      request_title TEXT, status TEXT, workflow_version INTEGER NOT NULL DEFAULT 0,
      workflow_mode TEXT NOT NULL DEFAULT 'legacy', created_by_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE applications (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id),
      application_number TEXT, program TEXT, request_title TEXT, status TEXT, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE activity_logs (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id), actor_id INTEGER NOT NULL,
      actor_name TEXT NOT NULL, actor_role TEXT NOT NULL, actor_level TEXT NOT NULL, actor_division TEXT NOT NULL,
      action_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, old_status TEXT, new_status TEXT,
      correlation_id UUID, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE p0_idempotency_keys (
      id SERIAL PRIMARY KEY, actor_id INTEGER NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
      response_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT p0_idempotency_actor_key UNIQUE (actor_id, idempotency_key)
    );
  `);
  return db;
}

const actor = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const payload = () => ({ name: 'Siti Aminah', nik: '3273010101010001', phone: '081234567890', address: 'Jalan Mawar', program: 'Kemanusiaan', request_title: 'Bantuan usaha' });
const meta = (key = 'intake-1') => ({ idempotency_key: key, correlation_id: '11111111-1111-4111-8111-111111111111' });

test('canonical intake is server-owned P0 data with one immutable create audit', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  const result = await createP0Mustahik(payload(), { db, actor }, meta());
  assert.equal(result.data.workflow_mode, 'p0');
  assert.equal(result.data.status, 'Diajukan');
  assert.equal(result.data.workflow_version, 0);
  const row = await db.get('SELECT * FROM mustahik WHERE id=$1', [result.data.id]);
  assert.equal(row.created_by_id, actor.id);
  assert.equal(row.workflow_mode, 'p0');
  assert.equal(row.status, 'Diajukan');
  assert.equal(await db.get("SELECT COUNT(*) AS count FROM applications WHERE mustahik_id=$1", [row.id]).then((r) => Number(r.count)), 1);
  assert.equal(await db.get("SELECT COUNT(*) AS count FROM activity_logs WHERE mustahik_id=$1 AND action_type='p0_intake_created'", [row.id]).then((r) => Number(r.count)), 1);
  assert.equal(await db.get("SELECT COUNT(*) AS count FROM p0_idempotency_keys WHERE actor_id=$1", [actor.id]).then((r) => Number(r.count)), 1);
  assert.doesNotMatch(JSON.stringify(result), /3273010101010001|081234567890/);
});

test('forbidden browser claims, disabled flag, and missing fields have zero side effects', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  await assert.rejects(createP0Mustahik({ ...payload(), workflow_mode: 'legacy' }, { db, actor }, meta('forbidden')), (error) => error.code === 'FIELD_FORBIDDEN' && error.status === 422);
  await assert.rejects(createP0Mustahik(payload(), { db, actor, p0Enabled: false }, meta('disabled')), (error) => error.code === 'P0_WORKFLOW_DISABLED' && error.status === 503);
  await assert.rejects(createP0Mustahik({ program: 'Kemanusiaan' }, { db, actor }, meta('invalid')), (error) => error.status === 422);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 0);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM applications')).count), 0);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM activity_logs')).count), 0);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM p0_idempotency_keys')).count), 0);
});

test('identical key replays and changed payload conflicts without another case', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  const first = await createP0Mustahik(payload(), { db, actor }, meta('replay'));
  const replay = await createP0Mustahik(payload(), { db, actor }, meta('replay'));
  assert.equal(replay.replayed, true);
  assert.equal(replay.data.id, first.data.id);
  await assert.rejects(createP0Mustahik({ ...payload(), program: 'Pendidikan' }, { db, actor }, meta('replay')), (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.status === 409);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 1);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM activity_logs')).count), 1);
});

test('audit failure rolls back case, application, and idempotency reservation', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  await assert.rejects(
    createP0Mustahik(payload(), {
      db,
      actor,
      repository: { insertActivity: async () => { throw new Error('audit failure'); } },
    }, meta('rollback')),
    /audit failure/,
  );
  for (const table of ['mustahik', 'applications', 'activity_logs', 'p0_idempotency_keys']) {
    assert.equal(Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count), 0, table);
  }
});

test('canonical route is flag-gated and uses only authenticated req.user', async (t) => {
  const app = express();
  app.use(express.json());
  let calls = 0;
  const routeActor = { id: 9, name: 'Dewi', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = routeActor; next(); },
    isEnabled: () => false,
    services: { createP0Mustahik: async () => { calls += 1; return { success: true, data: {} }; } },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/penyaluran/mustahik`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'flagged' }, body: JSON.stringify({ status: 'Diajukan' }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'P0_WORKFLOW_DISABLED');
  assert.equal(calls, 0);
});

test('canonical route returns 201/200 from service and never accepts body actor claims', async (t) => {
  const app = express();
  app.use(express.json());
  const seen = [];
  const routeActor = { id: 12, name: 'Budi', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = routeActor; next(); },
    isEnabled: true,
    services: {
      createP0Mustahik: async (body, context, metadata) => {
        seen.push({ body, context, metadata });
        return { success: true, data: { id: 1 } };
      },
    },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/penyaluran/mustahik`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'route-1' },
    body: JSON.stringify({ name: 'Siti', actor_id: 999, status: 'Ditolak' }),
  });
  assert.equal(response.status, 201);
  assert.equal(seen[0].context.actor, routeActor);
  assert.equal(seen[0].body.actor_id, 999);
  assert.equal(seen[0].metadata.idempotency_key, 'route-1');
});

test('disabled pre-parser gate returns 503 for malformed JSON without invoking parser or service', async (t) => {
  const app = express();
  let parserReached = false;
  let calls = 0;
  app.use('/api/penyaluran/mustahik', p0FlagGate({ isEnabled: () => false }));
  app.use(express.json({ verify: () => { parserReached = true; } }));
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = actor; next(); },
    isEnabled: true,
    services: { createP0Mustahik: async () => { calls += 1; return {}; } },
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/penyaluran/mustahik`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{malformed',
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'P0_WORKFLOW_DISABLED');
  assert.equal(parserReached, false);
  assert.equal(calls, 0);
});

test('numeric and scalar intake fields reject malformed types without side effects', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  for (const [field, value, code] of [
    ['monthly_income', '-1', 'NON_NEGATIVE_INTEGER'],
    ['monthly_expense', 'not-a-number', 'NON_NEGATIVE_INTEGER'],
    ['family_dependents', '1.5', 'INTEGER'],
    ['beneficiary_count', true, 'INTEGER'],
    ['phone', 812345, 'STRING_REQUIRED'],
    ['address', { line: 'Mawar' }, 'STRING_REQUIRED'],
  ]) {
    await assert.rejects(createP0Mustahik({ ...payload(), [field]: value }, { db, actor }, meta(`invalid-${field}`)), (error) => error.status === 422 && error.field_errors?.[field] === code);
  }
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 0);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM p0_idempotency_keys')).count), 0);
});

test('concurrent distinct idempotency keys create distinct server file numbers', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  const outcomes = await Promise.all([
    createP0Mustahik(payload(), { db, actor }, meta('concurrent-a')),
    createP0Mustahik({ ...payload(), name: 'Sari' }, { db, actor }, meta('concurrent-b')),
  ]);
  assert.equal(new Set(outcomes.map((result) => result.data.id)).size, 2);
  assert.equal(new Set(outcomes.map((result) => result.data.file_no)).size, 2);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 2);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM applications')).count), 2);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM activity_logs')).count), 2);
});

test('legacy file suffix collision allocates the next free canonical number', async (t) => {
  const db = await database();
  t.after(() => db.pool.end());
  await db.run("INSERT INTO mustahik (file_no,name,status,workflow_version,workflow_mode) VALUES ('MST-202609-0002','Legacy','Diajukan',0,'legacy')");
  const result = await createP0Mustahik(payload(), { db, actor }, meta('legacy-collision'));
  assert.equal(result.data.file_no, 'MST-202609-0003');
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), 2);
});
