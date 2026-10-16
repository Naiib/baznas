import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDisposableTestDatabaseUrl } from './penyaluran-p0/migration-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openingBoundary = 'const legacyFixtureSql = `\n';
const closingBoundary = '\n`;\n\nasync function withSchema(';

function occurrenceCount(source, boundary) {
  return source.split(boundary).length - 1;
}

export function buildLegacyUpgradeFixtureSql(source) {
  const normalizedSource = source.replace(/\r\n?/g, '\n');
  if (occurrenceCount(normalizedSource, openingBoundary) !== 1
      || occurrenceCount(normalizedSource, closingBoundary) !== 1) {
    throw new Error('Unexpected legacy fixture boundary in migration-parity.test.js');
  }

  const start = normalizedSource.indexOf(openingBoundary) + openingBoundary.length;
  const end = normalizedSource.indexOf(closingBoundary);
  if (start >= end) {
    throw new Error('Unexpected legacy fixture boundary order in migration-parity.test.js');
  }

  const fixtureSql = normalizedSource.slice(start, end);
  if (!fixtureSql.trim()) {
    throw new Error('Legacy fixture SQL is empty');
  }

  return `${fixtureSql.trim()}\nDELETE FROM activity_logs WHERE mustahik_id IS NULL;\nALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL;\n`;
}

export function isLoopbackHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (/^127(?:\.\d+){3}$/.test(h)) return true;
  return false;
}

export async function applyLegacyUpgradeFixture({ url, source, createClient }) {
  const parsedUrl = assertDisposableTestDatabaseUrl(url);
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES_TEST_DATABASE');
  }
  if (!isLoopbackHost(parsedUrl.hostname)) {
    throw new Error('P0_MIGRATIONS_REQUIRE_LOOPBACK_TEST_DATABASE');
  }
  const dbName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')).toLowerCase();
  if (dbName === 'baznas_db' || !dbName.endsWith('_test')) {
    throw new Error('P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test');
  }
  if (typeof createClient !== 'function') {
    throw new TypeError('createClient must be a function');
  }

  const sql = buildLegacyUpgradeFixtureSql(source);
  const client = await createClient(url);
  try {
    const dbRes = await client.query('SELECT current_database() AS db');
    const currentDb = String(dbRes?.rows?.[0]?.db || '');
    if (!/_test$/i.test(currentDb) || currentDb.toLowerCase() === 'baznas_db') {
      throw new Error('P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test');
    }
    const ledgerRes = await client.query("SELECT to_regclass('schema_migrations') AS ledger");
    if (ledgerRes?.rows?.[0]?.ledger) {
      throw new Error('P0_LEGACY_UPGRADE_FIXTURE_REQUIRES_UNMIGRATED_DATABASE');
    }
    await client.query(sql);
  } finally {
    await client.close();
  }
}

async function main() {
  const mode = process.argv[2];
  if (process.argv.length > 3 || (mode !== undefined && mode !== '--apply')) {
    throw new Error('Usage: node server/m1-legacy-fixture-seed.js [--apply]');
  }
  const source = await fs.readFile(path.join(__dirname, 'migration-parity.test.js'), 'utf8');
  if (mode === '--apply') {
    await applyLegacyUpgradeFixture({
      url: process.env.P0_TEST_DATABASE_URL,
      source,
      createClient: async (connectionString) => {
        const pool = new pg.Pool({ connectionString });
        return {
          query: (sql) => pool.query(sql),
          close: () => pool.end(),
        };
      },
    });
    process.stdout.write('M1_LEGACY_FIXTURE_SEEDED\n');
    return;
  }
  process.stdout.write(buildLegacyUpgradeFixtureSql(source));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
