import { newDb } from 'pg-mem';
import pg from 'pg';
import { assertDisposableTestDatabaseUrl } from './penyaluran-p0/migration-runner.js';
import { readLegacySchemaOnlySql } from './legacy-schema-fixture.js';
import { runPendingMigrations } from './penyaluran-p0/migration-runner.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

/**
 * Disposable pg-mem database used by the repository tests.  It intentionally
 * contains only the P0 tables needed by the transaction kernel.
 */
export async function createP0TestDatabase() {
  const pg16Url = process.env.P0_PG16_ROUTE_TEST_URL;
  if (pg16Url) {
    const parsed = assertDisposableTestDatabaseUrl(pg16Url);
    if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      throw new Error('P0_ROUTE_TEST_DATABASE_MUST_BE_LOOPBACK');
    }
    const pool = new pg.Pool({ connectionString: pg16Url, max: 4 });
    pool.isPg = true;
    const existing = await pool.query("SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname='public'");
    if (existing.rows[0]?.count === 0) {
      const legacyDdl = await readLegacySchemaOnlySql();
      await pool.query(legacyDdl);
      await runPendingMigrations({
        pool,
        migrationsDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations'),
      });
      const integrity = await pool.query(`SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('mustahik','applications','assessments','mpzis','ppd','ppd_payments','recipient_confirmations','p0_idempotency_keys','artifact_files')) AS tables,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f') AS foreign_keys,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c') AS checks,
        (SELECT COUNT(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S') AS sequences`);
      assert.equal(integrity.rows[0].tables, 9, 'legacy-upgraded schema must expose all route and evidence tables');
      assert.ok(integrity.rows[0].foreign_keys >= 10, 'legacy-upgraded schema must retain P0 foreign keys');
      assert.ok(integrity.rows[0].checks >= 10, 'legacy-upgraded schema must retain P0 checks');
      assert.ok(integrity.rows[0].sequences >= 10, 'legacy-upgraded schema must retain serial sequences');
    } else {
      const ledger = await pool.query("SELECT to_regclass('public.schema_migrations') AS ledger");
      if (!ledger.rows[0]?.ledger) {
        await pool.end();
        throw new Error('P0_ROUTE_TEST_DATABASE_MUST_BE_EMPTY_OR_MIGRATED');
      }
    }
    return createP0DatabaseFromPool(pool, { realPostgres: true, schemaCreated: true });
  }
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({ name: 'btrim', args: ['text'], returns: 'text', implementation: (value) => String(value).trim() });
  memory.public.registerFunction({ name: 'char_length', args: ['text'], returns: 'integer', implementation: (value) => String(value).length });
  const Pool = memory.adapters.createPg().Pool;
  const pool = new Pool();
  return createP0DatabaseFromPool(pool, { instrumentTransactions: true });
}

async function createP0DatabaseFromPool(pool, { instrumentTransactions = false, schemaCreated = false, realPostgres = false } = {}) {
  const state = { failure: null };
  const tableNames = ['users', 'mustahik', 'applications', 'documents', 'assessments', 'mpzis', 'ppd', 'ppd_rab_lines', 'artifact_approvals', 'approval_decisions', 'activity_logs', 'p0_idempotency_keys', 'artifact_files', 'artifact_access_events', 'ppd_payments', 'recipient_confirmations', 'mustahik_case_assignments'];
  async function captureSnapshot() {
    const snapshot = {};
    for (const table of tableNames) snapshot[table] = (await pool.query(`SELECT * FROM ${table}`)).rows;
    return snapshot;
  }
  async function restoreSnapshot(snapshot) {
    const savedFailure = state.failure;
    state.failure = null;
    try {
      for (const table of [...tableNames].reverse()) {
        await pool.query(`DELETE FROM ${table}`);
        for (const row of snapshot[table]) {
          const columns = Object.keys(row);
          const placeholders = columns.map((_, index) => `$${index + 1}`).join(',');
          await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`, columns.map((column) => row[column]));
        }
      }
    } finally {
      state.failure = savedFailure;
    }
  }
  const originalConnect = pool.connect.bind(pool);
  if (instrumentTransactions) pool.connect = async (...args) => {
    const client = await originalConnect(...args);
    const originalQuery = client.query.bind(client);
    client.query = async (text, params) => {
      if (state.failure && state.failure.test(String(text))) throw new Error('audit failure');
      const sql = String(text).trim().toUpperCase();
      if (sql === 'BEGIN') state.snapshot = await captureSnapshot();
      const result = await originalQuery(text, params);
      if (sql === 'ROLLBACK' && state.snapshot) {
        const snapshot = state.snapshot;
        state.snapshot = null;
        await restoreSnapshot(snapshot);
      }
      if (sql === 'COMMIT') state.snapshot = null;
      return result;
    };
    return client;
  };
  const db = {
    isPg: true,
    pool,
    _isInTransaction: false,
    async query(text, params = []) {
      if (state.failure && state.failure.test(String(text))) throw new Error('audit failure');
      return pool.query(text, params);
    },
    async get(text, params = []) {
      const result = await this.query(text, params);
      return result.rows?.[0] || null;
    },
    async all(text, params = []) {
      const result = await this.query(text, params);
      return result.rows || [];
    },
    async run(text, params = []) {
      const result = await this.query(text, params);
      return { rowCount: result.rowCount, rows: result.rows || [], lastID: result.rows?.[0]?.id ?? null };
    },
    async exec(text) { return this.query(text); },
    failOn(pattern) { state.failure = pattern; },
    clearFailure() { state.failure = null; },
    async close() { await pool.end(); },
  };
  if (!schemaCreated) await db.exec(`
    CREATE TABLE mustahik (
      id SERIAL PRIMARY KEY, file_no TEXT, received_date TEXT, name TEXT, applicant_status TEXT,
      beneficiary_name TEXT, nik TEXT, kk_number TEXT, phone TEXT, marital_status TEXT,
      monthly_income NUMERIC DEFAULT 0, monthly_expense NUMERIC DEFAULT 0, remaining_income NUMERIC DEFAULT 0,
      application_count INTEGER DEFAULT 1, beneficiary_count INTEGER DEFAULT 1, program TEXT,
      request_title TEXT, status TEXT NOT NULL DEFAULT 'draft', workflow_mode TEXT NOT NULL DEFAULT 'legacy',
      workflow_version INTEGER NOT NULL DEFAULT 0, created_by_id INTEGER, notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, legacy_status_snapshot VARCHAR(100),
      p0_reconciled_at TIMESTAMPTZ, p0_reconciled_by INTEGER,
      archived_at TIMESTAMPTZ, archived_by_id INTEGER, archive_reason TEXT
    );
    CREATE TABLE applications (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER, application_number TEXT,
      program TEXT, request_title TEXT, status TEXT, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE documents (id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, doc_type TEXT, filename TEXT NOT NULL, original_name TEXT, file_url TEXT NOT NULL, uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE assessments (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, application_id INTEGER, revision INTEGER NOT NULL,
      status TEXT NOT NULL, source TEXT NOT NULL, created_by_id INTEGER, updated_by_id INTEGER,
      snapshot_json JSONB, snapshot_hash CHAR(64)
    );
    CREATE TABLE mpzis (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, application_id INTEGER, revision INTEGER NOT NULL,
      status TEXT NOT NULL, source TEXT NOT NULL, snapshot_json JSONB, snapshot_hash CHAR(64), form_number TEXT, total_amount NUMERIC, recipient_name TEXT
    );
    CREATE TABLE ppd (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, application_id INTEGER, revision INTEGER NOT NULL,
      status TEXT NOT NULL, source TEXT NOT NULL, mpzis_id INTEGER, snapshot_json JSONB, snapshot_hash CHAR(64), amount NUMERIC, receipt_status TEXT, transaction_number TEXT, created_by_id INTEGER
    );
    CREATE TABLE ppd_rab_lines (id SERIAL PRIMARY KEY, ppd_id INTEGER NOT NULL, line_no INTEGER NOT NULL, register_number TEXT, description TEXT, amount NUMERIC);
    CREATE TABLE artifact_approvals (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, artifact_type TEXT NOT NULL, artifact_id INTEGER NOT NULL,
      artifact_revision INTEGER NOT NULL, approval_step TEXT, action TEXT NOT NULL, snapshot_hash CHAR(64) NOT NULL,
      note TEXT, correlation_id UUID, actor_id INTEGER, actor_name TEXT NOT NULL, actor_role TEXT NOT NULL,
      actor_level TEXT NOT NULL, actor_division TEXT NOT NULL, is_admin_override BOOLEAN NOT NULL DEFAULT FALSE,
      override_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX uq_artifact_approval_step ON artifact_approvals(artifact_type, artifact_id, artifact_revision, approval_step) WHERE action = 'approve';
    CREATE TABLE approval_decisions (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, stage TEXT, action TEXT NOT NULL, previous_status TEXT,
      next_status TEXT, note TEXT NOT NULL, approved_amount NUMERIC, actor_id INTEGER, actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL, actor_level TEXT NOT NULL, actor_division TEXT NOT NULL, prepared_by_id INTEGER,
      correlation_id UUID, artifact_type TEXT, artifact_id INTEGER, artifact_revision INTEGER, snapshot_hash CHAR(64),
      evidence_grade TEXT NOT NULL DEFAULT 'p0', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE activity_logs (
      id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL, actor_id INTEGER, actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL, actor_level TEXT NOT NULL, actor_division TEXT NOT NULL, action_type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT, old_status TEXT, new_status TEXT, correlation_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE p0_idempotency_keys (
      id SERIAL PRIMARY KEY, actor_id INTEGER NOT NULL, idempotency_key TEXT NOT NULL, request_hash CHAR(64) NOT NULL,
      response_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT p0_idempotency_actor_key UNIQUE (actor_id, idempotency_key)
    );
    ALTER TABLE artifact_approvals ADD COLUMN completion_hash CHAR(64), ADD COLUMN completion_snapshot_json JSONB;
    CREATE TABLE artifact_files (id SERIAL PRIMARY KEY, mustahik_id INTEGER, artifact_type TEXT, artifact_id INTEGER, artifact_revision INTEGER, kind TEXT, stored_name TEXT, original_name TEXT, mime_type TEXT, byte_size INTEGER, sha256 CHAR(64), uploaded_by_id INTEGER, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE artifact_access_events (id SERIAL PRIMARY KEY, file_id INTEGER, mustahik_id INTEGER, artifact_type TEXT, artifact_id INTEGER, artifact_revision INTEGER, actor_id INTEGER, actor_name TEXT, actor_role TEXT, actor_level TEXT, actor_division TEXT, action TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, correlation_id UUID);
    CREATE TABLE ppd_payments (id SERIAL PRIMARY KEY, ppd_id INTEGER, transaction_number TEXT, paid_amount NUMERIC, paid_at TIMESTAMPTZ, proof_file_id INTEGER, recorded_by_id INTEGER, verification_status TEXT, verified_by_id INTEGER, verified_at TIMESTAMPTZ, snapshot_json JSONB, snapshot_hash CHAR(64), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE recipient_confirmations (id SERIAL PRIMARY KEY, ppd_id INTEGER, method TEXT, recipient_name_snapshot TEXT, confirmed_at TIMESTAMPTZ, note TEXT, evidence_file_id INTEGER, recorded_by_id INTEGER, snapshot_json JSONB, snapshot_hash CHAR(64), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE mustahik_case_assignments (id SERIAL PRIMARY KEY, mustahik_id INTEGER, user_id INTEGER, assignment_role TEXT, assigned_by_id INTEGER, assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, ended_at TIMESTAMPTZ);
    CREATE TABLE users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT, role TEXT NOT NULL,
      level TEXT, division TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    -- pg-mem does not materialize SERIAL sequences, while PostgreSQL does.
    -- Define the two service-owned allocators explicitly so local tests use
    -- the same fail-closed nextval contract as production.
    ${realPostgres ? '' : 'CREATE SEQUENCE ppd_payments_id_seq START 1; CREATE SEQUENCE recipient_confirmations_id_seq START 1;'}
  `);
  if (!schemaCreated) {
    await db.run('INSERT INTO mustahik (status, workflow_mode, workflow_version) VALUES ($1, $2, 0)', ['draft', 'p0']);
    await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (1, 'Admin Pusat', 'admin@baznas.go.id', 'admin', 'admin', 'IT', TRUE)");
  }
  return db;
}

export const createTestDatabase = createP0TestDatabase;
