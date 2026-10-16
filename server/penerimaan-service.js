/**
 * BAZNAS Data Center - Divisi Penerimaan Domain Service
 * Handles state machine transitions, canonical statuses, risk checks, and authority rules.
 */

import {
  DEFAULT_APPROVAL_THRESHOLD,
  resolvePenerimaanAuthority,
  requiresLeaderApproval,
  canApproveTransaction,
  canReverseTransaction,
} from './penerimaan-permissions.js';

export {
  DEFAULT_APPROVAL_THRESHOLD,
  resolvePenerimaanAuthority,
  requiresLeaderApproval,
  canApproveTransaction,
  canReverseTransaction,
};

export const CANONICAL_PENERIMAAN_STATUSES = Object.freeze([
  'Masuk',
  'Menunggu Validasi',
  'Terverifikasi',
  'Menunggu Approval',
  'Menunggu Rekonsiliasi',
  'Terekonsiliasi',
  'Posted',
  'Ditolak',
  'Duplikat',
  'Data Tidak Lengkap',
  'Perlu Klarifikasi',
  'Dispute',
  'Dibatalkan',
]);

export const PENERIMAAN_ACTIONS = Object.freeze({
  VALIDATE: 'validate',
  APPROVE: 'approve',
  REJECT: 'reject',
  MARK_DUPLICATE: 'mark_duplicate',
  MARK_INCOMPLETE: 'mark_incomplete',
  REQUEST_CLARIFICATION: 'request_clarification',
  RESOLVE_CLARIFICATION: 'resolve_clarification',
  RECONCILE: 'reconcile',
  POST: 'post',
  DISPUTE: 'dispute',
  RESOLVE_DISPUTE: 'resolve_dispute',
  CANCEL: 'cancel',
  REVERSE: 'reverse',
});

/**
 * Validates state transitions for Penerimaan transactions.
 * Returns { allowed: boolean, nextStatus?: string, reason?: string }
 */
export function validatePenerimaanTransition({
  currentStatus,
  action,
  actor = {},
  transaction = {},
  threshold = DEFAULT_APPROVAL_THRESHOLD,
  settings,
}) {
  if (!CANONICAL_PENERIMAAN_STATUSES.includes(currentStatus)) {
    return { allowed: false, reason: `Status saat ini tidak valid: ${currentStatus}` };
  }

  const authority = resolvePenerimaanAuthority(actor);
  if (authority.division !== 'penerimaan') {
    return { allowed: false, reason: 'Aksi ini hanya dapat diproses oleh Divisi Penerimaan atau Admin.' };
  }

  const effectivePolicy = settings || threshold;

  switch (action) {
    case PENERIMAAN_ACTIONS.VALIDATE: {
      if (!['Masuk', 'Menunggu Validasi', 'Terverifikasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Validasi tidak dapat dilakukan dari status: ${currentStatus}` };
      }

      if (requiresLeaderApproval(transaction, effectivePolicy)) {
        return { allowed: true, nextStatus: 'Menunggu Approval' };
      }
      return { allowed: true, nextStatus: 'Menunggu Rekonsiliasi' };
    }

    case PENERIMAAN_ACTIONS.APPROVE: {
      if (currentStatus !== 'Menunggu Approval') {
        return { allowed: false, reason: `Approval hanya dapat dilakukan untuk transaksi Menunggu Approval, saat ini: ${currentStatus}` };
      }

      if (!authority.canApprove) {
        return { allowed: false, reason: 'Persetujuan transaksi berisiko/nominal besar hanya dapat dilakukan oleh Kepala Bagian Penerimaan atau Admin.' };
      }

      const creatorId = transaction.created_by_id ?? transaction.createdBy;
      if (creatorId !== undefined && creatorId !== null && String(creatorId) === String(actor.id) && authority.level !== 'admin') {
        return { allowed: false, reason: 'Kepala Bagian tidak boleh menyetujui transaksi yang dibuat sendiri.' };
      }

      return { allowed: true, nextStatus: 'Menunggu Rekonsiliasi' };
    }

    case PENERIMAAN_ACTIONS.REJECT: {
      if (!['Masuk', 'Menunggu Validasi', 'Menunggu Approval', 'Data Tidak Lengkap', 'Perlu Klarifikasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Penolakan tidak dapat dilakukan dari status: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Ditolak' };
    }

    case PENERIMAAN_ACTIONS.MARK_DUPLICATE: {
      if (['Posted', 'Ditolak', 'Dibatalkan'].includes(currentStatus)) {
        return { allowed: false, reason: `Transaksi ${currentStatus} tidak dapat ditandai duplikat.` };
      }
      return { allowed: true, nextStatus: 'Duplikat' };
    }

    case PENERIMAAN_ACTIONS.MARK_INCOMPLETE: {
      if (!['Masuk', 'Menunggu Validasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Data tidak lengkap hanya dapat ditandai pada tahap awal validasi.` };
      }
      return { allowed: true, nextStatus: 'Data Tidak Lengkap' };
    }

    case PENERIMAAN_ACTIONS.REQUEST_CLARIFICATION: {
      if (!['Masuk', 'Menunggu Validasi', 'Menunggu Approval'].includes(currentStatus)) {
        return { allowed: false, reason: `Permintaan klarifikasi tidak dapat diajukan dari status: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Perlu Klarifikasi' };
    }

    case PENERIMAAN_ACTIONS.RESOLVE_CLARIFICATION: {
      if (!['Perlu Klarifikasi', 'Data Tidak Lengkap', 'Duplikat'].includes(currentStatus)) {
        return { allowed: false, reason: `Klarifikasi tidak dapat diselesaikan dari status: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Menunggu Validasi' };
    }

    case PENERIMAAN_ACTIONS.RECONCILE: {
      if (currentStatus !== 'Menunggu Rekonsiliasi') {
        return { allowed: false, reason: `Rekonsiliasi hanya dapat dilakukan dari status Menunggu Rekonsiliasi, saat ini: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Terekonsiliasi' };
    }

    case PENERIMAAN_ACTIONS.POST: {
      if (!['Terekonsiliasi', 'Menunggu Rekonsiliasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Posting transaksi hanya dapat dilakukan setelah terekonsiliasi, saat ini: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Posted' };
    }

    case PENERIMAAN_ACTIONS.DISPUTE: {
      if (!['Menunggu Rekonsiliasi', 'Terekonsiliasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Dispute hanya dapat diajukan pada tahap rekonsiliasi, saat ini: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Dispute' };
    }

    case PENERIMAAN_ACTIONS.RESOLVE_DISPUTE: {
      if (currentStatus !== 'Dispute') {
        return { allowed: false, reason: `Penyelesaian dispute hanya dapat dilakukan untuk status Dispute, saat ini: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Menunggu Rekonsiliasi' };
    }

    case PENERIMAAN_ACTIONS.CANCEL: {
      if (!['Masuk', 'Menunggu Validasi', 'Menunggu Approval', 'Data Tidak Lengkap', 'Perlu Klarifikasi'].includes(currentStatus)) {
        return { allowed: false, reason: `Pembatalan tidak diizinkan untuk transaksi berstatus: ${currentStatus}` };
      }
      return { allowed: true, nextStatus: 'Dibatalkan' };
    }

    case PENERIMAAN_ACTIONS.REVERSE: {
      if (currentStatus !== 'Posted') {
        return { allowed: false, reason: `Koreksi reversal hanya dapat dilakukan untuk transaksi berstatus Posted, saat ini: ${currentStatus}` };
      }
      if (!authority.canReverse) {
        return { allowed: false, reason: 'Reversal transaksi yang telah di-post hanya dapat dilakukan oleh Kepala Bagian Penerimaan atau Admin.' };
      }
      return { allowed: true, nextStatus: 'Dibatalkan' };
    }

    default:
      return { allowed: false, reason: `Aksi tidak dikenal: ${action}` };
  }
}

export const validateTransition = validatePenerimaanTransition;
