export const ROLE = Object.freeze({
  ADMIN: 'admin',
  PENYALURAN: 'penyaluran',
  SURVEYOR: 'surveyor',
  PENERIMAAN: 'penerimaan',
  KEUANGAN: 'keuangan',
});

const permissions = Object.freeze({
  'master-data:write': [ROLE.ADMIN],
  'mustahik:read': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR, ROLE.KEUANGAN],
  'mustahik:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'mustahik:decision': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'assessment:write': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'mpzis:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'ppd:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'finance:write': [ROLE.KEUANGAN],
  'payment:write': [ROLE.KEUANGAN],
  'document:write': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'laporan:export': [ROLE.ADMIN, ROLE.PENYALURAN],
  'audit:read': [ROLE.ADMIN],
  'penerimaan:read': [ROLE.ADMIN, ROLE.PENERIMAAN],
  'penerimaan:write': [ROLE.ADMIN, ROLE.PENERIMAAN],
  'penerimaan:decision': [ROLE.ADMIN, ROLE.PENERIMAAN],
  'penerimaan:export': [ROLE.ADMIN, ROLE.PENERIMAAN],
});

const REPOSITORY_DEFAULT_JWT_SECRET = 'baznas_tangkot_super_secret_jwt_key_2026';
const EXAMPLE_JWT_SECRET = 'change-me-in-production';
const DEVELOPMENT_JWT_SECRET = 'development-only-jwt-secret';

export function canAccess(role, permission) {
  const normalizedRole = normalizeAccessValue(role);
  return Boolean(normalizedRole && permissions[permission]?.includes(normalizedRole));
}

function normalizeAccessValue(value) {
  return String(value || '').trim().toLowerCase();
}

/** Normalize the representations shared by JWT actors and UI sessions. */
export function normalizeAccessActor(user = {}) {
  const role = normalizeAccessValue(user.role);
  const level = normalizeAccessValue(user.level);
  const division = normalizeAccessValue(user.division);
  return {
    role,
    level,
    division,
    isAdmin: role === ROLE.ADMIN || level === ROLE.ADMIN,
    isPenerimaan: role === ROLE.PENERIMAAN || division.includes('penerimaan') || division.includes('pengumpulan'),
    isPenyaluran: role === ROLE.PENYALURAN || division.includes('penyaluran') || division.includes('pendistribusian'),
  };
}

export function actorCanAccess(user, allowedRoles = []) {
  const actor = normalizeAccessActor(user);
  const normalizedAllowed = allowedRoles.map(normalizeAccessValue);
  if (actor.isAdmin) return true;
  if (normalizedAllowed.includes(actor.role) || normalizedAllowed.includes(actor.level)) return true;
  if (normalizedAllowed.includes(ROLE.PENERIMAAN) && actor.isPenerimaan) return true;
  if (normalizedAllowed.includes(ROLE.PENYALURAN) && actor.isPenyaluran) return true;
  return false;
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Tidak terotentikasi' });
  }
  return next();
}

export function requireAnyRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return requireAuth(req, res, next);
    }
    if (actorCanAccess(req.user, allowedRoles)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Akses dibatasi. Fitur ini memerlukan hak akses divisi: ${allowedRoles.join(', ')}`
    });
  };
}

export function requireProductionSecret({ jwtSecret = process.env.JWT_SECRET, nodeEnv = process.env.NODE_ENV } = {}) {
  const isUnsafeSecret = !jwtSecret ||
    jwtSecret === REPOSITORY_DEFAULT_JWT_SECRET ||
    jwtSecret === EXAMPLE_JWT_SECRET ||
    jwtSecret === DEVELOPMENT_JWT_SECRET;

  if (nodeEnv === 'production' && isUnsafeSecret) {
    throw new Error('JWT_SECRET must be set to a non-example secret in production.');
  }

  return jwtSecret || DEVELOPMENT_JWT_SECRET;
}
