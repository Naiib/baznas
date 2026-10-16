import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderDistributionReceipt, buildReceiptPayload } from './penyaluran-p0/receipt-renderer.js';
import { loadReceiptBundle, processReceiptJob, resumePendingReceiptJobs } from './penyaluran-p0/receipt-jobs.js';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { P0Error } from './penyaluran-p0/errors.js';

function extractPdfText(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  const output = [];
  for (const stream of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body = Buffer.from(stream[1], 'latin1');
    try { body = zlib.inflateSync(body); } catch { /* uncompressed stream */ }
    const decoded = body.toString('latin1');
    for (const match of decoded.matchAll(/(\[[\s\S]*?\])\s*TJ|\(([^)]*)\)\s*Tj/g)) {
      if (match[2] !== undefined) {
        output.push(match[2].replace(/\\([()\\])/g, '$1'));
        continue;
      }
      output.push([...match[1].matchAll(/<([0-9a-f]+)>/gi)]
        .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
        .join(''));
    }
  }
  return output.join(' ');
}

function completeBundle() {
  const hash = 'a'.repeat(64);
  const actor = (id, name, role) => ({ actor_id: id, actor_name: name, actor_role: role, actor_level: 'staff', actor_division: 'Penyaluran', created_at: '2026-09-13T01:00:00.000Z', snapshot_hash: hash });
  return {
    receipt_id: 'RCP-PPD-44-1', created_at: '2026-09-13T02:00:00.000Z', case_number: 'FILE-44', mustahik_id: 44,
    recipient: { name: 'Siti Penerima', nik_mask: '3671********1234', nik_source: '3671012345670002', address: 'Jalan Mawar', rt_rw: '01/02', kelurahan: 'Sukajadi', kecamatan: 'Cibodas', kabupaten_kota: 'Tangerang', province: 'Banten' },
    assessment: { id: 7, revision: 2, status: 'accepted', snapshot_hash: hash, source_fields: { husband_in_household: true, husband_name: 'Budi', wife_in_household: true, wife_name: 'Siti', child_count: 2, house_ownership: 'Kontrak', home_address: 'Jalan Mawar', address_matches_ktp: true, monthly_rent_amount: '500000.00', husband_occupation: 'Buruh', husband_monthly_income: '1000000.00', wife_occupation: 'Ibu Rumah Tangga', wife_monthly_income: '0.00', child_occupation: 'Pelajar', child_monthly_support: '0.00', assistance_request: 'Modal usaha', applied_to_baznas_before: false, previous_application_year: null } },
    mpzis: { id: 9, revision: 1, form_number: 'F-BPP/06-009', classification: 'Usaha', purpose: 'Modal', asnaf: 'Fakir Miskin', fund_source: 'Zakat', recipient_name: 'Siti Penerima', recipient_type: 'Individual', beneficiary_count: 1, amount: '2500000.00', snapshot_hash: hash, approvals: ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'].map((step, i) => ({ ...actor(20 + i, `Actor ${step}`, step), approval_step: step })) },
    ppd: { id: 44, revision: 1, form_number: 'F-PKP/03-044', ppd_number: 'PPD-044', transaction_number: 'TRX-044', requester_name: 'Requester', requester_role: 'Staff', requester_department: 'Penyaluran', fund_source: 'Zakat', payment_type: 'Transfer', bank_name: 'Bank BAZNAS', bank_account_last4: '6789', bank_account_name: 'Siti Penerima', bank_account_source: '001122334455', rab_lines: [{ line_no: 1, register_number: 'RAB-1', description: 'Modal', amount: '2500000.00' }], amount: '2500000.00', amount_in_words: 'Dua juta lima ratus ribu rupiah', snapshot_hash: hash },
    finance: { check: actor(31, 'Finance Checker', 'Finance'), approve: actor(32, 'Finance Approver', 'Finance') },
    payment: { transaction_number: 'TRX-044', amount: '2500000.00', paid_at: '2026-09-13T03:00:00.000Z', proof_file_id: 81, proof_file_revision: 1, proof_sha256: 'b'.repeat(64) },
    confirmation: { method: 'Tatap Muka', confirmed_at: '2026-09-13T04:00:00.000Z', snapshot_hash: 'e'.repeat(64), actor: actor(41, 'Confirm Actor', 'Penyaluran'), evidence_file_id: 82, evidence_file_revision: 1, evidence_sha256: 'c'.repeat(64) },
    completion: { actor: actor(40, 'Completion Actor', 'Penyaluran'), completed_at: '2026-09-13T05:00:00.000Z', correlation_id: 'corr-44', snapshot_hash: hash, completion_hash: 'd'.repeat(64) },
  };
}

function receiptLoaderDb({ omitConfirmationEvent = false, completionPatch = {} } = {}) {
  const bundle = completeBundle();
  const hash = 'a'.repeat(64);
  const address = {
    address: bundle.recipient.address, rt_rw: bundle.recipient.rt_rw, kelurahan: bundle.recipient.kelurahan,
    kecamatan: bundle.recipient.kecamatan, kabupaten_kota: bundle.recipient.kabupaten_kota, province: bundle.recipient.province,
  };
  const ppd = {
    id: 44, mustahik_id: 44, revision: 1, status: 'completed', source: 'p0', mpzis_id: 9,
    receipt_id: bundle.receipt_id, bank_account_last4: '6789', bank_account_name: 'Siti Penerima', amount: bundle.ppd.amount, amount_in_words: bundle.ppd.amount_in_words,
    snapshot_hash: hash,
    snapshot_json: JSON.stringify({
      approved_mpzis_id: 9, approved_mpzis_revision: 1, form_number: bundle.ppd.form_number, ppd_number: bundle.ppd.ppd_number,
      transaction_number: bundle.ppd.transaction_number, requester_name_snapshot: bundle.ppd.requester_name,
      requester_role_snapshot: bundle.ppd.requester_role, requester_department_snapshot: bundle.ppd.requester_department,
      fund_source: bundle.ppd.fund_source, payment_type: bundle.ppd.payment_type, bank_name: bundle.ppd.bank_name,
      bank_account_name: bundle.ppd.bank_account_name,
    }),
  };
  const mpzis = {
    id: 9, mustahik_id: 44, revision: 1, source: 'p0', created_by_id: 10, submitted_by_id: 11, snapshot_hash: hash,
    snapshot_json: JSON.stringify({
      accepted_assessment_id: 7, accepted_assessment_revision: 2, form_number: bundle.mpzis.form_number,
      program_classification: bundle.mpzis.classification, purpose: bundle.mpzis.purpose, asnaf: bundle.mpzis.asnaf,
      fund_source: bundle.mpzis.fund_source, recipient_name: bundle.mpzis.recipient_name, recipient_type: bundle.mpzis.recipient_type,
      beneficiary_count: bundle.mpzis.beneficiary_count, total_amount: bundle.mpzis.amount, address_snapshot: address,
    }),
  };
  const assessment = { id: 7, mustahik_id: 44, revision: 2, source: 'p0', status: 'accepted', snapshot_hash: hash, snapshot_json: JSON.stringify(bundle.assessment.source_fields) };
  const actorRow = (actor, id, action, approvalStep, createdAt = actor.created_at) => ({
    id, artifact_type: 'ppd', artifact_id: 44, artifact_revision: 1, action, approval_step: approvalStep,
    actor_id: actor.actor_id, actor_name: actor.actor_name, actor_role: actor.actor_role, actor_level: actor.actor_level,
    actor_division: actor.actor_division, created_at: createdAt instanceof Date ? createdAt : new Date(createdAt), snapshot_hash: hash,
  });
  const mpzisApprovals = bundle.mpzis.approvals.map((row, index) => ({
    ...row, id: index + 1, artifact_type: 'mpzis', artifact_id: 9, artifact_revision: 1, action: 'approve', created_at: new Date(`2026-09-13T0${index + 1}:00:00.000Z`),
  }));
  const financeCheck = actorRow(bundle.finance.check, 20, 'finance_check', 'finance_check', new Date('2026-09-13T02:00:00.000Z'));
  const financeApprove = actorRow(bundle.finance.approve, 21, 'finance_approve', 'finance_approve', new Date('2026-09-13T02:30:00.000Z'));
  const confirmationEvent = actorRow(bundle.confirmation.actor, 22, 'recipient_confirmed', 'recipient_confirmed', new Date('2026-09-13T04:00:00.000Z'));
  const completionEvent = {
    ...actorRow(bundle.completion.actor, 23, 'complete', 'complete', new Date('2026-09-13T05:00:00.000Z')),
    correlation_id: 'corr-44', completion_hash: bundle.completion.completion_hash,
    completion_snapshot_json: JSON.stringify({ completion_correlation_id: 'corr-44', ppd: { id: 44, revision: 1, hash } }),
    ...completionPatch,
  };
  const ppdEvents = [financeCheck, financeApprove, ...(omitConfirmationEvent ? [] : [confirmationEvent]), completionEvent];
  const payment = { ppd_id: 44, transaction_number: 'TRX-044', paid_amount: '2500000.00', paid_at: new Date('2026-09-13T03:00:00.000Z'), proof_file_id: 81, snapshot_json: JSON.stringify({ transaction_number: 'TRX-044', paid_amount: '2500000.00' }), snapshot_hash: 'b'.repeat(64) };
  const confirmation = { ppd_id: 44, method: 'Tatap Muka', confirmed_at: new Date('2026-09-13T04:00:00.000Z'), recipient_name_snapshot: 'Siti Penerima', evidence_file_id: 82, snapshot_json: JSON.stringify({}), snapshot_hash: 'e'.repeat(64), recorded_by_id: 41 };
  const rabLines = [{ id: 1, line_no: 1, register_number: 'RAB-1', description: 'Modal', amount: '2500000.00' }];
  const files = [
    { id: 81, mustahik_id: 44, artifact_type: 'ppd', artifact_id: 44, artifact_revision: 1, kind: 'payment_proof', sha256: 'b'.repeat(64) },
    { id: 82, mustahik_id: 44, artifact_type: 'ppd', artifact_id: 44, artifact_revision: 1, kind: 'recipient_confirmation', sha256: 'c'.repeat(64) },
  ];
  const rows = { ppd, mustahik: { id: 44, file_no: 'FILE-44', nik: '3671012345670002' }, mpzis, assessment, payment, confirmation };
  return {
    async get(sql, params = []) {
      const text = String(sql);
      if (/FROM ppd\b/i.test(text)) return rows.ppd;
      if (/FROM mustahik\b/i.test(text)) return rows.mustahik;
      if (/FROM mpzis\b/i.test(text)) return rows.mpzis;
      if (/FROM assessments\b/i.test(text)) return rows.assessment;
      if (/FROM ppd_payments\b/i.test(text)) return rows.payment;
      if (/FROM recipient_confirmations\b/i.test(text)) return rows.confirmation;
      if (/FROM artifact_files\b/i.test(text)) return files.find((file) => Number(file.id) === Number(params[0])) || null;
      return null;
    },
    async all(sql) {
      const text = String(sql);
      if (/artifact_type='mpzis'/i.test(text)) return mpzisApprovals;
      if (/artifact_type='ppd'/i.test(text)) return ppdEvents;
      if (/ppd_rab_lines/i.test(text)) return rabLines;
      return [];
    },
  };
}

function receiptJobDb({ status = 'pending', delayMs = 0, failArtifactInsert = false, failGenerationEvent = false, failLookup = false, stale = false } = {}) {
  const state = {
    ppd: { id: 44, mustahik_id: 44, revision: 1, status: 'completed', source: 'p0', receipt_status: status, receipt_error: null, receipt_lease_token: null, receipt_lease_expires_at: stale ? new Date(Date.now() - 1000).toISOString() : null },
    files: [], events: [], queries: [], delayMs, failArtifactInsert, failGenerationEvent, failLookup, stale,
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let transactionTail = Promise.resolve();
  const db = {
    isPg: true, state,
    async transaction(callback) {
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const snapshot = { ppd: { ...state.ppd }, files: state.files.map((row) => ({ ...row })), events: state.events.map((row) => ({ ...row })) };
      const tx = { _isInTransaction: true, get: db.get.bind(db), all: db.all.bind(db), query: db.query.bind(db), run: db.run.bind(db) };
      try { return await callback(tx); } catch (error) {
        Object.assign(state.ppd, snapshot.ppd); state.files.splice(0, state.files.length, ...snapshot.files); state.events.splice(0, state.events.length, ...snapshot.events);
        throw error;
      } finally { release(); }
    },
    async get(sql, params = []) {
      state.queries.push(String(sql));
      if (/FROM ppd\b/i.test(sql)) { if (state.delayMs) await wait(state.delayMs); return { ...state.ppd }; }
      if (/FROM artifact_files/i.test(sql)) {
        if (state.failLookup) throw new Error('database unavailable');
        if (/id=\$1/i.test(sql)) return state.files.find((row) => Number(row.id) === Number(params[0]) && Number(row.mustahik_id) === Number(params[1]) && row.artifact_type === 'ppd' && Number(row.artifact_id) === Number(params[2]) && Number(row.artifact_revision) === Number(params[3]) && row.kind === 'system_receipt_pdf') || null;
        return state.files.find((row) => Number(row.mustahik_id) === Number(params[0]) && row.artifact_type === 'ppd' && Number(row.artifact_id) === Number(params[1]) && Number(row.artifact_revision) === Number(params[2]) && row.kind === 'system_receipt_pdf') || null;
      }
      if (/FROM artifact_approvals/i.test(sql)) return state.events.find((row) => row.action === 'receipt_generated' && row.approval_step === 'receipt_generated' && Number(row.artifact_id) === Number(params[0]) && Number(row.artifact_revision) === Number(params[1])) || null;
      return null;
    },
    async all(sql) {
      state.queries.push(String(sql));
      if (/FROM artifact_files/i.test(sql)) return [...state.files];
      if (/receipt_status='processing'/i.test(sql)) return state.ppd.receipt_status === 'processing' ? [{ id: state.ppd.id }] : [];
      if (/receipt_status IN \('pending','failed'\)/i.test(sql)) return ['pending', 'failed'].includes(state.ppd.receipt_status) ? [{ id: state.ppd.id }] : [];
      return [];
    },
    async query(sql, params = []) {
      state.queries.push(String(sql));
      const text = String(sql);
      if (/UPDATE ppd SET receipt_status='processing'/i.test(text)) {
        const expiresAt = state.ppd.receipt_lease_expires_at ? new Date(state.ppd.receipt_lease_expires_at).getTime() : null;
        const eligible = Number(state.ppd.id) === Number(params[3])
          && (state.ppd.receipt_status === null || ['pending', 'failed'].includes(state.ppd.receipt_status)
            || (state.ppd.receipt_status === 'processing' && (expiresAt === null || expiresAt <= new Date(params[1]).getTime())));
        if (!eligible) return { rows: [], rowCount: 0 };
        state.ppd.receipt_status = 'processing'; state.ppd.receipt_lease_token = params[0]; state.ppd.receipt_lease_expires_at = params[2];
        return { rows: [{ ...state.ppd }], rowCount: 1 };
      }
      if (/UPDATE ppd SET receipt_status='pending'/i.test(text)) {
        state.ppd.receipt_status = 'pending'; state.ppd.receipt_lease_token = null; state.ppd.receipt_lease_expires_at = null;
        return { rows: [{ ...state.ppd }], rowCount: 1 };
      }
      if (/UPDATE ppd SET receipt_status='failed'/i.test(text)) {
        if (String(state.ppd.receipt_lease_token || '') === String(params[2] || '')) { state.ppd.receipt_status = 'failed'; state.ppd.receipt_error = params[0]; state.ppd.receipt_lease_token = null; }
        return { rows: [{ ...state.ppd }], rowCount: 1 };
      }
      if (/UPDATE ppd SET receipt_status='ready'/i.test(text)) {
        if (state.ppd.receipt_status !== 'processing' || String(state.ppd.receipt_lease_token || '') !== String(params[5] || '')) return { rows: [], rowCount: 0 };
        state.ppd.receipt_status = 'ready'; state.ppd.receipt_lease_token = null; state.ppd.receipt_file_id = params[1]; state.ppd.receipt_payload_sha256 = params[0]; state.ppd.receipt_file_sha256 = params[2]; state.ppd.receipt_created_at = params[3];
        return { rows: [{ ...state.ppd }], rowCount: 1 };
      }
      if (/INSERT INTO artifact_files/i.test(text)) {
        if (state.failArtifactInsert) throw new Error('artifact insert failed with secret details');
        if (state.files.some((row) => row.artifact_type === 'ppd' && Number(row.artifact_id) === Number(params[1]) && Number(row.artifact_revision) === Number(params[2]) && row.kind === 'system_receipt_pdf')) throw new Error('unique receipt artifact conflict');
        const row = { id: state.files.length + 1, mustahik_id: params[0], artifact_type: 'ppd', artifact_id: params[1], artifact_revision: params[2], kind: 'system_receipt_pdf', stored_name: params[3], original_name: params[4], mime_type: 'application/pdf', byte_size: params[5], sha256: params[6] };
        state.files.push(row); return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO artifact_approvals/i.test(text)) {
        if (state.failGenerationEvent) throw new Error('generation event insert failed');
        state.events.push({ id: state.events.length + 1, mustahik_id: params[0], artifact_type: 'ppd', artifact_id: params[1], artifact_revision: params[2], approval_step: 'receipt_generated', action: 'receipt_generated', snapshot_hash: params[3], correlation_id: params[5], completion_hash: params[6], completion_snapshot_json: JSON.parse(params[7]) }); return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    async run(sql, params = []) { return this.query(sql, params); },
  };
  return db;
}

test('receipt contains provenance and renders one assessment twice from one record', async () => {
  const bytes = await renderDistributionReceipt(completeBundle());
  const text = extractPdfText(bytes);
  assert.equal((text.match(/Salinan dari satu record digital/g) || []).length, 2);
  for (const marker of ['Bukti Digital Penyaluran', 'F-BPP/06', 'F-PKP/03', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved', 'SHA-256', 'Hash data bukti', 'Actor proposed', 'Finance Checker', 'RAB total', 'RAB-1', 'proof_file_id', 'proof_sha256', 'Tatap Muka', 'evidence_file_id', 'corr-44', 'Completion Actor', 'TRX-044', 'Approvals are authenticated system events without signature images']) assert.match(text, new RegExp(marker));
  assert.doesNotMatch(text, /3671012345670002|001122334455/);
  assert.doesNotMatch(bytes.toString('latin1'), /3671012345670002|001122334455/);
});

test('conditional Assessment omissions render exactly Belum dicatat without scores', async () => {
  const bundle = completeBundle();
  bundle.assessment.source_fields = {
    ...bundle.assessment.source_fields,
    husband_in_household: false, husband_name: null, husband_occupation: null, husband_monthly_income: null,
    child_count: 0, child_occupation: null, child_monthly_support: null,
    house_ownership: 'Milik Sendiri', monthly_rent_amount: null,
    applied_to_baznas_before: false, previous_application_year: null,
    overall_score: 99, house_index: 9,
  };
  const payload = buildReceiptPayload(bundle);
  assert.equal(payload.assessment.source_fields.husband_name, 'Belum dicatat');
  assert.equal(payload.assessment.source_fields.child_occupation, 'Belum dicatat');
  assert.equal(payload.assessment.source_fields.monthly_rent_amount, 'Belum dicatat');
  assert.equal(payload.assessment.source_fields.previous_application_year, 'Belum dicatat');
  assert.equal(Object.hasOwn(payload.assessment.source_fields, 'overall_score'), false);
  const text = extractPdfText(await renderDistributionReceipt(bundle));
  assert.match(text, /Belum dicatat/);
  assert.doesNotMatch(text, /: none/);
  assert.doesNotMatch(text, /overall_score|house_index/);
});

test('loader accepts PostgreSQL Date values, reads the persisted bank suffix, and preserves event provenance', async () => {
  const bundle = await loadReceiptBundle(44, { db: receiptLoaderDb() });
  assert.equal(bundle.ppd.bank_account_last4, '6789');
  assert.equal(bundle.created_at, '2026-09-13T05:00:00.000Z');
  assert.ok(bundle.payment.paid_at instanceof Date);
  assert.ok(bundle.confirmation.actor.created_at instanceof Date);
  assert.ok(bundle.completion.actor.created_at instanceof Date);
  assert.ok(bundle.completion.completed_at instanceof Date);
  assert.ok(bundle.finance.check.created_at instanceof Date);
  const payload = buildReceiptPayload(bundle);
  assert.equal(payload.payment.paid_at, '2026-09-13T03:00:00.000Z');
  assert.equal(payload.confirmation.actor.actor_level, 'staff');
  assert.equal(payload.confirmation.actor.actor_division, 'Penyaluran');
  assert.equal(payload.completion.actor.actor_level, 'staff');
  assert.equal(payload.completion.snapshot_hash, 'a'.repeat(64));
  assert.equal(payload.completion.completion_hash, 'd'.repeat(64));
  const text = extractPdfText(await renderDistributionReceipt(bundle));
  assert.match(text, /bank_account_masked: \*+6789/);
  assert.doesNotMatch(text, /001122334455/);
});

test('loader requires persisted recipient confirmation and complete completion provenance', async () => {
  await assert.rejects(loadReceiptBundle(44, { db: receiptLoaderDb({ omitConfirmationEvent: true }) }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
  for (const field of ['actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'snapshot_hash', 'completion_hash']) {
    await assert.rejects(loadReceiptBundle(44, { db: receiptLoaderDb({ completionPatch: { [field]: null } }) }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
  }
});

test('receipt bytes and payload hash are deterministic and kept separate', async () => {
  const bundle = completeBundle();
  const [first, second] = await Promise.all([renderDistributionReceipt(bundle), renderDistributionReceipt(bundle)]);
  const payload = buildReceiptPayload(bundle);
  assert.deepEqual(first, second);
  assert.match(payload.receipt_payload_sha256, /^[a-f0-9]{64}$/);
  assert.match(crypto.createHash('sha256').update(first).digest('hex'), /^[a-f0-9]{64}$/);
  assert.notEqual(payload.receipt_payload_sha256, crypto.createHash('sha256').update(first).digest('hex'));
  assert.match(extractPdfText(first), /SHA-256 file hash is persisted separately from this payload hash/);
});

test('receipt payload is canonical and rejects missing persisted values', () => {
  const bundle = completeBundle();
  const payload = buildReceiptPayload(bundle);
  assert.match(payload.receipt_payload_sha256, /^[a-f0-9]{64}$/);
  assert.equal(payload.assessment.id, 7);
  assert.throws(() => buildReceiptPayload({ ...bundle, completion: { ...bundle.completion, correlation_id: null } }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
  assert.throws(() => buildReceiptPayload({ ...bundle, mpzis: { ...bundle.mpzis, approvals: bundle.mpzis.approvals.map((row, index) => index === 1 ? { ...row, actor_id: 20 } : row) } }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
  assert.throws(() => buildReceiptPayload({ ...bundle, ppd: { ...bundle.ppd, rab_lines: [{ ...bundle.ppd.rab_lines[0], amount: '1.00' }] } }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
  assert.throws(() => buildReceiptPayload({ ...bundle, confirmation: { ...bundle.confirmation, evidence_file_id: null } }), (error) => error.code === 'RECEIPT_DATA_INCOMPLETE');
});

test('two workers create one ready receipt, return the same file, and clean the losing temp file', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-job-'));
  const db = receiptJobDb({ delayMs: 1 });
  let renders = 0;
  const deps = { db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => { renders += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return Buffer.from('%PDF-1.7\n%%EOF\n'); }, leaseMs: 5000, pollIntervalMs: 2, waitTimeoutMs: 2000 };
  try {
    const pair = await Promise.all([processReceiptJob(44, deps), processReceiptJob(44, deps)]);
    const [a, b] = pair;
    assert.equal(a.file_id, b.file_id);
    assert.equal(a.file_sha256, b.file_sha256);
    assert.equal(db.state.files.filter((row) => row.kind === 'system_receipt_pdf').length, 1);
    assert.equal(db.state.events.filter((row) => row.action === 'receipt_generated').length, 1);
    const generationEvent = db.state.events.find((row) => row.action === 'receipt_generated');
    assert.equal(generationEvent.snapshot_hash, db.state.ppd.receipt_payload_sha256);
    assert.equal(generationEvent.completion_hash, a.file_sha256);
    assert.equal(generationEvent.completion_snapshot_json.file_id, a.file_id);
    assert.equal(generationEvent.completion_snapshot_json.file_sha256, a.file_sha256);
    assert.equal(generationEvent.completion_snapshot_json.receipt_payload_sha256, db.state.ppd.receipt_payload_sha256);
    assert.equal(generationEvent.completion_snapshot_json.actor_snapshot.actor_name, 'System receipt job');
    assert.equal(renders, 1);
    assert.deepEqual((await fs.readdir(artifactDir)).filter((name) => name.includes('.tmp')), []);
    const persistedBytes = await fs.readFile(path.join(artifactDir, a.stored_name));
    const replay = await processReceiptJob(44, deps);
    assert.equal(replay.file_id, a.file_id);
    assert.equal(replay.file_sha256, a.file_sha256);
    assert.deepEqual(await fs.readFile(path.join(artifactDir, replay.stored_name)), persistedBytes);
    assert.equal(db.state.events.filter((row) => row.action === 'receipt_generated').length, 1);
    assert.equal(renders, 1);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('ready replay fails closed when persisted receipt file hash is absent', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-ready-hash-'));
  const db = receiptJobDb();
  db.state.ppd.receipt_status = 'ready'; db.state.ppd.receipt_file_id = 1; db.state.ppd.receipt_file_sha256 = null;
  db.state.files.push({ id: 1, mustahik_id: 44, artifact_type: 'ppd', artifact_id: 44, artifact_revision: 1, kind: 'system_receipt_pdf', stored_name: 'receipt-ready.pdf', sha256: 'b'.repeat(64) });
  try {
    await assert.rejects(processReceiptJob(44, { db, artifactRoot: artifactDir }), (error) => error.code === 'RECEIPT_FILE_MISSING');
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('render failure marks the lease failed with sanitized detail and removes its files', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-failure-'));
  const db = receiptJobDb();
  try {
    await assert.rejects(processReceiptJob(44, { db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => { throw new Error('sensitive-render-input'); } }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    assert.equal(db.state.ppd.receipt_status, 'failed');
    assert.equal(db.state.ppd.receipt_error, 'RECEIPT_RENDER_FAILED');
    assert.doesNotMatch(String(db.state.ppd.receipt_error), /sensitive/);
    assert.deepEqual(await fs.readdir(artifactDir), []);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('write failure removes the lease temp file and marks the receipt failed', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-write-failure-'));
  const db = receiptJobDb();
  const fileSystem = {
    open: async (...args) => {
      const handle = await fs.open(...args);
      return { writeFile: async () => { throw new Error('sensitive write failure'); }, close: () => handle.close() };
    },
    readFile: (...args) => fs.readFile(...args), access: (...args) => fs.access(...args), rename: (...args) => fs.rename(...args), unlink: (...args) => fs.unlink(...args),
  };
  try {
    await assert.rejects(processReceiptJob(44, { db, artifactRoot: artifactDir, fileSystem, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => Buffer.from('%PDF-1.7\n%%EOF\n') }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    assert.equal(db.state.ppd.receipt_status, 'failed');
    assert.deepEqual(await fs.readdir(artifactDir), []);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('artifact insertion failure cleans only the current unreferenced final file', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-db-failure-'));
  const db = receiptJobDb({ failArtifactInsert: true });
  try {
    await assert.rejects(processReceiptJob(44, { db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => Buffer.from('%PDF-1.7\n%%EOF\n') }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    assert.equal(db.state.ppd.receipt_status, 'failed');
    assert.deepEqual(await fs.readdir(artifactDir), []);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('generation event failure rolls back the artifact row and preserves no orphan final', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-event-failure-'));
  const db = receiptJobDb({ failGenerationEvent: true });
  try {
    await assert.rejects(processReceiptJob(44, { db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => Buffer.from('%PDF-1.7\n%%EOF\n') }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    assert.equal(db.state.files.length, 0);
    assert.equal(db.state.events.length, 0);
    assert.deepEqual(await fs.readdir(artifactDir), []);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('lease loss does not overwrite the newer owner and cleans the old final file', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-lease-loss-'));
  const db = receiptJobDb();
  try {
    await assert.rejects(processReceiptJob(44, {
      db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(),
      renderReceipt: async () => { db.state.ppd.receipt_lease_token = 'new-owner'; return Buffer.from('%PDF-1.7\n%%EOF\n'); },
    }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    assert.equal(db.state.ppd.receipt_lease_token, 'new-owner');
    assert.equal(db.state.ppd.receipt_status, 'processing');
    assert.deepEqual(await fs.readdir(artifactDir), []);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('lease-loss cleanup fails closed when artifact lookup is unavailable', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-lookup-outage-'));
  const db = receiptJobDb({ failLookup: true });
  try {
    await assert.rejects(processReceiptJob(44, {
      db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(),
      renderReceipt: async () => { db.state.ppd.receipt_lease_token = 'new-owner'; return Buffer.from('%PDF-1.7\n%%EOF\n'); },
    }), (error) => error.code === 'RECEIPT_GENERATION_FAILED');
    const names = await fs.readdir(artifactDir);
    assert.equal(names.filter((name) => name.endsWith('.pdf')).length, 1);
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('startup cleanup reclaims stale processing receipts and removes only stale orphan files', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-receipt-resume-'));
  const db = receiptJobDb({ status: 'processing', stale: true });
  const staleTemp = path.join(artifactDir, '.receipt-44-1-old-token.pdf.tmp');
  const staleFinal = path.join(artifactDir, 'receipt-44-1-old-token.pdf');
  const keepFinal = path.join(artifactDir, 'receipt-44-1-ready-token.pdf');
  try {
    await fs.writeFile(staleTemp, 'stale'); await fs.writeFile(staleFinal, 'stale'); await fs.writeFile(keepFinal, 'keep');
    db.state.files.push({ id: 99, artifact_id: 9, artifact_revision: 1, kind: 'system_receipt_pdf', stored_name: 'receipt-44-1-ready-token.pdf' });
    const old = new Date(Date.now() - 10 * 60 * 1000); await Promise.all([fs.utimes(staleTemp, old, old), fs.utimes(staleFinal, old, old), fs.utimes(keepFinal, old, old)]);
    const result = await resumePendingReceiptJobs({ db, artifactRoot: artifactDir, loadReceiptBundle: async () => completeBundle(), renderReceipt: async () => Buffer.from('%PDF-1.7\n%%EOF\n'), leaseMs: 1000 });
    assert.equal(result.success, true);
    assert.equal(db.state.ppd.receipt_status, 'ready');
    assert.equal(await fs.stat(keepFinal).then(() => true), true);
    await assert.rejects(fs.stat(staleTemp)); await assert.rejects(fs.stat(staleFinal));
  } finally { await fs.rm(artifactDir, { recursive: true, force: true }); }
});

test('fresh schema and additive migration expose the receipt lease/index contract', async () => {
  const schema = await fs.readFile(path.join(process.cwd(), 'server', 'schema.sql'), 'utf8');
  const migration = await fs.readFile(path.join(process.cwd(), 'server', 'migrations', '20260919_002_p0_receipt.sql'), 'utf8');
  for (const column of ['receipt_lease_token', 'receipt_lease_started_at', 'receipt_lease_expires_at', 'receipt_payload_sha256', 'receipt_file_id', 'receipt_file_sha256', 'receipt_created_at']) {
    assert.match(schema, new RegExp(`\\b${column}\\b`)); assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(schema, /uq_system_receipt_artifact/); assert.match(migration, /uq_system_receipt_artifact/);
  assert.match(schema, /uq_system_receipt_generated_event/); assert.match(migration, /uq_system_receipt_generated_event/);
  assert.match(schema, /ppd_receipt_status_check/); assert.match(migration, /ppd_receipt_status_check/);
  assert.match(migration, /HAVING COUNT\(\*\) > 1/); assert.match(migration, /P0 receipt migration blocked/);
});

async function invokeReceiptRoute(state, user = { id: 9, role: 'penyaluran', level: 'staff', division: 'Penyaluran' }) {
  const response = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader() { return this; },
    end(value) { this.body = value; return this; },
  };
  const req = { params: { id: '44', ppdId: '44' }, query: {}, headers: {}, user };
  await state.handler(req, response);
  return response;
}

test('exact PPD receipt route maps pending/failed and streams ready through the audited seam', async () => {
  const state = { receipt: { id: 44, mustahik_id: 44, revision: 1, source: 'p0', status: 'completed', receipt_status: 'pending', receipt_file_id: null, receipt_file_sha256: null }, audits: [], streamCalls: 0, authorize: true, handler: null };
  const registered = [];
  const discoverable = { get(route, ...handlers) { registered.push({ route, handlers }); }, post() {}, put() {} };
  registerPenyaluranP0Routes(discoverable, {
    authenticateToken: (_req, _res, next) => next(), isEnabled: true, db: { async get() { return { id: 44 }; } },
    services: {
      authorizeCaseRead: async (_db, _id, actor, options) => { if (!state.authorize || (actor?.role === 'surveyor' && options?.artifactKind === 'system_receipt_pdf')) throw new P0Error('PERMISSION_DENIED', 'denied', { status: 403 }); if (!actor?.id) throw new P0Error('ACTOR_REQUIRED', 'missing'); },
      getReceiptStatus: async () => state.receipt,
      openArtifactForActor: async () => ({ file: { id: 81, mustahik_id: 44, artifact_type: 'ppd', artifact_id: 44, artifact_revision: state.receipt.revision, kind: 'system_receipt_pdf', sha256: 'e'.repeat(64), mime_type: 'application/pdf', byte_size: 5, original_name: 'Bukti-Digital-Penyaluran.pdf' }, stat: { size: 5 }, handle: { close: async () => {} } }),
      streamAuditedArtifact: async (options) => { state.streamCalls += 1; state.audits.push(options.receipt ? 'download' : 'other'); options.response.status(200).end(Buffer.from('%PDF')); return options.response; },
    },
  });
  const exact = registered.find((entry) => entry.route === '/api/penyaluran/mustahik/:id/ppd/:ppdId/receipt');
  assert.ok(exact);
  state.handler = exact.handlers.at(-1);
  let response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 409); assert.equal(response.body.code, 'RECEIPT_PENDING'); assert.equal(state.streamCalls, 0);
  state.receipt = { ...state.receipt, receipt_status: 'failed', receipt_error: 'RECEIPT_DATA_INCOMPLETE' };
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'RECEIPT_GENERATION_FAILED'); assert.equal(state.streamCalls, 0);
  state.receipt = { ...state.receipt, receipt_status: 'ready', receipt_file_id: 81, receipt_file_sha256: 'e'.repeat(64) };
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 200); assert.equal(state.streamCalls, 1); assert.deepEqual(state.audits, ['download']); assert.deepEqual(response.body, Buffer.from('%PDF'));
  state.receipt = { ...state.receipt, receipt_file_sha256: 'f'.repeat(64) };
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 503); assert.equal(state.streamCalls, 1);
  state.receipt = { ...state.receipt, receipt_file_sha256: null, revision: 2 };
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 503); assert.equal(state.streamCalls, 1);
  const p0Receipt = state.receipt;
  state.receipt = { ...state.receipt, source: 'legacy' };
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 404); assert.equal(state.streamCalls, 1);
  state.receipt = p0Receipt;
  const surveyor = await invokeReceiptRoute(state, { id: 9, role: 'surveyor', level: 'staff', division: 'Penyaluran' });
  assert.equal(surveyor.statusCode, 403); assert.equal(state.streamCalls, 1);
  state.authorize = false;
  response = await invokeReceiptRoute(state);
  assert.equal(response.statusCode, 403); assert.equal(state.streamCalls, 1); assert.deepEqual(state.audits, ['download']);
});
