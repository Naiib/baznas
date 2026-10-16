import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { addMpzis, addPpd, submitMustahikDecision, updateMustahik } from './repository.js';
import { workflowExpectationFor } from './bot.js';

async function fixture(t) {
  const memory = await open({ filename: ':memory:', driver: sqlite3.Database });
  const adapt = (sql) => sql.replace(/\$\d+/g, '?');
  let failApproval = false;
  const db = {
    isPg: false,
    get: (sql, args = []) => memory.get(adapt(sql), args),
    all: (sql, args = []) => memory.all(adapt(sql), args),
    run: async (sql, args = []) => {
      if (failApproval && /INSERT INTO approval_decisions/i.test(sql)) {
        throw new Error('Simulated approval audit failure');
      }
      const result = await memory.run(adapt(sql), args);
      return { ...result, rowCount: result.changes };
    },
    exec: (sql) => memory.exec(sql),
  };

  await db.exec(`
    CREATE TABLE mustahik (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      workflow_version INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      rejection_reason TEXT,
      survey_recommendation TEXT,
      survey_date TEXT,
      surveyor_name TEXT,
      mpzis_date TEXT,
      approved_amount NUMERIC,
      ppd_number TEXT,
      disbursement_date TEXT,
      phone TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE applications (id INTEGER PRIMARY KEY, mustahik_id INTEGER, status TEXT, applied_at TEXT);
    CREATE TABLE mpzis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mustahik_id INTEGER,
      application_id INTEGER,
      form_number TEXT,
      mpzis_date TEXT,
      program_classification TEXT,
      purpose TEXT,
      asnaf TEXT,
      fund_source TEXT,
      recipient_name TEXT,
      recipient_type TEXT,
      beneficiary_count INTEGER,
      total_amount NUMERIC,
      proposed_by TEXT,
      examined_by TEXT,
      ashnaf_verifier TEXT,
      responsible TEXT,
      approved_by TEXT
    );
    CREATE TABLE ppd (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mustahik_id INTEGER,
      application_id INTEGER,
      form_number TEXT,
      ppd_number TEXT,
      transaction_number TEXT,
      requester_name TEXT,
      requester_role TEXT,
      requester_department TEXT,
      amount NUMERIC,
      amount_in_words TEXT,
      purpose TEXT,
      fund_source TEXT,
      bank_account_info TEXT,
      payment_type TEXT,
      disbursement_date TEXT
    );
    CREATE TABLE approval_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mustahik_id INTEGER,
      stage TEXT,
      action TEXT,
      previous_status TEXT,
      next_status TEXT,
      note TEXT,
      approved_amount NUMERIC,
      actor_id INTEGER,
      actor_name TEXT,
      actor_role TEXT,
      actor_level TEXT,
      actor_division TEXT,
      prepared_by_id INTEGER,
      correlation_id TEXT,
      created_at TEXT
    );
    CREATE TABLE activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mustahik_id INTEGER,
      actor_name TEXT,
      action_type TEXT,
      title TEXT,
      description TEXT,
      old_status TEXT,
      new_status TEXT
    );
  `);

  t.after(() => memory.close());
  Object.defineProperty(db, 'failApproval', {
    get: () => failApproval,
    set: (value) => { failApproval = Boolean(value); },
  });
  return db;
}

function actor() {
  return { id: 11, name: 'Petugas Test', role: 'penyaluran', division: 'Penyaluran', level: 'staff' };
}

test('valid Penyaluran decision advances the row and appends audit records', async (t) => {
  const db = await fixture(t);
  await db.run(
    `INSERT INTO mustahik (id, status, workflow_version, notes) VALUES ($1, $2, $3, $4)`,
    [1, 'Diajukan', 0, null],
  );
  await db.run(`INSERT INTO applications (id, mustahik_id, status) VALUES ($1, $2, $3)`, [1, 1, 'Diajukan']);

  const result = await submitMustahikDecision(
    1,
    { action: 'approve', notes: 'Berkas lengkap', expected_status: 'Diajukan', expected_version: 0 },
    actor(),
    db,
  );

  assert.equal(result.new_status, 'Verifikasi Administrasi');
  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [1]), {
    status: 'Verifikasi Administrasi', workflow_version: 1,
  });
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM approval_decisions WHERE mustahik_id = $1', [1])).count, 1);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM activity_logs WHERE mustahik_id = $1', [1])).count, 1);
});

test('forbidden target status returns 422 without mutating row or audit trail', async (t) => {
  const db = await fixture(t);
  await db.run(`INSERT INTO mustahik (id, status, workflow_version) VALUES ($1, $2, $3)`, [2, 'Diajukan', 0]);

  await assert.rejects(
    submitMustahikDecision(
      2,
      {
        action: 'approve',
        target_status: 'Penyaluran Selesai',
        notes: 'Lompat tahap',
        expected_status: 'Diajukan',
        expected_version: 0,
      },
      actor(),
      db,
    ),
    (error) => error.code === 'INVALID_WORKFLOW_TRANSITION' && error.status === 422,
  );

  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [2]), {
    status: 'Diajukan', workflow_version: 0,
  });
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM approval_decisions WHERE mustahik_id = $1', [2])).count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM activity_logs WHERE mustahik_id = $1', [2])).count, 0);
});

test('explicit null target status returns 422 without mutating row or audit trail', async (t) => {
  const db = await fixture(t);
  await db.run(`INSERT INTO mustahik (id, status, workflow_version) VALUES ($1, $2, $3)`, [21, 'Diajukan', 0]);

  await assert.rejects(
    submitMustahikDecision(
      21,
      {
        action: 'approve',
        target_status: null,
        notes: 'Target tidak valid',
        expected_status: 'Diajukan',
        expected_version: 0,
      },
      actor(),
      db,
    ),
    (error) => error.code === 'INVALID_WORKFLOW_STATUS' && error.status === 422,
  );

  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [21]), {
    status: 'Diajukan', workflow_version: 0,
  });
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM approval_decisions WHERE mustahik_id = $1', [21])).count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM activity_logs WHERE mustahik_id = $1', [21])).count, 0);
});

test('stale expected status or version returns 409 without mutation', async (t) => {
  const db = await fixture(t);
  await db.run(`INSERT INTO mustahik (id, status, workflow_version) VALUES ($1, $2, $3)`, [3, 'Diajukan', 2]);

  await assert.rejects(
    submitMustahikDecision(
      3,
      { action: 'approve', notes: 'Versi lama', expected_status: 'Diajukan', expected_version: 1 },
      actor(),
      db,
    ),
    (error) => error.code === 'STALE_DECISION' && error.status === 409,
  );

  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [3]), {
    status: 'Diajukan', workflow_version: 2,
  });
});

test('Telegram workflow payloads preserve optimistic state and transition through repository guards', async (t) => {
  const db = await fixture(t);
  await db.run(
    `INSERT INTO mustahik (id, status, workflow_version, created_at) VALUES ($1, $2, $3, $4)`,
    [30, 'Survey', 0, '2026-09-12'],
  );
  await db.run(`INSERT INTO applications (id, mustahik_id, status, applied_at) VALUES ($1, $2, $3, $4)`, [30, 30, 'Survey', '2026-09-12']);

  const surveyRow = await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [30]);
  const mpzisPayload = {
    mustahik_id: 30,
    ...workflowExpectationFor(surveyRow),
    form_number: 'MPZIS-30',
    total_amount: 2500000,
  };
  await addMpzis(mpzisPayload, null, actor(), db);

  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [30]), {
    status: 'Persetujuan MPZIS', workflow_version: 1,
  });

  const mpzisRow = await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [30]);
  await assert.rejects(
    addPpd({
      mustahik_id: 30,
      ...workflowExpectationFor({ ...mpzisRow, workflow_version: 0 }),
      form_number: 'PPD-STALE',
      amount: 2500000,
    }, null, actor(), db),
    (error) => error.code === 'STALE_DECISION' && error.status === 409,
  );
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM ppd WHERE mustahik_id = $1', [30])).count, 0);

  const expected = workflowExpectationFor(mpzisRow);
  assert.deepEqual(expected, { expected_status: 'Persetujuan MPZIS', expected_version: 1 });
  await addPpd({ mustahik_id: 30, ...expected, form_number: 'PPD-30', amount: 2500000 }, null, actor(), db);
  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [30]), {
    status: 'Pengajuan Dana (FPD)', workflow_version: 2,
  });
});

test('persists every valid UI-used transition, including MPZIS leader approval', async (t) => {
  const db = await fixture(t);
  const transitions = [
    [10, 'Diajukan', 'Verifikasi Administrasi'],
    [11, 'Verifikasi Administrasi', 'Survey'],
    [12, 'Verifikasi', 'Survey'],
    [13, 'Survey', 'Persetujuan MPZIS'],
    [14, 'MPZIS', 'Pengajuan Dana (FPD)'],
    [15, 'FPD', 'Penyaluran Selesai'],
    [16, 'PPD', 'Penyaluran Selesai'],
  ];

  for (const [id, currentStatus, expectedNext] of transitions) {
    await db.run(
      `INSERT INTO mustahik (id, status, workflow_version, created_at) VALUES ($1, $2, $3, $4)`,
      [id, currentStatus, 0, '2026-09-12'],
    );
    await db.run(`INSERT INTO applications (id, mustahik_id, status) VALUES ($1, $2, $3)`, [id, id, currentStatus]);
    const isMpzis = currentStatus === 'MPZIS';
    const result = await submitMustahikDecision(
      id,
      {
        action: 'approve',
        notes: 'Tahap diverifikasi',
        approved_amount: isMpzis ? 2_500_000 : undefined,
        expected_status: currentStatus,
        expected_version: 0,
      },
      isMpzis ? { ...actor(), level: 'leader' } : actor(),
      db,
    );
    assert.equal(result.new_status, expectedNext);
    assert.equal((await db.get('SELECT workflow_version FROM mustahik WHERE id = $1', [id])).workflow_version, 1);
  }
});

test('status-only update cannot bypass the transition policy', async (t) => {
  const db = await fixture(t);
  await db.run(`INSERT INTO mustahik (id, status, workflow_version) VALUES ($1, $2, $3)`, [4, 'Diajukan', 0]);

  await assert.rejects(
    updateMustahik(4, { status: 'Penyaluran Selesai' }, db),
    (error) => error.code === 'INVALID_WORKFLOW_EXPECTATION' && error.status === 422,
  );
  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [4]), {
    status: 'Diajukan', workflow_version: 0,
  });
});

test('approval audit failure rolls back status and version mutation', async (t) => {
  const db = await fixture(t);
  await db.run(`INSERT INTO mustahik (id, status, workflow_version) VALUES ($1, $2, $3)`, [5, 'Diajukan', 0]);
  db.failApproval = true;

  await assert.rejects(
    submitMustahikDecision(
      5,
      { action: 'approve', notes: 'Audit harus atomik', expected_status: 'Diajukan', expected_version: 0 },
      actor(),
      db,
    ),
    /Simulated approval audit failure/,
  );
  assert.deepEqual(await db.get('SELECT status, workflow_version FROM mustahik WHERE id = $1', [5]), {
    status: 'Diajukan', workflow_version: 0,
  });
});
