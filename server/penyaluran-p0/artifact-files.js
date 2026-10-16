import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import multer from 'multer';
import { withTransaction, getDb } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';

export const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_CASE_ARTIFACT_BYTES = 30 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({ 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' });
const ARTIFACT_KINDS = new Set(['supporting_document', 'payment_proof', 'recipient_confirmation', 'system_receipt_pdf']);
const ARTIFACT_PARENT_TABLE = Object.freeze({
  assessment: 'assessments',
  mpzis: 'mpzis',
  ppd: 'ppd',
});
const INTERNAL_RECEIPT_CAPABILITY = Symbol('p0-system-receipt-capability');

function fail(code, message, status, details) { throw new P0Error(code, message, { status, details }); }
function asBuffer(value) {
  if (!Buffer.isBuffer(value)) fail('INVALID_FILE_SIGNATURE', 'Isi berkas tidak valid.', 422);
  return value;
}

function validatePdf(bytes) {
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) return false;
  // A PDF must have an EOF marker at the end, with only whitespace after it.
  const text = bytes.toString('latin1');
  const eof = text.lastIndexOf('%%EOF');
  return eof >= 5 && /^[\x09\x0A\x0C\x0D\x20]*$/.test(text.slice(eof + 5));
}

function validateJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return false;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) return false;
    const marker = bytes[i++];
    if (marker === 0xd9) return i === bytes.length;
    if (marker === 0xda) {
      // Scan entropy-coded data until the EOI marker.  Stuffed FF bytes are data.
      if (i + 2 > bytes.length) return false;
      const scanLength = bytes.readUInt16BE(i);
      if (scanLength < 2 || i + scanLength > bytes.length) return false;
      for (i += scanLength; i < bytes.length; i++) {
        if (bytes[i] !== 0xff) continue;
        let j = i + 1;
        while (j < bytes.length && bytes[j] === 0xff) j++;
        if (j < bytes.length && bytes[j] === 0xd9) return j + 1 === bytes.length;
        if (j < bytes.length && bytes[j] !== 0x00) i = j - 1;
      }
      return false;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(i);
    if (length < 2 || i + length > bytes.length) return false;
    i += length;
  }
  return false;
}

function validatePng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) return false;
  let offset = 8; let sawHeader = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) return false;
    if (type === 'IHDR') sawHeader = length === 13 && !sawHeader;
    if (type === 'IEND') return sawHeader && length === 0 && chunkEnd === bytes.length;
    offset = chunkEnd;
  }
  return false;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate content using bounded signatures/terminators, never client MIME/extensions. */
export function validateArtifactBytes(input) {
  const bytes = asBuffer(input);
  if (!bytes.length) fail('INVALID_FILE_SIGNATURE', 'Isi berkas tidak valid.', 422);
  if (bytes.length > MAX_ARTIFACT_BYTES) fail('ARTIFACT_TOO_LARGE', 'Ukuran berkas melebihi batas 10 MB.', 413);
  const prefix = bytes.subarray(0, 8);
  if (prefix.subarray(0, 2).equals(Buffer.from('MZ')) || prefix.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || prefix.subarray(0, 4).equals(Buffer.from('PK\x03\x04')) || /^\s*<(?:!doctype|html|script)\b/i.test(bytes.toString('latin1', 0, Math.min(bytes.length, 128)))) {
    fail('INVALID_FILE_SIGNATURE', 'Tanda tangan berkas tidak diizinkan.', 422);
  }
  let mimeType;
  if (validatePdf(bytes)) mimeType = 'application/pdf';
  else if (validateJpeg(bytes)) mimeType = 'image/jpeg';
  else if (validatePng(bytes)) mimeType = 'image/png';
  else fail('INVALID_FILE_SIGNATURE', 'Tanda tangan berkas tidak valid.', 422);
  return { mimeType, mime_type: mimeType, extension: MIME_EXTENSIONS[mimeType], byteSize: bytes.length, byte_size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function safeOriginalName(name) {
  const value = String(name || 'evidence').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/"']/g, '_').trim();
  return value.slice(0, 255) || 'evidence';
}
function actorId(actor) { return actor?.id ?? actor?.user_id ?? null; }
function canonicalId(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function isAdmin(actor) { return String(actor?.role || '').toLowerCase() === 'admin' || String(actor?.level || '').toLowerCase() === 'admin'; }
function rootOf(value) { return path.resolve(value || process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts')); }
function generatedName(extension, uuid = crypto.randomUUID) { return `${uuid()}${extension}`; }
function isSafeStoredName(name) { return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(name) && !name.includes('..'); }
function isChildOrSame(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

async function realpathIfPresent(value) {
  try { return await fs.promises.realpath(value); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const parent = path.dirname(value);
    if (parent === value) return path.resolve(value);
    return path.join(await realpathIfPresent(parent), path.basename(value));
  }
}

/**
 * Validate the private root before it is used.  Both lexical and realpath
 * checks are required: a symlink/junction may alias the public or legacy
 * upload directory even when the configured string looks private.
 */
export async function assertPrivateArtifactRoot(value, { publicRoot, uploadRoot } = {}) {
  const root = rootOf(value);
  const forbidden = [
    publicRoot || path.join(process.cwd(), 'public'),
    uploadRoot || process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  ].map((candidate) => path.resolve(candidate));
  const rootLexical = path.resolve(root);
  if (forbidden.some((candidate) => isChildOrSame(candidate, rootLexical) || isChildOrSame(rootLexical, candidate))) {
    fail('ARTIFACT_ROOT_INVALID', 'Ruang penyimpanan bukti harus privat.', 500);
  }
  const rootReal = await realpathIfPresent(root);
  const forbiddenReal = await Promise.all(forbidden.map(realpathIfPresent));
  if (forbiddenReal.some((candidate) => isChildOrSame(candidate, rootReal) || isChildOrSame(rootReal, candidate))) {
    fail('ARTIFACT_ROOT_INVALID', 'Ruang penyimpanan bukti harus privat.', 500);
  }
  return { root, rootReal };
}

async function lockHashForTransaction(tx, hash) {
  // PostgreSQL advisory xact locks are held by the checked-out transaction,
  // so independent processes and different cases serialize the global hash
  // check.  Non-PG adapters deliberately have no concurrency claim.
  if (tx?.isPg === true) {
    try {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [hash]);
    } catch (error) {
      // pg-mem does not implement PostgreSQL advisory functions; the real
      // PostgreSQL path must retain the lock, while disposable tests may
      // continue without this optional concurrency primitive.
      if (!/function .*hashtextextended.*does not exist/i.test(String(error?.message))) throw error;
    }
  }
}

async function activeAssignment(db, mustahikId, actor) {
  if (!db) return false;
  const id = actorId(actor);
  if (id === null || id === undefined) return false;
  try {
    const row = await db.get('SELECT 1 FROM mustahik_case_assignments WHERE mustahik_id=$1 AND user_id=$2 AND ended_at IS NULL LIMIT 1', [mustahikId, id]);
    return Boolean(row);
  } catch (error) {
    if (/relation .*mustahik_case_assignments.* does not exist/i.test(String(error?.message))) return false;
    throw error;
  }
}

function kindAllowed(actor, kind, { internal = false, write = false } = {}) {
  const role = String(actor?.role || '').trim().toLowerCase();
  const division = String(actor?.division || '').trim().toLowerCase();
  const level = String(actor?.level || '').trim().toLowerCase();
  const isPenyaluranDiv = division.includes('penyaluran') || division.includes('pendistribusian');
  if (kind === 'system_receipt_pdf') {
    // Receipt generation is a service-to-service operation.  The private
    // seam is only available to trusted callers; an HTTP actor cannot claim
    // this by setting a role or a request field.
    if (!write) return ['penyaluran', 'keuangan'].includes(role);
    return internal === true && (role === 'system' || (role === 'penyaluran' && ['staff', 'leader', 'kepala', 'manager', 'chief'].includes(level)));
  }
  if (kind === 'payment_proof') {
    if (write) return role === 'keuangan' && division.includes('keuangan') && ['staff', 'leader', 'kepala', 'manager', 'chief'].includes(level);
    return (role === 'keuangan' && division.includes('keuangan')) || (role === 'penyaluran' && isPenyaluranDiv);
  }
  if (kind === 'recipient_confirmation') {
    if (write) return (role === 'penyaluran' && isPenyaluranDiv && ['staff', 'leader', 'kepala', 'manager', 'chief'].includes(level)) || role === 'surveyor';
    return ['penyaluran', 'surveyor', 'keuangan'].includes(role);
  }
  return (role === 'penyaluran' && isPenyaluranDiv && ['staff', 'leader', 'kepala', 'manager', 'chief'].includes(level)) || role === 'surveyor' || (role === 'keuangan' && division.includes('keuangan'));
}

async function authorizeArtifact(db, file, mustahikId, actor, { requireAssignment = true } = {}) {
  if (!file || Number(file.mustahik_id) !== Number(mustahikId)) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  if (!ARTIFACT_KINDS.has(file.kind)) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  if (isAdmin(actor)) {
    assertAllowed(ACTIONS.CROSS_CASE_AUDIT, actor);
    return;
  }
  assertAllowed(ACTIONS.CASE_READ, actor);
  if (!kindAllowed(actor, file.kind)) fail('PERMISSION_DENIED', 'Aktor tidak memiliki akses berkas.', 403);
  if (requireAssignment && !(await activeAssignment(db, mustahikId, actor))) fail('PERMISSION_DENIED', 'Akses kasus dibatasi penugasan aktif.', 403);
}

/** Authorize a case read before a receipt artifact exists (pending/failed states). */
export async function authorizeCaseRead(db, mustahikId, actor, { requireAssignment = true, artifactKind = null } = {}) {
  const caseRow = await db.get('SELECT id FROM mustahik WHERE id=$1', [mustahikId]);
  if (!caseRow) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  if (isAdmin(actor)) {
    assertAllowed(ACTIONS.CROSS_CASE_AUDIT, actor);
    return caseRow;
  }
  assertAllowed(ACTIONS.CASE_READ, actor);
  if (artifactKind && !kindAllowed(actor, artifactKind)) fail('PERMISSION_DENIED', 'Aktor tidak memiliki akses berkas.', 403);
  if (requireAssignment && !(await activeAssignment(db, mustahikId, actor))) fail('PERMISSION_DENIED', 'Akses kasus dibatasi penugasan aktif.', 403);
  return caseRow;
}

async function authorizeArtifactWrite(db, metadata, mustahikId, actor, options) {
  const kind = metadata.kind;
  const internal = options.receiptCapability === INTERNAL_RECEIPT_CAPABILITY;
  if (!internal) {
    if (!kindAllowed(actor, kind, { write: true })) fail('PERMISSION_DENIED', 'Aktor tidak memiliki kapabilitas unggah berkas.', 403);
    assertAllowed(ACTIONS.CASE_READ, actor);
    if (options.requireAssignment !== false && !(await activeAssignment(db, mustahikId, actor))) fail('PERMISSION_DENIED', 'Akses kasus dibatasi penugasan aktif.', 403);
  } else if (kind !== 'system_receipt_pdf') {
    fail('PERMISSION_DENIED', 'Kapabilitas internal hanya berlaku untuk tanda terima.', 403);
  }

  const artifactType = String(metadata.artifact_type ?? metadata.artifactType ?? '').trim().toLowerCase();
  const parentTable = ARTIFACT_PARENT_TABLE[artifactType];
  if (!parentTable) fail('FIELD_INVALID', 'Jenis artefak tidak valid.', 422);
  // The identity is server checked against the actual active parent row.  A
  // request cannot forge case, type, or revision metadata merely by passing
  // a valid integer.
  const parent = await db.get(
    `SELECT id,mustahik_id,revision,status,source FROM ${parentTable} WHERE id=$1 AND mustahik_id=$2 AND revision=$3`,
    [metadata.artifact_id ?? metadata.artifactId, mustahikId, metadata.artifact_revision ?? metadata.artifactRevision ?? 1],
  );
  if (!parent) fail('ARTIFACT_NOT_FOUND', 'Artefak induk tidak ditemukan.', 404);
  const requestedArtifactId = canonicalId(metadata.artifact_id ?? metadata.artifactId);
  const requestedRevision = canonicalId(metadata.artifact_revision ?? metadata.artifactRevision) || 1;
  if (Number(parent.id) !== requestedArtifactId || Number(parent.mustahik_id) !== mustahikId || Number(parent.revision) !== requestedRevision) {
    fail('ARTIFACT_NOT_FOUND', 'Artefak induk tidak ditemukan.', 404);
  }
  if (parent.source !== undefined && parent.source !== null && String(parent.source).toLowerCase() !== 'p0') fail('PERMISSION_DENIED', 'Artefak induk bukan bagian dari workflow P0.', 403);
  if (['payment_proof', 'recipient_confirmation', 'system_receipt_pdf'].includes(kind) && artifactType !== 'ppd') fail('FIELD_INVALID', 'Jenis artefak tidak sesuai.', 422);
  if (internal && !['completed', 'complete'].includes(String(parent.status || '').toLowerCase())) fail('WRONG_STATE', 'Tanda terima hanya dapat dibuat setelah penyelesaian.', 409);
}

/** Persist an immutable artifact after validation and atomic rename. */
export async function storeArtifactFile(input = {}, dependencies = {}) {
  const options = { ...input, ...dependencies };
  const file = options.file || options.upload || {};
  const bytes = asBuffer(file.buffer || options.bytes);
  const validation = validateArtifactBytes(bytes);
  const mustahikId = canonicalId(options.mustahik_id ?? options.mustahikId ?? options.caseId);
  const artifactId = canonicalId(options.artifact_id ?? options.artifactId);
  const revision = canonicalId(options.artifact_revision ?? options.artifactRevision) || 1;
  const kind = options.kind;
  if (!mustahikId || !artifactId || !ARTIFACT_KINDS.has(kind)) fail('FIELD_INVALID', 'Metadata berkas tidak valid.', 422);
  const db = options.db || await getDb();
  const { root } = await assertPrivateArtifactRoot(options.artifactRoot || options.root || options.artifact_dir, options);
  await fs.promises.mkdir(root, { recursive: true });
  const uuid = options.uuid || crypto.randomUUID;
  const storedName = generatedName(validation.extension, uuid);
  const tempName = `.${storedName}.${uuid()}.tmp`;
  const tempPath = path.join(root, tempName); const finalPath = path.join(root, storedName);
  let renamed = false;
  try {
    return await withTransaction(db, async (tx) => {
      const caseRow = await tx.get('SELECT id FROM mustahik WHERE id=$1 FOR UPDATE', [mustahikId]);
      if (!caseRow) fail('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', 404);
      // Every P0 command takes the case lock before the global hash lock.
      // Keeping this order here (including nested callers) avoids the
      // case->hash / hash->case deadlock during concurrent uploads.
      await lockHashForTransaction(tx, validation.sha256);
      await authorizeArtifactWrite(tx, {
        ...options,
        kind,
        artifact_id: artifactId,
        artifact_revision: revision,
      }, mustahikId, options.actor, options);
      const total = await tx.get('SELECT COALESCE(SUM(byte_size),0) AS total FROM artifact_files WHERE mustahik_id=$1', [mustahikId]);
      const existingTotal = Number(total?.total || 0);
      if (existingTotal + bytes.length > MAX_CASE_ARTIFACT_BYTES) fail('CASE_ARTIFACT_QUOTA_EXCEEDED', 'Kuota berkas kasus melebihi 30 MB.', 413);
      const duplicate = await tx.get('SELECT id FROM artifact_files WHERE sha256=$1 LIMIT 1', [validation.sha256]);
      if (duplicate) fail('DUPLICATE_ARTIFACT', 'Berkas identik sudah tersimpan.', 409);
      const handle = await fs.promises.open(tempPath, 'wx');
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
      try {
        await fs.promises.access(finalPath);
        fail('ARTIFACT_STORAGE_CONFLICT', 'Nama berkas penyimpanan bertabrakan.', 503);
      } catch (error) {
        if (error instanceof P0Error) throw error;
        if (error?.code !== 'ENOENT') throw error;
      }
      await fs.promises.rename(tempPath, finalPath); renamed = true;
      const registerRollbackCleanup = options.registerRollbackCleanup || (typeof tx.onRollback === 'function' ? tx.onRollback.bind(tx) : null);
      if (typeof registerRollbackCleanup === 'function') {
        registerRollbackCleanup(() => fs.promises.unlink(finalPath).catch(() => {}));
      }
      const result = await tx.run(`INSERT INTO artifact_files (mustahik_id,artifact_type,artifact_id,artifact_revision,kind,stored_name,original_name,mime_type,byte_size,sha256,uploaded_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [mustahikId, options.artifact_type ?? options.artifactType ?? 'unknown', artifactId, revision, kind, storedName, safeOriginalName(file.originalname || file.original_name), validation.mimeType, bytes.length, validation.sha256, actorId(options.actor)]);
      return { success: true, data: result?.rows?.[0] || { id: result?.lastID, mustahik_id: mustahikId, artifact_id: artifactId, artifact_revision: revision, kind, stored_name: storedName, original_name: safeOriginalName(file.originalname), mime_type: validation.mimeType, byte_size: bytes.length, sha256: validation.sha256 } };
    });
  } catch (error) {
    if (error?.code === '23505' || /unique constraint|duplicate key/i.test(String(error?.message || ''))) {
      fail('DUPLICATE_ARTIFACT', 'Berkas identik sudah tersimpan.', 409);
    }
    await fs.promises.unlink(tempPath).catch(() => {});
    if (renamed) await fs.promises.unlink(finalPath).catch(() => {});
    throw error;
  }
}

function containment(rootReal, candidateReal) {
  const relative = path.relative(rootReal, candidateReal);
  return Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Authorize and open one immutable artifact handle, retaining the opened file for streaming. */
export async function openArtifactForActor(options = {}, _maybeActor, _maybeFileId) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || arguments.length > 1) {
    throw new TypeError('openArtifactForActor requires an explicit options object.');
  }
  const opts = options;
  const db = opts.db || await getDb(); const actor = opts.actor || opts.user || {};
  const mustahikId = canonicalId(opts.mustahik_id ?? opts.mustahikId ?? opts.caseId); const fileId = canonicalId(opts.fileId ?? opts.file_id);
  if (!mustahikId || !fileId) fail('FIELD_INVALID', 'Identitas berkas tidak valid.', 400);
  const file = opts.file || await db.get('SELECT * FROM artifact_files WHERE id=$1', [fileId]);
  if (!file) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  await authorizeArtifact(db, file, mustahikId, actor, opts);
  if (!isSafeStoredName(file.stored_name)) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  const { rootReal } = await assertPrivateArtifactRoot(opts.artifactRoot || opts.root || opts.artifact_dir, opts);
  let candidateReal;
  try { candidateReal = await fs.promises.realpath(path.join(rootReal, file.stored_name)); } catch { fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404); }
  if (!containment(rootReal, candidateReal)) fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404);
  const opener = opts.openFile || (async (candidate) => fs.promises.open(candidate, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)));
  let handle;
  try { handle = await opener(candidateReal); const stat = handle.stat ? await handle.stat() : await fs.promises.stat(candidateReal); if (!stat.isFile() || Number(stat.size) !== Number(file.byte_size)) throw new Error('invalid artifact'); return { file, handle, stat, root: rootReal, path: candidateReal }; } catch { if (handle?.close) await handle.close().catch(() => {}); fail('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', 404); }
}

function parseRange(value, size) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value).trim());
  if (!match || (match[1] === '' && match[2] === '') || String(value).includes(',')) return null;
  let start; let end;
  if (match[1] === '') { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix < 1) return null; start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] === '' ? size - 1 : Number(match[2]); if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null; end = Math.min(end, size - 1); }
  return { start, end, partial: true };
}
function displayName(name) { const clean = safeOriginalName(name).replace(/[\r\n]/g, '_'); const ascii = clean.replace(/[^A-Za-z0-9._ -]/g, '_') || 'evidence'; return { ascii: ascii.slice(0, 180), encoded: encodeURIComponent(clean) }; }
function responseOf(options) { return options.response || options.res; }

/** Insert audit event before sending any artifact headers or bytes, then stream one range. */
export async function streamAuditedArtifact(options = {}) {
  const res = responseOf(options); const file = options.file || options.artifact?.file;
  const opened = options.opened || (options.open ? await options.open(file) : null) || (options.artifact?.handle ? options.artifact : null) || options.fileHandle;
  const actor = options.actor || options.user || {};
  if (!res || !file || !opened) throw new TypeError('response, file and opened artifact are required');
  const size = Number(opened.stat?.size ?? file.byte_size); const rangeValue = options.range ?? options.req?.headers?.range ?? options.request?.headers?.range;
  const range = parseRange(rangeValue, size);
  if (!range) { await opened.handle?.close?.().catch?.(() => {}); res.status(416).setHeader?.('Content-Range', `bytes */${size}`); return res.end?.(); }
  const action = options.receipt ? 'download' : (options.disposition === 'attachment' ? 'download' : 'inline_view');
  const correlationId = options.correlationId || crypto.randomUUID();
  try {
    const audit = options.insertAccessEvent || (async (event) => {
      const db = options.db || await getDb();
      return db.run(`INSERT INTO artifact_access_events (file_id,mustahik_id,artifact_type,artifact_id,artifact_revision,actor_id,actor_name,actor_role,actor_level,actor_division,action,correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [file.id, file.mustahik_id, file.artifact_type, file.artifact_id, file.artifact_revision, actorId(actor), String(actor.name || actor.full_name || 'Unknown'), String(actor.role || ''), String(actor.level || ''), String(actor.division || ''), event.action, event.correlation_id]);
    });
    await audit({ file, actor, action, correlation_id: correlationId });
  } catch { await opened.handle?.close?.().catch?.(() => {}); res.status(503); return res.json?.(new P0Error('ACCESS_AUDIT_UNAVAILABLE', 'Audit akses berkas tidak tersedia.', { status: 503 }).toJSON()); }
  const name = displayName(file.original_name); const contentLength = range.end - range.start + 1;
  res.status(range.partial ? 206 : 200); res.setHeader('Content-Type', file.mime_type); res.setHeader('Content-Length', String(contentLength)); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Content-Disposition', `${action === 'download' ? 'attachment' : 'inline'}; filename="${name.ascii}"; filename*=UTF-8''${name.encoded}`); if (range.partial) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`); res.setHeader('Accept-Ranges', 'bytes');
  const stream = opened.handle?.createReadStream ? opened.handle.createReadStream({ start: range.start, end: range.end, autoClose: true }) : (opened.stream ? opened.stream(range) : Readable.from([]));
  if (typeof stream.pipe === 'function') {
    const closeHandle = () => opened.handle?.close?.().catch?.(() => {});
    stream.once?.('close', closeHandle);
    stream.once?.('end', closeHandle);
    res.once?.('finish', closeHandle);
    res.once?.('close', closeHandle);
    return stream.pipe(res);
  }
  return res.end?.(stream);
}

export function createP0ArtifactUpload() { return multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARTIFACT_BYTES, files: 1 } }); }

/**
 * Return the only supported writer for generated receipt PDFs.  The capability
 * is a module-private symbol, so HTTP input cannot self-assert internal trust.
 */
export function createP0SystemReceiptStore() {
  return (input = {}, dependencies = {}) => storeArtifactFile(input, { ...dependencies, receiptCapability: INTERNAL_RECEIPT_CAPABILITY });
}

export { parseRange, safeOriginalName };
