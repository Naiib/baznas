import crypto from 'node:crypto';
import { withTransaction } from '../db.js';
import { P0Error } from './errors.js';
import { canonicalize } from './canonical-snapshot.js';

const TX_MARKER = '_isInTransaction';

function isDb(value) {
  return Boolean(value && (value[TX_MARKER] || value.isPg || typeof value.query === 'function'));
}

function dbFrom(context, meta) {
  return context?.txDb || context?.db || context?.dbOverride || meta?.txDb || meta?.db || null;
}

function splitDbArgs(first, second) {
  if (isDb(first)) return { db: first, input: second || {} };
  if (isDb(second)) return { db: second, input: first || {} };
  return { db: first, input: second || {} };
}

async function get(db, text, params = []) {
  if (typeof db.get === 'function') return db.get(text, params);
  const result = await db.query(text, params);
  return result.rows?.[0] || null;
}

async function all(db, text, params = []) {
  if (typeof db.all === 'function') return db.all(text, params);
  const result = await db.query(text, params);
  return result.rows || [];
}

async function run(db, text, params = []) {
  if (typeof db.run === 'function') return db.run(text, params);
  const result = await db.query(text, params);
  return { rowCount: result.rowCount, rows: result.rows || [] };
}

function commandError(code, message, details) {
  return new P0Error(code, message, { status: 409, details });
}

function actorOf(context = {}, meta = {}) {
  const actor = context.actor || meta.actor || context;
  return {
    id: actor.id ?? actor.actor_id ?? null,
    name: actor.name ?? actor.actor_name,
    role: actor.role ?? actor.actor_role,
    level: actor.level ?? actor.actor_level,
    division: actor.division ?? actor.actor_division,
  };
}

function actorParams(actor) {
  for (const key of ['name', 'role', 'level', 'division']) {
    if (actor[key] === undefined || actor[key] === null || String(actor[key]).trim() === '') {
      throw new P0Error('ACTOR_REQUIRED', `Actor ${key} is required.`);
    }
  }
  return [actor.id, actor.name, actor.role, actor.level, actor.division];
}

function idOf(context = {}) {
  return context.mustahik_id ?? context.mustahikId ?? context.case_id ?? context.caseId;
}

function rowCount(result) {
  return Number(result?.rowCount ?? result?.changes ?? result?.rows?.length ?? 0);
}

/** Lock the case row before any command reads/writes. */
export async function lockCase(first, second, third = {}) {
  const { db, input } = splitDbArgs(first, second);
  const mustahikId = isDb(first)
    ? (typeof second === 'object' ? second.mustahik_id ?? second.mustahikId ?? second.id : second)
    : input.mustahik_id ?? input.mustahikId ?? input.id;
  const expected = isDb(first) ? (typeof second === 'object' ? second.expected || second : third || {}) : input.expected || third || {};
  if (!db || mustahikId === undefined || mustahikId === null) throw new P0Error('CASE_REQUIRED', 'Mustahik id is required.');
  const row = await get(db, `
    SELECT id, status, workflow_mode, workflow_version, archived_at, archived_by_id, archive_reason
    FROM mustahik WHERE id=$1 FOR UPDATE
  `, [mustahikId]);
  if (!row) throw commandError('CASE_NOT_FOUND', `Mustahik ${mustahikId} was not found.`);
  if (!expected?._skipExpectedState) assertExpectedState(row, expected);
  return row;
}

/** Verify optimistic state guards after the row has been locked. */
export function assertExpectedState(row, expected = {}) {
  rejectLegacyGuard(expected, ['expectedStatus', 'status', 'expected_workflow_version', 'expectedWorkflowVersion', 'workflow_version']);
  validateGuardValue('expected_status', expected.expected_status, Object.prototype.hasOwnProperty.call(expected, 'expected_status'));
  validateGuardValue('expected_version', expected.expected_version, Object.prototype.hasOwnProperty.call(expected, 'expected_version'));
  const expectedStatus = expected.expected_status;
  const expectedVersion = expected.expected_version;
  if (expectedStatus !== undefined && expectedStatus !== null && row.status !== expectedStatus) {
    throw commandError('STALE_STATE', 'Case status is stale.', { expected_status: expectedStatus, actual_status: row.status });
  }
  if (expectedVersion !== undefined && expectedVersion !== null && Number(row.workflow_version) !== Number(expectedVersion)) {
    throw commandError('STALE_STATE', 'Case workflow version is stale.', { expected_workflow_version: expectedVersion, actual_workflow_version: row.workflow_version });
  }
  return row;
}

async function activeArtifact(db, table, mustahikId, options = {}) {
  const id = options.id ?? options.artifact_id;
  const applicationId = Object.prototype.hasOwnProperty.call(options, 'application_id') && options.application_id !== undefined ? options.application_id : null;
  const lock = options.lock !== false ? ' FOR UPDATE' : '';
  const where = ['mustahik_id=$1', "source='p0'", "status <> 'superseded'", '(application_id=$2 OR (application_id IS NULL AND $2 IS NULL))'];
  const params = [mustahikId, applicationId];
  if (id !== undefined && id !== null) { where.push('id=$3'); params.push(id); }
  const row = await get(db, `SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY revision DESC, id DESC LIMIT 1${lock}`, params);
  if (!row && id !== undefined && id !== null) throw commandError('ARTIFACT_NOT_FOUND', `${table} artifact was not found.`);
  return row;
}

export function getActiveAssessment(first, second, third = {}) {
  const { db, input } = splitDbArgs(first, second);
  const id = isDb(first) ? (typeof second === 'object' ? second.mustahik_id ?? second.mustahikId : second) : input.mustahik_id ?? input.mustahikId;
  const options = isDb(first) ? (typeof second === 'object' ? second : third) : input;
  return activeArtifact(db, 'assessments', id, options);
}

export function getActiveMpzis(first, second, third = {}) {
  const { db, input } = splitDbArgs(first, second);
  const id = isDb(first) ? (typeof second === 'object' ? second.mustahik_id ?? second.mustahikId : second) : input.mustahik_id ?? input.mustahikId;
  const options = isDb(first) ? (typeof second === 'object' ? second : third) : input;
  return activeArtifact(db, 'mpzis', id, options);
}

export function getActivePpd(first, second, third = {}) {
  const { db, input } = splitDbArgs(first, second);
  const id = isDb(first) ? (typeof second === 'object' ? second.mustahik_id ?? second.mustahikId : second) : input.mustahik_id ?? input.mustahikId;
  const options = isDb(first) ? (typeof second === 'object' ? second : third) : input;
  return activeArtifact(db, 'ppd', id, options);
}

/**
 * Acquire the deterministic full P0 evidence lock set. Commands that need to
 * validate payment/completion provenance opt in; ordinary artifact commands
 * retain the smaller lock set for compatibility.
 */
export async function lockFullP0Chain(db, mustahikId, { application_id = null, ppd_id = null } = {}) {
  if (!db || mustahikId === undefined || mustahikId === null) throw new P0Error('CASE_REQUIRED', 'Mustahik id is required.');
  const assessment = await get(db, `SELECT * FROM assessments WHERE mustahik_id=$1 AND source='p0' AND status <> 'superseded' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision DESC,id DESC LIMIT 1 FOR UPDATE`, [mustahikId, application_id]);
  const mpzis = await get(db, `SELECT * FROM mpzis WHERE mustahik_id=$1 AND source='p0' AND status <> 'superseded' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision DESC,id DESC LIMIT 1 FOR UPDATE`, [mustahikId, application_id]);
  const ppd = await get(db, `SELECT * FROM ppd WHERE mustahik_id=$1 AND source='p0' AND status <> 'superseded' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ${ppd_id === null ? '' : 'AND id=$3'} ORDER BY revision DESC,id DESC LIMIT 1 FOR UPDATE`, ppd_id === null ? [mustahikId, application_id] : [mustahikId, application_id, ppd_id]);
  if (!ppd) throw commandError('ARTIFACT_NOT_FOUND', 'PPD artifact was not found.');
  const finance = await all(db, `SELECT * FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 AND action IN ('finance_check','finance_approve') ORDER BY id FOR UPDATE`, [ppd.id, ppd.revision]);
  const payment = await get(db, 'SELECT * FROM ppd_payments WHERE ppd_id=$1 FOR UPDATE', [ppd.id]);
  const confirmation = await get(db, 'SELECT * FROM recipient_confirmations WHERE ppd_id=$1 FOR UPDATE', [ppd.id]);
  const files = [];
  if (payment?.proof_file_id !== null && payment?.proof_file_id !== undefined) files.push(await get(db, 'SELECT * FROM artifact_files WHERE id=$1 FOR UPDATE', [payment.proof_file_id]));
  if (confirmation?.evidence_file_id !== null && confirmation?.evidence_file_id !== undefined) files.push(await get(db, 'SELECT * FROM artifact_files WHERE id=$1 FOR UPDATE', [confirmation.evidence_file_id]));
  return { assessment, mpzis, ppd, finance, payment, confirmation, files: files.filter(Boolean) };
}

export function assertExpectedArtifact(artifact, expected = {}) {
  if (!artifact) throw commandError('STALE_ARTIFACT', 'Active artifact is missing.');
  rejectLegacyGuard(expected, ['expected_artifact_revision', 'artifact_revision', 'expected_artifact_hash', 'expected_hash', 'snapshot_hash']);
  validateGuardValue('expected_revision', expected.expected_revision, Object.prototype.hasOwnProperty.call(expected, 'expected_revision'));
  validateGuardValue('expected_snapshot_hash', expected.expected_snapshot_hash, Object.prototype.hasOwnProperty.call(expected, 'expected_snapshot_hash'));
  const revision = expected.expected_revision;
  const hash = expected.expected_snapshot_hash;
  if (revision !== undefined && Number(artifact.revision) !== Number(revision)) {
    throw commandError('STALE_ARTIFACT', 'Artifact revision is stale.', { expected_revision: revision, actual_revision: artifact.revision });
  }
  if (hash !== undefined && hash !== null && String(artifact.snapshot_hash).trim() !== String(hash).trim()) {
    throw commandError('STALE_ARTIFACT', 'Artifact hash is stale.', { expected_hash: hash, actual_hash: artifact.snapshot_hash });
  }
  return artifact;
}

function rejectLegacyGuard(expected, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(expected, alias)) {
      throw commandError('EXPECTED_STATE_REQUIRED', `Use canonical guard field instead of ${alias}.`);
    }
  }
}

function validateGuardValue(name, value, present) {
  if (!present) return;
  if (value === undefined || value === null) throw new P0Error('EXPECTED_GUARD_INVALID', `${name} must be provided.`, { status: 422 });
  if (name === 'expected_status' && (typeof value !== 'string' || value.trim() === '')) {
    throw new P0Error('EXPECTED_GUARD_INVALID', `${name} must be a non-empty status.`, { status: 422 });
  }
  if (name === 'expected_version' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new P0Error('EXPECTED_GUARD_INVALID', `${name} must be a non-negative integer.`, { status: 422 });
  }
  if (name === 'expected_revision' && (!Number.isSafeInteger(value) || value < 1)) {
    throw new P0Error('EXPECTED_GUARD_INVALID', `${name} must be a positive integer.`, { status: 422 });
  }
  if (name === 'expected_snapshot_hash' && (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value.trim()))) {
    throw new P0Error('EXPECTED_GUARD_INVALID', `${name} must be a SHA-256 hash.`, { status: 422 });
  }
}

function eventInput(first, second) {
  const { db, input } = splitDbArgs(first, second);
  return { db, input };
}

export async function insertArtifactApproval(first, second) {
  const { db, input } = eventInput(first, second);
  assertSafeEventText(input.note, 'note');
  assertSafeEventText(input.override_reason, 'override_reason');
  const actor = input.actor || actorOf(input, input);
  const [actorId, actorName, actorRole, actorLevel, actorDivision] = actorParams(actor);
  try {
    const result = await run(db, `
      INSERT INTO artifact_approvals
      (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,note,correlation_id,actor_id,actor_name,actor_role,actor_level,actor_division,is_admin_override,override_reason,completion_hash,completion_snapshot_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [input.mustahik_id ?? input.mustahikId, input.artifact_type, input.artifact_id, input.artifact_revision, input.approval_step ?? null, input.action, input.snapshot_hash, input.note ?? null, input.correlation_id ?? null, actorId, actorName, actorRole, actorLevel, actorDivision, Boolean(input.is_admin_override), input.override_reason ?? null, input.completion_hash ?? null, input.completion_snapshot_json ?? null]);
    return result.rows?.[0] || result;
  } catch (error) {
    if (/unique|duplicate/i.test(String(error?.message))) throw commandError('DUPLICATE_APPROVAL', 'Artifact approval already exists.');
    throw error;
  }
}

export async function insertCompatibilityDecision(first, second) {
  const { db, input } = eventInput(first, second);
  assertSafeEventText(input.note, 'note');
  const actor = input.actor || actorOf(input, input);
  const [actorId, actorName, actorRole, actorLevel, actorDivision] = actorParams(actor);
  const result = await run(db, `
    INSERT INTO approval_decisions
      (mustahik_id,stage,action,previous_status,next_status,note,approved_amount,actor_id,actor_name,actor_role,actor_level,actor_division,prepared_by_id,correlation_id,artifact_type,artifact_id,artifact_revision,snapshot_hash,evidence_grade)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *
  `, [input.mustahik_id ?? input.mustahikId, input.stage ?? null, input.action, input.previous_status ?? null, input.next_status ?? null, input.note ?? null, input.approved_amount ?? null, actorId, actorName, actorRole, actorLevel, actorDivision, input.prepared_by_id ?? null, input.correlation_id ?? null, input.artifact_type ?? null, input.artifact_id ?? null, input.artifact_revision ?? null, input.snapshot_hash ?? null, input.evidence_grade ?? 'p0']);
  return result.rows?.[0] || result;
}

export async function insertActivity(first, second) {
  const { db, input } = eventInput(first, second);
  assertSafeEventText(input.title, 'title');
  assertSafeEventText(input.description, 'description');
  const actor = input.actor || actorOf(input, input);
  const [actorId, actorName, actorRole, actorLevel, actorDivision] = actorParams(actor);
  const result = await run(db, `
    INSERT INTO activity_logs
      (mustahik_id,actor_id,actor_name,actor_role,actor_level,actor_division,action_type,title,description,old_status,new_status,correlation_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
  `, [input.mustahik_id ?? input.mustahikId, actorId, actorName, actorRole, actorLevel, actorDivision, input.action_type, input.title ?? input.action_type, input.description ?? null, input.old_status ?? null, input.new_status ?? null, input.correlation_id ?? null]);
  return result.rows?.[0] || result;
}

export async function reserveIdempotencyKey(first, second, third, fourth) {
  let db; let input;
  if (isDb(first)) { db = first; input = typeof second === 'object' ? second : { actor_id: second, idempotency_key: third, request_hash: fourth }; }
  else { ({ db, input } = eventInput(first, second)); }
  const actorId = input.actor_id ?? input.actorId ?? input.actor?.id;
  const key = input.idempotency_key ?? input.idempotencyKey;
  const hash = input.request_hash ?? input.requestHash;
  if (actorId === undefined || !key || !hash) throw new P0Error('IDEMPOTENCY_REQUIRED', 'Actor, idempotency key, and request hash are required.');
  const inserted = await get(db, `
    INSERT INTO p0_idempotency_keys(actor_id,idempotency_key,request_hash,response_json)
    VALUES ($1,$2,$3,$4) ON CONFLICT (actor_id,idempotency_key) DO NOTHING RETURNING *
  `, [actorId, key, hash, JSON.stringify(null)]);
  // pg-mem versions have returned the conflicting row for a DO NOTHING
  // statement; a null response is the only unambiguous reservation marker.
  if (inserted && (inserted.response_json === null || inserted.response_json === undefined)) {
    return { reserved: true, replayed: false, row: inserted };
  }
  if (inserted && String(inserted.request_hash) === String(hash) && inserted.response_json !== null && inserted.response_json !== undefined) {
    return { reserved: false, replayed: true, row: inserted, response: parseJson(inserted.response_json) };
  }
  const existing = await get(db, 'SELECT * FROM p0_idempotency_keys WHERE actor_id=$1 AND idempotency_key=$2', [actorId, key]);
  if (!existing) throw commandError('IDEMPOTENCY_RACE', 'Idempotency reservation was not available.');
  if (String(existing.request_hash) !== String(hash)) throw commandError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key was used with a different request payload.');
  if (existing.response_json === null || existing.response_json === undefined) throw commandError('IDEMPOTENCY_IN_PROGRESS', 'Idempotency request is still in progress.');
  return { reserved: false, replayed: true, row: existing, response: parseJson(existing.response_json) };
}

export async function completeIdempotencyKey(first, second, third, fourth) {
  let db; let input;
  if (isDb(first)) { db = first; input = typeof second === 'object' ? second : { actor_id: second, idempotency_key: third, response: fourth }; }
  else { ({ db, input } = eventInput(first, second)); }
  const actorId = input.actor_id ?? input.actorId ?? input.actor?.id;
  const key = input.idempotency_key ?? input.idempotencyKey;
  const response = input.response ?? input.result ?? input.payload;
  const result = await run(db, 'UPDATE p0_idempotency_keys SET response_json=$3 WHERE actor_id=$1 AND idempotency_key=$2', [actorId, key, JSON.stringify(response)]);
  if (rowCount(result) !== 1) throw commandError('IDEMPOTENCY_NOT_RESERVED', 'Idempotency key was not reserved in this transaction.');
  return response;
}

function parseJson(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  return value;
}

async function updateProjection(db, mustahikId, expectedVersion, projection) {
  if (!projection || typeof projection !== 'object') return null;
  const sets = []; const params = [];
  if (Object.prototype.hasOwnProperty.call(projection, 'status')) { params.push(projection.status); sets.push(`status=$${params.length}`); }
  if (Object.prototype.hasOwnProperty.call(projection, 'workflow_mode')) { params.push(projection.workflow_mode); sets.push(`workflow_mode=$${params.length}`); }
  if (Object.prototype.hasOwnProperty.call(projection, 'archived_at')) { params.push(projection.archived_at); sets.push(`archived_at=$${params.length}`); }
  if (!sets.length) return null;
  params.push(mustahikId, expectedVersion);
  const result = await run(db, `UPDATE mustahik SET ${sets.join(', ')}, workflow_version=workflow_version+1, updated_at=CURRENT_TIMESTAMP WHERE id=$${params.length - 1} AND workflow_version=$${params.length} RETURNING *`, params);
  if (rowCount(result) !== 1) throw commandError('STALE_STATE', 'Case workflow version changed before projection.');
  return result.rows?.[0] || null;
}

/** Execute a P0 command atomically, including provenance and idempotency. */
export async function withP0Command(context = {}, meta = {}, handler) {
  if (typeof handler !== 'function') throw new TypeError('withP0Command requires a handler.');
  rejectContextGuards(context);
  validateMetaGuards(meta);
  const outerDb = dbFrom(context, meta);
  return withTransaction(outerDb, async (txDb) => {
    const mustahikId = idOf(context) ?? idOf(meta);
    const expected = { ...context, ...meta };
    // Lock and identify the case first. Completed idempotent replays must be
    // resolved before stale command guards because the original command may
    // have advanced the case version.
    const caseRow = await lockCase(txDb, mustahikId, { ...expected, _skipExpectedState: true });
    const actor = actorOf(context, meta);
    const key = meta.idempotency_key ?? meta.idempotencyKey;
    if (key) {
      if (actor.id === undefined || actor.id === null) throw new P0Error('ACTOR_REQUIRED', 'Authenticated actor id is required.');
      const requestHash = requestHashForMeta(meta, {
        mustahik_id: mustahikId,
        artifact_type: meta.artifact_type ?? meta.artifactType ?? meta.approval?.artifact_type ?? meta.decision?.artifact_type,
        artifact_id: meta.artifact_id ?? meta.approval?.artifact_id ?? meta.decision?.artifact_id,
        application_id: meta.application_id,
      });
      const suppliedRequestHash = meta.request_hash ?? meta.requestHash;
      if (suppliedRequestHash !== undefined && String(suppliedRequestHash) !== requestHash) {
        throw commandError('IDEMPOTENCY_KEY_REUSED', 'Supplied request hash does not match the canonical command request.');
      }
      const reservation = await reserveIdempotencyKey(txDb, { actor_id: actor.id, idempotency_key: key, request_hash: requestHash });
      if (reservation.replayed) return { ...reservation.response, replayed: true };
    }
    assertExpectedState(caseRow, expected);
    let artifact = null;
    const hasDeclaredArtifactAction = Boolean(meta.approval || meta.decision || meta.artifact_type || meta.artifactType);
    const artifactType = meta.artifact_type ?? meta.artifactType ?? meta.approval?.artifact_type ?? meta.decision?.artifact_type;
    if (hasDeclaredArtifactAction && !artifactType) {
      throw commandError('ARTIFACT_TYPE_REQUIRED', 'Artifact type is required for artifact actions.');
    }
    if (artifactType) {
      const loader = artifactType === 'assessment' ? getActiveAssessment : artifactType === 'mpzis' ? getActiveMpzis : artifactType === 'ppd' ? getActivePpd : null;
      if (!loader) throw commandError('ARTIFACT_TYPE_REQUIRED', `Unsupported artifact type: ${artifactType}.`);
      artifact = await loader(txDb, mustahikId, { application_id: meta.application_id, id: meta.artifact_id, lock: true });
      assertExpectedArtifact(artifact, meta);
    }
    const chain = meta.lock_full_chain || meta.lockFullChain
      ? await lockFullP0Chain(txDb, mustahikId, { application_id: meta.application_id ?? null, ppd_id: meta.ppd_id ?? meta.ppdId ?? (artifactType === 'ppd' ? artifact?.id : null) })
      : null;
    const commandContext = { ...context, ...meta, txDb, db: txDb, caseRow, artifact, actor, chain, mustahik_id: mustahikId };
    const output = (await handler(commandContext)) ?? {};
    const response = output.response ?? output.result ?? output;
    let approval = output.approval ?? meta.approval;
    let decision = output.decision ?? meta.decision;
    const activity = output.activity ?? meta.activity;
    if ((approval || decision) && !artifact) {
      throw commandError('ARTIFACT_TYPE_REQUIRED', 'Artifact type is required for artifact actions.');
    }
    if (artifact) {
      approval = bindArtifactEvent(approval, artifact, artifactType);
      decision = bindArtifactEvent(decision, artifact, artifactType);
    }
    if (approval) await insertArtifactApproval(txDb, { ...approval, mustahik_id: mustahikId, actor, correlation_id: approval.correlation_id ?? meta.correlation_id });
    if (decision) await insertCompatibilityDecision(txDb, { ...decision, mustahik_id: mustahikId, actor, correlation_id: decision.correlation_id ?? meta.correlation_id });
    if (activity) await insertActivity(txDb, { ...activity, mustahik_id: mustahikId, actor, correlation_id: activity.correlation_id ?? meta.correlation_id });
    const projection = output.projection ?? meta.projection;
    const projected = typeof projection === 'function' ? await projection({ txDb, caseRow, context: commandContext, result: response }) : await updateProjection(txDb, mustahikId, caseRow.workflow_version, projection);
    const finalResponse = output.response !== undefined || output.result !== undefined ? response : (projected ? { ...response, case: projected } : response);
    if (key) await completeIdempotencyKey(txDb, { actor_id: actor.id, idempotency_key: key, response: finalResponse });
    return finalResponse;
  });
}

function rejectContextGuards(context) {
  const guardKeys = [
    'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash',
    'expectedStatus', 'status', 'expected_workflow_version', 'expectedWorkflowVersion', 'workflow_version',
    'expected_artifact_revision', 'artifact_revision', 'expected_artifact_hash', 'expected_hash', 'snapshot_hash',
  ];
  for (const key of guardKeys) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      throw commandError('EXPECTED_GUARD_MISPLACED', `${key} belongs in P0CommandMeta, not command context.`);
    }
  }
}

function validateMetaGuards(meta) {
  rejectLegacyGuard(meta, ['expectedStatus', 'status', 'expected_workflow_version', 'expectedWorkflowVersion', 'workflow_version', 'expected_artifact_revision', 'artifact_revision', 'expected_artifact_hash', 'expected_hash', 'snapshot_hash']);
  validateGuardValue('expected_status', meta.expected_status, Object.prototype.hasOwnProperty.call(meta, 'expected_status'));
  validateGuardValue('expected_version', meta.expected_version, Object.prototype.hasOwnProperty.call(meta, 'expected_version'));
  validateGuardValue('expected_revision', meta.expected_revision, Object.prototype.hasOwnProperty.call(meta, 'expected_revision'));
  validateGuardValue('expected_snapshot_hash', meta.expected_snapshot_hash, Object.prototype.hasOwnProperty.call(meta, 'expected_snapshot_hash'));
}

function requestHashForMeta(meta, identity = {}) {
  const request = commandRequest(meta);
  const scopedRequest = {
    request,
    _p0_identity: {
      mustahik_id: identity.mustahik_id ?? null,
      artifact_type: identity.artifact_type ?? null,
      artifact_id: identity.artifact_id ?? null,
      application_id: identity.application_id ?? null,
    },
  };
  return crypto.createHash('sha256').update(Buffer.from(canonicalize(scopedRequest), 'utf8')).digest('hex');
}

function bindArtifactEvent(event, artifact, artifactType) {
  if (!event) return event;
  const expected = {
    artifact_type: artifactType,
    artifact_id: artifact.id,
    artifact_revision: artifact.revision,
    snapshot_hash: artifact.snapshot_hash,
  };
  for (const key of Object.keys(expected)) {
    if (event[key] !== undefined && String(event[key]).trim() !== String(expected[key]).trim()) {
      throw commandError('STALE_ARTIFACT', `Artifact ${key} does not match the locked artifact.`, { expected: expected[key], actual: event[key] });
    }
  }
  return { ...event, ...expected };
}

function commandRequest(meta = {}) {
  let explicit;
  if (Object.prototype.hasOwnProperty.call(meta, 'request')) explicit = meta.request;
  else if (Object.prototype.hasOwnProperty.call(meta, 'payload')) explicit = meta.payload;
  else if (Object.prototype.hasOwnProperty.call(meta, 'input')) explicit = meta.input;
  if (explicit !== undefined || Object.prototype.hasOwnProperty.call(meta, 'request') || Object.prototype.hasOwnProperty.call(meta, 'payload') || Object.prototype.hasOwnProperty.call(meta, 'input')) {
    if (!hasCommandContent(explicit)) throw new P0Error('IDEMPOTENCY_REQUEST_REQUIRED', 'An explicit command request is required for idempotency.', { status: 409 });
    return explicit;
  }
  const controlKeys = new Set([
    'db', 'dbOverride', 'txDb', 'actor', 'actor_id', 'actorId', 'mustahik_id', 'mustahikId',
    'case_id', 'caseId', 'idempotency_key', 'idempotencyKey', 'request_hash', 'requestHash',
    'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash',
    'artifact_type', 'artifactType', 'artifact_id', 'application_id', 'approval', 'decision',
    'activity', 'projection', 'correlation_id', 'correlationId',
  ]);
  const request = Object.fromEntries(Object.entries(meta).filter(([key]) => !controlKeys.has(key)));
  if (!hasCommandContent(request)) {
    throw new P0Error('IDEMPOTENCY_REQUEST_REQUIRED', 'An explicit command request is required for idempotency.', { status: 409 });
  }
  return request;
}

function hasCommandContent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0 && value.some(hasCommandContent);
  if (typeof value === 'object') return Object.keys(value).length > 0 && Object.values(value).some(hasCommandContent);
  return false;
}

/** Return a safe, immutable event timeline without live joins or sensitive data. */
export async function listArtifactHistory(first, second, third = {}) {
  const { db, input } = splitDbArgs(first, second);
  const mustahikId = isDb(first) ? (typeof second === 'object' ? second.mustahik_id ?? second.mustahikId : second) : input.mustahik_id ?? input.mustahikId;
  const options = isDb(first) ? (typeof second === 'object' ? second : third) : input;
  const [approvals, decisions, activities] = await Promise.all([
    all(db, 'SELECT id,artifact_type,artifact_id,artifact_revision,action,approval_step,snapshot_hash,note,actor_id,actor_name,actor_role,actor_level,actor_division,created_at FROM artifact_approvals WHERE mustahik_id=$1', [mustahikId]),
    all(db, 'SELECT id,artifact_type,artifact_id,artifact_revision,action,stage,next_status,note,snapshot_hash,actor_id,actor_name,actor_role,actor_level,actor_division,created_at FROM approval_decisions WHERE mustahik_id=$1', [mustahikId]),
    all(db, 'SELECT id,action_type,title,description,old_status,new_status,actor_id,actor_name,actor_role,actor_level,actor_division,created_at FROM activity_logs WHERE mustahik_id=$1', [mustahikId]),
  ]);
  const events = [
    ...approvals.map((row) => ({ id: row.id, type: 'approval', title: safeHistoryText(row.action), description: safeHistoryText(row.note), actor: actorSnapshot(row), timestamp: row.created_at, artifact: artifactSnapshot(row), revision: row.artifact_revision, hash_prefix: prefix(row.snapshot_hash), _table: 'artifact_approvals' })),
    ...decisions.map((row) => ({ id: row.id, type: 'decision', title: safeHistoryText(row.action), description: safeHistoryText(row.note), actor: actorSnapshot(row), timestamp: row.created_at, artifact: artifactSnapshot(row), revision: row.artifact_revision, hash_prefix: prefix(row.snapshot_hash), _table: 'approval_decisions' })),
    ...activities.map((row) => ({ id: row.id, type: 'activity', title: safeHistoryText(row.title), description: safeHistoryText(row.description), actor: actorSnapshot(row), timestamp: row.created_at, artifact: null, revision: null, hash_prefix: null, _table: 'activity_logs' })),
  ];
  events.sort((a, b) => timestampEpoch(a.timestamp) - timestampEpoch(b.timestamp) || Number(a.id) - Number(b.id) || a._table.localeCompare(b._table));
  return options.include_internal ? events : events.map(({ _table, ...event }) => event);
}

function actorSnapshot(row) {
  return { id: row.actor_id ?? null, name: row.actor_name, role: row.actor_role, level: row.actor_level, division: row.actor_division };
}

function artifactSnapshot(row) {
  if (row.artifact_type === null || row.artifact_type === undefined) return null;
  return { type: row.artifact_type, id: row.artifact_id };
}

function prefix(hash) { return hash ? String(hash).trim().slice(0, 12) : null; }

function timestampEpoch(value) {
  const epoch = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(epoch) ? epoch : 0;
}

function safeHistoryText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (containsSensitiveText(text)) return null;
  return text;
}

function assertSafeEventText(value, field) {
  if (value !== null && value !== undefined && containsSensitiveText(String(value))) {
    throw new P0Error('SENSITIVE_EVENT_TEXT', `${field} contains sensitive data and cannot be persisted.`, { status: 422 });
  }
}

function containsSensitiveText(text) {
  const digits = text.replace(/\D/g, '');
  const hasIdentityLabel = /\b(?:nik|ktp)\b/i.test(text);
  const hasAccountLabel = /\b(?:rekening|bank|account)\b/i.test(text);
  const hasProofLabel = /\b(?:proof|bukti|base64)\b/i.test(text) || /\bdata\s*:/i.test(text);
  const hasBase64Payload = /(?:[A-Za-z0-9+/]{24,}={0,2})/.test(text);
  return (hasIdentityLabel && digits.length >= 8)
    || (hasAccountLabel && digits.length >= 8)
    || (hasProofLabel && (hasBase64Payload || /\b(?:bytes?|payload|content)\b/i.test(text)))
    || /^(?:[A-Za-z0-9+/]{24,}={0,2})$/.test(text.trim())
    || /\b\d{12,24}\b/.test(text);
}

export { requestHashForMeta };
