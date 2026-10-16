const PENYALURAN_DIVISION = 'penyaluran';

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolvePenyaluranAuthority(user = {}) {
  if (normalise(user.role) === 'admin') {
    return { division: PENYALURAN_DIVISION, level: 'admin', canApprove: true };
  }

  const division = normalise(user.division).includes('penyaluran') || normalise(user.division).includes('pendistribusian') || normalise(user.role) === 'penyaluran'
    ? PENYALURAN_DIVISION
    : 'other';
  const level = normalise(user.level) === 'leader' ? 'leader' : 'staff';

  return { division, level, canApprove: division === PENYALURAN_DIVISION && level === 'leader' };
}

export function canTransition({ currentStatus, action, actor, preparedById } = {}) {
  const authority = resolvePenyaluranAuthority(actor);
  const isApproval = currentStatus === 'Persetujuan MPZIS' && action === 'approve';

  if (authority.division !== PENYALURAN_DIVISION) {
    return { allowed: false, reason: 'Keputusan ini hanya dapat diproses oleh Divisi Penyaluran.' };
  }

  if (isApproval && !authority.canApprove) {
    return { allowed: false, reason: 'Persetujuan MPZIS hanya dapat dilakukan oleh Kepala Bagian Penyaluran.' };
  }

  if (isApproval && preparedById !== undefined && preparedById !== null && String(preparedById) === String(actor?.id)) {
    return { allowed: false, reason: 'Kepala Bagian tidak dapat menyetujui rekomendasi yang disiapkan sendiri.' };
  }

  return { allowed: true };
}
