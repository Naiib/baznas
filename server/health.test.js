import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabaseHealth } from './health.js';

test('production health proves the database engine is PostgreSQL', async () => {
  const health = await getDatabaseHealth({
    isPg: true,
    get: async () => ({ ok: 1 }),
  }, { nodeEnv: 'production' });

  assert.deepEqual(health, {
    status: 'ready',
    checks: { database: 'ready', database_engine: 'postgresql' },
  });
});

test('production health rejects a SQLite database even when SELECT 1 succeeds', async () => {
  await assert.rejects(
    () => getDatabaseHealth({ isPg: false, get: async () => ({ ok: 1 }) }, { nodeEnv: 'production' }),
    (error) => error.code === 'POSTGRES_REQUIRED' && /PostgreSQL/.test(error.message),
  );
});

test('health probe failure is not reported as ready', async () => {
  await assert.rejects(
    () => getDatabaseHealth({ isPg: true, get: async () => { throw new Error('connection refused'); } }, { nodeEnv: 'production' }),
    /connection refused/,
  );
});
