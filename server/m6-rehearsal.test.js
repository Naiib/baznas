import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSyntheticTarget,
  buildLegacyHashQuery,
  createRehearsalDatabaseNames,
  hashLegacyRows,
  legacyPreservationTables,
  quotePgIdentifier,
} from '../scripts/m6-rehearsal-core.js';

import { cleanupRehearsalResources } from '../scripts/rehearse-m6-logical-restore.js';

const validTarget = Object.freeze({
  allowFlag: '1',
  host: '127.0.0.1',
  port: 55439,
  containerName: 'baznas-m1-synthetic-pg16-20260926',
  image: 'postgres:16-alpine',
  running: true,
  publishedPort: '55439',
  serverVersionNum: '160004',
});

test('M6 rehearsal requires the explicit synthetic PostgreSQL 16 target', () => {
  assert.equal(assertSyntheticTarget(validTarget), true);
  for (const change of [
    { allowFlag: undefined },
    { allowFlag: '0' },
    { host: 'db.production.example' },
    { port: 5432 },
    { containerName: 'web_baznas-postgres-1' },
    { image: 'postgres:15-alpine' },
    { running: false },
    { publishedPort: '5432' },
    { serverVersionNum: '150009' },
  ]) {
    assert.throws(() => assertSyntheticTarget({ ...validTarget, ...change }), /synthetic PostgreSQL 16/i);
  }
});

test('M6 rehearsal database names are unique, disposable, and identifier-safe', () => {
  const first = createRehearsalDatabaseNames('20260927_a1b2c3d4');
  const second = createRehearsalDatabaseNames('20260927_e5f6a7b8');
  assert.notDeepEqual(first, second);
  for (const name of [...Object.values(first), ...Object.values(second)]) {
    assert.match(name, /^m6_rehearsal_[0-9a-z_]+_(?:source|restored)$/);
    assert.doesNotMatch(name, /baznas|prod|web_baznas/i);
  }
});

test('M6 preservation manifest is exactly the collected legacy workflow table set', () => {
  const expected = ['mustahik', 'applications', 'assessments', 'mpzis', 'ppd', 'documents', 'approval_decisions', 'activity_logs', 'wa_logs', 'ppd_payments', 'recipient_confirmations'];
  assert.deepEqual([...legacyPreservationTables].sort(), expected.sort());
});

test('M6 hash SQL safely quotes catalog identifiers and restricts tables to the manifest', () => {
  assert.equal(quotePgIdentifier('odd"column'), '"odd""column"');
  assert.equal(
    buildLegacyHashQuery('activity_logs', ['id', 'odd"column']),
    'SELECT "id", "odd""column" FROM "activity_logs" ORDER BY "id"',
  );
  assert.throws(() => quotePgIdentifier('bad\0name'), /invalid PostgreSQL identifier/i);
  assert.throws(() => buildLegacyHashQuery('users', ['id']), /not in preservation manifest/i);
});

test('M6 row hashes are deterministic and sensitive to changed legacy rows', () => {
  const rows = [{ id: 1, name: 'synthetic' }, { id: 2, name: null }];
  assert.equal(hashLegacyRows(rows), hashLegacyRows(structuredClone(rows)));
  assert.notEqual(hashLegacyRows(rows), hashLegacyRows([{ ...rows[0], name: 'changed' }, rows[1]]));
});

test('M6 cleanup attempts every independent disposable resource even when operations fail', async () => {
  const names = createRehearsalDatabaseNames('20260927_a1b2c3d4');
  const calls = [];
  const errors = await cleanupRehearsalResources({
    restoredPool: { async end() { calls.push('restored:end'); throw new Error('pool close failed'); } },
    sourceClient: { async end() { calls.push('source:end'); } },
    adminClient: {
      async query(sql, params) {
        const name = params?.[0] ?? (sql.includes(names.restored) ? names.restored : names.source);
        calls.push(`${sql.startsWith('SELECT pg_terminate_backend') ? 'terminate' : 'drop'}:${name}`);
        if (name === names.restored && sql.startsWith('SELECT pg_terminate_backend')) throw new Error('terminate failed');
        if (name === names.source && sql.startsWith('DROP DATABASE')) throw new Error('drop failed');
      },
      async end() { calls.push('admin:end'); throw new Error('admin close failed'); },
    },
    adminConnected: true,
    createdDatabaseNames: [names.source, names.restored],
    dumpPath: `/tmp/${names.source}.dump`,
    containerName: 'baznas-m1-synthetic-pg16-20260926',
    runDocker: async (args) => { calls.push(`archive:${args.at(-1)}`); throw new Error('archive cleanup failed'); },
  });

  assert.deepEqual(calls, [
    'restored:end', 'source:end', `terminate:${names.restored}`, `drop:${names.restored}`,
    `terminate:${names.source}`, `drop:${names.source}`, `archive:/tmp/${names.source}.dump`, 'admin:end',
  ]);
  assert.deepEqual(errors.map(({ label }) => label), [
    'close restored pool', `terminate ${names.restored}`, `drop ${names.source}`,
    'remove logical archive', 'close admin client',
  ]);
  assert.ok(errors.every(({ error }) => error instanceof Error));
});
