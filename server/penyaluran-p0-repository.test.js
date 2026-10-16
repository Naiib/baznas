import test from 'node:test';
import assert from 'node:assert/strict';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { withP0Command, getActiveAssessment, insertArtifactApproval, insertCompatibilityDecision, insertActivity, listArtifactHistory } from './penyaluran-p0/repository.js';

test('withP0Command rolls back audit and projection together when activity fails', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  db.failOn(/INSERT INTO activity_logs/i);
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (11,1,NULL,1,'submitted','p0',$1,$2)", [JSON.stringify({ safe: true }), 'a'.repeat(64)]);
  const command = () => withP0Command(
    { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } },
    {
      expected_version: 0,
      idempotency_key: 'rollback-1',
      request: { note: 'rollback' },
      projection: { status: 'submitted' },
      approval: { artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), note: 'ok' },
      decision: { stage: 'assessment', action: 'approve', previous_status: 'draft', next_status: 'submitted', artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, snapshot_hash: 'a'.repeat(64), note: 'decision' },
      activity: { action_type: 'assessment_approved', title: 'Approved', description: 'audit' },
    },
    async () => ({ ok: true }),
  );
  await assert.rejects(command(), /audit/i);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM artifact_approvals')).count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM approval_decisions')).count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM activity_logs')).count, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM p0_idempotency_keys')).count, 0);
  assert.equal((await db.get('SELECT workflow_version FROM mustahik WHERE id=1')).workflow_version, 0);
});

test('withP0Command replays an exact idempotency request and rejects a payload mismatch', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const context = { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  const run = (note) => withP0Command(context, {
    ...(note === 'same' ? { expected_version: 0 } : {}),
    idempotency_key: 'same-key',
    request: { note },
  }, async () => ({ ok: true, note }));
  const first = await run('same');
  assert.deepEqual(await run('same'), { ...first, replayed: true });
  await assert.rejects(run('different'), (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.status === 409);
});

test('completed idempotent replay is returned before stale state guards', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const context = { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  const meta = { expected_status: 'draft', expected_version: 0, idempotency_key: 'stale-replay', request: { command: 'advance' }, projection: { status: 'submitted' } };
  const first = await withP0Command(context, meta, async () => ({ ok: true }));
  const replay = await withP0Command(context, meta, async () => ({ ok: false }));
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.case.status, 'submitted');
});

test('idempotency keys are scoped to the locked case identity', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (2, 'draft', 'p0', 0)");
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  const meta = { expected_status: 'draft', expected_version: 0, idempotency_key: 'case-scoped', request: { command: 'advance' }, projection: { status: 'submitted' } };
  const first = await withP0Command({ db, mustahik_id: 1, actor }, meta, async () => ({ ok: true }));
  assert.equal(first.ok, true);
  await assert.rejects(
    withP0Command({ db, mustahik_id: 2, actor }, meta, async () => ({ ok: false })),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.status === 409,
  );
  assert.equal((await db.get('SELECT workflow_version FROM mustahik WHERE id=2')).workflow_version, 0);
});

test('state and artifact guards reject stale versions and hashes', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (11,1,NULL,2,'accepted','p0',$1,$2)", [JSON.stringify({ safe: true }), 'b'.repeat(64)]);
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } }, { expected_version: 1 }, async () => ({})),
    (error) => error.code === 'STALE_STATE' && error.status === 409,
  );
  assert.equal((await getActiveAssessment(db, 1, { application_id: null, lock: false })).id, 11);
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } }, { artifact_type: 'assessment', expected_revision: 2, expected_snapshot_hash: 'c'.repeat(64) }, async () => ({})),
    (error) => error.code === 'STALE_ARTIFACT' && error.status === 409,
  );
});

test('provenance inserts preserve actor and artifact snapshots and history excludes sensitive fields', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  const base = { db, mustahik_id: 1, actor, correlation_id: '11111111-1111-4111-8111-111111111111' };
  await insertArtifactApproval(db, { ...base, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), note: 'approved' });
  await insertCompatibilityDecision(db, { ...base, stage: 'assessment', action: 'approve', previous_status: 'submitted', next_status: 'accepted', artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, snapshot_hash: 'a'.repeat(64), evidence_grade: 'p0', note: 'Decision recorded.' });
  await insertActivity(db, { ...base, action_type: 'assessment_approved', title: 'Approved', description: 'safe description' });
  const history = await listArtifactHistory(db, 1);
  assert.equal(history.length, 3);
  assert.deepEqual(history[0].actor, { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' });
  const approval = history.find((event) => event.type === 'approval');
  assert.equal(approval.artifact.hash, undefined);
  assert.equal(approval.hash_prefix, 'aaaaaaaaaaaa');
  assert.equal(Object.prototype.hasOwnProperty.call(approval, 'actor_id'), false);
});

test('approval uniqueness maps duplicate approvals to a stable conflict', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const input = { mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  await insertArtifactApproval(db, input);
  await assert.rejects(insertArtifactApproval(db, input), (error) => error.code === 'DUPLICATE_APPROVAL' && error.status === 409);
});

test('canonical expected fields cannot be bypassed by legacy guard aliases', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const context = { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  await assert.rejects(
    withP0Command(context, { expected_workflow_version: 99 }, async () => ({})),
    (error) => error.code === 'EXPECTED_STATE_REQUIRED' && error.status === 409,
  );
});

test('idempotency hashes canonical request internally and rejects supplied hash mismatch', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const context = { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  await assert.rejects(
    withP0Command(context, { idempotency_key: 'hash-mismatch', request: { note: 'same' }, request_hash: '0'.repeat(64) }, async () => ({ ok: true })),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.status === 409,
  );
  await assert.rejects(
    withP0Command(context, { idempotency_key: 'missing-request' }, async () => ({ ok: true })),
    (error) => error.code === 'IDEMPOTENCY_REQUEST_REQUIRED' && error.status === 409,
  );
});

test('concurrent commands produce one approval and one duplicate conflict', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (11,1,NULL,1,'submitted','p0',$1,$2)", [JSON.stringify({ safe: true }), 'a'.repeat(64)]);
  const command = () => withP0Command(
    { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } },
    { artifact_type: 'assessment', artifact_id: 11, expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64), request: { command: 'approve' }, approval: { artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64) } },
    async () => ({ ok: true }),
  );
  const outcomes = await Promise.allSettled([command(), command()]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.code === 'DUPLICATE_APPROVAL').length, 1);
});

test('artifact event identity must match the locked artifact and cannot omit its type', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash) VALUES (11,1,NULL,1,'submitted','p0',$1,$2)", [JSON.stringify({ safe: true }), 'a'.repeat(64)]);
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor }, { artifact_type: 'assessment', artifact_id: 11, expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64), request: { action: 'approve' }, approval: { artifact_type: 'assessment', artifact_id: 12, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64) } }, async () => ({ ok: true })),
    (error) => error.code === 'STALE_ARTIFACT' && error.status === 409,
  );
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor }, { request: { action: 'approve' } }, async () => ({ approval: { artifact_id: 11, artifact_revision: 1, action: 'approve', snapshot_hash: 'a'.repeat(64) } })),
    (error) => error.code === 'ARTIFACT_TYPE_REQUIRED' && error.status === 409,
  );
});

test('guard claims in context are rejected and canonical meta guards are enforced', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor, expected_version: 99 }, { expected_version: 0 }, async () => ({})),
    (error) => error.code === 'EXPECTED_GUARD_MISPLACED' && error.status === 409,
  );
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor }, { expected_version: null }, async () => ({})),
    (error) => error.code === 'EXPECTED_GUARD_INVALID' && error.status === 422,
  );
  await assert.rejects(
    withP0Command({ db, mustahik_id: 1, actor }, { expected_snapshot_hash: 'not-a-hash' }, async () => ({})),
    (error) => error.code === 'EXPECTED_GUARD_INVALID' && error.status === 422,
  );
});

test('idempotency rejects empty or metadata-only command requests', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const context = { db, mustahik_id: 1, actor: { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' } };
  for (const request of [{}, null, '', [], { note: '' }]) {
    await assert.rejects(
      withP0Command(context, { idempotency_key: `empty-${String(request)}`, request }, async () => ({ ok: true })),
      (error) => error.code === 'IDEMPOTENCY_REQUEST_REQUIRED' && error.status === 409,
    );
  }
});

test('sensitive provenance free text is rejected at insert while legitimate notes persist', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  await assert.rejects(
    insertArtifactApproval(db, { mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), note: 'NIK: 3273 0101 0101 0001', actor }),
    (error) => error.code === 'SENSITIVE_EVENT_TEXT' && error.status === 422,
  );
  await assert.rejects(
    insertArtifactApproval(db, { mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'override', action: 'reject', snapshot_hash: 'a'.repeat(64), note: 'safe', override_reason: 'bank account 1234-5678-9012', actor }),
    (error) => error.code === 'SENSITIVE_EVENT_TEXT' && error.status === 422,
  );
  await assert.rejects(
    insertCompatibilityDecision(db, { mustahik_id: 1, stage: 'assessment', action: 'approve', artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, snapshot_hash: 'a'.repeat(64), note: 'rekening 1234-5678-9012', actor }),
    (error) => error.code === 'SENSITIVE_EVENT_TEXT' && error.status === 422,
  );
  await assert.rejects(
    insertActivity(db, { mustahik_id: 1, action_type: 'proof_uploaded', title: 'Proof', description: 'proof data: SGVsbG8sIHNlbnNpdGl2ZSBwYXlsb2Fk', actor }),
    (error) => error.code === 'SENSITIVE_EVENT_TEXT' && error.status === 422,
  );
  await insertArtifactApproval(db, { mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), note: 'Reviewed and approved.', actor });
  await insertCompatibilityDecision(db, { mustahik_id: 1, stage: 'assessment', action: 'approve', artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, snapshot_hash: 'a'.repeat(64), note: 'Decision recorded.', actor });
  await insertActivity(db, { mustahik_id: 1, action_type: 'assessment_approved', title: 'Approved', description: 'Routine audit note.', actor });
  const history = await listArtifactHistory(db, 1);
  assert.equal(history.length, 3);
  assert.equal(history.every((event) => event.description && !/NIK|rekening|proof/i.test(event.description)), true);
});

test('history orders timestamps chronologically and fails closed on sensitive free text', async (t) => {
  const db = await createP0TestDatabase();
  t.after(() => db.close());
  const actor = { id: 7, name: 'A', role: 'reviewer', level: 'L2', division: 'program' };
  await db.run("INSERT INTO activity_logs (id,mustahik_id,actor_id,actor_name,actor_role,actor_level,actor_division,action_type,title,description,created_at) VALUES (10,1,7,'A','reviewer','L2','program','late','Late','NIK 3273010101010001 bank rekening 123456789012 proof bytes','2026-10-01T00:00:00Z')");
  await db.run("INSERT INTO activity_logs (id,mustahik_id,actor_id,actor_name,actor_role,actor_level,actor_division,action_type,title,description,created_at) VALUES (11,1,7,'A','reviewer','L2','program','early','Early','safe note','2026-09-30T00:00:00Z')");
  await insertArtifactApproval(db, { mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, approval_step: 'review', action: 'approve', snapshot_hash: 'a'.repeat(64), note: 'safe', actor });
  await db.run("UPDATE artifact_approvals SET created_at='2026-09-30T00:00:01Z' WHERE id=1");
  const history = await listArtifactHistory(db, 1);
  assert.deepEqual(history.map((event) => event.title), ['Early', 'approve', 'Late']);
  assert.equal(history[2].description, null);
  assert.doesNotMatch(JSON.stringify(history), /3273010101010001|123456789012|proof bytes/);
});
