import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed, capabilitiesFor, MPZIS_STEPS } from './permissions.js';
import { ROLE } from '../access-policy.js';
import { SOURCE_FIELDS } from './canonical-snapshot.js';
import { getDb } from '../db.js';

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

function id(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 400, field_errors: { [field]: 'INTEGER' } });
  }
  return n;
}

export function maskNik(nik) {
  if (!nik) return null;
  const clean = String(nik).trim();
  if (!clean) return null;
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}${'*'.repeat(Math.max(12, clean.length - 4))}`;
}

export function maskPhone(phone) {
  if (!phone) return null;
  const clean = String(phone).trim();
  if (!clean) return null;
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)}${'*'.repeat(Math.max(4, clean.length - 8))}${clean.slice(-4)}`;
}

export function maskBankAccount(last4) {
  if (!last4) return null;
  const clean = String(last4).trim();
  if (!clean) return null;
  return `************${clean}`;
}

function parseNumeric(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseMoneyAmount(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function isSchemaMissing(err) {
  return ['42P01', '42703'].includes(String(err?.code)) ||
    /relation .* does not exist|column .* does not exist/i.test(String(err?.message));
}

function jsonParseSafe(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

async function safeQuery(db, query, params = []) {
  try {
    if (typeof db.all === 'function') return await db.all(query, params);
    const res = await db.query(query, params);
    return res.rows || [];
  } catch (err) {
    if (isSchemaMissing(err)) {
      throw new P0Error('SCHEMA_NOT_READY', 'Skema database P0 belum siap.', { status: 503, cause: err });
    }
    throw err;
  }
}

async function safeGet(db, query, params = []) {
  try {
    if (typeof db.get === 'function') return await db.get(query, params);
    const res = await db.query(query, params);
    return res.rows?.[0] || null;
  } catch (err) {
    if (isSchemaMissing(err)) {
      throw new P0Error('SCHEMA_NOT_READY', 'Skema database P0 belum siap.', { status: 503, cause: err });
    }
    throw err;
  }
}

const MPZIS_STAGE_CONFIG = [
  { stage: 1, step_key: 'proposed', role: 'Diajukan' },
  { stage: 2, step_key: 'examined', role: 'Diperiksa' },
  { stage: 3, step_key: 'ashnaf_verified', role: 'Verifikator Ashnaf' },
  { stage: 4, step_key: 'responsible_acknowledged', role: 'Penanggungjawab Penyaluran' },
  { stage: 5, step_key: 'approved', role: 'Disetujui' },
];

export function computeCasePermissions({
  caseRow,
  activeAssessment,
  activeMpzis,
  mpzisApprovals = [],
  activePpd,
  hasPaymentRecorded = false,
  actor = {},
}) {
  const isLegacy = caseRow.workflow_mode === 'legacy';
  const isReconciliation = caseRow.workflow_mode === 'legacy_reconciliation';
  const isArchived = Boolean(caseRow.archived_at);
  const isRoutineBlocked = isLegacy || isReconciliation || isArchived;
  const status = caseRow.status;

  // 1. can_assess
  const canAssess = !isRoutineBlocked &&
    status !== 'Ditolak' &&
    status !== 'Penyaluran Selesai' &&
    ['Survey', 'Diajukan', 'Survey & Assessment Lapangan'].includes(status) &&
    (!activeAssessment || ['draft', 'returned'].includes(activeAssessment.status)) &&
    !isAdmin(actor) &&
    ((isPenyaluran(actor) && isStaff(actor)) || isSurveyor(actor));

  // 2. can_approve_mpzis
  let canApproveMpzis = false;
  if (!isRoutineBlocked && status === 'Persetujuan MPZIS' && activeMpzis && activeMpzis.source === 'p0' && !isAdmin(actor) && isPenyaluran(actor)) {
    const actorId = String(actor.id);
    const isCreator = String(activeMpzis.created_by_id) === actorId;
    const isSubmitter = String(activeMpzis.submitted_by_id) === actorId;
    const usedApprovers = (mpzisApprovals || [])
      .filter((a) => a.action === 'approve')
      .map((a) => String(a.actor_id));
    const alreadyApproved = usedApprovers.includes(actorId);

    if (!isCreator && !isSubmitter && !alreadyApproved) {
      const mpStatus = activeMpzis.status;
      if (mpStatus === 'submitted' || mpStatus === 'proposed' || mpStatus === 'examined') {
        canApproveMpzis = isStaff(actor);
      } else if (mpStatus === 'ashnaf_verified' || mpStatus === 'responsible_acknowledged') {
        canApproveMpzis = isLeader(actor);
      }
    }
  }

  // 3. allowed_mpzis_roles - Return only the single next eligible step role
  let allowedMpzisRoles = [];
  if (!isRoutineBlocked && !isAdmin(actor) && isPenyaluran(actor) && activeMpzis && activeMpzis.source === 'p0') {
    const actorId = String(actor.id);
    const isCreator = String(activeMpzis.created_by_id) === actorId;
    const isSubmitter = String(activeMpzis.submitted_by_id) === actorId;
    const usedApprovers = (mpzisApprovals || [])
      .filter((a) => a.action === 'approve')
      .map((a) => String(a.actor_id));

    if (!isCreator && !isSubmitter && !usedApprovers.includes(actorId)) {
      const mpStatus = activeMpzis.status;
      const nextStepMap = {
        submitted: { role: 'Diajukan', requiresLeader: false },
        proposed: { role: 'Diperiksa', requiresLeader: false },
        examined: { role: 'Verifikator Ashnaf', requiresLeader: false },
        ashnaf_verified: { role: 'Penanggungjawab Penyaluran', requiresLeader: true },
        responsible_acknowledged: { role: 'Disetujui', requiresLeader: true },
      };
      const next = nextStepMap[mpStatus];
      if (next) {
        if (next.requiresLeader && isLeader(actor)) {
          allowedMpzisRoles = [next.role];
        } else if (!next.requiresLeader && isStaff(actor)) {
          allowedMpzisRoles = [next.role];
        }
      }
    }
  }

  // 4. can_submit_ppd
  const canSubmitPpd = !isRoutineBlocked &&
    status === 'Pengajuan Dana (FPD)' &&
    activeMpzis?.status === 'approved' &&
    (!activePpd || ['draft', 'returned'].includes(activePpd.status)) &&
    !isAdmin(actor) &&
    isPenyaluran(actor) &&
    isStaff(actor);

  // 5. can_disburse
  const canDisburse = !isRoutineBlocked &&
    status === 'Pengajuan Dana (FPD)' &&
    activePpd?.status === 'finance_approved' &&
    !hasPaymentRecorded &&
    !isAdmin(actor) &&
    isKeuangan(actor) &&
    (isStaff(actor) || isLeader(actor)) &&
    String(actor.id) !== String(activePpd.created_by_id);

  // 6. can_archive
  const canArchive = Boolean(isAdmin(actor) && !caseRow.archived_at);

  // 7. can_restore
  const canRestore = Boolean(isAdmin(actor) && caseRow.archived_at);

  return {
    can_assess: Boolean(canAssess),
    can_approve_mpzis: Boolean(canApproveMpzis),
    allowed_mpzis_roles: allowedMpzisRoles,
    can_submit_ppd: Boolean(canSubmitPpd),
    can_disburse: Boolean(canDisburse),
    can_archive: Boolean(canArchive),
    can_restore: Boolean(canRestore),
  };
}

function extractAssessmentFields(row) {
  if (!row) return null;
  const snapshot = jsonParseSafe(row.snapshot_json) || {};
  const fields = {};
  for (const key of SOURCE_FIELDS) {
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key) && snapshot[key] !== undefined) {
      fields[key] = snapshot[key];
    } else if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      fields[key] = row[key];
    } else {
      fields[key] = null;
    }
  }
  // Coerce money fields to numbers or null if present
  const moneyKeys = ['monthly_rent_amount', 'husband_monthly_income', 'wife_monthly_income', 'child_monthly_support'];
  for (const m of moneyKeys) {
    if (fields[m] !== null && fields[m] !== undefined && fields[m] !== '') {
      fields[m] = parseNumeric(fields[m]);
    } else {
      fields[m] = null;
    }
  }
  if (fields.child_count !== null && fields.child_count !== undefined) {
    fields.child_count = parseNumeric(fields.child_count);
  }
  if (fields.previous_application_year !== null && fields.previous_application_year !== undefined) {
    fields.previous_application_year = parseNumeric(fields.previous_application_year);
  }
  return fields;
}

export function computeProvenCompletion(caseRow, activePpd, payment, confirmation) {
  if (caseRow.workflow_mode !== 'p0') {
    return false;
  }
  const hasCompletedPpd = activePpd?.status === 'completed';
  const hasVerifiedPayment = Boolean(payment && payment.verification_status === 'verified' && payment.proof_file_id);
  const hasConfirmation = Boolean(confirmation && confirmation.confirmed_at);
  const hasReadyReceipt = activePpd?.receipt_status === 'ready';

  return Boolean(hasCompletedPpd && hasVerifiedPayment && hasConfirmation && hasReadyReceipt);
}

function computeCurrentStage(caseRow, activeAssessment, activeMpzis, activePpd, payment, confirmation) {
  if (caseRow.archived_at) return 'archived';
  const isProvenCompleted = computeProvenCompletion(caseRow, activePpd, payment, confirmation);
  if (isProvenCompleted) return 'completed';

  const isVerifiedPayment = payment && payment.verification_status === 'verified';
  if (confirmation && isVerifiedPayment) return 'completion';
  if (isVerifiedPayment) return 'confirmation';
  if (payment) return 'payment';
  if (activePpd?.status === 'finance_approved') return 'payment';
  if (activePpd) return 'ppd';
  if (activeMpzis) return 'mpzis';
  if (activeAssessment) return 'assessment';
  return 'intake';
}

export async function assertCaseScope(db, caseId, actor) {
  if (isAdmin(actor)) {
    assertAllowed(ACTIONS.CROSS_CASE_AUDIT, actor);
    return;
  }
  assertAllowed(ACTIONS.CASE_READ, actor);
  const actorRole = roleOf(actor);
  const actorUserId = actor.id ?? actor.user_id;

  let assignmentRows = [];
  try {
    assignmentRows = await safeQuery(
      db,
      'SELECT user_id, assignment_role FROM mustahik_case_assignments WHERE mustahik_id = $1 AND ended_at IS NULL',
      [caseId]
    );
  } catch (err) {
    if (err instanceof P0Error) throw err;
    if (/relation .*mustahik_case_assignments.* does not exist/i.test(String(err?.message))) {
      throw new P0Error('SCHEMA_NOT_READY', 'Skema database P0 belum siap.', { status: 503, cause: err });
    }
    throw err;
  }

  const hasAnyAssignments = assignmentRows.length > 0;
  const isAssigned = assignmentRows.some((r) => Number(r.user_id) === Number(actorUserId));

  if (hasAnyAssignments && !isAssigned) {
    throw new P0Error('PERMISSION_DENIED', 'Akses kasus dibatasi penugasan aktif.', { status: 403 });
  }
}

export async function getP0CaseWorkspace(context = {}, mustahikId, meta = {}) {
  let ctx = context;
  let targetId = mustahikId;
  let metaData = meta;

  if (typeof context === 'number' || typeof context === 'string' || (context && !context.actor && !context.user && !context.db && (mustahikId?.role || mustahikId?.id || mustahikId?.user_id))) {
    targetId = context;
    ctx = { actor: mustahikId, db: meta };
    metaData = {};
  }

  const caseId = id(targetId ?? ctx.mustahik_id, 'mustahik_id');
  const actor = ctx.actor || ctx.user || {};

  if (!actor || (actor.id === undefined && actor.user_id === undefined)) {
    throw new P0Error('ACTOR_REQUIRED', 'Akses ditolak: Token otentikasi tidak ditemukan.', { status: 401 });
  }

  const db = ctx.db || (ctx.getDb ? ctx.getDb() : null) || await getDb();
  await assertCaseScope(db, caseId, actor);

  // Batch 1: Parallel Lookups
  const [
    caseRow,
    application,
    activeAssessment,
    activeMpzis,
    activePpd,
    artifactApprovals,
    approvalDecisions,
    activityLogs,
    artifactFiles,
    intakeDocuments,
    artifactAccessEvents,
  ] = await Promise.all([
    safeGet(db, 'SELECT * FROM mustahik WHERE id = $1', [caseId]),
    safeGet(db, 'SELECT * FROM applications WHERE mustahik_id = $1 ORDER BY id DESC LIMIT 1', [caseId]),
    safeGet(db, "SELECT * FROM assessments WHERE mustahik_id = $1 AND source = 'p0' AND status <> 'superseded' ORDER BY revision DESC, id DESC LIMIT 1", [caseId]),
    safeGet(db, "SELECT * FROM mpzis WHERE mustahik_id = $1 AND source = 'p0' AND status <> 'superseded' ORDER BY revision DESC, id DESC LIMIT 1", [caseId]),
    safeGet(db, "SELECT * FROM ppd WHERE mustahik_id = $1 AND source = 'p0' AND status <> 'superseded' ORDER BY revision DESC, id DESC LIMIT 1", [caseId]),
    safeQuery(db, 'SELECT * FROM artifact_approvals WHERE mustahik_id = $1 ORDER BY id ASC', [caseId]),
    safeQuery(db, 'SELECT * FROM approval_decisions WHERE mustahik_id = $1 ORDER BY id ASC', [caseId]),
    safeQuery(db, 'SELECT * FROM activity_logs WHERE mustahik_id = $1 ORDER BY id ASC', [caseId]),
    safeQuery(db, 'SELECT artifact_files.id, artifact_files.mustahik_id, artifact_files.artifact_type, artifact_files.artifact_id, artifact_files.artifact_revision, artifact_files.kind, artifact_files.stored_name, artifact_files.original_name, artifact_files.mime_type, artifact_files.byte_size, artifact_files.sha256, artifact_files.uploaded_by_id, users.name AS uploaded_by_name, artifact_files.created_at FROM artifact_files LEFT JOIN users ON users.id = artifact_files.uploaded_by_id WHERE artifact_files.mustahik_id = $1 ORDER BY artifact_files.id ASC', [caseId]),
    safeQuery(db, 'SELECT id, mustahik_id, doc_type, filename, original_name, uploaded_at FROM documents WHERE mustahik_id = $1 ORDER BY id ASC', [caseId]),
    safeQuery(db, 'SELECT id, file_id, mustahik_id, artifact_type, actor_id, actor_name, action, created_at FROM artifact_access_events WHERE mustahik_id = $1 ORDER BY id ASC', [caseId]),
  ]);

  if (!caseRow) {
    throw new P0Error('CASE_NOT_FOUND', 'Kasus mustahik tidak ditemukan.', { status: 404 });
  }

  // Batch 2: Conditional execution for PPD lines, payments, confirmation
  let rabLines = [];
  let payment = null;
  let confirmation = null;

  if (activePpd) {
    const [rabRows, paymentRow, confirmationRow] = await Promise.all([
      safeQuery(db, 'SELECT id, ppd_id, line_no, register_number, description, amount FROM ppd_rab_lines WHERE ppd_id = $1 ORDER BY line_no ASC', [activePpd.id]),
      safeGet(db, 'SELECT ppd_payments.*, recorder.name AS recorded_by_name, verifier.name AS verified_by_name FROM ppd_payments LEFT JOIN users AS recorder ON recorder.id = ppd_payments.recorded_by_id LEFT JOIN users AS verifier ON verifier.id = ppd_payments.verified_by_id WHERE ppd_payments.ppd_id = $1 ORDER BY ppd_payments.id DESC LIMIT 1', [activePpd.id]),
      safeGet(db, 'SELECT recipient_confirmations.*, recorder.name AS recorded_by_name FROM recipient_confirmations LEFT JOIN users AS recorder ON recorder.id = recipient_confirmations.recorded_by_id WHERE recipient_confirmations.ppd_id = $1 ORDER BY recipient_confirmations.id DESC LIMIT 1', [activePpd.id]),
    ]);
    rabLines = rabRows;
    payment = paymentRow;
    confirmation = confirmationRow;
  }

  const mpzisApprovalsEvents = activeMpzis
    ? artifactApprovals.filter((a) => a.artifact_type === 'mpzis' && Number(a.artifact_id) === Number(activeMpzis.id) && Number(a.artifact_revision) === Number(activeMpzis.revision))
    : [];

  const hasPaymentRecorded = Boolean(payment || (activePpd && ['payment_recorded', 'payment_verified', 'recipient_confirmed', 'completed'].includes(activePpd.status)));

  const permissions = computeCasePermissions({
    caseRow,
    activeAssessment,
    activeMpzis,
    mpzisApprovals: mpzisApprovalsEvents,
    activePpd,
    hasPaymentRecorded,
    actor,
  });

  const capabilities = capabilitiesFor(actor);

  // 18-Field Assessment Construction
  let assessmentPayload = null;
  if (activeAssessment) {
    const fields = extractAssessmentFields(activeAssessment);
    assessmentPayload = {
      id: activeAssessment.id,
      revision: activeAssessment.revision,
      status: activeAssessment.status,
      snapshot_hash: activeAssessment.snapshot_hash ? String(activeAssessment.snapshot_hash).trim() : null,
      fields,
    };
  } else {
    assessmentPayload = {
      id: null,
      revision: null,
      status: 'PENDING',
      snapshot_hash: null,
      fields: null,
    };
  }

  // 5-Stage MPZIS Approvals Construction
  const mpzisApprovals = MPZIS_STAGE_CONFIG.map(({ stage, step_key, role }) => {
    const approval = mpzisApprovalsEvents.find((e) => e.approval_step === step_key && e.action === 'approve');
    if (approval) {
      return {
        stage,
        step_key,
        role,
        user_id: approval.actor_id ?? null,
        user_nama: approval.actor_name ?? null,
        status: 'APPROVED',
        timestamp: approval.created_at ? new Date(approval.created_at).toISOString() : null,
        snapshot_hash: approval.snapshot_hash ? String(approval.snapshot_hash).trim() : null,
        note: approval.note || null,
      };
    }
    return {
      stage,
      step_key,
      role,
      user_id: null,
      user_nama: null,
      status: 'PENDING',
      timestamp: null,
      snapshot_hash: null,
      note: null,
    };
  });

  const mpzisPayload = activeMpzis ? {
    id: activeMpzis.id,
    revision: activeMpzis.revision,
    status: activeMpzis.status,
    form_number: activeMpzis.form_number || null,
    total_amount: parseNumeric(activeMpzis.total_amount),
    snapshot_hash: activeMpzis.snapshot_hash ? String(activeMpzis.snapshot_hash).trim() : null,
    approvals: mpzisApprovals,
  } : null;

  // PPD RAB Lines Construction
  const totalRab = activePpd
    ? parseMoneyAmount(activePpd.amount)
    : rabLines.reduce((sum, l) => sum + parseMoneyAmount(l.amount), 0);

  const ppdPayload = activePpd ? {
    id: activePpd.id,
    revision: activePpd.revision,
    status: activePpd.status,
    form_number: activePpd.form_number || null,
    ppd_number: activePpd.ppd_number || null,
    transaction_number: activePpd.transaction_number || null,
    total_rab: totalRab,
    amount: totalRab,
    amount_in_words: activePpd.amount_in_words || null,
    bank_name: activePpd.bank_name || null,
    bank_account_masked: maskBankAccount(activePpd.bank_account_last4),
    bank_account_name: activePpd.bank_account_name || null,
    snapshot_hash: activePpd.snapshot_hash ? String(activePpd.snapshot_hash).trim() : null,
    rab_lines: rabLines.map((line) => {
      const lineAmount = parseMoneyAmount(line.amount);
      return {
        id: line.id,
        line_no: line.line_no,
        register_number: line.register_number || null,
        deskripsi: line.description ?? null,
        description: line.description ?? null,
        jumlah: 1,
        harga_satuan: lineAmount,
        total: lineAmount,
        amount: lineAmount,
      };
    }),
  } : {
    id: null,
    revision: null,
    status: null,
    total_rab: null,
    amount: null,
    rab_lines: [],
  };

  // Disbursement Construction
  let disbursementPayload = {
    status: 'pending',
    paid_amount: null,
    paid_at: null,
    transaction_number: null,
    proof_url: null,
    verification_status: null,
    verified_at: null,
  };

  if (payment) {
    disbursementPayload = {
      status: payment.verification_status === 'verified' ? 'verified' : 'recorded',
      paid_amount: parseNumeric(payment.paid_amount),
      paid_at: payment.paid_at ? new Date(payment.paid_at).toISOString() : null,
      transaction_number: payment.transaction_number || activePpd?.transaction_number || null,
      proof_url: payment.proof_file_id ? `/api/penyaluran/mustahik/${caseId}/artifacts/${payment.proof_file_id}` : null,
      verification_status: payment.verification_status || 'pending',
      verified_at: payment.verified_at ? new Date(payment.verified_at).toISOString() : null,
    };
  }

  // Completion Construction
  const isProvenCompleted = computeProvenCompletion(caseRow, activePpd, payment, confirmation);
  let completionPayload = {
    status: isProvenCompleted ? 'completed' : (confirmation ? 'confirmed' : 'pending'),
    method: confirmation?.method || null,
    confirmed_at: confirmation?.confirmed_at ? new Date(confirmation.confirmed_at).toISOString() : null,
    recipient_name: confirmation?.recipient_name_snapshot || null,
    receipt_status: activePpd?.receipt_status || null,
    receipt_url: activePpd && activePpd.receipt_status === 'ready'
      ? `/api/penyaluran/mustahik/${caseId}/ppd/${activePpd.id}/receipt`
      : null,
    payload_sha256: activePpd?.receipt_payload_sha256 ? String(activePpd.receipt_payload_sha256).trim() : null,
    file_sha256: activePpd?.receipt_file_sha256 ? String(activePpd.receipt_file_sha256).trim() : null,
  };

  // Timeline Construction
  const timelineEvents = [];

  for (const app of artifactApprovals) {
    let type = 'approval';
    let action = app.action || app.approval_step || 'approval';
    if (app.is_admin_override) {
      type = 'recovery';
    } else if (app.action === 'archive' || app.approval_step === 'archive') {
      type = 'archive';
      action = 'archive';
    } else if (app.action === 'restore' || app.approval_step === 'restore') {
      type = 'restore';
      action = 'restore';
    }
    timelineEvents.push({
      id: app.id,
      type,
      action,
      actor: app.actor_name || app.actor_role || null,
      note: app.note || app.override_reason || null,
      timestamp: app.created_at ? new Date(app.created_at).toISOString() : null,
    });
  }

  for (const log of activityLogs) {
    let type = 'activity';
    let action = log.action_type || log.title || 'activity';
    if (log.action_type === 'ARCHIVE') {
      type = 'archive';
      action = 'archive';
    } else if (log.action_type === 'RESTORE') {
      type = 'restore';
      action = 'restore';
    }
    timelineEvents.push({
      id: log.id,
      type,
      action,
      actor: log.actor_name || log.actor_role || null,
      note: log.description || null,
      timestamp: log.created_at ? new Date(log.created_at).toISOString() : null,
    });
  }

  for (const dec of approvalDecisions) {
    timelineEvents.push({
      id: dec.id,
      type: 'decision',
      action: dec.action || dec.stage || 'decision',
      actor: dec.actor_name || dec.actor_role || null,
      note: dec.note || null,
      timestamp: dec.created_at ? new Date(dec.created_at).toISOString() : null,
    });
  }

  for (const acc of (artifactAccessEvents || [])) {
    timelineEvents.push({
      id: acc.id,
      type: 'access',
      action: acc.action || 'view',
      actor: acc.actor_name || acc.actor_role || null,
      note: null,
      timestamp: acc.created_at ? new Date(acc.created_at).toISOString() : null,
    });
  }

  for (const file of (artifactFiles || [])) {
    const isReceipt = file.kind === 'system_receipt_pdf';
    timelineEvents.push({
      id: `file-${file.id}`,
      type: isReceipt ? 'receipt' : 'file',
      action: isReceipt ? 'receipt_generated' : 'file_uploaded',
      actor: file.uploaded_by_name || null,
      note: null,
      timestamp: file.created_at ? new Date(file.created_at).toISOString() : null,
    });
  }
  if (payment) {
    timelineEvents.push({
      id: `payment-${payment.id}`,
      type: 'payment',
      action: 'payment_recorded',
      actor: payment.recorded_by_name || null,
      note: payment.transaction_number || null,
      timestamp: payment.created_at ? new Date(payment.created_at).toISOString() : null,
    });
    if (payment.verification_status === 'verified') {
      timelineEvents.push({
        id: `payment-verify-${payment.id}`,
        type: 'payment',
        action: 'payment_verified',
        actor: payment.verified_by_name || null,
        note: null,
        timestamp: payment.verified_at ? new Date(payment.verified_at).toISOString() : null,
      });
    }
  }

  if (confirmation) {
    timelineEvents.push({
      id: `confirmation-${confirmation.id}`,
      type: 'confirmation',
      action: 'recipient_confirmed',
      actor: confirmation.recorded_by_name || null,
      note: confirmation.note || confirmation.notes || null,
      timestamp: confirmation.created_at ? new Date(confirmation.created_at).toISOString() : null,
    });
  }


  timelineEvents.sort((a, b) => (new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()) || (String(a.id || '').localeCompare(String(b.id || ''))));

  const timeline = timelineEvents.map((t) => ({
    id: t.id,
    type: t.type,
    action: t.action,
    actor: t.actor,
    note: t.note,
    timestamp: t.timestamp,
  }));

  // Documents Gallery Construction
  const artifactDocuments = (artifactFiles || []).map((file) => ({
    id: file.id,
    artifact_type: file.artifact_type ?? null,
    kind: file.kind ?? null,
    filename: file.original_name ?? file.stored_name ?? null,
    original_name: file.original_name ?? file.stored_name ?? null,
    mime_type: file.mime_type ?? null,
    byte_size: file.byte_size ?? null,
    sha256: file.sha256 ? String(file.sha256).trim() : null,
    created_at: file.created_at ? new Date(file.created_at).toISOString() : null,
    download_url: `/api/penyaluran/mustahik/${caseId}/artifacts/${file.id}`,
  }));

  const intakeDocumentRows = (intakeDocuments || []).map((file) => ({
    id: 'intake-' + file.id,
    artifact_type: null,
    kind: file.doc_type ?? null,
    filename: file.original_name ?? file.filename ?? null,
    original_name: file.original_name ?? file.filename ?? null,
    mime_type: null,
    byte_size: null,
    sha256: null,
    created_at: file.uploaded_at ? new Date(file.uploaded_at).toISOString() : null,
    download_url: '/api/penyaluran/mustahik/' + caseId + '/documents/' + file.id,
  }));
  const documents = [...artifactDocuments, ...intakeDocumentRows];
  const isLegacy = caseRow.workflow_mode === 'legacy';
  const isReconciliation = caseRow.workflow_mode === 'legacy_reconciliation';
  const displayStatus = caseRow.archived_at ? 'ARCHIVED' : (caseRow.status || 'DRAFT');

  return {
    success: true,
    case: {
      id: caseRow.id,
      nomor_registrasi: caseRow.file_no || null,
      file_no: caseRow.file_no || null,
      status: displayStatus,
      p0_version: Number(caseRow.workflow_version || 0),
      workflow_version: Number(caseRow.workflow_version || 0),
      workflow_mode: caseRow.workflow_mode || (caseRow.workflow_version === 0 ? 'legacy' : 'p0'),
      is_legacy: isLegacy,
      is_reconciliation: isReconciliation,
      legacy_banner: isLegacy,
      reconciliation_banner: isReconciliation,
      created_at: caseRow.created_at ? new Date(caseRow.created_at).toISOString() : null,
      updated_at: caseRow.updated_at ? new Date(caseRow.updated_at).toISOString() : null,
      archived_at: caseRow.archived_at ? new Date(caseRow.archived_at).toISOString() : null,
      archived_by_id: caseRow.archived_by_id ?? null,
      archive_reason: caseRow.archive_reason ?? null,
    },
    mustahik: {
      id: caseRow.id,
      nama: (caseRow.name || caseRow.nama) ?? null,
      name: (caseRow.name || caseRow.nama) ?? null,
      nik_masked: maskNik(caseRow.nik),
      phone_masked: maskPhone(caseRow.phone),
      applicant_status: caseRow.applicant_status ?? null,
      kategori: caseRow.applicant_status || caseRow.asnaf || null,
      asnaf: caseRow.asnaf || null,
      program: caseRow.program || application?.program || null,
      address: caseRow.address || null,
      rt_rw: caseRow.rt_rw || null,
      kelurahan: caseRow.kelurahan || null,
      kecamatan: caseRow.kecamatan || null,
      kabupaten_kota: caseRow.kabupaten_kota || null,
      province: caseRow.province || null,
    },
    case_progress: (() => {
      const currentStage = computeCurrentStage(caseRow, activeAssessment, activeMpzis, activePpd, payment, confirmation);
      let requiredAction = null;
      const blockingReasons = [];

      if (caseRow.archived_at) {
        blockingReasons.push('Kasus telah diarsipkan');
      } else if (caseRow.status === 'Ditolak') {
        blockingReasons.push('Kasus telah ditolak');
      } else if (currentStage === 'intake') {
        requiredAction = 'Lakukan survey dan buat assessment';
      } else if (currentStage === 'assessment') {
        requiredAction = activeAssessment?.status === 'submitted' ? 'Ajukan persetujuan MPZIS' : 'Lengkapi formulir assessment';
      } else if (currentStage === 'mpzis') {
        requiredAction = activeMpzis?.status === 'approved' ? 'Buat formulir PPD' : 'Menunggu persetujuan berjenjang MPZIS';
      } else if (currentStage === 'ppd') {
        requiredAction = activePpd?.status === 'finance_approved' ? 'Pencairan dana dan upload bukti transfer' : 'Pemeriksaan dan persetujuan PPD';
      } else if (currentStage === 'payment') {
        requiredAction = 'Upload bukti transfer dan catat pembayaran';
      } else if (currentStage === 'confirmation') {
        requiredAction = 'Konfirmasi tanda terima dari mustahik';
      } else if (currentStage === 'completion') {
        requiredAction = 'Terbitkan Bukti Digital Penyaluran dan selesaikan penyaluran';
      }

      return {
        current_stage: currentStage,
        active_artifact: activePpd ? 'ppd' : (activeMpzis ? 'mpzis' : (activeAssessment ? 'assessment' : null)),
        required_action: requiredAction,
        blocking_reasons: blockingReasons,
        is_terminal: ['Penyaluran Selesai', 'Ditolak'].includes(caseRow.status) || Boolean(caseRow.archived_at),
      };
    })(),
    assessment: assessmentPayload,
    mpzis_approvals: mpzisApprovals,
    mpzis: mpzisPayload,
    ppd: ppdPayload,
    disbursement: disbursementPayload,
    completion: completionPayload,
    permissions,
    capabilities,
    timeline,
    history: timeline,
    documents,
  };
}
