import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLegacyUpgradeFixture, buildLegacyUpgradeFixtureSql } from './m1-legacy-fixture-seed.js';

const fixtureSource = [
  'const legacyFixtureSql = `',
  'CREATE TABLE activity_logs (mustahik_id INTEGER);',
  'INSERT INTO activity_logs VALUES (1);',
  '`;',
  '',
  'async function withSchema(client, schema, callback) {',
  '  return callback();',
  '}',
].join('\n');

test('builds the legacy upgrade seed from LF and CRLF source', () => {
  const expected = [
    'CREATE TABLE activity_logs (mustahik_id INTEGER);',
    'INSERT INTO activity_logs VALUES (1);',
    'DELETE FROM activity_logs WHERE mustahik_id IS NULL;',
    'ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL;',
    '',
  ].join('\n');
  const crlfSource = fixtureSource.replaceAll('\n', '\r\n');

  assert.equal(buildLegacyUpgradeFixtureSql(fixtureSource), expected);
  assert.equal(buildLegacyUpgradeFixtureSql(crlfSource), expected);
});

test('rejects missing or duplicated fixture boundaries', () => {
  assert.throws(() => buildLegacyUpgradeFixtureSql(fixtureSource.replace('async function withSchema', 'function changedBoundary')),
    /fixture boundary/);
  assert.throws(() => buildLegacyUpgradeFixtureSql(`${fixtureSource}\n${fixtureSource}`), /fixture boundary/);
});

test('rejects absent, non-test, non-loopback, and non-PostgreSQL URLs before creating a database client', async () => {
  let clientCreations = 0;
  const createClient = async () => {
    clientCreations += 1;
    return { query: async () => {}, close: async () => {} };
  };

  for (const { url, pattern } of [
    { url: undefined, pattern: /P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test/ },
    { url: 'postgresql://fixture:secret@localhost:5432/baznas_db', pattern: /P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test/ },
    { url: 'https://localhost/fixture_test', pattern: /P0_MIGRATIONS_REQUIRE_POSTGRES_TEST_DATABASE/ },
    { url: 'postgresql://fixture:secret@remote-host:5432/fixture_test', pattern: /P0_MIGRATIONS_REQUIRE_LOOPBACK_TEST_DATABASE/ },
    { url: 'postgresql://fixture:secret@remote-postgres.internal:5432/fixture_test', pattern: /P0_MIGRATIONS_REQUIRE_LOOPBACK_TEST_DATABASE/ },
    { url: 'postgresql://fixture:secret@192.168.1.50:5432/fixture_test', pattern: /P0_MIGRATIONS_REQUIRE_LOOPBACK_TEST_DATABASE/ },
    { url: 'postgresql://fixture:secret@10.0.0.1:5432/fixture_test', pattern: /P0_MIGRATIONS_REQUIRE_LOOPBACK_TEST_DATABASE/ },
  ]) {
    await assert.rejects(
      applyLegacyUpgradeFixture({ url, source: fixtureSource, createClient }),
      pattern,
    );
  }
  assert.equal(clientCreations, 0);
});

test('tightened target guard rejects migrated or invalid target database and applies fixture on valid database', async () => {
  let queries = [];
  let closed = false;
  const validUrl = 'postgresql://fixture:secret@127.0.0.1:5432/upgrade_rehearsal_test';

  // 1. Rejects if connected database reports non-test or baznas_db
  await assert.rejects(
    applyLegacyUpgradeFixture({
      url: validUrl,
      source: fixtureSource,
      createClient: async () => ({
        query: async (sql) => {
          if (sql.includes('current_database()')) return { rows: [{ db: 'baznas_db' }] };
          return { rows: [] };
        },
        close: async () => {},
      }),
    }),
    /P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test/,
  );

  // 2. Rejects if target database already has schema_migrations ledger
  await assert.rejects(
    applyLegacyUpgradeFixture({
      url: validUrl,
      source: fixtureSource,
      createClient: async () => ({
        query: async (sql) => {
          if (sql.includes('current_database()')) return { rows: [{ db: 'upgrade_rehearsal_test' }] };
          if (sql.includes('schema_migrations')) return { rows: [{ ledger: 'schema_migrations' }] };
          return { rows: [] };
        },
        close: async () => {},
      }),
    }),
    /P0_LEGACY_UPGRADE_FIXTURE_REQUIRES_UNMIGRATED_DATABASE/,
  );

  // 3. Applies successfully on valid unmigrated disposable database
  await applyLegacyUpgradeFixture({
    url: validUrl,
    source: fixtureSource,
    createClient: async () => ({
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes('current_database()')) return { rows: [{ db: 'upgrade_rehearsal_test' }] };
        if (sql.includes('schema_migrations')) return { rows: [{ ledger: null }] };
        return { rows: [] };
      },
      close: async () => { closed = true; },
    }),
  });

  assert.ok(closed, 'database client must be closed');
  assert.ok(queries.some((q) => q.includes('ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL')), 'fixture SQL executed');
});
