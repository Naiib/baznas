import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { queryPenyaluranTransactions } from './repository.js';

test('postgres: transaction journal normalizes timestamp fallback before COALESCE', async () => {
  let emittedSql = '';
  const db = {
    isPg: true,
    all: async (sql) => {
      emittedSql = sql;
      return [];
    },
  };

  await queryPenyaluranTransactions(db);

  assert.match(
    emittedSql,
    /COALESCE\(NULLIF\(p\.disbursement_date, ''\), CAST\(p\.created_at AS TEXT\)\)/,
  );
  assert.doesNotMatch(emittedSql, /CAST\(NULLIF\(p\.disbursement_date/);
});

test('sqlite: transaction journal keeps full ISO date ordering', async (t) => {
  const memory = await open({ filename: ':memory:', driver: sqlite3.Database });
  t.after(() => memory.close());
  const db = {
    isPg: false,
    all: (sql, args = []) => memory.all(sql.replace(/\$\d+/g, '?'), args),
  };

  await memory.exec(`
    CREATE TABLE mustahik (
      id INTEGER PRIMARY KEY, file_no TEXT, name TEXT, program TEXT,
      asnaf TEXT, kecamatan TEXT, status TEXT
    );
    CREATE TABLE ppd (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER, transaction_number TEXT,
      ppd_number TEXT, form_number TEXT, amount NUMERIC, purpose TEXT,
      payment_type TEXT, disbursement_date TEXT, created_at TEXT
    );
    INSERT INTO mustahik (id, name) VALUES (1, 'Penerima Baru'), (2, 'Penerima Lama');
    INSERT INTO ppd (id, mustahik_id, transaction_number, amount, disbursement_date, created_at)
    VALUES
      (1, 1, 'TRX-NEW', 2000000, '2026-09-01', '2026-08-01 08:00:00'),
      (2, 2, 'TRX-OLD', 1000000, '2026-08-19', '2026-08-29 02:06:52');
  `);

  const rows = await queryPenyaluranTransactions(db);

  assert.deepEqual(rows.map((row) => row.transaction_number), ['TRX-NEW', 'TRX-OLD']);
});
