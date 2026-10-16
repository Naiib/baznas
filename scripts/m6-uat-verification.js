import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { createP0TestDatabase } from '../server/penyaluran-p0-test-helpers.js';
import { registerPenyaluranP0Routes } from '../server/penyaluran-p0/routes.js';
import { submitMustahikDecision } from '../server/repository.js';
import { processReceiptJob } from '../server/penyaluran-p0/receipt-jobs.js';
import maskedFixture from '../server/fixtures/penyaluran-p0-masked-case.json' with { type: 'json' };
import { verifyM6ReceiptDownload } from '../server/penyaluran-p0/receipt-evidence.js';

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.P0_FIELD_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

async function ensureE2eSchema(db) {
  const statements = [
    'ALTER TABLE mustahik ADD COLUMN address TEXT',
    'ALTER TABLE mustahik ADD COLUMN rt_rw TEXT',
    'ALTER TABLE mustahik ADD COLUMN kelurahan TEXT',
    'ALTER TABLE mustahik ADD COLUMN kecamatan TEXT',
    'ALTER TABLE mustahik ADD COLUMN kabupaten_kota TEXT',
    'ALTER TABLE mustahik ADD COLUMN province TEXT',
    'ALTER TABLE mustahik ADD COLUMN approved_amount NUMERIC',
    'ALTER TABLE mustahik ADD COLUMN mpzis_date TEXT',
    'ALTER TABLE mustahik ADD COLUMN asnaf TEXT',
    'ALTER TABLE mustahik ADD COLUMN fund_source TEXT',
    'ALTER TABLE mustahik ADD COLUMN distribution_purpose TEXT',
    'ALTER TABLE mustahik ADD COLUMN family_dependents INTEGER DEFAULT 0',
    'ALTER TABLE mustahik ADD COLUMN pob TEXT',
    'ALTER TABLE mustahik ADD COLUMN dob TEXT',
    'ALTER TABLE mustahik ADD COLUMN occupation TEXT',
    'ALTER TABLE mustahik ADD COLUMN work_place TEXT',
    'ALTER TABLE mustahik ADD COLUMN education_level TEXT',
    'ALTER TABLE mustahik ADD COLUMN house_ownership TEXT',
    'ALTER TABLE mustahik ADD COLUMN parent_occupation TEXT',
    'ALTER TABLE mustahik ADD COLUMN payment_method TEXT',
    'ALTER TABLE mustahik ADD COLUMN bank_name TEXT',
    'CREATE TABLE IF NOT EXISTS approval_decisions (id SERIAL PRIMARY KEY, mustahik_id INTEGER, action TEXT, from_status TEXT, next_status TEXT, notes TEXT, actor_id INTEGER, actor_name TEXT, actor_role TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)',
    'ALTER TABLE mustahik ADD COLUMN survey_date TEXT',
    'ALTER TABLE mustahik ADD COLUMN surveyor_name TEXT',
    'ALTER TABLE mustahik ADD COLUMN rejection_reason TEXT',
    'ALTER TABLE activity_logs ALTER COLUMN actor_role DROP NOT NULL',
    'ALTER TABLE activity_logs ALTER COLUMN actor_level DROP NOT NULL',
    'ALTER TABLE activity_logs ALTER COLUMN actor_division DROP NOT NULL',
    'ALTER TABLE mustahik ADD COLUMN survey_recommendation TEXT',
    'CREATE TABLE IF NOT EXISTS wa_logs (id SERIAL PRIMARY KEY, mustahik_id INTEGER, phone TEXT, phase TEXT, message TEXT, wa_url TEXT, status TEXT, sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)',
    'ALTER TABLE assessments ADD COLUMN supersedes_id INTEGER',
    'ALTER TABLE assessments ADD COLUMN template_code TEXT',
    'ALTER TABLE assessments ADD COLUMN template_version TEXT',
    'ALTER TABLE assessments ADD COLUMN submitted_at TIMESTAMPTZ',
    'ALTER TABLE assessments ADD COLUMN reviewed_at TIMESTAMPTZ',
    'ALTER TABLE assessments ADD COLUMN husband_in_household BOOLEAN',
    'ALTER TABLE assessments ADD COLUMN husband_name TEXT',
    'ALTER TABLE assessments ADD COLUMN wife_in_household BOOLEAN',
    'ALTER TABLE assessments ADD COLUMN wife_name TEXT',
    'ALTER TABLE assessments ADD COLUMN child_count INTEGER',
    'ALTER TABLE assessments ADD COLUMN house_ownership TEXT',
    'ALTER TABLE assessments ADD COLUMN home_address TEXT',
    'ALTER TABLE assessments ADD COLUMN address_matches_ktp BOOLEAN',
    'ALTER TABLE assessments ADD COLUMN monthly_rent_amount NUMERIC',
    'ALTER TABLE assessments ADD COLUMN husband_occupation TEXT',
    'ALTER TABLE assessments ADD COLUMN husband_monthly_income NUMERIC',
    'ALTER TABLE assessments ADD COLUMN wife_occupation TEXT',
    'ALTER TABLE assessments ADD COLUMN wife_monthly_income NUMERIC',
    'ALTER TABLE assessments ADD COLUMN child_occupation TEXT',
    'ALTER TABLE assessments ADD COLUMN child_monthly_support NUMERIC',
    'ALTER TABLE assessments ADD COLUMN assistance_request TEXT',
    'ALTER TABLE assessments ADD COLUMN applied_to_baznas_before BOOLEAN',
    'ALTER TABLE assessments ADD COLUMN previous_application_year INTEGER',
    'ALTER TABLE mpzis ADD COLUMN supersedes_id INTEGER',
    'ALTER TABLE mpzis ADD COLUMN template_code TEXT',
    'ALTER TABLE mpzis ADD COLUMN template_version TEXT',
    'ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER',
    'ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER',
    'ALTER TABLE mpzis ADD COLUMN submitted_at TIMESTAMPTZ',
    'ALTER TABLE mpzis ADD COLUMN mpzis_date TEXT',
    'ALTER TABLE mpzis ADD COLUMN program_classification TEXT',
    'ALTER TABLE mpzis ADD COLUMN purpose TEXT',
    'ALTER TABLE mpzis ADD COLUMN asnaf TEXT',
    'ALTER TABLE mpzis ADD COLUMN fund_source TEXT',
    'ALTER TABLE mpzis ADD COLUMN recipient_type TEXT',
    'ALTER TABLE mpzis ADD COLUMN beneficiary_count INTEGER',
    'ALTER TABLE mpzis ADD COLUMN approved_amount NUMERIC',
    'ALTER TABLE mpzis ADD COLUMN address_snapshot JSONB',
    'ALTER TABLE mpzis ADD COLUMN marital_status_snapshot TEXT',
    'ALTER TABLE mpzis ADD COLUMN recipient_section_confirmed BOOLEAN',
    'ALTER TABLE mpzis ADD COLUMN fund_source_confirmed BOOLEAN',
    'ALTER TABLE mpzis ADD COLUMN approved_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN supersedes_id INTEGER',
    'ALTER TABLE ppd ADD COLUMN template_code TEXT',
    'ALTER TABLE ppd ADD COLUMN template_version TEXT',
    'ALTER TABLE ppd ADD COLUMN created_by_id INTEGER',
    'ALTER TABLE ppd ADD COLUMN submitted_by_id INTEGER',
    'ALTER TABLE ppd ADD COLUMN submitted_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN finance_checked_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN finance_approved_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN form_number TEXT',
    'ALTER TABLE ppd ADD COLUMN ppd_number TEXT',
    'ALTER TABLE ppd ADD COLUMN purpose TEXT',
    'ALTER TABLE ppd ADD COLUMN fund_source TEXT',
    'ALTER TABLE ppd ADD COLUMN fund_source_confirmed BOOLEAN',
    'ALTER TABLE ppd ADD COLUMN payment_type TEXT',
    'ALTER TABLE ppd ADD COLUMN payment_type_confirmed BOOLEAN',
    'ALTER TABLE ppd ADD COLUMN payment_type_other TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_name TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_ciphertext TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_last4 TEXT',
    'ALTER TABLE ppd ADD COLUMN bank_account_name TEXT',
    'ALTER TABLE ppd ADD COLUMN requester_name TEXT',
    'ALTER TABLE ppd ADD COLUMN requester_role TEXT',
    'ALTER TABLE ppd ADD COLUMN requester_department TEXT',
    'ALTER TABLE ppd ADD COLUMN amount_in_words TEXT',
    'ALTER TABLE ppd ADD COLUMN total_amount NUMERIC',
    'ALTER TABLE ppd ADD COLUMN receipt_status TEXT',
    'ALTER TABLE ppd ADD COLUMN receipt_error TEXT',
    'ALTER TABLE ppd ADD COLUMN receipt_file_id INTEGER',
    'ALTER TABLE ppd ADD COLUMN receipt_payload_sha256 CHAR(64)',
    'ALTER TABLE ppd ADD COLUMN receipt_file_sha256 CHAR(64)',
    'ALTER TABLE ppd ADD COLUMN receipt_lease_token TEXT',
    'ALTER TABLE ppd ADD COLUMN receipt_lease_started_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN receipt_lease_expires_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN receipt_created_at TIMESTAMPTZ',
    'ALTER TABLE ppd ADD COLUMN receipt_generation_attempts INTEGER DEFAULT 0',
  ];
  for (const statement of statements) {
    try { await db.exec(statement); } catch {}
  }
}

async function runMaskedUat() {
  console.log('=== STARTING MASKED API UAT REHEARSAL ===');
  const db = await createP0TestDatabase();
  await ensureE2eSchema(db);
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-uat-root-'));

  const app = express();
  app.use(express.json());

  let currentActor = null;
  const setActor = (actor) => { currentActor = actor; };

  registerPenyaluranP0Routes(app, {
    db,
    artifactRoot,
    isEnabled: () => true,
    authenticateToken: (req, res, next) => {
      req.user = currentActor || maskedFixture.actors.intake_creator;
      next();
    },
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const { actors, intake, assessment, mpzis, ppd, payment, confirmation } = maskedFixture;

  const stageEvidence = [];

  // Stage 1: Intake
  setActor(actors.intake_creator);
  const intakeRes = await (await fetch(`${baseUrl}/api/penyaluran/mustahik`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-intake-01' },
    body: JSON.stringify(intake),
  })).json();
  const caseId = intakeRes.data.id;
  stageEvidence.push({ stage: '1. Intake (Amil)', status: 'Diajukan', caseId, actor: actors.intake_creator.name });

  // Stage 2: Generic transitions to Survey
  await submitMustahikDecision(caseId, { action: 'approve', target_status: 'Verifikasi Administrasi', notes: 'Verifikasi berkas', expected_status: 'Diajukan', expected_version: 0 }, actors.intake_creator, db);
  await submitMustahikDecision(caseId, { action: 'approve', target_status: 'Survey', notes: 'Lolos berkas', expected_status: 'Verifikasi Administrasi', expected_version: 1 }, actors.intake_creator, db);
  stageEvidence.push({ stage: '2. Early Verification', status: 'Survey', caseId, actor: actors.intake_creator.name });

  // Stage 3: Assessment
  const assDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/assessment/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ass-draft' }, body: JSON.stringify({ expected_version: 2 }) })).json();
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/assessment/${assDraft.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ass-save' }, body: JSON.stringify({ ...assessment, expected_version: 2, expected_revision: 1 }) });
  const assSubmit = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/assessment/${assDraft.data.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ass-submit' }, body: JSON.stringify({ ...assessment, expected_version: 2, expected_revision: 1 }) })).json();
  setActor(actors.assessment_reviewer);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/assessment/${assDraft.data.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ass-review' }, body: JSON.stringify({ action: 'accept', note: 'Asesmen valid', expected_version: 2, expected_revision: 1, expected_snapshot_hash: assSubmit.data.snapshot_hash }) });
  stageEvidence.push({ stage: '3. Assessment', status: 'accepted', snapshotHash: assSubmit.data.snapshot_hash, reviewer: actors.assessment_reviewer.name });

  // Stage 4: MPZIS (5 approvals)
  const wsAfterAss = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/workspace`)).json();
  const vMpzis = wsAfterAss.case.workflow_version;
  setActor(actors.mpzis_creator);
  const mpzisDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/mpzis/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-mpz-draft' }, body: JSON.stringify({ expected_version: vMpzis, expected_revision: 1 }) })).json();
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisDraft.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-mpz-save' }, body: JSON.stringify({ ...mpzis, recipient_section_confirmed: true, fund_source_confirmed: true, expected_version: vMpzis, expected_revision: 1 }) });
  setActor(actors.mpzis_submitter);
  const mpzisSubmit = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisDraft.data.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-mpz-submit' }, body: JSON.stringify({ expected_version: vMpzis, expected_revision: 1 }) })).json();
  const mpzisHash = mpzisSubmit.data.snapshot_hash;

  const approvalSteps = [
    { step: 'proposed', actor: actors.mpzis_approver_1 },
    { step: 'examined', actor: actors.mpzis_approver_2 },
    { step: 'ashnaf_verified', actor: actors.mpzis_approver_3 },
    { step: 'responsible_acknowledged', actor: actors.mpzis_approver_4 },
    { step: 'approved', actor: actors.mpzis_approver_5 },
  ];
  for (const s of approvalSteps) {
    setActor(s.actor);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisDraft.data.id}/approvals/${s.step}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `uat-mpz-${s.step}` }, body: JSON.stringify({ action: 'approve', note: `UAT ${s.step}`, expected_version: vMpzis, expected_revision: 1, expected_snapshot_hash: mpzisHash }) });
  }
  stageEvidence.push({ stage: '4. MPZIS 5 Approvals', status: 'approved', snapshotHash: mpzisHash, stepsCompleted: 5 });

  // Stage 5: PPD & Finance
  const wsAfterMpzis = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/workspace`)).json();
  const vPpd = wsAfterMpzis.case.workflow_version;
  setActor(actors.ppd_creator);
  const ppdDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ppd-draft' }, body: JSON.stringify({ expected_version: vPpd, expected_revision: 1 }) })).json();
  const ppdId = ppdDraft.data.id;
  const sampleSha = 'c'.repeat(64);
  const suppDoc = await db.get("INSERT INTO artifact_files (mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, original_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES ($1, 'ppd', $2, 1, 'supporting_document', 'uat-doc.pdf', 'uat-doc.pdf', 'application/pdf', 100, $3, $4) RETURNING *", [caseId, ppdId, sampleSha, actors.ppd_creator.id]);
  const ppdPayload = { ...ppd, attachments: [{ file_id: suppDoc.id, kind: 'supporting_document', mime_type: 'application/pdf', byte_size: 100, sha256: sampleSha }], fund_source_confirmed: true, payment_type_confirmed: true };
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ppd-save' }, body: JSON.stringify({ ...ppdPayload, expected_version: vPpd, expected_revision: 1 }) });
  const ppdSubmit = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ppd-submit' }, body: JSON.stringify({ ...ppdPayload, expected_version: vPpd, expected_revision: 1 }) })).json();
  const ppdHash = ppdSubmit.data.snapshot_hash;

  setActor(actors.finance_checker);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/finance-check`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ppd-fin-check' }, body: JSON.stringify({ note: 'UAT Fin Check ok', expected_version: vPpd, expected_revision: 1 }) });
  setActor(actors.finance_approver);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/finance-approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-ppd-fin-approve' }, body: JSON.stringify({ note: 'UAT Fin Approve ok', expected_version: vPpd, expected_revision: 1, expected_snapshot_hash: ppdHash }) });
  stageEvidence.push({ stage: '5. PPD & Finance Approval', status: 'approved', snapshotHash: ppdHash });

  // Stage 6: Payment & Verification
  setActor(actors.payment_recorder);
  const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
  const paymentForm = new FormData();
  paymentForm.set('transaction_number', payment.transaction_number);
  paymentForm.set('paid_amount', String(payment.paid_amount));
  paymentForm.set('paid_at', new Date().toISOString());
  paymentForm.set('proof', new Blob([tinyPdf], { type: payment.proof_mime_type }), payment.proof_filename);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/payment`, { method: 'POST', headers: { 'Idempotency-Key': 'uat-pay-record' }, body: paymentForm });
  setActor(actors.payment_verifier);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-pay-verify' }, body: JSON.stringify({}) });
  stageEvidence.push({ stage: '6. Payment Recording & Verification', status: 'verified', amount: payment.paid_amount });

  // Stage 7: Recipient Confirmation
  setActor(actors.recipient_confirmer);
  const confirmPdf = Buffer.from('%PDF-1.4\n2 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
  const confirmForm = new FormData();
  confirmForm.set('method', 'Tatap Muka');
  confirmForm.set('recipient_name_snapshot', confirmation.recipient_name_snapshot);
  confirmForm.set('confirmed_at', new Date().toISOString());
  confirmForm.set('note', confirmation.note);
  confirmForm.set('evidence', new Blob([confirmPdf], { type: confirmation.evidence_mime_type }), confirmation.evidence_filename);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/recipient-confirmation`, { method: 'POST', headers: { 'Idempotency-Key': 'uat-confirm' }, body: confirmForm });
  stageEvidence.push({ stage: '7. Recipient Confirmation', status: 'confirmed', method: 'Tatap Muka' });

  // Stage 8: Completion & Receipt Generation
  setActor(actors.mpzis_approver_5);
  await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'uat-complete' }, body: JSON.stringify({}) });
  await processReceiptJob(ppdId, { db, artifactRoot });
  await db.run('INSERT INTO mustahik_case_assignments (mustahik_id, user_id, assignment_role) VALUES ($1, $2, $3)', [caseId, actors.mpzis_approver_5.id, 'leader']);

  // Stage 9: Receipt Download & Verification
  const receiptRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/receipt`);
  const receiptBytes = Buffer.from(await receiptRes.arrayBuffer());

  const ppdRecord = await db.get('SELECT receipt_status, receipt_payload_sha256, receipt_file_sha256 FROM ppd WHERE id=$1', [ppdId]);
  const receiptEvidence = verifyM6ReceiptDownload({
    httpStatus: receiptRes.status,
    bytes: receiptBytes,
    record: ppdRecord,
  });
  const receiptSha256 = receiptEvidence.receiptSha256;

  stageEvidence.push({
    stage: '9. Receipt Download & Verification',
    status: 'verified',
    httpStatus: receiptRes.status,
    dbReceiptStatus: ppdRecord.receipt_status,
    receiptBytesLength: receiptEvidence.receiptBytesLength,
    receiptFileSha256: receiptSha256,
    dbPayloadSha256: ppdRecord.receipt_payload_sha256,
    dbFileSha256: ppdRecord.receipt_file_sha256,
    isPdfValid: receiptEvidence.isPdfValid,
  });

  console.log('Stage Evidence Summary:');
  for (const s of stageEvidence) {
    console.log(`- ${s.stage}: ${s.status}`);
  }
  console.log(`Receipt HTTP status: ${receiptRes.status}`);
  console.log(`DB receipt status: ${ppdRecord.receipt_status}`);
  console.log(`Receipt PDF valid: ${receiptEvidence.isPdfValid}`);
  console.log(`Receipt File SHA-256: ${receiptSha256}`);
  console.log(`DB File SHA-256 match: ${receiptSha256 === String(ppdRecord.receipt_file_sha256 || '').trim().toLowerCase()}`);

  await new Promise((r) => server.close(r));
  await fs.rm(artifactRoot, { recursive: true, force: true });
  await db.close();
  console.log('=== MASKED API UAT REHEARSAL SUCCESSFUL ===');
}

runMaskedUat().catch((err) => {
  console.error('UAT failed:', err);
  process.exit(1);
});
