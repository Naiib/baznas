import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { p0FlagGate, registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { P0Error } from './penyaluran-p0/errors.js';

async function running(options = {}) {
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: options.auth || ((req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); }),
    isEnabled: true,
    services: options.services || { getAssessmentCase: async () => ({ success: true, data: {} }) },
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('assessment routes require authentication and preserve P0 error envelope', async (t) => {
  const { server, url } = await running({ auth: (_req, res) => res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'login' }) });
  t.after(() => server.close());
  const response = await fetch(`${url}/api/penyaluran/mustahik/1/assessment`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, code: 'AUTH_REQUIRED', message: 'login' });
});

test('assessment route derives actor from req.user and delegates one service call', async (t) => {
  let seen;
  const { server, url } = await running({ services: {
    getAssessmentCase: async (context, mustahikId) => { seen = { context, mustahikId }; return { success: true, data: { id: mustahikId } }; },
  } });
  t.after(() => server.close());
  const response = await fetch(`${url}/api/penyaluran/mustahik/12/assessment`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { id: 12 } });
  assert.equal(seen.context.actor.id, 7);
  assert.equal(seen.mustahikId, 12);
});

test('assessment route maps domain status and retains field_errors', async (t) => {
  const { server, url } = await running({ services: {
    saveAssessmentDraft: async () => { throw new P0Error('VALIDATION_FAILED', 'invalid', { field_errors: { child_count: 'RANGE' } }); },
  } });
  t.after(() => server.close());
  const response = await fetch(`${url}/api/penyaluran/mustahik/1/assessment/2`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expected_version: 0, expected_revision: 1, idempotency_key: 'x', child_count: 99 }) });
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).field_errors, { child_count: 'RANGE' });
});

test('state-changing assessment routes fail closed when the P0 flag is disabled', async (t) => {
  let calls = 0;
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); },
    isEnabled: false,
    services: { saveAssessmentDraft: async () => { calls += 1; return { success: true }; } },
  });
  const disabled = app.listen(0, '127.0.0.1'); await once(disabled, 'listening'); t.after(() => disabled.close());
  const response = await fetch(`http://127.0.0.1:${disabled.address().port}/api/penyaluran/mustahik/1/assessment/2`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotency_key: 'off', expected_version: 0, expected_revision: 1 }) });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test('disabled Assessment PUT is rejected before JSON parsing by the canonical pre-parser gate', async (t) => {
  let parserReached = false;
  let calls = 0;
  const app = express();
  app.use('/api/penyaluran/mustahik', p0FlagGate({ isEnabled: false }));
  app.use(express.json({ verify: () => { parserReached = true; } }));
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); },
    isEnabled: true,
    services: { saveAssessmentDraft: async () => { calls += 1; return { success: true }; } },
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/penyaluran/mustahik/1/assessment/2`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: '{malformed',
  });
  assert.equal(response.status, 503);
  assert.equal(parserReached, false);
  assert.equal(calls, 0);
});
