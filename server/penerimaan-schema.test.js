import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { newDb } from 'pg-mem';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPenerimaanDdl, PENERIMAAN_DDL_MARKER } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaSqlPath = path.resolve(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');

const REQUIRED_TABLES = [
  'penerimaan_channels',
  'penerimaan_accounts',
  'muzakki',
  'penerimaan_reconciliation_batches',
  'penerimaan_statement_lines',
  'penerimaan_transactions',
  'penerimaan_matches',
  'penerimaan_approvals',
  'penerimaan_receipts',
  'penerimaan_raw_events',
  'penerimaan_import_jobs',
  'penerimaan_audit_events',
  'penerimaan_settings',
  'penerimaan_export_jobs',
];

const REQUIRED_INDEXES = [
  'idx_penerimaan_tx_status',
  'idx_penerimaan_tx_date',
  'idx_penerimaan_tx_channel',
  'idx_penerimaan_tx_muzakki',
  'idx_penerimaan_tx_batch',
  'idx_penerimaan_tx_approval_queue',
  'idx_penerimaan_raw_events_key',
  'idx_penerimaan_audit_entity',
];

test('schema drift protection: getPenerimaanDdl in db.js derives directly from schema.sql', () => {
  const ddlFromDb = getPenerimaanDdl();
  const markerIdx = schemaSql.indexOf(PENERIMAAN_DDL_MARKER);
  assert.ok(markerIdx !== -1, 'schema.sql must contain the Penerimaan DDL marker');

  const expectedDdl = schemaSql.slice(markerIdx);
  assert.equal(
    ddlFromDb,
    expectedDdl,
    'getPenerimaanDdl in db.js must match schema.sql Penerimaan section exactly without drift'
  );
});

test('schema.sql includes all required Penerimaan tables, constraints, and indexes', () => {
  for (const table of REQUIRED_TABLES) {
    assert.ok(
      schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `schema.sql must define CREATE TABLE IF NOT EXISTS ${table}`
    );
  }

  for (const idx of REQUIRED_INDEXES) {
    assert.ok(
      schemaSql.includes(idx),
      `schema.sql must define index ${idx}`
    );
  }

  // Check constraints
  assert.ok(schemaSql.includes('chk_penerimaan_tx_amount CHECK (amount > 0)'));
  assert.ok(schemaSql.includes('chk_penerimaan_tx_fee_amount CHECK (fee_amount >= 0)'));
  assert.ok(schemaSql.includes('chk_penerimaan_tx_net_amount CHECK (net_amount >= 0)'));
});

test('PostgreSQL migration executes cleanly and rerunnably for full schema', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    // First run
    await pool.query(schemaSql);

    // Second run (rerunnable / additive guarantee)
    await pool.query(schemaSql);

    // Verify all required tables exist
    const res = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r) => r.table_name);

    for (const reqTable of REQUIRED_TABLES) {
      assert.ok(
        tables.includes(reqTable),
        `PostgreSQL schema must contain table ${reqTable}`
      );
    }
  } finally {
    await pool.end();
  }
});

test('PostgreSQL schema enforces transaction idempotency on provider + channel + provider_ref', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    await pool.query(schemaSql);

    // Insert first transaction
    await pool.query(`
      INSERT INTO penerimaan_transactions (
        transaction_number, channel, channel_category, provider_name, provider_ref,
        muzakki_name, fund_type, amount, fee_amount, net_amount, status
      ) VALUES (
        'TRX-001', 'qris', 'digital', 'gopay', 'GOPAY-12345',
        'Ahmad Muzakki', 'zakat_maal', 1000000, 0, 1000000, 'Menunggu Validasi'
      )
    `);

    // Insert duplicate provider + channel + provider_ref should fail idempotency
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, provider_name, provider_ref,
            muzakki_name, fund_type, amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-002', 'qris', 'digital', 'gopay', 'GOPAY-12345',
            'Ahmad Muzakki', 'zakat_maal', 1000000, 0, 1000000, 'Menunggu Validasi'
          )
        `);
      },
      /unique|duplicate/i,
      'Duplicate provider_ref on the same provider must be rejected'
    );
  } finally {
    await pool.end();
  }
});

test('PostgreSQL schema enforces webhook idempotency_key uniqueness', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    await pool.query(schemaSql);

    await pool.query(`
      INSERT INTO penerimaan_raw_events (
        provider, idempotency_key, event_type, payload
      ) VALUES (
        'midtrans', 'IDEM-998877', 'payment.success', '{"order_id":"123"}'::jsonb
      )
    `);

    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_raw_events (
            provider, idempotency_key, event_type, payload
          ) VALUES (
            'midtrans', 'IDEM-998877', 'payment.success', '{"order_id":"123"}'::jsonb
          )
        `);
      },
      /unique|duplicate/i,
      'Duplicate webhook idempotency_key must be rejected'
    );
  } finally {
    await pool.end();
  }
});

test('PostgreSQL schema enforces constraints on receipts, batches, accounts, and channels', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    await pool.query(schemaSql);

    // Channel uniqueness
    await pool.query(`
      INSERT INTO penerimaan_channels (code, name, category)
      VALUES ('portal', 'Portal Donasi', 'digital')
    `);
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_channels (code, name, category)
          VALUES ('portal', 'Duplicate Portal', 'digital')
        `);
      },
      /unique|duplicate/i
    );

    // Account uniqueness (bank_name + account_number)
    await pool.query(`
      INSERT INTO penerimaan_accounts (bank_name, account_number, account_holder)
      VALUES ('BSI', '777000111', 'BAZNAS Kota Tangerang')
    `);
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_accounts (bank_name, account_number, account_holder)
          VALUES ('BSI', '777000111', 'BAZNAS Duplicate')
        `);
      },
      /unique|duplicate/i
    );

    // Batch number uniqueness
    await pool.query(`
      INSERT INTO penerimaan_reconciliation_batches (
        batch_number, channel, period_start, period_end
      ) VALUES (
        'BATCH-2026-09-001', 'qris', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_reconciliation_batches (
            batch_number, channel, period_start, period_end
          ) VALUES (
            'BATCH-2026-09-001', 'qris', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
        `);
      },
      /unique|duplicate/i
    );
  } finally {
    await pool.end();
  }
});

test('database enforces CHECK constraints on amount > 0, fee_amount >= 0, net_amount >= 0', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    await pool.query(schemaSql);

    // 1. amount = 0 must be rejected
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, muzakki_name, fund_type,
            amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-ZERO-01', 'qris', 'digital', 'Muzakki Test', 'zakat_maal',
            0, 0, 0, 'Masuk'
          )
        `);
      },
      /check/i,
      'amount <= 0 must be rejected by CHECK constraint'
    );

    // 2. negative amount must be rejected
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, muzakki_name, fund_type,
            amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-NEG-01', 'qris', 'digital', 'Muzakki Test', 'zakat_maal',
            -50000, 0, -50000, 'Masuk'
          )
        `);
      },
      /check/i,
      'negative amount must be rejected'
    );

    // 3. negative fee_amount must be rejected
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, muzakki_name, fund_type,
            amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-FEE-NEG', 'qris', 'digital', 'Muzakki Test', 'zakat_maal',
            100000, -100, 100100, 'Masuk'
          )
        `);
      },
      /check/i,
      'negative fee_amount must be rejected'
    );

    // 4. negative net_amount must be rejected
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, muzakki_name, fund_type,
            amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-NET-NEG', 'qris', 'digital', 'Muzakki Test', 'zakat_maal',
            100000, 120000, -20000, 'Masuk'
          )
        `);
      },
      /check/i,
      'negative net_amount must be rejected'
    );

    // 5. valid amount > 0, fee_amount >= 0, net_amount >= 0 succeeds
    await pool.query(`
      INSERT INTO penerimaan_transactions (
        transaction_number, channel, channel_category, muzakki_name, fund_type,
        amount, fee_amount, net_amount, status
      ) VALUES (
        'TRX-VALID-01', 'qris', 'digital', 'Muzakki Valid', 'zakat_maal',
        100000, 2500, 97500, 'Masuk'
      )
    `);
  } finally {
    await pool.end();
  }
});

test('PostgreSQL stores money as bigint integer minor units', async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();

  try {
    await pool.query(schemaSql);

    // Bigint amount: 50,000,000,000 (50 billion sen / minor units)
    const largeAmount = 50_000_000_000;
    await pool.query(`
      INSERT INTO penerimaan_transactions (
        transaction_number, channel, channel_category, muzakki_name, fund_type,
        amount, fee_amount, net_amount, status
      ) VALUES (
        'TRX-BIG-001', 'transfer_bank', 'digital', 'PT Amal Berkah', 'zakat_maal',
        ${largeAmount}, 5000, ${largeAmount - 5000}, 'Masuk'
      )
    `);

    const res = await pool.query(`
      SELECT amount, fee_amount, net_amount
      FROM penerimaan_transactions
      WHERE transaction_number = 'TRX-BIG-001'
    `);

    assert.equal(Number(res.rows[0].amount), largeAmount);
    assert.equal(Number(res.rows[0].fee_amount), 5000);
    assert.equal(Number(res.rows[0].net_amount), largeAmount - 5000);
  } finally {
    await pool.end();
  }
});

test('SQLite adapter executes Penerimaan DDL and creates all tables without syntax error', async () => {
  const memory = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const adaptSqlForSqlite = (sql) => {
      let adapted = sql;
      adapted = adapted.replace(/ILIKE/gi, 'LIKE');
      adapted = adapted.replace(/\$([0-9]+)/g, '?');
      adapted = adapted.replace(/\s+RETURNING\s+[\w\s,*()]+/gi, '');
      adapted = adapted.replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
      adapted = adapted.replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'TIMESTAMP');
      adapted = adapted.replace(/TIMESTAMPTZ/gi, 'TIMESTAMP');
      adapted = adapted.replace(/::jsonb/gi, '');
      adapted = adapted.replace(/JSONB/gi, 'TEXT');
      return adapted;
    };

    const penerimaanDdl = getPenerimaanDdl();

    const stmts = penerimaanDdl
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of stmts) {
      const adapted = adaptSqlForSqlite(stmt);
      await memory.exec(adapted);
    }

    const tables = await memory.all("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.map((t) => t.name);

    for (const reqTable of REQUIRED_TABLES) {
      assert.ok(
        tableNames.includes(reqTable),
        `SQLite schema must contain table ${reqTable}`
      );
    }

    // Also verify SQLite enforces the CHECK constraint
    await assert.rejects(
      async () => {
        await memory.run(`
          INSERT INTO penerimaan_transactions (
            transaction_number, channel, channel_category, muzakki_name, fund_type,
            amount, fee_amount, net_amount, status
          ) VALUES (
            'TRX-SQLITE-ZERO', 'qris', 'digital', 'Muzakki Test', 'zakat_maal',
            0, 0, 0, 'Masuk'
          )
        `);
      },
      /CHECK constraint failed/i,
      'SQLite must reject amount <= 0'
    );
  } finally {
    await memory.close();
  }
});
