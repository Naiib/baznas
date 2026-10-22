import { describe, expect, it } from 'vitest';
import { canReviewBothModules } from './module-access';

describe('canReviewBothModules', () => {
  it('allows the server-authorized administrator claim to see both modules', () => {
    expect(canReviewBothModules({ id: 1, name: 'Admin', email: 'admin@example.test', role: 'admin', level: 'admin' })).toBe(true);
    expect(canReviewBothModules({ id: 2, name: 'Lead', email: 'lead@example.test', role: 'penyaluran', level: 'admin' })).toBe(true);
  });

  it('does not expose the switcher to single-module staff or unrelated roles', () => {
    expect(canReviewBothModules({ id: 3, name: 'Amil P', email: 'p@example.test', role: 'penyaluran', level: 'staff', division: 'Penyaluran' })).toBe(false);
    expect(canReviewBothModules({ id: 4, name: 'Amil R', email: 'r@example.test', role: 'penerimaan', level: 'staff', division: 'Penerimaan' })).toBe(false);
    expect(canReviewBothModules({ id: 5, name: 'Other', email: 'x@example.test', role: 'sdm' })).toBe(false);
    expect(canReviewBothModules(null)).toBe(false);
  });

});
