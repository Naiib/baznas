import { getDb, withTransaction } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';
import { validateAssessment, assertValid } from './validation.js';
import { createSnapshot, SOURCE_FIELDS } from './canonical-snapshot.js';
import {
  withP0Command,
  getActiveAssessment,
  insertArtifactApproval,
  insertCompatibilityDecision,
  insertActivity,
  listArtifactHistory,
} from './repository.js';
import { formatMoney, parseMoney } from './money.js';

const SOURCE_SET = new Set(SOURCE_FIELDS);
const TEXT_FIELDS = new Set([
  'husband_name', 'wife_name', 'home_address', 'husband_occupation', 'wife_occupation',
  'child_occupation', 'assistance_request',
]);
const MONEY_FIELDS = new Set([
  'monthly_rent_amount', 'husband_monthly_income', 'wife_monthly_income', 'child_monthly_support',
]);
const REQUIRED_GUARD = (name) => {
  throw new P0Error('EXPECTED_GUARD_INVALID', `${name} is required.`, { status: 422 });
};

function actorOf(context = {}) { return context.actor || context.user || {}; }
function assertEnabled(context = {}) {
  if (context.p0Enabled === false || context.featureEnabled === false) throw new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 });
}
function dbOf(context = {}) { return context.db || context.dbOverride || context.txDb; }
function nowOf(value) {
  const now = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (!Number.isFinite(now.getTime())) throw new P0Error('SERVER_TIME_INVALID', 'Waktu server tidak valid.', { status: 500 });
  return now;
}
function id(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 400, field_errors: { [field]: 'INTEGER' } });
  return n;
}
function keyOf(meta = {}) {
  const key = meta.idempotency_key ?? meta.idempotencyKey;
  if (typeof key !== 'string' || !key.trim() || key.length > 150) throw new P0Error('IDEMPOTENCY_REQUIRED', 'Idempotency-Key wajib diisi.', { status: 400 });
  return key.trim();
}
function expectedMeta(meta, { revision = true, version = true } = {}) {
  if (version && !Object.prototype.hasOwnProperty.call(meta, 'expected_version')) REQUIRED_GUARD('expected_version');
  if (revision && !Object.prototype.hasOwnProperty.call(meta, 'expected_revision')) REQUIRED_GUARD('expected_revision');
}
function sourceInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new P0Error('VALIDATION_FAILED', 'Data assessment harus berupa objek.', { status: 422, field_errors: { body: 'OBJECT_REQUIRED' } });
  return input;
}
function splitCommandInput(input, meta = {}) {
  const value = sourceInput(input);
  const controls = ['idempotency_key', 'idempotencyKey', 'correlation_id', 'correlationId', 'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash', 'application_id'];
  const extracted = { ...meta };
  const body = { ...value };
  for (const key of controls) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      if (extracted[key] === undefined) extracted[key] = body[key];
      delete body[key];
    }
  }
  return { body, meta: extracted };
}
function assertSourceKeys(input, { allowNote = false } = {}) {
  const errors = {};
  for (const field of Object.keys(input || {})) {
    if (allowNote && field === 'note') continue;
    if (!SOURCE_SET.has(field)) errors[field] = /score|index|priority/i.test(field) ? 'FIELD_FORBIDDEN' : 'FIELD_UNDECLARED';
  }
  if (Object.keys(errors).length) throw new P0Error('VALIDATION_FAILED', 'Field assessment tidak diizinkan.', { status: 422, field_errors: errors });
}
function normalizeSource(input) {
  const result = {};
  for (const field of SOURCE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    let value = input[field];
    if (TEXT_FIELDS.has(field) && typeof value === 'string') value = value.trim();
    if (MONEY_FIELDS.has(field) && value !== null && value !== undefined && value !== '') {
      try { value = formatMoney(parseMoney(value)); } catch { /* validator supplies the stable error */ }
    }
    result[field] = value;
  }
  return result;
}
function sourceFromRow(row) {
  const source = {};
  for (const field of SOURCE_FIELDS) source[field] = row[field] ?? null;
  return source;
}
function jsonValue(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  return value;
}
function dto(row) {
  if (!row) return null;
  const source = sourceFromRow(row);
  return {
    id: row.id,
    mustahik_id: row.mustahik_id,
    application_id: row.application_id ?? null,
    revision: row.revision,
    supersedes_id: row.supersedes_id ?? null,
    status: row.status,
    source: row.source,
    template_code: row.template_code ?? 'ASSESSMENT_LANGSUNG_MUSTAHIK',
    template_version: row.template_version ?? '2026-09-13',
    snapshot_json: jsonValue(row.snapshot_json),
    snapshot_hash: row.snapshot_hash ?? null,
    source_fields: source,
    created_by_id: row.created_by_id ?? null,
    updated_by_id: row.updated_by_id ?? null,
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
  };
}
function validateOrThrow(input, mode, now) { return assertValid(validateAssessment(input, { mode, now })); }
async function applicationFor(db, mustahikId) {
  try {
    const row = await db.get('SELECT id FROM applications WHERE mustahik_id=$1 ORDER BY id DESC LIMIT 1', [mustahikId]);
    return row?.id ?? null;
  } catch (error) {
    if (/relation .*applications.* does not exist/i.test(String(error?.message))) return null;
    throw error;
  }
}
async function allRevisions(db, mustahikId, applicationId) {
  return db.all("SELECT * FROM assessments WHERE mustahik_id=$1 AND source='p0' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision ASC, id ASC", [mustahikId, applicationId]);
}
async function activeFor(db, mustahikId, applicationId, lock = true) {
  return getActiveAssessment(db, mustahikId, { application_id: applicationId, lock });
}
function commandContext(context, mustahikId) { return { ...context, mustahik_id: mustahikId, actor: actorOf(context) }; }

export async function getAssessmentCase(context = {}, mustahikId, meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id');
  const actor = actorOf(context);
  assertAllowed(ACTIONS.CASE_READ, actor);
  const db = dbOf(context) || await getDb();
  return withTransaction(db, async (txDb) => {
    const mustahik = await txDb.get('SELECT id,status,workflow_mode,workflow_version FROM mustahik WHERE id=$1', [caseId]);
    if (!mustahik) throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    if (mustahik.workflow_mode !== 'p0') throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    const applicationId = await applicationFor(txDb, caseId);
    const active = await activeFor(txDb, caseId, applicationId, false);
    const revisions = await allRevisions(txDb, caseId, applicationId);
    const history = await listArtifactHistory(txDb, caseId);
    return {
      success: true,
      data: {
        mustahik_id: caseId,
        application_id: applicationId,
        status: mustahik.status,
        workflow_mode: mustahik.workflow_mode,
        workflow_version: mustahik.workflow_version,
        active: dto(active),
        assessment: dto(active),
        revision_history: revisions.map((row) => ({ id: row.id, revision: row.revision, status: row.status, supersedes_id: row.supersedes_id ?? null, snapshot_hash: row.snapshot_hash ?? null })),
        history,
      },
    };
  });
}

export async function createAssessmentDraft(context = {}, mustahikId, input = {}, meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id');
  const actor = actorOf(context);
  assertAllowed(ACTIONS.ASSESSMENT_CREATE, actor);
  assertEnabled(context);
  const split = splitCommandInput(input, meta); const body = split.body; meta = split.meta;
  const key = keyOf(meta);
  expectedMeta(meta, { revision: false, version: true });
  const db = dbOf(context) || await getDb();
  assertSourceKeys(body, { allowNote: true });
  const correlation = meta.correlation_id ?? meta.correlationId ?? null;
  return withP0Command(commandContext({ ...context, db }, caseId), {
    ...meta, idempotency_key: key, expected_status: meta.expected_status ?? 'Survey', request: Object.keys(body).length ? body : { command: 'create' },
  }, async ({ txDb, caseRow, actor: txActor }) => {
    if (caseRow.workflow_mode !== 'p0' || caseRow.status !== 'Survey') throw new P0Error('WRONG_STATE', 'Assessment hanya dapat dibuat pada tahap Survey.', { status: 409 });
    const applicationId = await applicationFor(txDb, caseId);
    const existing = await activeFor(txDb, caseId, applicationId, true);
    if (existing?.status === 'draft') return { response: { success: true, data: dto(existing) }, activity: null };
    if (existing && existing.status !== 'returned') throw new P0Error('ACTIVE_REVISION_EXISTS', 'Assessment aktif sudah tersedia.', { status: 409 });
    const prior = await allRevisions(txDb, caseId, applicationId);
    const revision = prior.reduce((max, row) => Math.max(max, Number(row.revision) || 0), 0) + 1;
    const supersedes = existing?.status === 'returned' ? existing.id : null;
    const correctionNote = typeof body.note === 'string' ? body.note.trim() : '';
    if (supersedes && !correctionNote) throw new P0Error('VALIDATION_FAILED', 'Catatan koreksi wajib diisi.', { status: 422, field_errors: { note: 'REQUIRED' } });
    const created = await txDb.query(`
      INSERT INTO assessments (mustahik_id,application_id,revision,supersedes_id,status,source,template_code,template_version,created_by_id,updated_by_id)
      VALUES ($1,$2,$3,$4,'draft','p0','ASSESSMENT_LANGSUNG_MUSTAHIK','2026-09-13',$5,$5) RETURNING *
    `, [caseId, applicationId, revision, supersedes, txActor.id]);
    const row = created.rows?.[0];
    if (!row) throw new P0Error('ASSESSMENT_CREATE_FAILED', 'Assessment draft gagal dibuat.', { status: 500 });
    return {
      response: { success: true, data: dto(row) },
      activity: { action_type: 'assessment_draft_created', title: 'Assessment draft created', description: correctionNote || 'P0 assessment draft created.', old_status: caseRow.status, new_status: caseRow.status, correlation_id: correlation },
    };
  });
}

export async function saveAssessmentDraft(context = {}, assessmentId, input = {}, meta = {}) {
  const artifactId = id(assessmentId, 'assessment_id');
  const actor = actorOf(context);
  assertAllowed(ACTIONS.ASSESSMENT_UPDATE, actor);
  assertEnabled(context);
  const split = splitCommandInput(input, meta); const body = split.body; meta = split.meta;
  const key = keyOf(meta);
  expectedMeta(meta);
  assertSourceKeys(body);
  const db = dbOf(context) || await getDb();
  const applicationId = await applicationFor(db, context.mustahik_id ?? context.mustahikId);
  return withP0Command({ ...context, db, mustahik_id: context.mustahik_id ?? context.mustahikId }, {
    ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'assessment', artifact_id: artifactId, request: body,
  }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Survey') throw new P0Error('WRONG_STATE', 'Draft assessment hanya dapat diubah pada tahap Survey.', { status: 409 });
    if (artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft assessment yang dapat diubah.', { status: 409 });
    const merged = { ...sourceFromRow(artifact), ...body };
    const clean = normalizeSource(merged);
    validateOrThrow(normalizeSource(body), 'draft', nowOf(context.now));
    const fields = [...SOURCE_FIELDS, 'updated_by_id'];
    const values = fields.map((field) => field === 'updated_by_id' ? txActor.id : clean[field] ?? null);
    const sets = fields.map((field, i) => `${field}=$${i + 1}`);
    values.push(artifact.id);
    const result = await txDb.query(`UPDATE assessments SET ${sets.join(', ')} WHERE id=$${values.length} RETURNING *`, values);
    const row = result.rows?.[0];
    if (!row) throw new P0Error('ASSESSMENT_UPDATE_FAILED', 'Assessment draft gagal disimpan.', { status: 500 });
    return { response: { success: true, data: dto(row) }, activity: { action_type: 'assessment_draft_saved', title: 'Assessment draft saved', description: 'P0 assessment draft saved.' } };
  });
}

export async function submitAssessment(context = {}, assessmentId, input = {}, meta = {}) {
  const artifactId = id(assessmentId, 'assessment_id');
  const actor = actorOf(context);
  assertAllowed(ACTIONS.ASSESSMENT_SUBMIT, actor);
  assertEnabled(context);
  const split = splitCommandInput(input, meta); const body = split.body; meta = split.meta;
  const key = keyOf(meta);
  expectedMeta(meta);
  assertSourceKeys(body);
  const db = dbOf(context) || await getDb();
  const applicationId = await applicationFor(db, context.mustahik_id ?? context.mustahikId);
  return withP0Command({ ...context, db, mustahik_id: context.mustahik_id ?? context.mustahikId }, {
    ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'assessment', artifact_id: artifactId, request: body,
  }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Survey') throw new P0Error('WRONG_STATE', 'Submit assessment hanya dapat dilakukan pada tahap Survey.', { status: 409 });
    if (artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft assessment yang dapat dikirim.', { status: 409 });
    const clean = normalizeSource({ ...sourceFromRow(artifact), ...body });
    const applicationId = artifact.application_id ?? null;
    const inputForValidation = {
      schema_version: 1, artifact_type: 'assessment', id: artifact.id, revision: artifact.revision,
      mustahik_id: artifact.mustahik_id, application_id: applicationId,
      template_code: 'ASSESSMENT_LANGSUNG_MUSTAHIK', template_version: '2026-09-13', source: 'p0', ...clean,
    };
    validateOrThrow(inputForValidation, 'submit', nowOf(context.now));
    const snapshot = createSnapshot('assessment', inputForValidation);
    const now = nowOf(context.now).toISOString();
    const columns = [...SOURCE_FIELDS, 'template_code', 'template_version', 'snapshot_json', 'snapshot_hash', 'status', 'submitted_at', 'updated_by_id'];
    const values = columns.map((field) => {
      if (SOURCE_SET.has(field)) return clean[field] ?? null;
      if (field === 'template_code') return 'ASSESSMENT_LANGSUNG_MUSTAHIK';
      if (field === 'template_version') return '2026-09-13';
      if (field === 'snapshot_json') return JSON.stringify(snapshot.json);
      if (field === 'snapshot_hash') return snapshot.hash;
      if (field === 'status') return 'submitted';
      if (field === 'submitted_at') return now;
      return txActor.id;
    });
    values.push(artifact.id);
    const result = await txDb.query(`UPDATE assessments SET ${columns.map((field, i) => `${field}=$${i + 1}`).join(', ')} WHERE id=$${values.length} RETURNING *`, values);
    const row = result.rows?.[0];
    if (!row) throw new P0Error('ASSESSMENT_SUBMIT_FAILED', 'Assessment gagal dikirim.', { status: 500 });
    const submitted = dto(row);
    await insertArtifactApproval(txDb, { mustahik_id: caseRow.id, artifact_type: 'assessment', artifact_id: row.id, artifact_revision: row.revision, approval_step: 'submit', action: 'submit', snapshot_hash: snapshot.hash, actor: txActor, correlation_id: meta.correlation_id ?? null });
    await insertCompatibilityDecision(txDb, { mustahik_id: caseRow.id, stage: 'assessment', action: 'submit', previous_status: 'draft', next_status: 'submitted', artifact_type: 'assessment', artifact_id: row.id, artifact_revision: row.revision, snapshot_hash: snapshot.hash, evidence_grade: 'p0', note: 'Assessment P0 dikirim untuk ditinjau.', actor: txActor, correlation_id: meta.correlation_id ?? null });
    await insertActivity(txDb, { mustahik_id: caseRow.id, action_type: 'assessment_submitted', title: 'Assessment submitted', description: 'P0 assessment submitted.', old_status: 'draft', new_status: 'submitted', actor: txActor, correlation_id: meta.correlation_id ?? null });
    return { response: { success: true, data: submitted }, activity: null };
  });
}

export async function reviewAssessment(context = {}, assessmentId, input = {}, meta = {}) {
  const artifactId = id(assessmentId, 'assessment_id');
  const actor = actorOf(context);
  assertEnabled(context);
  const split = splitCommandInput(input, meta); input = split.body; meta = split.meta;
  const action = input?.action;
  const reviewErrors = {};
  for (const field of Object.keys(input || {})) {
    if (field !== 'action' && field !== 'note') reviewErrors[field] = /score|index|priority/i.test(field) ? 'FIELD_FORBIDDEN' : 'FIELD_UNDECLARED';
  }
  if (Object.keys(reviewErrors).length) throw new P0Error('VALIDATION_FAILED', 'Field review assessment tidak diizinkan.', { status: 422, field_errors: reviewErrors });
  if (action !== 'accept' && action !== 'return') throw new P0Error('FIELD_INVALID', 'Aksi review tidak valid.', { status: 422, field_errors: { action: 'ENUM' } });
  expectedMeta(meta);
  if (!Object.prototype.hasOwnProperty.call(meta, 'expected_snapshot_hash')) REQUIRED_GUARD('expected_snapshot_hash');
  const key = keyOf(meta);
  assertAllowed(ACTIONS.ASSESSMENT_REVIEW, actor, { submitter_id: meta.submitter_id });
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (action === 'return' && !note) throw new P0Error('VALIDATION_FAILED', 'Catatan pengembalian wajib diisi.', { status: 422, field_errors: { note: 'REQUIRED' } });
  const db = dbOf(context) || await getDb();
  const applicationId = await applicationFor(db, context.mustahik_id ?? context.mustahikId);
  return withP0Command({ ...context, db, mustahik_id: context.mustahik_id ?? context.mustahikId }, {
    ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'assessment', artifact_id: artifactId, request: { action, note },
  }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (artifact.status !== 'submitted' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Assessment belum siap direview.', { status: 409 });
    if (caseRow.status !== 'Survey') throw new P0Error('WRONG_STATE', 'Review assessment hanya dapat dilakukan pada tahap Survey.', { status: 409 });
    const submitter = await txDb.get("SELECT actor_id FROM artifact_approvals WHERE artifact_type='assessment' AND artifact_id=$1 AND artifact_revision=$2 AND action='submit' ORDER BY id ASC LIMIT 1", [artifact.id, artifact.revision]);
    if (!submitter?.actor_id) throw new P0Error('ACTOR_CONTEXT_REQUIRED', 'Bukti submitter assessment tidak ditemukan.', { status: 403 });
    assertAllowed(ACTIONS.ASSESSMENT_REVIEW, txActor, { submitter_id: submitter?.actor_id });
    const nextStatus = action === 'accept' ? 'accepted' : 'returned';
    const reviewNote = note || (action === 'accept' ? 'Assessment P0 diterima setelah peninjauan.' : 'Assessment P0 dikembalikan untuk koreksi.');
    const updated = await txDb.query("UPDATE assessments SET status=$1,reviewed_at=CURRENT_TIMESTAMP,updated_by_id=$2 WHERE id=$3 AND status='submitted' RETURNING *", [nextStatus, txActor.id, artifact.id]);
    const row = updated.rows?.[0];
    if (!row) throw new P0Error('STALE_ARTIFACT', 'Assessment berubah sebelum review.', { status: 409 });
    const response = { success: true, data: dto(row) };
    return {
      response,
      approval: { approval_step: 'review', action: action === 'accept' ? 'approve' : 'return', snapshot_hash: artifact.snapshot_hash, note: reviewNote },
      decision: { stage: 'assessment', action, previous_status: 'submitted', next_status: nextStatus, snapshot_hash: artifact.snapshot_hash, note: reviewNote, evidence_grade: 'p0' },
      activity: { action_type: action === 'accept' ? 'assessment_accepted' : 'assessment_returned', title: action === 'accept' ? 'Assessment accepted' : 'Assessment returned', description: reviewNote, old_status: 'submitted', new_status: nextStatus },
      projection: action === 'accept' ? { status: 'Persetujuan MPZIS' } : null,
    };
  });
}
