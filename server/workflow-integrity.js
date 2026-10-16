const PENYALURAN_STATUS_ALIASES = Object.freeze({
  Diajukan: 'Diajukan',
  'Verifikasi Administrasi': 'Verifikasi Administrasi',
  Verifikasi: 'Verifikasi Administrasi',
  Survey: 'Survey',
  'Persetujuan MPZIS': 'Persetujuan MPZIS',
  MPZIS: 'Persetujuan MPZIS',
  'Pengajuan Dana (FPD)': 'Pengajuan Dana (FPD)',
  FPD: 'Pengajuan Dana (FPD)',
  'Pengajuan Dana (PPD)': 'Pengajuan Dana (FPD)',
  PPD: 'Pengajuan Dana (FPD)',
  'Penyaluran Selesai': 'Penyaluran Selesai',
  Selesai: 'Penyaluran Selesai',
  Ditolak: 'Ditolak',
});

const PENYALURAN_WORKFLOW_TRANSITIONS = Object.freeze({
  Diajukan: Object.freeze({ approve: 'Verifikasi Administrasi', reject: 'Ditolak' }),
  'Verifikasi Administrasi': Object.freeze({ approve: 'Survey', reject: 'Ditolak' }),
  Survey: Object.freeze({ approve: 'Persetujuan MPZIS', reject: 'Ditolak' }),
  'Persetujuan MPZIS': Object.freeze({ approve: 'Pengajuan Dana (FPD)', reject: 'Ditolak' }),
  'Pengajuan Dana (FPD)': Object.freeze({ approve: 'Penyaluran Selesai', reject: 'Ditolak' }),
});

function createInvalidWorkflowStatusError(status) {
  const error = new Error(`Status workflow Penyaluran tidak dikenal: ${status}.`);
  error.code = 'INVALID_WORKFLOW_STATUS';
  error.status = 422;
  return error;
}

export function canonicalizePenyaluranStatus(status) {
  const value = String(status || '').trim();
  const canonical = PENYALURAN_STATUS_ALIASES[value];
  if (!canonical) throw createInvalidWorkflowStatusError(status);
  return canonical;
}

function createInvalidWorkflowTransitionError(currentStatus, action, targetStatus) {
  const target = targetStatus === undefined ? '' : ` menuju "${targetStatus}"`;
  const error = new Error(`Transisi workflow tidak diizinkan: ${currentStatus} dengan aksi ${action}${target}.`);
  error.code = 'INVALID_WORKFLOW_TRANSITION';
  error.status = 422;
  return error;
}

export function resolvePenyaluranTransition({ currentStatus, action, targetStatus } = {}) {
  const canonicalCurrentStatus = canonicalizePenyaluranStatus(currentStatus);
  const transitions = PENYALURAN_WORKFLOW_TRANSITIONS[canonicalCurrentStatus];
  const nextStatus = transitions?.[action];

  if (!nextStatus) {
    throw createInvalidWorkflowTransitionError(canonicalCurrentStatus, action, targetStatus);
  }

  if (targetStatus !== undefined) {
    const canonicalTargetStatus = canonicalizePenyaluranStatus(targetStatus);
    if (canonicalTargetStatus !== nextStatus) {
      throw createInvalidWorkflowTransitionError(canonicalCurrentStatus, action, targetStatus);
    }
  }

  return nextStatus;
}

export function createStaleDecisionError() {
  const error = new Error('Berkas telah diperbarui oleh pengguna lain. Muat ulang data sebelum mengambil keputusan.');
  error.code = 'STALE_DECISION';
  error.status = 409;
  return error;
}

export function assertExpectedWorkflowState(current = {}, expected = {}) {
  const currentVersion = Number(current.workflow_version || 0);
  const expectedVersion = Number(expected.expected_version);
  const expectedStatus = String(expected.expected_status || '');

  if (!expectedStatus || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    const error = new Error('Status dan versi berkas wajib dikirim saat mengambil keputusan.');
    error.code = 'INVALID_WORKFLOW_EXPECTATION';
    error.status = 422;
    throw error;
  }

  if (canonicalizePenyaluranStatus(current.status) !== canonicalizePenyaluranStatus(expectedStatus)
    || currentVersion !== expectedVersion) {
    throw createStaleDecisionError();
  }
}
