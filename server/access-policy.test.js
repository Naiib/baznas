import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, requireProductionSecret, ROLE } from './access-policy.js';

test('only admin can change master data', () => {
  assert.equal(canAccess(ROLE.ADMIN, 'master-data:write'), true);
  assert.equal(canAccess(ROLE.PENYALURAN, 'master-data:write'), false);
});

test('penyaluran can advance a decision but surveyor cannot disburse PPD', () => {
  assert.equal(canAccess(ROLE.PENYALURAN, 'mustahik:decision'), true);
  assert.equal(canAccess(ROLE.SURVEYOR, 'ppd:write'), false);
});

test('only authenticated operational roles can export PII', () => {
  assert.equal(canAccess(ROLE.ADMIN, 'laporan:export'), true);
  assert.equal(canAccess(undefined, 'laporan:export'), false);
});

test('production rejects missing, default, example, and development JWT secrets', () => {
  for (const jwtSecret of [
    undefined,
    'baznas_tangkot_super_secret_jwt_key_2026',
    'change-me-in-production',
    'development-only-jwt-secret',
  ]) {
    assert.throws(() => requireProductionSecret({ jwtSecret, nodeEnv: 'production' }));
  }
});

test('non-production uses the explicit development JWT secret when none is configured', () => {
  assert.equal(requireProductionSecret({ jwtSecret: undefined, nodeEnv: 'development' }), 'development-only-jwt-secret');
});
