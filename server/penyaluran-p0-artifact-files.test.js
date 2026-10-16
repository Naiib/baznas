import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withTransaction } from './db.js';
import { validateArtifactBytes, streamAuditedArtifact, storeArtifactFile, createP0SystemReceiptStore, openArtifactForActor, MAX_ARTIFACT_BYTES, MAX_CASE_ARTIFACT_BYTES, assertPrivateArtifactRoot } from './penyaluran-p0/artifact-files.js';

const pdfFixture = () => Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n');
const hasCode = (code) => (error) => error?.code === code;
const hasAnyCode = (...codes) => (error) => codes.includes(error?.code);

function fakeDb({ total = 0, duplicate = null, parent = true, assignment = true, file = null, insertError = null, isPg = false, caseId = 1 } = {}) {
  const inserted = [];
  const queries = [];
  const db = {
    isPg,
    _isInTransaction: true,
    inserted,
    queries,
    async query(sql) {
      queries.push(sql);
      if (isPg && /pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    async get(sql) {
      if (/FROM mustahik_case_assignments/.test(sql)) return assignment ? { mustahik_id: 1, user_id: 7 } : null;
      if (/FROM mustahik/.test(sql)) return { id: caseId };
      if (/FROM artifact_files WHERE id/.test(sql)) return file;
      if (/FROM assessments/.test(sql)) return parent === true ? { id: 11, mustahik_id: 1, revision: 1, status: 'submitted', source: 'p0' } : parent;
      if (/FROM ppd/.test(sql)) return parent === true ? { id: 11, mustahik_id: 1, revision: 1, status: 'completed', source: 'p0' } : parent;
      if (/COALESCE\(SUM\(byte_size\)/.test(sql)) return { total };
      if (/FROM artifact_files WHERE sha256/.test(sql)) return duplicate;
      return null;
    },
    async run(sql, params) {
      if (insertError) throw insertError;
      inserted.push({ sql, params });
      return { rows: [{ id: 91, mustahik_id: 1, artifact_id: 11, artifact_revision: 1, kind: 'supporting_document', stored_name: params[5], original_name: params[6], mime_type: params[7], byte_size: params[8], sha256: params[9] }] };
    },
  };
  return db;
}

test('accepts real PDF/JPEG/PNG signatures and rejects extension-only and polyglot payloads', () => {
  assert.equal(validateArtifactBytes(pdfFixture()).mimeType, 'application/pdf');
  assert.equal(validateArtifactBytes(Buffer.from([0xff, 0xd8, 0xff, 0xd9])).mimeType, 'image/jpeg');
  assert.equal(validateArtifactBytes(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082', 'hex')).mimeType, 'image/png');
  assert.throws(() => validateArtifactBytes(Buffer.from('not-a-pdf')), hasCode('INVALID_FILE_SIGNATURE'));
  assert.throws(() => validateArtifactBytes(Buffer.from('MZ...%PDF-1.7\n%%EOF')), hasCode('INVALID_FILE_SIGNATURE'));
});

test('audit insertion failure sends zero bytes', async () => {
  const sent = [];
  const response = {
    headersSent: false,
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader() {},
    write(chunk) { sent.push(chunk); },
    end(chunk) { if (chunk) sent.push(chunk); },
  };
  await streamAuditedArtifact({
    response,
    actor: { id: 1, name: 'A', role: 'penyaluran', level: 'staff', division: 'penyaluran' },
    file: { id: 1, mustahik_id: 1, artifact_type: 'assessment', artifact_id: 1, artifact_revision: 1, kind: 'supporting_document', stored_name: 'safe.pdf', original_name: 'safe.pdf', mime_type: 'application/pdf', byte_size: 4 },
    open: async () => ({ stat: { size: 4, isFile: () => true }, close: async () => {}, stream: () => { throw new Error('must not stream'); } }),
    insertAccessEvent: async () => { throw new Error('audit failure'); },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(sent.length, 0);
});

test('storeArtifactFile executes the real file and metadata transaction with a randomized basename', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-store-'));
  const db = fakeDb();
  try {
    const result = await storeArtifactFile({
      db,
      artifactRoot: root,
      file: { originalname: '../../client-secret.pdf', buffer: pdfFixture() },
      mustahik_id: 1,
      artifact_type: 'assessment',
      artifact_id: 11,
      artifact_revision: 1,
      kind: 'supporting_document',
      actor: { id: 7, role: 'surveyor', level: 'staff' },
    });
    assert.equal(result.success, true);
    assert.equal(db.inserted.length, 1);
    const names = fs.readdirSync(root);
    assert.deepEqual(names, [result.data.stored_name]);
    assert.match(result.data.stored_name, /^[0-9a-f-]{36}\.pdf$/);
    assert.notEqual(result.data.stored_name, 'client-secret.pdf');
    assert.equal(fs.readFileSync(path.join(root, result.data.stored_name)).toString(), pdfFixture().toString());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('validateArtifactBytes enforces the exact 10 MiB boundary before storage', () => {
  const body = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_ARTIFACT_BYTES - 9 - 5, 0x20), Buffer.from('%%EOF')]);
  assert.equal(body.length, MAX_ARTIFACT_BYTES);
  assert.equal(validateArtifactBytes(body).byte_size, MAX_ARTIFACT_BYTES);
  assert.throws(() => validateArtifactBytes(Buffer.concat([body, Buffer.from('x')])), hasCode('ARTIFACT_TOO_LARGE'));
});

test('PostgreSQL storage takes a transaction-scoped global hash advisory lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-pg-lock-'));
  const db = fakeDb({ isPg: true });
  try {
    await storeArtifactFile({
      db, artifactRoot: root, file: { originalname: 'proof.pdf', buffer: pdfFixture() },
      mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1,
      kind: 'supporting_document', actor: { id: 7, role: 'surveyor', level: 'staff' },
    });
    assert.ok(db.queries.some((sql) => /pg_advisory_xact_lock\(hashtextextended/.test(sql)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('storage exposes rollback cleanup for an enclosing transaction seam', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-rollback-'));
  let rollback;
  try {
    const result = await storeArtifactFile({
      db: fakeDb(), artifactRoot: root, registerRollbackCleanup: (hook) => { rollback = hook; },
      file: { originalname: 'evidence.pdf', buffer: pdfFixture() }, mustahik_id: 1,
      artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, kind: 'supporting_document',
      actor: { id: 7, role: 'surveyor', level: 'staff' },
    });
    assert.ok(rollback);
    assert.ok(fs.existsSync(path.join(root, result.data.stored_name)));
    await rollback();
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('storeArtifactFile enforces 30 MiB quota, duplicate privacy, and exact failure cleanup', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-policy-'));
  const common = {
    artifactRoot: root,
    file: { originalname: 'evidence.pdf', buffer: pdfFixture() },
    mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1,
    kind: 'supporting_document', actor: { id: 7, role: 'surveyor', level: 'staff' },
  };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await assert.rejects(storeArtifactFile({ ...common, db: fakeDb({ total: MAX_CASE_ARTIFACT_BYTES }) }), hasCode('CASE_ARTIFACT_QUOTA_EXCEEDED'));
  assert.deepEqual(fs.readdirSync(root), []);
  await assert.rejects(storeArtifactFile({ ...common, db: fakeDb({ duplicate: { id: 22 } }) }), hasCode('DUPLICATE_ARTIFACT'));
  assert.deepEqual(fs.readdirSync(root), []);
  await assert.rejects(storeArtifactFile({ ...common, db: fakeDb({ insertError: new Error('metadata unavailable') }) }), /metadata unavailable/);
  assert.deepEqual(fs.readdirSync(root), [], 'failed metadata insert removes only this invocation files');
});

test('store authorization rejects forged parent identity and wrong role before touching disk', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-auth-'));
  try {
    await assert.rejects(storeArtifactFile({
      db: fakeDb({ parent: false }), artifactRoot: root, file: { originalname: 'evidence.pdf', buffer: pdfFixture() },
      mustahik_id: 1, artifact_type: 'assessment', artifact_id: 99, artifact_revision: 9,
      kind: 'supporting_document', actor: { id: 7, role: 'admin', division: 'Admin', level: 'admin' },
    }), hasAnyCode('PERMISSION_DENIED', 'ARTIFACT_NOT_FOUND'));
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('store authorization fails closed for missing assignment, forged type, and stale revision before disk writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-authz-'));
  const base = {
    artifactRoot: root, file: { originalname: 'evidence.pdf', buffer: pdfFixture() }, mustahik_id: 1,
    artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, kind: 'supporting_document',
    actor: { id: 7, role: 'surveyor', level: 'staff' },
  };
  try {
    await assert.rejects(storeArtifactFile({ ...base, db: fakeDb({ assignment: false }) }), hasCode('PERMISSION_DENIED'));
    await assert.rejects(storeArtifactFile({ ...base, db: fakeDb({ parent: null }) }), hasCode('ARTIFACT_NOT_FOUND'));
    await assert.rejects(storeArtifactFile({ ...base, artifact_type: 'ppd', kind: 'supporting_document', db: fakeDb({ parent: null }) }), hasCode('ARTIFACT_NOT_FOUND'));
    await assert.rejects(storeArtifactFile({ ...base, artifact_revision: 2, db: fakeDb({ parent: null }) }), hasCode('ARTIFACT_NOT_FOUND'));
    assert.deepEqual(fs.readdirSync(root), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('system receipt factory validates PPD ownership, revision, type, and completed lifecycle before writing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-receipt-'));
  const storeReceipt = createP0SystemReceiptStore();
  const base = {
    artifactRoot: root, file: { originalname: 'receipt.pdf', buffer: pdfFixture() }, mustahik_id: 1,
    artifact_type: 'ppd', artifact_id: 11, artifact_revision: 1, kind: 'system_receipt_pdf',
    actor: { id: 7, role: 'system', level: 'system' },
  };
  try {
    const result = await storeReceipt({ ...base, db: fakeDb({ assignment: false, parent: { id: 11, mustahik_id: 1, revision: 1, status: 'completed', source: 'p0' } }) });
    assert.equal(result.success, true);
    fs.rmSync(path.join(root, result.data.stored_name));
    for (const input of [
      { db: fakeDb({ parent: null }) },
      { db: fakeDb({ caseId: 2, parent: { id: 11, mustahik_id: 1, revision: 1, status: 'completed', source: 'p0' } }), mustahik_id: 2 },
      { db: fakeDb({ parent: { id: 11, mustahik_id: 1, revision: 1, status: 'completed', source: 'p0' } }), artifact_type: 'assessment' },
      { db: fakeDb({ parent: { id: 12, mustahik_id: 1, revision: 1, status: 'completed', source: 'p0' } }), artifact_id: 11 },
      { db: fakeDb({ parent: { id: 11, mustahik_id: 1, revision: 2, status: 'completed', source: 'p0' } }), artifact_revision: 1 },
      { db: fakeDb({ parent: { id: 11, mustahik_id: 1, revision: 1, status: 'payment_verified', source: 'p0' } }) },
    ]) {
      await assert.rejects(storeReceipt({ ...base, ...input }), hasAnyCode('CASE_NOT_FOUND', 'ARTIFACT_NOT_FOUND', 'FIELD_INVALID', 'WRONG_STATE'));
      assert.deepEqual(fs.readdirSync(root), []);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rollback cleanup hooks run even when PostgreSQL rollback fails and the unsafe client is discarded', async () => {
  const calls = []; const original = new Error('original failure'); const rollbackError = new Error('rollback failure'); let cleaned = 0;
  const client = {
    async query(sql) { calls.push(sql); if (sql === 'ROLLBACK') throw rollbackError; },
    release(error) { calls.push(error ? `release:${error.message}` : 'release'); },
  };
  const db = { isPg: true, pool: { connect: async () => client } };
  await assert.rejects(withTransaction(db, async (tx) => { tx.onRollback(async () => { cleaned++; }); throw original; }), (error) => error === original && error.rollbackError === rollbackError);
  assert.equal(cleaned, 1);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release:rollback failure']);
});

test('rollback disposal failure preserves the original error and never releases the unsafe client normally', async () => {
  const calls = [];
  const original = new Error('original failure');
  const rollbackError = new Error('rollback failure');
  const disposalError = new Error('disposal failure');
  const client = {
    async query(sql) { calls.push(sql); if (sql === 'ROLLBACK') throw rollbackError; },
    release(error) {
      calls.push(error ? `release:${error.message}` : 'release');
      if (error) throw disposalError;
    },
  };
  const db = { isPg: true, pool: { connect: async () => client } };
  await assert.rejects(
    withTransaction(db, async () => { throw original; }),
    (error) => error === original && error.rollbackError === rollbackError && error.rollbackClientDisposeError === disposalError,
  );
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release:rollback failure']);
});

test('commit does not execute rollback cleanup hooks, while cleanup failures remain attached to the original error', async () => {
  let cleaned = 0; let releaseCount = 0;
  const client = { async query() {}, release(error) { if (!error) releaseCount++; } };
  await withTransaction({ isPg: true, pool: { connect: async () => client } }, async (tx) => { tx.onRollback(async () => { cleaned++; }); return 'ok'; });
  assert.equal(cleaned, 0); assert.equal(releaseCount, 1);
  const original = new Error('work failed'); const cleanupError = new Error('cleanup failed');
  const failingClient = { async query() {}, release() {} };
  await assert.rejects(withTransaction({ isPg: true, pool: { connect: async () => failingClient } }, async (tx) => { tx.onRollback(async () => { throw cleanupError; }); throw original; }), (error) => error === original && error.rollbackCleanupErrors?.[0] === cleanupError);
});

test('private artifact root rejects public and upload roots including symlink aliases', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-root-'));
  const publicRoot = path.join(base, 'public'); const uploadRoot = path.join(base, 'uploads');
  fs.mkdirSync(publicRoot); fs.mkdirSync(uploadRoot);
  try {
    await assert.rejects(assertPrivateArtifactRoot(publicRoot, { publicRoot, uploadRoot }), hasCode('ARTIFACT_ROOT_INVALID'));
    const alias = path.join(base, 'alias'); fs.symlinkSync(uploadRoot, alias, 'junction');
    await assert.rejects(assertPrivateArtifactRoot(alias, { publicRoot, uploadRoot }), hasCode('ARTIFACT_ROOT_INVALID'));
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('openArtifactForActor enforces case, kind, assignment, and realpath containment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-open-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-artifact-outside-'));
  const safeName = 'safe.pdf'; const bytes = Buffer.from('private');
  fs.writeFileSync(path.join(root, safeName), bytes);
  const baseFile = { id: 4, mustahik_id: 1, artifact_type: 'assessment', artifact_id: 11, artifact_revision: 1, kind: 'supporting_document', stored_name: safeName, byte_size: bytes.length, mime_type: 'application/pdf' };
  try {
    const opened = await openArtifactForActor({ db: fakeDb({ file: baseFile }), artifactRoot: root, mustahik_id: 1, fileId: 4, actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' } });
    assert.equal(opened.stat.size, bytes.length);
    await opened.handle.close();
    await assert.rejects(openArtifactForActor({ db: fakeDb({ file: baseFile }), artifactRoot: root, mustahik_id: 2, fileId: 4, actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' } }), hasCode('ARTIFACT_NOT_FOUND'));
    await assert.rejects(openArtifactForActor({ db: fakeDb({ file: { ...baseFile, kind: 'forged_kind' } }), artifactRoot: root, mustahik_id: 1, fileId: 4, actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' } }), hasCode('ARTIFACT_NOT_FOUND'));
    await assert.rejects(openArtifactForActor({ db: fakeDb({ file: { ...baseFile, stored_name: '../escape.pdf' } }), artifactRoot: root, mustahik_id: 1, fileId: 4, actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' } }), hasCode('ARTIFACT_NOT_FOUND'));
    fs.writeFileSync(path.join(outside, safeName), bytes);
    fs.symlinkSync(outside, path.join(root, 'alias'), 'junction');
    await assert.rejects(openArtifactForActor({ db: fakeDb({ file: { ...baseFile, stored_name: 'alias' } }), artifactRoot: root, mustahik_id: 1, fileId: 4, actor: { id: 7, role: 'penyaluran', division: 'Penyaluran', level: 'staff' } }), hasCode('ARTIFACT_NOT_FOUND'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('streamAuditedArtifact supports full, explicit, suffix, and invalid ranges with safe headers', async () => {
  const responses = [];
  for (const range of [undefined, 'bytes=1-3', 'bytes=-2', 'bytes=99-100']) {
    const response = { statusCode: 200, headers: {}, body: null, status(code) { this.statusCode = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
    await streamAuditedArtifact({ response, range, actor: { id: 7, role: 'penyaluran' }, file: { id: 1, mustahik_id: 1, artifact_type: 'ppd', artifact_id: 9, artifact_revision: 1, kind: 'payment_proof', original_name: 'receipt"\r\n.pdf', mime_type: 'application/pdf', byte_size: 5 }, opened: { stat: { size: 5 }, stream: ({ start, end }) => Buffer.from('abcde').subarray(start, end + 1) }, insertAccessEvent: async (event) => { responses.push(event); } });
    if (range === undefined) assert.equal(response.statusCode, 200);
    else if (range === 'bytes=99-100') assert.equal(response.statusCode, 416);
    else assert.equal(response.statusCode, 206);
    if (range !== 'bytes=99-100') {
      assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(response.headers['Cache-Control'], 'private, no-store');
      assert.match(response.headers['Content-Disposition'], /^inline; filename=/);
    }
  }
  assert.equal(responses.length, 3, 'invalid ranges do not create successful audit events');
});
