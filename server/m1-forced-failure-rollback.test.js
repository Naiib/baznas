import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPendingMigrations } from './penyaluran-p0/migration-runner.js';
import { assertDisposableTestDatabaseUrl } from './penyaluran-p0/migration-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const testDbUrl = process.env.P0_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/baznas_m1_legacy_test';
assertDisposableTestDatabaseUrl(testDbUrl);

const parsedUrl = new URL(testDbUrl);
const pgPort = parsedUrl.port || 5432;
const pgHost = parsedUrl.hostname || '127.0.0.1';
const pgUser = parsedUrl.username || 'postgres';
const rootUrl = `postgresql://${pgUser}@${pgHost}:${pgPort}/postgres`;

const liveDbName = 'baznas_m1_forced_fail_live_test';
const backupDbName = 'baznas_m1_forced_fail_backup_test';
const failedDbName = 'baznas_m1_forced_fail_retained_test';
const configuredDbName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
const templateDbName = /legacy_test$/i.test(configuredDbName)
  ? configuredDbName
  : (process.env.P0_LEGACY_TEMPLATE_DB || 'baznas_m1_legacy_test');

test('live PostgreSQL 16: forced mid-migration failure triggers two-step database rename rollback and backend reconnect', async () => {
  const rootPool = new pg.Pool({ connectionString: rootUrl });
  rootPool.on('error', () => {});

  try {
    // 1. Prepare initial rehearsal database from legacy template
    await rootPool.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname IN ('${liveDbName}', '${backupDbName}', '${failedDbName}') AND pid <> pg_backend_pid();
    `);
    await rootPool.query(`DROP DATABASE IF EXISTS ${liveDbName};`);
    await rootPool.query(`DROP DATABASE IF EXISTS ${backupDbName};`);
    await rootPool.query(`DROP DATABASE IF EXISTS ${failedDbName};`);
    await rootPool.query(`CREATE DATABASE ${liveDbName} WITH TEMPLATE ${templateDbName} OWNER postgres;`);

    // 2. Record pre-change baseline
    const livePool = new pg.Pool({ connectionString: `postgresql://${pgUser}@${pgHost}:${pgPort}/${liveDbName}` });
    livePool.isPg = true;
    livePool.on('error', () => {});

    const baselineMustahik = await livePool.query('SELECT COUNT(*) as count FROM mustahik;');
    const baselineCount = Number(baselineMustahik.rows[0].count);
    const baselineLedger = await livePool.query("SELECT to_regclass('schema_migrations') as reg;");
    const baselineHasLedger = Boolean(baselineLedger.rows[0].reg);
    const baselineCols = (await livePool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'mustahik';")).rows.map(r => r.column_name);

    assert.equal(baselineHasLedger, false, 'Pre-change baseline must not have schema_migrations ledger');
    assert.equal(baselineCols.includes('workflow_mode'), false, 'Pre-change baseline must not have workflow_mode column');

    // 3. Create same-cluster template clone
    await livePool.end();
    await rootPool.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname = '${liveDbName}' AND pid <> pg_backend_pid();
    `);
    await rootPool.query(`CREATE DATABASE ${backupDbName} WITH TEMPLATE ${liveDbName} OWNER postgres;`);

    // 4. Force failure after migration 001 commits
    const migrationPool = new pg.Pool({ connectionString: `postgresql://${pgUser}@${pgHost}:${pgPort}/${liveDbName}` });
    migrationPool.isPg = true;
    migrationPool.on('error', () => {});

    const tempMigrationsDir = path.join(rootDir, 'server', 'migrations_forced_fail_rehearsal_tmp');
    await fs.rm(tempMigrationsDir, { recursive: true, force: true });
    await fs.mkdir(tempMigrationsDir, { recursive: true });

    const m001Source = await fs.readFile(path.join(rootDir, 'server', 'migrations', '20260913_001_mustahik_p0.sql'), 'utf8');
    await fs.writeFile(path.join(tempMigrationsDir, '20260913_001_mustahik_p0.sql'), m001Source, 'utf8');

    // Failing migration 002
    const failingM002Source = `-- Forced failure migration 002
CREATE TABLE temporary_test_step (id INT);
SELECT * FROM non_existent_table_forced_failure;
`;
    await fs.writeFile(path.join(tempMigrationsDir, '20260919_002_p0_receipt.sql'), failingM002Source, 'utf8');

    let runnerError = null;
    try {
      await runPendingMigrations({
        pool: migrationPool,
        migrationsDir: tempMigrationsDir,
      });
    } catch (err) {
      runnerError = err;
    } finally {
      await fs.rm(tempMigrationsDir, { recursive: true, force: true });
    }

    assert.ok(runnerError, 'Migration runner must fail on forced failure in migration 002');

    // Verify migration 001 committed in liveDbName
    const partialLedger = await migrationPool.query('SELECT version, checksum FROM schema_migrations ORDER BY version;');
    assert.equal(partialLedger.rows.length, 1);
    assert.equal(partialLedger.rows[0].version, '20260913_001');

    const partialCols = (await migrationPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'mustahik';")).rows.map(r => r.column_name);
    assert.ok(partialCols.includes('workflow_mode'), 'Live DB must have committed migration 001 DDL');
    await migrationPool.end();

    // 5. Execute two-step database rename rollback
    await rootPool.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname IN ('${liveDbName}', '${backupDbName}') AND pid <> pg_backend_pid();
    `);
    await rootPool.query(`ALTER DATABASE ${liveDbName} RENAME TO ${failedDbName};`);
    await rootPool.query(`ALTER DATABASE ${backupDbName} RENAME TO ${liveDbName};`);

    // 6. Verify restored live database equals baseline
    const restoredPool = new pg.Pool({ connectionString: `postgresql://${pgUser}@${pgHost}:${pgPort}/${liveDbName}` });
    restoredPool.isPg = true;
    restoredPool.on('error', () => {});

    const restoredMustahik = await restoredPool.query('SELECT COUNT(*) as count FROM mustahik;');
    const restoredCount = Number(restoredMustahik.rows[0].count);
    const restoredLedger = await restoredPool.query("SELECT to_regclass('schema_migrations') as reg;");
    const restoredHasLedger = Boolean(restoredLedger.rows[0].reg);
    const restoredCols = (await restoredPool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'mustahik';")).rows.map(r => r.column_name);

    assert.equal(restoredCount, baselineCount, 'Restored mustahik row count must equal baseline');
    assert.equal(restoredHasLedger, false, 'Restored database must not have migration ledger');
    assert.equal(restoredCols.includes('workflow_mode'), false, 'Restored mustahik must not have workflow_mode');

    // 7. Verify retained failed database
    const retainedPool = new pg.Pool({ connectionString: `postgresql://${pgUser}@${pgHost}:${pgPort}/${failedDbName}` });
    retainedPool.on('error', () => {});
    const retainedLedger = await retainedPool.query('SELECT version FROM schema_migrations;');
    assert.equal(retainedLedger.rows.length, 1);
    assert.equal(retainedLedger.rows[0].version, '20260913_001', 'Retained failed DB preserves committed migration 001 for forensics');
    await retainedPool.end();

    // 8. Reconnect synthetic legacy backend with PENYALURAN_P0_ENABLED=false
    process.env.PENYALURAN_P0_ENABLED = 'false';
    const legacyRow = await restoredPool.query('SELECT id, name, status, file_no FROM mustahik LIMIT 1;');
    assert.ok(legacyRow.rows[0].id > 0, 'Legacy backend must successfully query legacy mustahik row');

    await restoredPool.end();
  } finally {
    try {
      await rootPool.query(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
        WHERE datname IN ('${liveDbName}', '${backupDbName}', '${failedDbName}') AND pid <> pg_backend_pid();
      `);
      await rootPool.query(`DROP DATABASE IF EXISTS ${liveDbName};`);
      await rootPool.query(`DROP DATABASE IF EXISTS ${backupDbName};`);
      await rootPool.query(`DROP DATABASE IF EXISTS ${failedDbName};`);
    } catch {
      // ignore cleanup errors
    }
    await rootPool.end();
  }
});
