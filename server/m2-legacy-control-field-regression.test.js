process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { createMustahik, updateMustahik } from './repository.js';
import { requireProductionSecret } from './access-policy.js';
import { assertDisposableTestDatabaseUrl } from './penyaluran-p0/migration-runner.js';
import app from './index.js';

const testDbUrl = process.env.M2_TEST_DATABASE_URL;
if (testDbUrl) {
  assertDisposableTestDatabaseUrl(testDbUrl);
}

const JWT_SECRET = requireProductionSecret();
const adminToken = jwt.sign({ id: 1, email: 'admin@baznas.go.id', role: 'admin', level: 'admin', division: 'IT' }, JWT_SECRET);

function createDbAdapter(pool) {
  return {
    isPg: true,
    pool,
    _isInTransaction: false,
    async query(text, params = []) {
      return pool.query(text, params);
    },
    async get(text, params = []) {
      const res = await pool.query(text, params);
      return res.rows[0] || null;
    },
    async all(text, params = []) {
      const res = await pool.query(text, params);
      return res.rows;
    },
    async run(text, params = []) {
      const res = await pool.query(text, params);
      return {
        rowCount: res.rowCount,
        rows: res.rows,
        lastID: res.rows?.[0]?.id ?? null,
      };
    },
    async exec(text) {
      return pool.query(text);
    },
    async close() {
      // Managed by pool
    },
  };
}

function startServer(expressApp) {
  return new Promise((resolve) => {
    const s = expressApp.listen(0, '127.0.0.1', () => resolve(s));
  });
}

test('live PostgreSQL 16: createMustahik and updateMustahik reject/ignore P0 control columns', { skip: !process.env.M2_TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: testDbUrl });
  await pool.query("INSERT INTO users (id, name, email, password_hash, role, level, division, is_active) VALUES (1, 'Admin', 'admin@baznas.go.id', 'dummy_hash', 'admin', 'admin', 'IT', TRUE) ON CONFLICT (id) DO NOTHING;");
  const db = createDbAdapter(pool);

  try {
    // 1. Direct repository call with malicious control payload
    const tamperData = {
      file_no: `MST-PG16-TEST-${Date.now()}-1`,
      name: 'Real PG Tamper Case',
      program: 'Bantuan Fakir',
      status: 'Diajukan',
      workflow_mode: 'p0',
      workflow_version: 99,
      archived_at: '2026-09-26T00:00:00.000Z',
      archived_by_id: 88,
      archive_reason: 'Malicious pre-archive attempt',
      p0_reconciled_at: '2026-09-26T00:00:00.000Z',
      p0_reconciled_by: 88,
      legacy_status_snapshot: 'TamperedSnapshot',
    };

    const createdId = await createMustahik(tamperData, 1, db);
    assert.ok(createdId > 0, 'Mustahik should be created with valid positive ID');

    // Query real PostgreSQL 16 database directly
    const row = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(row.name, 'Real PG Tamper Case');
    assert.equal(row.workflow_mode, 'legacy', 'PostgreSQL 16: workflow_mode must remain canonical legacy');
    assert.equal(row.workflow_version, 0, 'PostgreSQL 16: workflow_version must remain 0');
    assert.equal(row.archived_at, null, 'PostgreSQL 16: archived_at must remain null');
    assert.equal(row.archived_by_id, null, 'PostgreSQL 16: archived_by_id must remain null');
    assert.equal(row.archive_reason, null, 'PostgreSQL 16: archive_reason must remain null');
    assert.equal(row.p0_reconciled_at, null, 'PostgreSQL 16: p0_reconciled_at must remain null');
    assert.equal(row.p0_reconciled_by, null, 'PostgreSQL 16: p0_reconciled_by must remain null');
    assert.equal(row.legacy_status_snapshot, null, 'PostgreSQL 16: legacy_status_snapshot must remain null');

    // 2. Direct update with malicious control payload
    const updateResult = await updateMustahik(createdId, {
      notes: 'Updated safely on PG16',
      workflow_mode: 'p0',
      workflow_version: 55,
      archived_at: '2026-09-26T12:00:00.000Z',
      archive_reason: 'Tampered reason',
    }, db);
    assert.ok(updateResult, 'Update should succeed for allowed fields');

    const updatedRow = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(updatedRow.notes, 'Updated safely on PG16');
    assert.equal(updatedRow.workflow_mode, 'legacy', 'PostgreSQL 16: workflow_mode cannot be mutated via updateMustahik');
    assert.equal(updatedRow.workflow_version, 0, 'PostgreSQL 16: workflow_version cannot be mutated via updateMustahik');
    assert.equal(updatedRow.archived_at, null, 'PostgreSQL 16: archived_at cannot be mutated via updateMustahik');
    assert.equal(updatedRow.archive_reason, null, 'PostgreSQL 16: archive_reason cannot be mutated via updateMustahik');

    // Cleanup created row
    await db.run('DELETE FROM applications WHERE mustahik_id = $1', [createdId]);
    await db.run('DELETE FROM mustahik WHERE id = $1', [createdId]);
  } finally {
    await pool.end();
  }
});

test('live PostgreSQL 16: HTTP POST & PUT /api/mustahik sanitize and ignore control fields', { skip: !process.env.M2_TEST_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: testDbUrl });
  await pool.query("INSERT INTO users (id, name, email, password_hash, role, level, division, is_active) VALUES (1, 'Admin', 'admin@baznas.go.id', 'dummy_hash', 'admin', 'admin', 'IT', TRUE) ON CONFLICT (id) DO NOTHING;");
  const db = createDbAdapter(pool);
  app.locals.db = db;

  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. POST /api/mustahik via HTTP with control fields
    const httpTamperPayload = {
      file_no: `MST-PG16-TEST-${Date.now()}-2`,
      name: 'HTTP PG16 Case',
      program: 'Kemanusiaan',
      status: 'Diajukan',
      workflow_mode: 'p0',
      workflow_version: 12,
      archived_at: '2026-09-26T00:00:00.000Z',
      archived_by_id: 42,
      archive_reason: 'HTTP Pre-archive attempt',
      p0_reconciled_at: '2026-09-26T00:00:00.000Z',
    };

    const res = await fetch(`${baseUrl}/api/mustahik`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(httpTamperPayload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    const createdId = body.data.id;

    // Verify row in real PostgreSQL 16
    const row = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(row.name, 'HTTP PG16 Case');
    assert.equal(row.workflow_mode, 'legacy', 'HTTP POST: workflow_mode must be legacy on real PostgreSQL 16');
    assert.equal(row.workflow_version, 0, 'HTTP POST: workflow_version must be 0 on real PostgreSQL 16');
    assert.equal(row.archived_at, null, 'HTTP POST: archived_at must be null on real PostgreSQL 16');
    assert.equal(row.archive_reason, null, 'HTTP POST: archive_reason must be null on real PostgreSQL 16');
    assert.equal(row.p0_reconciled_at, null, 'HTTP POST: p0_reconciled_at must be null on real PostgreSQL 16');

    // 2. PUT /api/mustahik/:id via HTTP with control fields
    const putRes = await fetch(`${baseUrl}/api/mustahik/${createdId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        notes: 'Updated via HTTP on PG16',
        workflow_mode: 'p0',
        workflow_version: 99,
        archived_at: '2026-09-26T15:00:00.000Z',
      }),
    });

    assert.equal(putRes.status, 200);

    const updatedRow = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(updatedRow.notes, 'Updated via HTTP on PG16');
    assert.equal(updatedRow.workflow_mode, 'legacy');
    assert.equal(updatedRow.workflow_version, 0);
    assert.equal(updatedRow.archived_at, null);

    // Cleanup
    await db.run('DELETE FROM applications WHERE mustahik_id = $1', [createdId]);
    await db.run('DELETE FROM mustahik WHERE id = $1', [createdId]);
  } finally {
    server.close();
    await pool.end();
  }
});
