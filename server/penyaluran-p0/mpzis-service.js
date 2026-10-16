import { getDb, withTransaction } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, MPZIS_STEPS, assertAllowed } from './permissions.js';
import { validateMpzis, assertValid } from './validation.js';
import { createSnapshot } from './canonical-snapshot.js';
import {
  withP0Command,
  getActiveAssessment,
  getActiveMpzis,
  insertArtifactApproval,
  insertCompatibilityDecision,
  insertActivity,
  listArtifactHistory,
} from './repository.js';
import { formatMoney, parseMoney } from './money.js';

const TEMPLATE_CODE = 'F-BPP/06';
const TEMPLATE_VERSION = '2026-09-13';
const MPZIS_FIELDS = new Set([
  'form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf',
  'fund_source', 'recipient_name', 'recipient_type', 'beneficiary_count',
  'total_amount', 'address_snapshot', 'marital_status_snapshot',
  'recipient_section_confirmed', 'fund_source_confirmed',
]);
const STEP_STATUS = Object.freeze({
  proposed: 'proposed',
  examined: 'examined',
  ashnaf_verified: 'ashnaf_verified',
  responsible_acknowledged: 'responsible_acknowledged',
  approved: 'approved',
});
const STEP_INDEX = new Map(MPZIS_STEPS.map((step, index) => [step, index]));

function actorOf(context = {}) { return context.actor || context.user || {}; }
function dbOf(context = {}) { return context.db || context.dbOverride || context.txDb; }
function id(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 400, field_errors: { [field]: 'INTEGER' } });
  return n;
}
function assertEnabled(context = {}) {
  if (context.p0Enabled === false || context.featureEnabled === false) throw new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 });
}
function commandKey(meta = {}) {
  const key = meta.idempotency_key ?? meta.idempotencyKey;
  if (typeof key !== 'string' || !key.trim() || key.length > 150) throw new P0Error('IDEMPOTENCY_REQUIRED', 'Idempotency-Key wajib diisi.', { status: 400 });
  return key.trim();
}
function expectedMeta(meta, { hash = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(meta, 'expected_version')) throw new P0Error('EXPECTED_GUARD_INVALID', 'expected_version is required.', { status: 422 });
  if (!Object.prototype.hasOwnProperty.call(meta, 'expected_revision')) throw new P0Error('EXPECTED_GUARD_INVALID', 'expected_revision is required.', { status: 422 });
  if (hash && !Object.prototype.hasOwnProperty.call(meta, 'expected_snapshot_hash')) throw new P0Error('EXPECTED_GUARD_INVALID', 'expected_snapshot_hash is required.', { status: 422 });
}
function splitInput(input, meta = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new P0Error('VALIDATION_FAILED', 'Data MPZIS harus berupa objek.', { status: 422, field_errors: { body: 'OBJECT_REQUIRED' } });
  const body = { ...input }; const merged = { ...meta };
  for (const key of ['idempotency_key', 'idempotencyKey', 'correlation_id', 'correlationId', 'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash', 'application_id']) {
    if (Object.prototype.hasOwnProperty.call(body, key)) { if (merged[key] === undefined) merged[key] = body[key]; delete body[key]; }
  }
  return { body, meta: merged };
}
function assertFields(body, { allowNote = false } = {}) {
  const errors = {};
  for (const key of Object.keys(body || {})) {
    if (allowNote && key === 'note') continue;
    if (!MPZIS_FIELDS.has(key)) errors[key] = 'FIELD_UNDECLARED';
  }
  if (Object.keys(errors).length) throw new P0Error('VALIDATION_FAILED', 'Field MPZIS tidak diizinkan.', { status: 422, field_errors: errors });
}
function jsonValue(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  return value;
}
function moneyValue(value) {
  if (value === undefined || value === null || value === '') return value ?? null;
  try { return formatMoney(parseMoney(typeof value === 'number' ? String(value) : value)); } catch { return value; }
}
function addressFromCase(row) {
  return {
    address: row.address ?? null,
    rt_rw: row.rt_rw ?? null,
    kelurahan: row.kelurahan ?? null,
    kecamatan: row.kecamatan ?? null,
    kabupaten_kota: row.kabupaten_kota ?? null,
    province: row.province ?? null,
  };
}
function sourceFields(row) {
  const snapshot = jsonValue(row?.snapshot_json) || {};
  return Object.fromEntries([...MPZIS_FIELDS].map((field) => [field, field === 'address_snapshot' ? jsonValue(row[field]) : (row?.[field] ?? snapshot[field] ?? null)]));
}
function dto(row, approvals = undefined) {
  if (!row) return null;
  const result = {
    id: row.id,
    mustahik_id: row.mustahik_id,
    application_id: row.application_id ?? null,
    revision: row.revision,
    supersedes_id: row.supersedes_id ?? null,
    status: row.status,
    source: row.source,
    template_code: row.template_code ?? TEMPLATE_CODE,
    template_version: row.template_version ?? TEMPLATE_VERSION,
    form_number: row.form_number ?? null,
    snapshot_json: jsonValue(row.snapshot_json),
    snapshot_hash: row.snapshot_hash ? String(row.snapshot_hash).trim() : null,
    source_fields: sourceFields(row),
    created_by_id: row.created_by_id ?? null,
    submitted_by_id: row.submitted_by_id ?? null,
    submitted_at: row.submitted_at ?? null,
    approved_at: row.approved_at ?? null,
  };
  if (approvals !== undefined) result.approvals = approvals;
  return result;
}
async function applicationFor(db, mustahikId) {
  try { const row = await db.get('SELECT id FROM applications WHERE mustahik_id=$1 ORDER BY id DESC LIMIT 1', [mustahikId]); return row?.id ?? null; }
  catch (error) { if (/relation .*applications.* does not exist/i.test(String(error?.message))) return null; throw error; }
}
async function revisions(db, mustahikId, applicationId) {
  return db.all("SELECT * FROM mpzis WHERE mustahik_id=$1 AND source='p0' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision ASC,id ASC", [mustahikId, applicationId]);
}
function validateDraft(body) { assertValid(validateMpzis(body, { mode: 'draft' })); }
function assessmentSnapshot(row) {
  const snapshot = jsonValue(row?.snapshot_json);
  if (!row || row.source !== 'p0' || row.status !== 'accepted' || !row.snapshot_hash || !snapshot || typeof snapshot !== 'object') {
    throw new P0Error('ASSESSMENT_NOT_ACCEPTED', 'MPZIS hanya dapat dibuat dari Assessment yang diterima.', { status: 409 });
  }
  if (snapshot.artifact_type && snapshot.artifact_type !== 'assessment') throw new P0Error('STALE_ARTIFACT', 'Assessment snapshot tidak valid.', { status: 409 });
  return snapshot;
}

export async function getMpzisCase(context = {}, mustahikId, meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id');
  const actor = actorOf(context); assertAllowed(ACTIONS.CASE_READ, actor);
  const db = dbOf(context) || await getDb();
  return withTransaction(db, async (txDb) => {
    const mustahik = await txDb.get('SELECT * FROM mustahik WHERE id=$1', [caseId]);
    if (!mustahik || mustahik.workflow_mode !== 'p0') throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    const applicationId = await applicationFor(txDb, caseId);
    const active = await getActiveMpzis(txDb, caseId, { application_id: applicationId, lock: false });
    const rows = await revisions(txDb, caseId, applicationId);
    const approvals = active ? await txDb.all("SELECT id,approval_step,action,snapshot_hash,note,actor_id,actor_name,actor_role,actor_level,actor_division,created_at,is_admin_override,override_reason FROM artifact_approvals WHERE artifact_type='mpzis' AND artifact_id=$1 AND artifact_revision=$2 ORDER BY id", [active.id, active.revision]) : [];
    const approvalSteps = MPZIS_STEPS.map((step) => ({ step, approval: approvals.find((event) => event.approval_step === step && event.action === 'approve') || null }));
    return { success: true, data: { mustahik_id: caseId, application_id: applicationId, status: mustahik.status, workflow_mode: mustahik.workflow_mode, workflow_version: mustahik.workflow_version, active: dto(active, approvals), mpzis: dto(active, approvals), approval_steps: approvalSteps, revision_history: rows.map((row) => ({ id: row.id, revision: row.revision, status: row.status, supersedes_id: row.supersedes_id ?? null, snapshot_hash: row.snapshot_hash ? String(row.snapshot_hash).trim() : null })), history: await listArtifactHistory(txDb, caseId) } };
  });
}

export async function createMpzisDraft(context = {}, mustahikId, input = {}, meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id'); const actor = actorOf(context);
  assertAllowed(ACTIONS.MPZIS_CREATE, actor); assertEnabled(context);
  const split = splitInput(input, meta); const body = split.body; meta = split.meta; assertFields(body, { allowNote: true });
  const key = commandKey(meta); expectedMeta(meta, { revision: false }); const db = dbOf(context) || await getDb();
  const draftBody = { ...body }; delete draftBody.note; validateDraft(draftBody);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, idempotency_key: key, expected_status: meta.expected_status ?? 'Persetujuan MPZIS', request: Object.keys(body).length ? body : { command: 'create' } }, async ({ txDb, caseRow, actor: txActor }) => {
    if (caseRow.workflow_mode !== 'p0' || caseRow.status !== 'Persetujuan MPZIS') throw new P0Error('WRONG_STATE', 'MPZIS hanya dapat dibuat pada tahap Persetujuan MPZIS.', { status: 409 });
    const applicationId = await applicationFor(txDb, caseId);
    const accepted = assessmentSnapshot(await getActiveAssessment(txDb, caseId, { application_id: applicationId, lock: true }));
    const existing = await getActiveMpzis(txDb, caseId, { application_id: applicationId, lock: true });
    if (existing?.status === 'draft') return { response: { success: true, data: dto(existing) }, activity: null };
    if (existing && existing.status !== 'returned') throw new P0Error('ACTIVE_REVISION_EXISTS', 'MPZIS aktif sudah tersedia.', { status: 409 });
    const prior = await revisions(txDb, caseId, applicationId); const revision = prior.reduce((max, row) => Math.max(max, Number(row.revision) || 0), 0) + 1;
    const supersedesId = existing?.status === 'returned' ? existing.id : null;
    if (supersedesId) await txDb.query("UPDATE mpzis SET status='superseded' WHERE id=$1 AND status='returned'", [supersedesId]);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (supersedesId && !note) throw new P0Error('VALIDATION_FAILED', 'Catatan koreksi wajib diisi.', { status: 422, field_errors: { note: 'REQUIRED' } });
    // lockCase intentionally returns only workflow columns; read the locked
    // row again for the immutable address and marital snapshots.
    const sourceCase = await txDb.get('SELECT * FROM mustahik WHERE id=$1', [caseId]);
    const address = addressFromCase(sourceCase || caseRow);
    const values = {
      form_number: existing?.form_number ?? body.form_number ?? null,
      mpzis_date: body.mpzis_date ?? null, program_classification: body.program_classification ?? null,
      purpose: body.purpose ?? null, asnaf: body.asnaf ?? null, fund_source: body.fund_source ?? 'Zakat',
      recipient_name: body.recipient_name ?? null, recipient_type: body.recipient_type ?? 'Individu', beneficiary_count: body.beneficiary_count ?? 1,
      total_amount: moneyValue(body.total_amount), address_snapshot: address, marital_status_snapshot: (sourceCase || caseRow).marital_status ?? null,
      recipient_section_confirmed: body.recipient_section_confirmed === true, fund_source_confirmed: body.fund_source_confirmed === true,
    };
    const result = await txDb.query(`INSERT INTO mpzis (mustahik_id,application_id,revision,supersedes_id,status,source,template_code,template_version,created_by_id,form_number,mpzis_date,program_classification,purpose,asnaf,fund_source,recipient_name,recipient_type,beneficiary_count,total_amount,address_snapshot,marital_status_snapshot)
      VALUES ($1,$2,$3,$4,'draft','p0',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`, [caseId, applicationId, revision, supersedesId, TEMPLATE_CODE, TEMPLATE_VERSION, txActor.id, values.form_number, values.mpzis_date, values.program_classification, values.purpose, values.asnaf, values.fund_source, values.recipient_name, values.recipient_type, values.beneficiary_count, values.total_amount, JSON.stringify(values.address_snapshot), values.marital_status_snapshot]);
    const row = result.rows?.[0]; if (!row) throw new P0Error('MPZIS_CREATE_FAILED', 'MPZIS draft gagal dibuat.', { status: 500 });
    return { response: { success: true, data: dto(row) }, activity: { action_type: 'mpzis_draft_created', title: 'MPZIS draft created', description: note || 'P0 MPZIS draft created.', old_status: caseRow.status, new_status: caseRow.status } };
  });
}

export async function saveMpzisDraft(context = {}, mpzisId, input = {}, meta = {}) {
  const artifactId = id(mpzisId, 'mpzis_id'); const actor = actorOf(context); assertAllowed(ACTIONS.MPZIS_UPDATE, actor); assertEnabled(context);
  const split = splitInput(input, meta); const body = split.body; meta = split.meta; assertFields(body); const key = commandKey(meta); expectedMeta(meta);
  const db = dbOf(context) || await getDb(); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const applicationId = await applicationFor(db, caseId);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'mpzis', artifact_id: artifactId, request: body }, async ({ txDb, artifact, caseRow }) => {
    if (caseRow.status !== 'Persetujuan MPZIS' || artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft MPZIS pada tahap Persetujuan MPZIS yang dapat diubah.', { status: 409 });
    for (const field of ['address_snapshot', 'marital_status_snapshot']) if (Object.prototype.hasOwnProperty.call(body, field)) {
      const actual = field === 'address_snapshot' ? JSON.stringify(body[field]) : body[field]; const expected = field === 'address_snapshot' ? JSON.stringify(jsonValue(artifact[field])) : artifact[field];
      if (actual !== expected) throw new P0Error('VALIDATION_FAILED', `${field} berasal dari snapshot Mustahik.`, { status: 422, field_errors: { [field]: 'SOURCE_IMMUTABLE' } });
    }
    const merged = { ...sourceFields(artifact), ...body, address_snapshot: jsonValue(artifact.address_snapshot), marital_status_snapshot: artifact.marital_status_snapshot };
    merged.total_amount = moneyValue(merged.total_amount); validateDraft(merged);
    const fields = ['form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf', 'fund_source', 'recipient_name', 'recipient_type', 'beneficiary_count', 'total_amount', 'address_snapshot', 'marital_status_snapshot', 'snapshot_json'];
    const params = fields.map((field) => field === 'address_snapshot' ? JSON.stringify(merged[field]) : field === 'total_amount' ? moneyValue(merged[field]) : field === 'snapshot_json' ? JSON.stringify(merged) : merged[field] ?? null); params.push(artifact.id);
    const result = await txDb.query(`UPDATE mpzis SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')} WHERE id=$${params.length} RETURNING *`, params); const row = result.rows?.[0];
    if (!row) throw new P0Error('MPZIS_UPDATE_FAILED', 'MPZIS draft gagal disimpan.', { status: 500 });
    return { response: { success: true, data: dto(row) }, activity: { action_type: 'mpzis_draft_saved', title: 'MPZIS draft saved', description: 'P0 MPZIS draft saved.' } };
  });
}

export async function submitMpzis(context = {}, mpzisId, input = {}, meta = {}) {
  const artifactId = id(mpzisId, 'mpzis_id'); const actor = actorOf(context); assertAllowed(ACTIONS.MPZIS_SUBMIT, actor); assertEnabled(context);
  const split = splitInput(input, meta); const body = split.body; meta = split.meta; assertFields(body); const key = commandKey(meta); expectedMeta(meta);
  const db = dbOf(context) || await getDb(); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const applicationId = await applicationFor(db, caseId);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'mpzis', artifact_id: artifactId, request: Object.keys(body).length ? body : { command: 'submit' } }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Persetujuan MPZIS' || artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft MPZIS yang dapat dikirim.', { status: 409 });
    if (String(artifact.created_by_id) === String(txActor.id)) throw new P0Error('ACTOR_SEPARATION', 'Submitter MPZIS harus berbeda dari creator.', { status: 403 });
    const acceptedRow = await getActiveAssessment(txDb, caseId, { application_id: applicationId, lock: true }); const accepted = assessmentSnapshot(acceptedRow);
    const fields = { ...sourceFields(artifact), ...body, address_snapshot: jsonValue(artifact.address_snapshot), marital_status_snapshot: artifact.marital_status_snapshot };
    const snapshotInput = { schema_version: 1, artifact_type: 'mpzis', id: artifact.id, revision: artifact.revision, mustahik_id: caseId, application_id: applicationId, template_code: TEMPLATE_CODE, template_version: TEMPLATE_VERSION, source: 'p0', accepted_assessment_id: acceptedRow.id, accepted_assessment_revision: acceptedRow.revision, accepted_assessment_hash: String(acceptedRow.snapshot_hash).trim(), form_number: fields.form_number, mpzis_date: fields.mpzis_date, program_classification: fields.program_classification, purpose: fields.purpose, asnaf: fields.asnaf, fund_source: fields.fund_source, recipient_name: fields.recipient_name, recipient_type: fields.recipient_type, beneficiary_count: fields.beneficiary_count, total_amount: moneyValue(fields.total_amount), address_snapshot: fields.address_snapshot, marital_status_snapshot: fields.marital_status_snapshot, recipient_section_confirmed: fields.recipient_section_confirmed, fund_source_confirmed: fields.fund_source_confirmed };
    // Keep accepted snapshot identity tied to the currently accepted Assessment.
    if (accepted.mustahik_id && Number(accepted.mustahik_id) !== caseId) throw new P0Error('STALE_ARTIFACT', 'Assessment tidak sesuai dengan Mustahik.', { status: 409 });
    assertValid(validateMpzis(snapshotInput, { mode: 'submit' }));
    const duplicateNumber = await txDb.get("SELECT id FROM mpzis WHERE source='p0' AND status <> 'superseded' AND form_number=$1 AND id<>$2 LIMIT 1", [snapshotInput.form_number, artifact.id]);
    if (duplicateNumber) throw new P0Error('DUPLICATE_FORM_NUMBER', 'Nomor formulir MPZIS sudah digunakan.', { status: 409 });
    const snapshot = createSnapshot('mpzis', snapshotInput); const now = new Date().toISOString();
    const columns = ['form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf', 'fund_source', 'recipient_name', 'recipient_type', 'beneficiary_count', 'total_amount', 'address_snapshot', 'marital_status_snapshot', 'template_code', 'template_version', 'snapshot_json', 'snapshot_hash', 'status', 'submitted_by_id', 'submitted_at'];
    const values = columns.map((field) => field === 'address_snapshot' ? JSON.stringify(snapshotInput[field]) : field === 'snapshot_json' ? JSON.stringify(snapshot.json) : field === 'snapshot_hash' ? snapshot.hash : field === 'status' ? 'submitted' : field === 'submitted_by_id' ? txActor.id : field === 'submitted_at' ? now : field === 'total_amount' ? moneyValue(snapshotInput[field]) : snapshotInput[field] ?? null); values.push(artifact.id);
    const result = await txDb.query(`UPDATE mpzis SET ${columns.map((field, i) => `${field}=$${i + 1}`).join(',')} WHERE id=$${values.length} RETURNING *`, values); const row = result.rows?.[0]; if (!row) throw new P0Error('MPZIS_SUBMIT_FAILED', 'MPZIS gagal dikirim.', { status: 500 });
    const response = { success: true, data: dto(row) }; const note = 'MPZIS P0 dikirim sebagai persiapan untuk lima persetujuan.';
    await insertArtifactApproval(txDb, { mustahik_id: caseId, artifact_type: 'mpzis', artifact_id: row.id, artifact_revision: row.revision, approval_step: 'submit', action: 'submit', snapshot_hash: snapshot.hash, note, actor: txActor, correlation_id: meta.correlation_id ?? null });
    await insertCompatibilityDecision(txDb, { mustahik_id: caseId, stage: 'mpzis', action: 'submit', previous_status: 'draft', next_status: 'submitted', artifact_type: 'mpzis', artifact_id: row.id, artifact_revision: row.revision, snapshot_hash: snapshot.hash, evidence_grade: 'p0', note, actor: txActor, correlation_id: meta.correlation_id ?? null });
    await insertActivity(txDb, { mustahik_id: caseId, action_type: 'mpzis_submitted', title: 'MPZIS submitted', description: note, actor: txActor, correlation_id: meta.correlation_id ?? null });
    return { response, activity: null };
  });
}

export async function decideMpzisStep(context = {}, mpzisId, step, input = {}, meta = {}) {
  const artifactId = id(mpzisId, 'mpzis_id'); if (!MPZIS_STEPS.includes(step)) throw new P0Error('FIELD_INVALID', 'Langkah MPZIS tidak valid.', { status: 422, field_errors: { step: 'ENUM' } });
  const actor = actorOf(context); const split = splitInput(input, meta); const body = split.body; meta = split.meta; const action = body.action;
  const recovery = body.recovery === true || body.is_admin_override === true; const allowedKeys = new Set(['action', 'note', 'recovery', 'is_admin_override', 'override_reason']);
  const fieldErrors = {}; for (const key of Object.keys(body)) if (!allowedKeys.has(key)) fieldErrors[key] = 'FIELD_UNDECLARED'; if (Object.keys(fieldErrors).length) throw new P0Error('VALIDATION_FAILED', 'Field keputusan MPZIS tidak diizinkan.', { status: 422, field_errors: fieldErrors });
  if (action !== 'approve' && action !== 'return') throw new P0Error('FIELD_INVALID', 'Aksi MPZIS tidak valid.', { status: 422, field_errors: { action: 'ENUM' } });
  const note = typeof body.note === 'string' ? body.note.trim() : ''; if (action === 'return' && !note) throw new P0Error('VALIDATION_FAILED', 'Catatan pengembalian wajib diisi.', { status: 422, field_errors: { note: 'REQUIRED' } });
  const key = commandKey(meta); expectedMeta(meta, { hash: true }); const db = dbOf(context) || await getDb(); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const applicationId = await applicationFor(db, caseId);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'mpzis', artifact_id: artifactId, request: { action, step, note, recovery } }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    const expectedStatus = STEP_INDEX.has(step) && STEP_INDEX.get(step) > 0 ? STEP_STATUS[MPZIS_STEPS[STEP_INDEX.get(step) - 1]] : 'submitted';
    if (artifact.status !== expectedStatus || caseRow.status !== 'Persetujuan MPZIS') throw new P0Error('MPZIS_STEP_ORDER', 'Langkah MPZIS harus dilakukan secara berurutan.', { status: 409, details: { expected_status: expectedStatus, actual_status: artifact.status } });
    const priorRows = await txDb.all("SELECT actor_id,approval_step FROM artifact_approvals WHERE artifact_type='mpzis' AND artifact_id=$1 AND artifact_revision=$2 AND action='approve' ORDER BY id FOR UPDATE", [artifact.id, artifact.revision]);
    const priorIds = priorRows.map((row) => row.actor_id); const creatorId = artifact.created_by_id; const submitterId = artifact.submitted_by_id;
    if (!submitterId) { const submitted = await txDb.get("SELECT actor_id FROM artifact_approvals WHERE artifact_type='mpzis' AND artifact_id=$1 AND artifact_revision=$2 AND action='submit' ORDER BY id LIMIT 1", [artifact.id, artifact.revision]); if (submitted?.actor_id !== undefined) meta.submitter_id = submitted.actor_id; }
    const actualSubmitter = submitterId ?? meta.submitter_id;
    if (recovery) {
      assertAllowed(ACTIONS.ADMIN_RECOVERY, txActor, { artifact_type: 'mpzis', artifact_id: artifact.id, step, override_reason: body.override_reason, expected_revision: meta.expected_revision, expected_snapshot_hash: meta.expected_snapshot_hash, creator_id: creatorId, submitter_id: actualSubmitter, prior_actor_ids: priorIds });
    } else {
      assertAllowed(ACTIONS.MPZIS_APPROVE, txActor, { step, creator_id: creatorId, submitter_id: actualSubmitter, used_actor_ids: priorIds });
    }
    const nextStatus = action === 'return' ? 'returned' : STEP_STATUS[step];
    const update = action === 'approve' && step === 'approved'
      ? await txDb.query("UPDATE mpzis SET status=$1, approved_at=CURRENT_TIMESTAMP WHERE id=$2 AND status=$3 RETURNING *", [nextStatus, artifact.id, expectedStatus])
      : await txDb.query("UPDATE mpzis SET status=$1 WHERE id=$2 AND status=$3 RETURNING *", [nextStatus, artifact.id, expectedStatus]);
    const row = update.rows?.[0]; if (!row) throw new P0Error('STALE_ARTIFACT', 'MPZIS berubah sebelum keputusan.', { status: 409 });
    const eventNote = note || (action === 'approve' ? `MPZIS ${step} disetujui.` : 'MPZIS dikembalikan untuk koreksi.');
    const response = { success: true, data: dto(row) };
    return { response, approval: { approval_step: step, action, snapshot_hash: artifact.snapshot_hash, note: eventNote, is_admin_override: recovery, override_reason: recovery ? body.override_reason.trim() : null }, decision: { stage: 'mpzis', action, previous_status: expectedStatus, next_status: nextStatus, snapshot_hash: artifact.snapshot_hash, note: eventNote, evidence_grade: 'p0' }, activity: { action_type: action === 'approve' ? `mpzis_${step}_approved` : 'mpzis_returned', title: action === 'approve' ? `MPZIS ${step} approved` : 'MPZIS returned', description: eventNote, old_status: expectedStatus, new_status: nextStatus }, projection: action === 'approve' && step === 'approved' ? async ({ txDb: projectionDb, caseRow: lockedCase }) => { const result = await projectionDb.query("UPDATE mustahik SET status='Pengajuan Dana (FPD)',approved_amount=$1,mpzis_date=$2,asnaf=$3,fund_source=$4,distribution_purpose=$5,beneficiary_count=$6,workflow_version=workflow_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$7 AND workflow_version=$8 RETURNING *", [row.total_amount, row.mpzis_date, row.asnaf, row.fund_source, row.purpose, row.beneficiary_count, caseId, lockedCase.workflow_version]); if (!result.rows?.[0]) throw new P0Error('STALE_STATE', 'Case workflow version changed before MPZIS projection.', { status: 409 }); return result.rows[0]; } : null };
  });
}

export { MPZIS_STEPS };
