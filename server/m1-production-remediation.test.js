import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { assertDisposableTestDatabaseUrl } from './penyaluran-p0/migration-runner.js';

const { Pool } = pg;
const runbookPath = path.resolve(import.meta.dirname, '..', 'deploy', 'runbooks', '20260923-m1-production-remediation.sql');
const verificationPath = path.resolve(import.meta.dirname, '..', 'deploy', 'runbooks', '20260923-m1-production-remediation.verify.sql');
const targetIds = Array.from({ length: 28 }, (_, index) => 221 + index);
let createdFileFdwExtension = false;
const fixtureDdl = `
  CREATE TABLE users (id INTEGER PRIMARY KEY);
  CREATE TABLE mustahik (id INTEGER PRIMARY KEY, name TEXT NOT NULL, file_no TEXT NOT NULL, status TEXT NOT NULL, nik TEXT);
  CREATE TABLE applications (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE assessments (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE mpzis (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE ppd (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE documents (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE wa_logs (id INTEGER PRIMARY KEY, mustahik_id INTEGER NOT NULL);
  CREATE TABLE approval_decisions (
    id INTEGER PRIMARY KEY, mustahik_id INTEGER, actor_id INTEGER, actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL, actor_level TEXT, actor_division TEXT, stage TEXT NOT NULL,
    action TEXT NOT NULL, previous_status TEXT NOT NULL, next_status TEXT NOT NULL,
    note TEXT NOT NULL, approved_amount NUMERIC, prepared_by_id INTEGER, correlation_id TEXT
  );
  CREATE TABLE activity_logs (id INTEGER PRIMARY KEY, mustahik_id INTEGER, action_type TEXT);
  CREATE TABLE artifact_approvals (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
  CREATE TABLE artifact_files (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
  CREATE TABLE artifact_access_events (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
  CREATE TABLE mustahik_case_assignments (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
  CREATE TABLE p0_idempotency_keys (id INTEGER PRIMARY KEY, actor_id INTEGER, mustahik_id INTEGER);
  CREATE TABLE unexpected_case_child (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
  CREATE TABLE unreviewed_application_reference (id INTEGER PRIMARY KEY, application_id INTEGER);
  CREATE TABLE unreviewed_ppd_reference (id INTEGER PRIMARY KEY, ppd_id INTEGER);
`;

function schemaName(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 12)}`;
}

function quotedSchema(name) {
  assert.match(name, /^m1_remediation_(?:success|mismatch|child_mismatch)_[0-9a-f]+$/);
  return `"${name}"`;
}

async function withSchema(client, schema, callback) {
  const quoted = quotedSchema(schema);
  const quarantineSchema = `${schema}_quarantine`;
  const externalSchema = `${schema}_external`;
  const currentDbResult = await client.query('SELECT current_database() AS db');
  const currentDb = currentDbResult.rows[0].db;
  await client.query(`CREATE SCHEMA ${quoted}`);
  try {
    await client.query(`SET search_path TO ${quoted}, public`);
    await client.query(fixtureDdl);
    return await callback({
      schema,
      quarantineSchema,
      externalSchema,
      runbook: (sql) => sql
        .replaceAll('ops_quarantine', quarantineSchema)
        .replaceAll("current_database() <> 'baznas_db'", `current_database() <> '${currentDb}'`)
        .replaceAll("current_schema() <> 'public'", `current_schema() <> '${schema}'`),
    });
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    await client.query('SET search_path TO public');
    await client.query(`DROP SERVER IF EXISTS "${schema}_file_server" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "${quarantineSchema}" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "${externalSchema}" CASCADE`);
    await client.query(`DROP SCHEMA ${quoted} CASCADE`);
  }
}

async function seedFixture(client, { schema, crossSchemaFk = false, externalTargetColumn = false, externalApplicationId = false, publicApplicationId = false, externalPpdId = false, unsupportedLinkRelation = null, mismatch = false, unexpectedChild = false, badGroup = false, badApprovalDistribution = false, actorOutside = false, outsideDuplicate = false, userExists = false } = {}) {
  // Opaque test group sentinels exercise duplicate grouping without inventing NIK values.
  await client.query("INSERT INTO mustahik(id,name,file_no,status,nik) VALUES (1,'Retained case','MST-202609-RETAINED','Diajukan',$1)", [outsideDuplicate ? 'FIXTURE-NIK-GROUP-1' : null]);
  if (userExists) await client.query('INSERT INTO users(id) VALUES (99)');
  for (const id of targetIds) {
    const group = (id - 221) % 4;
    const name = [
      'Mustahik Test Surveyor Gate',
      'Mustahik Test Jump',
      'Mustahik Transisi Valid',
      'Mustahik Penolakan Valid',
    ][group];
    const status = ['Diajukan', 'Diajukan', 'Verifikasi Administrasi', 'Ditolak'][group];
    await client.query(
      'INSERT INTO mustahik(id,name,file_no,status,nik) VALUES ($1,$2,$3,$4,$5)',
      [id, mismatch && id === 221 ? 'Unexpected case' : name, `MST-202609-${String(id - 220).padStart(4, '0')}`, status, `FIXTURE-NIK-GROUP-${badGroup && id === 225 ? 2 : group + 1}`],
    );
    await client.query('INSERT INTO applications(id,mustahik_id) VALUES ($1,$1)', [id]);
    if (group === 2 || group === 3) {
      await client.query('INSERT INTO activity_logs(id,mustahik_id,action_type) VALUES ($1,$2,$3)', [id, id, group === 2 ? 'APPROVE' : 'REJECT']);
    }
  }
  if (publicApplicationId) await client.query('INSERT INTO unreviewed_application_reference VALUES (1,221)');
  if (unsupportedLinkRelation === 'view') {
    await client.query('CREATE VIEW unsupported_application_link AS SELECT 221::INTEGER AS application_id');
  } else if (unsupportedLinkRelation === 'materialized_view') {
    await client.query('CREATE MATERIALIZED VIEW unsupported_application_link AS SELECT 221::INTEGER AS application_id');
  } else if (unsupportedLinkRelation === 'foreign_table') {
    const wrapper = await client.query("SELECT 1 FROM pg_foreign_data_wrapper WHERE fdwname = 'file_fdw'");
    if (wrapper.rowCount === 0) {
      await client.query('CREATE EXTENSION file_fdw');
      createdFileFdwExtension = true;
    }
    await client.query(`CREATE SERVER "${schema}_file_server" FOREIGN DATA WRAPPER file_fdw`);
    await client.query(`CREATE FOREIGN TABLE unsupported_application_link(application_id INTEGER) SERVER "${schema}_file_server" OPTIONS (filename '/dev/null', format 'csv')`);
  }
  if (externalApplicationId || externalPpdId) {
    const externalSchema = `${schema}_external`;
    await client.query(`CREATE SCHEMA "${externalSchema}"`);
    if (externalApplicationId) {
      await client.query(`CREATE TABLE "${externalSchema}".legacy_application_child(id INTEGER PRIMARY KEY, application_id INTEGER)`);
      await client.query(`INSERT INTO "${externalSchema}".legacy_application_child VALUES (1,221)`);
    }
    if (externalPpdId) {
      await client.query('INSERT INTO ppd(id,mustahik_id) VALUES (900,221)');
      await client.query(`CREATE TABLE "${externalSchema}".legacy_ppd_child(id INTEGER PRIMARY KEY, ppd_id INTEGER)`);
      await client.query(`INSERT INTO "${externalSchema}".legacy_ppd_child VALUES (1,900)`);
    }
  }
  const decisionMustahikIds = targetIds.filter((id) => [2, 3].includes((id - 221) % 4));
  for (let index = 0; index < decisionMustahikIds.length; index += 1) {
    const id = index + 1;
    const actorMustahikId = actorOutside && id === 1 ? 1 : decisionMustahikIds[index];
    const action = badApprovalDistribution && id === 1
      ? 'reject'
      : (actorMustahikId - 221) % 4 === 2 ? 'approve' : 'reject';
    await client.query(
      `INSERT INTO approval_decisions
        (id,mustahik_id,actor_id,actor_name,actor_role,actor_level,actor_division,stage,action,previous_status,next_status,note)
       VALUES ($1,$2,99,'penyaluran Test User','penyaluran','staff','Penyaluran','Diajukan',$3,'Diajukan','Diajukan','fixture snapshot')`,
      [id, actorMustahikId, action],
    );
  }
  if (unexpectedChild) await client.query('INSERT INTO unexpected_case_child(id,mustahik_id) VALUES (1,221)');
  if (crossSchemaFk || externalTargetColumn) {
    const externalSchema = `${schema}_external`;
    await client.query(`CREATE SCHEMA "${externalSchema}"`);
    if (crossSchemaFk) {
      await client.query(`CREATE TABLE "${externalSchema}".external_child(id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES "${schema}".mustahik(id))`);
    }
    if (externalTargetColumn) {
      await client.query(`CREATE TABLE "${externalSchema}".legacy_child(id INTEGER PRIMARY KEY, mustahik_id INTEGER)`);
      await client.query(`INSERT INTO "${externalSchema}".legacy_child VALUES (1,221)`);
    }
  }
}

async function expectRunbookFailure(client, runbookSql, pattern = /M1_REMEDIATION_PRECONDITION_FAILED/) {
  try {
    await client.query(runbookSql);
    assert.fail('Expected remediation transaction to fail closed');
  } catch (error) {
    await client.query('ROLLBACK');
    assert.match(error.message, pattern);
  }
}

async function expectSqlFailure(client, sql, pattern) {
  try {
    await client.query(sql);
    assert.fail('Expected SQL to fail closed');
  } catch (error) {
    await client.query('ROLLBACK');
    assert.match(error.message, pattern);
  }
}

async function assertQuarantineWasRolledBack(client, schema) {
  const result = await client.query('SELECT to_regnamespace($1) IS NULL AS rolled_back', [schema]);
  assert.equal(result.rows[0].rolled_back, true);
}

test('M1 remediation SQL declares the exact-target, quarantine, and verification contract', async () => {
  const [runbook, verification] = await Promise.all([fs.readFile(runbookPath, 'utf8'), fs.readFile(verificationPath, 'utf8')]);
  assert.match(runbook, /pg_advisory_xact_lock/);
  assert.match(runbook, /BEGIN;/);
  assert.match(runbook, /COMMIT;/);
  assert.match(runbook, /221/);
  assert.match(runbook, /248/);
  assert.match(runbook, /ops_quarantine/);
  assert.match(runbook, /to_jsonb/);
  assert.match(runbook, /count\s*\(distinct\s+nik\)/i);
  assert.match(runbook, /actor_id\s*=\s*99/);
  assert.match(runbook, /M1_REMEDIATION_PRECONDITION_FAILED/);
  assert.match(runbook, /M1_REMEDIATION_POSTCONDITION_FAILED/);
  assert.match(runbook, /external_application_reference/);
  assert.match(runbook, /external_ppd_reference/);
  assert.match(runbook, /unsupported_link_relation/);
  assert.match(runbook, /m\.file_no = 'MST-202609-'/);
  assert.doesNotMatch(runbook, /\b\d{16}\b/);
  assert.match(verification, /BEGIN(?: ISOLATION LEVEL [^;]+)?;/);
  assert.match(verification, /SET TRANSACTION READ ONLY/);
  assert.match(verification, /external_application_reference/);
  assert.match(verification, /external_ppd_reference/);
  assert.match(verification, /unsupported_link_relation/);
  assert.match(verification, /remaining_application_reference/);
  assert.match(verification, /ops_quarantine/);
  assert.equal(targetIds.length, 28);
});

test('M1 remediation PG harness rejects non-test and non-loopback database URLs', () => {
  assert.throws(() => assertDisposableTestDatabaseUrl('postgres://u:p@127.0.0.1/baznas_db'), /_test/);
  const parsed = assertDisposableTestDatabaseUrl('postgres://u:p@127.0.0.1/m1_remediation_test');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname.toLowerCase()));
});

test('M1 rejects link columns on views, materialized views, and foreign tables before remediation', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const source = await fs.readFile(runbookPath, 'utf8');
  const verifySource = await fs.readFile(verificationPath, 'utf8');
  const parsedTestUrl = assertDisposableTestDatabaseUrl(process.env.P0_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsedTestUrl.hostname.toLowerCase()), 'M1 PG integration tests require a loopback database host');
  const pool = new Pool({ connectionString: process.env.P0_TEST_DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    for (const unsupportedLinkRelation of ['view', 'materialized_view', 'foreign_table']) {
      await withSchema(client, schemaName('m1_remediation_child_mismatch'), async ({ quarantineSchema, runbook, schema }) => {
        await seedFixture(client, { schema, unsupportedLinkRelation });
        await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_PREFLIGHT_FAILED:unsupported_link_relation/);
        await expectRunbookFailure(client, runbook(source), /M1_REMEDIATION_PRECONDITION_FAILED:unsupported_link_relation/);
        assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
        await assertQuarantineWasRolledBack(client, quarantineSchema);
      });
    }
  } finally {
    client.release();
    await pool.end();
    if (createdFileFdwExtension) {
      const cleanupPool = new Pool({ connectionString: process.env.P0_TEST_DATABASE_URL, max: 1 });
      await cleanupPool.query('DROP EXTENSION IF EXISTS file_fdw');
      await cleanupPool.end();
      createdFileFdwExtension = false;
    }
  }
});

test('M1 remediation snapshots, removes only reviewed rows, and safely no-ops after completion', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const source = await fs.readFile(runbookPath, 'utf8');
  const verifySource = await fs.readFile(verificationPath, 'utf8');
  const parsedTestUrl = assertDisposableTestDatabaseUrl(process.env.P0_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsedTestUrl.hostname.toLowerCase()), 'M1 PG integration tests require a loopback database host');
  const pool = new Pool({ connectionString: process.env.P0_TEST_DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await withSchema(client, schemaName('m1_remediation_success'), async ({ quarantineSchema, runbook }) => {
      await seedFixture(client);
      const sql = runbook(source);
      await client.query(runbook(verifySource));
      await client.query(sql);
      const state = await client.query(`
        SELECT (SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248) AS remaining_targets,
               (SELECT COUNT(*) FROM applications WHERE mustahik_id BETWEEN 221 AND 248) AS remaining_apps,
               (SELECT COUNT(*) FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248) AS remaining_activity,
               (SELECT COUNT(*) FROM approval_decisions WHERE actor_id=99) AS orphan_actors,
               (SELECT COUNT(*) FROM ${quarantineSchema}.remediation_runs WHERE status='completed') AS completed_runs,
               (SELECT COUNT(*) FROM ${quarantineSchema}.row_snapshots) AS snapshots,
               (SELECT COUNT(*) FROM ${quarantineSchema}.row_snapshots WHERE entity_type='mustahik') AS parent_snapshots,
               (SELECT COUNT(*) FROM ${quarantineSchema}.row_snapshots WHERE entity_type='approval_decisions') AS actor_snapshots,
               (SELECT COUNT(*) FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248) AS remaining_case_decisions
      `);
      assert.deepEqual(Object.values(state.rows[0]).map(Number), [0, 0, 0, 0, 1, 84, 28, 14, 0]);
      await client.query('INSERT INTO unreviewed_application_reference VALUES (1,221)');
      await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_VERIFY_FAILED:remaining_application_reference/);
      await client.query('DELETE FROM unreviewed_application_reference WHERE id = 1');
      const beforeRerun = await client.query(`SELECT count(*)::int AS n FROM ${quarantineSchema}.row_snapshots`);
      await client.query(sql);
      await client.query(runbook(verifySource));
      const afterRerun = await client.query(`SELECT count(*)::int AS n FROM ${quarantineSchema}.row_snapshots`);
      assert.equal(afterRerun.rows[0].n, beforeRerun.rows[0].n);
      assert.equal(Number((await client.query(`SELECT COUNT(*) FROM ${quarantineSchema}.remediation_runs WHERE status='completed'`)).rows[0].count), 1);
    });

    await withSchema(client, schemaName('m1_remediation_mismatch'), async ({ quarantineSchema, runbook }) => {
      await seedFixture(client, { mismatch: true });
      await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_PREFLIGHT_FAILED/);
      await expectRunbookFailure(client, runbook(source));
      assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
      await assertQuarantineWasRolledBack(client, quarantineSchema);
    });

    await withSchema(client, schemaName('m1_remediation_child_mismatch'), async ({ quarantineSchema, runbook }) => {
      await seedFixture(client, { unexpectedChild: true });
      await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_PREFLIGHT_FAILED/);
      await expectRunbookFailure(client, runbook(source));
      assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
      await assertQuarantineWasRolledBack(client, quarantineSchema);
    });

    await withSchema(client, schemaName('m1_remediation_child_mismatch'), async ({ quarantineSchema, runbook }) => {
      await seedFixture(client, { badGroup: true });
      await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_PREFLIGHT_FAILED/);
      await expectRunbookFailure(client, runbook(source));
      assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
      await assertQuarantineWasRolledBack(client, quarantineSchema);
    });

    await withSchema(client, schemaName('m1_remediation_child_mismatch'), async ({ quarantineSchema, runbook }) => {
      await seedFixture(client, { actorOutside: true });
      await expectSqlFailure(client, runbook(verifySource), /M1_REMEDIATION_PREFLIGHT_FAILED/);
      await expectRunbookFailure(client, runbook(source));
      assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
      await assertQuarantineWasRolledBack(client, quarantineSchema);
    });

    for (const { fixture: mismatch, pattern } of [
      { fixture: { outsideDuplicate: true } },
      { fixture: { userExists: true } },
      { fixture: { badApprovalDistribution: true } },
      { fixture: { crossSchemaFk: true } },
      { fixture: { externalTargetColumn: true } },
      { fixture: { externalApplicationId: true }, pattern: /external_application_reference/ },
      { fixture: { publicApplicationId: true }, pattern: /external_application_reference/ },
      { fixture: { externalPpdId: true }, pattern: /external_ppd_reference/ },
    ]) {
      await withSchema(client, schemaName('m1_remediation_child_mismatch'), async ({ quarantineSchema, runbook, schema }) => {
        await seedFixture(client, { ...mismatch, schema });
        const preflightPattern = pattern
          ? new RegExp(`M1_REMEDIATION_PREFLIGHT_FAILED:${pattern.source}`)
          : /M1_REMEDIATION_PREFLIGHT_FAILED/;
        const remediationPattern = pattern
          ? new RegExp(`M1_REMEDIATION_PRECONDITION_FAILED:${pattern.source}`)
          : /M1_REMEDIATION_PRECONDITION_FAILED/;
        await expectSqlFailure(client, runbook(verifySource), preflightPattern);
        await expectRunbookFailure(client, runbook(source), remediationPattern);
        assert.equal(Number((await client.query('SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248')).rows[0].count), 28);
        await assertQuarantineWasRolledBack(client, quarantineSchema);
      });
    }
  } finally {
    client.release();
    await pool.end();
    if (createdFileFdwExtension) {
      const cleanupPool = new Pool({ connectionString: process.env.P0_TEST_DATABASE_URL, max: 1 });
      await cleanupPool.query('DROP EXTENSION IF EXISTS file_fdw');
      await cleanupPool.end();
    }
  }
});
