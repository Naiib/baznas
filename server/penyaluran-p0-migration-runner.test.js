import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { newDb } from 'pg-mem';

import { initDb, REQUIRED_LEGACY_TABLES } from './db.js';
import { startServer } from './index.js';

process.env.NODE_ENV = 'test';
const migrationTestDir = path.dirname(fileURLToPath(import.meta.url));

import {
  assertDisposableTestDatabaseUrl,
  collectP0MigrationDryRun,
  migrationChecksum,
  P0_CRITICAL_OBJECTS,
  P0_KNOWN_MIGRATIONS,
  P0_SCHEMA_CONTRACT,
  readMigrationFiles,
  resolveDryRunDatabaseUrl,
  runPendingMigrations,
  verifyP0Schema,
} from './penyaluran-p0/migration-runner.js';

const EXPECTED_P0_SAFETY_OBJECTS = Object.freeze({
  constraints: Object.freeze([
    'approval_decisions_evidence_grade_check', 'approval_decisions_p0_actor_snapshot_check',
    'artifact_access_events_actor_snapshot_check', 'artifact_approvals_actor_snapshot_check',
    'artifact_file_kind_check', 'artifact_file_size_check', 'assessments_p0_child_count_check',
    'assessments_p0_house_ownership_check', 'assessments_p0_money_check', 'assessments_p0_previous_application_year_check',
    'assessments_p0_submitted_fields_check', 'assessments_previous_application_year_range_check',
    'assessments_source_check', 'assessments_status_check', 'mustahik_archive_fields_check',
    'mustahik_workflow_mode_check', 'mustahik_workflow_version_check', 'mpzis_p0_fund_source_check',
    'mpzis_p0_recipient_type_check', 'mpzis_p0_submitted_fields_check', 'mpzis_source_check', 'mpzis_status_check',
    'p0_idempotency_actor_key', 'ppd_p0_fund_source_check', 'ppd_p0_money_check', 'ppd_p0_payment_type_check',
    'ppd_p0_payment_type_other_check', 'ppd_p0_submitted_fields_check', 'ppd_rab_amount_check', 'ppd_rab_line_no_check',
    'ppd_rab_unique_line', 'ppd_payment_amount_check', 'ppd_payment_status_check', 'ppd_receipt_status_check',
    'ppd_source_check', 'ppd_status_check', 'recipient_confirmation_method_check',
  ]),
  indexes: Object.freeze([
    'uq_active_case_assignment', 'uq_active_ppd_payment', 'uq_active_recipient_confirmation', 'uq_artifact_approval_step',
    'uq_assessments_active_revision', 'uq_assessments_revision', 'uq_mpzis_active_form_number', 'uq_mpzis_active_revision',
    'uq_mpzis_form_revision', 'uq_mpzis_revision', 'uq_ppd_active_form_number', 'uq_ppd_active_ppd_number',
    'uq_ppd_active_revision', 'uq_ppd_active_transaction_number', 'uq_ppd_form_revision', 'uq_ppd_ppd_number_revision',
    'uq_ppd_revision', 'uq_ppd_transaction_revision', 'uq_system_receipt_artifact', 'uq_system_receipt_generated_event',
  ]),
  triggers: Object.freeze([
    'artifact_access_events_immutable', 'artifact_access_events_truncate_immutable', 'artifact_approvals_immutable',
    'artifact_approvals_truncate_immutable', 'artifact_files_submitted_immutable', 'artifact_files_truncate_immutable',
    'ppd_payments_immutable', 'ppd_payments_truncate_immutable', 'recipient_confirmations_immutable',
    'recipient_confirmations_truncate_immutable',
  ]),
  foreignKeys: Object.freeze([
    'activity_logs_actor_fk', 'activity_logs_mustahik_id_fkey', 'applications_mustahik_id_fkey',
    'approval_decisions_actor_fk', 'approval_decisions_mustahik_id_fkey', 'approval_decisions_prepared_by_fk',
    'artifact_access_events_actor_fk', 'artifact_access_events_file_fk', 'artifact_access_events_mustahik_fk',
    'artifact_approvals_actor_fk', 'artifact_approvals_mustahik_fk', 'artifact_files_mustahik_fk',
    'artifact_files_uploader_fk', 'assessments_application_id_fkey', 'assessments_creator_fk', 'assessments_mustahik_id_fkey',
    'assessments_supersedes_fk', 'assessments_updater_fk', 'case_assignments_assigner_fk', 'case_assignments_mustahik_fk',
    'case_assignments_user_fk', 'documents_mustahik_id_fkey', 'mpzis_application_id_fkey', 'mpzis_creator_fk',
    'mpzis_mustahik_id_fkey', 'mpzis_submitter_fk', 'mpzis_supersedes_fk', 'mustahik_archiver_fk', 'mustahik_creator_fk',
    'mustahik_reconciler_fk', 'p0_idempotency_actor_fk', 'ppd_application_id_fkey', 'ppd_creator_fk',
    'ppd_mpzis_fk', 'ppd_mustahik_id_fkey', 'ppd_payments_ppd_fk', 'ppd_payments_proof_fk', 'ppd_payments_recorder_fk',
    'ppd_payments_verifier_fk', 'ppd_rab_lines_ppd_fk', 'ppd_supersedes_fk', 'recipient_confirmations_evidence_fk',
    'recipient_confirmations_ppd_fk', 'recipient_confirmations_recorder_fk', 'wa_logs_mustahik_id_fkey',
  ]),
});

function migrationFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'p0-migrations-'));
  writeFileSync(path.join(directory, '20260913_002_second.sql'), Buffer.from('SELECT 2;\r\n', 'utf8'));
  writeFileSync(path.join(directory, '20260913_001_first.sql'), Buffer.from('SELECT 1;\r\n', 'utf8'));
  writeFileSync(path.join(directory, 'README.md'), 'ignored');
  return directory;
}

function fakePool({ checksums = new Map(), failOnMigration = false, failOnRollback = false, failOnUnlock = false } = {}) {
  const calls = [];
  let released = false;
  let releasedError = null;
  let connectCount = 0;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT checksum FROM schema_migrations')) {
        const checksum = checksums.get(params[0]);
        return { rows: checksum ? [{ checksum }] : [] };
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        checksums.set(params[0], params[1]);
        return { rows: [] };
      }
      if (failOnRollback && sql === 'ROLLBACK') throw new Error('ROLLBACK_FAILED');
      if (failOnMigration && /^SELECT [12];/.test(sql)) throw new Error('MIGRATION_FAILED');
      if (failOnUnlock && sql.startsWith('SELECT pg_advisory_unlock')) throw new Error('UNLOCK_FAILED');
      return { rows: [] };
    },
    release(error) {
      released = true;
      releasedError = error || null;
    },
  };
  return {
    isPg: true,
    calls,
    get released() {
      return released;
    },
    get releasedError() {
      return releasedError;
    },
    get connectCount() {
      return connectCount;
    },
    async connect() {
      connectCount += 1;
      return client;
    },
  };
}

test('readMigrationFiles sorts lexical SQL versions and hashes exact bytes', async () => {
  const directory = migrationFixture();
  try {
    const files = await readMigrationFiles(directory);
    assert.deepEqual(files.map((x) => x.version), ['20260913_001', '20260913_002']);
    assert.equal(files[0].checksum, createHash('sha256').update(files[0].sql).digest('hex'));
    assert.equal(files[0].checksum, migrationChecksum(files[0].sql));
    assert.equal(files[0].sql, 'SELECT 1;\r\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('P0_KNOWN_MIGRATIONS exactly matches the checked-in migration bytes', async () => {
  const files = await readMigrationFiles(path.join(migrationTestDir, 'migrations'));
  assert.deepEqual(
    files.map(({ version, checksum }) => ({ version, checksum })),
    P0_KNOWN_MIGRATIONS,
  );
});

test('P0 safety catalog explicitly covers every migration-created object', () => {
  assert.deepEqual(P0_CRITICAL_OBJECTS, EXPECTED_P0_SAFETY_OBJECTS);
});

test('readMigrationFiles fails closed when the expected migration directory is missing', async () => {
  await assert.rejects(
    readMigrationFiles(path.join(tmpdir(), 'p0-migrations-does-not-exist')),
    /P0_MIGRATIONS_DIRECTORY_MISSING/,
  );
});

test('readMigrationFiles permits an intentionally empty directory only when explicitly configured', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p0-empty-migrations-'));
  try {
    await assert.rejects(readMigrationFiles(directory), /P0_MIGRATIONS_DIRECTORY_EMPTY/);
    assert.deepEqual(await readMigrationFiles(directory, { allowEmpty: true }), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations rejects duplicate versions before connecting', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p0-duplicate-migrations-'));
  const calls = [];
  writeFileSync(path.join(directory, '20260913_001_first.sql'), 'SELECT 1;\n');
  writeFileSync(path.join(directory, '20260913_001_duplicate.sql'), 'SELECT 1;\n');
  try {
    await assert.rejects(
      runPendingMigrations({
        pool: { isPg: true, async connect() { calls.push('connect'); } },
        migrationsDir: directory,
      }),
      /P0_DUPLICATE_MIGRATION_VERSION:20260913_001/,
    );
    assert.deepEqual(calls, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resolveDryRunDatabaseUrl requires an explicit disposable test URL by default', () => {
  assert.throws(
    () => resolveDryRunDatabaseUrl({ DATABASE_URL: 'postgres://u:p@host/live' }),
    /P0_TEST_DATABASE_URL/,
  );
  assert.equal(
    resolveDryRunDatabaseUrl({ P0_TEST_DATABASE_URL: 'postgresql://u:p@host/baznas_p0_test' }),
    'postgresql://u:p@host/baznas_p0_test',
  );
});

test('resolveDryRunDatabaseUrl permits a live URL only with explicit opt-in and PostgreSQL scheme', () => {
  assert.equal(
    resolveDryRunDatabaseUrl({ P0_ALLOW_LIVE_MIGRATION_DRY_RUN: '1', DATABASE_URL: 'postgres://u:p@host/live' }),
    'postgres://u:p@host/live',
  );
  assert.throws(
    () => resolveDryRunDatabaseUrl({ P0_ALLOW_LIVE_MIGRATION_DRY_RUN: '1', DATABASE_URL: 'mysql://u:p@host/live' }),
    /POSTGRES/,
  );
});

test('resolveDryRunDatabaseUrl never permits live fallback in test migration mode', () => {
  for (const modeEnv of [
    { NODE_ENV: 'test' },
    { P0_MIGRATION_TEST_MODE: '1' },
  ]) {
    assert.throws(
      () => resolveDryRunDatabaseUrl({ ...modeEnv, P0_ALLOW_LIVE_MIGRATION_DRY_RUN: '1', DATABASE_URL: 'postgres://u:p@host/live' }),
      /P0_MIGRATIONS_REQUIRE_TEST_DATABASE|P0_TEST_DATABASE_URL/,
    );
    assert.equal(
      resolveDryRunDatabaseUrl({ ...modeEnv, P0_ALLOW_LIVE_MIGRATION_DRY_RUN: '1', P0_TEST_DATABASE_URL: 'postgresql://u:p@host/baznas_isolated_test', DATABASE_URL: 'postgres://u:p@host/live' }),
      'postgresql://u:p@host/baznas_isolated_test',
    );
  }
});

test('assertDisposableTestDatabaseUrl rejects non-test databases', () => {
  assert.throws(() => assertDisposableTestDatabaseUrl('postgres://u:p@host/baznas_db'), /_test/);
  assert.doesNotThrow(() => assertDisposableTestDatabaseUrl('postgres://u:p@127.0.0.1/baznas_p0_test'));
});

test('runPendingMigrations applies lexical migrations under a lock and is idempotent', async () => {
  const directory = migrationFixture();
  const pool = fakePool();
  try {
    await runPendingMigrations({ pool, migrationsDir: directory });
    const sql = pool.calls.map((call) => call.sql);
    assert.match(sql[0], /pg_advisory_lock/);
    assert.match(sql[1], /CREATE TABLE IF NOT EXISTS schema_migrations/);
    assert.deepEqual(sql.slice(2, 8), [
      'SELECT checksum FROM schema_migrations WHERE version=$1',
      'BEGIN',
      'SELECT 1;\r\n',
      'INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',
      'COMMIT',
      'SELECT checksum FROM schema_migrations WHERE version=$1',
    ]);
    assert.equal(sql.at(-1), 'SELECT pg_advisory_unlock($1)');
    assert.equal(pool.released, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations rejects checksum drift and releases the lock', async () => {
  const directory = migrationFixture();
  const files = await readMigrationFiles(directory);
  const checksumPool = fakePool({ checksums: new Map([['20260913_001', '0'.repeat(64)]]) });
  try {
    await assert.rejects(
      runPendingMigrations({ pool: checksumPool, migrationsDir: directory }),
      /MIGRATION_CHECKSUM_MISMATCH:20260913_001/,
    );
    assert.equal(checksumPool.calls.at(-1).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(checksumPool.released, true);
    assert.notEqual(files[0].checksum, '0'.repeat(64));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations skips already recorded migrations on replay', async () => {
  const directory = migrationFixture();
  const pool = fakePool();
  try {
    await runPendingMigrations({ pool, migrationsDir: directory });
    const firstRunMigrationCalls = pool.calls.filter((call) => /^SELECT [12];/.test(call.sql)).length;
    pool.calls.length = 0;
    await runPendingMigrations({ pool, migrationsDir: directory });
    const replayMigrationCalls = pool.calls.filter((call) => /^SELECT [12];/.test(call.sql)).length;
    assert.equal(firstRunMigrationCalls, 2);
    assert.equal(replayMigrationCalls, 0);
    assert.equal(pool.calls.filter((call) => call.sql === 'BEGIN').length, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations rolls back a failed migration before releasing the lock', async () => {
  const directory = migrationFixture();
  const pool = fakePool({ failOnMigration: true });
  try {
    await assert.rejects(runPendingMigrations({ pool, migrationsDir: directory }), /MIGRATION_FAILED/);
    assert.ok(pool.calls.some((call) => call.sql === 'ROLLBACK'));
    assert.equal(pool.calls.at(-1).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(pool.released, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations discards a client when rollback fails and preserves migration error', async () => {
  const directory = migrationFixture();
  const pool = fakePool({ failOnMigration: true, failOnRollback: true });
  try {
    await assert.rejects(runPendingMigrations({ pool, migrationsDir: directory }), (error) => {
      assert.equal(error.message, 'MIGRATION_FAILED');
      assert.equal(error.rollbackError?.message, 'ROLLBACK_FAILED');
      return true;
    });
    assert.equal(pool.releasedError?.message, 'ROLLBACK_FAILED');
    assert.equal(pool.calls.at(-1).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(pool.connectCount, 1);
    assert.equal(pool.calls.filter((call) => /^SELECT [12];/.test(call.sql)).length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations preserves the original error when rollback and unlock both fail', async () => {
  const directory = migrationFixture();
  const pool = fakePool({ failOnMigration: true, failOnRollback: true, failOnUnlock: true });
  try {
    await assert.rejects(runPendingMigrations({ pool, migrationsDir: directory }), (error) => {
      assert.equal(error.message, 'MIGRATION_FAILED');
      assert.equal(error.rollbackError?.message, 'ROLLBACK_FAILED');
      assert.equal(error.unlockError?.message, 'UNLOCK_FAILED');
      return true;
    });
    assert.equal(pool.releasedError?.message, 'ROLLBACK_FAILED');
    assert.equal(pool.calls.at(-1).sql, 'SELECT pg_advisory_unlock($1)');
    assert.equal(pool.connectCount, 1);
    assert.equal(pool.calls.filter((call) => /^SELECT [12];/.test(call.sql)).length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations destroys a client when advisory unlock fails', async () => {
  const directory = migrationFixture();
  const pool = fakePool({ failOnUnlock: true });
  try {
    await assert.rejects(runPendingMigrations({ pool, migrationsDir: directory }), /UNLOCK_FAILED/);
    assert.equal(pool.released, true);
    assert.equal(pool.releasedError?.message, 'UNLOCK_FAILED');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('runPendingMigrations refuses SQLite before reading or querying migration state', async () => {
  const calls = [];
  const sqlite = {
    isPg: false,
    async connect() {
      calls.push('connect');
      throw new Error('SQLite must not connect');
    },
  };
  await assert.rejects(
    runPendingMigrations({ pool: sqlite, migrationsDir: 'does-not-exist' }),
    /P0_MIGRATIONS_REQUIRE_POSTGRES/,
  );
  assert.deepEqual(calls, []);
});

test('runPendingMigrations refuses adapters without an explicit PostgreSQL marker', async () => {
  const calls = [];
  const unmarked = {
    async connect() {
      calls.push('connect');
      throw new Error('unmarked adapter must not connect');
    },
  };
  await assert.rejects(
    runPendingMigrations({ pool: unmarked, migrationsDir: 'does-not-exist' }),
    /P0_MIGRATIONS_REQUIRE_POSTGRES/,
  );
  assert.deepEqual(calls, []);
});

test('collectP0MigrationDryRun emits read-only coverage counts', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [{ status: 'active', count: '3' }] };
      if (sql.includes('information_schema.columns')) return { rows: [] };
      return { rows: [{ count: '2' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.deepEqual(result.statuses, [{ status: 'active', count: 3 }]);
  for (const key of ['orphans', 'invalid_amounts', 'cascading_foreign_keys', 'in_flight_legacy_cases']) {
    assert.equal(result[key], 2);
  }
  assert.equal(result.duplicate_identifiers, 0);
  assert.ok(queries.length >= 6);
  assert.ok(queries.every((sql) => /^SELECT\b/i.test(sql.trim())));
});

test('collectP0MigrationDryRun treats legacy terminal statuses and explicit aliases as complete', async () => {
  const terminalStatusFixture = ['Penyaluran Selesai', 'Ditolak', 'Selesai', 'completed', 'rejected'];
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      return { rows: [{ count: sql.includes('LOWER(TRIM(status))') ? '0' : '1' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.in_flight_legacy_cases, 0);
  const classificationQuery = queries.at(-1);
  for (const status of terminalStatusFixture) assert.match(classificationQuery, new RegExp(status.toLowerCase()));
});

test('collectP0MigrationDryRun counts only legacy workflow modes when the column exists', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'workflow_mode' }] };
      if (sql.includes('workflow_mode')) return { rows: [{ count: '2' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.in_flight_legacy_cases, 2);
  assert.match(queries.at(-1), /workflow_mode/);
  assert.match(queries.at(-1), /legacy_reconciliation/);
});

test('collectP0MigrationDryRun remains compatible before workflow_mode exists', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) return { rows: [] };
      if (sql.includes('LOWER(TRIM(status))')) return { rows: [{ count: '4' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.in_flight_legacy_cases, 4);
  const classificationQuery = queries.at(-1);
  assert.doesNotMatch(classificationQuery, /workflow_mode/);
  assert.match(classificationQuery, /LOWER\(TRIM\(status\)\)/);
});

test('collectP0MigrationDryRun aggregates orphan rows across every legacy relation', async () => {
  const queries = [];
  const relations = ['applications', 'assessments', 'mpzis', 'ppd', 'documents', 'approval_decisions', 'activity_logs', 'wa_logs'];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('UNION ALL') && sql.includes('approval_decisions')) return { rows: [{ count: '8' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.orphans, 8);
  const orphanQuery = queries.find((sql) => sql.includes('UNION ALL') && sql.includes('approval_decisions'));
  for (const relation of relations) assert.match(orphanQuery, new RegExp(`\\b${relation}\\b`));
});
test('collectP0MigrationDryRun ignores global activity logs but counts dangling references', async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await pool.query('CREATE TABLE mustahik (id INTEGER PRIMARY KEY, status TEXT, workflow_mode TEXT)');
  await pool.query("INSERT INTO mustahik (id, status, workflow_mode) VALUES (1, 'completed', 'legacy')");

  for (const relation of ['applications', 'assessments', 'mpzis', 'ppd', 'documents', 'approval_decisions', 'activity_logs', 'wa_logs']) {
    const extraColumn = relation === 'mpzis' ? ', total_amount NUMERIC'
      : relation === 'ppd' ? ', amount NUMERIC'
        : '';
    await pool.query(`CREATE TABLE ${relation} (id INTEGER, mustahik_id INTEGER${extraColumn})`);
  }
  await pool.query('INSERT INTO activity_logs (id, mustahik_id) VALUES (1, NULL), (2, 999)');

  const db = {
    isPg: true,
    async query(sql, params) {
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) {
        return {
          rows: params[1].includes('workflow_mode')
            ? [{ table_name: 'mustahik', column_name: 'workflow_mode' }]
            : [],
        };
      }
      if (sql.includes('information_schema.referential_constraints')) return { rows: [{ count: '0' }] };
      if (sql.includes('UNION ALL') && sql.includes('approval_decisions')) return pool.query(sql, params);
      return { rows: [{ count: '0' }] };
    },
  };

  try {
    const result = await collectP0MigrationDryRun(db);
    assert.equal(result.orphans, 1);
  } finally {
    await pool.end();
  }
});

test('collectP0MigrationDryRun scopes duplicate identifiers to present logical columns', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) {
        return { rows: [
          { table_name: 'mustahik', column_name: 'nik' },
          { table_name: 'mustahik', column_name: 'file_no' },
          { table_name: 'applications', column_name: 'application_number' },
          { table_name: 'mpzis', column_name: 'form_number' },
          { table_name: 'ppd', column_name: 'form_number' },
          { table_name: 'ppd', column_name: 'ppd_number' },
          { table_name: 'ppd', column_name: 'transaction_number' },
        ] };
      }
      if (sql.includes('duplicate_identifier_groups')) return { rows: [{ count: '3' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.duplicate_identifiers, 3);
  const duplicateQuery = queries.find((sql) => sql.includes('duplicate_identifier_groups'));
  for (const identifier of ['mustahik.nik', 'mustahik.file_no', 'applications.application_number', 'mpzis.form_number', 'ppd.form_number', 'ppd.ppd_number', 'ppd.transaction_number']) {
    assert.match(duplicateQuery, new RegExp(identifier.replace('.', '\\.'), 'i'));
  }
});

test('collectP0MigrationDryRun groups whitespace-padded identifiers by their btrim value', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'nik' }] };
      if (sql.includes('duplicate_identifier_groups')) return { rows: [{ count: '1' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.duplicate_identifiers, 1);
  const duplicateQuery = queries.find((sql) => sql.includes('duplicate_identifier_groups'));
  assert.match(duplicateQuery, /btrim\(/i);
  assert.match(duplicateQuery, /group by btrim\(/i);
});

test('migration preflight permits derived negative remaining income but keeps disbursement amounts nonnegative', () => {
  const migration = readFileSync(path.join(migrationTestDir, 'migrations', '20260913_001_mustahik_p0.sql'), 'utf8');
  const amountBlock = migration
    .slice(migration.indexOf("('mustahik', 'monthly_income')"), migration.indexOf('  LOOP', migration.indexOf("('mustahik', 'monthly_income')")))
    .replace(/--.*$/gm, '');
  assert.doesNotMatch(amountBlock, /remaining_income/);
  assert.match(amountBlock, /\('ppd', 'amount'\)/);
  assert.match(amountBlock, /\('ppd_payments', 'paid_amount'\)/);
});

test('verifyP0Schema rejects an unknown migration ledger version', async () => {
  const db = {
    isPg: true,
    async query(sql) {
      if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'mustahik' }] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'id' }] };
      if (sql.includes('schema_migrations')) return { rows: [{ version: '99999999_999', checksum: 'a'.repeat(64) }] };
      return { rows: [] };
    },
  };
  await assert.rejects(verifyP0Schema(db, { mustahik: ['id'] }), /P0_SCHEMA_UNKNOWN_MIGRATION/);
});

test('verifyP0Schema rejects a missing critical PostgreSQL object', async () => {
  const db = {
    isPg: true,
    async query(sql) {
      if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'mustahik' }] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'id' }] };
      if (sql.includes('schema_migrations')) return { rows: P0_KNOWN_MIGRATIONS };
      return { rows: [] };
    },
  };
  await assert.rejects(verifyP0Schema(db, { mustahik: ['id'] }), /P0_SCHEMA_CRITICAL_OBJECTS_MISSING/);
});

test('verifyP0Schema rejects removal of every required safety object', async () => {
  const allObjects = Object.entries(EXPECTED_P0_SAFETY_OBJECTS).flatMap(([group, names]) => names.map((object_name) => ({
    object_type: group === 'foreignKeys' ? 'foreign_key' : group === 'indexes' ? 'index' : group.slice(0, -1),
    object_name,
  })));
  for (const [group, names] of Object.entries(EXPECTED_P0_SAFETY_OBJECTS)) {
    for (const name of names) {
      const db = {
        isPg: true,
        async query(sql) {
          if (sql.includes('information_schema.tables')) return { rows: [{ table_name: 'mustahik' }] };
          if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'id' }] };
          if (sql.includes('schema_migrations')) return { rows: P0_KNOWN_MIGRATIONS };
          return { rows: allObjects.filter((row) => !(row.object_type === (group === 'foreignKeys' ? 'foreign_key' : group === 'indexes' ? 'index' : group.slice(0, -1)) && row.object_name === name)) };
        },
      };
      await assert.rejects(
        verifyP0Schema(db, { mustahik: ['id'] }),
        new RegExp(`P0_SCHEMA_CRITICAL_OBJECTS_MISSING:${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${name}`),
      );
    }
  }
});

test('collectP0MigrationDryRun ignores absent duplicate columns and scopes cascades to P0 relations', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('GROUP BY status')) return { rows: [] };
      if (sql.includes('information_schema.columns')) return { rows: [{ table_name: 'mustahik', column_name: 'nik' }] };
      if (sql.includes('duplicate_identifier_groups')) return { rows: [{ count: '1' }] };
      if (sql.includes('referential_constraints')) return { rows: [{ count: '2' }] };
      return { rows: [{ count: '0' }] };
    },
  };
  const result = await collectP0MigrationDryRun(db);
  assert.equal(result.duplicate_identifiers, 1);
  assert.equal(result.cascading_foreign_keys, 2);
  const cascadeQuery = queries.find((sql) => sql.includes('referential_constraints'));
  assert.match(cascadeQuery, /mustahik/);
  assert.match(cascadeQuery, /artifact_files/);
  assert.doesNotMatch(cascadeQuery, /penerimaan/i);
});

function lifecycleDb(isPg, events) {
  return {
    isPg,
    pool: isPg ? { isPg: true, async connect() { throw new Error('test pool must not connect'); } } : null,
    async exec() {
      events.push('sqlite-bootstrap');
    },
    async all(sql) {
      if (!isPg && /schema_migrations|pg_advisory/i.test(sql)) throw new Error('SQLite must not inspect migration state');
      return [];
    },
  };
}

test('initDb records PostgreSQL schema, migrations, compatibility, and seed order', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  const previousCutoverAt = process.env.PENYALURAN_P0_CUTOVER_AT;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';
  try {
    await startServer(0, {
      initDbFn: () => initDb({
        dbProvider: async () => db,
        schemaRunner: async () => events.push('schema.sql'),
        migrationRunner: async () => events.push('migrations'),
        p0SchemaVerifier: async () => events.push('verifyP0Schema'),
        compatibilityRunner: async () => events.push('compatibility'),
        seedRunner: async () => events.push('seed'),
      }),
      skipAncillaryStartup: true,
      listenFn: (_port, callback) => {
        events.push('listen');
        callback?.();
        return { close() {} };
      },
    });
    assert.deepEqual(events, ['schema.sql', 'migrations', 'verifyP0Schema', 'compatibility', 'seed', 'listen']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
    if (previousCutoverAt === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT;
    else process.env.PENYALURAN_P0_CUTOVER_AT = previousCutoverAt;
  }
});

test('initDb preserves fresh PostgreSQL legacy bootstrap when P0 is disabled and migrations are unavailable', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  delete process.env.PENYALURAN_P0_ENABLED;
  try {
    await initDb({
      dbProvider: async () => db,
      schemaRunner: async () => events.push('schema.sql'),
      legacyBootstrapRunner: async (_db, ddl) => {
        events.push('legacy-bootstrap');
        for (const table of ['program_initiatives', 'reports', 'activity_logs', 'auth_sessions']) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
      },
      migrationsDir: path.join(tmpdir(), 'p0-migrations-not-installed'),
      migrationRunner: async () => { throw new Error('P0 migrations must stay disabled'); },
      p0SchemaVerifier: async () => { throw new Error('P0 verifier must stay disabled'); },
      compatibilityRunner: async () => events.push('compatibility'),
      seedRunner: async () => events.push('seed'),
    });
    assert.deepEqual(events, ['schema.sql', 'legacy-bootstrap', 'compatibility', 'seed']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('initDb fails closed on a missing migration directory when P0 is enabled', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  try {
    await assert.rejects(
      initDb({
        dbProvider: async () => db,
        schemaRunner: async () => events.push('schema.sql'),
        migrationsDir: path.join(tmpdir(), 'p0-migrations-required-but-missing'),
        compatibilityRunner: async () => events.push('compatibility'),
        seedRunner: async () => events.push('seed'),
      }),
      /P0_MIGRATIONS_DIRECTORY_MISSING/,
    );
    assert.deepEqual(events, ['schema.sql']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('initDb fails before compatibility, seed, or listen when P0 schema verification fails', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  const previousCutoverAt = process.env.PENYALURAN_P0_CUTOVER_AT;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';
  try {
    await assert.rejects(
      startServer(0, {
        initDbFn: () => initDb({
          dbProvider: async () => db,
          schemaRunner: async () => events.push('schema.sql'),
          migrationRunner: async () => events.push('migrations'),
          p0SchemaVerifier: async () => { events.push('verifyP0Schema'); throw new Error('P0_SCHEMA_NOT_READY'); },
          compatibilityRunner: async () => events.push('compatibility'),
          seedRunner: async () => events.push('seed'),
        }),
        skipAncillaryStartup: true,
        listenFn: () => { events.push('listen'); return { close() {} }; },
      }),
      /P0_SCHEMA_NOT_READY/,
    );
    assert.deepEqual(events, ['schema.sql', 'migrations', 'verifyP0Schema']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
    if (previousCutoverAt === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT;
    else process.env.PENYALURAN_P0_CUTOVER_AT = previousCutoverAt;
  }
});

test('P0 receipt startup recovery is bounded and fails closed before listen', async () => {
  const events = [];
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.PENYALURAN_P0_ENABLED;
  const previousCutoverAt = process.env.PENYALURAN_P0_CUTOVER_AT;
  const previousLimit = process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS;
  process.env.NODE_ENV = 'test';
  process.env.PENYALURAN_P0_ENABLED = 'true';
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';
  process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS = '7';
  try {
    await assert.rejects(startServer(0, {
      initDbFn: async () => {},
      resumeReceiptJobsFn: async (options) => { events.push(`resume:${options.maxJobs}`); throw new Error('RECEIPT_RECOVERY_UNAVAILABLE'); },
      listenFn: () => { events.push('listen'); return { close() {} }; },
    }), /RECEIPT_RECOVERY_UNAVAILABLE/);
    assert.deepEqual(events, ['resume:7']);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousFlag === undefined) delete process.env.PENYALURAN_P0_ENABLED; else process.env.PENYALURAN_P0_ENABLED = previousFlag;
    if (previousCutoverAt === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT; else process.env.PENYALURAN_P0_CUTOVER_AT = previousCutoverAt;
    if (previousLimit === undefined) delete process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS; else process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS = previousLimit;
  }
});

test('initDb skips P0 schema verification when the feature is disabled', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  delete process.env.PENYALURAN_P0_ENABLED;
  try {
    await initDb({
      dbProvider: async () => db,
      schemaRunner: async () => events.push('schema.sql'),
      migrationRunner: async () => events.push('migrations'),
      p0SchemaVerifier: async () => { throw new Error('P0 verifier must be skipped'); },
      compatibilityRunner: async () => events.push('compatibility'),
      seedRunner: async () => events.push('seed'),
    });
    assert.deepEqual(events, ['schema.sql', 'sqlite-bootstrap', 'compatibility', 'seed']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('verifyP0Schema validates required table and column contract', async () => {
  const queries = [];
  const db = {
    isPg: true,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('information_schema.tables')) return { rows: [
        { table_name: 'mustahik' }, { table_name: 'assessments' }, { table_name: 'mpzis' }, { table_name: 'ppd' },
        { table_name: 'artifact_approvals' }, { table_name: 'artifact_files' },
        { table_name: 'artifact_access_events' }, { table_name: 'ppd_payments' },
        { table_name: 'recipient_confirmations' }, { table_name: 'ppd_rab_lines' },
        { table_name: 'approval_decisions' }, { table_name: 'activity_logs' },
        { table_name: 'p0_idempotency_keys' }, { table_name: 'mustahik_case_assignments' },
      ] };
      return { rows: [{ table_name: 'artifact_approvals', column_name: 'id' }] };
    },
  };
  await assert.rejects(verifyP0Schema(db), /P0_SCHEMA_REQUIRED_COLUMNS_MISSING/);
  assert.equal(queries.length, 2);
});

test('P0-enabled initDb rejects each mandatory readiness table or column omission', async () => {
  const previous = process.env.PENYALURAN_P0_ENABLED;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  const allTables = Object.keys(P0_SCHEMA_CONTRACT);
  const startupTables = [...new Set([...REQUIRED_LEGACY_TABLES, ...allTables])];
  const allColumns = allTables.flatMap((table) => P0_SCHEMA_CONTRACT[table].map((column) => ({ table_name: table, column_name: column })));
  const omissions = [
    ...allTables.map((table_name) => ({ table_name })),
    ...allColumns,
  ];
  try {
    for (const omission of omissions) {
      const db = {
        isPg: true,
        pool: { isPg: true },
        async all(sql) {
          if (sql.includes('information_schema.tables')) return startupTables.map((table_name) => ({ table_name }));
          return [];
        },
        async query(sql) {
          if (sql.includes('information_schema.tables')) return { rows: allTables.map((table_name) => ({ table_name })).filter((row) => omission.column_name || row.table_name !== omission.table_name) };
          return { rows: allColumns.filter((row) => !(row.table_name === omission.table_name && row.column_name === omission.column_name)) };
        },
      };
      await assert.rejects(
        initDb({
          dbProvider: async () => db,
          schemaRunner: async () => {},
          migrationRunner: async () => {},
          compatibilityRunner: async () => {},
          seedRunner: async () => {},
        }),
        /P0_SCHEMA_REQUIRED_(TABLES|COLUMNS)_MISSING/,
        `omission ${omission.table_name}.${omission.column_name || '(table)'}`,
      );
    }

    const validDb = {
      isPg: true,
      pool: { isPg: true },
      async all(sql) {
        if (sql.includes('information_schema.tables')) return startupTables.map((table_name) => ({ table_name }));
        return [];
      },
      async query(sql) {
        if (sql.includes('information_schema.tables')) return { rows: allTables.map((table_name) => ({ table_name })) };
        if (sql.includes('schema_migrations')) return { rows: P0_KNOWN_MIGRATIONS };
        if (sql.includes('pg_constraint') || sql.includes('pg_indexes') || sql.includes('pg_trigger')) {
          return { rows: Object.entries(P0_CRITICAL_OBJECTS).flatMap(([group, names]) => names.map((object_name) => ({
            object_type: group === 'foreignKeys' ? 'foreign_key' : group === 'indexes' ? 'index' : group.slice(0, -1),
            object_name,
          }))) };
        }
        return { rows: allColumns };
      },
    };
    await assert.doesNotReject(initDb({
      dbProvider: async () => validDb,
      schemaRunner: async () => {},
      migrationRunner: async () => {},
      compatibilityRunner: async () => {},
      seedRunner: async () => {},
    }));
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('initDb keeps SQLite P0-disabled without migration or schema_migrations queries', async () => {
  const events = [];
  const db = lifecycleDb(false, events);
  await initDb({
    dbProvider: async () => db,
    migrationRunner: async () => { throw new Error('P0 migrations must stay disabled'); },
    compatibilityRunner: async () => events.push('compatibility'),
    seedRunner: async () => events.push('seed'),
  });
  assert.deepEqual(events, ['sqlite-bootstrap', 'compatibility', 'seed']);
});

test('initDb rejects SQLite before legacy bootstrap when P0 is enabled', async () => {
  const events = [];
  const db = lifecycleDb(false, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  try {
    await assert.rejects(
      initDb({
        dbProvider: async () => db,
        compatibilityRunner: async () => events.push('compatibility'),
        seedRunner: async () => events.push('seed'),
      }),
      /P0_MIGRATIONS_REQUIRE_POSTGRES/,
    );
    assert.deepEqual(events, []);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('initDb preserves SQLite legacy startup when P0 is explicitly disabled', async () => {
  const events = [];
  const db = lifecycleDb(false, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  process.env.PENYALURAN_P0_ENABLED = 'false';
  try {
    await initDb({
      dbProvider: async () => db,
      migrationRunner: async () => { throw new Error('P0 migrations must stay disabled'); },
      p0SchemaVerifier: async () => { throw new Error('P0 verifier must stay disabled'); },
      compatibilityRunner: async () => events.push('compatibility'),
      seedRunner: async () => events.push('seed'),
    });
    assert.deepEqual(events, ['sqlite-bootstrap', 'compatibility', 'seed']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
  }
});

test('initDb stops before compatibility and seed when PostgreSQL migration fails', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  const previous = process.env.PENYALURAN_P0_ENABLED;
  const previousCutoverAt = process.env.PENYALURAN_P0_CUTOVER_AT;
  process.env.PENYALURAN_P0_ENABLED = 'true';
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';
  try {
    await assert.rejects(
      startServer(0, {
        initDbFn: () => initDb({
          dbProvider: async () => db,
          schemaRunner: async () => events.push('schema.sql'),
          migrationRunner: async () => {
            events.push('migrations');
            throw new Error('MIGRATION_FAILED');
          },
          compatibilityRunner: async () => events.push('compatibility'),
          seedRunner: async () => events.push('seed'),
        }),
        skipAncillaryStartup: true,
        listenFn: () => {
          events.push('listen');
          return { close() {} };
        },
      }),
      /MIGRATION_FAILED/,
    );
    assert.deepEqual(events, ['schema.sql', 'migrations']);
  } finally {
    if (previous === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previous;
    if (previousCutoverAt === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT;
    else process.env.PENYALURAN_P0_CUTOVER_AT = previousCutoverAt;
  }
});

test('initDb fails closed for a partial PostgreSQL legacy schema before migrations', async () => {
  const events = [];
  const db = lifecycleDb(true, events);
  db.all = async (sql) => {
    if (sql.includes('information_schema.tables')) return [{ table_name: 'mustahik' }];
    return [];
  };
  await assert.rejects(
    initDb({
      dbProvider: async () => db,
      schemaRunner: async () => events.push('schema.sql'),
      migrationRunner: async () => events.push('migrations'),
      compatibilityRunner: async () => events.push('compatibility'),
      seedRunner: async () => events.push('seed'),
    }),
    /P0_REQUIRED_LEGACY_TABLES_MISSING.*applications.*assessments/,
  );
  assert.deepEqual(events, []);
});

test('initDb rejects injected lifecycle seams outside the test environment', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(
      initDb({ dbProvider: async () => lifecycleDb(true, []) }),
      /P0_TEST_SEAMS_REQUIRE_TEST_ENV/,
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('startServer rejects skipAncillaryStartup and listener seams outside the test environment', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(
      startServer(0, {
        initDbFn: async () => {},
        skipAncillaryStartup: true,
        listenFn: () => ({ close() {} }),
      }),
      /P0_TEST_SEAMS_REQUIRE_TEST_ENV/,
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
