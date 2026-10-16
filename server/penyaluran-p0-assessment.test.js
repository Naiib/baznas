import test from 'node:test';
import assert from 'node:assert/strict';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { createAssessmentDraft, saveAssessmentDraft, submitAssessment, reviewAssessment } from './penyaluran-p0/assessment-service.js';

const actor = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const reviewer = { id: 8, name: 'Dewi', role: 'penyaluran', level: 'leader', division: 'Penyaluran' };
const fields = {
  husband_in_household: true, husband_name: 'Budi', wife_in_household: false, wife_name: null, child_count: 0,
  house_ownership: 'Milik Sendiri', home_address: ' Jalan Mawar ', address_matches_ktp: true, monthly_rent_amount: null,
  husband_occupation: 'Pedagang', husband_monthly_income: '1000000', wife_occupation: null, wife_monthly_income: null,
  child_occupation: null, child_monthly_support: null, assistance_request: 'Modal usaha', applied_to_baznas_before: false, previous_application_year: null,
};
async function dbWithAssessmentColumns() {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Survey',workflow_mode='p0'");
  await db.exec('INSERT INTO applications (mustahik_id) VALUES (1);');
  await db.exec(`ALTER TABLE assessments ADD COLUMN supersedes_id INTEGER, ADD COLUMN template_code TEXT, ADD COLUMN template_version TEXT, ADD COLUMN submitted_at TIMESTAMPTZ, ADD COLUMN reviewed_at TIMESTAMPTZ, ADD COLUMN husband_in_household BOOLEAN, ADD COLUMN husband_name TEXT, ADD COLUMN wife_in_household BOOLEAN, ADD COLUMN wife_name TEXT, ADD COLUMN child_count INTEGER, ADD COLUMN house_ownership TEXT, ADD COLUMN home_address TEXT, ADD COLUMN address_matches_ktp BOOLEAN, ADD COLUMN monthly_rent_amount NUMERIC, ADD COLUMN husband_occupation TEXT, ADD COLUMN husband_monthly_income NUMERIC, ADD COLUMN wife_occupation TEXT, ADD COLUMN wife_monthly_income NUMERIC, ADD COLUMN child_occupation TEXT, ADD COLUMN child_monthly_support NUMERIC, ADD COLUMN assistance_request TEXT, ADD COLUMN applied_to_baznas_before BOOLEAN, ADD COLUMN previous_application_year INTEGER;`);
  return db;
}

test('assessment service module exposes draft creation', () => {
  assert.equal(typeof createAssessmentDraft, 'function');
});

test('one submitted payload creates one row and one immutable snapshot', async (t) => {
  const db = await dbWithAssessmentColumns(); t.after(() => db.close());
  const draft = await createAssessmentDraft({ db, actor }, 1, {}, { idempotency_key: 'draft-1', expected_version: 0 });
  const submitted = await submitAssessment({ db, actor, mustahik_id: 1 }, draft.data.id, fields, { idempotency_key: 'submit-1', expected_version: 0, expected_revision: 1 });
  assert.equal(submitted.data.status, 'submitted');
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM assessments')).count), 1);
  assert.match(submitted.data.snapshot_hash, /^[a-f0-9]{64}$/);
  assert.equal(submitted.data.snapshot_json.source_fields, undefined);
  assert.equal(submitted.data.snapshot_json.home_address, 'Jalan Mawar');
  const decision = await db.get("SELECT note FROM approval_decisions WHERE action='submit'");
  assert.ok(decision.note, 'submit compatibility decision must carry a non-null note');
});

test('return freezes revision and correction creates successor', async (t) => {
  const db = await dbWithAssessmentColumns(); t.after(() => db.close());
  const draft = await createAssessmentDraft({ db, actor }, 1, {}, { idempotency_key: 'draft-2', expected_version: 0 });
  const submitted = await submitAssessment({ db, actor, mustahik_id: 1 }, draft.data.id, fields, { idempotency_key: 'submit-2', expected_version: 0, expected_revision: 1 });
  const returned = await reviewAssessment({ db, actor: reviewer, mustahik_id: 1 }, submitted.data.id, { action: 'return', note: 'Mohon koreksi alamat.' }, { idempotency_key: 'review-2', expected_version: 0, expected_revision: 1, expected_snapshot_hash: submitted.data.snapshot_hash });
  assert.equal(returned.data.status, 'returned');
  const next = await createAssessmentDraft({ db, actor }, 1, { note: 'Koreksi alamat setelah kunjungan ulang.' }, { idempotency_key: 'draft-3', expected_version: 0 });
  assert.deepEqual([next.data.revision, next.data.supersedes_id], [2, submitted.data.id]);
});

test('accept uses a distinct reviewer and advances the case exactly once', async (t) => {
  const db = await dbWithAssessmentColumns(); t.after(() => db.close());
  const draft = await createAssessmentDraft({ db, actor }, 1, {}, { idempotency_key: 'draft-4', expected_version: 0 });
  const submitted = await submitAssessment({ db, actor, mustahik_id: 1 }, draft.data.id, fields, { idempotency_key: 'submit-4', expected_version: 0, expected_revision: 1 });
  const accepted = await reviewAssessment({ db, actor: reviewer, mustahik_id: 1 }, submitted.data.id, { action: 'accept' }, { idempotency_key: 'review-4', expected_version: 0, expected_revision: 1, expected_snapshot_hash: submitted.data.snapshot_hash });
  assert.equal(accepted.data.status, 'accepted');
  const row = await db.get('SELECT status,workflow_version FROM mustahik WHERE id=1');
  assert.deepEqual(row, { status: 'Persetujuan MPZIS', workflow_version: 1 });
  const replay = await reviewAssessment({ db, actor: reviewer, mustahik_id: 1 }, submitted.data.id, { action: 'accept' }, { idempotency_key: 'review-4', expected_version: 0, expected_revision: 1, expected_snapshot_hash: submitted.data.snapshot_hash });
  assert.equal(replay.replayed, true);
  assert.equal(replay.data.status, 'accepted');
  const reviewDecision = await db.get("SELECT note FROM approval_decisions WHERE action='accept'");
  assert.ok(reviewDecision.note, 'accept compatibility decision must carry a non-null note');
});

test('save trims draft fields and rejects forged score fields', async (t) => {
  const db = await dbWithAssessmentColumns(); t.after(() => db.close());
  const draft = await createAssessmentDraft({ db, actor }, 1, {}, { idempotency_key: 'draft-5', expected_version: 0 });
  const saved = await saveAssessmentDraft({ db, actor, mustahik_id: 1 }, draft.data.id, { home_address: '  Jalan Kenanga  ' }, { idempotency_key: 'save-5', expected_version: 0, expected_revision: 1 });
  assert.equal(saved.data.source_fields.home_address, 'Jalan Kenanga');
  await assert.rejects(saveAssessmentDraft({ db, actor, mustahik_id: 1 }, draft.data.id, { overall_score: 9 }, { idempotency_key: 'save-6', expected_version: 0, expected_revision: 1 }), (error) => error.status === 422 && error.field_errors.overall_score === 'FIELD_FORBIDDEN');
});
