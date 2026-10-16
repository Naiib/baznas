import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_PENERIMAAN_STATUSES,
  validatePenerimaanTransition,
  validateTransition,
  requiresLeaderApproval,
  PENERIMAAN_ACTIONS,
} from './penerimaan-service.js';

test('validateTransition is exported as alias for validatePenerimaanTransition', () => {
  assert.equal(validateTransition, validatePenerimaanTransition);
});

test('canonical statuses contains all required statuses from rebuild plan', () => {
  const expected = [
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
  ];

  for (const status of expected) {
    assert.ok(
      CANONICAL_PENERIMAAN_STATUSES.includes(status),
      `Expected canonical status to include ${status}`
    );
  }
});

test('requiresLeaderApproval flags manual, high-value, duplicate, incomplete, and flagged items', () => {
  const threshold = 10_000_000;

  // Below threshold, digital
  assert.equal(
    requiresLeaderApproval({ amount: 5_000_000, channel: 'qris', is_manual: false }, threshold),
    false
  );

  // High value (>= 10M)
  assert.equal(
    requiresLeaderApproval({ amount: 10_000_000, channel: 'transfer_bank', is_manual: false }, threshold),
    true
  );

  // Manual transaction
  assert.equal(
    requiresLeaderApproval({ amount: 1_000_000, channel: 'tunai', is_manual: true }, threshold),
    true
  );

  // Flagged risk
  assert.equal(
    requiresLeaderApproval({ amount: 500_000, channel: 'portal', is_risk: true }, threshold),
    true
  );

  // Duplicate flag
  assert.equal(
    requiresLeaderApproval({ amount: 500_000, channel: 'qris', is_duplicate: true }, threshold),
    true
  );
});

test('allows normal digital validation directly to reconciliation queue when below threshold', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff', division: 'penerimaan' };
  const trx = { id: 101, amount: 2_500_000, channel: 'qris', is_manual: false };

  const result = validatePenerimaanTransition({
    currentStatus: 'Menunggu Validasi',
    action: 'validate',
    actor: staff,
    transaction: trx,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.nextStatus, 'Menunggu Rekonsiliasi');
});

test('routes to Menunggu Approval when transaction meets approval criteria', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff', division: 'penerimaan' };
  const trx = { id: 102, amount: 15_000_000, channel: 'transfer_bank', is_manual: false };

  const result = validatePenerimaanTransition({
    currentStatus: 'Menunggu Validasi',
    action: 'validate',
    actor: staff,
    transaction: trx,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.nextStatus, 'Menunggu Approval');
});

test('blocks self-approval: leader cannot approve a transaction they created', () => {
  const leader = { id: 20, role: 'penerimaan', level: 'leader', division: 'penerimaan' };
  const trx = { id: 103, amount: 20_000_000, created_by_id: 20 };

  const result = validatePenerimaanTransition({
    currentStatus: 'Menunggu Approval',
    action: 'approve',
    actor: leader,
    transaction: trx,
  });

  assert.equal(result.allowed, false);
  assert.ok(result.reason.toLowerCase().includes('sendiri'));
});

test('allows leader to approve high-value transaction created by another user', () => {
  const leader = { id: 20, role: 'penerimaan', level: 'leader', division: 'penerimaan' };
  const trx = { id: 104, amount: 20_000_000, created_by_id: 10 };

  const result = validatePenerimaanTransition({
    currentStatus: 'Menunggu Approval',
    action: 'approve',
    actor: leader,
    transaction: trx,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.nextStatus, 'Menunggu Rekonsiliasi');
});

test('allows reconciliation and posting sequence', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff', division: 'penerimaan' };
  const trx = { id: 105, amount: 1_000_000 };

  // Reconcile
  const recResult = validatePenerimaanTransition({
    currentStatus: 'Menunggu Rekonsiliasi',
    action: 'reconcile',
    actor: staff,
    transaction: trx,
  });
  assert.equal(recResult.allowed, true);
  assert.equal(recResult.nextStatus, 'Terekonsiliasi');

  // Post
  const postResult = validatePenerimaanTransition({
    currentStatus: 'Terekonsiliasi',
    action: 'post',
    actor: staff,
    transaction: trx,
  });
  assert.equal(postResult.allowed, true);
  assert.equal(postResult.nextStatus, 'Posted');
});

test('supports reversal of posted records only by authorized roles', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff', division: 'penerimaan' };
  const leader = { id: 20, role: 'penerimaan', level: 'leader', division: 'penerimaan' };
  const trx = { id: 106, amount: 5_000_000 };

  // Staff cannot reverse posted
  const staffReverse = validatePenerimaanTransition({
    currentStatus: 'Posted',
    action: 'reverse',
    actor: staff,
    transaction: trx,
  });
  assert.equal(staffReverse.allowed, false);

  // Leader can reverse posted
  const leaderReverse = validatePenerimaanTransition({
    currentStatus: 'Posted',
    action: 'reverse',
    actor: leader,
    transaction: trx,
  });
  assert.equal(leaderReverse.allowed, true);
  assert.equal(leaderReverse.nextStatus, 'Dibatalkan');
});

test('rejects invalid or unknown transitions', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff', division: 'penerimaan' };
  const trx = { id: 107, amount: 1_000_000 };

  // Cannot post from Ditolak
  const invalidResult = validatePenerimaanTransition({
    currentStatus: 'Ditolak',
    action: 'post',
    actor: staff,
    transaction: trx,
  });
  assert.equal(invalidResult.allowed, false);

  // Unknown action
  const unknownResult = validatePenerimaanTransition({
    currentStatus: 'Menunggu Validasi',
    action: 'unknown_magic_action',
    actor: staff,
    transaction: trx,
  });
  assert.equal(unknownResult.allowed, false);
});
