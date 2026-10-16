import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requiresPostgres,
  allowsDemoSeed,
} from './runtime-policy.js';
import { getDb } from './db.js';

test('production requires PostgreSQL and forbids demo seed data', () => {
  assert.equal(requiresPostgres({ NODE_ENV: 'production' }), true);
  assert.equal(allowsDemoSeed({ NODE_ENV: 'production' }), false);
});

test('development keeps explicit local fallback and seed support', () => {
  assert.equal(requiresPostgres({ NODE_ENV: 'development' }), false);
  assert.equal(allowsDemoSeed({ NODE_ENV: 'development' }), true);
});

test('test environments never use production database restrictions', () => {
  assert.equal(requiresPostgres({ NODE_ENV: 'test' }), false);
  assert.equal(allowsDemoSeed({ NODE_ENV: 'test' }), true);
});

test('production rejects a PostgreSQL connection failure instead of falling back to SQLite', async () => {
  const unavailablePool = {
    async connect() {
      throw new Error('connection refused');
    },
  };

  await assert.rejects(
    () => getDb({ env: { NODE_ENV: 'production' }, poolFactory: () => unavailablePool }),
    /PostgreSQL wajib tersedia di production/,
  );
});
