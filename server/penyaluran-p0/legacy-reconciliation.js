/**
 * server/penyaluran-p0/legacy-reconciliation.js
 * Task 12: Legacy Freeze, Case Classification, Audited Archive & Restore, and Route Guards
 */
import crypto from 'node:crypto';
import { P0Error } from './errors.js';
import { getDb, withTransaction as defaultWithTransaction } from '../db.js';
import {
  insertActivity,
  insertArtifactApproval,
  reserveIdempotencyKey,
  completeIdempotencyKey,
} from './repository.js';
import { createSnapshot, SNAPSHOT_SCHEMAS } from './canonical-snapshot.js';
import { fileHash } from './completion-service.js';
import { ACTIONS, assertAllowed } from './permissions.js';

// ==========================================
// 1. Feature Flag & Cutover Gate Helpers
// ==========================================

export function isPenyaluranP0Enabled(env = process.env) {
  const val = env?.PENYALURAN_P0_ENABLED;
  return val === 'true' || val === true;
}

export function isP0CutoverActive(options = {}) {
  const cutoverAt = options.cutoverAt ?? process.env.PENYALURAN_P0_CUTOVER_AT;
  if (!cutoverAt) return false;
  const cutoverDate = new Date(cutoverAt);
  const nowDate = options.now ? new Date(options.now) : new Date();
  return !Number.isNaN(cutoverDate.getTime()) && nowDate >= cutoverDate;
}
export function assertP0CutoverConfiguration(env = process.env) {
  if (!isPenyaluranP0Enabled(env)) return true;

  const cutoverAt = env?.PENYALURAN_P0_CUTOVER_AT;
  if (typeof cutoverAt !== 'string' || !cutoverAt.trim() || Number.isNaN(new Date(cutoverAt).getTime())) {
    const error = new Error('PENYALURAN_P0_ENABLED requires a valid PENYALURAN_P0_CUTOVER_AT timestamp.');
    error.code = 'INVALID_P0_CUTOVER_CONFIGURATION';
    throw error;
  }
  return true;
}


export const isPenyaluranCutoverPassed = isP0CutoverActive;

// ==========================================
// 2. Case Classification
// ==========================================

const TERMINAL_STATUSES = new Set(['Selesai', 'Penyaluran Selesai', 'Ditolak']);
const EARLY_STATUSES = new Set(['Diajukan', 'Verifikasi Administrasi', 'Verifikasi']);

export function classifyLegacyCase(caseRecord = {}) {
  const mode = caseRecord.workflow_mode || 'legacy';
  const status = caseRecord.status;
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isEarly = EARLY_STATUSES.has(status);

  if (mode === 'p0') {
    return {
      classification: 'p0',
      workflow_mode: 'p0',
      status,
      read_only: isTerminal,
      can_direct_switch: false,
    };
  }

  if (mode === 'legacy_reconciliation') {
    return {
      classification: 'in_flight',
      workflow_mode: 'legacy_reconciliation',
      status,
      read_only: false,
      can_direct_switch: false,
    };
  }

  // legacy mode
  if (isTerminal) {
    return {
      classification: 'terminal',
      workflow_mode: 'legacy',
      status,
      read_only: true,
      can_direct_switch: false,
    };
  }

  if (isEarly) {
    return {
      classification: 'early',
      workflow_mode: 'legacy',
      status,
      read_only: false,
      can_direct_switch: true,
    };
  }

  return {
    classification: 'in_flight',
    workflow_mode: 'legacy',
    status,
    read_only: false,
    can_direct_switch: false,
  };
}

// ==========================================
// 3. Write Guard Assertion
// ==========================================

export function assertLegacyWriteAllowed(caseRecord, action, options = {}) {
  if (isP0CutoverActive(options)) {
    throw new P0Error(
      'LEGACY_WORKFLOW_DISABLED',
      'Modul penyaluran legacy telah dinonaktifkan setelah cutover.',
      { status: 410 },
    );
  }

  if (!caseRecord) return true;
  if (caseRecord.archived_at) {
    throw new P0Error('CASE_ARCHIVED', 'Kasus telah diarsipkan; pulihkan terlebih dahulu sebelum mengubahnya.', { status: 409 });
  }


  const mode = caseRecord.workflow_mode || 'legacy';
  const status = caseRecord.status;

  if (mode === 'p0') {
    // Only early decision (Diajukan / Verifikasi Administrasi) is allowed before artifact stage
    if (action === 'decision' && EARLY_STATUSES.has(status)) {
      return true;
    }
    throw new P0Error(
      'LEGACY_WORKFLOW_DISABLED',
      `Mutasi legacy tidak diizinkan untuk kasus P0 (aksi: ${action}, status: ${status}).`,
      { status: 410 },
    );
  }

  if (mode === 'legacy_reconciliation') {
    throw new P0Error(
      'LEGACY_WORKFLOW_DISABLED',
      'Kasus sedang dalam proses rekonsiliasi P0.',
      { status: 410 },
    );
  }

  if (mode === 'legacy' && TERMINAL_STATUSES.has(status)) {
    throw new P0Error(
      'LEGACY_WORKFLOW_DISABLED',
      `Kasus legacy terminal (${status}) bersifat read-only.`,
      { status: 410 },
    );
  }

  return true;
}

// ==========================================
// 4. Express Middleware Guards
// ==========================================

export function legacyPenyaluranWriteGuard(action, options = {}) {
  return async (req, res, next) => {
    try {
      const cutoverOptions = {
        cutoverAt: options.cutoverAt ?? process.env.PENYALURAN_P0_CUTOVER_AT,
        now: options.now ?? new Date(),
      };

      // If global cutover has passed, reject immediately before DB or file access
      if (isP0CutoverActive(cutoverOptions)) {
        throw new P0Error(
          'LEGACY_WORKFLOW_DISABLED',
          'Modul penyaluran legacy telah dinonaktifkan setelah cutover.',
          { status: 410 },
        );
      }

      let caseRecord = null;
      const caseId = req.params?.id;
      if (caseId) {
        const db = options.getDb ? await options.getDb(req) : (req.app?.locals?.db || req.db || await getDb());
        caseRecord = await db.get(
          'SELECT id, status, workflow_mode, workflow_version, archived_at FROM mustahik WHERE id = $1',
          [caseId],
        );
      }

      assertLegacyWriteAllowed(caseRecord, action, cutoverOptions);
      return next();
    } catch (error) {
      if (error instanceof P0Error) {
        return res.status(error.status).json(error.toJSON());
      }
      return res.status(410).json({
        success: false,
        code: error.code || 'LEGACY_WORKFLOW_DISABLED',
        message: error.message || 'Workflow legacy dinonaktifkan.',
      });
    }
  };
}

export function legacyHardDeleteGuard(req, res) {
  return res.status(405).json({
    success: false,
    code: 'HARD_DELETE_DISABLED',
    message: 'Penghapusan data mustahik secara permanen telah dinonaktifkan.',
  });
}

// Helper to resolve transaction runner
async function runWithTx(db, callback) {
  if (db && typeof db.withTransaction === 'function') {
    return db.withTransaction(callback);
  }
  return defaultWithTransaction(db, callback);
}

function normalizeAdminActor(adminCtx = {}) {
  const actor = adminCtx.actor || adminCtx.user || adminCtx || {};
  const id = Number(actor.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new P0Error('PERMISSION_DENIED', 'Hanya admin yang berwenang melakukan tindakan ini.', { status: 403 });
  }
  const resolvedName = (typeof actor.name === 'string' && actor.name.trim())
    || (typeof actor.email === 'string' && actor.email.trim())
    || (typeof actor.username === 'string' && actor.username.trim());
  if (!resolvedName) {
    throw new P0Error('PERMISSION_DENIED', 'Hanya admin yang berwenang melakukan tindakan ini.', { status: 403 });
  }
  if (actor.role !== 'admin' && actor.level !== 'admin') {
    throw new P0Error('PERMISSION_DENIED', 'Hanya admin yang berwenang melakukan tindakan ini.', { status: 403 });
  }
  return {
    id,
    name: resolvedName,
    role: actor.role || 'admin',
    level: actor.level || 'admin',
    division: actor.division || 'IT',
  };
}

function validateReason(meta = {}) {
  const reason = String(meta.note || meta.reason || '').trim();
  if (reason.length < 20 || reason.length > 1000) {
    throw new P0Error('VALIDATION_FAILED', 'Alasan wajib antara 20 dan 1000 karakter.', {
      status: 422,
      field_errors: { reason: 'LENGTH_RANGE' },
    });
  }
  return reason;
}

function validateArchiveRestoreMeta(meta = {}, action = 'archive') {
  const reason = validateReason(meta);
  if (typeof meta.expected_status !== 'string' || !meta.expected_status.trim()) {
    throw new P0Error('FIELD_REQUIRED', 'expected_status wajib diisi.', { status: 400, field_errors: { expected_status: 'REQUIRED' } });
  }
  const expected_status = meta.expected_status.trim();

  if (meta.expected_version === undefined || meta.expected_version === null || meta.expected_version === '' || !Number.isSafeInteger(Number(meta.expected_version)) || Number(meta.expected_version) < 0) {
    throw new P0Error('FIELD_REQUIRED', 'expected_version wajib diisi sebagai bilangan bulat non-negatif.', { status: 400, field_errors: { expected_version: 'INTEGER_NON_NEGATIVE' } });
  }
  const expected_version = Number(meta.expected_version);

  const key = meta.idempotency_key || meta.idempotencyKey;
  if (typeof key !== 'string' || !key.trim()) {
    throw new P0Error('FIELD_REQUIRED', 'idempotency_key wajib diisi.', { status: 400, field_errors: { idempotency_key: 'REQUIRED' } });
  }
  const idempotency_key = key.trim();

  return { reason, expected_status, expected_version, idempotency_key };
}

// ==========================================
// 5. Audited Archive & Restore
// ==========================================

export async function archiveCase(adminCtx, id, meta = {}) {
  const fullActor = normalizeAdminActor(adminCtx);
  const { reason, expected_status, expected_version, idempotency_key } = validateArchiveRestoreMeta(meta, 'archive');
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
  }

  const db = adminCtx?.txDb || adminCtx?.db || await getDb();

  return runWithTx(db, async (txDb) => {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        action: 'archive',
        case_id: numericId,
        reason,
        expected_status,
        expected_version,
        actor_id: fullActor.id,
      }))
      .digest('hex');

    const reservation = await reserveIdempotencyKey(txDb, {
      actor_id: fullActor.id,
      idempotency_key,
      request_hash: requestHash,
    });

    if (reservation.replayed) {
      return { ...reservation.response, replayed: true };
    }

    const caseRow = await txDb.get(
      'SELECT id, status, workflow_mode, workflow_version, archived_at FROM mustahik WHERE id = $1 FOR UPDATE',
      [numericId],
    );

    if (!caseRow) {
      throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    }

    if (caseRow.archived_at) {
      throw new P0Error('WRONG_STATE', 'Mustahik sudah diarsipkan.', { status: 409 });
    }

    if (caseRow.status !== expected_status) {
      throw new P0Error('STALE_STATE', 'Case status is stale.', { status: 409 });
    }

    if (Number(caseRow.workflow_version) !== expected_version) {
      throw new P0Error('STALE_STATE', 'Case workflow version is stale.', { status: 409 });
    }

    const now = adminCtx?.now ? new Date(adminCtx.now) : new Date();
    const newVersion = Number(caseRow.workflow_version || 0) + 1;

    const updateResult = await txDb.query(
      'UPDATE mustahik SET archived_at = $1, archived_by_id = $2, archive_reason = $3, workflow_version = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND workflow_version = $6',
      [now.toISOString(), fullActor.id, reason, newVersion, numericId, caseRow.workflow_version],
    );

    const affected = updateResult.rowCount ?? updateResult.rows?.length ?? 0;
    if (affected !== 1) {
      throw new P0Error('CONCURRENCY_CONFLICT', 'Gagal mengarsipkan: versi kasus telah berubah.', { status: 409 });
    }

    const snapshotHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        id: numericId,
        workflow_version: newVersion,
        archived_at: now.toISOString(),
        archive_reason: reason,
      }))
      .digest('hex');

    await insertArtifactApproval(txDb, {
      mustahik_id: numericId,
      artifact_type: 'case',
      artifact_id: numericId,
      artifact_revision: newVersion,
      approval_step: 'archive',
      action: 'archive',
      snapshot_hash: snapshotHash,
      note: reason,
      actor: fullActor,
      correlation_id: adminCtx?.correlation_id || meta.correlation_id,
    });

    await insertActivity(txDb, {
      mustahik_id: numericId,
      actor: fullActor,
      action_type: 'ARCHIVE',
      title: 'Kasus Diarsipkan',
      description: reason,
      old_status: caseRow.status,
      new_status: caseRow.status,
      correlation_id: adminCtx?.correlation_id || meta.correlation_id,
    });

    const response = {
      success: true,
      data: {
        id: numericId,
        archived: true,
        archived_at: now.toISOString(),
        workflow_version: newVersion,
      },
      replayed: false,
    };

    await completeIdempotencyKey(txDb, {
      actor_id: fullActor.id,
      idempotency_key,
      response,
    });

    return response;
  });
}

export async function restoreCase(adminCtx, id, meta = {}) {
  const fullActor = normalizeAdminActor(adminCtx);
  const { reason, expected_status, expected_version, idempotency_key } = validateArchiveRestoreMeta(meta, 'restore');
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
  }

  const db = adminCtx?.txDb || adminCtx?.db || await getDb();

  return runWithTx(db, async (txDb) => {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        action: 'restore',
        case_id: numericId,
        reason,
        expected_status,
        expected_version,
        actor_id: fullActor.id,
      }))
      .digest('hex');

    const reservation = await reserveIdempotencyKey(txDb, {
      actor_id: fullActor.id,
      idempotency_key,
      request_hash: requestHash,
    });

    if (reservation.replayed) {
      return { ...reservation.response, replayed: true };
    }

    const caseRow = await txDb.get(
      'SELECT id, status, workflow_mode, workflow_version, archived_at FROM mustahik WHERE id = $1 FOR UPDATE',
      [numericId],
    );

    if (!caseRow) {
      throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    }

    if (!caseRow.archived_at) {
      throw new P0Error('WRONG_STATE', 'Data mustahik tidak dalam status arsip.', { status: 409 });
    }

    if (caseRow.status !== expected_status) {
      throw new P0Error('STALE_STATE', 'Case status is stale.', { status: 409 });
    }

    if (Number(caseRow.workflow_version) !== expected_version) {
      throw new P0Error('STALE_STATE', 'Case workflow version is stale.', { status: 409 });
    }

    const now = adminCtx?.now ? new Date(adminCtx.now) : new Date();
    const newVersion = Number(caseRow.workflow_version || 0) + 1;

    const updateResult = await txDb.query(
      'UPDATE mustahik SET archived_at = NULL, archived_by_id = NULL, archive_reason = NULL, workflow_version = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND workflow_version = $3',
      [newVersion, numericId, caseRow.workflow_version],
    );

    const affected = updateResult.rowCount ?? updateResult.rows?.length ?? 0;
    if (affected !== 1) {
      throw new P0Error('CONCURRENCY_CONFLICT', 'Gagal memulihkan: versi kasus telah berubah.', { status: 409 });
    }

    const snapshotHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        id: numericId,
        workflow_version: newVersion,
        restored_at: now.toISOString(),
        restore_reason: reason,
      }))
      .digest('hex');

    await insertArtifactApproval(txDb, {
      mustahik_id: numericId,
      artifact_type: 'case',
      artifact_id: numericId,
      artifact_revision: newVersion,
      approval_step: 'restore',
      action: 'restore',
      snapshot_hash: snapshotHash,
      note: reason,
      actor: fullActor,
      correlation_id: adminCtx?.correlation_id || meta.correlation_id,
    });

    await insertActivity(txDb, {
      mustahik_id: numericId,
      actor: fullActor,
      action_type: 'RESTORE',
      title: 'Kasus Dipulihkan',
      description: reason,
      old_status: caseRow.status,
      new_status: caseRow.status,
      correlation_id: adminCtx?.correlation_id || meta.correlation_id,
    });

    const response = {
      success: true,
      data: {
        id: numericId,
        archived: false,
        restored_at: now.toISOString(),
        workflow_version: newVersion,
      },
      replayed: false,
    };

    await completeIdempotencyKey(txDb, {
      actor_id: fullActor.id,
      idempotency_key,
      response,
    });

    return response;
  });
}

// ==========================================
// 6. Reconciliation Lifecycle
// ==========================================

const STAGE_STATUS_MAP = {
  // Early / Direct switch
  'Diajukan': 'early',
  'Verifikasi Administrasi': 'early',
  'Verifikasi': 'early',

  // Survey / Assessment stage
  'Survey': 'survey',
  'Assessment': 'survey',
  'Persetujuan Survey': 'survey',

  // MPZIS stage
  'Persetujuan MPZIS': 'mpzis',
  'MPZIS': 'mpzis',
  'Rekomendasi MPZIS': 'mpzis',

  // Finance / PPD stage
  'Pengajuan Dana': 'finance',
  'PPD': 'finance',
  'Pengajuan Dana (FPD)': 'finance',
  'Verifikasi Keuangan': 'finance',
  'Persetujuan Keuangan': 'finance',

  // Payment / completion stage
  'Penyaluran': 'payment',
  'Pencairan': 'payment',
  'Menunggu Konfirmasi': 'payment',

  // Terminal stage
  'Selesai': 'terminal',
  'Penyaluran Selesai': 'terminal',
  'Ditolak': 'terminal',
};

export function resolveCaseStage(status) {
  if (STAGE_STATUS_MAP[status]) return STAGE_STATUS_MAP[status];
  if (EARLY_STATUSES.has(status)) return 'early';
  if (TERMINAL_STATUSES.has(status)) return 'terminal';
  const lower = String(status || '').toLowerCase();
  if (lower.includes('survey') || lower.includes('assessment')) return 'survey';
  if (lower.includes('mpzis')) return 'mpzis';
  if (lower.includes('dana') || lower.includes('ppd') || lower.includes('keuangan')) return 'finance';
  if (lower.includes('salur') || lower.includes('cair') || lower.includes('bayar') || lower.includes('konfirmasi')) return 'payment';
  return 'survey';
}

function validateReconciliationMeta(meta = {}, payload = {}) {
  const reason = validateReason({ note: payload.reason || payload.note || meta.reason || meta.note });
  const rawStatus = meta.expected_status ?? payload.expected_status;
  if (typeof rawStatus !== 'string' || !rawStatus.trim()) {
    throw new P0Error('FIELD_REQUIRED', 'expected_status wajib diisi.', {
      status: 400,
      field_errors: { expected_status: 'REQUIRED' },
    });
  }
  const expected_status = rawStatus.trim();

  const rawVersion = meta.expected_version ?? payload.expected_version;
  if (
    rawVersion === undefined ||
    rawVersion === null ||
    rawVersion === '' ||
    !Number.isSafeInteger(Number(rawVersion)) ||
    Number(rawVersion) < 0
  ) {
    throw new P0Error('FIELD_REQUIRED', 'expected_version wajib diisi dengan integer non-negatif.', {
      status: 400,
      field_errors: { expected_version: 'REQUIRED_NON_NEGATIVE_INTEGER' },
    });
  }
  const expected_version = Number(rawVersion);

  const idempotency_key =
    (typeof meta.idempotency_key === 'string' && meta.idempotency_key.trim()) ||
    (typeof payload.idempotency_key === 'string' && payload.idempotency_key.trim());
  if (!idempotency_key) {
    throw new P0Error('FIELD_REQUIRED', 'idempotency_key wajib diisi.', {
      status: 400,
      field_errors: { idempotency_key: 'REQUIRED' },
    });
  }

  return { reason, expected_status, expected_version, idempotency_key };
}

function parsePersistedSnapshot(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function positiveEvidenceId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Rebuild the canonical snapshot from persisted JSON and bind its identity to
 * the locked database row.  A hexadecimal-looking hash is not evidence by
 * itself; the canonical bytes must reproduce the stored hash exactly.
 */
function canonicalEvidence(type, row, caseId, expectedRevision = row?.revision) {
  const parsed = parsePersistedSnapshot(row?.snapshot_json);
  const storedHash = String(row?.snapshot_hash || '').trim().toLowerCase();
  if (!parsed || !/^[a-f0-9]{64}$/.test(storedHash)) return null;
  let snapshot;
  try {
    snapshot = createSnapshot(type, parsed);
  } catch {
    return null;
  }
  const expectedId = positiveEvidenceId(row?.id);
  const expectedCaseId = positiveEvidenceId(caseId);
  const revision = positiveEvidenceId(expectedRevision);
  const applicationId = row?.application_id ?? null;
  if (
    snapshot.hash.toLowerCase() !== storedHash
    || parsed.artifact_type !== type
    || !expectedId
    || Number(parsed.id) !== expectedId
    || !revision
    || Number(parsed.revision) !== revision
    || !expectedCaseId
    || Number(parsed.mustahik_id) !== expectedCaseId
    || (parsed.application_id ?? null) !== applicationId
    || (['assessment', 'mpzis', 'ppd'].includes(type) && parsed.source !== 'p0')
  ) return null;
  return snapshot;
}

function sameMoney(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
}

async function persistedActorMatchesUser(txDb, approval) {
  const actorId = positiveEvidenceId(approval?.actor_id);
  if (!actorId) return false;
  const user = await txDb.get(
    'SELECT id, name, role, level, division, is_active FROM users WHERE id = $1 FOR UPDATE',
    [actorId],
  );
  if (!user || user.is_active === false || user.is_active === 0 || String(user.is_active).toLowerCase() === 'false') return false;
  return String(approval.actor_name || '').trim() === String(user.name || '').trim()
    && String(approval.actor_role || '').trim() === String(user.role || '').trim()
    && String(approval.actor_level || '').trim() === String(user.level || '').trim()
    && String(approval.actor_division || '').trim() === String(user.division || '').trim();
}

async function activePersistedUser(txDb, actorId) {
  const id = positiveEvidenceId(actorId);
  if (!id) return null;
  const user = await txDb.get(
    'SELECT id, name, role, level, division, is_active FROM users WHERE id = $1 FOR UPDATE',
    [id],
  );
  if (!user || user.is_active === false || user.is_active === 0 || String(user.is_active).toLowerCase() === 'false') return null;
  if (!String(user.name || '').trim() || !String(user.role || '').trim() || !String(user.level || '').trim() || !String(user.division || '').trim()) return null;
  return user;
}

function actorPolicyAllows(action, actor, context = {}) {
  try {
    assertAllowed(action, actor, context);
    return true;
  } catch {
    return false;
  }
}

function hasAllCanonicalFields(type, snapshot) {
  const fields = SNAPSHOT_SCHEMAS[type]?.fields;
  return Boolean(fields && snapshot && fields.every((field) => Object.prototype.hasOwnProperty.call(snapshot, field)));
}

export async function validatePersistedEvidence(txDb, caseRow, options = {}) {
  const missing_gates = [];
  const mustahikId = caseRow.id;
  const stage = resolveCaseStage(caseRow.status);

  // 1. Terminal cases cannot be certified
  if (stage === 'terminal') {
    throw new P0Error('TERMINAL_CASE_IMMUTABLE', 'Kasus terminal tidak dapat direkonsiliasi.', { status: 409 });
  }

  // 2. Early cases (direct switch with audit event)
  if (stage === 'early') {
    const startLog = await txDb.get(
      "SELECT id FROM activity_logs WHERE mustahik_id = $1 AND action_type = 'RECONCILIATION_START' LIMIT 1",
      [mustahikId],
    );
    if (!startLog) {
      missing_gates.push('MISSING_RECONCILIATION_START_AUDIT');
    }
    if (missing_gates.length > 0) {
      throw new P0Error('RECONCILIATION_EVIDENCE_INCOMPLETE', `Bukti rekonsiliasi tidak lengkap: ${missing_gates.join(', ')}`, {
        status: 422,
        details: { missing_gates },
      });
    }
    return { stage, missing_gates };
  }

  // 3. Survey / Assessment stage:
  // - Accepted P0 assessment revision
  // - Canonical snapshot hash
  // - Actor evidence
  const assessment = await txDb.get(
    "SELECT id, revision, application_id, snapshot_json, snapshot_hash, status, source, mustahik_id, created_by_id, updated_by_id FROM assessments WHERE mustahik_id = $1 AND source = 'p0' AND status = 'accepted' ORDER BY revision DESC, id DESC LIMIT 1 FOR UPDATE",
    [mustahikId],
  );
  if (!assessment) {
    missing_gates.push('MISSING_ACCEPTED_ASSESSMENT');
  } else {
    if (!canonicalEvidence('assessment', assessment, mustahikId)) {
      missing_gates.push('INVALID_ASSESSMENT_HASH');
    }
    if (!positiveEvidenceId(assessment.application_id)) {
      missing_gates.push('MISSING_APPLICATION_ID');
    }
    const assessmentApprovals = await txDb.all(
      "SELECT id, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash FROM artifact_approvals WHERE mustahik_id = $1 AND artifact_type = 'assessment' AND artifact_id = $2 AND artifact_revision = $3 ORDER BY id ASC FOR UPDATE",
      [mustahikId, assessment.id, assessment.revision],
    );
    if (!assessmentApprovals || assessmentApprovals.length === 0) {
      missing_gates.push('MISSING_ASSESSMENT_ACTOR_EVIDENCE');
    } else {
      const assessmentSubmitterId = assessmentApprovals.find((approval) => approval.approval_step === 'submit' && approval.action === 'submit')?.actor_id
        ?? assessment.updated_by_id
        ?? null;
      let validActor = false;
      for (const appr of assessmentApprovals) {
        if (appr.approval_step !== 'review' || appr.action !== 'approve' || String(appr.snapshot_hash || '').toLowerCase() !== String(assessment.snapshot_hash || '').toLowerCase()) continue;
        const actor = await txDb.get('SELECT id, name, role, level, division, is_active FROM users WHERE id = $1 FOR UPDATE', [appr.actor_id]);
        if (await persistedActorMatchesUser(txDb, appr)
          && actorPolicyAllows(ACTIONS.ASSESSMENT_REVIEW, actor, {
            creator_id: assessment.created_by_id,
            submitter_id: assessmentSubmitterId,
          })) {
          validActor = true;
          break;
        }
      }
      if (!validActor) {
        missing_gates.push('INVALID_ASSESSMENT_ACTOR_EVIDENCE');
      }
    }
  }

  if (stage === 'survey') {
    if (missing_gates.length > 0) {
      throw new P0Error('RECONCILIATION_EVIDENCE_INCOMPLETE', `Bukti rekonsiliasi tidak lengkap: ${missing_gates.join(', ')}`, {
        status: 422,
        details: { missing_gates },
      });
    }
    return { stage, missing_gates, assessment };
  }

  // 4. Persetujuan MPZIS stage:
  // - All above
  // - Submitted/approved P0 MPZIS revision
  // - All five ordered distinct actor approvals on one hash
  const mpzis = await txDb.get(
    "SELECT id, revision, application_id, snapshot_json, snapshot_hash, status, source, mustahik_id FROM mpzis WHERE mustahik_id = $1 AND source = 'p0' AND status IN ('approved', 'submitted') ORDER BY revision DESC, id DESC LIMIT 1 FOR UPDATE",
    [mustahikId],
  );
  if (!mpzis) {
    missing_gates.push('MISSING_MPZIS');
  } else {
    let mpzisCreatedById = null;
    let mpzisSubmittedById = null;
    try {
      const identity = await txDb.get('SELECT created_by_id, submitted_by_id FROM mpzis WHERE id = $1 FOR UPDATE', [mpzis.id]);
      mpzisCreatedById = identity?.created_by_id ?? null;
      mpzisSubmittedById = identity?.submitted_by_id ?? null;
    } catch {
      // Older disposable fixtures omit these additive provenance columns.
    }
    if (!canonicalEvidence('mpzis', mpzis, mustahikId)) {
      missing_gates.push('INVALID_MPZIS_HASH');
    }
    if (!positiveEvidenceId(mpzis.application_id)
      || (assessment && Number(mpzis.application_id) !== Number(assessment.application_id))) {
      missing_gates.push('MPZIS_APPLICATION_LINK_MISMATCH');
    }
    const mpzisApprovals = await txDb.all(
      "SELECT id, approval_step, action, actor_id, actor_name, actor_role, actor_level, actor_division, snapshot_hash FROM artifact_approvals WHERE mustahik_id = $1 AND artifact_type = 'mpzis' AND artifact_id = $2 AND artifact_revision = $3 ORDER BY id ASC FOR UPDATE",
      [mustahikId, mpzis.id, mpzis.revision],
    );
    const requiredMpzisSteps = ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'];
    const approvalMap = new Map();
    const actorIds = [];
    const orderedSteps = [];
    let invalidActor = false;

    for (const appr of mpzisApprovals || []) {
      if (appr.action !== 'approve' || String(appr.snapshot_hash || '').toLowerCase() !== String(mpzis.snapshot_hash || '').toLowerCase()) continue;
      const actor = await txDb.get('SELECT id, name, role, level, division, is_active FROM users WHERE id = $1 FOR UPDATE', [appr.actor_id]);
      if (!await persistedActorMatchesUser(txDb, appr)
        || (positiveEvidenceId(mpzisCreatedById) && positiveEvidenceId(mpzisSubmittedById)
          && !actorPolicyAllows(ACTIONS.MPZIS_APPROVE, actor, {
            creator_id: mpzisCreatedById,
            submitter_id: mpzisSubmittedById,
            used_actor_ids: (mpzisApprovals || []).filter((candidate) => Number(candidate.actor_id) !== Number(appr.actor_id)).map((candidate) => Number(candidate.actor_id)),
            step: appr.approval_step,
          }))) invalidActor = true;
      orderedSteps.push(appr.approval_step);
      if (!approvalMap.has(appr.approval_step)) {
        approvalMap.set(appr.approval_step, appr);
        actorIds.push(Number(appr.actor_id));
      }
    }

    const missingSteps = requiredMpzisSteps.filter((s) => !approvalMap.has(s));
    if (missingSteps.length > 0) {
      missing_gates.push(`INCOMPLETE_MPZIS_STEPS:${missingSteps.join(',')}`);
    }
    const ordered = orderedSteps.length === requiredMpzisSteps.length
      && requiredMpzisSteps.every((step, index) => orderedSteps[index] === step);
    if (!ordered) {
      missing_gates.push('UNORDERED_MPZIS_APPROVALS');
    }
    const distinctActors = new Set(actorIds.filter((id) => Number.isSafeInteger(id) && id > 0));
    if (distinctActors.size < requiredMpzisSteps.length) {
      missing_gates.push('DUPLICATE_OR_INVALID_MPZIS_ACTORS');
    }
    if (invalidActor) {
      missing_gates.push('DUPLICATE_OR_INVALID_MPZIS_ACTORS');
    }
    if ((positiveEvidenceId(mpzisCreatedById) && actorIds.some((id) => id === Number(mpzisCreatedById)))
      || (positiveEvidenceId(mpzisSubmittedById) && actorIds.some((id) => id === Number(mpzisSubmittedById)))) {
      missing_gates.push('DUPLICATE_OR_INVALID_MPZIS_ACTORS');
    }
    const mpzisSnapshot = canonicalEvidence('mpzis', mpzis, mustahikId);
    if (assessment && mpzisSnapshot && (
      Number(mpzisSnapshot.json.accepted_assessment_id) !== Number(assessment.id)
      || Number(mpzisSnapshot.json.accepted_assessment_revision) !== Number(assessment.revision)
      || String(mpzisSnapshot.json.accepted_assessment_hash || '').toLowerCase() !== String(assessment.snapshot_hash || '').toLowerCase()
    )) {
      missing_gates.push('MPZIS_ASSESSMENT_LINK_MISMATCH');
    }
  }

  if (stage === 'mpzis') {
    if (missing_gates.length > 0) {
      throw new P0Error('RECONCILIATION_EVIDENCE_INCOMPLETE', `Bukti rekonsiliasi tidak lengkap: ${missing_gates.join(', ')}`, {
        status: 422,
        details: { missing_gates },
      });
    }
    return { stage, missing_gates, assessment, mpzis };
  }

  // 5. Pengajuan Dana / finance stages:
  // - All above
  // - Submitted PPD/RAB hash
  // - Finance check and distinct finance approval
  let financeCheck = null;
  let financeApprove = null;
  const ppd = await txDb.get(
    "SELECT id, revision, application_id, snapshot_json, snapshot_hash, status, source, amount, transaction_number, mpzis_id, created_by_id, mustahik_id FROM ppd WHERE mustahik_id = $1 AND source = 'p0' ORDER BY revision DESC, id DESC LIMIT 1 FOR UPDATE",
    [mustahikId],
  );
  if (!ppd) {
    missing_gates.push('MISSING_PPD');
  } else {
    const acceptablePpdStatuses = stage === 'payment'
      ? new Set(['payment_verified', 'recipient_confirmed', 'completed'])
      : new Set(['submitted', 'finance_checked', 'finance_approved', 'payment_recorded', 'payment_verified', 'recipient_confirmed', 'completed']);
    if (!acceptablePpdStatuses.has(String(ppd.status || '').toLowerCase())) {
      missing_gates.push('INVALID_PPD_STATUS');
    }
    if (!positiveEvidenceId(ppd.application_id)
      || (assessment && Number(ppd.application_id) !== Number(assessment.application_id))
      || (mpzis && Number(ppd.application_id) !== Number(mpzis.application_id))) {
      missing_gates.push('PPD_APPLICATION_LINK_MISMATCH');
    }
    if (!canonicalEvidence('ppd', ppd, mustahikId)) {
      missing_gates.push('INVALID_PPD_HASH');
    }
    if (!mpzis || !positiveEvidenceId(ppd.mpzis_id) || Number(ppd.mpzis_id) !== Number(mpzis.id)) {
      missing_gates.push('PPD_MPZIS_LINK_MISMATCH');
    }
    const ppdSnapshot = canonicalEvidence('ppd', ppd, mustahikId);
    if (mpzis && ppdSnapshot && (
      Number(ppdSnapshot.json.approved_mpzis_id) !== Number(mpzis.id)
      || Number(ppdSnapshot.json.approved_mpzis_revision) !== Number(mpzis.revision)
      || String(ppdSnapshot.json.approved_mpzis_hash || '').toLowerCase() !== String(mpzis.snapshot_hash || '').toLowerCase()
    )) {
      missing_gates.push('PPD_MPZIS_LINK_MISMATCH');
    }
    const financeApprovals = await txDb.all(
      "SELECT id, mustahik_id, action, actor_id, actor_name, actor_role, actor_level, actor_division, artifact_revision, snapshot_hash FROM artifact_approvals WHERE mustahik_id = $1 AND artifact_type = 'ppd' AND artifact_id = $2 AND artifact_revision = $3 AND action IN ('finance_check', 'finance_approve') ORDER BY id ASC FOR UPDATE",
      [mustahikId, ppd.id, ppd.revision],
    );
    const financeChecks = (financeApprovals || []).filter((a) => a.action === 'finance_check');
    const financeApproves = (financeApprovals || []).filter((a) => a.action === 'finance_approve');
    financeCheck = financeChecks[0] || null;
    financeApprove = financeApproves[0] || null;

    if (!financeCheck) missing_gates.push('MISSING_FINANCE_CHECK');
    if (!financeApprove) missing_gates.push('MISSING_FINANCE_APPROVE');
    if (financeChecks.length !== 1 || financeApproves.length !== 1) missing_gates.push('DUPLICATE_FINANCE_APPROVALS');
    if (financeCheck && financeApprove) {
      if (String(financeCheck.snapshot_hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase() || String(financeApprove.snapshot_hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase()) {
        missing_gates.push('FINANCE_HASH_MISMATCH');
      }
      if (Number(financeCheck.id) >= Number(financeApprove.id)) {
        missing_gates.push('UNORDERED_FINANCE_APPROVALS');
      }
      if (!positiveEvidenceId(financeCheck.actor_id) || !positiveEvidenceId(financeApprove.actor_id) || Number(financeCheck.actor_id) === Number(financeApprove.actor_id)) {
        missing_gates.push('COLLIDING_FINANCE_ACTORS');
      }
      const financeCheckerUser = await activePersistedUser(txDb, financeCheck.actor_id);
      const financeApproverUser = await activePersistedUser(txDb, financeApprove.actor_id);
      if (!await persistedActorMatchesUser(txDb, financeCheck)
        || !await persistedActorMatchesUser(txDb, financeApprove)
        || !actorPolicyAllows(ACTIONS.FINANCE_CHECK, financeCheckerUser, { creator_id: ppd.created_by_id, approver_id: financeApprove.actor_id })
        || !actorPolicyAllows(ACTIONS.FINANCE_APPROVE, financeApproverUser, { creator_id: ppd.created_by_id, checker_id: financeCheck.actor_id })) {
        missing_gates.push('INVALID_FINANCE_ACTORS');
      }
      if (positiveEvidenceId(ppd.created_by_id)
        && (Number(ppd.created_by_id) === Number(financeCheck.actor_id) || Number(ppd.created_by_id) === Number(financeApprove.actor_id))) {
        missing_gates.push('COLLIDING_FINANCE_ACTORS');
      }
    }
  }

  if (stage === 'finance') {
    if (missing_gates.length > 0) {
      throw new P0Error('RECONCILIATION_EVIDENCE_INCOMPLETE', `Bukti rekonsiliasi tidak lengkap: ${missing_gates.join(', ')}`, {
        status: 422,
        details: { missing_gates },
      });
    }
    return { stage, missing_gates, assessment, mpzis, ppd };
  }

  // 6. Payment / confirmation / completion stage:
  // - All above
  // - Payment proof/hash, verified amount/reference by distinct actor
  // - Recipient confirmation
  // - Completion evidence
  if (ppd) {
    const payment = await txDb.get(
      "SELECT id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, recorded_by_id, verification_status, verified_by_id, snapshot_json, snapshot_hash FROM ppd_payments WHERE ppd_id = $1 FOR UPDATE",
      [ppd.id],
    );
    if (!payment) {
      missing_gates.push('MISSING_PAYMENT');
    } else {
      if (payment.verification_status !== 'verified') {
        missing_gates.push('UNVERIFIED_PAYMENT');
      }
      if (
        !Number.isSafeInteger(Number(payment.recorded_by_id)) ||
        Number(payment.recorded_by_id) < 1 ||
        !Number.isSafeInteger(Number(payment.verified_by_id)) ||
        Number(payment.verified_by_id) < 1 ||
        Number(payment.recorded_by_id) === Number(payment.verified_by_id)
      ) {
        missing_gates.push('COLLIDING_OR_MISSING_PAYMENT_ACTORS');
      }
      const paymentRecorderUser = await activePersistedUser(txDb, payment.recorded_by_id);
      const paymentVerifierUser = await activePersistedUser(txDb, payment.verified_by_id);
      if (!paymentRecorderUser
        || !paymentVerifierUser
        || !actorPolicyAllows(ACTIONS.PAYMENT_RECORD, paymentRecorderUser, { creator_id: ppd.created_by_id })
        || !actorPolicyAllows(ACTIONS.PAYMENT_VERIFY, paymentVerifierUser, { recorder_id: payment.recorded_by_id })) {
        missing_gates.push('INVALID_PAYMENT_ACTORS');
      }
      if (!String(payment.transaction_number || '').trim()) {
        missing_gates.push('MISSING_PAYMENT_TRANSACTION_NUMBER');
      }
      if (!Number.isFinite(Number(payment.paid_amount)) || Number(payment.paid_amount) <= 0) {
        missing_gates.push('INVALID_PAYMENT_AMOUNT');
      }
      if (!positiveEvidenceId(payment.proof_file_id)) {
        missing_gates.push('MISSING_PAYMENT_PROOF_FILE');
      }
      const paymentSnapshot = canonicalEvidence('payment', { ...payment, application_id: ppd.application_id }, mustahikId, 1);
      if (
        !paymentSnapshot
        || Number(paymentSnapshot.json.ppd_id) !== Number(ppd.id)
        || Number(paymentSnapshot.json.ppd_revision) !== Number(ppd.revision)
        || String(paymentSnapshot.json.ppd_hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase()
        || String(paymentSnapshot.json.transaction_number || '').trim() !== String(payment.transaction_number || '').trim()
        || String(payment.transaction_number || '').trim() !== String(ppd.transaction_number || '').trim()
        || !sameMoney(paymentSnapshot.json.paid_amount, payment.paid_amount)
        || !sameMoney(paymentSnapshot.json.paid_amount, ppd.amount)
        || Number(paymentSnapshot.json.proof_file_id) !== Number(payment.proof_file_id)
      ) {
        missing_gates.push('INVALID_PAYMENT_HASH');
      }
      const proofFile = positiveEvidenceId(payment.proof_file_id)
        ? await txDb.get(
          "SELECT id, mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, mime_type, byte_size, sha256 FROM artifact_files WHERE id = $1 FOR UPDATE",
          [payment.proof_file_id],
        )
        : null;
      if (
        !proofFile
        || proofFile.artifact_type !== 'ppd'
        || proofFile.kind !== 'payment_proof'
        || Number(proofFile.mustahik_id) !== Number(mustahikId)
        || Number(proofFile.artifact_id) !== Number(ppd.id)
        || Number(proofFile.artifact_revision) !== Number(ppd.revision)
        || !positiveEvidenceId(proofFile.id)
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(String(proofFile.stored_name || ''))
        || String(proofFile.stored_name || '').includes('..')
        || !/^[a-f0-9]{64}$/i.test(String(proofFile.sha256 || '').trim())
        || !paymentSnapshot
        || String(paymentSnapshot.json.proof_sha256 || '').toLowerCase() !== String(proofFile.sha256 || '').trim().toLowerCase()
        || String(paymentSnapshot.json.proof_mime_type || '').trim() !== String(proofFile.mime_type || '').trim()
        || Number(paymentSnapshot.json.proof_byte_size) !== Number(proofFile.byte_size)
      ) {
        missing_gates.push('INVALID_PAYMENT_PROOF');
      }
      if (options.artifactRoot && proofFile) {
        try {
          const actualProof = await fileHash(proofFile, options.artifactRoot);
          if (actualProof.hash.toLowerCase() !== String(proofFile.sha256 || '').trim().toLowerCase()) {
            missing_gates.push('INVALID_PAYMENT_PROOF');
          }
        } catch {
          missing_gates.push('INVALID_PAYMENT_PROOF');
        }
      }
    }

    const confirmation = await txDb.get(
      "SELECT id, ppd_id, method, recipient_name_snapshot, confirmed_at, note, evidence_file_id, recorded_by_id, snapshot_json, snapshot_hash FROM recipient_confirmations WHERE ppd_id = $1 FOR UPDATE",
      [ppd.id],
    );
    if (!confirmation) {
      missing_gates.push('MISSING_RECIPIENT_CONFIRMATION');
    } else {
      if (!positiveEvidenceId(confirmation.recorded_by_id)) {
        missing_gates.push('COLLIDING_OR_MISSING_RECIPIENT_ACTOR');
      }
      const recipientUser = await activePersistedUser(txDb, confirmation.recorded_by_id);
      if (!recipientUser || !actorPolicyAllows(ACTIONS.RECIPIENT_CONFIRM, recipientUser)) {
        missing_gates.push('INVALID_RECIPIENT_ACTOR');
      }
      if (payment && (Number(confirmation.recorded_by_id) === Number(payment.recorded_by_id)
        || Number(confirmation.recorded_by_id) === Number(payment.verified_by_id))) {
        missing_gates.push('COLLIDING_OR_MISSING_RECIPIENT_ACTOR');
      }
      const confirmationSnapshot = canonicalEvidence(
        'recipient_confirmation',
        { ...confirmation, application_id: ppd.application_id },
        mustahikId,
        1,
      );
      if (
        !confirmationSnapshot
        || Number(confirmationSnapshot.json.ppd_id) !== Number(ppd.id)
        || Number(confirmationSnapshot.json.ppd_revision) !== Number(ppd.revision)
        || String(confirmationSnapshot.json.ppd_hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase()
        || String(confirmationSnapshot.json.recipient_name_snapshot || '').trim() !== String(confirmation.recipient_name_snapshot || '').trim()
      ) {
        missing_gates.push('INVALID_RECIPIENT_CONFIRMATION_HASH');
      }
      if (confirmationSnapshot
        && Number(confirmationSnapshot.json.evidence_file_id || 0) !== Number(confirmation.evidence_file_id || 0)) {
        missing_gates.push('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE');
      }
      if (confirmation.evidence_file_id) {
        const confirmationEvidence = await txDb.get(
          "SELECT id, mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, mime_type, byte_size, sha256 FROM artifact_files WHERE id = $1 FOR UPDATE",
          [confirmation.evidence_file_id],
        );
        if (!confirmationEvidence
          || confirmationEvidence.artifact_type !== 'ppd'
          || confirmationEvidence.kind !== 'recipient_confirmation'
          || Number(confirmationEvidence.mustahik_id) !== Number(mustahikId)
          || Number(confirmationEvidence.artifact_id) !== Number(ppd.id)
          || Number(confirmationEvidence.artifact_revision) !== Number(ppd.revision)
          || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(String(confirmationEvidence.stored_name || ''))
          || String(confirmationEvidence.stored_name || '').includes('..')
          || !/^[a-f0-9]{64}$/i.test(String(confirmationEvidence.sha256 || '').trim())
          || !confirmationSnapshot
          || Number(confirmationSnapshot.json.evidence_file_id) !== Number(confirmation.evidence_file_id)
          || String(confirmationSnapshot.json.evidence_sha256 || '').toLowerCase() !== String(confirmationEvidence.sha256 || '').trim().toLowerCase()
          || String(confirmationSnapshot.json.evidence_mime_type || '').trim() !== String(confirmationEvidence.mime_type || '').trim()
          || Number(confirmationSnapshot.json.evidence_byte_size) !== Number(confirmationEvidence.byte_size)) {
          missing_gates.push('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE');
        }
        if (options.artifactRoot && confirmationEvidence) {
          try {
            const actualEvidence = await fileHash(confirmationEvidence, options.artifactRoot);
            if (actualEvidence.hash.toLowerCase() !== String(confirmationEvidence.sha256 || '').trim().toLowerCase()) {
              missing_gates.push('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE');
            }
          } catch {
            missing_gates.push('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE');
          }
        }
      }
    }

    const completionApproval = await txDb.get(
      "SELECT id, artifact_revision, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division, action, completion_hash, completion_snapshot_json FROM artifact_approvals WHERE mustahik_id = $1 AND artifact_type = 'ppd' AND artifact_id = $2 AND action = 'complete' ORDER BY id ASC LIMIT 1 FOR UPDATE",
      [mustahikId, ppd.id],
    );
    if (!completionApproval) {
      missing_gates.push('MISSING_COMPLETION_EVIDENCE');
    } else {
      if (Number(completionApproval.artifact_revision) !== Number(ppd.revision)
        || String(completionApproval.snapshot_hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase()) {
        missing_gates.push('INVALID_COMPLETION_EVIDENCE');
      }
      const completionSnapshot = parsePersistedSnapshot(completionApproval.completion_snapshot_json);
      let canonicalCompletion = null;
      try {
        canonicalCompletion = completionSnapshot ? createSnapshot('completion', completionSnapshot) : null;
      } catch {
        canonicalCompletion = null;
      }
      if (!canonicalCompletion
        || String(completionApproval.completion_hash || '').toLowerCase() !== canonicalCompletion.hash.toLowerCase()
        || canonicalCompletion.json.artifact_type !== 'completion'
        || Number(canonicalCompletion.json.id) !== Number(ppd.id)
        || Number(canonicalCompletion.json.revision) !== Number(ppd.revision)
        || Number(canonicalCompletion.json.mustahik_id) !== Number(mustahikId)
        || Number(canonicalCompletion.json.application_id) !== Number(ppd.application_id)
        || Number(canonicalCompletion.json.ppd?.id) !== Number(ppd.id)
        || Number(canonicalCompletion.json.ppd?.revision) !== Number(ppd.revision)
        || String(canonicalCompletion.json.ppd?.hash || '').toLowerCase() !== String(ppd.snapshot_hash || '').toLowerCase()
        || Number(canonicalCompletion.json.assessment?.id) !== Number(assessment?.id)
        || Number(canonicalCompletion.json.assessment?.revision) !== Number(assessment?.revision)
        || String(canonicalCompletion.json.assessment?.hash || '').toLowerCase() !== String(assessment?.snapshot_hash || '').toLowerCase()
        || Number(canonicalCompletion.json.mpzis?.id) !== Number(mpzis?.id)
        || Number(canonicalCompletion.json.mpzis?.revision) !== Number(mpzis?.revision)
        || String(canonicalCompletion.json.mpzis?.hash || '').toLowerCase() !== String(mpzis?.snapshot_hash || '').toLowerCase()
        || Number(canonicalCompletion.json.payment?.id) !== Number(payment?.id)
        || Number(canonicalCompletion.json.payment?.revision) !== 1
        || String(canonicalCompletion.json.payment?.hash || '').toLowerCase() !== String(payment?.snapshot_hash || '').toLowerCase()
        || Number(canonicalCompletion.json.recipient_confirmation?.id) !== Number(confirmation?.id)
        || Number(canonicalCompletion.json.recipient_confirmation?.revision) !== 1
        || String(canonicalCompletion.json.recipient_confirmation?.hash || '').toLowerCase() !== String(confirmation?.snapshot_hash || '').toLowerCase()
        || !Array.isArray(canonicalCompletion.json.finance_event_ids)
        || canonicalCompletion.json.finance_event_ids.length !== 2
        || !financeCheck
        || !financeApprove
        || canonicalCompletion.json.finance_event_ids.map(Number).join(',')
          !== [financeCheck.id, financeApprove.id].map(Number).join(',')
      ) {
        missing_gates.push('INVALID_COMPLETION_EVIDENCE');
      }
      if (!positiveEvidenceId(completionApproval.actor_id)
        || (payment && Number(completionApproval.actor_id) === Number(payment.recorded_by_id))
        || (payment && Number(completionApproval.actor_id) === Number(payment.verified_by_id))
        || (confirmation && Number(completionApproval.actor_id) === Number(confirmation.recorded_by_id))
        || (financeCheck && Number(completionApproval.actor_id) === Number(financeCheck.actor_id))
        || (financeApprove && Number(completionApproval.actor_id) === Number(financeApprove.actor_id))
        || (positiveEvidenceId(ppd.created_by_id) && Number(completionApproval.actor_id) === Number(ppd.created_by_id))
        || (positiveEvidenceId(options.actorId) && Number(completionApproval.actor_id) === Number(options.actorId))) {
        missing_gates.push('COLLIDING_OR_MISSING_COMPLETION_ACTOR');
      }
      const completionUser = await activePersistedUser(txDb, completionApproval.actor_id);
      if (!completionUser
        || !await persistedActorMatchesUser(txDb, completionApproval)
        || !actorPolicyAllows(ACTIONS.COMPLETE, completionUser)) {
        missing_gates.push('INVALID_COMPLETION_ACTOR');
      }
      const completionActorIds = [
        ppd.created_by_id,
        financeCheck?.actor_id,
        financeApprove?.actor_id,
        payment?.recorded_by_id,
        payment?.verified_by_id,
        confirmation?.recorded_by_id,
        completionApproval.actor_id,
        options.actorId,
      ].map(positiveEvidenceId).filter(Boolean).map(Number);
      if (new Set(completionActorIds).size !== completionActorIds.length) {
        missing_gates.push('COLLIDING_OR_MISSING_COMPLETION_ACTOR');
      }
    }
  }

  if (missing_gates.length > 0) {
    throw new P0Error('RECONCILIATION_EVIDENCE_INCOMPLETE', `Bukti rekonsiliasi tidak lengkap: ${missing_gates.join(', ')}`, {
      status: 422,
      details: { missing_gates },
    });
  }

  return { stage, missing_gates };
}

export async function beginLegacyReconciliation(context, mustahikId, payload = {}, meta = {}) {
  const actor = normalizeAdminActor(context);
  const { reason, expected_status, expected_version, idempotency_key } = validateReconciliationMeta(meta, payload);
  const numericId = Number(mustahikId);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
  }
  const db = context.db || context.txDb || await getDb();

  return runWithTx(db, async (txDb) => {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        action: 'reconcile_start',
        case_id: numericId,
        reason,
        expected_status,
        expected_version,
        actor_id: actor.id,
      }))
      .digest('hex');

    const reservation = await reserveIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      request_hash: requestHash,
    });

    if (reservation.replayed) {
      return { ...reservation.response, replayed: true };
    }

    const caseRow = await txDb.get(
      'SELECT id, status, workflow_mode, workflow_version, legacy_status_snapshot FROM mustahik WHERE id = $1 FOR UPDATE',
      [numericId],
    );

    if (!caseRow) throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });

    const classification = classifyLegacyCase(caseRow);
    if (classification.read_only) {
      throw new P0Error('TERMINAL_CASE_IMMUTABLE', 'Kasus terminal tidak dapat direkonsiliasi.', { status: 409 });
    }

    if (caseRow.status !== expected_status) {
      throw new P0Error('STALE_STATE', 'Case status is stale.', { status: 409 });
    }

    if (Number(caseRow.workflow_version) !== expected_version) {
      throw new P0Error('STALE_STATE', 'Case workflow version is stale.', { status: 409 });
    }

    if (caseRow.workflow_mode === 'p0') {
      throw new P0Error('WRONG_STATE', 'Kasus sudah dalam mode P0.', { status: 409 });
    }

    const now = context.now ? new Date(context.now) : new Date();
    const newVersion = Number(caseRow.workflow_version || 0) + 1;

    if (classification.can_direct_switch) {
      const updateResult = await txDb.query(
        'UPDATE mustahik SET workflow_mode = $1, workflow_version = $2, legacy_status_snapshot = $3, p0_reconciled_by = $4, p0_reconciled_at = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 AND workflow_version = $7',
        ['p0', newVersion, caseRow.status, actor.id, now.toISOString(), numericId, caseRow.workflow_version],
      );
      const affected = updateResult.rowCount ?? updateResult.rows?.length ?? 0;
      if (affected !== 1) {
        throw new P0Error('CONCURRENCY_CONFLICT', 'Gagal memulai rekonsiliasi: versi kasus telah berubah.', { status: 409 });
      }
    } else {
      const updateResult = await txDb.query(
        'UPDATE mustahik SET workflow_mode = $1, legacy_status_snapshot = $2, p0_reconciled_by = $3, workflow_version = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND workflow_version = $6',
        ['legacy_reconciliation', caseRow.status, actor.id, newVersion, numericId, caseRow.workflow_version],
      );
      const affected = updateResult.rowCount ?? updateResult.rows?.length ?? 0;
      if (affected !== 1) {
        throw new P0Error('CONCURRENCY_CONFLICT', 'Gagal memulai rekonsiliasi: versi kasus telah berubah.', { status: 409 });
      }
    }

    await insertActivity(txDb, {
      mustahik_id: numericId,
      actor,
      action_type: 'RECONCILIATION_START',
      title: 'Rekonsiliasi P0 Dimulai',
      description: reason,
      old_status: caseRow.status,
      new_status: caseRow.status,
      correlation_id: context.correlation_id || meta.correlation_id,
    });

    const response = {
      success: true,
      data: {
        id: numericId,
        workflow_mode: classification.can_direct_switch ? 'p0' : 'legacy_reconciliation',
        legacy_status_snapshot: caseRow.status,
        workflow_version: newVersion,
      },
      replayed: false,
    };

    await completeIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      response,
    });

    return response;
  });
}

export async function completeLegacyReconciliation(context, mustahikId, payload = {}, meta = {}) {
  const actor = normalizeAdminActor(context);
  const { reason, expected_status, expected_version, idempotency_key } = validateReconciliationMeta(meta, payload);
  const numericId = Number(mustahikId);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
  }
  const db = context.db || context.txDb || await getDb();

  return runWithTx(db, async (txDb) => {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        action: 'reconcile_complete',
        case_id: numericId,
        reason,
        expected_status,
        expected_version,
        actor_id: actor.id,
      }))
      .digest('hex');

    const reservation = await reserveIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      request_hash: requestHash,
    });

    if (reservation.replayed) {
      return { ...reservation.response, replayed: true };
    }

    const caseRow = await txDb.get(
      'SELECT id, status, workflow_mode, workflow_version, legacy_status_snapshot FROM mustahik WHERE id = $1 FOR UPDATE',
      [numericId],
    );

    if (!caseRow) throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });

    const classification = classifyLegacyCase(caseRow);
    if (classification.read_only) {
      throw new P0Error('TERMINAL_CASE_IMMUTABLE', 'Kasus terminal tidak dapat direkonsiliasi.', { status: 409 });
    }

    if (caseRow.workflow_mode !== 'legacy_reconciliation') {
      throw new P0Error('WRONG_STATE', 'Data mustahik tidak dalam status rekonsiliasi.', { status: 409 });
    }

    if (caseRow.status !== expected_status) {
      throw new P0Error('STALE_STATE', 'Case status is stale.', { status: 409 });
    }

    if (Number(caseRow.workflow_version) !== expected_version) {
      throw new P0Error('STALE_STATE', 'Case workflow version is stale.', { status: 409 });
    }

    // Status changed since begin
    if (caseRow.legacy_status_snapshot && caseRow.status !== caseRow.legacy_status_snapshot) {
      throw new P0Error('CONCURRENCY_CONFLICT', 'Status kasus telah berubah sejak rekonsiliasi dimulai.', { status: 409 });
    }

    // Validate complete persisted evidence
    await validatePersistedEvidence(txDb, caseRow, { artifactRoot: context.artifactRoot, actorId: actor.id });

    const now = context.now ? new Date(context.now) : new Date();
    const newVersion = Number(caseRow.workflow_version || 0) + 1;

    const updateResult = await txDb.query(
      'UPDATE mustahik SET workflow_mode = $1, p0_reconciled_at = $2, p0_reconciled_by = $3, workflow_version = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 AND workflow_version = $6',
      ['p0', now.toISOString(), actor.id, newVersion, numericId, caseRow.workflow_version],
    );

    const affected = updateResult.rowCount ?? updateResult.rows?.length ?? 0;
    if (affected !== 1) {
      throw new P0Error('CONCURRENCY_CONFLICT', 'Gagal menyelesaikan rekonsiliasi: versi kasus telah berubah.', { status: 409 });
    }

    await insertActivity(txDb, {
      mustahik_id: numericId,
      actor,
      action_type: 'RECONCILIATION_COMPLETE',
      title: 'Rekonsiliasi P0 Selesai',
      description: reason,
      old_status: caseRow.status,
      new_status: caseRow.status,
      correlation_id: context.correlation_id || meta.correlation_id,
    });

    const response = {
      success: true,
      data: {
        id: numericId,
        workflow_mode: 'p0',
        p0_reconciled_at: now.toISOString(),
        workflow_version: newVersion,
      },
      replayed: false,
    };

    await completeIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      response,
    });

    return response;
  });
}

// ==========================================
// 7. Admin Artifact Step Recovery Override
// ==========================================

const ALLOWED_RECOVERY_STEPS = {
  assessment: new Set(['create', 'update', 'submit', 'review']),
  mpzis: new Set(['create', 'update', 'submit', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved']),
  ppd: new Set(['create', 'update', 'submit', 'finance_check', 'finance_approve', 'payment_recorded', 'payment_verified', 'recipient_confirmed', 'complete']),
};

const ARTIFACT_TABLE_MAP = {
  assessment: 'assessments',
  mpzis: 'mpzis',
  ppd: 'ppd',
};

function recoveryActionFor(artifactType, step) {
  if (artifactType === 'assessment') {
    return {
      create: ACTIONS.ASSESSMENT_CREATE,
      update: ACTIONS.ASSESSMENT_UPDATE,
      submit: ACTIONS.ASSESSMENT_SUBMIT,
      review: ACTIONS.ASSESSMENT_REVIEW,
    }[step];
  }
  if (artifactType === 'mpzis') {
    if (['create', 'update', 'submit'].includes(step)) return {
      create: ACTIONS.MPZIS_CREATE,
      update: ACTIONS.MPZIS_UPDATE,
      submit: ACTIONS.MPZIS_SUBMIT,
    }[step];
    return ACTIONS.MPZIS_APPROVE;
  }
  if (artifactType === 'ppd') {
    return {
      create: ACTIONS.PPD_CREATE,
      update: ACTIONS.PPD_UPDATE,
      submit: ACTIONS.PPD_SUBMIT,
      finance_check: ACTIONS.FINANCE_CHECK,
      finance_approve: ACTIONS.FINANCE_APPROVE,
      payment_recorded: ACTIONS.PAYMENT_RECORD,
      payment_verified: ACTIONS.PAYMENT_VERIFY,
      recipient_confirmed: ACTIONS.RECIPIENT_CONFIRM,
      complete: ACTIONS.COMPLETE,
    }[step];
  }
  return null;
}

function recoveryPolicyContext(artifactType, artifact, step, priorApprovals) {
  const creatorId = positiveEvidenceId(artifact?.created_by_id);
  const submitterId = positiveEvidenceId(artifact?.submitted_by_id);
  const prior = (priorApprovals || []).filter((approval) => positiveEvidenceId(approval.actor_id));
  if (artifactType === 'mpzis') {
    return {
      creator_id: creatorId,
      submitter_id: submitterId,
      used_actor_ids: prior.map((approval) => Number(approval.actor_id)),
      step,
    };
  }
  if (step === 'finance_check') return { creator_id: creatorId, approver_id: prior.find((approval) => approval.action === 'finance_approve')?.actor_id };
  if (step === 'finance_approve') return { creator_id: creatorId, checker_id: prior.find((approval) => approval.action === 'finance_check')?.actor_id };
  if (step === 'payment_recorded') return { creator_id: creatorId };
  if (step === 'payment_verified') return { recorder_id: prior.find((approval) => approval.action === 'payment_recorded')?.actor_id };
  if (step === 'review') return { submitter_id: prior.find((approval) => approval.action === 'submit')?.actor_id };
  return {};
}

export async function recoverArtifactStep(context, { artifactType, artifactId, revision, step }, payload = {}, meta = {}) {
  const actor = normalizeAdminActor(context);

  // 1. Artifact type validation
  if (!artifactType || !ALLOWED_RECOVERY_STEPS[artifactType] || artifactType === 'case') {
    throw new P0Error('INVALID_ARTIFACT_TYPE', 'Tipe artefak tidak valid.', { status: 400 });
  }

  // 2. Step validation
  if (!step || !ALLOWED_RECOVERY_STEPS[artifactType].has(step)) {
    throw new P0Error('INVALID_RECOVERY_STEP', `Step ${step} tidak valid untuk tipe artefak ${artifactType}.`, { status: 400 });
  }

  // 3. Reason validation
  const reason = validateReason({ note: payload.reason || meta.override_reason || meta.reason || payload.note || meta.note });

  // 4. Mustahik ID validation
  const rawMustahikId = payload.mustahik_id ?? meta.mustahik_id ?? payload.mustahikId ?? meta.mustahikId;
  const numericMustahikId = Number(rawMustahikId);
  if (!Number.isSafeInteger(numericMustahikId) || numericMustahikId < 1) {
    throw new P0Error('FIELD_REQUIRED', 'mustahik_id wajib diisi dengan integer positif.', { status: 400 });
  }

  // 5. Expected snapshot hash validation
  const rawExpectedHash = payload.expected_snapshot_hash ?? meta.expected_snapshot_hash;
  if (typeof rawExpectedHash !== 'string' || !rawExpectedHash.trim()) {
    throw new P0Error('FIELD_REQUIRED', 'expected_snapshot_hash wajib diisi.', { status: 400 });
  }
  const expected_snapshot_hash = rawExpectedHash.trim();
  if (!/^[a-f0-9]{64}$/i.test(expected_snapshot_hash)) {
    throw new P0Error('FIELD_INVALID', 'expected_snapshot_hash harus berupa 64 karakter hex SHA-256.', { status: 400 });
  }

  // 6. Idempotency key validation
  const idempotency_key = (typeof meta.idempotency_key === 'string' && meta.idempotency_key.trim())
    || (typeof payload.idempotency_key === 'string' && payload.idempotency_key.trim());
  if (!idempotency_key) {
    throw new P0Error('FIELD_REQUIRED', 'idempotency_key wajib diisi.', { status: 400 });
  }

  // 7. Assumed actor validation
  const rawAssumedActorId = payload.assumed_actor_id ?? meta.assumed_actor_id ?? payload.actor_id ?? meta.actor_id;
  const assumed_actor_id = Number(rawAssumedActorId);
  if (!Number.isSafeInteger(assumed_actor_id) || assumed_actor_id < 1) {
    throw new P0Error('FIELD_REQUIRED', 'assumed_actor_id wajib diisi.', { status: 400 });
  }

  if (assumed_actor_id === actor.id) {
    throw new P0Error('ACTOR_SEPARATION', 'Admin tidak boleh menjadi aktor yang diasumsikan.', { status: 403 });
  }

  const numericArtifactId = Number(artifactId);
  const numericRevision = Number(revision);
  if (!Number.isSafeInteger(numericArtifactId) || numericArtifactId < 1) {
    throw new P0Error('FIELD_INVALID', 'artifactId tidak valid.', { status: 400 });
  }
  if (!Number.isSafeInteger(numericRevision) || numericRevision < 1) {
    throw new P0Error('FIELD_INVALID', 'revision tidak valid.', { status: 400 });
  }

  const db = context.db || context.txDb || await getDb();

  return runWithTx(db, async (txDb) => {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        action: 'recover_artifact_step',
        artifactType,
        artifactId: numericArtifactId,
        revision: numericRevision,
        step,
        mustahik_id: numericMustahikId,
        expected_snapshot_hash,
        assumed_actor_id,
        reason,
        admin_id: actor.id,
      }))
      .digest('hex');

    const reservation = await reserveIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      request_hash: requestHash,
    });

    if (reservation.replayed) {
      return { ...reservation.response, replayed: true };
    }

    // Load assumed actor from users table
    const assumedUser = await txDb.get(
      'SELECT id, name, email, role, level, division, is_active FROM users WHERE id = $1',
      [assumed_actor_id],
    );
    if (!assumedUser) {
      throw new P0Error('ACTOR_NOT_FOUND', 'Aktor yang diasumsikan tidak ditemukan.', { status: 404 });
    }
    if (assumedUser.is_active === false || assumedUser.is_active === 0 || String(assumedUser.is_active).toLowerCase() === 'false') {
      throw new P0Error('ACTOR_INACTIVE', 'Aktor yang diasumsikan tidak aktif.', { status: 403 });
    }
    if (![assumedUser.name, assumedUser.role, assumedUser.level, assumedUser.division].every((value) => String(value || '').trim())) {
      throw new P0Error('ACTOR_INVALID', 'Snapshot peran aktor yang diasumsikan tidak lengkap.', { status: 403 });
    }

    // Load canonical artifact under lock
    const tableName = ARTIFACT_TABLE_MAP[artifactType];
    const artifact = await txDb.get(
      `SELECT * FROM ${tableName} WHERE id = $1 FOR UPDATE`,
      [numericArtifactId],
    );
    if (!artifact) {
      throw new P0Error('ARTIFACT_NOT_FOUND', 'Artefak tidak ditemukan.', { status: 404 });
    }

    // Verify mustahik scope
    if (Number(artifact.mustahik_id) !== numericMustahikId) {
      throw new P0Error('ARTIFACT_SCOPE_MISMATCH', 'Artefak tidak sesuai dengan kasus mustahik.', { status: 409 });
    }

    // Verify revision
    if (Number(artifact.revision) !== numericRevision) {
      throw new P0Error('STALE_ARTIFACT', 'Revisi artefak telah berubah.', { status: 409 });
    }

    // Verify source is p0
    if (artifact.source !== 'p0') {
      throw new P0Error('LEGACY_ARTIFACT_IMMUTABLE', 'Artefak legacy tidak dapat dipulihkan melalui recovery P0.', { status: 409 });
    }

    // Verify expected hash against stored hash
    if (String(artifact.snapshot_hash || '').trim().toLowerCase() !== expected_snapshot_hash.toLowerCase()) {
      throw new P0Error('STALE_ARTIFACT', 'Hash snapshot artefak tidak sesuai dengan expected_snapshot_hash.', { status: 409 });
    }

    // Recovery is only safe when the immutable canonical bytes are present;
    // a hash without its snapshot is unverifiable and must fail closed.
    try {
      const parsed = parsePersistedSnapshot(artifact.snapshot_json);
      if (!parsed || parsed.artifact_type !== artifactType
        || Number(parsed.id) !== Number(artifact.id)
        || Number(parsed.revision) !== Number(artifact.revision)
        || Number(parsed.mustahik_id) !== numericMustahikId
        || (parsed.application_id ?? null) !== (artifact.application_id ?? null)
        || parsed.source !== 'p0'
        || !hasAllCanonicalFields(artifactType, parsed)) {
        throw new P0Error('ARTIFACT_HASH_TAMPERED', 'Snapshot kanonikal artefak tidak lengkap atau stale.', { status: 409 });
      }
      const recomputed = createSnapshot(artifactType, parsed);
      if (recomputed.hash.toLowerCase() !== String(artifact.snapshot_hash || '').trim().toLowerCase()) {
        throw new P0Error('ARTIFACT_HASH_TAMPERED', 'Hash kanonikal artefak tidak valid.', { status: 409 });
      }
    } catch (err) {
      if (err instanceof P0Error) throw err;
      throw new P0Error('ARTIFACT_HASH_TAMPERED', 'Gagal memvalidasi snapshot kanonikal artefak.', { status: 409 });
    }

    // Actor collision check with creator
    if (artifact.created_by_id && Number(assumedUser.id) === Number(artifact.created_by_id)) {
      throw new P0Error('ACTOR_SEPARATION', 'Aktor yang diasumsikan tidak boleh sama dengan pembuat artefak.', { status: 403 });
    }
    if (artifactType === 'mpzis' && artifact.submitted_by_id && Number(assumedUser.id) === Number(artifact.submitted_by_id)) {
      throw new P0Error('ACTOR_SEPARATION', 'Aktor yang diasumsikan tidak boleh sama dengan pengirim MPZIS.', { status: 403 });
    }

    // Load prior approvals on this artifact
    const priorApprovals = await txDb.all(
      'SELECT id, actor_id, approval_step, action FROM artifact_approvals WHERE artifact_type = $1 AND artifact_id = $2 AND artifact_revision = $3 FOR UPDATE',
      [artifactType, numericArtifactId, numericRevision],
    );

    // Cannot duplicate the same step approval
    if (priorApprovals.some((a) => a.approval_step === step && a.action === step)) {
      throw new P0Error('DUPLICATE_APPROVAL', 'Persetujuan untuk langkah ini sudah tercatat.', { status: 409 });
    }

    // Actor separation checks
    if (artifactType === 'mpzis') {
      if (priorApprovals.some((a) => Number(a.actor_id) === Number(assumedUser.id))) {
        throw new P0Error('ACTOR_SEPARATION', 'Aktor telah memberikan persetujuan pada langkah MPZIS lain.', { status: 403 });
      }
    } else if (artifactType === 'ppd' && step === 'finance_approve') {
      if (priorApprovals.some((a) => a.action === 'finance_check' && Number(a.actor_id) === Number(assumedUser.id))) {
        throw new P0Error('ACTOR_SEPARATION', 'Checker dan approver keuangan harus berbeda.', { status: 403 });
      }
    }

    const recoveryAction = recoveryActionFor(artifactType, step);
    const policyContext = recoveryPolicyContext(artifactType, artifact, step, priorApprovals);
    if (recoveryAction) {
      assertAllowed(recoveryAction, {
        id: assumedUser.id,
        name: assumedUser.name,
        role: assumedUser.role,
        level: assumedUser.level,
        division: assumedUser.division,
      }, policyContext);
    }

    const assumedActorSnapshot = {
      id: assumedUser.id,
      name: assumedUser.name,
      role: assumedUser.role,
      level: assumedUser.level || 'staff',
      division: assumedUser.division || 'Penyaluran',
    };

    const approval = await insertArtifactApproval(txDb, {
      mustahik_id: numericMustahikId,
      artifact_type: artifactType,
      artifact_id: numericArtifactId,
      artifact_revision: numericRevision,
      approval_step: step,
      action: step,
      snapshot_hash: artifact.snapshot_hash,
      note: reason,
      actor: assumedActorSnapshot,
      is_admin_override: true,
      override_reason: reason,
      correlation_id: context.correlation_id || meta.correlation_id,
    });

    await insertActivity(txDb, {
      mustahik_id: numericMustahikId,
      actor,
      action_type: 'ADMIN_RECOVERY_OVERRIDE',
      title: `Recovery Override: ${artifactType} ${step}`,
      description: `Admin ${actor.name} melakukan recovery override dengan asumsi aktor ${assumedUser.name} (${assumedUser.id}): ${reason}`,
      correlation_id: context.correlation_id || meta.correlation_id,
    });

    const response = {
      success: true,
      data: approval,
      replayed: false,
    };

    await completeIdempotencyKey(txDb, {
      actor_id: actor.id,
      idempotency_key,
      response,
    });

    return response;
  });
}
