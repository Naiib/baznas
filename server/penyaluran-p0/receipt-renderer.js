import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import { P0Error } from './errors.js';
import { canonicalize } from './canonical-snapshot.js';

const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_ASSESSMENT_FIELDS = [
  'husband_in_household', 'husband_name', 'wife_in_household', 'wife_name', 'child_count',
  'house_ownership', 'home_address', 'address_matches_ktp', 'monthly_rent_amount',
  'husband_occupation', 'husband_monthly_income', 'wife_occupation', 'wife_monthly_income',
  'child_occupation', 'child_monthly_support', 'assistance_request', 'applied_to_baznas_before',
  'previous_application_year',
];
const MPZIS_STEPS = ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'];

function incomplete(message) {
  const error = new P0Error('RECEIPT_DATA_INCOMPLETE', message, { status: 422 });
  throw error;
}
function valueAt(object, key, label = key) {
  if (!object || !Object.prototype.hasOwnProperty.call(object, key) || object[key] === undefined || object[key] === null || object[key] === '') incomplete(`${label} is required.`);
  return object[key];
}
function textAt(object, key, label = key) {
  const value = String(valueAt(object, key, label)).trim();
  if (!value) incomplete(`${label} is required.`);
  return value;
}
function timestampAt(object, key, label = key) {
  const raw = valueAt(object, key, label);
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) incomplete(`${label} must be a persisted timestamp.`);
    return raw.toISOString();
  }
  const value = String(raw).trim();
  if (!value) incomplete(`${label} is required.`);
  const calendar = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(value);
  const month = calendar ? Number(calendar[2]) : 0;
  const day = calendar ? Number(calendar[3]) : 0;
  const daysInMonth = calendar ? new Date(Date.UTC(Number(calendar[1]), month, 0)).getUTCDate() : 0;
  if (!calendar || month < 1 || month > 12 || day < 1 || day > daysInMonth || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(new Date(value).getTime())) incomplete(`${label} must be a persisted timestamp.`);
  return new Date(value).toISOString();
}
function moneyAt(object, key, label = key) {
  const value = textAt(object, key, label);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) incomplete(`${label} must be a persisted amount.`);
  const [whole, fraction = ''] = value.split('.');
  return { text: `${whole}.${(fraction + '00').slice(0, 2)}`, cents: BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2)) };
}
function positiveMoneyAt(object, key, label = key) {
  const value = moneyAt(object, key, label);
  if (value.cents <= 0n) incomplete(`${label} must be greater than zero.`);
  return value;
}
function optionalHash(value, label) {
  if (value === null || value === undefined || value === '') return null;
  if (!HASH.test(String(value).trim())) incomplete(`${label} hash is invalid.`);
  return String(value).trim();
}
function hash(value, label) {
  const result = optionalHash(value, label);
  if (!result) incomplete(`${label} hash is required.`);
  return result;
}
function actor(value, label) {
  const row = valueAt({ row: value }, 'row', label);
  const actorId = finiteId(valueAt(row, 'actor_id', `${label} actor_id`), `${label} actor`);
  return { actor_id: actorId, actor_name: textAt(row, 'actor_name', `${label} actor_name`), actor_role: textAt(row, 'actor_role', `${label} actor_role`), actor_level: textAt(row, 'actor_level', `${label} actor_level`), actor_division: textAt(row, 'actor_division', `${label} actor_division`), created_at: timestampAt(row, 'created_at', `${label} created_at`), snapshot_hash: hash(row.snapshot_hash, `${label} snapshot`) };
}
function maskedRecipient(recipient) {
  const row = valueAt({ row: recipient }, 'row', 'recipient');
  const nik = String(valueAt(row, 'nik_mask', 'recipient.nik_mask'));
  if (/\d{10,}/.test(nik) || !/[＊*]/.test(nik)) incomplete('recipient.nik_mask must remain masked.');
  return {
    name: textAt(row, 'name', 'recipient.name'),
    nik_mask: nik,
    address: textAt(row, 'address', 'recipient.address'),
    rt_rw: textAt(row, 'rt_rw', 'recipient.rt_rw'),
    kelurahan: textAt(row, 'kelurahan', 'recipient.kelurahan'),
    kecamatan: textAt(row, 'kecamatan', 'recipient.kecamatan'),
    kabupaten_kota: textAt(row, 'kabupaten_kota', 'recipient.kabupaten_kota'),
    province: textAt(row, 'province', 'recipient.province'),
  };
}
function finiteId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) incomplete(`${label} identity is required.`);
  return id;
}
function sourceFields(source) {
  const fields = {};
  const row = valueAt({ row: source }, 'row', 'assessment.source_fields');
  const booleans = ['husband_in_household', 'wife_in_household', 'address_matches_ktp', 'applied_to_baznas_before'];
  for (const key of booleans) {
    if (typeof row[key] !== 'boolean') incomplete(`assessment.source_fields.${key} is required.`);
  }
  const childCount = Number(row.child_count);
  if (!Number.isSafeInteger(childCount) || childCount < 0 || childCount > 30) incomplete('assessment.source_fields.child_count is required.');
  const ownership = row.house_ownership === undefined || row.house_ownership === null ? '' : String(row.house_ownership).trim();
  if (!ownership) incomplete('assessment.source_fields.house_ownership is required.');
  const absentWhen = {
    husband_name: row.husband_in_household === false,
    husband_occupation: row.husband_in_household === false,
    husband_monthly_income: row.husband_in_household === false,
    wife_name: row.wife_in_household === false,
    wife_occupation: row.wife_in_household === false,
    wife_monthly_income: row.wife_in_household === false,
    child_occupation: childCount === 0,
    child_monthly_support: childCount === 0,
    monthly_rent_amount: ownership !== 'Kontrak',
    previous_application_year: row.applied_to_baznas_before === false,
  };
  for (const key of REQUIRED_ASSESSMENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(row, key) || row[key] === undefined) incomplete(`assessment.source_fields.${key} is required.`);
    if (row[key] === null) {
      if (absentWhen[key]) fields[key] = 'Belum dicatat';
      else incomplete(`assessment.source_fields.${key} is required.`);
      continue;
    }
    if (['monthly_rent_amount', 'husband_monthly_income', 'wife_monthly_income', 'child_monthly_support'].includes(key)) {
      fields[key] = moneyAt(row, key, `assessment.source_fields.${key}`).text;
    } else {
      fields[key] = row[key];
    }
  }
  return fields;
}

/** Build the immutable, masked JSON payload that is hashed and printed on the receipt. */
export function buildReceiptPayload(bundle = {}) {
  const assessment = valueAt(bundle, 'assessment', 'assessment');
  const mpzis = valueAt(bundle, 'mpzis', 'mpzis');
  const ppd = valueAt(bundle, 'ppd', 'ppd');
  const payment = valueAt(bundle, 'payment', 'payment');
  const confirmation = valueAt(bundle, 'confirmation', 'confirmation');
  const completion = valueAt(bundle, 'completion', 'completion');
  const recipient = maskedRecipient(bundle.recipient);
  const payload = {
    schema_version: 1,
    receipt_id: textAt(bundle, 'receipt_id'),
    created_at: timestampAt(bundle, 'created_at'),
    case_number: textAt(bundle, 'case_number'),
    mustahik_id: finiteId(valueAt(bundle, 'mustahik_id'), 'mustahik'),
    recipient,
    assessment: {
      id: finiteId(valueAt(assessment, 'id', 'assessment.id'), 'assessment'), revision: finiteId(valueAt(assessment, 'revision', 'assessment.revision'), 'assessment revision'), status: textAt(assessment, 'status', 'assessment.status'), snapshot_hash: hash(assessment.snapshot_hash, 'assessment'), source_fields: sourceFields(assessment.source_fields),
    },
    mpzis: {
      id: finiteId(valueAt(mpzis, 'id', 'mpzis.id'), 'mpzis'), revision: finiteId(valueAt(mpzis, 'revision', 'mpzis.revision'), 'mpzis revision'), form_number: textAt(mpzis, 'form_number', 'mpzis.form_number'), classification: textAt(mpzis, 'classification', 'mpzis.classification'), purpose: textAt(mpzis, 'purpose', 'mpzis.purpose'), asnaf: textAt(mpzis, 'asnaf', 'mpzis.asnaf'), fund_source: textAt(mpzis, 'fund_source', 'mpzis.fund_source'), recipient_name: textAt(mpzis, 'recipient_name', 'mpzis.recipient_name'), recipient_type: textAt(mpzis, 'recipient_type', 'mpzis.recipient_type'), beneficiary_count: finiteId(valueAt(mpzis, 'beneficiary_count', 'mpzis.beneficiary_count'), 'beneficiary count'), amount: positiveMoneyAt(mpzis, 'amount', 'mpzis.amount').text, snapshot_hash: hash(mpzis.snapshot_hash, 'mpzis'), approvals: [],
    },
    ppd: {
      id: finiteId(valueAt(ppd, 'id', 'ppd.id'), 'ppd'), revision: finiteId(valueAt(ppd, 'revision', 'ppd.revision'), 'ppd revision'), form_number: textAt(ppd, 'form_number', 'ppd.form_number'), ppd_number: textAt(ppd, 'ppd_number', 'ppd.ppd_number'), transaction_number: textAt(ppd, 'transaction_number', 'ppd.transaction_number'), requester_name: textAt(ppd, 'requester_name', 'ppd.requester_name'), requester_role: textAt(ppd, 'requester_role', 'ppd.requester_role'), requester_department: textAt(ppd, 'requester_department', 'ppd.requester_department'), fund_source: textAt(ppd, 'fund_source', 'ppd.fund_source'), payment_type: textAt(ppd, 'payment_type', 'ppd.payment_type'), bank_name: textAt(ppd, 'bank_name', 'ppd.bank_name'), bank_account_last4: textAt(ppd, 'bank_account_last4', 'ppd.bank_account_last4'), bank_account_masked: `********${textAt(ppd, 'bank_account_last4', 'ppd.bank_account_last4')}`, bank_account_name: textAt(ppd, 'bank_account_name', 'ppd.bank_account_name'), rab_lines: [], amount: positiveMoneyAt(ppd, 'amount', 'ppd.amount').text, amount_in_words: textAt(ppd, 'amount_in_words', 'ppd.amount_in_words'), snapshot_hash: hash(ppd.snapshot_hash, 'ppd'),
    },
    finance: { check: actor(valueAt(bundle.finance, 'check', 'finance.check'), 'finance check'), approve: actor(valueAt(bundle.finance, 'approve', 'finance.approve'), 'finance approve') },
    payment: { transaction_number: textAt(payment, 'transaction_number', 'payment.transaction_number'), amount: positiveMoneyAt(payment, 'amount', 'payment.amount').text, paid_at: timestampAt(payment, 'paid_at', 'payment.paid_at'), proof_file_id: finiteId(valueAt(payment, 'proof_file_id', 'payment.proof_file_id'), 'payment proof'), proof_file_revision: finiteId(valueAt(payment, 'proof_file_revision', 'payment.proof_file_revision'), 'payment proof revision'), proof_sha256: hash(payment.proof_sha256, 'payment proof') },
    confirmation: { method: textAt(confirmation, 'method', 'confirmation.method'), confirmed_at: timestampAt(confirmation, 'confirmed_at', 'confirmation.confirmed_at'), snapshot_hash: hash(confirmation.snapshot_hash, 'confirmation'), actor: actor(valueAt(confirmation, 'actor', 'confirmation.actor'), 'confirmation actor'), evidence_file_id: confirmation.evidence_file_id == null ? null : finiteId(confirmation.evidence_file_id, 'confirmation evidence'), evidence_file_revision: confirmation.evidence_file_id == null ? null : finiteId(valueAt(confirmation, 'evidence_file_revision', 'confirmation.evidence_file_revision'), 'confirmation evidence revision'), evidence_sha256: optionalHash(confirmation.evidence_sha256, 'confirmation evidence') },
    completion: { actor: actor(valueAt(completion, 'actor', 'completion.actor'), 'completion actor'), completed_at: timestampAt(completion, 'completed_at', 'completion.completed_at'), correlation_id: textAt(completion, 'correlation_id', 'completion.correlation_id'), snapshot_hash: hash(completion.snapshot_hash, 'completion event'), completion_hash: hash(completion.completion_hash, 'completion') },
  };
  const approvals = Array.isArray(mpzis.approvals) ? mpzis.approvals : [];
  const byStep = new Map();
  let lastStep = -1;
  for (const row of approvals) {
    const step = textAt(row, 'approval_step', 'mpzis approval_step');
    if (MPZIS_STEPS.includes(step)) {
      const stepIndex = MPZIS_STEPS.indexOf(step);
      if (stepIndex <= lastStep || byStep.has(step)) incomplete('MPZIS approvals must be in canonical order.');
      lastStep = stepIndex;
      byStep.set(step, actor(row, `mpzis ${step}`));
    }
  }
  if (byStep.size !== MPZIS_STEPS.length) incomplete('all five MPZIS approvals are required.');
  payload.mpzis.approvals = MPZIS_STEPS.map((step) => ({ approval_step: step, ...byStep.get(step) }));
  const approvalIds = payload.mpzis.approvals.map((row) => row.actor_id);
  if (new Set(approvalIds).size !== approvalIds.length) incomplete('MPZIS approvals require five distinct actors.');
  const forbiddenActors = [mpzis.created_by_id, mpzis.submitted_by_id].filter((id) => id !== undefined && id !== null).map(Number);
  if (forbiddenActors.some((id) => approvalIds.includes(id))) incomplete('MPZIS creator or submitter cannot approve.');
  const rab = Array.isArray(ppd.rab_lines) ? ppd.rab_lines : [];
  if (rab.length < 1 || rab.length > 3) incomplete('one to three RAB rows are required.');
  payload.ppd.rab_lines = rab.map((line) => {
    const lineNo = finiteId(valueAt(line, 'line_no', 'RAB line_no'), 'RAB line');
    if (lineNo > 3) incomplete('RAB line_no must be between one and three.');
    return { line_no: lineNo, register_number: textAt(line, 'register_number', 'RAB register_number'), description: textAt(line, 'description', 'RAB description'), amount: positiveMoneyAt(line, 'amount', 'RAB amount').text };
  });
  if (new Set(payload.ppd.rab_lines.map((line) => line.line_no)).size !== payload.ppd.rab_lines.length) incomplete('RAB line numbers must be unique.');
  const ppdCents = BigInt(payload.ppd.amount.replace('.', ''));
  const rabCents = payload.ppd.rab_lines.reduce((sum, row) => sum + BigInt(row.amount.replace('.', '')), 0n);
  if (ppdCents !== rabCents) incomplete('PPD amount must equal the persisted RAB total.');
  if (!/^\d{4}$/.test(payload.ppd.bank_account_last4)) incomplete('PPD bank account must expose exactly four masked digits.');
  if (payload.payment.transaction_number !== payload.ppd.transaction_number || BigInt(payload.payment.amount.replace('.', '')) !== ppdCents) incomplete('Payment must match the persisted PPD.');
  if ((payload.confirmation.evidence_file_id === null) !== (payload.confirmation.evidence_sha256 === null)
    || (payload.confirmation.evidence_file_id === null) !== (payload.confirmation.evidence_file_revision === null)) incomplete('Confirmation evidence id, revision, and hash must be paired.');
  if (new Set([payload.finance.check.actor_id, payload.finance.approve.actor_id]).size !== 2) incomplete('Finance check and approval require distinct actors.');
  if (new Date(payload.finance.check.created_at).getTime() > new Date(payload.finance.approve.created_at).getTime()) incomplete('Finance check must precede approval.');
  const canonical = canonicalize(payload);
  return { ...payload, receipt_payload_sha256: crypto.createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex') };
}

function line(doc, text, size = 8) {
  doc.fontSize(size).text(String(text), { width: 500, lineGap: 2 });
}
function renderObject(doc, title, value) {
  line(doc, `-- ${title} --`, 10);
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) item.forEach((child, index) => renderObject(doc, `${key}[${index + 1}]`, child));
    else if (item && typeof item === 'object') renderObject(doc, key, item);
    else line(doc, `${key}: ${item === null ? 'none' : item}`);
  }
}

/** Render a deterministic PDF from the canonical persisted receipt payload. */
export async function renderDistributionReceipt(bundle) {
  const payload = buildReceiptPayload(bundle);
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ autoFirstPage: true, compress: false, info: { Title: 'Bukti Digital Penyaluran', Author: 'BAZNAS', Subject: 'Authoritative persisted receipt', CreationDate: new Date(payload.created_at), ModDate: new Date(payload.created_at) } });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    line(doc, 'BAZNAS'); line(doc, 'Bukti Digital Penyaluran', 16); line(doc, `Receipt ID: ${payload.receipt_id}`); line(doc, `Creation server time: ${payload.created_at}`); line(doc, `Case/File number: ${payload.case_number}`);
    renderObject(doc, 'Recipient identity and location (masked)', payload.recipient);
    for (const copy of [1, 2]) { line(doc, `Salinan dari satu record digital - Assessment copy ${copy}`, 11); renderObject(doc, 'Assessment', payload.assessment); }
    renderObject(doc, 'MPZIS F-BPP/06', payload.mpzis); renderObject(doc, 'PPD F-PKP/03', payload.ppd); line(doc, `RAB total (calculated): ${payload.ppd.amount}`); renderObject(doc, 'Finance actors', payload.finance); renderObject(doc, 'Payment and proof', payload.payment); renderObject(doc, 'Recipient confirmation', payload.confirmation); renderObject(doc, 'Completion', payload.completion);
    line(doc, `Hash data bukti (receipt_payload_sha256): ${payload.receipt_payload_sha256}`); line(doc, 'SHA-256 file hash is persisted separately from this payload hash.'); line(doc, 'Approvals are authenticated system events without signature images.');
    doc.end();
  });
}

export { MPZIS_STEPS };
