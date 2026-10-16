import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExpectedWorkflowState,
  canonicalizePenyaluranStatus,
  resolvePenyaluranTransition,
} from './workflow-integrity.js';

test('rejects a decision submitted against an outdated workflow state', () => {
  assert.throws(
    () => assertExpectedWorkflowState(
      { status: 'Persetujuan MPZIS', workflow_version: 4 },
      { expected_status: 'Survey', expected_version: 3 },
    ),
    (error) => error.code === 'STALE_DECISION' && error.status === 409,
  );
});

test('accepts a decision submitted against the current workflow state', () => {
  assert.doesNotThrow(() => assertExpectedWorkflowState(
    { status: 'Persetujuan MPZIS', workflow_version: 4 },
    { expected_status: 'Persetujuan MPZIS', expected_version: 4 },
  ));
});

test('resolves every approve transition exposed by the Penyaluran UI', () => {
  const transitions = [
    ['Diajukan', 'Verifikasi Administrasi'],
    ['Verifikasi Administrasi', 'Survey'],
    ['Verifikasi', 'Survey'],
    ['Survey', 'Persetujuan MPZIS'],
    ['Persetujuan MPZIS', 'Pengajuan Dana (FPD)'],
    ['Pengajuan Dana (FPD)', 'Penyaluran Selesai'],
    ['Pengajuan Dana (PPD)', 'Penyaluran Selesai'],
  ];

  for (const [currentStatus, nextStatus] of transitions) {
    assert.equal(
      resolvePenyaluranTransition({ currentStatus, action: 'approve' }),
      nextStatus,
    );
  }
});

test('resolves rejection from every actionable Penyaluran UI stage', () => {
  for (const currentStatus of [
    'Diajukan',
    'Verifikasi Administrasi',
    'Verifikasi',
    'Survey',
    'Persetujuan MPZIS',
    'Pengajuan Dana (FPD)',
    'Pengajuan Dana (PPD)',
  ]) {
    assert.equal(
      resolvePenyaluranTransition({ currentStatus, action: 'reject' }),
      'Ditolak',
    );
  }
});

test('rejects an arbitrary target status instead of allowing a workflow leap', () => {
  assert.throws(
    () => resolvePenyaluranTransition({
      currentStatus: 'Diajukan',
      action: 'approve',
      targetStatus: 'Penyaluran Selesai',
    }),
    (error) => error.code === 'INVALID_WORKFLOW_TRANSITION' && error.status === 422,
  );
});

test('rejects explicitly supplied null, empty, and unknown target statuses', () => {
  for (const targetStatus of [null, '', 'Unknown']) {
    assert.throws(
      () => resolvePenyaluranTransition({
        currentStatus: 'Diajukan',
        action: 'approve',
        targetStatus,
      }),
      (error) => error.code === 'INVALID_WORKFLOW_STATUS' && error.status === 422,
    );
  }
});

test('rejects decisions from terminal or unknown workflow states', () => {
  for (const currentStatus of ['Penyaluran Selesai', 'Ditolak', 'Bogus']) {
    assert.throws(
      () => resolvePenyaluranTransition({ currentStatus, action: 'approve' }),
      (error) => ['INVALID_WORKFLOW_TRANSITION', 'INVALID_WORKFLOW_STATUS'].includes(error.code) && error.status === 422,
    );
  }
});

test('canonicalizes persisted Penyaluran status aliases before transition checks', () => {
  const aliases = [
    ['MPZIS', 'Persetujuan MPZIS'],
    ['FPD', 'Pengajuan Dana (FPD)'],
    ['PPD', 'Pengajuan Dana (FPD)'],
    ['Pengajuan Dana (PPD)', 'Pengajuan Dana (FPD)'],
    ['Selesai', 'Penyaluran Selesai'],
    ['Verifikasi', 'Verifikasi Administrasi'],
  ];

  for (const [alias, canonical] of aliases) {
    assert.equal(canonicalizePenyaluranStatus(alias), canonical);
  }
  assert.throws(
    () => canonicalizePenyaluranStatus('unknown status'),
    (error) => error.code === 'INVALID_WORKFLOW_STATUS' && error.status === 422,
  );
});
