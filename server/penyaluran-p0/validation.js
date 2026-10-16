import { P0Error } from './errors.js';
import { MAX_CENTS, formatMoney, parseMoney } from './money.js';
import { SNAPSHOT_SCHEMAS } from './canonical-snapshot.js';

export const ENUMS = Object.freeze({
  house_ownership: Object.freeze(['Kontrak', 'Milik Sendiri', 'Orang Tua (Menumpang)']),
  fund_source: Object.freeze(['Zakat', 'Infaq/Shodaqoh', 'DSKL', 'Hibah']),
  recipient_type: Object.freeze(['Individu', 'Keluarga', 'Kelompok / Yayasan']),
  payment_type: Object.freeze(['Uang Muka', 'Reimbursement', 'Pembayaran', 'Lain-lain']),
  confirmation_method: Object.freeze(['Tatap Muka', 'Telepon', 'WhatsApp', 'Tanda Terima']),
});

const SCORE_FIELDS = Object.freeze(['overall_score', 'house_index', 'asset_index', 'income_index', 'spiritual_score', 'priority']);
const PPD_FORBIDDEN = Object.freeze([
  'amount', 'total', 'amount_in_words', 'terbilang', 'requester_name', 'requester_role', 'requester_department',
  'actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'bank_account', 'bank_account_encrypted', 'bank_account_ciphertext',
]);
const PAYMENT_FORBIDDEN = Object.freeze(['actor_id', 'actor_name', 'verified_by_id', 'session_id']);
const RAB_ALLOWED = new Set(['line_no', 'register_number', 'description', 'amount']);
const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const ASSESSMENT_FIELDS = new Set(SNAPSHOT_SCHEMAS.assessment.fields);
const MPZIS_FIELDS = new Set(SNAPSHOT_SCHEMAS.mpzis.fields);
const PPD_FIELDS = new Set(SNAPSHOT_SCHEMAS.ppd.fields);
const PAYMENT_FIELDS = new Set(SNAPSHOT_SCHEMAS.payment.fields);
const CONFIRMATION_FIELDS = new Set(SNAPSHOT_SCHEMAS.recipient_confirmation.fields);
const COMMON_FIELDS = Object.freeze(['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id']);
const PPD_REFERENCE_FIELDS = Object.freeze(['ppd_id', 'ppd_revision', 'ppd_hash']);
const ATTACHMENT_ALLOWED = new Set(['id', 'file_id', 'kind', 'mime_type', 'byte_size', 'sha256']);
const EVIDENCE_KINDS = new Set(['supporting_document']);

function result(field_errors = {}, extra = {}) {
  return { valid: Object.keys(field_errors).length === 0, field_errors, ...extra };
}

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function present(value) { return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim()); }
function isBoolean(value) { return value === true || value === false; }
function add(errors, field, code) { if (!errors[field]) errors[field] = code; }
function rejectUnknown(input, allowed, errors) {
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === 'symbol') add(errors, String(key), 'FIELD_UNDECLARED');
    else if (!allowed.has(key)) add(errors, key, 'FIELD_UNDECLARED');
  }
}
function required(errors, value, field) { if (!present(value)) add(errors, field, 'REQUIRED'); }
function enumValue(errors, value, field, values) { if (present(value) && !values.includes(value)) add(errors, field, 'ENUM'); }
function money(errors, value, field, { positive = false, requiredValue = false } = {}) {
  if (!present(value)) { if (requiredValue) add(errors, field, 'REQUIRED'); return null; }
  try {
    const cents = parseMoney(value);
    if (positive && cents <= 0n) add(errors, field, 'POSITIVE_REQUIRED');
    return cents;
  } catch (error) {
    add(errors, field, error.code || 'MONEY_FORMAT');
    return null;
  }
}
function conditionNull(errors, value, field) {
  if (value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '')) add(errors, field, 'MUST_BE_NULL');
}
function dateMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}
function boundedTimestamp(errors, value, field, now, requiredValue = true) {
  if (requiredValue) required(errors, value, field);
  if (!present(value)) return;
  const millis = dateMillis(value);
  if (!Number.isFinite(millis) || millis > now.getTime() + MAX_FUTURE_MS) add(errors, field, 'TIME_BOUNDS');
}
function hash(errors, value, field, requiredValue = true) {
  if (!present(value)) { if (requiredValue) add(errors, field, 'REQUIRED'); return; }
  if (typeof value !== 'string' || !HASH_RE.test(value)) add(errors, field, 'HASH');
}
function fileMetadata(errors, input, prefix, requiredValue = false) {
  const id = input[`${prefix}_file_id`];
  const mime = input[`${prefix}_mime_type`];
  const size = input[`${prefix}_byte_size`];
  const digest = input[`${prefix}_sha256`];
  if (requiredValue) required(errors, id, `${prefix}_file_id`);
  if (requiredValue) required(errors, mime, `${prefix}_mime_type`);
  if (requiredValue) required(errors, size, `${prefix}_byte_size`);
  if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) add(errors, `${prefix}_file_id`, 'INTEGER');
  if (mime !== undefined && !['application/pdf', 'image/jpeg', 'image/png'].includes(mime)) add(errors, `${prefix}_mime_type`, 'MIME');
  if (size !== undefined && (!Number.isSafeInteger(size) || size <= 0 || size > 10 * 1024 * 1024)) add(errors, `${prefix}_byte_size`, 'SIZE');
  hash(errors, digest, `${prefix}_sha256`, requiredValue);
}
function validateMode(options) { return options?.mode === 'draft' ? 'draft' : 'submit'; }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function validateCommon(input, artifactType, errors, submit, extraRequired = []) {
  for (const field of COMMON_FIELDS) {
    if (submit) required(errors, input[field], field);
    if (input[field] !== undefined && input[field] !== null) {
      if (field === 'artifact_type' && input[field] !== artifactType) add(errors, field, 'ARTIFACT_TYPE');
      if (field === 'schema_version' && (!positiveInteger(input[field]) || input[field] !== 1)) add(errors, field, 'INTEGER');
      if (['id', 'revision', 'mustahik_id', 'application_id'].includes(field) && !positiveInteger(input[field])) add(errors, field, 'INTEGER');
    }
  }
  for (const field of extraRequired) {
    if (submit) required(errors, input[field], field);
    if (input[field] !== undefined && input[field] !== null) {
      if (field.endsWith('_id') || field.endsWith('_revision')) { if (!positiveInteger(input[field])) add(errors, field, 'INTEGER'); }
      if (field.endsWith('_hash')) { if (typeof input[field] !== 'string' || !HASH_RE.test(input[field])) add(errors, field, 'HASH'); }
    }
  }
}
function validateRequesterSnapshot(errors, input, submit, trusted) {
  if (!submit) return;
  const expected = trusted && typeof trusted === 'object' ? { name: text(trusted.name), role: text(trusted.role), department: text(trusted.department) } : null;
  if (!expected?.name || !expected.role || !expected.department) { add(errors, 'requester_name_snapshot', 'REQUESTER_CONTEXT_REQUIRED'); return; }
  const actual = { name: text(input.requester_name_snapshot), role: text(input.requester_role_snapshot), department: text(input.requester_department_snapshot) };
  for (const [key, field] of [['name', 'requester_name_snapshot'], ['role', 'requester_role_snapshot'], ['department', 'requester_department_snapshot']]) if (actual[key] !== expected[key]) add(errors, field, 'REQUESTER_MISMATCH');
}
function validateAttachments(errors, value, submit) {
  if (value === undefined || value === null) { if (submit) add(errors, 'attachments', 'REQUIRED'); return; }
  if (!Array.isArray(value) || (submit && value.length < 1)) { add(errors, 'attachments', 'COUNT'); return; }
  value.forEach((file, index) => {
    const prefix = `attachments.${index}`;
    if (!file || typeof file !== 'object' || Array.isArray(file)) { add(errors, prefix, 'INVALID'); return; }
    for (const key of Reflect.ownKeys(file)) if (typeof key === 'symbol' || !ATTACHMENT_ALLOWED.has(key)) add(errors, `${prefix}.${String(key)}`, 'FIELD_UNDECLARED');
    for (const field of ['file_id', 'kind', 'mime_type', 'byte_size', 'sha256']) required(errors, file[field], `${prefix}.${field}`);
    if (file.id !== undefined && !positiveInteger(file.id)) add(errors, `${prefix}.id`, 'INTEGER');
    if (file.file_id !== undefined && !positiveInteger(file.file_id)) add(errors, `${prefix}.file_id`, 'INTEGER');
    if (file.kind !== undefined && !EVIDENCE_KINDS.has(file.kind)) add(errors, `${prefix}.kind`, 'ENUM');
    if (file.mime_type !== undefined && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mime_type)) add(errors, `${prefix}.mime_type`, 'MIME');
    if (file.byte_size !== undefined && (!Number.isSafeInteger(file.byte_size) || file.byte_size <= 0 || file.byte_size > 10 * 1024 * 1024)) add(errors, `${prefix}.byte_size`, 'SIZE');
    if (file.sha256 !== undefined && (typeof file.sha256 !== 'string' || !HASH_RE.test(file.sha256))) add(errors, `${prefix}.sha256`, 'HASH');
  });
}

export function validateAssessment(input = {}, options = {}) {
  const errors = {};
  const mode = validateMode(options);
  validateCommon(input, 'assessment', errors, mode === 'submit');
  for (const field of Reflect.ownKeys(input)) if (typeof field === 'string' && (SCORE_FIELDS.includes(field) || /(?:score|index|priority)/i.test(field))) add(errors, field, 'FIELD_FORBIDDEN');
  rejectUnknown(input, ASSESSMENT_FIELDS, errors);
  const submit = mode === 'submit';
  if (input.template_code !== undefined && input.template_code !== 'ASSESSMENT_LANGSUNG_MUSTAHIK') add(errors, 'template_code', 'TEMPLATE_CODE');
  if (input.template_version !== undefined && input.template_version !== '2026-09-13') add(errors, 'template_version', 'TEMPLATE_VERSION');
  if (input.source !== undefined && input.source !== 'p0') add(errors, 'source', 'ENUM');
  if (submit) {
    for (const field of ['template_code', 'template_version', 'source']) required(errors, input[field], field);
  }

  for (const field of ['husband_in_household', 'wife_in_household', 'address_matches_ktp', 'applied_to_baznas_before']) {
    if (!isBoolean(input[field])) { if (submit || input[field] !== undefined) add(errors, field, submit ? 'REQUIRED' : 'BOOLEAN'); }
  }
  for (const field of ['home_address', 'assistance_request']) if (submit) required(errors, input[field], field);
  if (input.husband_in_household === true) {
    if (submit) { required(errors, input.husband_name, 'husband_name'); required(errors, input.husband_occupation, 'husband_occupation'); money(errors, input.husband_monthly_income, 'husband_monthly_income', { requiredValue: true }); }
  } else if (input.husband_in_household === false) {
    for (const field of ['husband_name', 'husband_occupation', 'husband_monthly_income']) conditionNull(errors, input[field], field);
  }
  if (input.wife_in_household === true) {
    if (submit) { required(errors, input.wife_name, 'wife_name'); required(errors, input.wife_occupation, 'wife_occupation'); money(errors, input.wife_monthly_income, 'wife_monthly_income', { requiredValue: true }); }
  } else if (input.wife_in_household === false) {
    for (const field of ['wife_name', 'wife_occupation', 'wife_monthly_income']) conditionNull(errors, input[field], field);
  }
  if (input.husband_in_household === true) money(errors, input.husband_monthly_income, 'husband_monthly_income', { requiredValue: submit });
  if (input.wife_in_household === true) money(errors, input.wife_monthly_income, 'wife_monthly_income', { requiredValue: submit });

  if (input.child_count === undefined || input.child_count === null || input.child_count === '') {
    if (submit) add(errors, 'child_count', 'REQUIRED');
  } else if (!Number.isInteger(input.child_count) || input.child_count < 0 || input.child_count > 30) add(errors, 'child_count', 'RANGE');
  if (input.child_count === 0) {
    conditionNull(errors, input.child_occupation, 'child_occupation');
    conditionNull(errors, input.child_monthly_support, 'child_monthly_support');
  } else if (Number.isInteger(input.child_count) && input.child_count > 0) {
    if (submit) required(errors, input.child_occupation, 'child_occupation');
    if (submit) money(errors, input.child_monthly_support, 'child_monthly_support', { requiredValue: true });
    else if (present(input.child_monthly_support)) money(errors, input.child_monthly_support, 'child_monthly_support');
  }

  enumValue(errors, input.house_ownership, 'house_ownership', ENUMS.house_ownership);
  if (submit) required(errors, input.house_ownership, 'house_ownership');
  if (input.house_ownership === 'Kontrak') money(errors, input.monthly_rent_amount, 'monthly_rent_amount', { positive: true, requiredValue: submit });
  else conditionNull(errors, input.monthly_rent_amount, 'monthly_rent_amount');
  if (input.applied_to_baznas_before === true) {
    if (submit) required(errors, input.previous_application_year, 'previous_application_year');
    const year = input.previous_application_year;
    const currentYear = (options.now instanceof Date ? options.now : new Date()).getUTCFullYear();
    if (present(input.previous_application_year) && (!Number.isInteger(year) || year < 2000 || year > currentYear)) add(errors, 'previous_application_year', 'RANGE');
  } else if (input.applied_to_baznas_before === false) conditionNull(errors, input.previous_application_year, 'previous_application_year');
  return result(errors);
}

export function validateMpzis(input = {}, options = {}) {
  const errors = {};
  const submit = validateMode(options) === 'submit';
  validateCommon(input, 'mpzis', errors, submit);
  rejectUnknown(input, MPZIS_FIELDS, errors);
  if (input.template_code !== undefined && input.template_code !== 'F-BPP/06') add(errors, 'template_code', 'TEMPLATE_CODE');
  if (input.template_version !== undefined && input.template_version !== '2026-09-13') add(errors, 'template_version', 'TEMPLATE_VERSION');
  if (input.source !== undefined && input.source !== 'p0') add(errors, 'source', 'ENUM');
  if (submit) {
    for (const field of ['template_code', 'template_version', 'source', 'form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf', 'recipient_name', 'marital_status_snapshot']) required(errors, input[field], field);
    required(errors, input.accepted_assessment_id, 'accepted_assessment_id');
    required(errors, input.accepted_assessment_revision, 'accepted_assessment_revision');
    hash(errors, input.accepted_assessment_hash, 'accepted_assessment_hash');
  }
  for (const field of ['accepted_assessment_id', 'accepted_assessment_revision']) {
    if (input[field] !== undefined && (!Number.isSafeInteger(input[field]) || input[field] < 1)) add(errors, field, 'INTEGER');
  }
  enumValue(errors, input.fund_source, 'fund_source', ENUMS.fund_source);
  enumValue(errors, input.recipient_type, 'recipient_type', ENUMS.recipient_type);
  if (submit) { required(errors, input.fund_source, 'fund_source'); required(errors, input.recipient_type, 'recipient_type'); }
  if (input.beneficiary_count !== undefined && (!Number.isInteger(input.beneficiary_count) || input.beneficiary_count < 1)) add(errors, 'beneficiary_count', 'RANGE');
  else if (submit && !present(input.beneficiary_count)) add(errors, 'beneficiary_count', 'REQUIRED');
  const address = input.address_snapshot;
  if (submit && (!address || typeof address !== 'object')) add(errors, 'address_snapshot', 'REQUIRED');
  if (address && typeof address === 'object') for (const key of Reflect.ownKeys(address)) if (typeof key === 'symbol' || !['address', 'rt_rw', 'kelurahan', 'kecamatan', 'kabupaten_kota', 'province'].includes(key)) add(errors, `address_snapshot.${String(key)}`, 'FIELD_UNDECLARED');
  for (const field of ['address', 'rt_rw', 'kelurahan', 'kecamatan', 'kabupaten_kota', 'province']) if (submit && !present(address?.[field])) add(errors, `address_snapshot.${field}`, 'REQUIRED');
  if (input.recipient_section_confirmed !== true && submit) add(errors, 'recipient_section_confirmed', 'CONFIRM_REQUIRED');
  if (input.fund_source_confirmed !== true && submit) add(errors, 'fund_source_confirmed', 'CONFIRM_REQUIRED');
  money(errors, input.total_amount, 'total_amount', { positive: true, requiredValue: submit });
  return result(errors);
}

export function validatePpd(input = {}, options = {}) {
  const errors = {};
  const submit = validateMode(options) === 'submit';
  validateCommon(input, 'ppd', errors, submit);
  for (const field of PPD_FORBIDDEN) if (Object.prototype.hasOwnProperty.call(input, field)) add(errors, field, 'FIELD_FORBIDDEN');
  rejectUnknown(input, new Set([...PPD_FIELDS, ...PPD_FORBIDDEN]), errors);
  if (input.template_code !== undefined && input.template_code !== 'F-PKP/03') add(errors, 'template_code', 'TEMPLATE_CODE');
  if (input.template_version !== undefined && input.template_version !== '2026-09-13') add(errors, 'template_version', 'TEMPLATE_VERSION');
  if (submit) {
    for (const field of ['approved_mpzis_id', 'approved_mpzis_revision']) {
      if (!Number.isSafeInteger(input[field]) || input[field] < 1) add(errors, field, 'INTEGER');
    }
    hash(errors, input.approved_mpzis_hash, 'approved_mpzis_hash');
  }
  if (submit) for (const field of ['template_code', 'template_version', 'source', 'form_number', 'ppd_number', 'transaction_number', 'purpose', 'bank_name', 'bank_account_last4', 'bank_account_name', 'requester_name_snapshot', 'requester_role_snapshot', 'requester_department_snapshot']) required(errors, input[field], field);
  validateRequesterSnapshot(errors, input, submit, options.trustedRequesterSnapshot);
  enumValue(errors, input.fund_source, 'fund_source', ENUMS.fund_source);
  enumValue(errors, input.payment_type, 'payment_type', ENUMS.payment_type);
  if (submit) { if (input.fund_source_confirmed !== true) add(errors, 'fund_source_confirmed', 'CONFIRM_REQUIRED'); if (input.payment_type_confirmed !== true) add(errors, 'payment_type_confirmed', 'CONFIRM_REQUIRED'); required(errors, input.fund_source, 'fund_source'); required(errors, input.payment_type, 'payment_type'); }
  if (input.payment_type === 'Lain-lain') {
    const other = text(input.payment_type_other);
    if (submit && (other.length < 3 || other.length > 150)) add(errors, 'payment_type_other', 'LENGTH');
  } else if (present(input.payment_type_other)) add(errors, 'payment_type_other', 'MUST_BE_NULL');
  validateAttachments(errors, input.attachments, submit);
  if (present(input.bank_account_last4) && !/^\d{4}$/.test(String(input.bank_account_last4))) add(errors, 'bank_account_last4', 'FORMAT');
  const lines = input.rab_lines;
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 3) {
    if (submit || options.mode === undefined) add(errors, 'rab_lines', 'COUNT');
  }
  let total = 0n;
  if (Array.isArray(lines)) {
    lines.forEach((line, i) => {
      const prefix = `rab_lines.${i}`;
      if (!line || typeof line !== 'object') { add(errors, prefix, 'INVALID'); return; }
      for (const key of Reflect.ownKeys(line)) if (typeof key === 'symbol' || !RAB_ALLOWED.has(key)) add(errors, `${prefix}.${String(key)}`, 'FIELD_UNDECLARED');
      if (submit) { required(errors, line.line_no, `${prefix}.line_no`); required(errors, line.register_number, `${prefix}.register_number`); required(errors, line.description, `${prefix}.description`); }
      const cents = money(errors, line.amount, `${prefix}.amount`, { positive: true, requiredValue: submit });
      if (cents !== null) total += cents;
      if (line.line_no !== undefined && !Number.isSafeInteger(line.line_no)) add(errors, `${prefix}.line_no`, 'INTEGER');
      else if (line.line_no !== undefined && line.line_no !== i + 1) add(errors, `${prefix}.line_no`, 'ORDER');
    });
  }
  if (total > MAX_CENTS) add(errors, 'total', 'MONEY_RANGE');
  const totalText = formatMoney(total);
  if (options.mpzisCeiling !== undefined && total > 0n) {
    try { if (total > parseMoney(options.mpzisCeiling)) add(errors, 'total', 'CEILING'); }
    catch { add(errors, 'mpzisCeiling', 'MONEY_FORMAT'); }
  }
  return result(errors, { total: totalText });
}

export function validatePayment(input = {}, options = {}) {
  const errors = {};
  const now = options.now instanceof Date ? options.now : new Date();
  const submit = validateMode(options) === 'submit';
  validateCommon(input, 'payment', errors, submit, PPD_REFERENCE_FIELDS);
  for (const field of PAYMENT_FORBIDDEN) if (Object.prototype.hasOwnProperty.call(input, field)) add(errors, field, 'FIELD_FORBIDDEN');
  rejectUnknown(input, new Set([...PAYMENT_FIELDS, ...PAYMENT_FORBIDDEN]), errors);
  if (submit) for (const field of ['transaction_number', 'paid_amount', 'paid_at', 'proof_file_id', 'proof_mime_type', 'proof_byte_size', 'proof_sha256']) required(errors, input[field], field);
  money(errors, input.paid_amount, 'paid_amount', { positive: true, requiredValue: submit });
  if (options.ppdAmount !== undefined && present(input.paid_amount)) {
    try { if (parseMoney(input.paid_amount) !== parseMoney(options.ppdAmount)) add(errors, 'paid_amount', 'EXACT_AMOUNT'); }
    catch { add(errors, 'paid_amount', 'MONEY_FORMAT'); }
  }
  if (present(input.proof_mime_type) && !['application/pdf', 'image/jpeg', 'image/png'].includes(input.proof_mime_type)) add(errors, 'proof_mime_type', 'MIME');
  if (present(input.proof_byte_size) && (!Number.isInteger(input.proof_byte_size) || input.proof_byte_size <= 0 || input.proof_byte_size > 10 * 1024 * 1024)) add(errors, 'proof_byte_size', 'SIZE');
  fileMetadata(errors, input, 'proof', submit);
  boundedTimestamp(errors, input.paid_at, 'paid_at', now, submit);
  return result(errors);
}

export function validateRecipientConfirmation(input = {}, options = {}) {
  const errors = {};
  const now = options.now instanceof Date ? options.now : new Date();
  const submit = validateMode(options) === 'submit';
  validateCommon(input, 'recipient_confirmation', errors, submit, PPD_REFERENCE_FIELDS);
  rejectUnknown(input, CONFIRMATION_FIELDS, errors);
  if (submit && (options.paid === false || (options.paymentVerified !== true && options.payment_status !== 'payment_verified'))) add(errors, 'paid', 'PAYMENT_REQUIRED');
  if (submit) for (const field of ['method', 'recipient_name_snapshot', 'confirmed_at', 'note']) required(errors, input[field], field);
  enumValue(errors, input.method, 'method', ENUMS.confirmation_method);
  if (present(input.note) && (text(input.note).length < 10 || text(input.note).length > 1000)) add(errors, 'note', 'LENGTH');
  boundedTimestamp(errors, input.confirmed_at, 'confirmed_at', now, validateMode(options) === 'submit');
  if (input.evidence_file_id !== undefined || input.evidence_mime_type !== undefined || input.evidence_byte_size !== undefined || input.evidence_sha256 !== undefined) fileMetadata(errors, input, 'evidence', true);
  return result(errors);
}

export function assertValid(validationResult) {
  if (!validationResult?.valid) throw new P0Error('VALIDATION_FAILED', 'Data P0 tidak valid.', { field_errors: validationResult?.field_errors });
  return validationResult;
}
