import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { P0Error } from './penyaluran-p0/errors.js';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';

test('artifact GET and receipt routes are added to the canonical P0 registration', () => {
  const routes = [];
  const app = { post(path, ...handlers) { routes.push(['POST', path, handlers]); }, put(path, ...handlers) { routes.push(['PUT', path, handlers]); }, get(path, ...handlers) { routes.push(['GET', path, handlers]); } };
  registerPenyaluranP0Routes(app, { authenticateToken: (_req, _res, next) => next(), isEnabled: true, artifactRoot: 'private-artifacts' });
  assert.ok(routes.some(([method, path]) => method === 'GET' && path === '/api/penyaluran/mustahik/:id/artifacts/:fileId'));
  assert.ok(routes.some(([method, path]) => method === 'GET' && path === '/api/penyaluran/mustahik/:id/artifacts/:fileId/receipt'));
});

test('real HTTP P0 GET resolves the injected database instead of uninitialized app.locals.db', async () => {
  const app = express();
  const db = { marker: 'real-test-db' };
  app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' }; next(); },
    isEnabled: true,
    getDb: async () => db,
    services: { getAssessmentCase: async (context) => ({ success: true, dbMarker: context.db.marker }) },
  });
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)); });
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/penyaluran/mustahik/1/assessment`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, dbMarker: 'real-test-db' });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('intake document download requires assigned-case authorization and confines paths to uploads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-intake-doc-'));
  await fs.promises.writeFile(path.join(root, 'ktp-random.pdf'), Buffer.from('private KTP'));
  let allowed = true;
  let authorizationOptions;
  let requestedCaseId;
  const db = {
    async get(_sql, params) {
      requestedCaseId = Number(params[1]);
      if (Number(params[0]) === 8 && requestedCaseId === 1) return { id: 8, mustahik_id: 1, filename: 'ktp-random.pdf', original_name: 'KTP Pemohon.pdf' };
      if (Number(params[0]) === 9 && requestedCaseId === 1) return { id: 9, mustahik_id: 1, filename: '../secret.pdf', original_name: 'secret.pdf' };
      if (Number(params[0]) === 10 && requestedCaseId === 1) return { id: 10, mustahik_id: 1, filename: 'missing.pdf', original_name: 'missing.pdf' };
      return null;
    },
  };
  const app = express();
  registerPenyaluranP0Routes(app, {
    db,
    uploadRoot: root,
    authenticateToken: (req, _res, next) => { req.user = { id: 7, role: 'penyaluran', level: 'staff', division: 'Penyaluran' }; next(); },
    services: {
      authorizeCaseRead: async (_db, _caseId, _actor, options) => {
        authorizationOptions = options;
        if (!allowed) throw new P0Error('PERMISSION_DENIED', 'Akses kasus dibatasi penugasan aktif.', { status: 403 });
      },
    },
  });
  const server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const baseUrl = 'http://127.0.0.1:' + server.address().port;
  try {
    const good = await fetch(baseUrl + '/api/penyaluran/mustahik/1/documents/8');
    assert.equal(good.status, 200);
    assert.equal(await good.text(), 'private KTP');
    assert.equal(authorizationOptions.requireAssignment, true);
    assert.match(good.headers.get('content-disposition'), /attachment/);
    assert.equal(good.headers.get('cache-control'), 'private, no-store');
    allowed = false;
    const denied = await fetch(baseUrl + '/api/penyaluran/mustahik/1/documents/8');
    assert.equal(denied.status, 403);
    allowed = true;
    const wrongCase = await fetch(baseUrl + '/api/penyaluran/mustahik/2/documents/8');
    assert.equal(wrongCase.status, 404);
    const traversal = await fetch(baseUrl + '/api/penyaluran/mustahik/1/documents/9');
    assert.equal(traversal.status, 404);
    const missingFile = await fetch(baseUrl + '/api/penyaluran/mustahik/1/documents/10');
    assert.equal(missingFile.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
test('receipt alias forces attachment and rejects non-receipt artifact kinds', async () => {
  const app = express();
  const db = { marker: 'receipt-db' };
  let streamOptions;
  app.use(express.json());
  registerPenyaluranP0Routes(app, {
    authenticateToken: (req, _res, next) => { req.user = { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' }; next(); },
    isEnabled: true,
    getDb: async () => db,
    services: {
      openArtifactForActor: async ({ db: resolvedDb, fileId }) => ({ db: resolvedDb, file: { kind: Number(fileId) === 4 ? 'system_receipt_pdf' : 'payment_proof', byte_size: 1 }, handle: { close: async () => {} } }),
      streamAuditedArtifact: async (options) => { streamOptions = options; options.response.status(200).send('receipt'); },
    },
  });
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)); });
  try {
    const port = server.address().port;
    const good = await fetch(`http://127.0.0.1:${port}/api/penyaluran/mustahik/1/artifacts/4/receipt`);
    assert.equal(good.status, 200);
    assert.equal(streamOptions.disposition, 'attachment');
    assert.equal(streamOptions.receipt, true);
    const wrongKind = await fetch(`http://127.0.0.1:${port}/api/penyaluran/mustahik/1/artifacts/5/receipt`);
    assert.equal(wrongKind.status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
