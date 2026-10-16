import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { P0Error } from './penyaluran-p0/errors.js';

async function running(options = {}) {
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: options.auth || ((req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); }),
    isEnabled: options.enabled ?? true,
    services: options.services || {},
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('MPZIS routes expose all five endpoints and derive actor from req.user', async (t) => {
  const seen = [];
  const services = {
    getMpzisCase: async (context, id) => { seen.push(['get', context.actor.id, id]); return { success: true, data: {} }; },
    createMpzisDraft: async (context, id) => { seen.push(['create', context.actor.id, id]); return { success: true, data: {} }; },
    saveMpzisDraft: async (context, id) => { seen.push(['save', context.actor.id, id]); return { success: true, data: {} }; },
    submitMpzis: async (context, id) => { seen.push(['submit', context.actor.id, id]); return { success: true, data: {} }; },
    decideMpzisStep: async (context, id, step) => { seen.push(['approve', context.actor.id, id, step]); return { success: true, data: {} }; },
  };
  const { server, url } = await running({ services }); t.after(() => server.close());
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/mpzis`)).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/drafts`, { method: 'POST', headers, body: '{}' })).status, 201);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/2`, { method: 'PUT', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/2/submit`, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/2/approvals/proposed`, { method: 'POST', headers, body: JSON.stringify({ action: 'approve' }) })).status, 200);
  assert.deepEqual(seen.map((entry) => entry[0]), ['get', 'create', 'save', 'submit', 'approve']);
  assert.equal(seen[4][3], 'proposed'); assert.equal(seen[0][1], 7);
});

test('MPZIS route rejects unknown step before invoking the service', async (t) => {
  let called = false;
  const { server, url } = await running({ services: { decideMpzisStep: async () => { called = true; } } }); t.after(() => server.close());
  const response = await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/2/approvals/not-a-step`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) });
  assert.equal(response.status, 422); assert.equal((await response.json()).code, 'FIELD_INVALID'); assert.equal(called, false);
});

test('MPZIS route preserves domain error envelopes and disabled writes fail closed', async (t) => {
  const { server, url } = await running({ services: { submitMpzis: async () => { throw new P0Error('ADMIN_ROUTINE_FORBIDDEN', 'admin'); } } }); t.after(() => server.close());
  const denied = await fetch(`${url}/api/penyaluran/mustahik/1/mpzis/2/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'ADMIN_ROUTINE_FORBIDDEN');
  const disabled = await running({ enabled: false, services: { createMpzisDraft: async () => { throw new Error('must not call'); } } }); t.after(() => disabled.server.close());
  const off = await fetch(`${disabled.url}/api/penyaluran/mustahik/1/mpzis/drafts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(off.status, 503); assert.equal((await off.json()).code, 'P0_WORKFLOW_DISABLED');
});
