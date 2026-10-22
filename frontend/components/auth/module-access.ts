import { canAccessActor, type AccessActor } from './access';

/** The switcher is navigation only; both destinations must already be permitted by the session claims. */
export function canReviewBothModules(user: AccessActor | null | undefined): boolean {
  return canAccessActor(user, ['admin', 'penyaluran'])
    && canAccessActor(user, ['admin', 'penerimaan']);
}
