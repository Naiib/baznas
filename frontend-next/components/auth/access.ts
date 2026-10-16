export type AccessActor = {
  role?: string | null;
  level?: string | null;
  division?: string | null;
};

export type NormalizedAccessActor = AccessActor & {
  role: string;
  level: string;
  division: string;
  isAdmin: boolean;
  isPenerimaan: boolean;
  isPenyaluran: boolean;
};

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** Keep UI authorization semantics aligned with server/access-policy.js. */
export function normalizeAccessActor(user: AccessActor | null | undefined): NormalizedAccessActor {
  const role = normalize(user?.role);
  const level = normalize(user?.level);
  const division = normalize(user?.division);
  return {
    ...(user || {}),
    role,
    level,
    division,
    isAdmin: role === 'admin' || level === 'admin',
    isPenerimaan: role === 'penerimaan' || division.includes('penerimaan') || division.includes('pengumpulan'),
    isPenyaluran: role === 'penyaluran' || division.includes('penyaluran') || division.includes('pendistribusian'),
  };
}

export function canAccessActor(user: AccessActor | null | undefined, allowedRoles: string[] = []): boolean {
  const actor = normalizeAccessActor(user);
  const allowed = allowedRoles.map(normalize);
  if (actor.isAdmin) return true;
  if (allowed.includes(actor.role) || allowed.includes(actor.level)) return true;
  if (allowed.includes('penerimaan') && actor.isPenerimaan) return true;
  if (allowed.includes('penyaluran') && actor.isPenyaluran) return true;
  return false;
}
