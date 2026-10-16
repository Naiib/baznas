import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import pg from 'pg';
import { collectP0MigrationDryRun, runPendingMigrations } from '../server/penyaluran-p0/migration-runner.js';
import { assertSyntheticTarget, buildLegacyHashQuery, createRehearsalDatabaseNames, hashLegacyRows, legacyPreservationTables, SYNTHETIC_CONTAINER_NAME, SYNTHETIC_IMAGE, SYNTHETIC_PORT } from './m6-rehearsal-core.js';

const execFileAsync = promisify(execFile);
const { Client, Pool } = pg;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(rootDir, 'server', 'migrations');
const host = '127.0.0.1';
const user = 'postgres';

function quoteDb(name) {
  if (!/^m6_rehearsal_\d{8}_[a-f0-9]{8}_(?:source|restored)$/.test(name)) throw new Error('Refusing non-rehearsal database name');
  return '"' + name + '"';
}

async function docker(args) {
  return execFileAsync('docker', args, { maxBuffer: 32 * 1024 * 1024 });
}

async function inspectTarget() {
  const { stdout } = await docker(['inspect', SYNTHETIC_CONTAINER_NAME]);
  const [c] = JSON.parse(stdout);
  const binding = (c?.NetworkSettings?.Ports?.['5432/tcp'] ?? []).find((p) => p.HostIp === host && p.HostPort === String(SYNTHETIC_PORT));
  return {
    allowFlag: process.env.P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16,
    host, port: SYNTHETIC_PORT,
    containerName: String(c?.Name ?? '').replace(/^\//, ''),
    image: c?.Config?.Image, running: c?.State?.Running === true,
    publishedPort: binding?.HostPort, serverVersionNum: null,
    containerId: c?.Id,
  };
}

function hash(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function readLegacyColumnManifest(client) {
  const manifest = {};
  for (const table of legacyPreservationTables) {
    const { rows } = await client.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position',
      [table],
    );
    manifest[table] = rows.map((row) => row.column_name);
    if (!manifest[table].includes('id')) throw new Error('Legacy table has no id column: ' + table);
  }
  return manifest;
}

async function hashLegacyTables(client, columnsByTable) {
  const result = {};
  for (const table of legacyPreservationTables) {
    const { rows, rowCount } = await client.query(buildLegacyHashQuery(table, columnsByTable[table]));
    result[table] = { rows: rowCount, sha256: hashLegacyRows(rows) };
  }
  return result;
}

function assertHashes(label, expected, actual) {
  for (const table of legacyPreservationTables) {
    if (expected[table].rows !== actual[table].rows || expected[table].sha256 !== actual[table].sha256) {
      throw new Error(label + ': row count/hash mismatch for ' + table);
    }
  }
}

export async function cleanupRehearsalResources({
  restoredPool,
  sourceClient,
  adminClient,
  adminConnected,
  createdDatabaseNames,
  dumpPath,
  containerName,
  runDocker,
  onDatabaseDropped = () => {},
}) {
  const errors = [];
  const attempt = async (label, operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push({ label, error });
    }
  };

  if (restoredPool) await attempt('close restored pool', () => restoredPool.end());
  if (sourceClient) await attempt('close source client', () => sourceClient.end());
  if (adminConnected && adminClient) {
    for (const name of [...createdDatabaseNames].reverse()) {
      let safeName;
      try {
        safeName = quoteDb(name);
      } catch (error) {
        errors.push({ label: 'validate disposable database name ' + name, error });
        continue;
      }
      await attempt('terminate ' + name, () => adminClient.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [name],
      ));
      await attempt('drop ' + name, async () => {
        await adminClient.query('DROP DATABASE IF EXISTS ' + safeName);
        onDatabaseDropped(name);
      });
    }
  }
  if (dumpPath && containerName && runDocker) {
    await attempt('remove logical archive', () => runDocker(['exec', containerName, 'rm', '-f', '--', dumpPath]));
  }
  if (adminClient) await attempt('close admin client', () => adminClient.end());
  return errors;
}
export async function runM6Rehearsal() {
  const target = await inspectTarget();
  const admin = new Client({ host, port: SYNTHETIC_PORT, user, database: 'postgres' });
  const token = new Date().toISOString().slice(0, 10).replaceAll('-', '') + '_' + crypto.randomBytes(4).toString('hex');
  const names = createRehearsalDatabaseNames(token);
  const dumpPath = '/tmp/' + names.source + '.dump';
  const created = [];
  let source;
  let restored;
  let connected = false;
  let rehearsalError;
  try {
    await admin.connect();
    connected = true;
    const identity = await admin.query("SELECT current_database() AS db, current_setting('server_version_num') AS v");
    target.serverVersionNum = identity.rows[0].v;
    assertSyntheticTarget(target);
    if (identity.rows[0].db !== 'postgres') throw new Error('Expected postgres maintenance database');
    console.log('Verified synthetic container ' + SYNTHETIC_CONTAINER_NAME + ' (' + SYNTHETIC_IMAGE + '), id ' + target.containerId.slice(0, 12) + ', PostgreSQL ' + target.serverVersionNum);

    await admin.query('CREATE DATABASE ' + quoteDb(names.source));
    created.push(names.source);
    source = new Client({ host, port: SYNTHETIC_PORT, user, database: names.source });
    await source.connect();

    const parity = await fs.readFile(path.join(rootDir, 'server', 'migration-parity.test.js'), 'utf8');
    const fixture = parity.match(/const legacyFixtureSql = `([\s\S]*?)`;/);
    if (!fixture) throw new Error('Could not extract the synthetic legacyFixtureSql');
    await source.query(fixture[1]);
    const sourceColumns = await readLegacyColumnManifest(source);
    const before = await hashLegacyTables(source, sourceColumns);
    console.log('Seeded source and recorded all legacy preservation hashes:');
    for (const table of legacyPreservationTables) console.log('  ' + table + ': ' + JSON.stringify(before[table]));

    await docker(['exec', SYNTHETIC_CONTAINER_NAME, 'pg_dump', '-U', user, '-Fc', '--no-owner', '--no-privileges', '-f', dumpPath, names.source]);
    const toc = await docker(['exec', SYNTHETIC_CONTAINER_NAME, 'pg_restore', '-l', dumpPath]);
    const tocEntries = toc.stdout.split('\n').filter((line) => line.includes('TABLE DATA')).length;
    if (tocEntries === 0) throw new Error('pg_dump custom-format TOC has no table data');
    console.log('pg_dump -Fc created custom-format logical archive; pg_restore -l found ' + tocEntries + ' TABLE DATA entries.');

    await admin.query('CREATE DATABASE ' + quoteDb(names.restored));
    created.push(names.restored);
    await docker(['exec', SYNTHETIC_CONTAINER_NAME, 'pg_restore', '-U', user, '--dbname', names.restored, '--exit-on-error', '--no-owner', '--no-privileges', dumpPath]);
    console.log('pg_restore completed into separate database ' + names.restored + '.');

    restored = new Pool({ host, port: SYNTHETIC_PORT, user, database: names.restored });
    restored.isPg = true;
    const db = { isPg: true, query: (sql, params) => restored.query(sql, params), pool: restored };
    const restoredBefore = await hashLegacyTables(restored, sourceColumns);
    assertHashes('Independent source/restored comparison', before, restoredBefore);
    console.log('Source-vs-restored hashes match for all ' + legacyPreservationTables.length + ' legacy tables.');

    const dryRun = await collectP0MigrationDryRun(db);
    console.log('Restored database dry-run: ' + JSON.stringify(dryRun));
    await runPendingMigrations({ pool: restored, migrationsDir });
    await runPendingMigrations({ pool: restored, migrationsDir });
    await runPendingMigrations({ pool: restored, migrationsDir });
    console.log('Applied migration ledger: ' + JSON.stringify((await restored.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows));

    const sourceAfter = await hashLegacyTables(source, sourceColumns);
    const restoredAfter = await hashLegacyTables(restored, sourceColumns);
    assertHashes('Source immutability', before, sourceAfter);
    assertHashes('Post-migration preservation', before, restoredAfter);
    console.log('All ' + legacyPreservationTables.length + ' legacy table hashes match source and restored connections after migration.');
    for (const table of ['artifact_approvals', 'artifact_files', 'ppd_payments', 'recipient_confirmations']) {
      console.log(table + ': rows=' + (await restored.query('SELECT COUNT(*)::int AS n FROM "' + table + '"')).rows[0].n);
    }
    console.log('=== M6 SYNTHETIC LOGICAL DUMP/RESTORE REHEARSAL SUCCESSFUL ===');
  } catch (error) {
    rehearsalError = error;
    throw error;
  } finally {
    const cleanupErrors = await cleanupRehearsalResources({
      restoredPool: restored,
      sourceClient: source,
      adminClient: admin,
      adminConnected: connected,
      createdDatabaseNames: created,
      dumpPath,
      containerName: SYNTHETIC_CONTAINER_NAME,
      runDocker: docker,
      onDatabaseDropped: (name) => console.log('Cleaned disposable database ' + name + '.'),
    });
    if (cleanupErrors.length > 0) {
      const labeledErrors = cleanupErrors.map(({ label, error }) => new Error(label, { cause: error }));
      const failures = rehearsalError ? [rehearsalError, ...labeledErrors] : labeledErrors;
      throw new AggregateError(failures, 'M6 cleanup incomplete: ' + cleanupErrors.map(({ label }) => label).join('; '));
    }
  }
}
