import test, { before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { getDb, initDb } = await import('./db.js');
const {
  createReconciliationBatch,
  importStatementLines,
  closeReconciliationBatch,
  fromIntegerCents,
  getBatchLockQueueSize,
} = await import('./repository.js');

const staff = {
  id: 901,
  name: 'Staff Import Test',
  role: 'penerimaan',
  division: 'Bidang Pengumpulan & ZIS',
  level: 'staff',
};

const leader = {
  id: 902,
  name: 'Leader Import Test',
  role: 'penerimaan',
  division: 'Bidang Pengumpulan & ZIS',
  level: 'leader',
};

before(async () => {
  await initDb();
});

async function createBatch(suffix) {
  return createReconciliationBatch({
    channel: 'bank_transfer',
    batch_number: `REC-IMPORT-ATOMIC-${suffix}-${Date.now()}`,
    period_start: '2026-09-01T00:00:00.000Z',
    period_end: '2026-09-30T23:59:59.999Z',
  }, staff);
}

function wrapDb(db, runInterceptor) {
  return {
    isPg: db.isPg,
    pool: db.pool,
    get: (...args) => db.get(...args),
    all: (...args) => db.all(...args),
    query: (...args) => db.query(...args),
    exec: (...args) => db.exec(...args),
    run: (sql, params = []) => runInterceptor(sql, params, () => db.run(sql, params)),
  };
}

async function cleanupBatch(db, batchId) {
  await db.run(
    'DELETE FROM penerimaan_matches WHERE statement_line_id IN (SELECT id FROM penerimaan_statement_lines WHERE batch_id = $1)',
    [batchId]
  );
  await db.run('DELETE FROM penerimaan_statement_lines WHERE batch_id = $1', [batchId]);
  await db.run('DELETE FROM penerimaan_reconciliation_batches WHERE id = $1', [batchId]);
}

test('statement import rolls back every inserted line and batch total after a mid-import database failure', async () => {
  const db = await getDb();
  const batch = await createBatch('ROLLBACK');
  let insertCount = 0;
  const faultDb = wrapDb(db, async (sql, params, proceed) => {
    if (/INSERT INTO penerimaan_statement_lines/i.test(sql)) {
      insertCount += 1;
      if (insertCount === 2) throw new Error('forced second-row import failure');
    }
    return proceed();
  });
  const csv = Buffer.from(
    'tanggal,referensi,uraian,nominal\n' +
    '2026-09-20,ATOMIC-ROW-1,Baris pertama,100000\n' +
    '2026-09-20,ATOMIC-ROW-2,Baris kedua,200000'
  );

  try {
    await assert.rejects(
      importStatementLines({ batchId: batch.id, fileBuffer: csv, filename: 'atomic.csv', actor: staff }, faultDb),
      /forced second-row import failure/
    );

    const stored = await db.get(
      'SELECT COUNT(*) AS count FROM penerimaan_statement_lines WHERE batch_id = $1',
      [batch.id]
    );
    const unchanged = await db.get(
      'SELECT total_expected_count, total_expected_amount FROM penerimaan_reconciliation_batches WHERE id = $1',
      [batch.id]
    );
    assert.equal(Number(stored.count), 0);
    assert.equal(Number(unchanged.total_expected_count), 0);
    assert.equal(String(unchanged.total_expected_amount), '0');
  } finally {
    await cleanupBatch(db, batch.id);
  }
});

test('statement import owns the batch lock so close waits until the complete import commits', async () => {
  const db = await getDb();
  const batch = await createBatch('SERIALIZE');
  let releaseInsert;
  let markInsertStarted;
  const insertStarted = new Promise((resolve) => { markInsertStarted = resolve; });
  const insertGate = new Promise((resolve) => { releaseInsert = resolve; });
  let paused = false;
  const pausingDb = wrapDb(db, async (sql, params, proceed) => {
    if (!paused && /INSERT INTO penerimaan_statement_lines/i.test(sql)) {
      paused = true;
      markInsertStarted();
      await insertGate;
    }
    return proceed();
  });
  const csv = Buffer.from('tanggal,referensi,uraian,nominal\n2026-09-20,LOCKED-ROW-1,Baris terkunci,300000');

  const importPromise = importStatementLines(
    { batchId: batch.id, fileBuffer: csv, filename: 'locked.csv', actor: staff },
    pausingDb
  );

  try {
    await insertStarted;
    assert.equal(getBatchLockQueueSize(), 1, 'import mutation must own the batch lock');

    let closeSettled = false;
    const closePromise = closeReconciliationBatch({
      batchId: batch.id,
      actor: leader,
      reason: 'Menutup batch setelah import atomik selesai',
    }).finally(() => { closeSettled = true; });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closeSettled, false, 'close must wait while import owns the batch lock');

    releaseInsert();
    await importPromise;
    await closePromise;

    const finalBatch = await db.get(
      'SELECT status, total_expected_count, total_expected_amount FROM penerimaan_reconciliation_batches WHERE id = $1',
      [batch.id]
    );
    assert.equal(finalBatch.status, 'closed');
    assert.equal(Number(finalBatch.total_expected_count), 1);
    assert.equal(String(finalBatch.total_expected_amount), '300000');
  } finally {
    releaseInsert();
    await importPromise.catch(() => {});
    await cleanupBatch(db, batch.id);
  }
});

test('database-bound amount conversion preserves integers beyond Number.MAX_SAFE_INTEGER', () => {
  const unsafeWholeAmountInCents = 900719925474099300n;
  assert.equal(fromIntegerCents(unsafeWholeAmountInCents), '9007199254740993');

  const unsafeFractionalAmountInCents = 900719925474099199n;
  assert.equal(fromIntegerCents(unsafeFractionalAmountInCents), '9007199254740991.99');
});
