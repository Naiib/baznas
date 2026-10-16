import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { isUploadPathContained } from './upload-download-policy.js';

const JWT_SECRET = 'task-2-upload-download-secret';
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baznas-upload-download-'));
const filename = `${randomUUID()}.pdf`;
const penerimaanFilename = `${randomUUID()}.png`;
const missingFilename = `${randomUUID()}.pdf`;
const conflictFilename = `${randomUUID()}.png`;
const mustahikFileNo = `TASK-2-${randomUUID()}`;
const fileContents = 'protected evidence fixture';
const penerimaanFileContents = 'protected penerimaan evidence fixture';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.UPLOAD_DIR = uploadDir;

const { default: app } = await import('./index.js');
const { getDb, initDb } = await import('./db.js');

let server;
let baseUrl;
let mustahikFixtureId;

before(async () => {
  await initDb();
  const db = await getDb();
  fs.writeFileSync(path.join(uploadDir, filename), fileContents);
  fs.writeFileSync(path.join(uploadDir, penerimaanFilename), penerimaanFileContents);
  fs.writeFileSync(path.join(uploadDir, conflictFilename), 'conflicting scope fixture');
  const mustahik = await db.run(
    'INSERT INTO mustahik (file_no, name) VALUES ($1, $2) RETURNING id',
    [mustahikFileNo, 'Task 2 Upload Fixture']
  );
  mustahikFixtureId = mustahik.lastID;
  await db.run(
    `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [mustahikFixtureId, 'Bukti Task 2', filename, 'evidence.pdf', `/uploads/${filename}`]
  );
  await db.run(
    `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [mustahikFixtureId, 'Bukti Task 2 Missing', missingFilename, 'missing.pdf', `/uploads/${missingFilename}`]
  );
  await db.run(
    `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [mustahikFixtureId, 'Bukti Task 2 Conflict', conflictFilename, 'conflict.png', `/uploads/${conflictFilename}`]
  );
  await db.run('DELETE FROM penerimaan_transactions WHERE transaction_number = $1', ['TASK-2-UPLOAD-TX']);
  await db.run(
    `INSERT INTO penerimaan_transactions
      (transaction_number, channel, channel_category, muzakki_name, fund_type, amount, net_amount, evidence_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['TASK-2-UPLOAD-TX', 'counter_kasir', 'manual', 'Task 2 Donor', 'zakat_maal', 1000, 1000, `/uploads/${penerimaanFilename}`]
  );
  await db.run('DELETE FROM penerimaan_transactions WHERE transaction_number = $1', ['TASK-2-UPLOAD-CONFLICT']);
  await db.run(
    `INSERT INTO penerimaan_transactions
      (transaction_number, channel, channel_category, muzakki_name, fund_type, amount, net_amount, evidence_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['TASK-2-UPLOAD-CONFLICT', 'counter_kasir', 'manual', 'Task 2 Conflict Donor', 'zakat_maal', 1000, 1000, `/uploads/${conflictFilename}`]
  );

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  const db = await getDb();
  await db.run('DELETE FROM documents WHERE mustahik_id = $1', [mustahikFixtureId]);
  await db.run('DELETE FROM penerimaan_transactions WHERE transaction_number = $1', ['TASK-2-UPLOAD-TX']);
  await db.run('DELETE FROM penerimaan_transactions WHERE transaction_number = $1', ['TASK-2-UPLOAD-CONFLICT']);
  await db.run('DELETE FROM mustahik WHERE file_no = $1', [mustahikFileNo]);
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

function tokenFor(role, division = '') {
  return jwt.sign({ id: `task-2-${role}`, name: `Task 2 ${role}`, role, division }, JWT_SECRET, { expiresIn: '5m' });
}

async function request(route, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

test('anonymous users cannot download a known uploaded document', async () => {
  const response = await request(`/uploads/${filename}`);
  assert.equal(response.status, 401);
});

test('an authorized Penyaluran user can download a stored document', async () => {
  const response = await request(`/uploads/${filename}`, { token: tokenFor('penyaluran') });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), fileContents);
});

test('a Penerimaan user cannot download a Penyaluran document', async () => {
  const response = await request(`/uploads/${filename}`, {
    token: tokenFor('penerimaan', 'Bidang Penerimaan'),
  });
  assert.equal(response.status, 403);
});

test('an authorized Penerimaan user can download stored evidence', async () => {
  const response = await request(`/uploads/${penerimaanFilename}`, {
    token: tokenFor('penerimaan', 'Bidang Penerimaan'),
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), penerimaanFileContents);
});

test('a Penyaluran user cannot download Penerimaan evidence', async () => {
  const response = await request(`/uploads/${penerimaanFilename}`, {
    token: tokenFor('penyaluran'),
  });
  assert.equal(response.status, 403);
});

test('upload download rejects traversal attempts', async () => {
  const response = await request('/uploads/%2e%2e%2fserver.js', { token: tokenFor('admin') });
  assert.equal(response.status, 400);
});

test('authorized download rejects metadata for a missing file', async () => {
  const response = await request(`/uploads/${missingFilename}`, { token: tokenFor('penyaluran') });
  assert.equal(response.status, 404);
});

test('conflicting scope metadata is denied to both operational roles', async () => {
  const penyaluranResponse = await request(`/uploads/${conflictFilename}`, { token: tokenFor('penyaluran') });
  const penerimaanResponse = await request(`/uploads/${conflictFilename}`, {
    token: tokenFor('penerimaan', 'Bidang Penerimaan'),
  });
  assert.equal(penyaluranResponse.status, 403);
  assert.equal(penerimaanResponse.status, 403);
});

test('document metadata cannot claim a Penerimaan evidence filename', async () => {
  const response = await request(`/api/mustahik/${mustahikFixtureId}/documents`, {
    method: 'POST',
    token: tokenFor('penyaluran'),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      doc_type: 'Poisoned document',
      filename: conflictFilename,
      file_url: `/uploads/${conflictFilename}`,
    }),
  });
  assert.equal(response.status, 409);
});

test('real-path containment rejects a symlink escape target', () => {
  const outsidePath = path.resolve(uploadDir, '..', 'outside-upload-target.pdf');
  assert.equal(isUploadPathContained(uploadDir, outsidePath), false);
});

test('authenticated download denies a real directory-junction escape', async () => {
  const db = await getDb();
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baznas-upload-outside-'));
  const junctionFilename = `${randomUUID()}.pdf`;
  const junctionPath = path.join(uploadDir, junctionFilename);
  const outsideContent = 'must never be served from outside uploads';
  fs.writeFileSync(path.join(outsideDir, 'outside.pdf'), outsideContent);

  try {
    fs.symlinkSync(outsideDir, junctionPath, 'junction');
    await db.run(
      `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [mustahikFixtureId, 'Junction Escape Fixture', junctionFilename, 'outside.pdf', `/uploads/${junctionFilename}`]
    );

    const response = await request(`/uploads/${junctionFilename}`, { token: tokenFor('penyaluran') });
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), new RegExp(outsideContent));
  } finally {
    await db.run('DELETE FROM documents WHERE filename = $1', [junctionFilename]);
    if (fs.existsSync(junctionPath)) fs.unlinkSync(junctionPath);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('Nginx proxies uploads to the authenticated backend instead of serving an alias', () => {
  const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend-next/deploy/nginx-muhammadrofiq-next.conf');
  const config = fs.readFileSync(configPath, 'utf8');
  const uploadsBlock = config.match(/location \^~ \/uploads\/ \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.match(uploadsBlock, /proxy_pass http:\/\/127\.0\.0\.1:3001\/uploads\//);
  assert.doesNotMatch(uploadsBlock, /\balias\b/);
});
