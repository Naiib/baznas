import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';
import { validatePayment, assertValid } from './validation.js';
import { createSnapshot } from './canonical-snapshot.js';
import { parseMoney, formatMoney } from './money.js';
import { withP0Command } from './repository.js';
import { storeArtifactFile, assertPrivateArtifactRoot, validateArtifactBytes } from './artifact-files.js';

// Task 10 deliberately keeps the approved capability surface narrow.  Higher
// organisational aliases are not equivalent to a P0 staff/leader grant.
const LEVELS = new Set(['staff', 'leader']);
const asId = (value, field) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 422, field_errors: { [field]: 'INTEGER' } });
  return n;
};
const actorOf = (context = {}) => context.actor || context.user || {};
const dbOf = (context) => context.db || context.dbOverride || context.txDb;
const jsonValue = (value) => {
  if (value && typeof value === 'object') return value;
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};
function inputOf(input = {}, meta = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new P0Error('VALIDATION_FAILED', 'Data pembayaran tidak valid.', { status: 422 });
  return { ...input, ...(meta.body || {}) };
}
function keyOf(meta = {}) { return meta.idempotency_key || meta.idempotencyKey; }
function commandMeta(meta, body, ppdId, hash) {
  return { ...meta, idempotency_key: keyOf(meta), artifact_type: 'ppd', artifact_id: ppdId, request: { command: 'payment', transaction_number: body.transaction_number, paid_amount: body.paid_amount, paid_at: body.paid_at, proof_sha256: hash } };
}
function paymentError(code, message, details) { throw new P0Error(code, message, { status: 409, details }); }
async function nextSequenceId(db, sequence) {
  // IDs are allocated by the database sequence.  MAX(id)+1 is racy and is
  // forbidden even as a test/degraded fallback.
  let row;
  try { row = await db.get(`SELECT nextval('${sequence}') AS id`); } catch (error) {
    throw new P0Error('PAYMENT_ID_ALLOCATION_FAILED', 'Payment identity could not be allocated.', { status: 503, cause: error });
  }
  const id = Number(row?.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new P0Error('PAYMENT_ID_ALLOCATION_FAILED', 'Payment identity could not be allocated.', { status: 503 });
  return id;
}
function requiredActor(actor) {
  assertAllowed(ACTIONS.PAYMENT_RECORD, actor);
  if (!LEVELS.has(String(actor.level || '').trim().toLowerCase())) throw new P0Error('LEVEL_REQUIRED', 'Pembayaran membutuhkan staf atau pimpinan Keuangan.', { status: 403 });
}
function requiredVerifier(actor) {
  assertAllowed(ACTIONS.PAYMENT_VERIFY, actor);
  if (!LEVELS.has(String(actor.level || '').trim().toLowerCase())) throw new P0Error('LEVEL_REQUIRED', 'Verifikasi pembayaran membutuhkan staf atau pimpinan Keuangan.', { status: 403 });
}
function fileFrom(input) { return input.file || input.proof || input.payment_proof || input.upload; }
async function hashStoredFile(file, root) {
  if (!file?.stored_name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(file.stored_name) || file.stored_name.includes('..')) throw new P0Error('PROOF_INVALID', 'Bukti pembayaran tidak valid.', { status: 422 });
  const bytes = await fs.readFile(path.join(root, file.stored_name)).catch(() => { throw new P0Error('PROOF_NOT_FOUND', 'Bukti pembayaran tidak ditemukan.', { status: 409 }); });
  return { bytes, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}
async function financeApproval(db, ppd) {
  const rows = await db.all("SELECT id,actor_id FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 AND action='finance_approve' ORDER BY id", [ppd.id, ppd.revision]);
  if (!rows.length) paymentError('PAYMENT_FINANCE_APPROVAL_REQUIRED', 'Persetujuan Keuangan wajib tersedia.');
  return rows;
}

export async function recordPayment(context = {}, ppdId, input = {}, meta = {}) {
  const actor = actorOf(context); requiredActor(actor);
  const caseId = asId(context.mustahik_id ?? context.mustahikId ?? context.case_id ?? context.caseId, 'mustahik_id');
  const db = dbOf(context) || await getDb();
  const body = inputOf(input, meta);
  const file = fileFrom(body);
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) throw new P0Error('VALIDATION_FAILED', 'Bukti pembayaran wajib diunggah.', { status: 422, field_errors: { proof: 'REQUIRED' } });
  const proofRoot = (context.artifactRoot || meta.artifactRoot || process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts'));
  const validationInput = { transaction_number: body.transaction_number, paid_amount: body.paid_amount, paid_at: body.paid_at };
  const actualHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const requestedPpdId = asId(ppdId, 'ppd_id');
  const existingPpd = await db.get('SELECT application_id FROM ppd WHERE id=$1 AND mustahik_id=$2', [requestedPpdId, caseId]);
  const appId = meta.application_id ?? existingPpd?.application_id ?? null;
  return withP0Command({ ...context, db, mustahik_id: caseId }, commandMeta({ ...meta, application_id: appId, lock_full_chain: true }, body, requestedPpdId, actualHash), async ({ txDb, artifact, caseRow, actor: txActor }) => {
    assertAllowed(ACTIONS.PAYMENT_RECORD, txActor, { creator_id: artifact.created_by_id });
    if (caseRow.workflow_mode !== 'p0' || caseRow.status !== 'Pengajuan Dana (FPD)' || artifact.status !== 'finance_approved') paymentError('PAYMENT_FINANCE_APPROVAL_REQUIRED', 'PPD belum disetujui Keuangan.');
    await financeApproval(txDb, artifact);
    const existing = await txDb.get('SELECT id FROM ppd_payments WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (existing) paymentError('PAYMENT_ALREADY_RECORDED', 'Pembayaran untuk PPD ini sudah dicatat.');
    let paidCents;
    try { paidCents = parseMoney(String(body.paid_amount)); } catch (error) { throw new P0Error(error.code || 'MONEY_FORMAT', error.message, { status: 422 }); }
    let ppdCents;
    try { ppdCents = parseMoney(String(artifact.amount)); } catch { paymentError('PAYMENT_AMOUNT_INVALID', 'Nilai PPD tidak valid.'); }
    if (paidCents !== ppdCents) throw new P0Error('PAYMENT_AMOUNT_MISMATCH', 'Nilai pembayaran harus sama persis dengan PPD.', { status: 422 });
    if (body.transaction_number !== undefined && String(body.transaction_number).trim() !== String(artifact.transaction_number || '').trim()) throw new P0Error('PAYMENT_TRANSACTION_MISMATCH', 'Nomor transaksi tidak cocok dengan PPD.', { status: 422 });
    const now = new Date();
    const fileMeta = validateArtifactBytes(file.buffer);
    const checked = validatePayment({ schema_version: 1, artifact_type: 'payment', id: 1, revision: 1, mustahik_id: caseId, application_id: artifact.application_id ?? null, ppd_id: artifact.id, ppd_revision: artifact.revision, ppd_hash: String(artifact.snapshot_hash).trim(), ...validationInput, paid_amount: formatMoney(paidCents), proof_file_id: 1, proof_mime_type: fileMeta.mimeType, proof_byte_size: fileMeta.byteSize, proof_sha256: fileMeta.sha256 }, { mode: 'submit', now, ppdAmount: formatMoney(ppdCents) });
    assertValid(checked);
    const stored = await storeArtifactFile({ db: txDb, artifactRoot: proofRoot, actor: txActor, requireAssignment: false, mustahik_id: caseId, artifact_type: 'ppd', artifact_id: artifact.id, artifact_revision: artifact.revision, kind: 'payment_proof', file });
    const proof = stored.data;
    const paymentId = await nextSequenceId(txDb, 'ppd_payments_id_seq');
    if (!paymentId || paymentId < 1) throw new P0Error('PAYMENT_ID_REQUIRED', 'Payment identity could not be allocated.', { status: 503 });
    const snapshot = createSnapshot('payment', { schema_version: 1, artifact_type: 'payment', id: paymentId, revision: 1, mustahik_id: caseId, application_id: artifact.application_id ?? null, ppd_id: artifact.id, ppd_revision: artifact.revision, ppd_hash: String(artifact.snapshot_hash).trim(), transaction_number: artifact.transaction_number, paid_amount: formatMoney(paidCents), paid_at: body.paid_at, proof_file_id: Number(proof.id), proof_mime_type: proof.mime_type, proof_byte_size: Number(proof.byte_size), proof_sha256: proof.sha256 });
    const paymentColumns = 'id,ppd_id,transaction_number,paid_amount,paid_at,proof_file_id,recorded_by_id,verification_status,snapshot_json,snapshot_hash';
    const paymentValues = [paymentId, artifact.id, artifact.transaction_number, formatMoney(paidCents), body.paid_at, proof.id, txActor.id, 'pending', JSON.stringify(snapshot.json), snapshot.hash];
    const paymentParams = paymentValues.map((_, index) => `$${index + 1}`).join(',');
    const inserted = await txDb.query(`INSERT INTO ppd_payments (${paymentColumns}) VALUES (${paymentParams}) RETURNING *`, paymentValues);
    const updated = await txDb.query("UPDATE ppd SET status='payment_recorded' WHERE id=$1 AND status='finance_approved' RETURNING *", [artifact.id]);
    if (!updated.rows?.[0]) paymentError('STALE_ARTIFACT', 'PPD berubah sebelum pembayaran dicatat.');
    const note = 'Pembayaran dicatat dengan bukti immutable.';
    return { response: { success: true, data: inserted.rows?.[0] }, approval: { action: 'payment_recorded', approval_step: 'payment_recorded', snapshot_hash: artifact.snapshot_hash, note }, decision: { stage: 'ppd', action: 'payment_recorded', previous_status: 'finance_approved', next_status: 'payment_recorded', snapshot_hash: artifact.snapshot_hash, note, evidence_grade: 'p0' }, activity: { action_type: 'ppd_payment_recorded', title: 'PPD payment recorded', description: note, old_status: 'finance_approved', new_status: 'payment_recorded' }, projection: { status: caseRow.status } };
  });
}

export async function verifyPayment(context = {}, ppdId, input = {}, meta = {}) {
  const actor = actorOf(context); requiredVerifier(actor);
  const caseId = asId(context.mustahik_id ?? context.mustahikId ?? context.case_id ?? context.caseId, 'mustahik_id');
  const db = dbOf(context) || await getDb();
  const requestedPpdId = asId(ppdId, 'ppd_id');
  const existingPpd = await db.get('SELECT application_id FROM ppd WHERE id=$1 AND mustahik_id=$2', [requestedPpdId, caseId]);
  const appId = meta.application_id ?? existingPpd?.application_id ?? null;
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: appId, lock_full_chain: true, artifact_type: 'ppd', artifact_id: requestedPpdId, request: { command: 'payment_verify', ppd_id: requestedPpdId } }, async ({ txDb, artifact, caseRow, actor: txActor, chain }) => {
    const payment = chain?.payment || await txDb.get('SELECT * FROM ppd_payments WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (!payment) paymentError('PAYMENT_REQUIRED', 'Pembayaran belum dicatat.');
    requiredVerifier(txActor); assertAllowed(ACTIONS.PAYMENT_VERIFY, txActor, { recorder_id: payment.recorded_by_id });
    if (caseRow.status !== 'Pengajuan Dana (FPD)' || artifact.status !== 'payment_recorded' || payment.verification_status !== 'pending') paymentError('PAYMENT_VERIFICATION_REQUIRED', 'Pembayaran tidak berada pada tahap verifikasi.');
    const proof = await txDb.get('SELECT * FROM artifact_files WHERE id=$1 FOR UPDATE', [payment.proof_file_id]);
    if (!proof || proof.kind !== 'payment_proof' || Number(proof.mustahik_id) !== caseId || Number(proof.artifact_id) !== Number(artifact.id) || Number(proof.artifact_revision) !== Number(artifact.revision)) throw new P0Error('PROOF_SCOPE_CONFLICT', 'Bukti pembayaran tidak berada pada PPD yang benar.', { status: 409 });
    const { root } = await assertPrivateArtifactRoot(context.artifactRoot || meta.artifactRoot || process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts'));
    const actual = await hashStoredFile(proof, root);
    if (actual.hash !== String(proof.sha256).trim()) throw new P0Error('PROOF_HASH_MISMATCH', 'Hash bukti pembayaran tidak cocok.', { status: 409 });
    const paymentIdentity = Number(payment.id);
    if (!Number.isSafeInteger(paymentIdentity) || paymentIdentity < 1) throw new P0Error('PAYMENT_SNAPSHOT_MISMATCH', 'Identitas pembayaran tidak valid.', { status: 409 });
    const rebuilt = createSnapshot('payment', { schema_version: 1, artifact_type: 'payment', id: paymentIdentity, revision: 1, mustahik_id: caseId, application_id: artifact.application_id ?? null, ppd_id: artifact.id, ppd_revision: artifact.revision, ppd_hash: String(artifact.snapshot_hash).trim(), transaction_number: payment.transaction_number, paid_amount: formatMoney(parseMoney(String(payment.paid_amount))), paid_at: payment.paid_at, proof_file_id: proof.id, proof_mime_type: proof.mime_type, proof_byte_size: Number(proof.byte_size), proof_sha256: actual.hash });
    const persisted = jsonValue(payment.snapshot_json);
    if (!persisted || createSnapshot('payment', persisted).hash !== String(payment.snapshot_hash).trim() || rebuilt.hash !== String(payment.snapshot_hash).trim()) throw new P0Error('PAYMENT_SNAPSHOT_MISMATCH', 'Snapshot pembayaran tidak cocok.', { status: 409 });
    const result = await txDb.query("UPDATE ppd_payments SET verification_status='verified',verified_by_id=$1,verified_at=CURRENT_TIMESTAMP WHERE id=$2 AND verification_status='pending' RETURNING *", [txActor.id, payment.id]);
    if (!result.rows?.[0]) paymentError('STALE_ARTIFACT', 'Pembayaran berubah sebelum verifikasi.');
    const updated = await txDb.query("UPDATE ppd SET status='payment_verified' WHERE id=$1 AND status='payment_recorded' RETURNING *", [artifact.id]);
    if (!updated.rows?.[0]) paymentError('STALE_ARTIFACT', 'PPD berubah sebelum verifikasi.');
    const note = 'Bukti pembayaran diverifikasi secara independen.';
    return { response: { success: true, data: result.rows[0] }, approval: { action: 'payment_verified', approval_step: 'payment_verified', snapshot_hash: artifact.snapshot_hash, note }, decision: { stage: 'ppd', action: 'payment_verified', previous_status: 'payment_recorded', next_status: 'payment_verified', snapshot_hash: artifact.snapshot_hash, note, evidence_grade: 'p0' }, activity: { action_type: 'ppd_payment_verified', title: 'PPD payment verified', description: note, old_status: 'payment_recorded', new_status: 'payment_verified' }, projection: { status: caseRow.status } };
  });
}

export { jsonValue };
