import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { recordPayment, verifyPayment } from './penyaluran-p0/payment-service.js';
import { recordRecipientConfirmation, completeDistribution } from './penyaluran-p0/completion-service.js';
import { createSnapshot } from './penyaluran-p0/canonical-snapshot.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';

const actors = Object.freeze({
  recorder: { id: 2, name: 'Recorder', role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' },
  verifier: { id: 3, name: 'Verifier', role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' },
  confirmer: { id: 4, name: 'Confirmer', role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' },
  completer: { id: 5, name: 'Leader', role: 'penyaluran', level: 'leader', division: 'Divisi Penyaluran' },
});

async function seedReadyFixture({ verify = true, confirm = true } = {}) {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Pengajuan Dana (FPD)' WHERE id=1");
  const assessment = createSnapshot('assessment', { schema_version: 1, artifact_type: 'assessment', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0' });
  const mpzis = createSnapshot('mpzis', { schema_version: 1, artifact_type: 'mpzis', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0', accepted_assessment_id: 1, accepted_assessment_revision: 1, accepted_assessment_hash: assessment.hash, recipient_name: 'Siti' });
  const ppd = createSnapshot('ppd', { schema_version: 1, artifact_type: 'ppd', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0', approved_mpzis_id: 1, approved_mpzis_revision: 1, approved_mpzis_hash: mpzis.hash, transaction_number: 'TX-1', rab_lines: [{ line_no: 1, register_number: 'RAB-1', description: 'Bantuan', amount: '100.10' }] });
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (1,1,1,1,'accepted','p0',$1,$2)", [JSON.stringify(assessment.json), assessment.hash]);
  await db.run("INSERT INTO mpzis (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash,recipient_name) VALUES (1,1,1,1,'approved','p0',$1,$2,'Siti')", [JSON.stringify(mpzis.json), mpzis.hash]);
  await db.run("INSERT INTO ppd (id,mustahik_id,application_id,revision,status,source,transaction_number,amount,created_by_id,mpzis_id,snapshot_json,snapshot_hash) VALUES (1,1,1,1,'finance_approved','p0','TX-1',100.10,1,1,$1,$2)", [JSON.stringify(ppd.json), ppd.hash]);
  await db.run("INSERT INTO ppd_rab_lines (ppd_id,line_no,register_number,description,amount) VALUES (1,1,'RAB-1','Bantuan',100.10)");
  await db.run("INSERT INTO artifact_approvals (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,actor_id,actor_name,actor_role,actor_level,actor_division) VALUES (1,'ppd',1,1,'finance_check','finance_check',$1,15,'Finance checker','keuangan','staff','Divisi Keuangan')", [ppd.hash]);
  await db.run("INSERT INTO artifact_approvals (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,actor_id,actor_name,actor_role,actor_level,actor_division) VALUES (1,'ppd',1,1,'finance','finance_approve',$1,16,'Finance lead','keuangan','leader','Divisi Keuangan')", [ppd.hash]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-completion-'));
  const proof = Buffer.from('%PDF-1.4\n%%EOF', 'ascii');
  await recordPayment({ db, mustahik_id: 1, artifactRoot: root, actor: actors.recorder }, 1, { transaction_number: 'TX-1', paid_amount: '100.10', paid_at: new Date().toISOString(), file: { buffer: proof, originalname: 'proof.pdf' } }, { application_id: 1, idempotency_key: `record-${Math.random()}` });
  if (verify) await verifyPayment({ db, mustahik_id: 1, artifactRoot: root, actor: actors.verifier }, 1, {}, { application_id: 1, idempotency_key: `verify-${Math.random()}` });
  if (confirm) await recordRecipientConfirmation({ db, mustahik_id: 1, artifactRoot: root, actor: actors.confirmer }, 1, { method: 'Tatap Muka', recipient_name_snapshot: 'Siti', confirmed_at: new Date().toISOString(), note: 'Penerima telah menerima bantuan sesuai PPD.' }, { application_id: 1, idempotency_key: `confirm-${Math.random()}` });
  return { db, root, actors };
}

async function counts(db) {
  const result = {};
  for (const table of ['artifact_files', 'ppd_payments', 'recipient_confirmations', 'artifact_approvals', 'approval_decisions', 'activity_logs']) result[table] = Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count);
  result.ppd = await db.get('SELECT status,receipt_status FROM ppd WHERE id=1');
  result.case = await db.get('SELECT status,workflow_version FROM mustahik WHERE id=1');
  return result;
}

test('Task 10 services expose all payment and completion commands', () => {
  assert.equal(typeof recordPayment, 'function');
  assert.equal(typeof verifyPayment, 'function');
  assert.equal(typeof recordRecipientConfirmation, 'function');
  assert.equal(typeof completeDistribution, 'function');
});

test('payment recorder rejects non-Keuangan before opening a transaction', async () => {
  const db = await createP0TestDatabase();
  await assert.rejects(
    recordPayment({ db, mustahik_id: 1, actor: { id: 10, name: 'Penyaluran', role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' } }, 1, {}, {}),
    (error) => error.code === 'DIVISION_REQUIRED' && error.status === 403,
  );
  await db.close();
});

test('payment verifier and recipient confirmer reject forbidden divisions before writes', async () => {
  const db = await createP0TestDatabase();
  await assert.rejects(() => verifyPayment({ db, mustahik_id: 1, actor: { id: 11, role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' } }, 1, {}, {}), (error) => error.code === 'DIVISION_REQUIRED' && error.status === 403);
  await assert.rejects(() => recordRecipientConfirmation({ db, mustahik_id: 1, actor: { id: 12, role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' } }, 1, {}, {}), (error) => error.code === 'PERMISSION_DENIED' && error.status === 403);
  await db.close();
});

test('recordPayment persists proof and exact-cent payment atomically', async () => {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Pengajuan Dana (FPD)' WHERE id=1");
  const assessmentSnapshot = createSnapshot('assessment', { schema_version: 1, artifact_type: 'assessment', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0' });
  const mpzisSnapshot = createSnapshot('mpzis', { schema_version: 1, artifact_type: 'mpzis', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0', accepted_assessment_id: 1, accepted_assessment_revision: 1, accepted_assessment_hash: assessmentSnapshot.hash, recipient_name: 'Siti' });
  const ppdSnapshot = createSnapshot('ppd', { schema_version: 1, artifact_type: 'ppd', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0', approved_mpzis_id: 1, approved_mpzis_revision: 1, approved_mpzis_hash: mpzisSnapshot.hash, transaction_number: 'TX-1', rab_lines: [{ line_no: 1, register_number: 'RAB-1', description: 'Bantuan', amount: '100.10' }] });
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (1,1,1,1,'accepted','p0',$1,$2)", [JSON.stringify(assessmentSnapshot.json), assessmentSnapshot.hash]);
  await db.run("INSERT INTO mpzis (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash,recipient_name) VALUES (1,1,1,1,'approved','p0',$1,$2,'Siti')", [JSON.stringify(mpzisSnapshot.json), mpzisSnapshot.hash]);
  await db.run("INSERT INTO ppd (id,mustahik_id,application_id,revision,status,source,transaction_number,amount,created_by_id,mpzis_id,snapshot_json,snapshot_hash) VALUES (1,1,1,1,'finance_approved','p0','TX-1',100.10,1,1,$1,$2)", [JSON.stringify(ppdSnapshot.json), ppdSnapshot.hash]);
  await db.run("INSERT INTO ppd_rab_lines (ppd_id,line_no,register_number,description,amount) VALUES (1,1,'RAB-1','Bantuan',100.10)");
  await db.run("INSERT INTO artifact_approvals (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,actor_id,actor_name,actor_role,actor_level,actor_division) VALUES (1,'ppd',1,1,'finance_check','finance_check',$1,15,'Finance checker','keuangan','staff','Divisi Keuangan')", [ppdSnapshot.hash]);
  await db.run("INSERT INTO artifact_approvals (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,actor_id,actor_name,actor_role,actor_level,actor_division) VALUES (1,'ppd',1,1,'finance','finance_approve',$1,16,'Finance lead','keuangan','leader','Divisi Keuangan')", [ppdSnapshot.hash]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-payment-'));
  try {
    const proof = Buffer.from('%PDF-1.4\n%%EOF', 'ascii');
    const result = await recordPayment({ db, mustahik_id: 1, artifactRoot: root, actor: { id: 2, name: 'Recorder', role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' } }, 1, { transaction_number: 'TX-1', paid_amount: '100.10', paid_at: new Date().toISOString(), file: { buffer: proof, originalname: 'proof.pdf' } }, { application_id: 1, idempotency_key: 'record-1' });
    assert.equal(result.success, true);
    assert.equal((await db.get('SELECT verification_status FROM ppd_payments WHERE ppd_id=1')).verification_status, 'pending');
    assert.equal((await db.get("SELECT status FROM ppd WHERE id=1")).status, 'payment_recorded');
    assert.equal((await fs.readdir(root)).length, 1);
    const verified = await verifyPayment({ db, mustahik_id: 1, artifactRoot: root, actor: { id: 3, name: 'Verifier', role: 'keuangan', level: 'staff', division: 'Divisi Keuangan' } }, 1, {}, { application_id: 1, idempotency_key: 'verify-1' });
    assert.equal(verified.success, true);
    assert.equal((await db.get('SELECT verification_status FROM ppd_payments WHERE ppd_id=1')).verification_status, 'verified');
    const confirmation = await recordRecipientConfirmation({ db, mustahik_id: 1, artifactRoot: root, actor: { id: 4, name: 'Confirmer', role: 'penyaluran', level: 'staff', division: 'Divisi Penyaluran' } }, 1, { method: 'Tatap Muka', recipient_name_snapshot: 'Siti', confirmed_at: new Date().toISOString(), note: 'Penerima telah menerima bantuan sesuai PPD.' }, { application_id: 1, idempotency_key: 'confirm-1' });
    assert.equal(confirmation.success, true);
    const completed = await completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: { id: 5, name: 'Leader', role: 'penyaluran', level: 'leader', division: 'Divisi Penyaluran' } }, 1, {}, { application_id: 1, correlation_id: '00000000-0000-4000-8000-000000000101', idempotency_key: 'complete-1' });
    assert.equal(completed.success, true);
    assert.equal((await db.get('SELECT status,receipt_status FROM ppd WHERE id=1')).status, 'completed');
    assert.equal((await db.get('SELECT status FROM mustahik WHERE id=1')).status, 'Penyaluran Selesai');
    const paymentRow = await db.get('SELECT id,snapshot_json FROM ppd_payments WHERE ppd_id=1');
    const confirmationRow = await db.get('SELECT id,snapshot_json FROM recipient_confirmations WHERE ppd_id=1');
    assert.ok(Number(paymentRow.id) > 0 && Number(confirmationRow.id) > 0);
    const paymentSnapshot = typeof paymentRow.snapshot_json === 'string' ? JSON.parse(paymentRow.snapshot_json) : paymentRow.snapshot_json;
    const confirmationSnapshot = typeof confirmationRow.snapshot_json === 'string' ? JSON.parse(confirmationRow.snapshot_json) : confirmationRow.snapshot_json;
    assert.equal(Number(paymentSnapshot.id), Number(paymentRow.id));
    assert.equal(Number(confirmationSnapshot.id), Number(confirmationRow.id));
    const completionEvent = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE action='complete' AND artifact_id=1");
    const completionSnapshot = typeof completionEvent.completion_snapshot_json === 'string' ? JSON.parse(completionEvent.completion_snapshot_json) : completionEvent.completion_snapshot_json;
    assert.deepEqual(completionSnapshot.finance_event_ids, [1, 2]);
    assert.ok(completionSnapshot.payment.id > 0 && completionSnapshot.recipient_confirmation.id > 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
});

for (const [label, mutate, expected] of [
  ['finance approval', async (db) => { await db.run("DELETE FROM artifact_approvals WHERE action='finance_approve'"); }, 'COMPLETION_FINANCE_APPROVAL_REQUIRED'],
  ['matching amount', async (db) => { await db.run("UPDATE ppd_payments SET paid_amount=99.99 WHERE ppd_id=1"); }, 'COMPLETION_MATCHING_AMOUNT_REQUIRED'],
  ['proof', async (db) => { await db.run('UPDATE ppd_payments SET proof_file_id=999 WHERE ppd_id=1'); }, 'COMPLETION_PROOF_REQUIRED'],
  ['proof verification', async (db) => { await db.run("UPDATE ppd_payments SET verification_status='pending' WHERE ppd_id=1"); }, 'COMPLETION_PROOF_VERIFICATION_REQUIRED'],
  ['recipient confirmation', async (db) => { await db.run('DELETE FROM recipient_confirmations WHERE ppd_id=1'); }, 'COMPLETION_RECIPIENT_CONFIRMATION_REQUIRED'],
]) {
  test(`completion rejects missing ${label} with zero side effects`, async () => {
    const { db, root, actors: fixtureActors } = await seedReadyFixture();
    try {
      await mutate(db);
      const before = await counts(db);
      await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: `missing-${label}` }), (error) => error.code === expected);
      assert.deepEqual(await counts(db), before);
    } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
  });
}

test('completion fails closed for tampered snapshot and missing actor identity', async () => {
  const { db, root, actors: fixtureActors } = await seedReadyFixture();
  try {
    const before = await counts(db);
    await db.run("UPDATE assessments SET snapshot_json='{}' WHERE id=1");
    await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: 'tampered-assessment' }), (error) => error.code === 'COMPLETION_PROVENANCE_CONFLICT');
    assert.deepEqual(await counts(db), before);
    await db.run("UPDATE assessments SET snapshot_json=$1 WHERE id=1", [JSON.stringify(createSnapshot('assessment', { schema_version: 1, artifact_type: 'assessment', id: 1, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0' }).json)]);
    await db.run('UPDATE ppd_payments SET recorded_by_id=NULL WHERE ppd_id=1');
    await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: 'missing-actor' }), (error) => error.code === 'ACTOR_SEPARATION');
    assert.deepEqual(await counts(db), before);
  } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
});

test('completion audit failure rolls back projection and preserves files', async () => {
  const { db, root, actors: fixtureActors } = await seedReadyFixture();
  try {
    const before = await counts(db);
    db.failOn(/activity_logs/);
    await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: 'audit-failure' }));
    db.clearFailure();
    assert.deepEqual(await counts(db), before);
    assert.equal((await fs.readdir(root)).length, 1);
  } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
});

test('recipient confirmation fails closed when persisted payment snapshot is null or has extra fields', async () => {
  for (const mutate of [
    async (db) => db.run('UPDATE ppd_payments SET snapshot_json=NULL WHERE ppd_id=1'),
    async (db) => {
      const row = await db.get('SELECT snapshot_json FROM ppd_payments WHERE ppd_id=1');
      const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
      snapshot.forged_field = 'must be rejected';
      return db.run('UPDATE ppd_payments SET snapshot_json=$1 WHERE ppd_id=1', [JSON.stringify(snapshot)]);
    },
  ]) {
    const { db, root, actors: fixtureActors } = await seedReadyFixture({ confirm: false });
    try {
      await mutate(db);
      const before = await counts(db);
      await assert.rejects(() => recordRecipientConfirmation({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.confirmer }, 1, { method: 'Tatap Muka', recipient_name_snapshot: 'Siti', confirmed_at: new Date().toISOString(), note: 'Penerima telah menerima bantuan sesuai PPD.' }, { application_id: 1, idempotency_key: `payment-snapshot-${Math.random()}` }), (error) => ['CONFIRMATION_PAYMENT_SNAPSHOT_REQUIRED', 'CONFIRMATION_PAYMENT_SNAPSHOT_MISMATCH'].includes(error.code));
      assert.deepEqual(await counts(db), before);
    } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
  }
});

test('completion fails closed when persisted payment snapshot is null or tampered', async () => {
  for (const mutate of [
    async (db) => db.run('UPDATE ppd_payments SET snapshot_json=NULL WHERE ppd_id=1'),
    async (db) => {
      const row = await db.get('SELECT snapshot_json FROM ppd_payments WHERE ppd_id=1');
      const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
      snapshot.paid_amount = '99.99';
      return db.run('UPDATE ppd_payments SET snapshot_json=$1 WHERE ppd_id=1', [JSON.stringify(snapshot)]);
    },
  ]) {
    const { db, root, actors: fixtureActors } = await seedReadyFixture();
    try {
      await mutate(db);
      const before = await counts(db);
      await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: `completion-payment-snapshot-${Math.random()}` }), (error) => ['COMPLETION_PAYMENT_SNAPSHOT_REQUIRED', 'COMPLETION_PAYMENT_SNAPSHOT_MISMATCH'].includes(error.code));
      assert.deepEqual(await counts(db), before);
    } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
  }
});

test('verify and complete require exact Task 10 staff or leader levels', async () => {
  for (const level of ['officer', 'kepala', 'manager', 'chief']) {
    const { db, root, actors: fixtureActors } = await seedReadyFixture({ verify: false, confirm: false });
    try {
      await assert.rejects(() => verifyPayment({ db, mustahik_id: 1, artifactRoot: root, actor: { ...fixtureActors.verifier, level } }, 1, {}, { application_id: 1, idempotency_key: `verify-level-${level}` }), (error) => error.code === 'LEVEL_REQUIRED' && error.status === 403);
      await verifyPayment({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.verifier }, 1, {}, { application_id: 1, idempotency_key: `verify-good-${level}` });
      await recordRecipientConfirmation({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.confirmer }, 1, { method: 'Tatap Muka', recipient_name_snapshot: 'Siti', confirmed_at: new Date().toISOString(), note: 'Penerima telah menerima bantuan sesuai PPD.' }, { application_id: 1, idempotency_key: `confirm-level-${level}` });
      await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: { ...fixtureActors.completer, level } }, 1, {}, { application_id: 1, idempotency_key: `complete-level-${level}` }), (error) => error.code === 'LEVEL_REQUIRED' && error.status === 403);
    } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
  }
});

test('completion requires locked authoritative nonempty RAB rows', async () => {
  const { db, root, actors: fixtureActors } = await seedReadyFixture();
  try {
    await db.run('DELETE FROM ppd_rab_lines WHERE ppd_id=1');
    const before = await counts(db);
    await assert.rejects(() => completeDistribution({ db, mustahik_id: 1, artifactRoot: root, actor: fixtureActors.completer }, 1, {}, { application_id: 1, idempotency_key: 'missing-rab' }), (error) => error.code === 'COMPLETION_RAB_REQUIRED');
    assert.deepEqual(await counts(db), before);
  } finally { await fs.rm(root, { recursive: true, force: true }); await db.close(); }
});

test('Task 10 rejects widened level aliases and unassigned Surveyor', async () => {
  const db = await createP0TestDatabase();
  try {
    await assert.rejects(() => recordPayment({ db, mustahik_id: 1, actor: { id: 30, name: 'Kepala', role: 'keuangan', level: 'kepala', division: 'Divisi Keuangan' } }, 1, {}, {}), (error) => error.code === 'LEVEL_REQUIRED' && error.status === 403);
  } finally { await db.close(); }
  const fixture = await seedReadyFixture();
  try {
    await assert.rejects(() => recordRecipientConfirmation({ db: fixture.db, mustahik_id: 1, artifactRoot: fixture.root, actor: { id: 31, name: 'Surveyor', role: 'surveyor', division: 'Survey', level: 'staff' } }, 1, { method: 'Tatap Muka', recipient_name_snapshot: 'Siti', confirmed_at: new Date().toISOString(), note: 'Penerima telah menerima bantuan sesuai PPD.' }, { application_id: 1, idempotency_key: 'unassigned-surveyor' }), (error) => error.code === 'PERMISSION_DENIED' && error.status === 403);
  } finally { await fs.rm(fixture.root, { recursive: true, force: true }); await fixture.db.close(); }
});
