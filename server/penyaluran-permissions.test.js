import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  resolvePenyaluranAuthority,
} from './penyaluran-permissions.js';

test('recognises a Penyaluran staff member as an executor, not an approver', () => {
  const authority = resolvePenyaluranAuthority({
    id: 12,
    role: 'penyaluran',
    division: 'Penyaluran',
    level: 'staff',
  });

  assert.deepEqual(authority, {
    division: 'penyaluran',
    level: 'staff',
    canApprove: false,
  });
});

test('blocks staff from approving an MPZIS decision', () => {
  const result = canTransition({
    currentStatus: 'Persetujuan MPZIS',
    action: 'approve',
    actor: { id: 12, role: 'penyaluran', division: 'Penyaluran', level: 'staff' },
    preparedById: 8,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /kepala bagian/i);
});

test('blocks a leader from approving their own prepared recommendation', () => {
  const result = canTransition({
    currentStatus: 'Persetujuan MPZIS',
    action: 'approve',
    actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'leader' },
    preparedById: 7,
  });

  assert.equal(result.allowed, false);
  assert.match(result.reason, /sendiri/i);
});

test('allows a Penyaluran leader to approve a recommendation prepared by another user', () => {
  const result = canTransition({
    currentStatus: 'Persetujuan MPZIS',
    action: 'approve',
    actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'leader' },
    preparedById: 8,
  });

  assert.deepEqual(result, { allowed: true });
});

test('recognises official division Bidang Pendistribusian & Pendayagunaan as Penyaluran authority', () => {
  const leaderAuthority = resolvePenyaluranAuthority({
    id: 2,
    role: 'penyaluran',
    division: 'Bidang Pendistribusian & Pendayagunaan',
    level: 'leader',
  });

  assert.deepEqual(leaderAuthority, {
    division: 'penyaluran',
    level: 'leader',
    canApprove: true,
  });

  const staffAuthority = resolvePenyaluranAuthority({
    id: 1,
    role: 'penyaluran',
    division: 'Bidang Pendistribusian & Pendayagunaan',
    level: 'staff',
  });

  assert.deepEqual(staffAuthority, {
    division: 'penyaluran',
    level: 'staff',
    canApprove: false,
  });
});
