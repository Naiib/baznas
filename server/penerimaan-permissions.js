/**
 * BAZNAS Data Center - Divisi Penerimaan Permissions & Authority Policy
 * Staff, Leader, and Admin role rules, approval policies, and self-approval guards.
 */

export const DEFAULT_APPROVAL_THRESHOLD = 10_000_000; // Rp10.000.000

function normalise(val) {
  return String(val || '').trim().toLowerCase();
}

/**
 * Resolves authority matrix for Penerimaan actors.
 * @param {Object} user
 * @returns {{ division: string, level: string, canApprove: boolean, canReverse: boolean, canManageSettings: boolean, canCloseBatch: boolean }}
 */
export function resolvePenerimaanAuthority(user = {}) {
  const role = normalise(user.role);
  const division = normalise(user.division);
  const level = normalise(user.level);

  if (role === 'admin' || level === 'admin') {
    return {
      division: 'penerimaan',
      level: 'admin',
      canApprove: true,
      canReverse: true,
      canManageSettings: true,
      canCloseBatch: true,
    };
  }

  const isPenerimaan =
    role === 'penerimaan' ||
    division.includes('penerimaan') ||
    division.includes('pengumpulan');

  if (!isPenerimaan) {
    return {
      division: 'other',
      level: 'none',
      canApprove: false,
      canReverse: false,
      canManageSettings: false,
      canCloseBatch: false,
    };
  }

  const isLeader = level === 'leader';
  return {
    division: 'penerimaan',
    level: isLeader ? 'leader' : 'staff',
    canApprove: isLeader,
    canReverse: isLeader,
    canManageSettings: false,
    canCloseBatch: isLeader,
  };
}

/**
 * Determines whether a transaction requires approval from the Leader.
 * Flagged items: amount >= threshold, manual transactions, duplicates, incomplete, risk flags.
 * @param {Object} transaction
 * @param {Object} [settings]
 * @returns {boolean}
 */
export function requiresLeaderApproval(transaction = {}, settings = {}) {
  let thresholdBigInt = BigInt(DEFAULT_APPROVAL_THRESHOLD);
  try {
    if (typeof settings === 'bigint') {
      thresholdBigInt = settings;
    } else if (typeof settings === 'number' && Number.isFinite(settings)) {
      thresholdBigInt = BigInt(Math.trunc(settings));
    } else if (typeof settings === 'string' && /^\d+$/.test(settings.trim())) {
      thresholdBigInt = BigInt(settings.trim());
    } else if (settings && settings.approval_threshold !== undefined && settings.approval_threshold !== null) {
      const raw = String(settings.approval_threshold).trim();
      if (/^\d+$/.test(raw)) thresholdBigInt = BigInt(raw);
    } else if (settings && settings.threshold !== undefined && settings.threshold !== null) {
      const raw = String(settings.threshold).trim();
      if (/^\d+$/.test(raw)) thresholdBigInt = BigInt(raw);
    }
  } catch {
    thresholdBigInt = BigInt(DEFAULT_APPROVAL_THRESHOLD);
  }

  let amountBigInt = 0n;
  try {
    const rawAmt = String(transaction.amount ?? 0).trim();
    if (/^\d+$/.test(rawAmt)) {
      amountBigInt = BigInt(rawAmt);
    } else {
      amountBigInt = BigInt(Math.max(0, Math.trunc(Number(rawAmt) || 0)));
    }
  } catch {
    amountBigInt = 0n;
  }

  if (amountBigInt >= thresholdBigInt) return true;
  if (Boolean(transaction.is_manual)) return true;
  if (Boolean(transaction.is_risk)) return true;
  if (Boolean(transaction.is_duplicate)) return true;
  if (Boolean(transaction.is_incomplete)) return true;
  if (Boolean(transaction.is_flagged || transaction.flagged)) return true;
  if (Boolean(transaction.requires_approval)) return true;

  return false;
}

/**
 * Validates whether an actor can approve a specific Penerimaan transaction.
 * Enforces:
 * 1. Transaction must be in 'Menunggu Approval' status.
 * 2. Transaction must require leader approval (amount >= threshold or risk/manual flags).
 * 3. Actor must belong to Penerimaan division or Admin.
 * 4. Actor must be Leader or Admin.
 * 5. Leader cannot self-approve a transaction they created.
 * 6. Admin bypass is allowed and flagged for audit tracking.
 * @param {{ actor: Object, transaction: Object, settings?: Object }} params
 * @returns {{ allowed: boolean, reason?: string, isAdminBypass?: boolean }}
 */
export function canApproveTransaction({ actor = {}, transaction = {}, settings = {} } = {}) {
  if (transaction?.status !== 'Menunggu Approval') {
    return {
      allowed: false,
      reason: `Approval hanya dapat dilakukan untuk transaksi Menunggu Approval, saat ini: ${transaction?.status || 'tidak diketahui'}.`,
    };
  }

  if (!requiresLeaderApproval(transaction, settings)) {
    return {
      allowed: false,
      reason: 'Transaksi ini tidak memenuhi kriteria approval Kepala Bagian (nominal di bawah threshold dan tidak berisiko/manual/flagged).',
    };
  }

  const authority = resolvePenerimaanAuthority(actor);

  if (authority.division !== 'penerimaan') {
    return {
      allowed: false,
      reason: 'Persetujuan transaksi hanya dapat diproses oleh Divisi Penerimaan atau Admin.',
    };
  }

  if (authority.level === 'admin') {
    return { allowed: true, isAdminBypass: true };
  }

  if (!authority.canApprove) {
    return {
      allowed: false,
      reason: 'Persetujuan transaksi ini memerlukan wewenang Kepala Bagian Penerimaan atau Admin.',
    };
  }

  const creatorId = transaction?.created_by_id ?? transaction?.createdBy;
  if (
    creatorId !== undefined &&
    creatorId !== null &&
    String(creatorId) === String(actor?.id)
  ) {
    return {
      allowed: false,
      reason: 'Kepala Bagian tidak dapat menyetujui transaksi yang dibuat sendiri.',
    };
  }

  return { allowed: true };
}

/**
 * Validates whether an actor can reverse a posted transaction.
 * Enforces:
 * 1. Transaction must be in 'Posted' status.
 * 2. Actor must have reversal authority (Leader or Admin).
 * @param {{ actor: Object, transaction?: Object }} params
 * @returns {{ allowed: boolean, reason?: string, isAdminBypass?: boolean }}
 */
export function canReverseTransaction({ actor = {}, transaction = {} } = {}) {
  if (transaction?.status !== 'Posted') {
    return {
      allowed: false,
      reason: `Koreksi reversal hanya dapat dilakukan untuk transaksi berstatus Posted, saat ini: ${transaction?.status || 'tidak diketahui'}.`,
    };
  }

  const authority = resolvePenerimaanAuthority(actor);

  if (!authority.canReverse) {
    return {
      allowed: false,
      reason: 'Reversal transaksi hanya dapat dilakukan oleh Kepala Bagian Penerimaan atau Admin.',
    };
  }

  if (authority.level === 'admin') {
    return { allowed: true, isAdminBypass: true };
  }

  return { allowed: true };
}

/**
 * Validates whether an actor can close a reconciliation batch.
 * Enforces:
 * 1. Batch must not already be 'closed' or 'finalized'.
 * 2. Actor must have batch-closing authority (Leader or Admin).
 * @param {{ actor: Object, batch?: Object }} params
 * @returns {{ allowed: boolean, reason?: string, isAdminBypass?: boolean }}
 */
export function canCloseReconciliationBatch({ actor = {}, batch = {} } = {}) {
  const batchStatus = normalise(batch?.status);
  if (batchStatus === 'closed' || batchStatus === 'finalized') {
    return {
      allowed: false,
      reason: `Batch rekonsiliasi sudah berstatus ${batch?.status || 'closed'} dan tidak dapat ditutup kembali.`,
    };
  }

  const authority = resolvePenerimaanAuthority(actor);

  if (!authority.canCloseBatch) {
    return {
      allowed: false,
      reason: 'Penutupan batch rekonsiliasi hanya dapat dilakukan oleh Kepala Bagian Penerimaan atau Admin.',
    };
  }

  if (authority.level === 'admin') {
    return { allowed: true, isAdminBypass: true };
  }

  return { allowed: true };
}

/**
 * Validates whether an actor can modify Penerimaan operational settings.
 * Allowed for Admin only.
 * @param {{ actor: Object }} params
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canManagePenerimaanSettings({ actor = {} } = {}) {
  const authority = resolvePenerimaanAuthority(actor);

  if (!authority.canManageSettings) {
    return {
      allowed: false,
      reason: 'Pengaturan operasional Penerimaan hanya dapat diubah oleh Admin.',
    };
  }

  return { allowed: true };
}

/**
 * Validates whether an actor can view Penerimaan reports and dashboards.
 * Allowed for Penerimaan staff, Leader, and Admin.
 * @param {{ actor: Object }} params
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canViewPenerimaanReport({ actor = {} } = {}) {
  const authority = resolvePenerimaanAuthority(actor);
  if (authority.division !== 'penerimaan' && authority.level !== 'admin') {
    return {
      allowed: false,
      reason: 'Akses laporan penerimaan terbatas hanya untuk divisi Penerimaan atau Admin.',
    };
  }
  return { allowed: true };
}

/**
 * Validates whether an actor can export Penerimaan reports (PDF/Excel).
 * Allowed for Penerimaan staff, Leader, and Admin.
 * @param {{ actor: Object }} params
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canExportPenerimaanReport({ actor = {} } = {}) {
  return canViewPenerimaanReport({ actor });
}
