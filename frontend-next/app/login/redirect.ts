import type { CurrentUser } from '@/lib/api/types';
import { normalizeAccessActor, type AccessActor } from '@/components/auth/access';

type Workspace = 'penerimaan' | 'penyaluran';
type LoginDestination = Workspace | 'public';

const LOGIN_ORIGIN = 'https://baznas.local';

function destinationForPath(pathname: string): LoginDestination | null {
  if (pathname === '/' || pathname === '/cek-pengajuan' || pathname === '/pengajuan') {
    return 'public';
  }
  if (pathname === '/penerimaan' || pathname.startsWith('/penerimaan/')) {
    return 'penerimaan';
  }
  if (pathname === '/penyaluran' || pathname.startsWith('/penyaluran/')) {
    return 'penyaluran';
  }
  return null;
}

function workspaceForRole(user: AccessActor): Workspace | null {
  const actor = normalizeAccessActor(user);
  if (actor.isPenerimaan) return 'penerimaan';
  if (actor.isAdmin || actor.role === 'penyaluran' || actor.role === 'surveyor' || actor.role === 'keuangan') {
    return 'penyaluran';
  }
  return null;
}

export function getPostLoginRedirect(user: Pick<CurrentUser, 'role' | 'level' | 'division'>, nextPath?: string | null) {
  const requestedPath = String(nextPath || '').trim();
  const actor = normalizeAccessActor(user);
  const roleWorkspace = workspaceForRole(actor);

  if (
    requestedPath.startsWith('/')
    && !requestedPath.startsWith('//')
    && !/[\\\u0000-\u001f\u007f]/.test(requestedPath)
    && !/%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(requestedPath)
  ) {
    try {
      const parsedPath = new URL(requestedPath, LOGIN_ORIGIN);
      const destination = destinationForPath(parsedPath.pathname);
      const isCompatible = destination === 'public'
        || (roleWorkspace && destination === roleWorkspace)
        || (actor.isAdmin && destination);

      if (parsedPath.origin === LOGIN_ORIGIN && destination && isCompatible) {
        return `${parsedPath.pathname}${parsedPath.search}${parsedPath.hash}`;
      }
    } catch {
      // Fall through to the role's known-safe landing page.
    }
  }

  if (roleWorkspace === 'penerimaan') return '/penerimaan';
  if (roleWorkspace === 'penyaluran') {
    if (actor.role === 'keuangan') return '/penyaluran/mustahik';
    return '/penyaluran';
  }
  return '/';
}
