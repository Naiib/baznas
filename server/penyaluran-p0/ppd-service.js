import { getDb, withTransaction } from '../db.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';
import { validatePpd, assertValid } from './validation.js';
import { createSnapshot } from './canonical-snapshot.js';
import { encryptBankAccount, decryptBankAccount } from './field-encryption.js';
import { formatMoney, parseMoney, sumMoney, terbilangRupiah } from './money.js';
import {
  withP0Command,
  getActivePpd,
  listArtifactHistory,
} from './repository.js';
import { assertCaseScope } from './case-read-model.js';

const TEMPLATE_CODE = 'F-PKP/03';
const TEMPLATE_VERSION = '2026-09-13';
const PPD_FIELDS = new Set([
  'schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id',
  'template_code', 'template_version', 'source', 'approved_mpzis_id', 'approved_mpzis_revision',
  'approved_mpzis_hash', 'form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source',
  'fund_source_confirmed', 'payment_type', 'payment_type_confirmed', 'payment_type_other',
  'bank_name', 'bank_account_last4', 'bank_account_name', 'requester_name_snapshot',
  'requester_role_snapshot', 'requester_department_snapshot', 'rab_lines', 'attachments',
]);
const CONTROL_FIELDS = new Set(['idempotency_key', 'idempotencyKey', 'correlation_id', 'correlationId', 'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash', 'application_id']);
const CLIENT_FIELDS = new Set(['form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source', 'fund_source_confirmed', 'payment_type', 'payment_type_confirmed', 'payment_type_other', 'bank_name', 'bank_account_name', 'rab_lines', 'attachments', 'bank_account_number', 'account_number', 'note']);

function actorOf(context = {}) { return context.actor || context.user || {}; }
function dbOf(context = {}) { return context.db || context.dbOverride || context.txDb; }
function id(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 400, field_errors: { [field]: 'INTEGER' } });
  return n;
}
function keyOf(meta = {}) {
  const key = meta.idempotency_key ?? meta.idempotencyKey;
  if (typeof key !== 'string' || !key.trim() || key.length > 150) throw new P0Error('IDEMPOTENCY_REQUIRED', 'Idempotency-Key wajib diisi.', { status: 400 });
  return key.trim();
}
function expectedMeta(meta, { hash = false } = {}) {
  for (const field of ['expected_version', 'expected_revision']) if (!Object.prototype.hasOwnProperty.call(meta, field)) throw new P0Error('EXPECTED_GUARD_INVALID', `${field} is required.`, { status: 422 });
  if (hash && !Object.prototype.hasOwnProperty.call(meta, 'expected_snapshot_hash')) throw new P0Error('EXPECTED_GUARD_INVALID', 'expected_snapshot_hash is required.', { status: 422 });
}
function splitInput(input = {}, meta = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new P0Error('VALIDATION_FAILED', 'Data PPD harus berupa objek.', { status: 422, field_errors: { body: 'OBJECT_REQUIRED' } });
  const body = { ...input }; const extracted = { ...meta };
  for (const field of CONTROL_FIELDS) { if (Object.prototype.hasOwnProperty.call(body, field)) { if (extracted[field] === undefined) extracted[field] = body[field]; delete body[field]; } }
  return { body, meta: extracted };
}
function assertPpdFields(body) {
  const errors = {};
  const serverOnly = new Set(['requester_name_snapshot', 'requester_role_snapshot', 'requester_department_snapshot', 'approved_mpzis_id', 'approved_mpzis_revision', 'approved_mpzis_hash', 'bank_account_last4', 'bank_account_ciphertext', 'snapshot_hash', 'snapshot_json']);
  for (const field of Object.keys(body)) if (!CLIENT_FIELDS.has(field)) errors[field] = serverOnly.has(field) || PPD_FIELDS.has(field) || ['amount', 'total', 'amount_in_words', 'terbilang', 'requester_name', 'requester_role', 'requester_department', 'actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'bank_account', 'bank_account_encrypted', 'bank_account_ciphertext'].includes(field) ? 'FIELD_FORBIDDEN' : 'FIELD_UNDECLARED';
  if (Object.keys(errors).length) throw new P0Error('VALIDATION_FAILED', 'Field PPD tidak diizinkan.', { status: 422, field_errors: errors });
}
function accountFrom(body) { return body.bank_account_number ?? body.account_number; }
function assertRabCount(body) {
  if (body.rab_lines !== undefined && (!Array.isArray(body.rab_lines) || body.rab_lines.length < 1 || body.rab_lines.length > 3)) throw new P0Error('VALIDATION_FAILED', 'RAB harus memiliki 1 sampai 3 baris.', { status: 422, field_errors: { rab_lines: 'COUNT' } });
  if (Array.isArray(body.rab_lines)) body.rab_lines.forEach((line, index) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new P0Error('VALIDATION_FAILED', 'Baris RAB tidak valid.', { status: 422, field_errors: { [`rab_lines.${index}`]: 'INVALID' } });
    if (typeof line.register_number !== 'string' || !line.register_number.trim()) throw new P0Error('VALIDATION_FAILED', 'Nomor register RAB wajib diisi.', { status: 422, field_errors: { [`rab_lines.${index}.register_number`]: 'REQUIRED' } });
    if (typeof line.description !== 'string' || !line.description.trim()) throw new P0Error('VALIDATION_FAILED', 'Uraian RAB wajib diisi.', { status: 422, field_errors: { [`rab_lines.${index}.description`]: 'REQUIRED' } });
  });
}
function requester(actor) { return { name: String(actor.name ?? '').trim(), role: String(actor.role ?? '').trim(), department: String(actor.department ?? actor.division ?? '').trim() }; }
function requesterFromRow(row, fallback) { return { name: String(row?.requester_name ?? fallback.name).trim(), role: String(row?.requester_role ?? fallback.role).trim(), department: String(row?.requester_department ?? fallback.department).trim() }; }
function ensureEncryption(options) { encryptBankAccount('0000', options); }
function verifyAccountPair(ciphertext, last4, options) {
  if (typeof ciphertext !== 'string' || !ciphertext || !/^\d{4}$/.test(String(last4 ?? '').trim())) throw new P0Error('FIELD_ENCRYPTION_FAILED', 'Stored bank account is invalid.');
  const account = decryptBankAccount(ciphertext, options);
  if (account.slice(-4) !== String(last4).trim()) throw new P0Error('FIELD_ENCRYPTION_FAILED', 'Stored bank account does not match its masked value.');
  return account;
}
function assertApprovedProvenance(draftSnapshot, approved) {
  const approvedId = Number(draftSnapshot?.approved_mpzis_id);
  const approvedRevision = Number(draftSnapshot?.approved_mpzis_revision);
  const approvedHash = typeof draftSnapshot?.approved_mpzis_hash === 'string' ? draftSnapshot.approved_mpzis_hash.trim() : '';
  const currentHash = String(approved.row.snapshot_hash || '').trim();
  if (!Number.isSafeInteger(approvedId) || approvedId < 1 || !Number.isSafeInteger(approvedRevision) || approvedRevision < 1 || !approvedHash || approvedId !== Number(approved.row.id) || approvedRevision !== Number(approved.row.revision) || approvedHash !== currentHash) {
    throw new P0Error('STALE_ARTIFACT', 'MPZIS snapshot is stale.', { status: 409 });
  }
}
function jsonValue(value) { if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } } return value; }
function sourceFields(row) {
  const snapshot = jsonValue(row?.snapshot_json) || {};
  const fields = {};
  for (const field of ['form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source', 'fund_source_confirmed', 'payment_type', 'payment_type_confirmed', 'payment_type_other', 'bank_name', 'bank_account_last4', 'bank_account_name', 'requester_name', 'requester_role', 'requester_department', 'amount', 'amount_in_words']) fields[field] = row?.[field] ?? snapshot[field] ?? null;
  return fields;
}
function internalFields(row) {
  const snapshot = jsonValue(row?.snapshot_json) || {};
  return {
    form_number: row?.form_number ?? snapshot.form_number ?? null, ppd_number: row?.ppd_number ?? snapshot.ppd_number ?? null, transaction_number: row?.transaction_number ?? snapshot.transaction_number ?? null,
    purpose: row?.purpose ?? snapshot.purpose ?? null, fund_source: row?.fund_source ?? snapshot.fund_source ?? null, fund_source_confirmed: row?.fund_source_confirmed ?? snapshot.fund_source_confirmed ?? null,
    payment_type: row?.payment_type ?? snapshot.payment_type ?? null, payment_type_confirmed: row?.payment_type_confirmed ?? snapshot.payment_type_confirmed ?? null, payment_type_other: row?.payment_type_other ?? snapshot.payment_type_other ?? null,
    bank_name: row?.bank_name ?? null, bank_account_ciphertext: row?.bank_account_ciphertext ?? null, bank_account_last4: row?.bank_account_last4 ? String(row.bank_account_last4).trim() : null,
    bank_account_name: row?.bank_account_name ?? null,
  };
}
async function linesFor(db, ppdId) { return db.all('SELECT id,ppd_id,line_no,register_number,description,amount FROM ppd_rab_lines WHERE ppd_id=$1 ORDER BY line_no ASC', [ppdId]); }
function dto(row, lines = []) {
  if (!row) return null;
  const snapshot = jsonValue(row.snapshot_json);
  if (snapshot && typeof snapshot === 'object') delete snapshot.bank_account_ciphertext;
  const last4 = row.bank_account_last4 ? String(row.bank_account_last4).trim() : '';
  return {
    id: row.id, mustahik_id: row.mustahik_id, application_id: row.application_id ?? null, revision: row.revision,
    supersedes_id: row.supersedes_id ?? null, status: row.status, source: row.source,
    template_code: row.template_code ?? TEMPLATE_CODE, template_version: row.template_version ?? TEMPLATE_VERSION,
    mpzis_id: row.mpzis_id ?? null, snapshot_json: snapshot, snapshot_hash: row.snapshot_hash ?? null,
    amount: row.amount === null || row.amount === undefined ? null : formatMoney(parseMoney(String(row.amount))),
    amount_in_words: row.amount_in_words ?? null,
    bank_account_last4: last4 || null, bank_account_masked: last4 ? `${'*'.repeat(Math.max(4, 12 - last4.length))}${last4}` : null,
    requester_name_snapshot: row.requester_name ?? null, requester_role_snapshot: row.requester_role ?? null,
    requester_department_snapshot: row.requester_department ?? null,
    source_fields: sourceFields(row), rab_lines: lines.map((line) => ({ id: line.id, line_no: line.line_no, register_number: line.register_number, description: line.description, amount: formatMoney(parseMoney(String(line.amount))) })),
    created_by_id: row.created_by_id ?? null, submitted_at: row.submitted_at ?? null,
    finance_checked_at: row.finance_checked_at ?? null, finance_approved_at: row.finance_approved_at ?? null,
    receipt: {
      status: row.receipt_status ?? null,
      file_id: row.receipt_file_id ?? null,
      payload_sha256: row.receipt_payload_sha256 ?? null,
      receipt_payload_sha256: row.receipt_payload_sha256 ?? null,
      file_sha256: row.receipt_file_sha256 ?? null,
      created_at: row.receipt_created_at ?? null,
    },
  };
}
async function applicationFor(db, mustahikId) {
  try { const row = await db.get('SELECT id FROM applications WHERE mustahik_id=$1 ORDER BY id DESC LIMIT 1', [mustahikId]); return row?.id ?? null; }
  catch (error) { if (/relation .*applications.* does not exist/i.test(String(error?.message))) return null; throw error; }
}
async function revisions(db, mustahikId, applicationId) { return db.all("SELECT * FROM ppd WHERE mustahik_id=$1 AND source='p0' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision ASC,id ASC", [mustahikId, applicationId]); }
async function approvedMpzis(db, mustahikId, applicationId) {
  const row = await db.get("SELECT * FROM mpzis WHERE mustahik_id=$1 AND source='p0' AND status='approved' AND (application_id=$2 OR (application_id IS NULL AND $2 IS NULL)) ORDER BY revision DESC,id DESC LIMIT 1 FOR UPDATE", [mustahikId, applicationId]);
  if (!row) throw new P0Error('MPZIS_NOT_APPROVED', 'MPZIS aktif yang disetujui tidak ditemukan.', { status: 409 });
  const snapshot = jsonValue(row.snapshot_json) || {};
  const ceilingValue = snapshot.total_amount ?? row.approved_amount ?? row.total_amount;
  if (ceilingValue === undefined || ceilingValue === null) throw new P0Error('STALE_ARTIFACT', 'Plafon MPZIS tidak tersedia.', { status: 409 });
  const ceiling = formatMoney(parseMoney(String(ceilingValue)));
  if (snapshot.total_amount !== undefined && snapshot.total_amount !== null && parseMoney(String(snapshot.total_amount)) !== parseMoney(ceiling)) throw new P0Error('STALE_ARTIFACT', 'Snapshot MPZIS berubah.', { status: 409 });
  return { row, snapshot, ceiling };
}
async function replaceLines(db, ppdId, lines) {
  await db.query('DELETE FROM ppd_rab_lines WHERE ppd_id=$1', [ppdId]);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    await db.query('INSERT INTO ppd_rab_lines (ppd_id,line_no,register_number,description,amount) VALUES ($1,$2,$3,$4,$5)', [ppdId, i + 1, String(line.register_number ?? '').trim(), String(line.description ?? '').trim(), formatMoney(parseMoney(line.amount))]);
  }
}
async function duplicateNumber(db, field, value, ppdId) {
  if (!value) return false;
  const row = await db.get(`SELECT id FROM ppd WHERE source='p0' AND status <> 'superseded' AND ${field}=$1 AND id<>$2 LIMIT 1`, [value, ppdId]);
  return Boolean(row);
}
function duplicateError(field) { return new P0Error(`DUPLICATE_${field.toUpperCase()}`, `Nomor ${field} sudah digunakan.`, { status: 409 }); }
function cleanBody(body, account) { const clean = { ...body }; delete clean.bank_account_number; delete clean.account_number; delete clean.amount; delete clean.total; delete clean.amount_in_words; delete clean.terbilang; return account === undefined ? clean : clean; }
function validate(body, mode, ceiling, trusted) { return assertValid(validatePpd(body, { mode, mpzisCeiling: ceiling, trustedRequesterSnapshot: trusted })); }

export async function getPpdCase(context = {}, mustahikId, _meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id'); const actor = actorOf(context); const db = dbOf(context) || await getDb();
  return withTransaction(db, async (txDb) => {
    await assertCaseScope(txDb, caseId, actor);
    const mustahik = await txDb.get('SELECT id,status,workflow_mode,workflow_version FROM mustahik WHERE id=$1', [caseId]);
    if (!mustahik || mustahik.workflow_mode !== 'p0') throw new P0Error('CASE_NOT_FOUND', 'Mustahik tidak ditemukan.', { status: 404 });
    const applicationId = await applicationFor(txDb, caseId); const active = await getActivePpd(txDb, caseId, { application_id: applicationId, lock: false });
    const rows = await revisions(txDb, caseId, applicationId); const data = { mustahik_id: caseId, application_id: applicationId, status: mustahik.status, workflow_mode: mustahik.workflow_mode, workflow_version: mustahik.workflow_version, active: active ? dto(active, await linesFor(txDb, active.id)) : null, ppd: active ? dto(active, await linesFor(txDb, active.id)) : null, revision_history: rows.map((row) => ({ id: row.id, revision: row.revision, status: row.status, supersedes_id: row.supersedes_id ?? null, snapshot_hash: row.snapshot_hash ?? null })), history: await listArtifactHistory(txDb, caseId) };
    return { success: true, data };
  });
}

export async function createPpdDraft(context = {}, mustahikId, input = {}, meta = {}) {
  const caseId = id(mustahikId ?? context.mustahik_id, 'mustahik_id'); const actor = actorOf(context); assertAllowed(ACTIONS.PPD_CREATE, actor);
  const split = splitInput(input, meta); const body = split.body; meta = split.meta; assertPpdFields(body); const key = keyOf(meta); expectedMeta(meta, { hash: false }); const db = dbOf(context) || await getDb();
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, idempotency_key: key, expected_status: meta.expected_status ?? 'Pengajuan Dana (FPD)', request: Object.keys(body).length ? cleanBody(body) : { command: 'create' } }, async ({ txDb, caseRow, actor: txActor }) => {
    if (caseRow.workflow_mode !== 'p0' || caseRow.status !== 'Pengajuan Dana (FPD)') throw new P0Error('WRONG_STATE', 'PPD hanya dapat dibuat pada tahap Pengajuan Dana (FPD).', { status: 409 });
    const applicationId = await applicationFor(txDb, caseId); const approved = await approvedMpzis(txDb, caseId, applicationId); const active = await getActivePpd(txDb, caseId, { application_id: applicationId, lock: true });
    if (active?.status === 'draft') return { response: { success: true, data: dto(active, await linesFor(txDb, active.id)) }, activity: null };
    if (active && active.status !== 'returned') throw new P0Error('ACTIVE_REVISION_EXISTS', 'PPD aktif sudah tersedia.', { status: 409 });
    const prior = await revisions(txDb, caseId, applicationId); const revision = prior.reduce((max, row) => Math.max(max, Number(row.revision) || 0), 0) + 1; const supersedesId = active?.status === 'returned' ? active.id : null;
    if (supersedesId) await txDb.query("UPDATE ppd SET status='superseded' WHERE id=$1 AND status='returned'", [supersedesId]);
    if (supersedesId && !(typeof body.note === 'string' && body.note.trim())) throw new P0Error('VALIDATION_FAILED', 'Catatan koreksi wajib diisi.', { status: 422, field_errors: { note: 'REQUIRED' } });
    const requesterSnapshot = requester(txActor); const draftSnapshot = { approved_mpzis_id: approved.row.id, approved_mpzis_revision: approved.row.revision, approved_mpzis_hash: String(approved.row.snapshot_hash || '').trim(), attachments: [] };
    let result;
    try { result = await txDb.query(`INSERT INTO ppd (mustahik_id,application_id,revision,supersedes_id,status,source,template_code,template_version,created_by_id,mpzis_id,requester_name,requester_role,requester_department,snapshot_json) VALUES ($1,$2,$3,$4,'draft','p0',$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [caseId, applicationId, revision, supersedesId, TEMPLATE_CODE, TEMPLATE_VERSION, txActor.id, approved.row.id, requesterSnapshot.name, requesterSnapshot.role, requesterSnapshot.department, JSON.stringify(draftSnapshot)]); }
    catch (error) { if (/unique|duplicate/i.test(String(error?.message))) throw new P0Error('ACTIVE_REVISION_EXISTS', 'PPD aktif sudah tersedia.', { status: 409 }); throw error; }
    const row = result.rows?.[0]; if (!row) throw new P0Error('PPD_CREATE_FAILED', 'PPD draft gagal dibuat.', { status: 500 });
    return { response: { success: true, data: dto(row, []) }, activity: { action_type: 'ppd_draft_created', title: 'PPD draft created', description: 'P0 PPD draft created.' } };
  });
}

export async function savePpdDraft(context = {}, ppdId, input = {}, meta = {}) {
  const artifactId = id(ppdId, 'ppd_id'); const actor = actorOf(context); assertAllowed(ACTIONS.PPD_UPDATE, actor); const split = splitInput(input, meta); let body = split.body; meta = split.meta; assertPpdFields(body); assertRabCount(body); const account = accountFrom(body); delete body.bank_account_number; delete body.account_number; const key = keyOf(meta); expectedMeta(meta); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const db = dbOf(context) || await getDb(); const applicationId = await applicationFor(db, caseId);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'ppd', artifact_id: artifactId, request: { command: 'save', ...body, ...(account !== undefined ? { bank_account_number: account } : {}) } }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Pengajuan Dana (FPD)' || artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft PPD pada tahap Pengajuan Dana (FPD) yang dapat diubah.', { status: 409 });
    const approved = await approvedMpzis(txDb, caseId, applicationId); const draftSnapshot = jsonValue(artifact.snapshot_json) || {}; assertApprovedProvenance(draftSnapshot, approved); const merged = { ...internalFields(artifact), ...body, rab_lines: body.rab_lines ?? (await linesFor(txDb, artifact.id)).map((line) => ({ line_no: line.line_no, register_number: line.register_number, description: line.description, amount: String(line.amount) })), attachments: body.attachments ?? draftSnapshot.attachments ?? [] };
    if (account !== undefined) { const encrypted = encryptBankAccount(String(account), { key: context.encryptionKey ?? context.encryption_key }); merged.bank_account_ciphertext = encrypted; merged.bank_account_last4 = String(account).trim().slice(-4); }
    const validationPayload = { ...merged }; delete validationPayload.bank_account_ciphertext; validate(validationPayload, 'draft', approved.ceiling, requester(txActor));
    for (const field of ['form_number', 'ppd_number', 'transaction_number']) if (await duplicateNumber(txDb, field, merged[field], artifact.id)) throw duplicateError(field);
    const requesterSnapshot = requesterFromRow(artifact, requester(txActor));
    const fields = ['form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source', 'payment_type', 'payment_type_other', 'bank_name', 'bank_account_ciphertext', 'bank_account_last4', 'bank_account_name', 'requester_name', 'requester_role', 'requester_department', 'snapshot_json'];
    const values = fields.map((field) => field === 'requester_name' ? requesterSnapshot.name : field === 'requester_role' ? requesterSnapshot.role : field === 'requester_department' ? requesterSnapshot.department : field === 'snapshot_json' ? JSON.stringify({ ...merged, bank_account_number: undefined, account_number: undefined, bank_account_ciphertext: undefined, bank_account_last4: undefined, approved_mpzis_id: approved.row.id, approved_mpzis_revision: approved.row.revision, approved_mpzis_hash: String(approved.row.snapshot_hash || '').trim() }) : merged[field] ?? null); values.push(artifact.id);
    let result;
    try { result = await txDb.query(`UPDATE ppd SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')} WHERE id=$${values.length} RETURNING *`, values); } catch (error) { if (/unique|duplicate/i.test(String(error?.message))) throw duplicateError('number'); throw error; }
    const row = result.rows?.[0]; if (!row) throw new P0Error('PPD_UPDATE_FAILED', 'PPD draft gagal disimpan.', { status: 500 });
    await replaceLines(txDb, row.id, merged.rab_lines || []);
    return { response: { success: true, data: dto(row, await linesFor(txDb, row.id)) }, activity: { action_type: 'ppd_draft_saved', title: 'PPD draft saved', description: 'P0 PPD draft saved.' } };
  });
}

export async function submitPpd(context = {}, ppdId, input = {}, meta = {}) {
  const artifactId = id(ppdId, 'ppd_id'); const actor = actorOf(context); assertAllowed(ACTIONS.PPD_SUBMIT, actor); const split = splitInput(input, meta); let body = split.body; meta = split.meta; assertPpdFields(body); assertRabCount(body); const account = accountFrom(body); delete body.bank_account_number; delete body.account_number; const key = keyOf(meta); expectedMeta(meta); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const db = dbOf(context) || await getDb(); const applicationId = await applicationFor(db, caseId);
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'ppd', artifact_id: artifactId, request: { command: 'submit', ...body, ...(account !== undefined ? { bank_account_number: account } : {}) } }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Pengajuan Dana (FPD)' || artifact.status !== 'draft' || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'Hanya draft PPD pada tahap Pengajuan Dana (FPD) yang dapat dikirim.', { status: 409 });
    const approved = await approvedMpzis(txDb, caseId, applicationId); const draftSnapshot = jsonValue(artifact.snapshot_json) || {}; assertApprovedProvenance(draftSnapshot, approved); const storedLines = await linesFor(txDb, artifact.id); const merged = { ...internalFields(artifact), ...body, rab_lines: body.rab_lines ?? storedLines.map((line) => ({ line_no: line.line_no, register_number: line.register_number, description: line.description, amount: String(line.amount) })), attachments: body.attachments ?? draftSnapshot.attachments ?? [] };
    if (account !== undefined) { merged.bank_account_ciphertext = encryptBankAccount(String(account), { key: context.encryptionKey ?? context.encryption_key }); merged.bank_account_last4 = String(account).trim().slice(-4); }
    const trusted = requesterFromRow(artifact, requester(txActor)); Object.assign(merged, { schema_version: 1, artifact_type: 'ppd', id: artifact.id, revision: artifact.revision, mustahik_id: caseId, application_id: applicationId, mpzis_id: approved.row.id, template_code: TEMPLATE_CODE, template_version: TEMPLATE_VERSION, source: 'p0', approved_mpzis_id: approved.row.id, approved_mpzis_revision: approved.row.revision, approved_mpzis_hash: String(approved.row.snapshot_hash || '').trim(), requester_name_snapshot: trusted.name, requester_role_snapshot: trusted.role, requester_department_snapshot: trusted.department });
    merged.bank_account_name = merged.bank_account_name ?? null;
    if (!merged.bank_account_ciphertext || !merged.bank_account_last4) throw new P0Error('VALIDATION_FAILED', 'Nomor rekening wajib diisi.', { status: 422, field_errors: { bank_account_number: 'REQUIRED' } });
    const encryptionOptions = { key: context.encryptionKey ?? context.encryption_key }; ensureEncryption(encryptionOptions); verifyAccountPair(merged.bank_account_ciphertext, merged.bank_account_last4, encryptionOptions);
    const validationPayload = { ...merged }; delete validationPayload.bank_account_ciphertext; delete validationPayload.mpzis_id; validate(validationPayload, 'submit', approved.ceiling, trusted);
    const total = sumMoney(merged.rab_lines.map((line) => line.amount)); const amountInWords = terbilangRupiah(total); const snapshotInput = { ...merged }; delete snapshotInput.bank_account_ciphertext; delete snapshotInput.bank_account_last4; delete snapshotInput.mpzis_id; const snapshot = createSnapshot('ppd', snapshotInput);
    for (const field of ['form_number', 'ppd_number', 'transaction_number']) if (await duplicateNumber(txDb, field, merged[field], artifact.id)) throw duplicateError(field);
    const now = new Date().toISOString(); const columns = ['mpzis_id', 'form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source', 'payment_type', 'payment_type_other', 'bank_name', 'bank_account_ciphertext', 'bank_account_last4', 'bank_account_name', 'requester_name', 'requester_role', 'requester_department', 'amount', 'amount_in_words', 'template_code', 'template_version', 'snapshot_json', 'snapshot_hash', 'status', 'submitted_at'];
    const values = columns.map((field) => field === 'snapshot_json' ? JSON.stringify(snapshot.json) : field === 'snapshot_hash' ? snapshot.hash : field === 'status' ? 'submitted' : field === 'submitted_at' ? now : field === 'amount' ? total : field === 'amount_in_words' ? amountInWords : field === 'requester_name' ? trusted.name : field === 'requester_role' ? trusted.role : field === 'requester_department' ? trusted.department : merged[field] ?? null); values.push(artifact.id);
    let result; try { result = await txDb.query(`UPDATE ppd SET ${columns.map((field, i) => `${field}=$${i + 1}`).join(',')} WHERE id=$${values.length} AND status='draft' RETURNING *`, values); } catch (error) { if (/unique|duplicate/i.test(String(error?.message))) throw duplicateError('number'); throw error; }
    const row = result.rows?.[0]; if (!row) throw new P0Error('STALE_ARTIFACT', 'PPD berubah sebelum dikirim.', { status: 409 });
    await replaceLines(txDb, row.id, merged.rab_lines); const response = { success: true, data: dto(row, await linesFor(txDb, row.id)) };
    // The command kernel binds provenance to the locked artifact object after
    // the handler returns; keep its immutable identity in sync with the row
    // just frozen so the new hash is recorded rather than the draft null.
    artifact.snapshot_hash = snapshot.hash;
    const note = 'PPD P0 dikirim untuk pemeriksaan Keuangan.';
    return { response, approval: { approval_step: 'submit', action: 'submit', snapshot_hash: snapshot.hash, note }, decision: { stage: 'ppd', action: 'submit', previous_status: 'draft', next_status: 'submitted', snapshot_hash: snapshot.hash, note, evidence_grade: 'p0' }, activity: { action_type: 'ppd_submitted', title: 'PPD submitted', description: note } };
  });
}

export async function financeCheckPpd(context = {}, ppdId, input = {}, meta = {}) {
  return financeTransition(context, ppdId, input, meta, false);
}
export async function financeApprovePpd(context = {}, ppdId, input = {}, meta = {}) {
  return financeTransition(context, ppdId, input, meta, true);
}
async function financeTransition(context, ppdId, input, meta, approve) {
  const artifactId = id(ppdId, 'ppd_id'); const actor = actorOf(context); const action = approve ? ACTIONS.FINANCE_APPROVE : ACTIONS.FINANCE_CHECK; assertAllowed(action, actor); const split = splitInput(input, meta); const body = split.body; meta = split.meta; const allowed = new Set(['note']); const errors = {}; for (const field of Object.keys(body)) if (!allowed.has(field)) errors[field] = 'FIELD_UNDECLARED'; if (Object.keys(errors).length) throw new P0Error('VALIDATION_FAILED', 'Field keputusan PPD tidak diizinkan.', { status: 422, field_errors: errors }); const key = keyOf(meta); expectedMeta(meta, { hash: approve }); const caseId = id(context.mustahik_id ?? context.mustahikId, 'mustahik_id'); const db = dbOf(context) || await getDb(); const applicationId = await applicationFor(db, caseId); const expectedStatus = approve ? 'finance_checked' : 'submitted';
  return withP0Command({ ...context, db, mustahik_id: caseId }, { ...meta, application_id: applicationId, idempotency_key: key, artifact_type: 'ppd', artifact_id: artifactId, expected_status: meta.expected_status ?? 'Pengajuan Dana (FPD)', request: { action: approve ? 'finance_approve' : 'finance_check', note: body.note ?? null } }, async ({ txDb, artifact, caseRow, actor: txActor }) => {
    if (caseRow.status !== 'Pengajuan Dana (FPD)' || artifact.status !== expectedStatus || artifact.source !== 'p0') throw new P0Error('WRONG_STATE', 'PPD belum berada pada tahap keuangan yang benar.', { status: 409 });
    const creator = artifact.created_by_id; const priorCheck = await txDb.get("SELECT actor_id FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND artifact_revision=$2 AND action='finance_check' ORDER BY id LIMIT 1", [artifact.id, artifact.revision]);
    assertAllowed(action, txActor, approve ? { creator_id: creator, checker_id: priorCheck?.actor_id } : { creator_id: creator, approver_id: priorCheck?.actor_id });
    if (approve && !priorCheck?.actor_id) throw new P0Error('ACTOR_CONTEXT_REQUIRED', 'Bukti pemeriksa Keuangan tidak ditemukan.', { status: 403 });
    const next = approve ? 'finance_approved' : 'finance_checked'; const column = approve ? 'finance_approved_at' : 'finance_checked_at'; const updated = await txDb.query(`UPDATE ppd SET status=$1,${column}=CURRENT_TIMESTAMP WHERE id=$2 AND status=$3 RETURNING *`, [next, artifact.id, expectedStatus]); const row = updated.rows?.[0]; if (!row) throw new P0Error('STALE_ARTIFACT', 'PPD berubah sebelum keputusan Keuangan.', { status: 409 });
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : (approve ? 'PPD disetujui Keuangan.' : 'PPD diperiksa Keuangan.'); const response = { success: true, data: dto(row, await linesFor(txDb, row.id)) };
    return { response, approval: { approval_step: approve ? 'finance_approve' : 'finance_check', action: approve ? 'finance_approve' : 'finance_check', snapshot_hash: artifact.snapshot_hash, note }, decision: { stage: 'ppd', action: approve ? 'finance_approve' : 'finance_check', previous_status: expectedStatus, next_status: next, snapshot_hash: artifact.snapshot_hash, note, evidence_grade: 'p0' }, activity: { action_type: approve ? 'ppd_finance_approved' : 'ppd_finance_checked', title: approve ? 'PPD finance approved' : 'PPD finance checked', description: note, old_status: expectedStatus, new_status: next } };
  });
}

export { TEMPLATE_CODE, TEMPLATE_VERSION };
