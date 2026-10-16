import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb as defaultGetDb, withTransaction } from '../db.js';
import { assertPrivateArtifactRoot } from './artifact-files.js';
import { P0Error } from './errors.js';
import { buildReceiptPayload, renderDistributionReceipt } from './receipt-renderer.js';

const RECEIPT_KIND = 'system_receipt_pdf';
const SHA256 = /^[a-f0-9]{64}$/;
const LEASE_MS = 5 * 60 * 1000;
const DEFAULT_WAIT_MS = 30 * 1000;
const DEFAULT_POLL_MS = 100;

function fail(code, message, status = 503, details) {
  throw new P0Error(code, message, { status, details });
}
function jsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}
function idOf(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail('FIELD_INVALID', 'ppd_id tidak valid.', 400);
  return id;
}
function first(result) { return result?.rows?.[0] || result?.[0] || null; }
async function query(db, sql, params = []) {
  if (typeof db.query === 'function') return db.query(sql, params);
  if (typeof db.run === 'function') return db.run(sql, params);
  throw new TypeError('Receipt database query seam is required.');
}
async function get(db, sql, params = []) {
  if (typeof db.get === 'function') return db.get(sql, params);
  return first(await query(db, sql, params));
}
async function all(db, sql, params = []) {
  if (typeof db.all === 'function') return db.all(sql, params);
  const result = await query(db, sql, params);
  return result?.rows || [];
}
async function transaction(db, callback) {
  if (db?._isInTransaction || typeof db.transaction === 'function') return typeof db.transaction === 'function' ? db.transaction(callback) : callback(db);
  if (db?.pool || db?.isPg || typeof db?.run === 'function') return withTransaction(db, callback);
  return callback(db);
}
function clock(deps = {}) {
  const value = typeof deps.now === 'function' ? deps.now() : (deps.now ?? Date.now());
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Receipt clock must return a valid date.');
  return date;
}
function uuid(deps = {}) { return typeof deps.randomUUID === 'function' ? deps.randomUUID() : crypto.randomUUID(); }
function rootInput(deps = {}) { return deps.artifactRoot || deps.artifact_dir || deps.root || process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts'); }
async function validatedRoot(deps) { return (await assertPrivateArtifactRoot(rootInput(deps), deps)).root; }
function statusReady(row) { return String(row?.receipt_status || '').toLowerCase() === 'ready'; }
function statusProcessing(row) { return String(row?.receipt_status || '').toLowerCase() === 'processing'; }
function statusFailed(row) { return String(row?.receipt_status || '').toLowerCase() === 'failed'; }
function completed(row) { return ['completed', 'complete'].includes(String(row?.status || '').toLowerCase()); }
function safeErrorCode(error) { return String(error?.code || (error instanceof P0Error ? 'P0_ERROR' : 'RECEIPT_RENDER_FAILED')).replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120); }
function failure(error) { return new P0Error('RECEIPT_GENERATION_FAILED', 'Bukti digital gagal dibuat.', { status: 503, details: { reason: safeErrorCode(error) } }); }
function iso(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) fail('RECEIPT_DATA_INCOMPLETE', `${label} is missing from persisted data.`, 422);
  return date.toISOString();
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail('RECEIPT_DATA_INCOMPLETE', `${label} is missing from persisted data.`, 422);
  return number;
}
function snapshot(row) { return jsonValue(row?.snapshot_json) || {}; }
function maskNik(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{8,}$/.test(raw)) fail('RECEIPT_DATA_INCOMPLETE', 'Recipient NIK is missing from persisted data.', 422);
  return `${raw.slice(0, 4)}${'*'.repeat(Math.max(4, raw.length - 8))}${raw.slice(-4)}`;
}
function addressFrom(mpzisSnapshot) {
  const address = mpzisSnapshot.address_snapshot;
  if (!address || typeof address !== 'object') fail('RECEIPT_DATA_INCOMPLETE', 'Recipient address snapshot is missing.', 422);
  return address;
}
function actorFromApproval(row, label) {
  return { actor_id: row.actor_id, actor_name: row.actor_name, actor_role: row.actor_role, actor_level: row.actor_level, actor_division: row.actor_division, created_at: row.created_at, snapshot_hash: row.snapshot_hash, approval_step: row.approval_step || label };
}
function persistedActor(row, label) {
  if (!row) fail('RECEIPT_DATA_INCOMPLETE', `${label} event is missing from persisted data.`, 422);
  positive(row.actor_id, `${label} actor`);
  for (const field of ['actor_name', 'actor_role', 'actor_level', 'actor_division']) {
    if (row[field] === null || row[field] === undefined || !String(row[field]).trim()) fail('RECEIPT_DATA_INCOMPLETE', `${label} ${field} is missing from persisted data.`, 422);
  }
  iso(row.created_at, `${label} event time`);
  if (!SHA256.test(String(row.snapshot_hash || '').trim())) fail('RECEIPT_DATA_INCOMPLETE', `${label} snapshot hash is missing from persisted data.`, 422);
  return actorFromApproval(row, label);
}
function persistedHash(value, label, code = 'RECEIPT_FILE_MISSING', status = 503) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SHA256.test(normalized)) fail(code, `${label} is missing or invalid.`, status);
  return normalized;
}

/** Load only immutable P0 snapshots and append-only events required by the receipt. */
export async function loadReceiptBundle(ppdId, { db, ppd } = {}) {
  const row = ppd || await get(db, 'SELECT * FROM ppd WHERE id=$1', [ppdId]);
  if (!row || !completed(row) || String(row.source || '').toLowerCase() !== 'p0') fail('RECEIPT_DATA_INCOMPLETE', 'Completed P0 PPD is required.', 422);
  if (!/^\d{4}$/.test(String(row.bank_account_last4 || '').trim())) fail('RECEIPT_DATA_INCOMPLETE', 'Persisted PPD bank account suffix is missing or invalid.', 422);
  const ppdSnapshot = snapshot(row);
  const mustahik = await get(db, 'SELECT * FROM mustahik WHERE id=$1', [row.mustahik_id]);
  const mpzisId = row.mpzis_id ?? ppdSnapshot.approved_mpzis_id;
  const mpzis = await get(db, 'SELECT * FROM mpzis WHERE id=$1 AND mustahik_id=$2 AND revision=$3 AND source=\'p0\'', [mpzisId, row.mustahik_id, ppdSnapshot.approved_mpzis_revision ?? 1]);
  const mpzisSnapshot = snapshot(mpzis);
  const assessmentId = mpzisSnapshot.accepted_assessment_id;
  const assessment = await get(db, 'SELECT * FROM assessments WHERE id=$1 AND mustahik_id=$2 AND revision=$3 AND source=\'p0\'', [assessmentId, row.mustahik_id, mpzisSnapshot.accepted_assessment_revision ?? 1]);
  const assessmentSnapshot = snapshot(assessment);
  const mpzisApprovals = await all(db, "SELECT * FROM artifact_approvals WHERE artifact_type='mpzis' AND artifact_id=$1 AND artifact_revision=$2 AND action='approve' ORDER BY id", [mpzis?.id, mpzis?.revision]);
  const ppdEvents = await all(db, "SELECT * FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 ORDER BY id", [row.id, row.revision]);
  const financeCheck = ppdEvents.find((event) => event.action === 'finance_check');
  const financeApprove = ppdEvents.find((event) => event.action === 'finance_approve');
  const payment = await get(db, 'SELECT * FROM ppd_payments WHERE ppd_id=$1', [row.id]);
  const confirmation = await get(db, 'SELECT * FROM recipient_confirmations WHERE ppd_id=$1', [row.id]);
  const rabRows = await all(db, 'SELECT id,line_no,register_number,description,amount FROM ppd_rab_lines WHERE ppd_id=$1 ORDER BY line_no,id', [row.id]);
  const paymentSnapshot = snapshot(payment);
  const confirmationSnapshot = snapshot(confirmation);
  const proof = payment?.proof_file_id ? await get(db, 'SELECT * FROM artifact_files WHERE id=$1', [payment.proof_file_id]) : null;
  const evidence = confirmation?.evidence_file_id ? await get(db, 'SELECT * FROM artifact_files WHERE id=$1', [confirmation.evidence_file_id]) : null;
  if (!proof || proof.kind !== 'payment_proof' || Number(proof.mustahik_id) !== Number(row.mustahik_id) || proof.artifact_type !== 'ppd' || Number(proof.artifact_id) !== Number(row.id) || Number(proof.artifact_revision) !== Number(row.revision)) fail('RECEIPT_DATA_INCOMPLETE', 'Payment proof artifact is missing or out of scope.', 422);
  if (confirmation?.evidence_file_id && (!evidence || evidence.kind !== 'recipient_confirmation' || Number(evidence.mustahik_id) !== Number(row.mustahik_id) || evidence.artifact_type !== 'ppd' || Number(evidence.artifact_id) !== Number(row.id) || Number(evidence.artifact_revision) !== Number(row.revision))) fail('RECEIPT_DATA_INCOMPLETE', 'Confirmation evidence artifact is missing or out of scope.', 422);
  const completionEvent = ppdEvents.find((event) => event.action === 'complete' && event.approval_step === 'complete');
  if (!completionEvent) fail('RECEIPT_DATA_INCOMPLETE', 'Completion event is missing from persisted data.', 422);
  const confirmationEvent = ppdEvents.find((event) => event.action === 'recipient_confirmed' && event.approval_step === 'recipient_confirmed');
  const confirmationActor = persistedActor(confirmationEvent, 'recipient confirmation');
  const completionActor = persistedActor(completionEvent, 'completion');
  const completionSnapshot = jsonValue(completionEvent.completion_snapshot_json);
  if (!completionSnapshot || typeof completionSnapshot !== 'object' || Array.isArray(completionSnapshot)) fail('RECEIPT_DATA_INCOMPLETE', 'Completion snapshot is missing from persisted data.', 422);
  const eventCorrelation = completionEvent.correlation_id ? String(completionEvent.correlation_id).trim() : '';
  const snapshotCorrelation = completionSnapshot.completion_correlation_id ? String(completionSnapshot.completion_correlation_id).trim() : '';
  if (!eventCorrelation && !snapshotCorrelation) fail('RECEIPT_DATA_INCOMPLETE', 'Completion correlation is missing from persisted data.', 422);
  if (eventCorrelation && snapshotCorrelation && eventCorrelation !== snapshotCorrelation) fail('RECEIPT_DATA_INCOMPLETE', 'Completion correlation does not match persisted provenance.', 422);
  const completionHash = persistedHash(completionEvent.completion_hash, 'Completion hash', 'RECEIPT_DATA_INCOMPLETE', 422);
  if (!SHA256.test(String(confirmation?.snapshot_hash || '').trim())) fail('RECEIPT_DATA_INCOMPLETE', 'Confirmation snapshot hash is missing from persisted data.', 422);
  const sourceFields = Object.fromEntries(['husband_in_household', 'husband_name', 'wife_in_household', 'wife_name', 'child_count', 'house_ownership', 'home_address', 'address_matches_ktp', 'monthly_rent_amount', 'husband_occupation', 'husband_monthly_income', 'wife_occupation', 'wife_monthly_income', 'child_occupation', 'child_monthly_support', 'assistance_request', 'applied_to_baznas_before', 'previous_application_year'].map((key) => [key, assessmentSnapshot[key]]));
  const recipientAddress = addressFrom(mpzisSnapshot);
  return {
    receipt_id: row.receipt_id || `RCP-PPD-${row.id}-${row.revision}`,
    created_at: iso(completionEvent.created_at, 'receipt creation time'),
    case_number: mustahik?.file_no,
    mustahik_id: row.mustahik_id,
    recipient: { name: mpzisSnapshot.recipient_name, nik_mask: maskNik(mustahik?.nik), ...recipientAddress },
    assessment: { id: assessment?.id, revision: assessment?.revision, status: assessment?.status, snapshot_hash: assessment?.snapshot_hash, source_fields: sourceFields },
    mpzis: { id: mpzis?.id, revision: mpzis?.revision, form_number: mpzisSnapshot.form_number, classification: mpzisSnapshot.program_classification, purpose: mpzisSnapshot.purpose, asnaf: mpzisSnapshot.asnaf, fund_source: mpzisSnapshot.fund_source, recipient_name: mpzisSnapshot.recipient_name, recipient_type: mpzisSnapshot.recipient_type, beneficiary_count: mpzisSnapshot.beneficiary_count, amount: mpzisSnapshot.total_amount, snapshot_hash: mpzis?.snapshot_hash, created_by_id: mpzis?.created_by_id, submitted_by_id: mpzis?.submitted_by_id, approvals: mpzisApprovals.map((event) => actorFromApproval(event, event.approval_step)) },
    ppd: { id: row.id, revision: row.revision, form_number: ppdSnapshot.form_number, ppd_number: ppdSnapshot.ppd_number, transaction_number: ppdSnapshot.transaction_number, requester_name: ppdSnapshot.requester_name_snapshot, requester_role: ppdSnapshot.requester_role_snapshot, requester_department: ppdSnapshot.requester_department_snapshot, fund_source: ppdSnapshot.fund_source, payment_type: ppdSnapshot.payment_type, bank_name: ppdSnapshot.bank_name, bank_account_last4: row.bank_account_last4, bank_account_name: row.bank_account_name ?? ppdSnapshot.bank_account_name, rab_lines: rabRows.length ? rabRows : ppdSnapshot.rab_lines, amount: row.amount, amount_in_words: row.amount_in_words, snapshot_hash: row.snapshot_hash },
    finance: { check: financeCheck, approve: financeApprove },
    payment: { transaction_number: paymentSnapshot.transaction_number || payment?.transaction_number, amount: paymentSnapshot.paid_amount || payment?.paid_amount, paid_at: paymentSnapshot.paid_at || payment?.paid_at, proof_file_id: proof.id, proof_file_revision: proof.artifact_revision, proof_sha256: proof.sha256 },
    confirmation: { method: confirmationSnapshot.method || confirmation?.method, confirmed_at: confirmationSnapshot.confirmed_at || confirmation?.confirmed_at, snapshot_hash: confirmation.snapshot_hash, actor: confirmationActor, evidence_file_id: evidence?.id || null, evidence_file_revision: evidence?.artifact_revision || null, evidence_sha256: evidence?.sha256 || null },
    completion: { actor: completionActor, completed_at: completionEvent.created_at, correlation_id: eventCorrelation || snapshotCorrelation, snapshot_hash: completionEvent.snapshot_hash, completion_hash: completionHash },
  };
}

async function receiptFile(db, ppd) {
  if (ppd?.receipt_file_id) return get(db, "SELECT * FROM artifact_files WHERE id=$1 AND mustahik_id=$2 AND artifact_type='ppd' AND artifact_id=$3 AND artifact_revision=$4 AND kind='system_receipt_pdf'", [ppd.receipt_file_id, ppd.mustahik_id, ppd.id, ppd.revision]);
  return get(db, "SELECT * FROM artifact_files WHERE mustahik_id=$1 AND artifact_type='ppd' AND artifact_id=$2 AND artifact_revision=$3 AND kind='system_receipt_pdf' LIMIT 1", [ppd.mustahik_id, ppd.id, ppd.revision]);
}
function readyResult(ppd, file) {
  if (!file) fail('RECEIPT_FILE_MISSING', 'Bukti digital tersimpan tidak ditemukan.', 503);
  const fileSha = persistedHash(file.sha256, 'Persisted receipt file hash');
  const rowSha = persistedHash(ppd.receipt_file_sha256, 'Persisted receipt metadata hash');
  if (fileSha !== rowSha) fail('RECEIPT_FILE_MISSING', 'Berkas tanda terima tidak cocok dengan metadata tersimpan.', 503);
  return { success: true, receipt_status: 'ready', ppd_id: Number(ppd.id), file_id: Number(file.id), file_sha256: fileSha, receipt_payload_sha256: String(ppd.receipt_payload_sha256 || ''), stored_name: file.stored_name };
}

async function claim(ppdId, deps, { skipWait = false } = {}) {
  const db = deps.db || await (deps.getDb || defaultGetDb)();
  const now = clock(deps); const leaseMs = Number(deps.leaseMs || LEASE_MS); const token = uuid(deps); const correlationId = crypto.randomUUID(); const expires = new Date(now.getTime() + leaseMs);
  return transaction(db, async (tx) => {
    const ppd = await get(tx, 'SELECT * FROM ppd WHERE id=$1 FOR UPDATE', [ppdId]);
    if (!ppd) fail('PPD_NOT_FOUND', 'PPD tidak ditemukan.', 404);
    if (!completed(ppd)) fail('WRONG_STATE', 'Bukti digital hanya tersedia setelah penyelesaian.', 409);
    if (statusReady(ppd)) return { db, kind: 'ready', ppd, file: await receiptFile(tx, ppd) };
    if (statusProcessing(ppd) && !skipWait && ppd.receipt_lease_expires_at && new Date(ppd.receipt_lease_expires_at).getTime() > now.getTime()) return { db, kind: 'active', ppd };
    const result = await query(tx, `UPDATE ppd SET receipt_status='processing',receipt_lease_token=$1,receipt_lease_started_at=$2,receipt_lease_expires_at=$3,receipt_error=NULL WHERE id=$4 AND (receipt_status IS NULL OR receipt_status IN ('pending','failed') OR (receipt_status='processing' AND (receipt_lease_expires_at IS NULL OR receipt_lease_expires_at <= $2))) RETURNING *`, [token, now.toISOString(), expires.toISOString(), ppdId]);
    const owned = first(result);
    if (!owned) return { db, kind: 'active', ppd };
    return { db, kind: 'owner', ppd: owned, token, correlationId, now, expires };
  });
}
async function sleep(deps, ms) { if (typeof deps.sleep === 'function') return deps.sleep(ms); return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitForActive(ppdId, deps, lease) {
  const deadline = Date.now() + Number(deps.waitTimeoutMs || DEFAULT_WAIT_MS); const interval = Number(deps.pollIntervalMs || DEFAULT_POLL_MS);
  while (Date.now() < deadline) {
    await sleep(deps, interval);
    const db = deps.db || await (deps.getDb || defaultGetDb)(); const ppd = await get(db, 'SELECT * FROM ppd WHERE id=$1', [ppdId]);
    if (statusReady(ppd)) return readyResult(ppd, await receiptFile(db, ppd));
    if (statusFailed(ppd)) throw failure({ code: ppd.receipt_error || 'RECEIPT_GENERATION_FAILED' });
    if (!statusProcessing(ppd) || !ppd?.receipt_lease_expires_at || new Date(ppd.receipt_lease_expires_at).getTime() <= Date.now()) return null;
  }
  return { success: true, receipt_status: 'processing', ppd_id: ppdId, file_id: null };
}
async function writeLeaseFile(bytes, ppd, token, deps) {
  const root = await validatedRoot(deps); await fs.mkdir(root, { recursive: true });
  const finalName = `receipt-${ppd.id}-${ppd.revision}-${token}.pdf`; const tempName = `.${finalName}.tmp`; const tempPath = path.join(root, tempName); const finalPath = path.join(root, finalName);
  const fileSystem = deps.fileSystem || fs;
  let created = false; let renamed = false;
  try {
    const handle = await fileSystem.open(tempPath, 'wx'); created = true;
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
    const persisted = await fileSystem.readFile(tempPath); const fileSha = crypto.createHash('sha256').update(persisted).digest('hex');
    try { await fileSystem.access(finalPath); fail('RECEIPT_STORAGE_CONFLICT', 'Receipt file path already exists.', 503); } catch (error) { if (error instanceof P0Error) throw error; if (error?.code !== 'ENOENT') throw error; }
    await fileSystem.rename(tempPath, finalPath); renamed = true;
    return { root, finalName, tempPath, finalPath, fileSha, byteSize: persisted.length };
  } catch (error) {
    if (created) await fileSystem.unlink(tempPath).catch(() => {});
    if (renamed) await fileSystem.unlink(finalPath).catch(() => {});
    throw error;
  }
}
async function cleanupUnreferenced(filePath, storedName, db) {
  if (!filePath) return;
  let referenced;
  try { referenced = Boolean(await get(db, 'SELECT id FROM artifact_files WHERE stored_name=$1 LIMIT 1', [storedName])); } catch { return; }
  if (!referenced) await fs.unlink(filePath).catch(() => {});
}
async function finalize(ppdId, owner, bundle, file, deps) {
  const payloadHash = buildReceiptPayload(bundle).receipt_payload_sha256;
  const db = owner.db;
  return transaction(db, async (tx) => {
    const current = await get(tx, 'SELECT * FROM ppd WHERE id=$1 FOR UPDATE', [ppdId]);
    if (!current || statusReady(current)) return { existing: true, ppd: current, file: await receiptFile(tx, current) };
    if (String(current.receipt_lease_token || '') !== String(owner.token)) fail('RECEIPT_LEASE_LOST', 'Receipt generation lease is no longer owned.', 409);
    let artifact = await receiptFile(tx, current);
    if (!artifact) {
      const inserted = await query(tx, `INSERT INTO artifact_files (mustahik_id,artifact_type,artifact_id,artifact_revision,kind,stored_name,original_name,mime_type,byte_size,sha256,uploaded_by_id) VALUES ($1,'ppd',$2,$3,'system_receipt_pdf',$4,$5,'application/pdf',$6,$7,NULL) RETURNING *`, [current.mustahik_id, current.id, current.revision, file.finalName, 'Bukti-Digital-Penyaluran.pdf', file.byteSize, file.fileSha]);
      artifact = first(inserted) || { id: inserted.lastID, mustahik_id: current.mustahik_id, artifact_type: 'ppd', artifact_id: current.id, artifact_revision: current.revision, kind: RECEIPT_KIND, stored_name: file.finalName, byte_size: file.byteSize, sha256: file.fileSha };
      if (!artifact?.id) fail('RECEIPT_ARTIFACT_INSERT_FAILED', 'Receipt artifact identity was not persisted.', 503);
    }
    const generationEvent = await get(tx, "SELECT id,completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 AND approval_step='receipt_generated' AND action='receipt_generated' ORDER BY id LIMIT 1", [current.id, current.revision]);
    if (!generationEvent) {
      await query(tx, `INSERT INTO artifact_approvals (mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,note,correlation_id,actor_id,actor_name,actor_role,actor_level,actor_division,completion_hash,completion_snapshot_json) VALUES ($1,'ppd',$2,$3,'receipt_generated','receipt_generated',$4,$5,$6,NULL,'System receipt job','system','system','Penyaluran',$7,$8)`, [current.mustahik_id, current.id, current.revision, payloadHash, 'Bukti digital generated from immutable persisted receipt data.', owner.correlationId, file.fileSha, JSON.stringify({ event_type: 'receipt_generated', artifact_type: 'ppd', artifact_id: Number(current.id), artifact_revision: Number(current.revision), receipt_payload_sha256: payloadHash, file_id: Number(artifact.id), file_sha256: file.fileSha, actor_snapshot: { actor_id: null, actor_name: 'System receipt job', actor_role: 'system', actor_level: 'system', actor_division: 'Penyaluran' } })]);
    } else {
      const eventPayload = jsonValue(generationEvent.completion_snapshot_json) || {};
      if (Number(eventPayload.file_id) !== Number(artifact.id)
        || String(eventPayload.file_sha256 || '').toLowerCase() !== String(file.fileSha).toLowerCase()
        || String(eventPayload.receipt_payload_sha256 || '').toLowerCase() !== String(payloadHash).toLowerCase()) {
        fail('RECEIPT_EVENT_CONFLICT', 'Receipt generation event does not match the persisted file.', 503);
      }
    }
    const updated = await query(tx, `UPDATE ppd SET receipt_status='ready',receipt_payload_sha256=$1,receipt_file_id=$2,receipt_file_sha256=$3,receipt_created_at=$4,receipt_error=NULL,receipt_lease_token=NULL,receipt_lease_started_at=NULL,receipt_lease_expires_at=NULL WHERE id=$5 AND receipt_status='processing' AND receipt_lease_token=$6 RETURNING *`, [payloadHash, artifact.id, file.fileSha, bundle.created_at, ppdId, owner.token]);
    const ready = first(updated); if (!ready) fail('RECEIPT_LEASE_LOST', 'Receipt generation lease is no longer owned.', 409);
    return { existing: false, ppd: ready, file: artifact };
  });
}
async function markFailed(ppdId, token, error, deps) {
  const db = deps.db || await (deps.getDb || defaultGetDb)();
  try { await transaction(db, async (tx) => { await query(tx, "UPDATE ppd SET receipt_status='failed',receipt_error=$1,receipt_lease_token=NULL,receipt_lease_started_at=NULL,receipt_lease_expires_at=NULL WHERE id=$2 AND receipt_status='processing' AND receipt_lease_token=$3", [safeErrorCode(error), ppdId, token]); }); } catch { /* preserve the original sanitized failure */ }
}

export async function processReceiptJob(ppdIdInput, deps = {}) {
  const ppdId = idOf(ppdIdInput); const claimResult = await claim(ppdId, deps, { skipWait: deps.skipWait === true });
  if (claimResult.kind === 'ready') return readyResult(claimResult.ppd, claimResult.file);
  if (claimResult.kind === 'active') {
    const waited = await waitForActive(ppdId, deps, claimResult.ppd);
    return waited || processReceiptJob(ppdId, { ...deps, skipWait: true });
  }
  const owner = claimResult; let file;
  try {
    const bundle = deps.loadReceiptBundle ? await deps.loadReceiptBundle(ppdId, { ...deps, db: owner.db, ppd: owner.ppd }) : await loadReceiptBundle(ppdId, { db: owner.db, ppd: owner.ppd });
    const renderer = deps.renderReceipt || deps.renderDistributionReceipt || renderDistributionReceipt;
    const bytes = await renderer(bundle); if (!Buffer.isBuffer(bytes) || bytes.length < 5) fail('RECEIPT_RENDER_FAILED', 'Receipt renderer did not return PDF bytes.', 503);
    file = await writeLeaseFile(bytes, owner.ppd, owner.token, deps);
    const result = await finalize(ppdId, owner, bundle, file, deps);
    if (result.existing) { await cleanupUnreferenced(file.finalPath, file.finalName, owner.db); return readyResult(result.ppd, result.file); }
    return readyResult(result.ppd, result.file);
  } catch (error) {
    if (file) await cleanupUnreferenced(file.finalPath, file.finalName, owner.db);
    await markFailed(ppdId, owner.token, error, deps);
    throw error instanceof P0Error && error.code === 'RECEIPT_DATA_INCOMPLETE' ? error : failure(error);
  } finally {
    if (file?.tempPath) await fs.unlink(file.tempPath).catch(() => {});
  }
}

async function cleanupReceiptDirectory(deps, db) {
  const root = await validatedRoot(deps); await fs.mkdir(root, { recursive: true }); const cutoff = Date.now() - Number(deps.leaseMs || LEASE_MS); const files = await all(db, "SELECT stored_name FROM artifact_files WHERE kind='system_receipt_pdf'"); const referenced = new Set(files.map((row) => row.stored_name)); let removed = 0;
  for (const name of await fs.readdir(root)) {
    if (!/^\.?receipt-[0-9]+-[0-9]+-[A-Za-z0-9-]+(?:\.pdf\.tmp|\.pdf)$/.test(name) || referenced.has(name)) continue;
    const target = path.join(root, name); const stat = await fs.stat(target).catch(() => null); if (stat?.isFile() && stat.mtimeMs < cutoff) { await fs.unlink(target).catch(() => {}); removed += 1; }
  }
  return { root, removed };
}

export async function resumePendingReceiptJobs(deps = {}) {
  const db = deps.db || await (deps.getDb || defaultGetDb)(); const cleanup = await cleanupReceiptDirectory(deps, db); const now = clock(deps).toISOString();
  await transaction(db, async (tx) => {
    const stale = await all(tx, "SELECT id FROM ppd WHERE receipt_status='processing' AND (receipt_lease_expires_at IS NULL OR receipt_lease_expires_at <= $1) FOR UPDATE", [now]);
    for (const row of stale) await query(tx, "UPDATE ppd SET receipt_status='pending',receipt_lease_token=NULL,receipt_lease_started_at=NULL,receipt_lease_expires_at=NULL WHERE id=$1 AND receipt_status='processing'", [row.id]);
  });
  const requestedLimit = Number(deps.maxJobs ?? process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS ?? 100);
  const maxJobs = Number.isSafeInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 1000) : 100;
  const pending = await all(db, "SELECT id FROM ppd WHERE status IN ('completed','complete') AND receipt_status IN ('pending','failed') ORDER BY id LIMIT $1", [maxJobs]); const results = [];
  for (const row of pending) { try { results.push(await processReceiptJob(row.id, deps)); } catch (error) { results.push({ ppd_id: row.id, receipt_status: 'failed', error: safeErrorCode(error) }); } }
  return { success: true, resumed: results.length, limit: maxJobs, cleaned: cleanup.removed, results };
}

export { RECEIPT_KIND };
