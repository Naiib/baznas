import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePenerimaanAuthority,
  requiresLeaderApproval,
  canApproveTransaction,
  canReverseTransaction,
  canCloseReconciliationBatch,
  canManagePenerimaanSettings,
  DEFAULT_APPROVAL_THRESHOLD,
} from './penerimaan-permissions.js';

test('resolvePenerimaanAuthority resolves admin with full authority and bypass', () => {
  const authority = resolvePenerimaanAuthority({
    id: 1,
    role: 'admin',
    name: 'Administrator',
  });

  assert.deepEqual(authority, {
    division: 'penerimaan',
    level: 'admin',
    canApprove: true,
    canReverse: true,
    canManageSettings: true,
    canCloseBatch: true,
  });
});

test('resolvePenerimaanAuthority resolves Penerimaan leader with approval and reversal authority', () => {
  const authority = resolvePenerimaanAuthority({
    id: 2,
    role: 'penerimaan',
    division: 'Divisi Penerimaan',
    level: 'leader',
    name: 'Kepala Penerimaan',
  });

  assert.deepEqual(authority, {
    division: 'penerimaan',
    level: 'leader',
    canApprove: true,
    canReverse: true,
    canManageSettings: false,
    canCloseBatch: true,
  });
});

test('resolvePenerimaanAuthority resolves Penerimaan staff as executor without approval or reversal rights', () => {
  const authority = resolvePenerimaanAuthority({
    id: 3,
    role: 'penerimaan',
    division: 'Divisi Penerimaan',
    level: 'staff',
    name: 'Staff Penerimaan',
  });

  assert.deepEqual(authority, {
    division: 'penerimaan',
    level: 'staff',
    canApprove: false,
    canReverse: false,
    canManageSettings: false,
    canCloseBatch: false,
  });
});

test('resolvePenerimaanAuthority blocks users from other divisions', () => {
  const authority = resolvePenerimaanAuthority({
    id: 4,
    role: 'penyaluran',
    division: 'Divisi Penyaluran',
    level: 'leader',
  });

  assert.deepEqual(authority, {
    division: 'other',
    level: 'none',
    canApprove: false,
    canReverse: false,
    canManageSettings: false,
    canCloseBatch: false,
  });
});

test('requiresLeaderApproval detects high-value, manual, duplicate, incomplete, and flagged transactions', () => {
  // Normal digital below threshold -> false
  assert.equal(
    requiresLeaderApproval({ amount: 5_000_000, is_manual: false, channel: 'qris' }),
    false
  );

  // Amount at default threshold (Rp10.000.000) -> true
  assert.equal(
    requiresLeaderApproval({ amount: DEFAULT_APPROVAL_THRESHOLD }),
    true
  );

  // Amount above custom settings threshold -> true
  assert.equal(
    requiresLeaderApproval({ amount: 2_000_000 }, { threshold: 1_000_000 }),
    true
  );

  // Manual transaction -> true even for small amounts
  assert.equal(
    requiresLeaderApproval({ amount: 100_000, is_manual: true }),
    true
  );

  // Flagged, duplicate, or incomplete -> true
  assert.equal(requiresLeaderApproval({ amount: 50_000, is_flagged: true }), true);
  assert.equal(requiresLeaderApproval({ amount: 50_000, is_duplicate: true }), true);
  assert.equal(requiresLeaderApproval({ amount: 50_000, is_incomplete: true }), true);
});

test('canApproveTransaction blocks staff from approving transactions', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff' };
  const tx = { id: 101, status: 'Menunggu Approval', amount: 25_000_000, created_by_id: 20 };

  const decision = canApproveTransaction({ actor: staff, transaction: tx });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /kepala bagian penerimaan atau admin/i);
});

test('canApproveTransaction prevents leader from approving their own created transaction', () => {
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const tx = { id: 102, status: 'Menunggu Approval', amount: 15_000_000, created_by_id: 5 };

  const decision = canApproveTransaction({ actor: leader, transaction: tx });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /sendiri/i);
});

test('canApproveTransaction allows leader to approve a transaction created by another user', () => {
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const tx = { id: 103, status: 'Menunggu Approval', amount: 15_000_000, created_by_id: 12 };

  const decision = canApproveTransaction({ actor: leader, transaction: tx });
  assert.deepEqual(decision, { allowed: true });
});

test('canApproveTransaction allows admin bypass with isAdminBypass flag for audit tracking', () => {
  const admin = { id: 1, role: 'admin', level: 'admin' };
  // Even if admin was the creator
  const tx = { id: 104, status: 'Menunggu Approval', amount: 50_000_000, created_by_id: 1 };

  const decision = canApproveTransaction({ actor: admin, transaction: tx });
  assert.equal(decision.allowed, true);
  assert.equal(decision.isAdminBypass, true);
});

test('canApproveTransaction blocks approval for transactions not in Menunggu Approval status', () => {
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };

  for (const invalidStatus of ['Masuk', 'Menunggu Validasi', 'Draft', 'Posted', 'Ditolak']) {
    const tx = { id: 105, status: invalidStatus, amount: 20_000_000, created_by_id: 12 };

    const leaderDecision = canApproveTransaction({ actor: leader, transaction: tx });
    assert.equal(leaderDecision.allowed, false);
    assert.match(leaderDecision.reason, /hanya dapat dilakukan untuk transaksi Menunggu Approval/i);

    const adminDecision = canApproveTransaction({ actor: admin, transaction: tx });
    assert.equal(adminDecision.allowed, false);
    assert.match(adminDecision.reason, /hanya dapat dilakukan untuk transaksi Menunggu Approval/i);
  }
});

test('canApproveTransaction blocks approval when transaction does not meet approval criteria', () => {
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const txBelowCriteria = {
    id: 106,
    status: 'Menunggu Approval',
    amount: 500_000, // Below default Rp10.000.000 threshold
    is_manual: false,
    is_risk: false,
    is_duplicate: false,
    is_incomplete: false,
    created_by_id: 12,
  };

  const decision = canApproveTransaction({ actor: leader, transaction: txBelowCriteria });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /tidak memenuhi kriteria approval/i);
});

test('canReverseTransaction allows leader and admin, but blocks staff for posted transactions', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff' };
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };
  const postedTx = { id: 201, status: 'Posted' };

  assert.equal(canReverseTransaction({ actor: staff, transaction: postedTx }).allowed, false);
  assert.equal(canReverseTransaction({ actor: leader, transaction: postedTx }).allowed, true);
  assert.equal(canReverseTransaction({ actor: admin, transaction: postedTx }).allowed, true);
});

test('canReverseTransaction blocks reversal for non-Posted transactions for staff, leader, and admin', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff' };
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };

  for (const nonPostedStatus of ['Menunggu Validasi', 'Menunggu Approval', 'Masuk', 'Terekonsiliasi', 'Draft', 'Ditolak']) {
    const tx = { id: 202, status: nonPostedStatus };

    const staffRes = canReverseTransaction({ actor: staff, transaction: tx });
    assert.equal(staffRes.allowed, false);
    assert.match(staffRes.reason, /hanya dapat dilakukan untuk transaksi berstatus Posted/i);

    const leaderRes = canReverseTransaction({ actor: leader, transaction: tx });
    assert.equal(leaderRes.allowed, false);
    assert.match(leaderRes.reason, /hanya dapat dilakukan untuk transaksi berstatus Posted/i);

    const adminRes = canReverseTransaction({ actor: admin, transaction: tx });
    assert.equal(adminRes.allowed, false);
    assert.match(adminRes.reason, /hanya dapat dilakukan untuk transaksi berstatus Posted/i);
  }
});

test('canCloseReconciliationBatch allows leader and admin for open batch, but blocks staff', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff' };
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };
  const openBatch = { id: 301, status: 'open' };

  assert.equal(canCloseReconciliationBatch({ actor: staff, batch: openBatch }).allowed, false);
  assert.equal(canCloseReconciliationBatch({ actor: leader, batch: openBatch }).allowed, true);
  assert.equal(canCloseReconciliationBatch({ actor: admin, batch: openBatch }).allowed, true);
});

test('canCloseReconciliationBatch blocks closing a batch that is already closed or finalized', () => {
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };

  const closedBatch = { id: 302, status: 'closed' };
  const finalizedBatch = { id: 303, status: 'finalized' };

  // Leader attempts
  const leaderClosed = canCloseReconciliationBatch({ actor: leader, batch: closedBatch });
  assert.equal(leaderClosed.allowed, false);
  assert.match(leaderClosed.reason, /sudah berstatus closed/i);

  const leaderFinalized = canCloseReconciliationBatch({ actor: leader, batch: finalizedBatch });
  assert.equal(leaderFinalized.allowed, false);
  assert.match(leaderFinalized.reason, /sudah berstatus finalized/i);

  // Admin attempts
  const adminClosed = canCloseReconciliationBatch({ actor: admin, batch: closedBatch });
  assert.equal(adminClosed.allowed, false);
  assert.match(adminClosed.reason, /sudah berstatus closed/i);

  const adminFinalized = canCloseReconciliationBatch({ actor: admin, batch: finalizedBatch });
  assert.equal(adminFinalized.allowed, false);
  assert.match(adminFinalized.reason, /sudah berstatus finalized/i);
});

test('canManagePenerimaanSettings allows only admin', () => {
  const staff = { id: 10, role: 'penerimaan', level: 'staff' };
  const leader = { id: 5, role: 'penerimaan', level: 'leader' };
  const admin = { id: 1, role: 'admin' };

  assert.equal(canManagePenerimaanSettings({ actor: staff }).allowed, false);
  assert.equal(canManagePenerimaanSettings({ actor: leader }).allowed, false);
  assert.equal(canManagePenerimaanSettings({ actor: admin }).allowed, true);
});
