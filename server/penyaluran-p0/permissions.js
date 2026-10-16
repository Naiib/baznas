import { P0Error } from './errors.js';
import { ROLE } from '../access-policy.js';

export const ACTIONS = Object.freeze({
  ASSESSMENT_CREATE: 'assessment_create',
  ASSESSMENT_UPDATE: 'assessment_update',
  ASSESSMENT_SUBMIT: 'assessment_submit',
  ASSESSMENT_REVIEW: 'assessment_review',
  MPZIS_CREATE: 'mpzis_create',
  MPZIS_UPDATE: 'mpzis_update',
  MPZIS_SUBMIT: 'mpzis_submit',
  MPZIS_APPROVE: 'mpzis_approve',
  PPD_CREATE: 'ppd_create',
  PPD_UPDATE: 'ppd_update',
  PPD_SUBMIT: 'ppd_submit',
  FINANCE_CHECK: 'finance_check',
  FINANCE_APPROVE: 'finance_approve',
  PAYMENT_RECORD: 'payment_record',
  PAYMENT_VERIFY: 'payment_verify',
  RECIPIENT_CONFIRM: 'recipient_confirm',
  COMPLETE: 'complete',
  INTAKE_CREATE: 'intake_create',
  QUEUE_ADVANCE: 'queue_advance',
  CASE_READ: 'case_read',
  CROSS_CASE_AUDIT: 'cross_case_audit',
  ADMIN_RECOVERY: 'admin_recovery',
});

const ACTION_LIST = Object.freeze(Object.values(ACTIONS));
const MPZIS_STEPS = Object.freeze(['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved']);
const RECOVERY_STEPS = Object.freeze({
  assessment: new Set(['create', 'update', 'submit', 'review']),
  mpzis: new Set(['create', 'update', 'submit', ...MPZIS_STEPS]),
  ppd: new Set(['create', 'update', 'submit', 'finance_check', 'finance_approve', 'payment_recorded', 'payment_verified', 'recipient_confirmed', 'complete']),
  payment: new Set(['payment_recorded', 'payment_verified']),
  recipient_confirmation: new Set(['recipient_confirmed']),
  completion: new Set(['complete']),
});

function norm(value) { return String(value ?? '').trim().toLowerCase(); }
function roleOf(actor) { return norm(actor?.role); }
function divisionOf(actor) { return norm(actor?.division); }
function levelOf(actor) { return norm(actor?.level); }
function isAdmin(actor) { return roleOf(actor) === ROLE.ADMIN || levelOf(actor) === 'admin'; }
function isPenyaluranDivision(division) { const d = norm(division); return d.includes('penyaluran') || d.includes('pendistribusian'); }
function isPenyaluran(actor) { return roleOf(actor) === ROLE.PENYALURAN && isPenyaluranDivision(divisionOf(actor)); }
function isSurveyor(actor) { return roleOf(actor) === ROLE.SURVEYOR && (divisionOf(actor).includes('survey') || !divisionOf(actor)); }
function isKeuangan(actor) { return roleOf(actor) === ROLE.KEUANGAN && divisionOf(actor).includes('keuangan'); }
function isStaff(actor) { return ['staff', 'officer', 'operator'].includes(levelOf(actor)); }
function isLeader(actor) { return ['leader', 'kepala', 'manager', 'chief'].includes(levelOf(actor)); }
function hasActorId(actor) {
  if (actor?.id === undefined || actor?.id === null) return false;
  return isCanonicalActorId(actor.id);
}
function isCanonicalActorId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  return typeof value === 'string' && value.length > 0 && value === value.trim() && value === value.normalize('NFC') && !/\s/.test(value) && !/^\d+$/.test(value);
}
function actorIdKey(value) { return typeof value === 'number' ? `n:${value}` : `s:${value}`; }
function canonicalActorId(value) {
  return isCanonicalActorId(value) ? actorIdKey(value) : null;
}

function allowed(action, actor) {
  if (isAdmin(actor)) return action === ACTIONS.CROSS_CASE_AUDIT || action === ACTIONS.ADMIN_RECOVERY;
  switch (action) {
    case ACTIONS.ASSESSMENT_CREATE:
    case ACTIONS.ASSESSMENT_UPDATE:
    case ACTIONS.ASSESSMENT_SUBMIT:
      return (isPenyaluran(actor) && isStaff(actor)) || isSurveyor(actor);
    case ACTIONS.ASSESSMENT_REVIEW:
      return isPenyaluran(actor) && (isStaff(actor) || isLeader(actor));
    case ACTIONS.MPZIS_CREATE:
    case ACTIONS.MPZIS_UPDATE:
    case ACTIONS.MPZIS_SUBMIT:
    case ACTIONS.PPD_CREATE:
    case ACTIONS.PPD_UPDATE:
    case ACTIONS.PPD_SUBMIT:
      return isPenyaluran(actor) && isStaff(actor);
    case ACTIONS.MPZIS_APPROVE:
      return isPenyaluran(actor) && (isStaff(actor) || isLeader(actor));
    case ACTIONS.FINANCE_CHECK:
    case ACTIONS.PAYMENT_RECORD:
    case ACTIONS.PAYMENT_VERIFY:
      return isKeuangan(actor) && (isStaff(actor) || isLeader(actor));
    case ACTIONS.FINANCE_APPROVE:
      return isKeuangan(actor) && isLeader(actor);
    case ACTIONS.RECIPIENT_CONFIRM:
      return (isPenyaluran(actor) && isStaff(actor)) || isSurveyor(actor);
    case ACTIONS.COMPLETE:
      return isPenyaluran(actor) && isLeader(actor);
    case ACTIONS.INTAKE_CREATE:
    case ACTIONS.QUEUE_ADVANCE:
      return isPenyaluran(actor) && isStaff(actor);
    case ACTIONS.CASE_READ:
      return isPenyaluran(actor) || isSurveyor(actor) || isKeuangan(actor);
    case ACTIONS.CROSS_CASE_AUDIT:
      return isAdmin(actor);
    case ACTIONS.ADMIN_RECOVERY:
      return isAdmin(actor);
    default:
      return false;
  }
}

export function capabilitiesFor(actor = {}) {
  return Object.freeze(Object.fromEntries(ACTION_LIST.map((action) => [action, allowed(action, actor)])));
}

function deny(code, message, details) { throw new P0Error(code, message, { status: code === 'ADMIN_ROUTINE_FORBIDDEN' ? 403 : undefined, details }); }

/** Enforce server-side role, division, level and separation rules for a command. */
export function assertAllowed(action, actor = {}, context = {}) {
  if (!ACTION_LIST.includes(action)) deny('PERMISSION_DENIED', `Unknown P0 action: ${action}.`);
  if (!hasActorId(actor)) deny('ACTOR_REQUIRED', 'Authenticated actor id is required.');
  if (action === ACTIONS.ADMIN_RECOVERY) {
    if (!isAdmin(actor)) deny('PERMISSION_DENIED', 'Recovery hanya untuk admin.');
    if (!Number.isSafeInteger(context.artifact_id) || context.artifact_id < 1 || !RECOVERY_STEPS[context.artifact_type]?.has(context.step)) deny('RECOVERY_TARGET_REQUIRED', 'Recovery target artifact and step are required.');
    const reason = typeof context.override_reason === 'string' ? context.override_reason.trim() : '';
    if (reason.length < 20 || reason.length > 1000) deny('RECOVERY_REASON_REQUIRED', 'Recovery reason must be 20–1000 characters.');
    if (!Number.isSafeInteger(context.expected_revision) || context.expected_revision < 1) deny('RECOVERY_REVISION_REQUIRED', 'Expected revision is required.');
    if (typeof context.expected_snapshot_hash !== 'string' || !/^[a-f0-9]{64}$/.test(context.expected_snapshot_hash)) deny('RECOVERY_HASH_REQUIRED', 'Expected snapshot hash is required.');
    if (!isCanonicalActorId(context.creator_id) || !isCanonicalActorId(context.submitter_id) || !Array.isArray(context.prior_actor_ids) || !context.prior_actor_ids.every(isCanonicalActorId)) deny('RECOVERY_ACTOR_CONTEXT_REQUIRED', 'Recovery actor segregation context is required.');
    const recoveryIds = [context.creator_id, context.submitter_id, ...context.prior_actor_ids].map(String);
    if (new Set(recoveryIds).size !== recoveryIds.length || recoveryIds.includes(String(actor.id))) deny('ACTOR_SEPARATION', 'Recovery actor must be separate from artifact actors.');
    if (context.separation_bypassed || context.validation_bypassed) deny('RECOVERY_BYPASS_FORBIDDEN', 'Recovery cannot bypass validation or segregation.');
    return true;
  }
  if (isAdmin(actor)) {
    if (action === ACTIONS.CROSS_CASE_AUDIT) return true;
    deny('ADMIN_ROUTINE_FORBIDDEN', 'Admin hanya dapat memakai recovery terpisah.');
  }
  if (!allowed(action, actor)) {
    if ([ACTIONS.FINANCE_CHECK, ACTIONS.FINANCE_APPROVE, ACTIONS.PAYMENT_RECORD, ACTIONS.PAYMENT_VERIFY].includes(action) && !isKeuangan(actor)) deny('DIVISION_REQUIRED', 'Aksi ini hanya untuk divisi Keuangan.');
    if (action === ACTIONS.COMPLETE && !isLeader(actor)) deny('LEVEL_REQUIRED', 'Penyelesaian membutuhkan pimpinan Penyaluran.');
    deny('PERMISSION_DENIED', 'Aktor tidak memiliki kapabilitas P0 ini.');
  }
  const id = actor.id;
  const same = (key) => context[key] !== undefined && context[key] !== null && id !== undefined && String(context[key]) === String(id);
  if (action === ACTIONS.ASSESSMENT_REVIEW && (same('submitter_id') || same('creator_id'))) {
    deny('ACTOR_SEPARATION', 'Reviewer harus berbeda dari submitter dan creator.');
  }
  if (action === ACTIONS.MPZIS_APPROVE) {
    const step = context.step;
    if (!MPZIS_STEPS.includes(step)) deny('FIELD_INVALID', 'Langkah MPZIS tidak valid.');
    const currentKey = canonicalActorId(id);
    const creatorKey = context.creator_id === undefined || context.creator_id === null ? null : canonicalActorId(context.creator_id);
    const submitterKey = context.submitter_id === undefined || context.submitter_id === null ? null : canonicalActorId(context.submitter_id);
    if ((creatorKey && creatorKey === currentKey) || (submitterKey && submitterKey === currentKey)) deny('ACTOR_SEPARATION', 'Aktor MPZIS sudah dipakai pada langkah lain.');
    if (context.creator_id === undefined || context.creator_id === null || context.submitter_id === undefined || context.submitter_id === null) deny('ACTOR_CONTEXT_REQUIRED', 'Creator and submitter IDs are required.');
    if (!creatorKey || !submitterKey) deny('ACTOR_CONTEXT_INVALID', 'Creator and submitter actor IDs are invalid.');
    if (!Array.isArray(context.used_actor_ids)) deny('ACTOR_CONTEXT_REQUIRED', 'Prior MPZIS actors are required.');
    const used = context.used_actor_ids.map(canonicalActorId);
    if (used.some((key) => !key)) deny('ACTOR_CONTEXT_INVALID', 'Prior MPZIS actors are invalid.');
    if (new Set(used).size !== used.length) deny('ACTOR_CONTEXT_INVALID', 'Prior MPZIS actors are duplicated.');
    const allActorKeys = [creatorKey, submitterKey, ...used];
    if (new Set(allActorKeys).size !== allActorKeys.length) deny('ACTOR_SEPARATION', 'MPZIS actors must be pairwise distinct.');
    if (allActorKeys.includes(currentKey)) deny('ACTOR_SEPARATION', 'Aktor MPZIS sudah dipakai pada langkah lain.');
    const requiresLeader = step === 'responsible_acknowledged' || step === 'approved';
    if (requiresLeader && !isLeader(actor)) deny('LEVEL_REQUIRED', 'Langkah ini membutuhkan pimpinan Penyaluran.');
    if (!requiresLeader && !isStaff(actor)) deny('LEVEL_REQUIRED', 'Langkah ini membutuhkan staf Penyaluran.');
  }
  if (action === ACTIONS.FINANCE_CHECK && (same('creator_id') || same('approver_id'))) deny('ACTOR_SEPARATION', 'Checker Keuangan harus independen.');
  if (action === ACTIONS.FINANCE_APPROVE && (same('creator_id') || same('checker_id'))) deny('ACTOR_SEPARATION', 'Approver Keuangan harus berbeda dari creator dan checker.');
  if (action === ACTIONS.PAYMENT_RECORD && same('creator_id')) deny('ACTOR_SEPARATION', 'Recorder pembayaran harus berbeda dari creator PPD.');
  if (action === ACTIONS.PAYMENT_VERIFY && same('recorder_id')) deny('ACTOR_SEPARATION', 'Verifier pembayaran harus berbeda dari recorder.');
  return true;
}

export { isPenyaluran, isPenyaluranDivision, MPZIS_STEPS };
