import crypto from 'node:crypto';
import { P0Error } from './errors.js';

const COMMON = ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id'];
const SOURCE_FIELDS = Object.freeze([
  'husband_in_household', 'husband_name', 'wife_in_household', 'wife_name', 'child_count',
  'house_ownership', 'home_address', 'address_matches_ktp', 'monthly_rent_amount',
  'husband_occupation', 'husband_monthly_income', 'wife_occupation', 'wife_monthly_income',
  'child_occupation', 'child_monthly_support', 'assistance_request', 'applied_to_baznas_before',
  'previous_application_year',
]);

const SCHEMA = (fields, extra = {}) => Object.freeze({ fields: Object.freeze(fields), ...extra });

export const SNAPSHOT_SCHEMAS = Object.freeze({
  assessment: SCHEMA([...COMMON, 'template_code', 'template_version', 'source', ...SOURCE_FIELDS], {
    source_fields: SOURCE_FIELDS,
  }),
  mpzis: SCHEMA([
    ...COMMON, 'template_code', 'template_version', 'source',
    'accepted_assessment_id', 'accepted_assessment_revision', 'accepted_assessment_hash',
    'form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf', 'fund_source',
    'recipient_name', 'recipient_type', 'beneficiary_count', 'total_amount', 'address_snapshot',
    'marital_status_snapshot', 'recipient_section_confirmed', 'fund_source_confirmed',
  ]),
  ppd: SCHEMA([
    ...COMMON, 'template_code', 'template_version', 'source',
    'approved_mpzis_id', 'approved_mpzis_revision', 'approved_mpzis_hash',
    'form_number', 'ppd_number', 'transaction_number', 'purpose', 'fund_source',
    'fund_source_confirmed', 'payment_type', 'payment_type_confirmed', 'payment_type_other',
    'bank_name', 'bank_account_ciphertext', 'bank_account_last4', 'bank_account_name',
    'requester_name_snapshot', 'requester_role_snapshot', 'requester_department_snapshot',
    'rab_lines', 'attachments',
  ]),
  payment: SCHEMA([
    ...COMMON, 'ppd_id', 'ppd_revision', 'ppd_hash', 'transaction_number', 'paid_amount',
    'paid_at', 'proof_file_id', 'proof_mime_type', 'proof_byte_size', 'proof_sha256',
  ]),
  recipient_confirmation: SCHEMA([
    ...COMMON, 'ppd_id', 'ppd_revision', 'ppd_hash', 'method', 'recipient_name_snapshot',
    'confirmed_at', 'note', 'evidence_file_id', 'evidence_mime_type', 'evidence_byte_size',
    'evidence_sha256',
  ]),
  completion: SCHEMA([
    ...COMMON, 'assessment', 'mpzis', 'ppd', 'payment', 'recipient_confirmation',
    'finance_event_ids', 'completion_correlation_id',
  ]),
});

const ADDRESS_FIELDS = ['address', 'rt_rw', 'kelurahan', 'kecamatan', 'kabupaten_kota', 'province'];
const RAB_FIELDS = ['line_no', 'register_number', 'description', 'amount'];
const ATTACHMENT_FIELDS = ['id', 'file_id', 'kind', 'mime_type', 'byte_size', 'sha256'];
const MONEY_KEYS = new Set([
  'monthly_rent_amount', 'husband_monthly_income', 'wife_monthly_income', 'child_monthly_support',
  'total_amount', 'amount', 'paid_amount',
]);
const DATE_KEYS = new Set(['mpzis_date', 'paid_at', 'confirmed_at']);
const INTEGER_KEYS = new Set([
  'schema_version', 'id', 'revision', 'mustahik_id', 'application_id', 'accepted_assessment_id',
  'accepted_assessment_revision', 'approved_mpzis_id', 'approved_mpzis_revision', 'ppd_id',
  'ppd_revision', 'proof_file_id', 'evidence_file_id', 'line_no', 'byte_size', 'proof_byte_size',
  'evidence_byte_size', 'file_id',
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype;
}

function normalizeString(value, key = '') {
  const normalized = value.normalize('NFC').trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(normalized) && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) {
    throw new P0Error('CANONICAL_LOCAL_TIME', 'Date-time must include an explicit timezone.');
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (dateOnly && !isValidCalendarDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))) {
    throw new P0Error('CANONICAL_DATE_INVALID', 'Date is invalid.');
  }
  const timestamp = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(normalized);
  if (timestamp) {
    const [, year, month, day, hour, minute, second, fraction = '', zone] = timestamp;
    if (!isValidCalendarDate(Number(year), Number(month), Number(day)) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
      throw new P0Error('CANONICAL_DATE_INVALID', 'Date-time is invalid.');
    }
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) throw new P0Error('CANONICAL_DATE_INVALID', 'Date-time is invalid.');
    return date.toISOString();
  }
  return normalized;
}

function isValidCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= maxDay;
}

function canonicalValue(value, key = '') {
  if (value === null) return null;
  if (value === undefined) throw new P0Error('CANONICAL_UNDEFINED', 'Undefined cannot be canonicalized.');
  if (typeof value === 'string') return normalizeString(value, key);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new P0Error('CANONICAL_NON_FINITE', 'Non-finite numbers cannot be canonicalized.');
    return value;
  }
  if (typeof value === 'bigint') throw new P0Error('CANONICAL_INTEGER_INVALID', 'BigInt must be declared as an integer number.');
  if (typeof value === 'function') throw new P0Error('CANONICAL_FUNCTION', 'Functions cannot be canonicalized.');
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new P0Error('CANONICAL_DATE_INVALID', 'Date is invalid.');
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (!isPlainObject(value)) throw new P0Error('CANONICAL_PROTOTYPE', 'Only plain objects can be canonicalized.');

  const entries = [];
  const seen = new Set();
  for (const rawKey of Reflect.ownKeys(value)) {
    if (typeof rawKey === 'symbol') throw new P0Error('CANONICAL_SYMBOL', 'Symbols cannot be canonicalized.');
    const keyName = rawKey.normalize('NFC');
    if (seen.has(keyName)) throw new P0Error('CANONICAL_DUPLICATE_KEY', 'Duplicate key after Unicode normalization.');
    seen.add(keyName);
    entries.push([keyName, canonicalValue(value[rawKey], keyName)]);
  }
  entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(entries);
}

export function canonicalize(value) {
  return JSON.stringify(canonicalValue(value));
}

function sanitizeNested(value, fields) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) throw new P0Error('CANONICAL_NESTED_INVALID', 'Nested snapshot values must be plain objects.');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') throw new P0Error('CANONICAL_SYMBOL', 'Symbols cannot be canonicalized.');
    if (!fields.includes(key)) throw new P0Error('CANONICAL_UNDECLARED', `Undeclared snapshot field: ${key}.`);
    if (value[key] === undefined) throw new P0Error('CANONICAL_UNDEFINED', 'Undefined cannot be canonicalized.');
  }
  const output = {};
  for (const field of fields) output[field] = Object.prototype.hasOwnProperty.call(value, field) ? value[field] : null;
  return output;
}

function normalizeField(value, field) {
  if (value === undefined) return null;
  if (INTEGER_KEYS.has(field) && value !== null) {
    if (!Number.isSafeInteger(value)) throw new P0Error('CANONICAL_INTEGER_INVALID', `Invalid integer in ${field}.`);
    return value;
  }
  if (MONEY_KEYS.has(field) && value !== null) {
    if (typeof value !== 'string') throw new P0Error('CANONICAL_MONEY_INVALID', `Money in ${field} must be a decimal string.`);
    const text = value.trim();
    if (!/^(?:0|[0-9]+)(?:\.[0-9]{1,2})?$/.test(text)) throw new P0Error('CANONICAL_MONEY_INVALID', `Invalid money in ${field}.`);
    const [whole, fraction = ''] = text.split('.');
    const cents = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
    if (cents > 999999999999999n) throw new P0Error('MONEY_RANGE', `Money exceeds NUMERIC(15,2) range.`);
    return `${BigInt(whole).toString()}.${(fraction + '00').slice(0, 2)}`;
  }
  if (DATE_KEYS.has(field) && value instanceof Date) return value.toISOString();
  if (field === 'address_snapshot') return sanitizeNested(value, ADDRESS_FIELDS);
  if (field === 'rab_lines') return Array.isArray(value) ? value.map((line) => {
    const normalized = sanitizeNested(line, RAB_FIELDS);
    if (normalized) for (const nestedField of RAB_FIELDS) normalized[nestedField] = normalizeField(normalized[nestedField], nestedField);
    return normalized;
  }) : null;
  if (field === 'attachments') return Array.isArray(value) ? value.map((file) => {
    const normalized = sanitizeNested(file, ATTACHMENT_FIELDS);
    if (normalized) for (const nestedField of ATTACHMENT_FIELDS) normalized[nestedField] = normalizeField(normalized[nestedField], nestedField);
    return normalized;
  }) : null;
  if (['assessment', 'mpzis', 'ppd', 'payment', 'recipient_confirmation'].includes(field)) {
    const normalized = sanitizeNested(value, ['id', 'revision', 'hash']);
    if (normalized) {
      normalized.id = normalizeField(normalized.id, 'id');
      normalized.revision = normalizeField(normalized.revision, 'revision');
    }
    return normalized;
  }
  if (field === 'finance_event_ids') {
    if (!Array.isArray(value)) throw new P0Error('CANONICAL_NESTED_INVALID', 'Finance event ids must be an array.');
    return value.map((id) => {
      if (!Number.isSafeInteger(id) || id < 1) throw new P0Error('CANONICAL_INTEGER_INVALID', 'Finance event ids must be positive numbers.');
      return id;
    });
  }
  return value;
}

/** Build the only persisted snapshot representation accepted by P0 services. */
export function createSnapshot(artifactType, input = {}) {
  const schema = SNAPSHOT_SCHEMAS[artifactType];
  if (!schema) throw new P0Error('CANONICAL_ARTIFACT_UNKNOWN', `Unknown artifact type: ${artifactType}.`);
  if (!isPlainObject(input)) throw new P0Error('CANONICAL_INPUT_INVALID', 'Snapshot input must be a plain object.');
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === 'symbol') throw new P0Error('CANONICAL_SYMBOL', 'Symbols cannot be canonicalized.');
    if (!schema.fields.includes(key)) throw new P0Error('CANONICAL_UNDECLARED', `Undeclared snapshot field: ${key}.`);
  }
  const json = {};
  for (const field of schema.fields) {
    if (Object.prototype.hasOwnProperty.call(input, field) && input[field] === undefined) throw new P0Error('CANONICAL_UNDEFINED', 'Undefined cannot be canonicalized.');
    json[field] = normalizeField(input[field], field);
  }
  const normalized = canonicalValue(json);
  const canonical = JSON.stringify(normalized);
  const hash = crypto.createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
  return Object.freeze({ json: normalized, canonical, bytes: Buffer.from(canonical, 'utf8'), hash });
}

export { SOURCE_FIELDS };
