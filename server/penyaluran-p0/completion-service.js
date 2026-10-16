import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';
import { validateRecipientConfirmation, assertValid } from './validation.js';
import { createSnapshot } from './canonical-snapshot.js';
import { parseMoney, formatMoney } from './money.js';
import { withP0Command } from './repository.js';
import { storeArtifactFile, assertPrivateArtifactRoot } from './artifact-files.js';
import { jsonValue } from './payment-service.js';

const METHODS = new Set(['Tatap Muka', 'Telepon', 'WhatsApp', 'Tanda Terima']);
const LEVELS = new Set(['staff', 'leader']);
const actorOf = (context = {}) => context.actor || context.user || {};
const dbOf = (context) => context.db || context.dbOverride || context.txDb;
const asId = (value, field) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 422, field_errors: { [field]: 'INTEGER' } }); return n; };
const keyOf = (meta = {}) => meta.idempotency_key || meta.idempotencyKey;
const rootOf = (context, meta) => context.artifactRoot || meta.artifactRoot || process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts');
function fail(code, message, status = 409, details) { throw new P0Error(code, message, { status, details }); }
function exactTask10Level(actor, message) {
  if (!LEVELS.has(String(actor?.level || '').trim().toLowerCase())) fail('LEVEL_REQUIRED', message, 403);
}
async function nextSequenceId(db, sequence) {
  let row;
  try { row = await db.get(`SELECT nextval('${sequence}') AS id`); } catch (error) {
    throw new P0Error('CONFIRMATION_ID_ALLOCATION_FAILED', 'Confirmation identity could not be allocated.', { status: 503, cause: error });
  }
  const id = Number(row?.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new P0Error('CONFIRMATION_ID_ALLOCATION_FAILED', 'Confirmation identity could not be allocated.', { status: 503 });
  return id;
}
function bodyOf(input, meta) { return { ...(input || {}), ...(meta?.body || {}) }; }
async function assignedSurveyor(db, caseId, actor) {
  if (String(actor.role || '').trim().toLowerCase() !== 'surveyor') return true;
  const row = await db.get('SELECT 1 FROM mustahik_case_assignments WHERE mustahik_id=$1 AND user_id=$2 AND ended_at IS NULL LIMIT 1', [caseId, actor.id]);
  if (!row) fail('PERMISSION_DENIED', 'Surveyor harus ditugaskan pada kasus ini.', 403);
  return true;
}
async function fileHash(file, root, missingCode = 'PROOF_REQUIRED') {
  if (!file || !file.stored_name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(file.stored_name) || file.stored_name.includes('..')) fail(missingCode, 'Berkas bukti tidak ditemukan.');
  const bytes = await fs.readFile(path.join(root, file.stored_name)).catch(() => fail('PROOF_HASH_MISMATCH', 'Isi berkas bukti tidak ditemukan.'));
  return { bytes, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}

function positiveIdentity(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail('COMPLETION_PROVENANCE_CONFLICT', `${label} identity is missing or invalid.`);
  return id;
}
function immutableHash(value, label) {
  const hash = String(value ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(hash)) fail('COMPLETION_PROVENANCE_CONFLICT', `${label} hash is missing or invalid.`);
  return hash;
}
function actualSnapshot(type, row, caseId, artifact, proof, confirmation) {
  if (type === 'payment') return createSnapshot(type, { schema_version: 1, artifact_type: 'payment', id: positiveIdentity(row.id, 'payment'), revision: 1, mustahik_id: positiveIdentity(caseId, 'mustahik'), application_id: artifact.application_id ?? null, ppd_id: positiveIdentity(artifact.id, 'PPD'), ppd_revision: positiveIdentity(artifact.revision, 'PPD revision'), ppd_hash: immutableHash(artifact.snapshot_hash, 'PPD'), transaction_number: row.transaction_number, paid_amount: formatMoney(parseMoney(String(row.paid_amount))), paid_at: row.paid_at, proof_file_id: proof?.id ?? null, proof_mime_type: proof?.mime_type ?? null, proof_byte_size: proof ? Number(proof.byte_size) : null, proof_sha256: proof?.sha256 ?? null });
  return createSnapshot(type, { schema_version: 1, artifact_type: 'recipient_confirmation', id: positiveIdentity(confirmation.id, 'confirmation'), revision: 1, mustahik_id: positiveIdentity(caseId, 'mustahik'), application_id: artifact.application_id ?? null, ppd_id: positiveIdentity(artifact.id, 'PPD'), ppd_revision: positiveIdentity(artifact.revision, 'PPD revision'), ppd_hash: immutableHash(artifact.snapshot_hash, 'PPD'), method: confirmation.method, recipient_name_snapshot: confirmation.recipient_name_snapshot, confirmed_at: confirmation.confirmed_at, note: confirmation.note, evidence_file_id: confirmation.evidence_file_id ?? null, evidence_mime_type: proof?.mime_type ?? null, evidence_byte_size: proof ? Number(proof.byte_size) : null, evidence_sha256: proof?.sha256 ?? null });
}
function persistedSnapshot(row, type, rebuilt, requiredCode, mismatchCode) {
  if (row?.snapshot_json === null || row?.snapshot_json === undefined || row.snapshot_json === '') fail(requiredCode, `${type} snapshot is required.`);
  const parsed = jsonValue(row.snapshot_json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(mismatchCode, `${type} snapshot is invalid.`);
  let stored;
  try { stored = createSnapshot(type, parsed); } catch { fail(mismatchCode, `${type} snapshot contains undeclared or invalid content.`); }
  const storedHash = String(row.snapshot_hash ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(storedHash) || stored.hash !== storedHash || rebuilt.hash !== storedHash) fail(mismatchCode, `${type} snapshot does not match locked evidence.`);
  const identities = [parsed.id, parsed.revision, parsed.ppd_id, parsed.ppd_revision].map(Number);
  if (identities.some((id) => !Number.isSafeInteger(id) || id < 1) || parsed.artifact_type !== type) fail(mismatchCode, `${type} snapshot identity is invalid.`);
  return stored;
}
async function lockedPaymentEvidence(txDb, payment, artifact, caseId, root, chain, requiredCode, mismatchCode, actorCode = mismatchCode, proofCode = 'PROOF_SCOPE_CONFLICT') {
  if (!payment || payment.verification_status !== 'verified') fail('CONFIRMATION_PAYMENT_VERIFICATION_REQUIRED', 'Pembayaran harus diverifikasi terlebih dahulu.');
  if (!Number.isSafeInteger(Number(payment.recorded_by_id)) || Number(payment.recorded_by_id) < 1
    || !Number.isSafeInteger(Number(payment.verified_by_id)) || Number(payment.verified_by_id) < 1) {
    fail(actorCode, 'Aktor pembayaran tidak lengkap.', 409);
  }
  const proof = chain?.files?.find((file) => Number(file.id) === Number(payment.proof_file_id)) || await txDb.get('SELECT * FROM artifact_files WHERE id=$1 FOR UPDATE', [payment.proof_file_id]);
  if (!proof || proof.kind !== 'payment_proof' || Number(proof.mustahik_id) !== Number(caseId) || Number(proof.artifact_id) !== Number(artifact.id) || Number(proof.artifact_revision) !== Number(artifact.revision)) fail(proofCode, 'Bukti pembayaran tidak berada pada PPD yang benar.', 409);
  const actual = await fileHash(proof, root);
  if (actual.hash !== String(proof.sha256 || '').trim()) fail('PROOF_HASH_MISMATCH', 'Hash bukti pembayaran tidak cocok.', 409);
  const rebuilt = actualSnapshot('payment', payment, caseId, artifact, proof);
  const snapshot = persistedSnapshot(payment, 'payment', rebuilt, requiredCode, mismatchCode);
  return { proof, snapshot };
}
function idempotentMeta(meta, request) { return { ...meta, idempotency_key: keyOf(meta), request }; }

export async function recordRecipientConfirmation(context = {}, ppdId, input = {}, meta = {}) {
  const actor = actorOf(context); assertAllowed(ACTIONS.RECIPIENT_CONFIRM, actor);
  if (String(actor.role || '').trim().toLowerCase() === 'penyaluran') exactTask10Level(actor, 'Konfirmasi membutuhkan staf atau pimpinan Penyaluran.');
  const caseId = asId(context.mustahik_id ?? context.mustahikId ?? context.case_id ?? context.caseId, 'mustahik_id');
  const requestedPpdId = asId(ppdId, 'ppd_id'); const db = dbOf(context) || await getDb(); const body = bodyOf(input, meta);
  const existingPpd = await db.get('SELECT application_id FROM ppd WHERE id=$1 AND mustahik_id=$2', [requestedPpdId, caseId]);
  const appId = meta.application_id ?? existingPpd?.application_id ?? null;
  return withP0Command({ ...context, db, mustahik_id: caseId }, idempotentMeta({ ...meta, application_id: appId, lock_full_chain: true, artifact_type: 'ppd', artifact_id: requestedPpdId }, { command: 'recipient_confirmation', ppd_id: requestedPpdId, method: body.method, confirmed_at: body.confirmed_at }), async ({ txDb, artifact, caseRow, actor: txActor, chain }) => {
    await assignedSurveyor(txDb, caseId, txActor);
    const payment = chain?.payment || await txDb.get('SELECT * FROM ppd_payments WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (!payment || payment.verification_status !== 'verified') fail('CONFIRMATION_PAYMENT_VERIFICATION_REQUIRED', 'Pembayaran harus diverifikasi terlebih dahulu.');
    if (artifact.status !== 'payment_verified' || caseRow.status !== 'Pengajuan Dana (FPD)') fail('WRONG_STATE', 'PPD belum berada pada tahap konfirmasi.', 409);
    const root = (await assertPrivateArtifactRoot(rootOf(context, meta))).root;
    await lockedPaymentEvidence(txDb, payment, artifact, caseId, root, chain, 'CONFIRMATION_PAYMENT_SNAPSHOT_REQUIRED', 'CONFIRMATION_PAYMENT_SNAPSHOT_MISMATCH');
    const mpzis = chain?.mpzis || await txDb.get('SELECT * FROM mpzis WHERE id=$1 FOR UPDATE', [artifact.mpzis_id]);
    // Recipient identity is sourced only from the immutable MPZIS snapshot;
    // a mutable display column cannot authorize a confirmation.
    const recipient = jsonValue(mpzis?.snapshot_json)?.recipient_name;
    if (!recipient || String(body.recipient_name_snapshot || '').trim() !== String(recipient).trim()) fail('RECIPIENT_SNAPSHOT_MISMATCH', 'Nama penerima tidak cocok dengan snapshot MPZIS.', 422);
    const evidence = body.evidence_file || body.evidence || body.file;
    const now = new Date();
    const evidenceMeta = evidence?.buffer ? (() => { const h = crypto.createHash('sha256').update(evidence.buffer).digest('hex'); return { evidence_file_id: 1, evidence_mime_type: evidence.mime_type || 'application/pdf', evidence_byte_size: evidence.buffer.length, evidence_sha256: h }; })() : {};
    const checked = validateRecipientConfirmation({ schema_version: 1, artifact_type: 'recipient_confirmation', id: 1, revision: 1, mustahik_id: caseId, application_id: artifact.application_id ?? null, ppd_id: artifact.id, ppd_revision: artifact.revision, ppd_hash: String(artifact.snapshot_hash).trim(), method: body.method, recipient_name_snapshot: String(recipient), confirmed_at: body.confirmed_at, note: body.note, ...evidenceMeta }, { mode: 'submit', now, paid: true, paymentVerified: true });
    assertValid(checked);
    if (!METHODS.has(body.method)) fail('VALIDATION_FAILED', 'Metode konfirmasi tidak valid.', 422);
    let evidenceRow = null;
    if (evidence?.buffer) {
      evidenceRow = (await storeArtifactFile({ db: txDb, artifactRoot: rootOf(context, meta), actor: txActor, requireAssignment: false, mustahik_id: caseId, artifact_type: 'ppd', artifact_id: artifact.id, artifact_revision: artifact.revision, kind: 'recipient_confirmation', file: evidence })).data;
    }
    const existing = await txDb.get('SELECT id FROM recipient_confirmations WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (existing) fail('CONFIRMATION_ALREADY_RECORDED', 'Konfirmasi penerima sudah dicatat.');
    const confirmationId = await nextSequenceId(txDb, 'recipient_confirmations_id_seq');
    if (!confirmationId || confirmationId < 1) throw new P0Error('CONFIRMATION_ID_REQUIRED', 'Confirmation identity could not be allocated.', { status: 503 });
    const snapshot = createSnapshot('recipient_confirmation', { schema_version: 1, artifact_type: 'recipient_confirmation', id: confirmationId, revision: 1, mustahik_id: caseId, application_id: artifact.application_id ?? null, ppd_id: artifact.id, ppd_revision: artifact.revision, ppd_hash: String(artifact.snapshot_hash).trim(), method: body.method, recipient_name_snapshot: String(recipient).trim(), confirmed_at: body.confirmed_at, note: body.note, evidence_file_id: evidenceRow?.id ?? null, evidence_mime_type: evidenceRow?.mime_type ?? null, evidence_byte_size: evidenceRow ? Number(evidenceRow.byte_size) : null, evidence_sha256: evidenceRow?.sha256 ?? null });
    const confirmationColumns = 'id,ppd_id,method,recipient_name_snapshot,confirmed_at,note,evidence_file_id,recorded_by_id,snapshot_json,snapshot_hash';
    const confirmationValues = [confirmationId, artifact.id, body.method, String(recipient).trim(), body.confirmed_at, body.note, evidenceRow?.id ?? null, txActor.id, JSON.stringify(snapshot.json), snapshot.hash];
    const confirmationParams = confirmationValues.map((_, index) => `$${index + 1}`).join(',');
    const inserted = await txDb.query(`INSERT INTO recipient_confirmations (${confirmationColumns}) VALUES (${confirmationParams}) RETURNING *`, confirmationValues);
    const updated = await txDb.query("UPDATE ppd SET status='recipient_confirmed' WHERE id=$1 AND status='payment_verified' RETURNING *", [artifact.id]);
    if (!updated.rows?.[0]) fail('STALE_ARTIFACT', 'PPD berubah sebelum konfirmasi.');
    const note = 'Konfirmasi penerima dicatat dengan snapshot nama penerima.';
    return { response: { success: true, data: inserted.rows?.[0] }, approval: { action: 'recipient_confirmed', approval_step: 'recipient_confirmed', snapshot_hash: artifact.snapshot_hash, note }, decision: { stage: 'ppd', action: 'recipient_confirmed', previous_status: 'payment_verified', next_status: 'recipient_confirmed', snapshot_hash: artifact.snapshot_hash, note, evidence_grade: 'p0' }, activity: { action_type: 'ppd_recipient_confirmed', title: 'Recipient confirmation recorded', description: note, old_status: 'payment_verified', new_status: 'recipient_confirmed' }, projection: { status: caseRow.status } };
  });
}

async function validateArtifactSnapshot(txDb, row, type) {
  if (!row?.snapshot_json || !row?.snapshot_hash) fail(`COMPLETION_${type.toUpperCase()}_REQUIRED`, `${type} snapshot is required.`);
  const id = positiveIdentity(row.id, `${type} row`);
  const revision = positiveIdentity(row.revision, `${type} revision`);
  const mustahikId = positiveIdentity(row.mustahik_id, `${type} mustahik`);
  const storedHash = immutableHash(row.snapshot_hash, type);
  const parsed = jsonValue(row.snapshot_json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('COMPLETION_PROVENANCE_CONFLICT', `${type} snapshot is invalid.`);
  // Identity is authoritative in the locked row.  A snapshot with a
  // placeholder, negative, or different identity is never accepted.
  if (parsed.artifact_type !== type || parsed.source !== 'p0' || Number(parsed.id) !== id || Number(parsed.revision) !== revision || Number(parsed.mustahik_id) !== mustahikId || (parsed.application_id ?? null) !== (row.application_id ?? null)) fail('COMPLETION_PROVENANCE_CONFLICT', `${type} snapshot identity is stale.`);
  const authoritative = { ...parsed, artifact_type: type, id, revision, mustahik_id: mustahikId, application_id: row.application_id ?? null, source: 'p0' };
  if (type === 'ppd') {
    let lines;
    try { lines = await txDb.all('SELECT line_no,register_number,description,amount FROM ppd_rab_lines WHERE ppd_id=$1 ORDER BY line_no ASC', [id]); } catch { fail('COMPLETION_RAB_REQUIRED', 'Locked PPD RAB rows are required.'); }
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 3) fail('COMPLETION_RAB_REQUIRED', 'One to three locked PPD RAB rows are required.');
    authoritative.rab_lines = lines.map((line) => ({ line_no: Number(line.line_no), register_number: line.register_number, description: line.description, amount: formatMoney(parseMoney(String(line.amount))) }));
    if (row.mpzis_id !== null && row.mpzis_id !== undefined && Number(parsed.approved_mpzis_id) !== Number(row.mpzis_id)) fail('COMPLETION_PROVENANCE_CONFLICT', 'PPD snapshot MPZIS identity is stale.');
  }
  const stored = createSnapshot(type, parsed);
  const rebuilt = createSnapshot(type, authoritative);
  if (stored.hash !== storedHash || rebuilt.hash !== storedHash) fail('COMPLETION_PROVENANCE_CONFLICT', `${type} snapshot hash is stale.`);
  return rebuilt;
}

export async function completeDistribution(context = {}, ppdId, input = {}, meta = {}) {
  const actor = actorOf(context); assertAllowed(ACTIONS.COMPLETE, actor);
  exactTask10Level(actor, 'Penyelesaian membutuhkan staf atau pimpinan Penyaluran.');
  const caseId = asId(context.mustahik_id ?? context.mustahikId ?? context.case_id ?? context.caseId, 'mustahik_id'); const requestedPpdId = asId(ppdId, 'ppd_id'); const db = dbOf(context) || await getDb();
  const existingPpd = await db.get('SELECT application_id FROM ppd WHERE id=$1 AND mustahik_id=$2', [requestedPpdId, caseId]); const appId = meta.application_id ?? existingPpd?.application_id ?? null;
  return withP0Command({ ...context, db, mustahik_id: caseId }, idempotentMeta({ ...meta, application_id: appId, lock_full_chain: true, artifact_type: 'ppd', artifact_id: requestedPpdId }, { command: 'complete_distribution', ppd_id: requestedPpdId }), async ({ txDb, artifact, caseRow, actor: txActor, chain }) => {
    if (!caseRow || caseRow.workflow_mode !== 'p0' || caseRow.status !== 'Pengajuan Dana (FPD)') fail('COMPLETION_WORKFLOW_REQUIRED', 'Kasus P0 tidak berada pada tahap penyelesaian.', 409);
    if (artifact.source !== 'p0' || artifact.status !== 'recipient_confirmed') fail('COMPLETION_RECIPIENT_CONFIRMATION_REQUIRED', 'Konfirmasi penerima wajib tersedia.');
    const assessment = chain?.assessment;
    const mpzis = chain?.mpzis;
    if (!assessment || assessment.source !== 'p0' || assessment.status !== 'accepted') fail('COMPLETION_ASSESSMENT_REQUIRED', 'Assessment diterima wajib tersedia.');
    if (!mpzis || mpzis.source !== 'p0' || mpzis.status !== 'approved') fail('COMPLETION_MPZIS_REQUIRED', 'MPZIS disetujui wajib tersedia.');
    if (Number(artifact.mpzis_id) !== Number(mpzis.id)) fail('COMPLETION_PROVENANCE_CONFLICT', 'PPD tidak terikat pada MPZIS aktif.');
    const approvals = chain?.finance || await txDb.all("SELECT * FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 AND action IN ('finance_check','finance_approve') ORDER BY id FOR UPDATE", [artifact.id, artifact.revision]);
    const checks = approvals.filter((row) => row.action === 'finance_check');
    const financeApprovals = approvals.filter((row) => row.action === 'finance_approve');
    if (checks.length !== 1 || financeApprovals.length !== 1) fail('COMPLETION_FINANCE_APPROVAL_REQUIRED', 'Finance check dan tepat satu finance approval wajib tersedia.');
    const financeCheck = checks[0]; const financeApprove = financeApprovals[0];
    for (const event of [financeCheck, financeApprove]) {
      positiveIdentity(event.id, 'finance event');
      positiveIdentity(event.actor_id, 'finance actor');
      if (Number(event.artifact_id) !== Number(artifact.id) || Number(event.artifact_revision) !== Number(artifact.revision) || immutableHash(event.snapshot_hash, 'finance event') !== immutableHash(artifact.snapshot_hash, 'PPD')) fail('COMPLETION_PROVENANCE_CONFLICT', 'Finance event tidak terikat pada PPD aktif.');
    }
    if (Number(financeCheck.id) >= Number(financeApprove.id) || (String(financeCheck.created_at || '') && String(financeApprove.created_at || '') && new Date(financeCheck.created_at).getTime() > new Date(financeApprove.created_at).getTime())) fail('COMPLETION_FINANCE_APPROVAL_REQUIRED', 'Finance check harus mendahului approval.');
    if (String(financeCheck.actor_id) === String(financeApprove.actor_id)) fail('ACTOR_SEPARATION', 'Checker dan approver Keuangan harus berbeda.', 403);
    const payment = chain?.payment || await txDb.get('SELECT * FROM ppd_payments WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (!payment) fail('COMPLETION_PROOF_REQUIRED', 'Pembayaran dan bukti wajib tersedia.');
    if (payment.verification_status !== 'verified') fail('COMPLETION_PROOF_VERIFICATION_REQUIRED', 'Bukti pembayaran belum diverifikasi.');
    try {
      if (parseMoney(String(payment.paid_amount)) !== parseMoney(String(artifact.amount))) fail('COMPLETION_MATCHING_AMOUNT_REQUIRED', 'Nilai pembayaran harus sama persis dengan nilai PPD.');
    } catch (error) {
      if (error instanceof P0Error && error.code === 'COMPLETION_MATCHING_AMOUNT_REQUIRED') throw error;
      fail('COMPLETION_MATCHING_AMOUNT_REQUIRED', 'Nilai pembayaran PPD tidak valid.');
    }
    const confirmation = chain?.confirmation || await txDb.get('SELECT * FROM recipient_confirmations WHERE ppd_id=$1 FOR UPDATE', [artifact.id]);
    if (!confirmation) fail('COMPLETION_RECIPIENT_CONFIRMATION_REQUIRED', 'Konfirmasi penerima wajib tersedia.');
    const root = (await assertPrivateArtifactRoot(rootOf(context, meta))).root;
    const paymentEvidence = await lockedPaymentEvidence(txDb, payment, artifact, caseId, root, chain, 'COMPLETION_PAYMENT_SNAPSHOT_REQUIRED', 'COMPLETION_PAYMENT_SNAPSHOT_MISMATCH', 'ACTOR_SEPARATION', 'COMPLETION_PROOF_REQUIRED');
    const proof = paymentEvidence.proof;
    const evidence = confirmation.evidence_file_id ? await txDb.get('SELECT * FROM artifact_files WHERE id=$1 FOR UPDATE', [confirmation.evidence_file_id]) : null;
    if (confirmation.evidence_file_id && (!evidence || evidence.kind !== 'recipient_confirmation' || Number(evidence.mustahik_id) !== caseId || Number(evidence.artifact_id) !== Number(artifact.id) || Number(evidence.artifact_revision) !== Number(artifact.revision))) fail('COMPLETION_PROVENANCE_CONFLICT', 'Bukti konfirmasi tidak valid.');
    if (evidence) { const actualEvidence = await fileHash(evidence, root); if (actualEvidence.hash !== String(evidence.sha256).trim()) fail('COMPLETION_PROOF_HASH_MISMATCH', 'Hash bukti konfirmasi berubah.'); }
    const _assessmentSnapshot = await validateArtifactSnapshot(txDb, assessment, 'assessment'); const mpzisSnapshot = await validateArtifactSnapshot(txDb, mpzis, 'mpzis'); const ppdSnapshot = await validateArtifactSnapshot(txDb, artifact, 'ppd');
    positiveIdentity(payment.id, 'payment'); positiveIdentity(confirmation.id, 'confirmation');
    immutableHash(payment.snapshot_hash, 'payment'); immutableHash(confirmation.snapshot_hash, 'confirmation');
    const paymentSnapshot = paymentEvidence.snapshot;
    const confirmationSnapshot = actualSnapshot('recipient_confirmation', confirmation, caseId, artifact, evidence, confirmation);
    persistedSnapshot(confirmation, 'recipient_confirmation', confirmationSnapshot, 'COMPLETION_RECIPIENT_CONFIRMATION_REQUIRED', 'COMPLETION_PROVENANCE_CONFLICT');
    const mpzisData = mpzisSnapshot.json; const ppdData = ppdSnapshot.json;
    if (Number(mpzisData.accepted_assessment_id) !== Number(assessment.id) || Number(mpzisData.accepted_assessment_revision) !== Number(assessment.revision) || String(mpzisData.accepted_assessment_hash).trim() !== String(assessment.snapshot_hash).trim()) fail('COMPLETION_PROVENANCE_CONFLICT', 'Rantai Assessment–MPZIS tidak cocok.');
    if (Number(ppdData.approved_mpzis_id) !== Number(mpzis.id) || Number(ppdData.approved_mpzis_revision) !== Number(mpzis.revision) || String(ppdData.approved_mpzis_hash).trim() !== String(mpzis.snapshot_hash).trim()) fail('COMPLETION_PROVENANCE_CONFLICT', 'Rantai MPZIS–PPD tidak cocok.');
    if (paymentSnapshot.json.ppd_id !== artifact.id || confirmationSnapshot.json.ppd_id !== artifact.id) fail('COMPLETION_PROVENANCE_CONFLICT', 'Bukti tidak terikat pada PPD aktif.');
    const ids = [artifact.created_by_id, financeCheck.actor_id, financeApprove.actor_id, payment.recorded_by_id, payment.verified_by_id, confirmation.recorded_by_id, txActor.id].map((id, index) => {
      if (id === null || id === undefined || id === '') fail('ACTOR_SEPARATION', `Completion actor ${index + 1} is missing.`, 403);
      return String(positiveIdentity(id, 'completion actor'));
    });
    if (new Set(ids).size !== ids.length) fail('ACTOR_SEPARATION', 'Aktor penyelesaian harus independen.', 403);
    const completionCorrelation = meta.correlation_id || meta.correlationId || crypto.randomUUID();
    const completion = createSnapshot('completion', { schema_version: 1, artifact_type: 'completion', id: artifact.id, revision: artifact.revision, mustahik_id: caseId, application_id: artifact.application_id ?? null, assessment: { id: assessment.id, revision: assessment.revision, hash: immutableHash(assessment.snapshot_hash, 'Assessment') }, mpzis: { id: mpzis.id, revision: mpzis.revision, hash: immutableHash(mpzis.snapshot_hash, 'MPZIS') }, ppd: { id: artifact.id, revision: artifact.revision, hash: immutableHash(artifact.snapshot_hash, 'PPD') }, payment: { id: payment.id, revision: 1, hash: immutableHash(payment.snapshot_hash, 'payment') }, recipient_confirmation: { id: confirmation.id, revision: 1, hash: immutableHash(confirmation.snapshot_hash, 'confirmation') }, finance_event_ids: [Number(financeCheck.id), Number(financeApprove.id)], completion_correlation_id: completionCorrelation });
    const oldStatus = artifact.status;
    const updated = await txDb.query("UPDATE ppd SET status='completed',receipt_status='pending' WHERE id=$1 AND status='recipient_confirmed' RETURNING *", [artifact.id]); if (!updated.rows?.[0]) fail('STALE_ARTIFACT', 'PPD berubah sebelum penyelesaian.');
    const note = 'Distribusi selesai; immutable completion snapshot tersimpan.';
    return { response: { success: true, data: updated.rows[0], completion_hash: completion.hash, correlation_id: completionCorrelation }, approval: { action: 'complete', approval_step: 'complete', snapshot_hash: artifact.snapshot_hash, note, correlation_id: completionCorrelation, completion_hash: completion.hash, completion_snapshot_json: JSON.stringify(completion.json) }, decision: { stage: 'ppd', action: 'complete', previous_status: oldStatus, next_status: 'completed', snapshot_hash: artifact.snapshot_hash, note, evidence_grade: 'p0', correlation_id: completionCorrelation }, activity: { action_type: 'ppd_completed', title: 'PPD distribution completed', description: note, old_status: oldStatus, new_status: 'completed', correlation_id: completionCorrelation }, projection: { status: 'Penyaluran Selesai' } };
  });
}

export { actualSnapshot, fileHash };
