import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';
import { findTrackedMustahik } from './repository.js';

let db;

before(async () => {
  const memory = newDb();
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  db = { get: async (sql, values) => (await pool.query(sql, values)).rows[0] };
  await pool.query(`
    CREATE TABLE mustahik (
      id INTEGER PRIMARY KEY,
      file_no TEXT,
      nik TEXT,
      phone TEXT,
      kk_number TEXT
    )
  `);
  await pool.query(
    'INSERT INTO mustahik (id, file_no, nik, phone, kk_number) VALUES ($1, $2, $3, $4, $5)',
    [1, 'MST-202609-0001', '3671000000000001', '081200000001', '3671000000000002']
  );
});

test('wildcard tracking input cannot match a seeded application', async () => {
  assert.equal(await findTrackedMustahik(db, '%%%%%%%%'), undefined);
  assert.equal(await findTrackedMustahik(db, '________'), undefined);
  assert.equal(await findTrackedMustahik(db, 'MST-202609-____'), undefined);
  assert.equal(await findTrackedMustahik(db, '36710000%'), undefined);
});

test('tracking matches exact NIK, phone and family-card identifiers', async () => {
  for (const query of ['3671000000000001', '081200000001', '3671000000000002']) {
    assert.equal((await findTrackedMustahik(db, query)).id, 1);
  }
});

test('tracking still matches an exact file number case-insensitively', async () => {
  const result = await findTrackedMustahik(db, 'mst-202609-0001');
  assert.equal(result.id, 1);
});
