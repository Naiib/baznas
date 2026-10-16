import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';

async function running(services = {}) {
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, { authenticateToken: (req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); }, isEnabled: true, services });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('PPD routes expose GET, draft, save, submit, and finance transitions', async (t) => {
  const seen = [];
  const services = Object.fromEntries([
    ['getPpdCase', 'get'], ['createPpdDraft', 'create'], ['savePpdDraft', 'save'], ['submitPpd', 'submit'], ['financeCheckPpd', 'check'], ['financeApprovePpd', 'approve'],
  ].map(([name, label]) => [name, async (ctx, ...args) => { seen.push([label, ctx.actor.id, ...args]); return { success: true, data: {} }; }]));
  const { server, url } = await running(services); t.after(() => server.close());
  const headers = { 'content-type': 'application/json' };
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd`)).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd/drafts`, { method: 'POST', headers, body: '{}' })).status, 201);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd/2`, { method: 'PUT', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd/2/submit`, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd/2/finance-check`, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(`${url}/api/penyaluran/mustahik/1/ppd/2/finance-approve`, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.deepEqual(seen.map((entry) => entry[0]), ['get', 'create', 'save', 'submit', 'check', 'approve']);
});

test('PPD write routes fail closed when disabled and preserve sanitized domain errors', async (t) => {
  const { server, url } = await running({ submitPpd: async () => { throw { code: 'SECRET_SQL', message: 'password=do-not-leak' }; } }); t.after(() => server.close());
  const response = await fetch(`${url}/api/penyaluran/mustahik/1/ppd/2/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 500); assert.deepEqual(await response.json(), { success: false, code: 'P0_INTERNAL_ERROR', message: 'Terjadi kesalahan sistem.' });
  // A separate app is needed because enabled is fixed at registration time.
  const app = express(); app.use(express.json()); registerPenyaluranP0Routes(app, { authenticateToken: (req, _res, next) => { req.user = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); }, isEnabled: false });
  const offServer = app.listen(0, '127.0.0.1'); await once(offServer, 'listening'); t.after(() => offServer.close());
  const off = await fetch(`http://127.0.0.1:${offServer.address().port}/api/penyaluran/mustahik/1/ppd/2/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(off.status, 503); assert.equal((await off.json()).code, 'P0_WORKFLOW_DISABLED');
});

test("GET /api/penyaluran/mustahik/:id/ppd rejects unassigned actor with 403 over HTTP", async (t) => {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Pengajuan Dana (FPD)', workflow_mode='p0', workflow_version=1 WHERE id=1");
  await db.run("INSERT INTO mustahik_case_assignments (mustahik_id, user_id, assignment_role, assigned_by_id) VALUES (1, 7, 'penyaluran', 1)");

  let currentActor = { id: 12, name: "Finance Staff", role: "keuangan", level: "staff", division: "Keuangan" };
  const app = express(); app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = currentActor; req.db = db; next(); },
    db: (req) => req.db,
    isEnabled: true,
  });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => {
    server.close();
    await db.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  // Unassigned finance user 12 -> 403 Forbidden
  const resForbidden = await fetch(`${url}/api/penyaluran/mustahik/1/ppd`);
  assert.equal(resForbidden.status, 403);
  const forbiddenBody = await resForbidden.json();
  assert.equal(forbiddenBody.code, "PERMISSION_DENIED");
  assert.equal(forbiddenBody.success, false);

  // Assigned user 7 -> 200 OK
  currentActor = { id: 7, name: "Rina", role: "penyaluran", level: "staff", division: "Penyaluran" };
  const resAllowed = await fetch(`${url}/api/penyaluran/mustahik/1/ppd`);
  assert.equal(resAllowed.status, 200);

  // Admin -> 200 OK
  currentActor = { id: 999, name: "Admin", role: "admin", level: "admin", division: "IT" };
  const resAdmin = await fetch(`${url}/api/penyaluran/mustahik/1/ppd`);
  assert.equal(resAdmin.status, 200);
});
