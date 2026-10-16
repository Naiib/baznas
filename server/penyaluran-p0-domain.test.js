import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { P0Error } from './penyaluran-p0/errors.js';
import {
  canonicalize,
  createSnapshot,
  SNAPSHOT_SCHEMAS,
} from './penyaluran-p0/canonical-snapshot.js';
import {
  parseMoney,
  sumMoney,
  terbilangRupiah,
} from './penyaluran-p0/money.js';
import {
  decryptBankAccount,
  encryptBankAccount,
  maskBankAccount,
} from './penyaluran-p0/field-encryption.js';
import {
  validateAssessment,
  validateMpzis,
  validatePpd,
  validatePayment,
  validateRecipientConfirmation,
} from './penyaluran-p0/validation.js';
import {
  ACTIONS,
  capabilitiesFor,
  assertAllowed,
} from './penyaluran-p0/permissions.js';
import { ROLE } from './access-policy.js';

const NOW = new Date('2026-09-15T08:00:00.000Z');
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const TRUSTED_REQUESTER = Object.freeze({ name: 'Sari Surveyor', role: 'penyaluran', department: 'Penyaluran' });

function validAssessment(overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'assessment',
    id: 11,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    template_code: 'ASSESSMENT_LANGSUNG_MUSTAHIK',
    template_version: '2026-09-13',
    source: 'p0',
    husband_in_household: true,
    husband_name: ' Budi Santoso ',
    wife_in_household: false,
    wife_name: null,
    child_count: 1,
    house_ownership: 'Kontrak',
    home_address: 'Jl. Melati No. 1',
    address_matches_ktp: true,
    monthly_rent_amount: '1000000.00',
    husband_occupation: 'Pedagang',
    husband_monthly_income: '2500000.00',
    wife_occupation: null,
    wife_monthly_income: null,
    child_occupation: 'Pelajar',
    child_monthly_support: '500000.00',
    assistance_request: 'Modal usaha kecil',
    applied_to_baznas_before: false,
    previous_application_year: null,
    ...overrides,
  };
}

function validMpzis(overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'mpzis',
    id: 41,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    template_code: 'F-BPP/06',
    template_version: '2026-09-13',
    source: 'p0',
    accepted_assessment_id: 11,
    accepted_assessment_revision: 1,
    accepted_assessment_hash: 'a'.repeat(64),
    form_number: 'MPZIS-2026-0001',
    mpzis_date: '2026-09-15',
    program_classification: 'Bantuan Usaha',
    purpose: 'Modal usaha mustahik',
    asnaf: 'Miskin',
    fund_source: 'Zakat',
    recipient_name: 'Budi Santoso',
    recipient_type: 'Individu',
    beneficiary_count: 1,
    total_amount: '1500000.00',
    address_snapshot: {
      address: 'Jl. Melati No. 1',
      rt_rw: '001/002',
      kelurahan: 'Sukasari',
      kecamatan: 'Tangerang',
      kabupaten_kota: 'Kota Tangerang',
      province: 'Banten',
    },
    marital_status_snapshot: 'Menikah',
    recipient_section_confirmed: true,
    fund_source_confirmed: true,
    ...overrides,
  };
}

function validPpd(rabLines = [{ amount: '0.10' }, { amount: '0.20' }], overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'ppd',
    id: 51,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    template_code: 'F-PKP/03',
    template_version: '2026-09-13',
    source: 'p0',
    approved_mpzis_id: 41,
    approved_mpzis_revision: 1,
    approved_mpzis_hash: 'b'.repeat(64),
    form_number: 'MPZIS-2026-0001',
    ppd_number: 'PPD-2026-0001',
    transaction_number: 'TRX-2026-0001',
    purpose: 'Pembelian bahan usaha',
    fund_source: 'Zakat',
    fund_source_confirmed: true,
    payment_type: 'Pembayaran',
    payment_type_confirmed: true,
    bank_name: 'Bank Syariah Indonesia',
    bank_account_last4: '6789',
    bank_account_name: 'Budi Santoso',
    requester_name_snapshot: 'Sari Surveyor',
    requester_role_snapshot: 'penyaluran',
    requester_department_snapshot: 'Penyaluran',
    attachments: [{ file_id: 72, kind: 'supporting_document', mime_type: 'application/pdf', byte_size: 128, sha256: 'e'.repeat(64) }],
    rab_lines: rabLines.map((line, index) => ({
      line_no: index + 1,
      register_number: `REG-${index + 1}`,
      description: `Kebutuhan ${index + 1}`,
      amount: line.amount,
      ...line,
    })),
    ...overrides,
  };
}

function validPayment(overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'payment',
    id: 61,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    ppd_id: 51,
    ppd_revision: 1,
    ppd_hash: 'c'.repeat(64),
    transaction_number: 'TRX-2026-0001',
    paid_amount: '0.30',
    paid_at: '2026-09-15T07:59:00.000Z',
    proof_file_id: 71,
    proof_mime_type: 'application/pdf',
    proof_byte_size: 128,
    proof_sha256: 'd'.repeat(64),
    ...overrides,
  };
}

function validConfirmation(overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'recipient_confirmation',
    id: 81,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    ppd_id: 51,
    ppd_revision: 1,
    ppd_hash: 'c'.repeat(64),
    method: 'Tatap Muka',
    recipient_name_snapshot: 'Budi Santoso',
    confirmed_at: '2026-09-15T07:59:00.000Z',
    note: 'Bantuan telah diterima dengan baik oleh penerima.',
    ...overrides,
  };
}

function validCompletion(overrides = {}) {
  return {
    schema_version: 1,
    artifact_type: 'completion',
    id: 91,
    revision: 1,
    mustahik_id: 22,
    application_id: 33,
    assessment: { id: 11, revision: 1, hash: 'a'.repeat(64) },
    mpzis: { id: 41, revision: 1, hash: 'b'.repeat(64) },
    ppd: { id: 51, revision: 1, hash: 'c'.repeat(64) },
    payment: { id: 61, revision: 1, hash: 'd'.repeat(64) },
    recipient_confirmation: { id: 81, revision: 1, hash: 'e'.repeat(64) },
    finance_event_ids: [101, 102],
    completion_correlation_id: '00000000-0000-4000-8000-000000000091',
    ...overrides,
  };
}

test('P0Error carries stable code, status, and field errors', () => {
  const error = new P0Error('FIELD_INVALID', 'Invalid field', {
    status: 422,
    field_errors: { name: 'REQUIRED' },
  });
  assert.equal(error.name, 'P0Error');
  assert.equal(error.code, 'FIELD_INVALID');
  assert.equal(error.status, 422);
  assert.deepEqual(error.field_errors, { name: 'REQUIRED' });
});

test('canonical snapshot is stable across key order, Unicode composition, and money spelling', () => {
  const a = createSnapshot('assessment', validAssessment({ husband_name: 'A\u0301' }));
  const b = createSnapshot('assessment', validAssessment({
    husband_name: 'Á',
    monthly_rent_amount: '1000000.0',
  }));
  assert.equal(a.hash, b.hash);
  assert.equal(a.canonical, Buffer.from(a.canonical, 'utf8').toString('utf8'));
  assert.match(a.hash, /^[a-f0-9]{64}$/);
});

test('canonical snapshots use exact registry fields and reject actor/display/live state', () => {
  const fixtures = [
    ['assessment', validAssessment()], ['mpzis', validMpzis()], ['ppd', validPpd()],
    ['payment', validPayment()], ['recipient_confirmation', validConfirmation()], ['completion', validCompletion()],
  ];
  for (const [type, input] of fixtures) {
    const snapshot = createSnapshot(type, input);
    assert.deepEqual(Object.keys(snapshot.json).sort(), [...SNAPSHOT_SCHEMAS[type].fields].sort());
    for (const forbidden of ['actor_id', 'actor_name', 'created_at', 'display_label', 'live_master', 'receipt_bytes', 'plaintext_nik', 'bank_account']) {
      assert.throws(() => createSnapshot(type, { ...fixtures.find(([kind]) => kind === type)[1], [forbidden]: 'forbidden' }), /CANONICAL_UNDECLARED/);
    }
  }
});

test('canonicalize rejects undefined, non-finite values, functions, local dates, and unknown prototypes', () => {
  assert.throws(() => canonicalize({ value: undefined }), /UNDEFINED/);
  assert.throws(() => canonicalize({ value: NaN }), /NON_FINITE/);
  assert.throws(() => canonicalize({ value: () => null }), /FUNCTION/);
  assert.throws(() => canonicalize({ value: '2026-09-15 08:00:00' }), /LOCAL_TIME/);
  assert.throws(() => canonicalize(Object.assign(Object.create(null), { value: 1 })), /PROTOTYPE/);
  const left = {};
  left['e\u0301'] = 1;
  left.é = 2;
  assert.throws(() => canonicalize(left), /DUPLICATE_KEY/);
});

test('canonicalize sorts keys, keeps array order, emits booleans, and normalizes dates', () => {
  assert.equal(
    canonicalize({ z: true, a: ['b', 'a'], date: new Date('2026-09-15T08:00:00Z') }),
    '{"a":["b","a"],"date":"2026-09-15T08:00:00.000Z","z":true}',
  );
});

test('canonical snapshots normalize ids, nested money, UTC timestamps, and declared nulls', () => {
  const snapshot = createSnapshot('payment', validPayment({ paid_amount: '1.2', paid_at: '2026-09-15T09:00:00+01:00' }));
  assert.equal(snapshot.json.id, 61);
  assert.equal(snapshot.json.paid_amount, '1.20');
  assert.equal(snapshot.json.paid_at, '2026-09-15T08:00:00.000Z');
  assert.equal(snapshot.json.application_id, 33);
  assert.equal(snapshot.json.ppd_hash, 'c'.repeat(64));
});

test('money uses integer cents and rejects malformed or fractional-cent input', () => {
  assert.equal(parseMoney('1234.50'), 123450n);
  assert.equal(parseMoney('0.1'), 10n);
  assert.equal(sumMoney(['0.10', '0.20', '1000']), '1000.30');
  assert.throws(() => parseMoney('1.001'), /MONEY_SCALE/);
  assert.throws(() => parseMoney('-1.00'), /MONEY_NON_NEGATIVE/);
  assert.throws(() => parseMoney('Rp 1.00'), /MONEY_FORMAT/);
  assert.equal(terbilangRupiah('0.00'), 'Nol Rupiah');
  assert.equal(terbilangRupiah('1500000.00'), 'Satu Juta Lima Ratus Ribu Rupiah');
  assert.equal(terbilangRupiah('1001.00'), 'Seribu Satu Rupiah');
});

test('assessment has exactly 18 source fields and rejects every score-like property', () => {
  const fields = [
    'husband_in_household', 'husband_name', 'wife_in_household', 'wife_name', 'child_count',
    'house_ownership', 'home_address', 'address_matches_ktp', 'monthly_rent_amount',
    'husband_occupation', 'husband_monthly_income', 'wife_occupation', 'wife_monthly_income',
    'child_occupation', 'child_monthly_support', 'assistance_request', 'applied_to_baznas_before',
    'previous_application_year',
  ];
  assert.deepEqual(SNAPSHOT_SCHEMAS.assessment.source_fields, fields);
  for (const key of ['overall_score', 'house_index', 'asset_index', 'income_index', 'spiritual_score', 'priority']) {
    const result = validateAssessment({ ...validAssessment(), [key]: 80 }, { mode: 'submit', now: NOW });
    assert.equal(result.field_errors[key], 'FIELD_FORBIDDEN');
  }
});

test('assessment validation enforces all conditional household, housing, child, history, and explicit fields', () => {
  const cases = [
    [{ husband_in_household: null }, 'husband_in_household', 'REQUIRED'],
    [{ husband_in_household: false, husband_name: 'Budi' }, 'husband_name', 'MUST_BE_NULL'],
    [{ wife_in_household: true, wife_name: null }, 'wife_name', 'REQUIRED'],
    [{ child_count: -1 }, 'child_count', 'RANGE'],
    [{ child_count: 0, child_occupation: 'Tidak bekerja' }, 'child_occupation', 'MUST_BE_NULL'],
    [{ child_count: 1, child_occupation: null }, 'child_occupation', 'REQUIRED'],
    [{ house_ownership: 'Kontrak', monthly_rent_amount: '0.00' }, 'monthly_rent_amount', 'POSITIVE_REQUIRED'],
    [{ house_ownership: 'Milik Sendiri', monthly_rent_amount: '10.00' }, 'monthly_rent_amount', 'MUST_BE_NULL'],
    [{ applied_to_baznas_before: true, previous_application_year: null }, 'previous_application_year', 'REQUIRED'],
    [{ applied_to_baznas_before: false, previous_application_year: 2020 }, 'previous_application_year', 'MUST_BE_NULL'],
    [{ applied_to_baznas_before: true, previous_application_year: 1999 }, 'previous_application_year', 'RANGE'],
    [{ applied_to_baznas_before: true, previous_application_year: 2027 }, 'previous_application_year', 'RANGE'],
  ];
  for (const [override, field, code] of cases) {
    const result = validateAssessment({ ...validAssessment(), ...override }, { mode: 'submit', now: NOW });
    assert.equal(result.field_errors[field], code, `${field} should be ${code}`);
  }
  assert.equal(validateAssessment(validAssessment(), { mode: 'submit', now: NOW }).valid, true);
});

test('MPZIS validation requires accepted assessment hash, exact enums, complete address, recipient confirmation, and amount', () => {
  assert.equal(validateMpzis(validMpzis(), { mode: 'submit', now: NOW }).valid, true);
  const invalid = [
    [{ source: 'legacy' }, 'source', 'ENUM'],
    [{ fund_source: 'Zakat Maal' }, 'fund_source', 'ENUM'],
    [{ recipient_type: 'Perorangan' }, 'recipient_type', 'ENUM'],
    [{ accepted_assessment_hash: null }, 'accepted_assessment_hash', 'REQUIRED'],
    [{ address_snapshot: { ...validMpzis().address_snapshot, province: null } }, 'address_snapshot.province', 'REQUIRED'],
    [{ recipient_section_confirmed: false }, 'recipient_section_confirmed', 'CONFIRM_REQUIRED'],
    [{ total_amount: '0.00' }, 'total_amount', 'POSITIVE_REQUIRED'],
  ];
  for (const [override, field, code] of invalid) {
    const result = validateMpzis({ ...validMpzis(), ...override }, { mode: 'submit', now: NOW });
    assert.equal(result.field_errors[field], code, `${field} should be ${code}`);
  }
});

test('PPD accepts one to three RAB rows and calculates exact cents', () => {
  assert.equal(validatePpd(validPpd([{ amount: '0.10' }, { amount: '0.20' }]), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).total, '0.30');
  assert.equal(validatePpd(validPpd([{ amount: '0.10' }]), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).valid, true);
  assert.equal(validatePpd(validPpd([{ amount: '0.10' }, { amount: '0.20' }, { amount: '0.30' }]), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).valid, true);
  for (const count of [0, 4]) {
    const result = validatePpd(validPpd(Array.from({ length: count }, () => ({ amount: '0.10' }))), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER });
    assert.equal(result.field_errors.rab_lines, 'COUNT');
  }
});

test('PPD rejects browser-calculated, actor, requester, invalid enum, confirmation, bank, and ceiling claims', () => {
  for (const key of ['amount', 'total', 'amount_in_words', 'terbilang', 'actor_id', 'actor_name', 'requester_name', 'requester_role']) {
    const result = validatePpd(validPpd(undefined, { [key]: key === 'amount' ? '999.00' : 'claimed' }), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER });
    assert.equal(result.field_errors[key], 'FIELD_FORBIDDEN', key);
  }
  assert.equal(validatePpd(validPpd([{ amount: '0.60' }, { amount: '0.60' }]), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.total, 'CEILING');
  assert.equal(validatePpd(validPpd(undefined, { fund_source: 'Zakat', fund_source_confirmed: false }), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.fund_source_confirmed, 'CONFIRM_REQUIRED');
  assert.equal(validatePpd(validPpd(undefined, { payment_type: 'Lain-lain', payment_type_other: 'x' }), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.payment_type_other, 'LENGTH');
  assert.equal(validatePpd(validPpd(undefined, { payment_type: 'Pembayaran', payment_type_other: 'lainnya' }), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.payment_type_other, 'MUST_BE_NULL');
  assert.equal(validatePpd(validPpd(undefined, { bank_name: '', bank_account_last4: '12', bank_account_name: '' }), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.bank_name, 'REQUIRED');
});

test('payment and recipient confirmation enforce exact amounts, proof, methods, notes, and server-bounded timestamps', () => {
  assert.equal(validatePayment(validPayment(), { ppdAmount: '0.30', now: NOW }).valid, true);
  for (const [override, field, code] of [
    [{ paid_amount: '0.31' }, 'paid_amount', 'EXACT_AMOUNT'],
    [{ proof_mime_type: 'text/plain' }, 'proof_mime_type', 'MIME'],
    [{ proof_sha256: 'bad' }, 'proof_sha256', 'HASH'],
    [{ paid_at: '2026-09-15T08:06:00.000Z' }, 'paid_at', 'TIME_BOUNDS'],
  ]) {
    const result = validatePayment({ ...validPayment(), ...override }, { ppdAmount: '0.30', now: NOW });
    assert.equal(result.field_errors[field], code);
  }
  assert.equal(validateRecipientConfirmation(validConfirmation(), { paid: true, paymentVerified: true, now: NOW }).valid, true);
  for (const [override, field, code] of [
    [{ method: 'SMS' }, 'method', 'ENUM'],
    [{ note: 'short' }, 'note', 'LENGTH'],
    [{ confirmed_at: '2026-09-15T08:06:00.000Z' }, 'confirmed_at', 'TIME_BOUNDS'],
  ]) {
    const result = validateRecipientConfirmation({ ...validConfirmation(), ...override }, { paid: true, paymentVerified: true, now: NOW });
    assert.equal(result.field_errors[field], code);
  }
  assert.equal(validateRecipientConfirmation(validConfirmation(), { paid: false, paymentVerified: false, now: NOW }).field_errors.paid, 'PAYMENT_REQUIRED');
  assert.equal(validateRecipientConfirmation(validConfirmation(), { now: NOW }).field_errors.paid, 'PAYMENT_REQUIRED');
  assert.equal(validatePpd(validPpd([{ amount: 'not-money' }]), { mpzisCeiling: '1.00', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors['rab_lines.0.amount'], 'MONEY_FORMAT');
});

test('AES-256-GCM account protection round trips, masks only last four, and fails closed', () => {
  const encrypted = encryptBankAccount('0011223344556789', { key: TEST_KEY });
  assert.match(encrypted, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.equal(decryptBankAccount(encrypted, { key: TEST_KEY }), '0011223344556789');
  assert.equal(maskBankAccount('0011223344556789'), '************6789');
  assert.equal(maskBankAccount(encrypted), '************');
  assert.throws(() => decryptBankAccount(encrypted, { key: Buffer.alloc(32, 8).toString('base64') }), /FIELD_ENCRYPTION_FAILED/);
  assert.throws(() => encryptBankAccount('0011223344556789', { key: 'bad' }), /FIELD_ENCRYPTION_UNAVAILABLE/);
  assert.throws(() => encryptBankAccount('0011223344556789', { production: true }), /FIELD_ENCRYPTION_UNAVAILABLE/);
});

test('permissions expose explicit role capabilities and enforce segregation', () => {
  const staff = { id: 1, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' };
  const leader = { id: 2, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'leader' };
  const finance = { id: 3, role: ROLE.KEUANGAN, division: 'Keuangan', level: 'staff' };
  const financeLeader = { id: 4, role: ROLE.KEUANGAN, division: 'Keuangan', level: 'leader' };
  const admin = { id: 5, role: ROLE.ADMIN, division: 'Admin', level: 'admin' };
  const staffCapabilities = capabilitiesFor(staff);
  assert.equal(typeof staffCapabilities.assessment_create, 'boolean');
  assert.equal(typeof staffCapabilities.ppd_submit, 'boolean');
  assert.equal(typeof staffCapabilities.complete, 'boolean');
  assert.equal(capabilitiesFor(finance).finance_check, true);
  assert.equal(capabilitiesFor(financeLeader).finance_approve, true);
  assert.equal(capabilitiesFor(admin).mpzis_approve, false);
  assert.equal(assertAllowed(ACTIONS.ASSESSMENT_CREATE, staff, {}), true);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, admin, {}), /ADMIN_ROUTINE_FORBIDDEN/);
  assert.throws(() => assertAllowed(ACTIONS.ASSESSMENT_REVIEW, leader, { submitter_id: leader.id }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { creator_id: leader.id, step: 'proposed' }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.FINANCE_APPROVE, financeLeader, { creator_id: 99, checker_id: financeLeader.id }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.PAYMENT_VERIFY, financeLeader, { recorder_id: financeLeader.id }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.COMPLETE, staff, {}), /LEVEL_REQUIRED/);
  assertAllowed(ACTIONS.COMPLETE, leader, {});
});

test('all state-changing actions require a valid authenticated actor id', () => {
  for (const action of Object.values(ACTIONS)) {
    assert.throws(() => assertAllowed(action, { role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' }, { step: 'proposed' }), /ACTOR_REQUIRED/);
  }
  assert.throws(() => assertAllowed(ACTIONS.ASSESSMENT_CREATE, { id: 0, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' }), /ACTOR_REQUIRED/);
  assert.throws(() => assertAllowed(ACTIONS.ASSESSMENT_CREATE, { id: '   ', role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' }), /ACTOR_REQUIRED/);
  assertAllowed(ACTIONS.ASSESSMENT_CREATE, { id: 99, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' });
});

test('validators reject unknown or forged metadata and confirmation needs verified payment', () => {
  assert.equal(validateAssessment({ ...validAssessment(), forged: true }, { mode: 'submit', now: NOW }).field_errors.forged, 'FIELD_UNDECLARED');
  assert.equal(validateMpzis({ ...validMpzis(), template_code: 'OTHER' }, { mode: 'submit', now: NOW }).field_errors.template_code, 'TEMPLATE_CODE');
  assert.equal(validateMpzis({ ...validMpzis(), template_version: '2026-01-01' }, { mode: 'submit', now: NOW }).field_errors.template_version, 'TEMPLATE_VERSION');
  assert.equal(validatePpd({ ...validPpd(), approved_mpzis_id: 0 }, { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.approved_mpzis_id, 'INTEGER');
  assert.equal(validatePpd({ ...validPpd(), approved_mpzis_hash: 'bad' }, { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.approved_mpzis_hash, 'HASH');
  assert.equal(validatePpd({ ...validPpd(), rab_lines: [{ ...validPpd().rab_lines[0], line_no: 2 }] }, { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors['rab_lines.0.line_no'], 'ORDER');
  assert.equal(validateRecipientConfirmation({ ...validConfirmation(), forged: true }, { paid: true, paymentVerified: true, now: NOW }).field_errors.forged, 'FIELD_UNDECLARED');
  assert.equal(validateRecipientConfirmation(validConfirmation(), { paid: true, paymentVerified: false, now: NOW }).field_errors.paid, 'PAYMENT_REQUIRED');
  assert.equal(validateRecipientConfirmation(validConfirmation(), { paid: true, now: NOW }).field_errors.paid, 'PAYMENT_REQUIRED');
});

test('canonical schema is recursively strict and snapshot golden bytes are independent', () => {
  const payment = validPayment({ paid_amount: '0000.30', paid_at: '2026-09-15 08:00:00.000+00:00' });
  const snapshot = createSnapshot('payment', payment);
  assert.equal(snapshot.canonical, '{"application_id":33,"artifact_type":"payment","id":61,"mustahik_id":22,"paid_amount":"0.30","paid_at":"2026-09-15T08:00:00.000Z","ppd_hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","ppd_id":51,"ppd_revision":1,"proof_byte_size":128,"proof_file_id":71,"proof_mime_type":"application/pdf","proof_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","revision":1,"schema_version":1,"transaction_number":"TRX-2026-0001"}');
  assert.equal(snapshot.hash, 'd6bc9e715885dfdaee19312d005474c8bb2e9e5fa400533408ee364f4c68c8e3');
  assert.throws(() => createSnapshot('completion', { ...validCompletion(), assessment: { ...validCompletion().assessment, actor_id: 1 } }), /CANONICAL_UNDECLARED/);
  assert.throws(() => createSnapshot('payment', { ...payment, ['actor_name']: 'bad' }), /CANONICAL_UNDECLARED/);
  assert.throws(() => createSnapshot('payment', { ...payment, [Symbol('actor')]: 'bad' }), /CANONICAL_SYMBOL/);
  assert.throws(() => canonicalize({ value: new Date('invalid') }), /CANONICAL_DATE_INVALID/);
  assert.throws(() => canonicalize({ value: '2026-02-31T08:00:00.000Z' }), /CANONICAL_DATE_INVALID/);
  assert.equal(canonicalize({ z: '  Á  ', a: 'x' }), '{"a":"x","z":"Á"}');
});

test('money bounds leading zeros and aggregate NUMERIC(15,2) overflow exactly', () => {
  assert.equal(parseMoney('000001.20'), 120n);
  assert.throws(() => parseMoney('10000000000000.00'), /MONEY_RANGE/);
  assert.throws(() => sumMoney(['9999999999999.99', '0.01']), /MONEY_RANGE/);
  assert.equal(validatePpd(validPpd([{ amount: '10000000000000.00' }]), { mpzisCeiling: '9999999999999.99', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors['rab_lines.0.amount'], 'MONEY_RANGE');
});

test('encryption rejects non-canonical base64 keys and malformed authenticated payloads', () => {
  assert.throws(() => encryptBankAccount('12345678', { key: `${TEST_KEY}====` }), /FIELD_ENCRYPTION_UNAVAILABLE/);
  const encrypted = encryptBankAccount('12345678', { key: TEST_KEY });
  const [version, iv, tag, ciphertext] = encrypted.split(':');
  const tamperedTag = `${tag[0] === 'A' ? 'B' : 'A'}${tag.slice(1)}`;
  assert.throws(() => decryptBankAccount(`${version}:${iv}:${tamperedTag}:${ciphertext}`, { key: TEST_KEY }), /FIELD_ENCRYPTION_FAILED/);
  assert.throws(() => decryptBankAccount(`${version}:${iv}:bad:${ciphertext}`, { key: TEST_KEY }), /FIELD_ENCRYPTION_FAILED/);
});

test('fix round 2 requires common identity, provenance, trusted requester, and source on submitted artifacts', () => {
  for (const [name, make, fields] of [
    ['assessment', validAssessment, ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id']],
    ['mpzis', validMpzis, ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id', 'source']],
    ['ppd', validPpd, ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id', 'source']],
    ['payment', validPayment, ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id', 'ppd_id', 'ppd_revision', 'ppd_hash']],
    ['recipient_confirmation', validConfirmation, ['schema_version', 'artifact_type', 'id', 'revision', 'mustahik_id', 'application_id', 'ppd_id', 'ppd_revision', 'ppd_hash']],
  ]) {
    for (const field of fields) {
      const input = make();
      delete input[field];
      const result = name === 'assessment'
        ? validateAssessment(input, { mode: 'submit', now: NOW })
        : name === 'mpzis'
          ? validateMpzis(input, { mode: 'submit', now: NOW })
          : name === 'ppd'
            ? validatePpd(input, { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER })
            : name === 'payment'
              ? validatePayment(input, { mode: 'submit', now: NOW })
              : validateRecipientConfirmation(input, { mode: 'submit', now: NOW, paymentVerified: true });
      assert.equal(result.field_errors[field], 'REQUIRED', `${name}.${field}`);
    }
  }
  assert.equal(validateMpzis({ ...validMpzis(), source: undefined }, { mode: 'submit', now: NOW }).field_errors.source, 'REQUIRED');
  assert.equal(validatePpd({ ...validPpd(), source: undefined }, { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.source, 'REQUIRED');
  assert.equal(validatePpd(validPpd(), { mode: 'submit', now: NOW }).field_errors.requester_name_snapshot, 'REQUESTER_CONTEXT_REQUIRED');
  assert.equal(validatePpd(validPpd(), { mode: 'submit', now: NOW, trustedRequesterSnapshot: { ...TRUSTED_REQUESTER, name: 'Other' } }).field_errors.requester_name_snapshot, 'REQUESTER_MISMATCH');
});

test('fix round 2 rejects client-calculated PPD fields and validates complete attachments', () => {
  assert.equal(validatePpd(validPpd(undefined, { amount: '0.30' }), { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.amount, 'FIELD_FORBIDDEN');
  assert.equal(validatePpd(validPpd(undefined, { amount_in_words: 'Tiga Puluh Sen' }), { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.amount_in_words, 'FIELD_FORBIDDEN');
  assert.equal(validatePpd(validPpd(undefined, { attachments: [{ file_id: 72 }] }), { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors['attachments.0.mime_type'], 'REQUIRED');
  assert.equal(validatePpd(validPpd(undefined, { attachments: [{ file_id: 72, kind: 'supporting_document', mime_type: 'text/plain', byte_size: 128, sha256: 'e'.repeat(64) }] }), { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors['attachments.0.mime_type'], 'MIME');
  assert.throws(() => createSnapshot('ppd', validPpd(undefined, { amount: '0.30' })), /CANONICAL_UNDECLARED/);
});

test('fix round 2 requires positive payment amount independently of PPD context', () => {
  assert.equal(validatePayment(validPayment({ paid_amount: '0.00' }), { mode: 'submit', now: NOW }).field_errors.paid_amount, 'POSITIVE_REQUIRED');
  assert.equal(validatePayment(validPayment({ paid_amount: 'bad' }), { mode: 'submit', now: NOW }).field_errors.paid_amount, 'MONEY_FORMAT');
});

test('fix round 2 makes MPZIS approval and admin recovery fail closed', () => {
  const leader = { id: 2, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'leader' };
  const admin = { id: 5, role: ROLE.ADMIN, division: 'Admin', level: 'admin' };
  assert.equal(capabilitiesFor(admin).cross_case_audit, true);
  assert.equal(capabilitiesFor(admin).admin_recovery, true);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { step: 'approved', creator_id: 10, submitter_id: 11 }), /ACTOR_CONTEXT_REQUIRED/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { step: 'approved', creator_id: 10, submitter_id: 11, used_actor_ids: [0] }), /ACTOR_CONTEXT_INVALID/);
  assert.throws(() => assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { override_reason: 'Recovery with exact target and segregation', expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64) }), /RECOVERY_TARGET_REQUIRED/);
  assert.throws(() => assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { artifact_type: 'ppd', artifact_id: 51, step: 'payment_recorded', override_reason: 'Recovery with exact target and segregation', expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64), creator_id: 5, submitter_id: 11, prior_actor_ids: [] }), /ACTOR_SEPARATION/);
  assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { artifact_type: 'ppd', artifact_id: 51, step: 'payment_recorded', override_reason: 'Recovery with exact target and segregation', expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64), creator_id: 10, submitter_id: 11, prior_actor_ids: [12, 13] });
});

test('fix round 3 canonicalizes MPZIS actor context and rejects ambiguity, duplicates, and overlaps', () => {
  const leader = { id: 2, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'leader' };
  const base = { step: 'approved', creator_id: 10, submitter_id: 11, used_actor_ids: [12, 13, 14] };
  assertAllowed(ACTIONS.MPZIS_APPROVE, leader, base);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, used_actor_ids: [12, 12] }), /ACTOR_CONTEXT_INVALID/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, used_actor_ids: [' 12'] }), /ACTOR_CONTEXT_INVALID/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, used_actor_ids: ['12'] }), /ACTOR_CONTEXT_INVALID/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, used_actor_ids: [12, 10] }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, used_actor_ids: [12, 2] }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.ASSESSMENT_CREATE, { id: ' 15', role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'staff' }), /ACTOR_REQUIRED/);
});

test('fix round 3 enforces artifact-specific admin recovery steps and canonical ids', () => {
  const admin = { id: 5, role: ROLE.ADMIN, division: 'Admin', level: 'admin' };
  const base = { override_reason: 'Recovery with exact target and segregation', expected_revision: 1, expected_snapshot_hash: 'a'.repeat(64), creator_id: 10, submitter_id: 11, prior_actor_ids: [12, 13] };
  assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { ...base, artifact_type: 'assessment', artifact_id: 1, step: 'review' });
  assert.throws(() => assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { ...base, artifact_type: 'assessment', artifact_id: 1, step: 'payment_verified' }), /RECOVERY_TARGET_REQUIRED/);
  assert.throws(() => assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { ...base, artifact_type: 'payment', artifact_id: '01', step: 'payment_verified' }), /RECOVERY_TARGET_REQUIRED/);
  assert.throws(() => assertAllowed(ACTIONS.ADMIN_RECOVERY, admin, { ...base, artifact_type: 'ppd', artifact_id: 0, step: 'payment_recorded' }), /RECOVERY_TARGET_REQUIRED/);
});

test('fix round 4 canonicalizes every MPZIS actor id and enforces pairwise segregation', () => {
  const leader = { id: 2, role: ROLE.PENYALURAN, division: 'Penyaluran', level: 'leader' };
  const base = { step: 'approved', creator_id: 10, submitter_id: 11, used_actor_ids: [12, 13, 14] };
  assertAllowed(ACTIONS.MPZIS_APPROVE, leader, base);

  // Creator and submitter must be distinct, just like prior MPZIS actors.
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, submitter_id: base.creator_id }), /ACTOR_SEPARATION/);

  // Creator/submitter IDs are validated with the same fail-closed canonical rules.
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, creator_id: ' 12 ' }), /ACTOR_CONTEXT_INVALID/);

  // Pairwise comparisons use canonical IDs, including creator/submitter versus prior actors and current actor.
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, leader, { ...base, creator_id: 12 }), /ACTOR_SEPARATION/);
  assert.throws(() => assertAllowed(ACTIONS.MPZIS_APPROVE, { ...leader, id: 12 }, base), /ACTOR_SEPARATION/);
});

test('fix round 3 requires all optional recipient evidence metadata together', () => {
  assert.equal(validateRecipientConfirmation({ ...validConfirmation(), evidence_file_id: 72 }, { paymentVerified: true, now: NOW }).field_errors.evidence_mime_type, 'REQUIRED');
  assert.equal(validateRecipientConfirmation({ ...validConfirmation(), evidence_file_id: 72, evidence_mime_type: 'application/pdf', evidence_byte_size: 128, evidence_sha256: 'e'.repeat(64) }, { paymentVerified: true, now: NOW }).valid, true);
});

test('fix round 3 permits an empty PPD draft attachment list but not an empty submission', () => {
  assert.equal(validatePpd(validPpd(undefined, { attachments: [] }), { mode: 'draft', now: NOW }).field_errors.attachments, undefined);
  assert.equal(validatePpd(validPpd(undefined, { attachments: [] }), { mode: 'submit', now: NOW, trustedRequesterSnapshot: TRUSTED_REQUESTER }).field_errors.attachments, 'COUNT');
});

test('official BAZNAS division nomenclature (Bidang Pendistribusian & Pendayagunaan) is recognized for penyaluran', () => {
  const leaderOfficial = { id: 2, role: ROLE.PENYALURAN, division: 'Bidang Pendistribusian & Pendayagunaan', level: 'leader' };
  const staffOfficial = { id: 1, role: ROLE.PENYALURAN, division: 'Bidang Pendistribusian & Pendayagunaan', level: 'staff' };

  assert.equal(assertAllowed(ACTIONS.CASE_READ, leaderOfficial), true);
  assert.equal(assertAllowed(ACTIONS.CASE_READ, staffOfficial), true);

  const leaderCaps = capabilitiesFor(leaderOfficial);
  assert.equal(leaderCaps[ACTIONS.MPZIS_APPROVE], true);
  assert.equal(leaderCaps[ACTIONS.COMPLETE], true);
  assert.equal(leaderCaps[ACTIONS.CASE_READ], true);

  const staffCaps = capabilitiesFor(staffOfficial);
  assert.equal(staffCaps[ACTIONS.ASSESSMENT_CREATE], true);
  assert.equal(staffCaps[ACTIONS.ASSESSMENT_REVIEW], true);
  assert.equal(staffCaps[ACTIONS.PPD_SUBMIT], true);
  assert.equal(staffCaps[ACTIONS.CASE_READ], true);
});
