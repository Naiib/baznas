import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

import {
  assertLegacyWriteAllowed,
  classifyLegacyCase,
  isPenyaluranP0Enabled,
  isP0CutoverActive,
  archiveCase,
  restoreCase,
  beginLegacyReconciliation,
  completeLegacyReconciliation,
  recoverArtifactStep,
  validatePersistedEvidence,
} from './penyaluran-p0/legacy-reconciliation.js';
import { createSnapshot } from './penyaluran-p0/canonical-snapshot.js';
import { deleteMustahik, listMustahik, getMustahikStageCounts } from './repository.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { requireProductionSecret } from './access-policy.js';
import app, { startServer as startAppServer } from './index.js';

process.env.NODE_ENV = 'test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const JWT_SECRET = requireProductionSecret();
const adminToken = jwt.sign({ id: 1, email: 'admin@baznas.go.id', role: 'admin', level: 'admin', division: 'IT' }, JWT_SECRET);
const staffToken = jwt.sign({ id: 2, email: 'staff@baznas.go.id', role: 'penyaluran', level: 'staff', division: 'Penyaluran' }, JWT_SECRET);

const caseRow = async (db, id) => db.get('SELECT * FROM mustahik WHERE id = $1', [id]);
const count = async (db, table) => Number((await db.get(`SELECT COUNT(*) as count FROM ${table}`)).count);

function assessmentSnapshot(id, mustahikId) {
  return createSnapshot('assessment', {
    schema_version: 1,
    artifact_type: 'assessment',
    id,
    revision: 1,
    mustahik_id: mustahikId,
    application_id: 1,
    template_code: 'ASSESSMENT_LANGSUNG_MUSTAHIK',
    template_version: '1',
    source: 'p0',
  });
}

function mpzisSnapshot(id, mustahikId, assessment) {
  return createSnapshot('mpzis', {
    schema_version: 1,
    artifact_type: 'mpzis',
    id,
    revision: 1,
    mustahik_id: mustahikId,
    application_id: 1,
    template_code: 'MPZIS_P0',
    template_version: '1',
    source: 'p0',
    accepted_assessment_id: assessment.json.id,
    accepted_assessment_revision: assessment.json.revision,
    accepted_assessment_hash: assessment.hash,
    form_number: `FORM-${id}`,
    mpzis_date: '2026-09-22',
    program_classification: 'Tangerang Makmur',
    purpose: 'Modal usaha',
    asnaf: 'Fakir Miskin',
    fund_source: 'Zakat',
    recipient_name: 'Siti',
    recipient_type: 'Individu',
    beneficiary_count: 1,
    total_amount: '100.00',
    address_snapshot: { address: 'Jalan Mawar' },
    marital_status_snapshot: 'Menikah',
    recipient_section_confirmed: true,
    fund_source_confirmed: true,
  });
}

function ppdSnapshot(id, mustahikId, mpzis) {
  return createSnapshot('ppd', {
    schema_version: 1,
    artifact_type: 'ppd',
    id,
    revision: 1,
    mustahik_id: mustahikId,
    application_id: 1,
    template_code: 'PPD_P0',
    template_version: '1',
    source: 'p0',
    approved_mpzis_id: mpzis.json.id,
    approved_mpzis_revision: mpzis.json.revision,
    approved_mpzis_hash: mpzis.hash,
    form_number: mpzis.json.form_number,
    ppd_number: `PPD-${id}`,
    transaction_number: `TX-${id}`,
    purpose: mpzis.json.purpose,
    fund_source: mpzis.json.fund_source,
    fund_source_confirmed: true,
    payment_type: 'Transfer',
    payment_type_confirmed: true,
    bank_name: 'Bank BSI',
    bank_account_ciphertext: 'ciphertext',
    bank_account_last4: '1234',
    bank_account_name: 'Siti',
    requester_name_snapshot: 'Finance',
    requester_role_snapshot: 'staff',
    requester_department_snapshot: 'Keuangan',
    rab_lines: [{ line_no: 1, register_number: 'REG-1', description: 'Bantuan', amount: '100.00' }],
    attachments: [],
  });
}

function paymentSnapshot(id, mustahikId, ppd) {
  return createSnapshot('payment', {
    schema_version: 1,
    artifact_type: 'payment',
    id,
    revision: 1,
    mustahik_id: mustahikId,
    application_id: 1,
    ppd_id: ppd.json.id,
    ppd_revision: ppd.json.revision,
    ppd_hash: ppd.hash,
    transaction_number: ppd.json.transaction_number,
    paid_amount: '100.00',
    paid_at: '2026-09-22T00:00:00Z',
    proof_file_id: 501,
    proof_mime_type: 'application/pdf',
    proof_byte_size: 10,
    proof_sha256: 'b'.repeat(64),
  });
}

function confirmationSnapshot(id, mustahikId, ppd) {
  return createSnapshot('recipient_confirmation', {
    schema_version: 1,
    artifact_type: 'recipient_confirmation',
    id,
    revision: 1,
    mustahik_id: mustahikId,
    application_id: 1,
    ppd_id: ppd.json.id,
    ppd_revision: ppd.json.revision,
    ppd_hash: ppd.hash,
    method: 'Tanda Terima',
    recipient_name_snapshot: 'Siti',
    confirmed_at: '2026-09-22T00:00:00Z',
    note: 'Penerima mengonfirmasi bantuan diterima.',
    evidence_file_id: null,
    evidence_mime_type: null,
    evidence_byte_size: null,
    evidence_sha256: null,
  });
}

function completionSnapshot(mustahikId, assessment, mpzis, ppd, payment, confirmation, financeEventIds = [1030, 1031]) {
  return createSnapshot('completion', {
    schema_version: 1,
    artifact_type: 'completion',
    id: ppd.json.id,
    revision: ppd.json.revision,
    mustahik_id: mustahikId,
    application_id: 1,
    assessment: { id: assessment.json.id, revision: assessment.json.revision, hash: assessment.hash },
    mpzis: { id: mpzis.json.id, revision: mpzis.json.revision, hash: mpzis.hash },
    ppd: { id: ppd.json.id, revision: ppd.json.revision, hash: ppd.hash },
    payment: { id: payment.json.id, revision: payment.json.revision, hash: payment.hash },
    recipient_confirmation: { id: confirmation.json.id, revision: confirmation.json.revision, hash: confirmation.hash },
    finance_event_ids: financeEventIds,
    completion_correlation_id: '00000000-0000-0000-0000-000000000001',
  });
}

async function ensureUser(db, id, name, role = 'staff', level = 'staff', division = 'Penyaluran', isActive = true) {
  const existing = await db.get('SELECT id FROM users WHERE id = $1', [id]);
  if (!existing) {
    await db.run(
      'INSERT INTO users (id, name, email, role, level, division, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, name, `${id}@example.test`, role, level, division, isActive],
    );
  }
}

async function insertApproval(db, values, { seedUser = true } = {}) {
  const artifactType = values[1];
  const approvalStep = values[4];
  const action = values[5];
  const actorId = values[7];
  const actorName = values[8];
  if (seedUser) {
    const actorRole = artifactType === 'assessment'
      ? 'penyaluran'
      : (artifactType === 'ppd' && ['finance_check', 'finance_approve'].includes(action) ? 'keuangan' : 'penyaluran');
    const actorLevel = (artifactType === 'mpzis' && ['responsible_acknowledged', 'approved'].includes(approvalStep))
      || (artifactType === 'ppd' && ['finance_approve', 'complete'].includes(action))
      ? 'leader'
      : 'staff';
    const actorDivision = actorRole === 'keuangan' ? 'Keuangan' : 'Penyaluran';
    await ensureUser(
      db,
      actorId,
      actorName,
      actorRole,
      actorLevel,
      actorDivision,
    );
  }
  await db.run(
    `INSERT INTO artifact_approvals
      (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      ...values,
      artifactType === 'assessment' ? 'penyaluran' : (artifactType === 'ppd' && ['finance_check', 'finance_approve'].includes(action) ? 'keuangan' : 'penyaluran'),
      (artifactType === 'mpzis' && ['responsible_acknowledged', 'approved'].includes(approvalStep)) || (artifactType === 'ppd' && ['finance_approve', 'complete'].includes(action)) ? 'leader' : 'staff',
      artifactType === 'ppd' && ['finance_check', 'finance_approve'].includes(action) ? 'Keuangan' : 'Penyaluran',
    ],
  );
}

async function seedCompletePaymentEvidence(db, mustahikId = 50) {
  const assessment = assessmentSnapshot(1001, mustahikId);
  const mpzis = mpzisSnapshot(1002, mustahikId, assessment);
  const ppd = ppdSnapshot(1003, mustahikId, mpzis);
  const payment = paymentSnapshot(1004, mustahikId, ppd);
  const confirmation = confirmationSnapshot(1005, mustahikId, ppd);
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES ($1, 'Penyaluran', 'legacy_reconciliation', 1)", [mustahikId]);
  await db.run(
    "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES ($1, $2, 1, 1, 'accepted', 'p0', $3, $4)",
    [assessment.json.id, mustahikId, JSON.stringify(assessment.json), assessment.hash],
  );
  await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 1010, 'Surveyor']);
  await db.run(
    "INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES ($1, $2, 1, 1, 'approved', 'p0', $3, $4)",
    [mpzis.json.id, mustahikId, JSON.stringify(mpzis.json), mpzis.hash],
  );
  for (const [index, step] of ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'].entries()) {
    await insertApproval(db, [mustahikId, 'mpzis', mpzis.json.id, 1, step, 'approve', mpzis.hash, 1020 + index, `MPZIS ${step}`]);
  }
  await db.run(
    "INSERT INTO ppd (id, mustahik_id, application_id, revision, status, source, mpzis_id, snapshot_json, snapshot_hash, amount, transaction_number) VALUES ($1, $2, 1, 1, 'completed', 'p0', $3, $4, $5, 100, $6)",
    [ppd.json.id, mustahikId, mpzis.json.id, JSON.stringify(ppd.json), ppd.hash, ppd.json.transaction_number],
  );
  await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'finance_check', 'finance_check', ppd.hash, 1030, 'Finance Checker']);
  await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'finance_approve', 'finance_approve', ppd.hash, 1031, 'Finance Approver']);
  await ensureUser(db, 1040, 'Payment Recorder', 'keuangan', 'staff', 'Keuangan');
  await ensureUser(db, 1041, 'Payment Verifier', 'keuangan', 'staff', 'Keuangan');
  await ensureUser(db, 1042, 'Recipient Recorder', 'penyaluran', 'staff', 'Penyaluran');
  await ensureUser(db, 1043, 'Completion Actor', 'penyaluran', 'leader', 'Penyaluran');
  await db.run(
    "INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, recorded_by_id, verification_status, verified_by_id, snapshot_json, snapshot_hash) VALUES ($1, $2, $3, 100, $4, 501, 1040, 'verified', 1041, $5, $6)",
    [payment.json.id, ppd.json.id, ppd.json.transaction_number, payment.json.paid_at, JSON.stringify(payment.json), payment.hash],
  );
  await db.run(
    "INSERT INTO artifact_files (id, mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES (501, $1, 'ppd', $2, 1, 'payment_proof', 'payment-proof.pdf', 'application/pdf', 10, $3, 1040)",
    [mustahikId, ppd.json.id, 'b'.repeat(64)],
  );
  await db.run(
    "INSERT INTO recipient_confirmations (id, ppd_id, method, recipient_name_snapshot, confirmed_at, note, recorded_by_id, snapshot_json, snapshot_hash) VALUES ($1, $2, $3, $4, $5, $6, 1042, $7, $8)",
    [confirmation.json.id, ppd.json.id, confirmation.json.method, confirmation.json.recipient_name_snapshot, confirmation.json.confirmed_at, confirmation.json.note, JSON.stringify(confirmation.json), confirmation.hash],
  );
  await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'complete', 'complete', ppd.hash, 1043, 'Completion Actor']);
  const financeRows = await db.all(
    "SELECT id FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1 AND action IN ('finance_check','finance_approve') ORDER BY id ASC",
    [ppd.json.id],
  );
  const completion = completionSnapshot(mustahikId, assessment, mpzis, ppd, payment, confirmation, financeRows.map((row) => Number(row.id)));
  await db.run(
    "UPDATE artifact_approvals SET completion_hash=$1, completion_snapshot_json=$2 WHERE artifact_type='ppd' AND artifact_id=$3 AND action='complete'",
    [completion.hash, JSON.stringify(completion.json), ppd.json.id],
  );
  return { assessment, mpzis, ppd, payment, confirmation };
}

async function makeRequest(baseUrl, method, routePath, { token, body, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  const init = { method, headers: reqHeaders };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else if (typeof body === 'object') {
      reqHeaders['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else {
      init.body = body;
    }
  }
  const response = await fetch(`${baseUrl}${routePath}`, init);
  let json = null;
  const text = await response.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, body: json, headers: response.headers };
}

// ==========================================
// 1. UNIT TESTS (BASELINE RED SUITE)
// ==========================================

test('classifies legacy terminal, early, in-flight, and P0 cases without rewriting status', () => {
  assert.equal(classifyLegacyCase({ workflow_mode: 'legacy', status: 'Selesai' }).classification, 'terminal');
  assert.equal(classifyLegacyCase({ workflow_mode: 'legacy', status: 'Ditolak' }).read_only, true);
  assert.equal(classifyLegacyCase({ workflow_mode: 'legacy', status: 'Diajukan' }).can_direct_switch, true);
  assert.equal(classifyLegacyCase({ workflow_mode: 'legacy', status: 'Verifikasi Administrasi' }).can_direct_switch, true);
  assert.equal(classifyLegacyCase({ workflow_mode: 'legacy', status: 'Survey' }).classification, 'in_flight');
  assert.equal(classifyLegacyCase({ workflow_mode: 'p0', status: 'Diajukan' }).classification, 'p0');
});

test('legacy write guard fails closed for P0 cases and cutover mutations', () => {
  assert.throws(
    () => assertLegacyWriteAllowed({ workflow_mode: 'p0', status: 'Survey' }, 'assessment'),
    (error) => error.code === 'LEGACY_WORKFLOW_DISABLED' && error.status === 410,
  );
  assert.throws(
    () => assertLegacyWriteAllowed({ workflow_mode: 'legacy', status: 'Diajukan' }, 'create', { cutoverAt: '2026-09-19T00:00:00Z', now: '2026-09-20T00:00:00Z' }),
    (error) => error.code === 'LEGACY_WORKFLOW_DISABLED' && error.status === 410,
  );
  assert.doesNotThrow(() => assertLegacyWriteAllowed({ workflow_mode: 'p0', status: 'Diajukan' }, 'decision'));
  assert.throws(
    () => assertLegacyWriteAllowed({ workflow_mode: 'p0', status: 'Survey' }, 'decision'),
    (error) => error.code === 'LEGACY_WORKFLOW_DISABLED' && error.status === 410,
  );
  assert.throws(
    () => assertLegacyWriteAllowed({ workflow_mode: 'legacy', status: 'Diajukan', archived_at: '2026-09-20T00:00:00Z' }, 'update'),
    (error) => error.code === 'CASE_ARCHIVED' && error.status === 409,
  );
});

test('P0 enablement requires an explicit true flag and accepts the cutover timestamp separately', () => {
  assert.equal(isPenyaluranP0Enabled({ PENYALURAN_P0_ENABLED: 'false' }), false);
  assert.equal(isPenyaluranP0Enabled({ PENYALURAN_P0_ENABLED: 'true' }), true);
  assert.equal(isPenyaluranP0Enabled({ PENYALURAN_P0_ENABLED: true }), true);
  assert.equal(isPenyaluranP0Enabled({}), false);
  assert.equal(isPenyaluranP0Enabled(undefined), false);

  assert.equal(isP0CutoverActive({ cutoverAt: '2026-09-20T00:00:00Z', now: '2026-09-19T00:00:00Z' }), false);
  assert.equal(isP0CutoverActive({ cutoverAt: '2026-09-19T00:00:00Z', now: '2026-09-20T00:00:00Z' }), true);
  assert.equal(isP0CutoverActive({}), false);
});

// ==========================================
// 2. REPOSITORY & HARD DELETE PROHIBITION
// ==========================================

test('deleteMustahik in repository is permanently disabled with HTTP 405 error', async () => {
  await assert.rejects(
    () => deleteMustahik(1),
    (error) => error.code === 'HARD_DELETE_DISABLED' && error.status === 405,
  );
});

// ==========================================
// 3. AUDITED ARCHIVE & RESTORE (TRANSACTIONAL ATOMICITY)
// ==========================================

test('hard delete is permanently disabled and archive preserves every child', async () => {
  const db = await createP0TestDatabase();
  const id = 1;
  const beforeVersion = (await caseRow(db, id)).workflow_version;
  const approvalCountBefore = await count(db, 'artifact_approvals');
  const fileCountBefore = await count(db, 'artifact_files');

  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const meta = {
    note: 'Arsip duplikat hasil verifikasi administrasi.',
    expected_status: 'draft',
    expected_version: 0,
    idempotency_key: 'archive-preserve-test-1',
  };

  await archiveCase(adminCtx, id, meta);

  assert.equal((await caseRow(db, id)).workflow_version, beforeVersion + 1);
  assert.notEqual((await caseRow(db, id)).archived_at, null);
  assert.equal((await caseRow(db, id)).archived_by_id, 1);
  assert.equal((await caseRow(db, id)).archive_reason, meta.note);
  assert.equal(await count(db, 'artifact_approvals'), approvalCountBefore + 1);
  assert.equal(await count(db, 'artifact_files'), fileCountBefore);
  await db.close();
});

test('archive/restore audit failure and replay are atomic', async () => {
  const db = await createP0TestDatabase();
  const id = 1;
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };
  const meta = {
    note: 'Arsip duplikat hasil verifikasi administrasi.',
    expected_status: 'draft',
    expected_version: 0,
    idempotency_key: 'archive-atomic-test-1',
  };

  // 1. Audit failure causes full rollback
  db.failOn(/INSERT INTO activity_logs/);
  await assert.rejects(archiveCase(adminCtx, id, meta), /audit/);
  assert.equal((await caseRow(db, id)).archived_at, null);
  assert.equal((await caseRow(db, id)).workflow_version, 0);

  // 2. Clear failure and execute successful archive
  db.clearFailure();
  const first = await archiveCase(adminCtx, id, meta);
  assert.deepEqual(await archiveCase(adminCtx, id, meta), { ...first, replayed: true });

  // 3. Restore audit failure causes full rollback
  const restoreMeta = {
    note: 'Pemulihan kasus mustahik setelah verifikasi dokumen.',
    expected_status: 'draft',
    expected_version: 1,
    idempotency_key: 'restore-atomic-test-1',
  };
  db.failOn(/INSERT INTO activity_logs/);
  await assert.rejects(restoreCase(adminCtx, id, restoreMeta), /audit/);
  assert.notEqual((await caseRow(db, id)).archived_at, null);
  assert.equal((await caseRow(db, id)).workflow_version, 1);

  // 4. Clear failure and execute successful restore with replay
  db.clearFailure();
  const restoreFirst = await restoreCase(adminCtx, id, restoreMeta);
  assert.equal((await caseRow(db, id)).archived_at, null);
  assert.equal((await caseRow(db, id)).workflow_version, 2);
  assert.deepEqual(await restoreCase(adminCtx, id, restoreMeta), { ...restoreFirst, replayed: true });

  await db.close();
});

test('archive and restore validations, access control, and state guards', async () => {
  const db = await createP0TestDatabase();
  const id = 1;

  const staffCtx = {
    actor: { id: 2, name: 'Staff Penyaluran', role: 'penyaluran', level: 'staff', division: 'Penyaluran' },
    db,
  };
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Non-admin rejected
  await assert.rejects(
    () => archiveCase(staffCtx, id, { note: 'Alasan arsip yang valid dan cukup panjang.', expected_status: 'draft', expected_version: 0, idempotency_key: 'key-staff-arch' }),
    (error) => error.code === 'PERMISSION_DENIED' && error.status === 403,
  );
  await assert.rejects(
    () => restoreCase(staffCtx, id, { note: 'Alasan pulih yang valid dan cukup panjang.', expected_status: 'draft', expected_version: 0, idempotency_key: 'key-staff-rest' }),
    (error) => error.code === 'PERMISSION_DENIED' && error.status === 403,
  );

  // Reason too short (< 20 chars)
  await assert.rejects(
    () => archiveCase(adminCtx, id, { note: 'Terlalu pendek', expected_status: 'draft', expected_version: 0, idempotency_key: 'key-short' }),
    (error) => error.code === 'VALIDATION_FAILED' && error.status === 422,
  );

  // Reason too long (> 1000 chars)
  await assert.rejects(
    () => archiveCase(adminCtx, id, { note: 'A'.repeat(1001), expected_status: 'draft', expected_version: 0, idempotency_key: 'key-long' }),
    (error) => error.code === 'VALIDATION_FAILED' && error.status === 422,
  );

  // Restoring an active (non-archived) case throws 409 WRONG_STATE
  await assert.rejects(
    () => restoreCase(adminCtx, id, { note: 'Mencoba memulihkan kasus yang aktif.', expected_status: 'draft', expected_version: 0, idempotency_key: 'key-active-rest' }),
    (error) => error.code === 'WRONG_STATE' && error.status === 409,
  );

  // Expected version mismatch throws 409 STALE_STATE
  await assert.rejects(
    () => archiveCase(adminCtx, id, { note: 'Alasan arsip yang valid dan cukup panjang.', expected_status: 'draft', expected_version: 99, idempotency_key: 'key-stale-ver' }),
    (error) => error.code === 'STALE_STATE' && error.status === 409,
  );

  // Valid archive
  await archiveCase(adminCtx, id, {
    note: 'Pengarsipan mustahik karena duplikasi data NIK.',
    expected_status: 'draft',
    expected_version: 0,
    idempotency_key: 'key-validation-test',
  });

  // Re-archiving already archived case throws 409 WRONG_STATE
  await assert.rejects(
    () => archiveCase(adminCtx, id, { note: 'Alasan arsip kedua yang valid panjangnya.', expected_status: 'draft', expected_version: 1, idempotency_key: 'key-rearch' }),
    (error) => error.code === 'WRONG_STATE' && error.status === 409,
  );

  // Reusing idempotency key with different payload throws 409 IDEMPOTENCY_KEY_REUSED
  await assert.rejects(
    () => archiveCase(adminCtx, id, {
      note: 'Alasan arsip dengan payload yang berbeda sekali.',
      expected_status: 'draft',
      expected_version: 0,
      idempotency_key: 'key-validation-test',
    }),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED' && error.status === 409,
  );

  await db.close();
});

test('queue filtering excludes archived mustahik records by default', async () => {
  const db = await createP0TestDatabase();
  await db.run('INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (2, $1, $2, 0)', ['Diajukan', 'p0']);

  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  // Archive case 1
  await archiveCase(adminCtx, 1, {
    note: 'Arsip kasus nomor 1 untuk pengujian antrian.',
    expected_status: 'draft',
    expected_version: 0,
    idempotency_key: 'key-queue-archive-1',
  });

  // listMustahik default excludes archived
  const activeList = await listMustahik({}, db);
  const activeIds = activeList.map((m) => m.id);
  assert.ok(!activeIds.includes(1), 'Archived mustahik 1 must be excluded from default list');
  assert.ok(activeIds.includes(2), 'Active mustahik 2 must be included in default list');

  // listMustahik with include_archived includes all
  const fullList = await listMustahik({ include_archived: true }, db);
  const fullIds = fullList.map((m) => m.id);
  assert.ok(fullIds.includes(1), 'Archived mustahik 1 included when include_archived is true');
  assert.ok(fullIds.includes(2), 'Active mustahik 2 included when include_archived is true');

  // getMustahikStageCounts excludes archived
  const stageCounts = await getMustahikStageCounts(db);
  assert.equal(stageCounts.all, 1, 'Stage counts must exclude archived rows');
  assert.equal(stageCounts.diajukan, 1);

  await db.close();
});

function startServer(expressApp) {
  return new Promise((resolve) => {
    const s = expressApp.listen(0, '127.0.0.1', () => resolve(s));
  });
}

// ==========================================
// 4. HTTP ROUTE INTEGRATION TESTS
// ==========================================

test('HTTP DELETE /api/mustahik/:id returns 405 HARD_DELETE_DISABLED', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Both with admin token and without token return 405
    const res1 = await makeRequest(baseUrl, 'DELETE', '/api/mustahik/1', { token: adminToken });
    assert.equal(res1.status, 405);
    assert.equal(res1.body.code, 'HARD_DELETE_DISABLED');

    const res2 = await makeRequest(baseUrl, 'DELETE', '/api/mustahik/1');
    assert.equal(res2.status, 405);
    assert.equal(res2.body.code, 'HARD_DELETE_DISABLED');

    // Case 1 remains in database
    const row = await caseRow(db, 1);
    assert.ok(row, 'Case must not be deleted');
  } finally {
    server.close();
    await db.close();
  }
});

test('legacy creation and update routes strictly allow-list legacy fields and ignore P0 control fields', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. POST /api/mustahik with attempted P0 control column injection
    const tamperPayload = {
      name: 'Tamper Case',
      program: 'Bantuan Pangan',
      status: 'Diajukan',
      workflow_mode: 'p0',
      workflow_version: 42,
      archived_at: '2026-09-26T00:00:00.000Z',
      archived_by_id: 99,
      archive_reason: 'Malicious pre-archive',
      p0_reconciled_at: '2026-09-26T00:00:00.000Z',
      p0_reconciled_by: 99,
      legacy_status_snapshot: 'Hacked',
    };

    const createRes = await makeRequest(baseUrl, 'POST', '/api/mustahik', {
      token: adminToken,
      body: tamperPayload,
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.success, true);
    const createdId = createRes.body.data.id;

    // Verify row in database: control columns MUST NOT be set from payload!
    const row = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(row.name, 'Tamper Case');
    assert.equal(row.workflow_mode, 'legacy', 'workflow_mode must remain canonical legacy');
    assert.equal(row.workflow_version, 0, 'workflow_version must remain 0');
    assert.equal(row.archived_at, null, 'archived_at must remain null');
    assert.equal(row.archived_by_id, null, 'archived_by_id must remain null');
    assert.equal(row.archive_reason, null, 'archive_reason must remain null');
    assert.equal(row.p0_reconciled_at, null, 'p0_reconciled_at must remain null');
    assert.equal(row.p0_reconciled_by, null, 'p0_reconciled_by must remain null');
    assert.equal(row.legacy_status_snapshot, null, 'legacy_status_snapshot must remain null');

    // 2. PUT /api/mustahik/:id with attempted P0 control column mutation
    const updateRes = await makeRequest(baseUrl, 'PUT', `/api/mustahik/${createdId}`, {
      token: adminToken,
      body: {
        notes: 'Legitimate update',
        workflow_mode: 'p0',
        workflow_version: 77,
        archived_at: '2026-09-26T12:00:00.000Z',
      },
    });
    assert.equal(updateRes.status, 200);

    const updatedRow = await db.get('SELECT * FROM mustahik WHERE id = $1', [createdId]);
    assert.equal(updatedRow.notes, 'Legitimate update');
    assert.equal(updatedRow.workflow_mode, 'legacy', 'workflow_mode cannot be mutated via legacy update');
    assert.equal(updatedRow.workflow_version, 0, 'workflow_version cannot be mutated via legacy update');
    assert.equal(updatedRow.archived_at, null, 'archived_at cannot be mutated via legacy update');
  } finally {
    server.close();
    await db.close();
  }
});

test('canonical and alias archive/restore require reason, expected_status, expected_version, and idempotency_key', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const requiredControls = [
      ['reason', 422],
      ['expected_status', 400],
      ['expected_version', 400],
      ['idempotency_key', 400],
    ];

    for (const endpoint of [
      '/api/admin/penyaluran/mustahik/1/archive',
      '/api/mustahik/1/archive',
    ]) {
      for (const [missing, expectedStatus] of requiredControls) {
        const body = {
          reason: 'Alasan pengarsipan yang valid dan dapat diaudit.',
          expected_status: 'draft',
          expected_version: 0,
          idempotency_key: `archive-required-${missing}-${endpoint.includes('admin') ? 'admin' : 'alias'}`,
        };
        delete body[missing];
        const result = await makeRequest(baseUrl, 'POST', endpoint, {
          token: adminToken,
          body,
        });
        assert.equal(result.status, expectedStatus, `Endpoint ${endpoint} missing ${missing} must return ${expectedStatus}, got ${result.status}`);
        assert.equal((await caseRow(db, 1)).workflow_version, 0);
      }
    }
  } finally {
    server.close();
    await db.close();
  }
});

test('HTTP POST /api/mustahik/:id/archive and restore endpoints succeed for admin', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Non-admin rejected with 403
    const staffRes = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/archive', {
      token: staffToken,
      body: {
        reason: 'Alasan arsip yang valid dan cukup panjang.',
        expected_status: 'draft',
        expected_version: 0,
        idempotency_key: 'key-http-staff-arch',
      },
    });
    assert.equal(staffRes.status, 403);

    // Admin archive succeeds on canonical route
    const archiveRes = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/archive', {
      token: adminToken,
      body: {
        reason: 'Arsip kasus duplikasi berkas administrasi.',
        expected_status: 'draft',
        expected_version: 0,
        idempotency_key: 'key-http-admin-arch',
      },
    });
    assert.equal(archiveRes.status, 200);
    assert.equal(archiveRes.body.success, true);
    assert.equal(archiveRes.body.data.archived, true);
    assert.equal(archiveRes.body.data.workflow_version, 1);

    // Admin restore succeeds on alias route
    const restoreRes = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/restore', {
      token: adminToken,
      body: {
        reason: 'Pemulihan kasus mustahik setelah verifikasi NIK.',
        expected_status: 'draft',
        expected_version: 1,
        idempotency_key: 'key-http-admin-rest',
      },
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.body.success, true);
    assert.equal(restoreRes.body.data.archived, false);
    assert.equal(restoreRes.body.data.workflow_version, 2);
  } finally {
    server.close();
    await db.close();
  }
});

test('legacy write endpoints return 410 for P0 cases', async () => {
  const db = await createP0TestDatabase();
  // Ensure case 1 is in Survey stage and p0 workflow
  await db.run("UPDATE mustahik SET status = 'Survey', workflow_mode = 'p0' WHERE id = 1");

  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const mutatingPaths = [
      '/assessment',
      '/assessments',
      '/mpzis',
      '/ppd',
      '/decision',
      '/documents',
      '/whatsapp',
    ];

    for (const subpath of mutatingPaths) {
      const res = await makeRequest(baseUrl, 'POST', `/api/mustahik/1${subpath}`, {
        token: adminToken,
        body: { notes: 'Pengujian mutasi legacy' },
      });
      assert.equal(
        res.status,
        410,
        `Expected 410 for P0 case on /api/mustahik/1${subpath}, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
      assert.equal(res.body.code, 'LEGACY_WORKFLOW_DISABLED');
    }

    // PUT /api/mustahik/1 also returns 410
    const putRes = await makeRequest(baseUrl, 'PUT', '/api/mustahik/1', {
      token: adminToken,
      body: { name: 'Pembaruan Nama' },
    });
    assert.equal(putRes.status, 410);
    assert.equal(putRes.body.code, 'LEGACY_WORKFLOW_DISABLED');
  } finally {
    server.close();
    await db.close();
  }
});

test('early decision on Diajukan status is allowed before artifact gates', async () => {
  const db = await createP0TestDatabase();
  // Case 1 in Diajukan status
  await db.run("UPDATE mustahik SET status = 'Diajukan', workflow_mode = 'p0' WHERE id = 1");

  app.locals.db = db;
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await makeRequest(baseUrl, 'POST', '/api/mustahik/1/decision', {
      token: staffToken,
      body: {
        action: 'approve',
        target_status: 'Verifikasi Administrasi',
        notes: 'Persetujuan tahap awal administrasi',
      },
    });
    // Should NOT be 410 (it may be 200 or business logic result, definitely not 410 LEGACY_WORKFLOW_DISABLED)
    assert.notEqual(res.status, 410, 'Early decision on Diajukan must not be blocked by legacy write guard');
  } finally {
    server.close();
    await db.close();
  }
});

test('global cutover freeze blocks creation, import, and upload with zero side effects', async () => {
  const db = await createP0TestDatabase();
  app.locals.db = db;

  const previousCutover = process.env.PENYALURAN_P0_CUTOVER_AT;
  // Activate cutover in the past
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';

  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const uploadsDir = path.resolve(rootDir, 'uploads');
  const filesBefore = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];

  try {
    // 1. POST /api/mustahik blocked with 410
    const createRes = await makeRequest(baseUrl, 'POST', '/api/mustahik', {
      token: adminToken,
      body: { name: 'Mustahik Baru' },
    });
    assert.equal(createRes.status, 410);
    assert.equal(createRes.body.code, 'LEGACY_WORKFLOW_DISABLED');

    // 2. POST /api/mustahik/import blocked with 410
    const importRes = await makeRequest(baseUrl, 'POST', '/api/mustahik/import', {
      token: adminToken,
      body: { items: [{ name: 'Import 1' }, { name: 'Import 2' }] },
    });
    assert.equal(importRes.status, 410);
    assert.equal(importRes.body.code, 'LEGACY_WORKFLOW_DISABLED');

    // 3. POST /api/upload blocked with 410 BEFORE multer
    const formData = new FormData();
    const blob = new Blob(['sample pdf content bytes'], { type: 'application/pdf' });
    formData.append('file', blob, 'sample_test_cutover.pdf');

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
      body: formData,
    });
    assert.equal(uploadRes.status, 410);
    const uploadBody = await uploadRes.json();
    assert.equal(uploadBody.code, 'LEGACY_WORKFLOW_DISABLED');

    // 4. POST /api/public/pengajuan blocked with 503 P0_PUBLIC_INTAKE_UNAVAILABLE BEFORE multer
    let publicRepoCalls = 0;
    const originalCreatePublicApp = app.locals.dataAccessRepository.createPublicApplication;
    app.locals.dataAccessRepository.createPublicApplication = async (...args) => {
      publicRepoCalls++;
      return originalCreatePublicApp.apply(app.locals.dataAccessRepository, args);
    };

    const publicFormData = new FormData();
    const publicBlob = new Blob(['sample public application document bytes'], { type: 'application/pdf' });
    publicFormData.append('ktp', publicBlob, 'sample_ktp.pdf');
    publicFormData.append('name', 'Budi Santoso');
    publicFormData.append('nik', '3671012345670001');

    const publicRes = await fetch(`${baseUrl}/api/public/pengajuan`, {
      method: 'POST',
      body: publicFormData,
    });
    assert.equal(publicRes.status, 503);
    const publicBody = await publicRes.json();
    assert.equal(publicBody.code, 'P0_PUBLIC_INTAKE_UNAVAILABLE');
    assert.equal(publicRepoCalls, 0, 'Repository createPublicApplication must not be called during cutover');

    // Zero files added to uploads directory
    const filesAfter = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    assert.equal(filesAfter.length, filesBefore.length, 'No temporary or final files written to uploads directory');

    // 5. Pre-cutover: when cutover is disabled, public intake proceeds normally
    process.env.PENYALURAN_P0_CUTOVER_AT = '';
    app.locals.dataAccessRepository.createPublicApplication = async () => ({
      id: 9999,
      file_no: 'MST-PUBLIC-001',
      status: 'Diajukan',
      name: 'Budi Santoso',
    });

    const preCutoverRes = await fetch(`${baseUrl}/api/public/pengajuan`, {
      method: 'POST',
      body: publicFormData,
    });
    assert.equal(preCutoverRes.status, 201);
    const preCutoverBody = await preCutoverRes.json();
    assert.equal(preCutoverBody.success, true);
    assert.equal(preCutoverBody.data.id, 9999);
    app.locals.dataAccessRepository.createPublicApplication = originalCreatePublicApp;
  } finally {
    process.env.PENYALURAN_P0_CUTOVER_AT = previousCutover;
    server.close();
    await db.close();
  }
});

test('Telegram write handlers fail closed at active cutover before parse, AI, DB, or file side effects', async () => {
  const previousCutover = process.env.PENYALURAN_P0_CUTOVER_AT;
  process.env.PENYALURAN_P0_CUTOVER_AT = '2026-09-01T00:00:00Z';

  const {
    assertTelegramWriteAllowed,
    handleSurveyText,
    handleMpzisText,
    handlePpdText,
    upsertMustahikFromSurvey,
  } = await import('./bot.js');

  try {
    // Direct guard assertion must throw LEGACY_WORKFLOW_DISABLED (410)
    assert.throws(
      () => assertTelegramWriteAllowed('survey'),
      (err) => err.code === 'LEGACY_WORKFLOW_DISABLED' && err.status === 410,
    );

    // Direct helper entries must reject before parsing, DB, AI, or file writes
    await assert.rejects(
      () => handleSurveyText(12345, 'nama=Budi nik=123', 1),
      (err) => err.code === 'LEGACY_WORKFLOW_DISABLED' && err.status === 410,
    );

    await assert.rejects(
      () => handleMpzisText(12345, 'no_berkas=MST-1 nominal=1000', 1),
      (err) => err.code === 'LEGACY_WORKFLOW_DISABLED' && err.status === 410,
    );

    await assert.rejects(
      () => handlePpdText(12345, 'no_berkas=MST-1 nominal=1000', 1),
      (err) => err.code === 'LEGACY_WORKFLOW_DISABLED' && err.status === 410,
    );

    await assert.rejects(
      () => upsertMustahikFromSurvey({ name: 'Budi' }),
      (err) => err.code === 'LEGACY_WORKFLOW_DISABLED' && err.status === 410,
    );
  } finally {
    process.env.PENYALURAN_P0_CUTOVER_AT = previousCutover;
  }
});

// ==========================================
// 5. RECONCILIATION LIFECYCLE & EVIDENCE GATES
// ==========================================

test('reconciliation start and complete enforce mandatory controls and concurrency guards', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  await db.run("UPDATE mustahik SET status = 'Survey', workflow_mode = 'legacy', workflow_version = 0 WHERE id = 1");

  // Missing controls on beginLegacyReconciliation
  const requiredControls = [
    ['reason', 422],
    ['expected_status', 400],
    ['expected_version', 400],
    ['idempotency_key', 400],
  ];

  for (const [missing, expectedCode] of requiredControls) {
    const meta = {
      reason: 'Alasan rekonsiliasi yang valid dan cukup panjang untuk diaudit.',
      expected_status: 'Survey',
      expected_version: 0,
      idempotency_key: `reconcile-start-${missing}`,
    };
    delete meta[missing];
    await assert.rejects(
      () => beginLegacyReconciliation(adminCtx, 1, meta, meta),
      (err) => err.status === expectedCode,
      `Expected ${missing} to fail with ${expectedCode}`,
    );
  }

  // Stale expected_status on begin
  await assert.rejects(
    () => beginLegacyReconciliation(adminCtx, 1, {
      reason: 'Alasan rekonsiliasi yang valid dan cukup panjang.',
      expected_status: 'Diajukan',
      expected_version: 0,
      idempotency_key: 'stale-status-start',
    }),
    (err) => err.code === 'STALE_STATE' && err.status === 409,
  );

  // Stale expected_version on begin
  await assert.rejects(
    () => beginLegacyReconciliation(adminCtx, 1, {
      reason: 'Alasan rekonsiliasi yang valid dan cukup panjang.',
      expected_status: 'Survey',
      expected_version: 5,
      idempotency_key: 'stale-version-start',
    }),
    (err) => err.code === 'STALE_STATE' && err.status === 409,
  );

  // Valid begin reconciliation
  const startResult = await beginLegacyReconciliation(adminCtx, 1, {
    reason: 'Memulai proses rekonsiliasi kasus survey yang valid.',
    expected_status: 'Survey',
    expected_version: 0,
    idempotency_key: 'valid-reconcile-start-1',
  });
  assert.equal(startResult.success, true);
  assert.equal(startResult.data.workflow_mode, 'legacy_reconciliation');
  assert.equal(startResult.data.legacy_status_snapshot, 'Survey');
  assert.equal(startResult.data.workflow_version, 1);

  // Idempotent replay of begin
  const replayStart = await beginLegacyReconciliation(adminCtx, 1, {
    reason: 'Memulai proses rekonsiliasi kasus survey yang valid.',
    expected_status: 'Survey',
    expected_version: 0,
    idempotency_key: 'valid-reconcile-start-1',
  });
  assert.equal(replayStart.replayed, true);

  // Missing controls on completeLegacyReconciliation
  for (const [missing, expectedCode] of requiredControls) {
    const meta = {
      reason: 'Alasan penyelesaian rekonsiliasi yang valid dan panjang.',
      expected_status: 'Survey',
      expected_version: 1,
      idempotency_key: `reconcile-complete-${missing}`,
    };
    delete meta[missing];
    await assert.rejects(
      () => completeLegacyReconciliation(adminCtx, 1, meta, meta),
      (err) => err.status === expectedCode,
      `Expected ${missing} on complete to fail with ${expectedCode}`,
    );
  }

  // Concurrent modification after begin: mutate current status
  await db.run("UPDATE mustahik SET status = 'MPZIS' WHERE id = 1");
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 1, {
      reason: 'Penyelesaian rekonsiliasi setelah mutasi konkuren.',
      expected_status: 'Survey',
      expected_version: 1,
      idempotency_key: 'concurrent-complete-fail',
    }),
    (err) => err.status === 409,
  );

  // Verify no mode or version mutation occurred
  const currentCase = await db.get('SELECT * FROM mustahik WHERE id = 1');
  assert.equal(currentCase.workflow_mode, 'legacy_reconciliation');
  assert.equal(currentCase.workflow_version, 1);

  await db.close();
});
test('reconciliation evidence matrix requires complete canonical evidence chain per stage', async () => {
  const db = await createP0TestDatabase();
  const adminCtx = {
    actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' },
    db,
  };

  const surveyAssessment = assessmentSnapshot(10, 1);
  const metaComplete = (id, version, key) => ({
    reason: 'Penyelesaian rekonsiliasi dengan verifikasi bukti lengkap.',
    expected_status: 'Survey',
    expected_version: version,
    idempotency_key: key,
  });

  // 1. Survey case without assessment artifact: fails 422
  await db.run("UPDATE mustahik SET status = 'Survey', workflow_mode = 'legacy', workflow_version = 0 WHERE id = 1");
  await beginLegacyReconciliation(adminCtx, 1, {
    reason: 'Mulai rekonsiliasi kasus survey tanpa assessment.',
    expected_status: 'Survey',
    expected_version: 0,
    idempotency_key: 'start-survey-no-ass',
  });

  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 1, metaComplete(1, 1, 'complete-survey-no-ass')),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Add draft assessment (unaccepted): still fails 422
  await db.run(
    "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (10, 1, 1, 1, 'draft', 'p0', $1, $2)",
    [JSON.stringify(surveyAssessment.json), surveyAssessment.hash],
  );
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 1, metaComplete(1, 1, 'complete-survey-draft-ass')),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Mark assessment accepted but without approval actor evidence: fails 422
  await db.run("UPDATE assessments SET status = 'accepted' WHERE id = 10");
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 1, metaComplete(1, 1, 'complete-survey-no-actor')),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Insert valid actor approval for assessment
  await ensureUser(db, 5, 'Surveyor 1', 'penyaluran', 'staff', 'Penyaluran');
  await db.run(
    "INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division) VALUES (1, 'assessment', 10, 1, 'review', 'approve', $1, 5, 'Surveyor 1', 'penyaluran', 'staff', 'Penyaluran')",
    [surveyAssessment.hash],
  );

  // Now completion for Survey succeeds!
  const compSurvey = await completeLegacyReconciliation(adminCtx, 1, metaComplete(1, 1, 'complete-survey-valid'));
  assert.equal(compSurvey.success, true);
  assert.equal(compSurvey.data.workflow_mode, 'p0');
  assert.equal(compSurvey.data.workflow_version, 2);

  // 2. MPZIS stage case
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (20, 'Persetujuan MPZIS', 'legacy', 0)");
  await beginLegacyReconciliation(adminCtx, 20, {
    reason: 'Mulai rekonsiliasi kasus MPZIS untuk verifikasi bukti bertahap.',
    expected_status: 'Persetujuan MPZIS',
    expected_version: 0,
    idempotency_key: 'start-mpzis-stage-1',
  });

  // Reconcile complete fails without MPZIS artifact
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 20, {
      reason: 'Selesai rekonsiliasi MPZIS tanpa artefak MPZIS.',
      expected_status: 'Persetujuan MPZIS',
      expected_version: 1,
      idempotency_key: 'comp-mpzis-no-art',
    }),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Insert assessment for case 20
  const mpzisAssessment = assessmentSnapshot(200, 20);
  await db.run(
    "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (200, 20, 1, 1, 'accepted', 'p0', $1, $2)",
    [JSON.stringify(mpzisAssessment.json), mpzisAssessment.hash],
  );
  await db.run(
    "INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division) VALUES (20, 'assessment', 200, 1, 'review', 'approve', $1, 5, 'Surveyor 1', 'penyaluran', 'staff', 'Penyaluran')",
    [mpzisAssessment.hash],
  );

  // Insert MPZIS with 4 approval steps (missing 'approved')
  const matrixMpzis = mpzisSnapshot(201, 20, mpzisAssessment);
  await db.run(
    "INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (201, 20, 1, 1, 'submitted', 'p0', $1, $2)",
    [JSON.stringify(matrixMpzis.json), matrixMpzis.hash],
  );
  const steps = ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged'];
  for (let i = 0; i < steps.length; i++) {
    await ensureUser(db, 30 + i, `Actor ${30 + i}`);
    await db.run(
      "INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division) VALUES (20, 'mpzis', 201, 1, $1, 'approve', $2, $3, $4, 'staff', 'staff', 'Penyaluran')",
      [steps[i], matrixMpzis.hash, 30 + i, `Actor ${30 + i}`],
    );
  }

  // Fails because 5th step missing
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 20, {
      reason: 'Selesai rekonsiliasi MPZIS dengan 4 persetujuan.',
      expected_status: 'Persetujuan MPZIS',
      expected_version: 1,
      idempotency_key: 'comp-mpzis-4-steps',
    }),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Add 5th step with duplicated actor: fails
  await ensureUser(db, 34, 'Actor 34');
  const dupApproval = await db.query(
    "INSERT INTO artifact_approvals (mustahik_id, artifact_type, artifact_id, artifact_revision, approval_step, action, snapshot_hash, actor_id, actor_name, actor_role, actor_level, actor_division) VALUES (20, 'mpzis', 201, 1, 'approved', 'approve', $1, 30, 'Actor 30', 'staff', 'staff', 'Penyaluran') RETURNING id",
    [matrixMpzis.hash],
  );
  await assert.rejects(
    () => completeLegacyReconciliation(adminCtx, 20, {
      reason: 'Selesai rekonsiliasi MPZIS dengan aktor duplikat.',
      expected_status: 'Persetujuan MPZIS',
      expected_version: 1,
      idempotency_key: 'comp-mpzis-dup-actor',
    }),
    (err) => err.status === 422 && err.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE',
  );

  // Fix 5th step with distinct actor
  await db.run(
    "UPDATE artifact_approvals SET actor_id = 34, actor_name = 'Actor 34' WHERE id = $1",
    [dupApproval.rows[0].id],
  );

  // MPZIS completion now succeeds!
  const compMpzis = await completeLegacyReconciliation(adminCtx, 20, {
    reason: 'Selesai rekonsiliasi MPZIS dengan 5 persetujuan lengkap dan unik.',
    expected_status: 'Persetujuan MPZIS',
    expected_version: 1,
    idempotency_key: 'comp-mpzis-success',
  });
  assert.equal(compMpzis.success, true);
  assert.equal(compMpzis.data.workflow_mode, 'p0');

  // 3. Early case (Diajukan) -> direct switch to p0 on start
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (2, 'Diajukan', 'legacy', 0)");
  const earlyResult = await beginLegacyReconciliation(adminCtx, 2, {
    reason: 'Direct switch kasus diajukan dengan audit event.',
    expected_status: 'Diajukan',
    expected_version: 0,
    idempotency_key: 'early-start-valid',
  });
  assert.equal(earlyResult.data.workflow_mode, 'p0');
  assert.equal(earlyResult.data.workflow_version, 1);

  // 4. Terminal case (Selesai) -> rejected with 409
  await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (3, 'Selesai', 'legacy', 0)");
  await assert.rejects(
    () => beginLegacyReconciliation(adminCtx, 3, {
      reason: 'Mencoba rekonsiliasi kasus selesai terminal.',
      expected_status: 'Selesai',
      expected_version: 0,
      idempotency_key: 'terminal-start-fail',
    }),
    (error) => error.code === 'TERMINAL_CASE_IMMUTABLE' && error.status === 409,
  );

  // 5. Artifact step recovery override
  const recoveryPpd = createSnapshot('ppd', {
    schema_version: 1,
    artifact_type: 'ppd',
    id: 10,
    revision: 1,
    mustahik_id: 1,
    application_id: null,
    template_code: 'PPD_P0',
    template_version: '1',
    source: 'p0',
  });
  const ppdHash = recoveryPpd.hash;
  await db.run("INSERT INTO users (id, name, email, role, level, division, is_active) VALUES (50, 'Keuangan Staff', 'keuangan50@baznas.go.id', 'keuangan', 'staff', 'Divisi Keuangan', TRUE)");
  await db.run(
    "INSERT INTO ppd (id, mustahik_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (10, 1, 1, 'submitted', 'p0', $1, $2)",
    [JSON.stringify(recoveryPpd.json), ppdHash],
  );
  const recoveryResult = await recoverArtifactStep(
    adminCtx,
    { artifactType: 'ppd', artifactId: 10, revision: 1, step: 'finance_check' },
    {
      mustahik_id: 1,
      assumed_actor_id: 50,
      expected_snapshot_hash: ppdHash,
      idempotency_key: 'recov-step-ppd-valid',
      reason: 'Override persetujuan darurat oleh admin pusat.',
    },
  );
  assert.equal(recoveryResult.success, true);
  assert.equal(recoveryResult.data.is_admin_override, true);
  assert.equal(recoveryResult.data.snapshot_hash, ppdHash);
  assert.equal(recoveryResult.data.actor_id, 50);

  await db.close();
});

test('HTTP POST /api/admin/penyaluran/mustahik/:id/reconcile endpoints enforce contracts', async () => {
  const server = await startServer(app);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Missing expected_status -> 400
    const resNoStatus = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/reconcile/start', {
      token: adminToken,
      body: {
        reason: 'Alasan rekonsiliasi melalui HTTP yang valid.',
        expected_version: 0,
        idempotency_key: 'http-reconcile-no-status',
      },
    });
    assert.equal(resNoStatus.status, 400);

    // Missing reason (<20 chars) -> 422
    const resShortReason = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/reconcile/start', {
      token: adminToken,
      body: {
        reason: 'Pendek',
        expected_status: 'Survey',
        expected_version: 0,
        idempotency_key: 'http-reconcile-short-reason',
      },
    });
    assert.equal(resShortReason.status, 422);

    // Non-admin token -> 403
    const resForbidden = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/mustahik/1/reconcile/start', {
      token: staffToken,
      body: {
        reason: 'Alasan rekonsiliasi oleh staf tanpa wewenang.',
        expected_status: 'Survey',
        expected_version: 0,
        idempotency_key: 'http-reconcile-staff',
      },
    });
    assert.equal(resForbidden.status, 403);

    // Recovery endpoint non-admin -> 403
    const recovForbidden = await makeRequest(baseUrl, 'POST', '/api/admin/penyaluran/recovery/artifacts/ppd/10/1/steps/finance_check', {
      token: staffToken,
      body: {
        mustahik_id: 1,
        assumed_actor_id: 50,
        expected_snapshot_hash: 'a'.repeat(64),
        idempotency_key: 'http-recov-staff',
        reason: 'Override persetujuan oleh staf tanpa hak akses.',
      },
    });
    assert.equal(recovForbidden.status, 403);
  } finally {
    server.close();
  }
});

test('reconciliation rejects an assessment whose persisted snapshot hash is only a fake 64-hex value', async () => {
  const db = await createP0TestDatabase();
  try {
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (40, 'Survey', 'legacy_reconciliation', 1)");
    await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (401, 40, 1, 1, 'accepted', 'p0', $1, $2)",
      [JSON.stringify({}), 'a'.repeat(64)],
    );
    await insertApproval(db, [40, 'assessment', 401, 1, 'review', 'review', 'a'.repeat(64), 404, 'Surveyor 404']);

    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 40, status: 'Survey' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_ASSESSMENT_HASH'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation rejects evidence actors that are missing, inactive, or mismatched with persisted users', async () => {
  const scenarios = [
    { name: 'missing user', actorId: 460 },
    { name: 'inactive user', actorId: 461, user: [461, 'Inactive Surveyor', 'inactive@example.test', 'surveyor', 'staff', 'Survey', false] },
    { name: 'snapshot mismatch', actorId: 462, user: [462, 'Persisted Name', 'persisted@example.test', 'surveyor', 'leader', 'Survey', true] },
  ];
  for (const scenario of scenarios) {
    const db = await createP0TestDatabase();
    try {
      const mustahikId = 46;
      const assessment = assessmentSnapshot(461, mustahikId);
      await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (46, 'Survey', 'legacy_reconciliation', 1)");
      await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (461, 46, 1, 1, 'accepted', 'p0', $1, $2)",
        [JSON.stringify(assessment.json), assessment.hash],
      );
      if (scenario.user) {
        await db.run(
          'INSERT INTO users (id, name, email, role, level, division, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          scenario.user,
        );
      }
      await insertApproval(db, [mustahikId, 'assessment', 461, 1, 'review', 'review', assessment.hash, scenario.actorId, 'Approval Name'], { seedUser: false });
      await assert.rejects(
        () => validatePersistedEvidence(db, { id: mustahikId, status: 'Survey' }),
        (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
          && error.details?.missing_gates?.includes('INVALID_ASSESSMENT_ACTOR_EVIDENCE'),
        scenario.name,
      );
    } finally {
      await db.close();
    }
  }
});

test('reconciliation requires semantic assessment review action', async () => {
  const db = await createP0TestDatabase();
  try {
    const mustahikId = 47;
    const assessment = assessmentSnapshot(471, mustahikId);
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (47, 'Survey', 'legacy_reconciliation', 1)");
    await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (471, 47, 1, 1, 'accepted', 'p0', $1, $2)",
      [JSON.stringify(assessment.json), assessment.hash],
    );
    await insertApproval(db, [mustahikId, 'assessment', 471, 1, 'review', 'review', assessment.hash, 472, 'Surveyor 472']);
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: mustahikId, status: 'Survey' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_ASSESSMENT_ACTOR_EVIDENCE'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation rejects an assessment reviewer colliding with its creator or submitter', async () => {
  for (const [collision, reviewerId] of [['creator', 4801], ['submitter', 4802]]) {
    const db = await createP0TestDatabase();
    try {
      const mustahikId = collision === 'creator' ? 48 : 49;
      const assessment = assessmentSnapshot(collision === 'creator' ? 4803 : 4903, mustahikId);
      await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES ($1, 'Survey', 'legacy_reconciliation', 1)", [mustahikId]);
      await db.run(
        "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, created_by_id, updated_by_id, snapshot_json, snapshot_hash) VALUES ($1, $2, 1, 1, 'accepted', 'p0', $3, $4, $5, $6)",
        [assessment.json.id, mustahikId, 4801, 4802, JSON.stringify(assessment.json), assessment.hash],
      );
      await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'submit', 'submit', assessment.hash, 4802, 'Assessment Submitter']);
      await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, reviewerId, 'Assessment Reviewer']);

      await assert.rejects(
        () => validatePersistedEvidence(db, { id: mustahikId, status: 'Survey' }),
        (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
          && error.details?.missing_gates?.includes('INVALID_ASSESSMENT_ACTOR_EVIDENCE'),
        collision,
      );
    } finally {
      await db.close();
    }
  }
});

test('reconciliation accepts an assessment reviewer distinct from its creator and submitter', async () => {
  const db = await createP0TestDatabase();
  try {
    const mustahikId = 490;
    const assessment = assessmentSnapshot(4901, mustahikId);
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (490, 'Survey', 'legacy_reconciliation', 1)");
    await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, created_by_id, updated_by_id, snapshot_json, snapshot_hash) VALUES (4901, 490, 1, 1, 'accepted', 'p0', 4902, 4903, $1, $2)",
      [JSON.stringify(assessment.json), assessment.hash],
    );
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'submit', 'submit', assessment.hash, 4903, 'Assessment Submitter']);
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 4904, 'Assessment Reviewer']);

    await assert.doesNotReject(() => validatePersistedEvidence(db, { id: mustahikId, status: 'Survey' }));
  } finally {
    await db.close();
  }
});

test('reconciliation rejects MPZIS approvals that contain every step in the wrong business order', async () => {
  const db = await createP0TestDatabase();
  try {
    const mustahikId = 41;
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (41, 'Persetujuan MPZIS', 'legacy_reconciliation', 1)");
    const assessment = assessmentSnapshot(411, mustahikId);
    await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (411, 41, 1, 1, 'accepted', 'p0', $1, $2)",
      [JSON.stringify(assessment.json), assessment.hash],
    );
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 412, 'Surveyor 412']);
    const mpzis = mpzisSnapshot(413, mustahikId, assessment);
    await db.run(
      "INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (413, 41, 1, 1, 'submitted', 'p0', $1, $2)",
      [JSON.stringify(mpzis.json), mpzis.hash],
    );

    const wrongOrder = ['approved', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged'];
    for (const [index, step] of wrongOrder.entries()) {
      await insertApproval(db, [mustahikId, 'mpzis', mpzis.json.id, 1, step, 'approve', mpzis.hash, 420 + index, `MPZIS ${420 + index}`]);
    }

    await assert.rejects(
      () => validatePersistedEvidence(db, { id: mustahikId, status: 'Persetujuan MPZIS' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('UNORDERED_MPZIS_APPROVALS'),
    );
  } finally {
    await db.close();
  }
});

test('payment-stage reconciliation accepts schema-correct transaction and confirmation evidence', async () => {
  const db = await createP0TestDatabase();
  try {
    const mustahikId = 42;
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (42, 'Penyaluran', 'legacy_reconciliation', 1)");
    const assessment = assessmentSnapshot(421, mustahikId);
    await db.run(
      "INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (421, 42, 1, 1, 'accepted', 'p0', $1, $2)",
      [JSON.stringify(assessment.json), assessment.hash],
    );
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 422, 'Surveyor 422']);
    const mpzis = mpzisSnapshot(423, mustahikId, assessment);
    await db.run(
      "INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (423, 42, 1, 1, 'approved', 'p0', $1, $2)",
      [JSON.stringify(mpzis.json), mpzis.hash],
    );
    for (const [index, step] of ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'].entries()) {
      await insertApproval(db, [mustahikId, 'mpzis', mpzis.json.id, 1, step, 'approve', mpzis.hash, 430 + index, `MPZIS ${430 + index}`]);
    }
    const ppd = ppdSnapshot(424, mustahikId, mpzis);
    await db.run(
      "INSERT INTO ppd (id, mustahik_id, application_id, revision, status, source, mpzis_id, snapshot_json, snapshot_hash, amount, transaction_number) VALUES (424, 42, 1, 1, 'completed', 'p0', 423, $1, $2, 100, $3)",
      [JSON.stringify(ppd.json), ppd.hash, ppd.json.transaction_number],
    );
    await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'finance_check', 'finance_check', ppd.hash, 440, 'Finance Checker']);
    await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'finance_approve', 'finance_approve', ppd.hash, 441, 'Finance Approver']);
    await ensureUser(db, 450, 'Payment Recorder', 'keuangan', 'staff', 'Keuangan');
    await ensureUser(db, 451, 'Payment Verifier', 'keuangan', 'staff', 'Keuangan');
    await ensureUser(db, 452, 'Recipient Recorder', 'penyaluran', 'staff', 'Penyaluran');
    await ensureUser(db, 453, 'Completion Actor', 'penyaluran', 'leader', 'Penyaluran');
    const payment = paymentSnapshot(425, mustahikId, ppd);
    await db.run(
      "INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, proof_file_id, recorded_by_id, verification_status, verified_by_id, snapshot_json, snapshot_hash) VALUES (425, 424, $1, 100, $2, 501, 450, 'verified', 451, $3, $4)",
      [ppd.json.transaction_number, payment.json.paid_at, JSON.stringify(payment.json), payment.hash],
    );
    await db.run(
      "INSERT INTO artifact_files (id, mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES (501, 42, 'ppd', 424, 1, 'payment_proof', 'payment-proof.pdf', 'application/pdf', 10, $1, 450)",
      ['b'.repeat(64)],
    );
    const confirmation = confirmationSnapshot(426, mustahikId, ppd);
    await db.run(
      "INSERT INTO recipient_confirmations (id, ppd_id, method, recipient_name_snapshot, confirmed_at, note, recorded_by_id, snapshot_json, snapshot_hash) VALUES (426, 424, $1, $2, $3, $4, 452, $5, $6)",
      [confirmation.json.method, confirmation.json.recipient_name_snapshot, confirmation.json.confirmed_at, confirmation.json.note, JSON.stringify(confirmation.json), confirmation.hash],
    );
    await insertApproval(db, [mustahikId, 'ppd', ppd.json.id, 1, 'complete', 'complete', ppd.hash, 453, 'Completion Actor']);
    const financeRows = await db.all("SELECT id FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=424 AND action IN ('finance_check','finance_approve') ORDER BY id ASC");
    const completion = completionSnapshot(mustahikId, assessment, mpzis, ppd, payment, confirmation, financeRows.map((row) => Number(row.id)));
    await db.run(
      "UPDATE artifact_approvals SET completion_hash=$1, completion_snapshot_json=$2 WHERE artifact_type='ppd' AND artifact_id=424 AND action='complete'",
      [completion.hash, JSON.stringify(completion.json)],
    );

    await assert.doesNotReject(() => validatePersistedEvidence(db, { id: mustahikId, status: 'Penyaluran' }));
  } finally {
    await db.close();
  }
});

test('reconciliation rejects tampered canonical hashes, stale approval bindings, and payment completion omissions', async () => {
  const cases = [
    {
      name: 'assessment hash',
      gate: 'INVALID_ASSESSMENT_HASH',
      mutate: async (db) => db.run("UPDATE assessments SET snapshot_hash=$1 WHERE id=1001", ['a'.repeat(64)]),
    },
    {
      name: 'mpzis hash',
      gate: 'INVALID_MPZIS_HASH',
      mutate: async (db) => db.run("UPDATE mpzis SET snapshot_hash=$1 WHERE id=1002", ['b'.repeat(64)]),
    },
    {
      name: 'ppd hash',
      gate: 'INVALID_PPD_HASH',
      mutate: async (db) => db.run("UPDATE ppd SET snapshot_hash=$1 WHERE id=1003", ['c'.repeat(64)]),
    },
    {
      name: 'payment hash',
      gate: 'INVALID_PAYMENT_HASH',
      mutate: async (db) => db.run("UPDATE ppd_payments SET snapshot_hash=$1 WHERE id=1004", ['d'.repeat(64)]),
    },
    {
      name: 'recipient confirmation hash',
      gate: 'INVALID_RECIPIENT_CONFIRMATION_HASH',
      mutate: async (db) => db.run("UPDATE recipient_confirmations SET snapshot_hash=$1 WHERE id=1005", ['e'.repeat(64)]),
    },
    {
      name: 'completion approval revision',
      gate: 'INVALID_COMPLETION_EVIDENCE',
      mutate: async (db) => db.run("UPDATE artifact_approvals SET artifact_revision=2 WHERE artifact_type='ppd' AND action='complete'"),
    },
    {
      name: 'payment amount',
      gate: 'INVALID_PAYMENT_AMOUNT',
      mutate: async (db) => db.run("UPDATE ppd_payments SET paid_amount=0 WHERE id=1004"),
    },
    {
      name: 'payment transaction number',
      gate: 'MISSING_PAYMENT_TRANSACTION_NUMBER',
      mutate: async (db) => db.run("UPDATE ppd_payments SET transaction_number='   ' WHERE id=1004"),
    },
    {
      name: 'payment proof',
      gate: 'MISSING_PAYMENT_PROOF_FILE',
      mutate: async (db) => db.run("UPDATE ppd_payments SET proof_file_id=NULL WHERE id=1004"),
    },
    {
      name: 'recipient actor separation',
      gate: 'COLLIDING_OR_MISSING_RECIPIENT_ACTOR',
      mutate: async (db) => db.run("UPDATE recipient_confirmations SET recorded_by_id=1040 WHERE id=1005"),
    },
    {
      name: 'assessment approval hash binding',
      gate: 'INVALID_ASSESSMENT_ACTOR_EVIDENCE',
      mutate: async (db) => db.run("UPDATE artifact_approvals SET snapshot_hash=$1 WHERE artifact_type='assessment'", ['f'.repeat(64)]),
    },
    {
      name: 'draft PPD status',
      gate: 'INVALID_PPD_STATUS',
      mutate: async (db) => db.run("UPDATE ppd SET status='draft' WHERE id=1003"),
    },
    {
      name: 'wrong completion hash',
      gate: 'INVALID_COMPLETION_EVIDENCE',
      mutate: async (db) => db.run("UPDATE artifact_approvals SET completion_hash=$1 WHERE artifact_type='ppd' AND action='complete'", ['1'.repeat(64)]),
    },
    {
      name: 'missing completion snapshot',
      gate: 'INVALID_COMPLETION_EVIDENCE',
      mutate: async (db) => db.run("UPDATE artifact_approvals SET completion_snapshot_json=NULL WHERE artifact_type='ppd' AND action='complete'"),
    },
    {
      name: 'wrong completion PPD binding',
      gate: 'INVALID_COMPLETION_EVIDENCE',
      mutate: async (db) => {
        const row = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
        const snapshot = typeof row.completion_snapshot_json === 'string' ? JSON.parse(row.completion_snapshot_json) : row.completion_snapshot_json;
        snapshot.ppd.hash = '2'.repeat(64);
        await db.run("UPDATE artifact_approvals SET completion_snapshot_json=$1 WHERE artifact_type='ppd' AND action='complete'", [JSON.stringify(snapshot)]);
      },
    },
    {
      name: 'fake finance event ids',
      gate: 'INVALID_COMPLETION_EVIDENCE',
      mutate: async (db) => {
        const row = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
        const snapshot = typeof row.completion_snapshot_json === 'string' ? JSON.parse(row.completion_snapshot_json) : row.completion_snapshot_json;
        snapshot.finance_event_ids = [9998, 9999];
        await db.run("UPDATE artifact_approvals SET completion_snapshot_json=$1 WHERE artifact_type='ppd' AND action='complete'", [JSON.stringify(snapshot)]);
      },
    },
  ];

  for (const scenario of cases) {
    const db = await createP0TestDatabase();
    try {
      await seedCompletePaymentEvidence(db);
      await scenario.mutate(db);
      await assert.rejects(
        () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
        (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
          && error.details?.missing_gates?.includes(scenario.gate),
        scenario.name,
      );
    } finally {
      await db.close();
    }
  }
});

test('reconciliation binds completion application and child revisions to the persisted chain', async () => {
  const scenarios = [
    {
      name: 'completion application binding',
      mutate: async (db) => {
        const row = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
        const snapshot = typeof row.completion_snapshot_json === 'string' ? JSON.parse(row.completion_snapshot_json) : row.completion_snapshot_json;
        snapshot.application_id = 999;
        const rebuilt = createSnapshot('completion', snapshot);
        await db.run("UPDATE artifact_approvals SET completion_hash=$1, completion_snapshot_json=$2 WHERE artifact_type='ppd' AND action='complete'", [rebuilt.hash, JSON.stringify(rebuilt.json)]);
      },
    },
    {
      name: 'completion payment revision binding',
      mutate: async (db) => {
        const row = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
        const snapshot = typeof row.completion_snapshot_json === 'string' ? JSON.parse(row.completion_snapshot_json) : row.completion_snapshot_json;
        snapshot.payment.revision = 2;
        const rebuilt = createSnapshot('completion', snapshot);
        await db.run("UPDATE artifact_approvals SET completion_hash=$1, completion_snapshot_json=$2 WHERE artifact_type='ppd' AND action='complete'", [rebuilt.hash, JSON.stringify(rebuilt.json)]);
      },
    },
  ];
  for (const scenario of scenarios) {
    const db = await createP0TestDatabase();
    try {
      await seedCompletePaymentEvidence(db);
      await scenario.mutate(db);
      await assert.rejects(
        () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
        (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
          && error.details?.missing_gates?.includes('INVALID_COMPLETION_EVIDENCE'),
        scenario.name,
      );
    } finally {
      await db.close();
    }
  }
});

test('payment-stage reconciliation rejects an unacceptable PPD status even when later evidence exists', async () => {
  const db = await createP0TestDatabase();
  try {
    await seedCompletePaymentEvidence(db);
    await db.run("UPDATE ppd SET status='submitted' WHERE id=1003");
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_PPD_STATUS'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation rejects a confirmation snapshot that claims an unpersisted evidence file', async () => {
  const db = await createP0TestDatabase();
  try {
    await seedCompletePaymentEvidence(db);
    const row = await db.get("SELECT snapshot_json FROM recipient_confirmations WHERE id=1005");
    const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
    snapshot.evidence_file_id = 501;
    snapshot.evidence_mime_type = 'application/pdf';
    snapshot.evidence_byte_size = 10;
    snapshot.evidence_sha256 = 'b'.repeat(64);
    const rebuilt = createSnapshot('recipient_confirmation', snapshot);
    await db.run("UPDATE recipient_confirmations SET snapshot_json=$1, snapshot_hash=$2 WHERE id=1005", [JSON.stringify(rebuilt.json), rebuilt.hash]);
    const completionRow = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
    const completion = typeof completionRow.completion_snapshot_json === 'string' ? JSON.parse(completionRow.completion_snapshot_json) : completionRow.completion_snapshot_json;
    completion.recipient_confirmation.hash = rebuilt.hash;
    const rebuiltCompletion = createSnapshot('completion', completion);
    await db.run("UPDATE artifact_approvals SET completion_snapshot_json=$1, completion_hash=$2 WHERE artifact_type='ppd' AND action='complete'", [JSON.stringify(rebuiltCompletion.json), rebuiltCompletion.hash]);
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation verifies payment proof bytes against the stored SHA-256 when an artifact root is supplied', async () => {
  const db = await createP0TestDatabase();
  const artifactRoot = await fs.promises.mkdtemp(path.join(rootDir, '.tmp-reconciliation-proof-'));
  try {
    await seedCompletePaymentEvidence(db);
    const proof = Buffer.from('proof-bytes-for-reconciliation');
    await fs.promises.writeFile(path.join(artifactRoot, 'payment-proof.pdf'), proof);
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }, { artifactRoot }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_PAYMENT_PROOF'),
    );
  } finally {
    await fs.promises.rm(artifactRoot, { recursive: true, force: true });
    await db.close();
  }
});

test('reconciliation verifies recipient confirmation evidence bytes against the stored SHA-256', async () => {
  const db = await createP0TestDatabase();
  const artifactRoot = await fs.promises.mkdtemp(path.join(rootDir, '.tmp-reconciliation-confirmation-'));
  try {
    await seedCompletePaymentEvidence(db);
    await db.run("INSERT INTO artifact_files (id, mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES (502, 50, 'ppd', 1003, 1, 'recipient_confirmation', 'confirmation.pdf', 'application/pdf', 10, $1, 1042)", ['c'.repeat(64)]);
    const confirmationRow = await db.get("SELECT snapshot_json FROM recipient_confirmations WHERE id=1005");
    const confirmation = typeof confirmationRow.snapshot_json === 'string' ? JSON.parse(confirmationRow.snapshot_json) : confirmationRow.snapshot_json;
    confirmation.evidence_file_id = 502;
    confirmation.evidence_mime_type = 'application/pdf';
    confirmation.evidence_byte_size = 10;
    confirmation.evidence_sha256 = 'c'.repeat(64);
    const rebuiltConfirmation = createSnapshot('recipient_confirmation', confirmation);
    await db.run("UPDATE recipient_confirmations SET evidence_file_id=502, snapshot_json=$1, snapshot_hash=$2 WHERE id=1005", [JSON.stringify(rebuiltConfirmation.json), rebuiltConfirmation.hash]);
    const completionRow = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
    const completion = typeof completionRow.completion_snapshot_json === 'string' ? JSON.parse(completionRow.completion_snapshot_json) : completionRow.completion_snapshot_json;
    completion.recipient_confirmation.hash = rebuiltConfirmation.hash;
    const rebuiltCompletion = createSnapshot('completion', completion);
    await db.run("UPDATE artifact_approvals SET completion_snapshot_json=$1, completion_hash=$2 WHERE artifact_type='ppd' AND action='complete'", [JSON.stringify(rebuiltCompletion.json), rebuiltCompletion.hash]);
    await fs.promises.writeFile(path.join(artifactRoot, 'confirmation.pdf'), Buffer.from('different-bytes'));
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }, { artifactRoot }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_RECIPIENT_CONFIRMATION_EVIDENCE'),
    );
  } finally {
    await fs.promises.rm(artifactRoot, { recursive: true, force: true });
    await db.close();
  }
});

test('recovery binds the canonical application id to the persisted artifact row', async () => {
  const db = await createP0TestDatabase();
  try {
    const adminCtx = { actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' }, db };
    await ensureUser(db, 550, 'Recovery Finance Actor', 'keuangan', 'staff', 'Keuangan');
    const assessment = assessmentSnapshot(5501, 50);
    const mpzis = mpzisSnapshot(5502, 50, assessment);
    const ppd = ppdSnapshot(5503, 50, mpzis);
    const altered = createSnapshot('ppd', { ...ppd.json, application_id: 999 });
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (50, 'Pengajuan Dana (FPD)', 'legacy_reconciliation', 1)");
    await db.run("INSERT INTO ppd (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (5503, 50, 1, 1, 'submitted', 'p0', $1, $2)", [JSON.stringify(altered.json), altered.hash]);
    await assert.rejects(
      () => recoverArtifactStep(adminCtx, { artifactType: 'ppd', artifactId: 5503, revision: 1, step: 'finance_check' }, {
        mustahik_id: 50,
        assumed_actor_id: 550,
        expected_snapshot_hash: altered.hash,
        idempotency_key: 'recovery-application-binding',
        reason: 'Recovery application binding must match persisted case evidence.',
      }),
      (error) => error.code === 'ARTIFACT_HASH_TAMPERED',
    );
  } finally {
    await db.close();
  }
});

test('reconciliation separates the completion actor from the reconciliation executor', async () => {
  const db = await createP0TestDatabase();
  try {
    await seedCompletePaymentEvidence(db);
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }, { actorId: 1043 }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('COLLIDING_OR_MISSING_COMPLETION_ACTOR'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation separates MPZIS creator and submitter from all ordered approvers', async () => {
  const db = await createP0TestDatabase();
  try {
    await db.exec('ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER; ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER');
    const mustahikId = 56;
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (56, 'Persetujuan MPZIS', 'legacy_reconciliation', 1)");
    const assessment = assessmentSnapshot(5601, mustahikId);
    await db.run("INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (5601, 56, 1, 1, 'accepted', 'p0', $1, $2)", [JSON.stringify(assessment.json), assessment.hash]);
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 5602, 'Surveyor 5602']);
    const mpzis = mpzisSnapshot(5603, mustahikId, assessment);
    await db.run("INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash, created_by_id, submitted_by_id) VALUES (5603, 56, 1, 1, 'submitted', 'p0', $1, $2, 5604, 5605)", [JSON.stringify(mpzis.json), mpzis.hash]);
    for (const [index, step] of ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'].entries()) {
      await insertApproval(db, [mustahikId, 'mpzis', mpzis.json.id, 1, step, 'approve', mpzis.hash, 5604 + index, `MPZIS ${step}`]);
    }
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: mustahikId, status: 'Persetujuan MPZIS' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('DUPLICATE_OR_INVALID_MPZIS_ACTORS'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation requires completion finance event ids in check-then-approve order', async () => {
  const db = await createP0TestDatabase();
  try {
    await seedCompletePaymentEvidence(db);
    const financeRows = await db.all("SELECT id FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=1003 AND action IN ('finance_check','finance_approve') ORDER BY id ASC");
    const row = await db.get("SELECT completion_snapshot_json FROM artifact_approvals WHERE artifact_type='ppd' AND action='complete'");
    const completion = typeof row.completion_snapshot_json === 'string' ? JSON.parse(row.completion_snapshot_json) : row.completion_snapshot_json;
    completion.finance_event_ids = financeRows.map((item) => Number(item.id)).reverse();
    const rebuilt = createSnapshot('completion', completion);
    await db.run("UPDATE artifact_approvals SET completion_snapshot_json=$1, completion_hash=$2 WHERE artifact_type='ppd' AND action='complete'", [JSON.stringify(rebuilt.json), rebuilt.hash]);
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_COMPLETION_EVIDENCE'),
    );
  } finally {
    await db.close();
  }
});

test('recovery rejects an MPZIS assumed actor that equals the persisted submitter', async () => {
  const db = await createP0TestDatabase();
  try {
    await db.exec('ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER; ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER');
    await ensureUser(db, 5702, 'MPZIS Submitter', 'penyaluran', 'staff', 'Penyaluran');
    const assessment = assessmentSnapshot(5701, 57);
    const mpzis = mpzisSnapshot(5703, 57, assessment);
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (57, 'Persetujuan MPZIS', 'legacy_reconciliation', 1)");
    await db.run("INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash, created_by_id, submitted_by_id) VALUES (5703, 57, 1, 1, 'submitted', 'p0', $1, $2, 5701, 5702)", [JSON.stringify(mpzis.json), mpzis.hash]);
    await assert.rejects(
      () => recoverArtifactStep({ actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' }, db }, { artifactType: 'mpzis', artifactId: 5703, revision: 1, step: 'proposed' }, {
        mustahik_id: 57,
        assumed_actor_id: 5702,
        expected_snapshot_hash: mpzis.hash,
        idempotency_key: 'recovery-mpzis-submitter-collision',
        reason: 'Recovery must reject an assumed actor already persisted as submitter.',
      }),
      (error) => error.code === 'ACTOR_SEPARATION',
    );
  } finally {
    await db.close();
  }
});

test('recovery enforces the existing role, division, and level policy for finance approval', async () => {
  const db = await createP0TestDatabase();
  try {
    await ensureUser(db, 5804, 'Invalid Finance Actor', 'penyaluran', 'staff', 'Penyaluran');
    const assessment = assessmentSnapshot(5801, 58);
    const mpzis = mpzisSnapshot(5802, 58, assessment);
    const ppd = ppdSnapshot(5803, 58, mpzis);
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (58, 'Pengajuan Dana (FPD)', 'legacy_reconciliation', 1)");
    await db.run("INSERT INTO ppd (id, mustahik_id, application_id, revision, status, source, mpzis_id, snapshot_json, snapshot_hash) VALUES (5803, 58, 1, 1, 'finance_checked', 'p0', 5802, $1, $2)", [JSON.stringify(ppd.json), ppd.hash]);
    await assert.rejects(
      () => recoverArtifactStep({ actor: { id: 1, name: 'Admin Pusat', role: 'admin', level: 'admin', division: 'IT' }, db }, { artifactType: 'ppd', artifactId: 5803, revision: 1, step: 'finance_approve' }, {
        mustahik_id: 58,
        assumed_actor_id: 5804,
        expected_snapshot_hash: ppd.hash,
        idempotency_key: 'recovery-invalid-finance-role',
        reason: 'Recovery must enforce finance approval role and level policy.',
      }),
      (error) => ['DIVISION_REQUIRED', 'LEVEL_REQUIRED', 'PERMISSION_DENIED'].includes(error.code),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation rejects a finance actor with a valid snapshot but an ineligible role and division', async () => {
  const db = await createP0TestDatabase();
  try {
    await seedCompletePaymentEvidence(db);
    await db.run("UPDATE users SET role='penyaluran', division='Penyaluran' WHERE id=1030");
    await db.run("UPDATE artifact_approvals SET actor_role='penyaluran', actor_division='Penyaluran' WHERE artifact_type='ppd' AND artifact_id=1003 AND action='finance_check'");
    await assert.rejects(
      () => validatePersistedEvidence(db, { id: 50, status: 'Penyaluran' }),
      (error) => error.code === 'RECONCILIATION_EVIDENCE_INCOMPLETE'
        && error.details?.missing_gates?.includes('INVALID_FINANCE_ACTORS'),
    );
  } finally {
    await db.close();
  }
});

test('reconciliation accepts MPZIS approvals when persisted actors satisfy the role policy', async () => {
  const db = await createP0TestDatabase();
  try {
    await db.exec('ALTER TABLE mpzis ADD COLUMN created_by_id INTEGER; ALTER TABLE mpzis ADD COLUMN submitted_by_id INTEGER');
    const mustahikId = 59;
    await db.run("INSERT INTO mustahik (id, status, workflow_mode, workflow_version) VALUES (59, 'Persetujuan MPZIS', 'legacy_reconciliation', 1)");
    const assessment = assessmentSnapshot(5901, mustahikId);
    await db.run("INSERT INTO assessments (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash) VALUES (5901, 59, 1, 1, 'accepted', 'p0', $1, $2)", [JSON.stringify(assessment.json), assessment.hash]);
    await insertApproval(db, [mustahikId, 'assessment', assessment.json.id, 1, 'review', 'approve', assessment.hash, 5902, 'Assessment Reviewer']);
    await ensureUser(db, 5903, 'MPZIS Creator', 'penyaluran', 'staff', 'Penyaluran');
    await ensureUser(db, 5904, 'MPZIS Submitter', 'penyaluran', 'staff', 'Penyaluran');
    const mpzis = mpzisSnapshot(5905, mustahikId, assessment);
    await db.run("INSERT INTO mpzis (id, mustahik_id, application_id, revision, status, source, snapshot_json, snapshot_hash, created_by_id, submitted_by_id) VALUES (5905, 59, 1, 1, 'submitted', 'p0', $1, $2, 5903, 5904)", [JSON.stringify(mpzis.json), mpzis.hash]);
    const actorSpecs = [
      [5906, 'MPZIS Proposed', 'staff'],
      [5907, 'MPZIS Examined', 'staff'],
      [5908, 'MPZIS Ashnaf', 'staff'],
      [5909, 'MPZIS Responsible', 'leader'],
      [5910, 'MPZIS Approved', 'leader'],
    ];
    for (const [id, name, level] of actorSpecs) {
      await ensureUser(db, id, name, 'penyaluran', level, 'Penyaluran');
    }
    for (const [index, step] of ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'].entries()) {
      await insertApproval(db, [mustahikId, 'mpzis', mpzis.json.id, 1, step, 'approve', mpzis.hash, actorSpecs[index][0], actorSpecs[index][1]]);
    }
    await assert.doesNotReject(() => validatePersistedEvidence(db, { id: mustahikId, status: 'Persetujuan MPZIS' }));
  } finally {
    await db.close();
  }
});

test('startServer rejects enabled P0 with missing or invalid cutover timestamp before database initialization', async () => {
  const previousFlag = process.env.PENYALURAN_P0_ENABLED;
  const previousCutover = process.env.PENYALURAN_P0_CUTOVER_AT;
  try {
    process.env.PENYALURAN_P0_ENABLED = 'true';
    for (const cutover of ['', 'not-a-date']) {
      let initCalled = false;
      process.env.PENYALURAN_P0_CUTOVER_AT = cutover;
      await assert.rejects(
        () => startAppServer(0, {
          initDbFn: async () => { initCalled = true; },
          skipAncillaryStartup: true,
          listenFn: () => { throw new Error('listener must not start'); },
        }),
        (error) => error.code === 'INVALID_P0_CUTOVER_CONFIGURATION',
      );
      assert.equal(initCalled, false);
    }
  } finally {
    if (previousFlag === undefined) delete process.env.PENYALURAN_P0_ENABLED;
    else process.env.PENYALURAN_P0_ENABLED = previousFlag;
    if (previousCutover === undefined) delete process.env.PENYALURAN_P0_CUTOVER_AT;
    else process.env.PENYALURAN_P0_CUTOVER_AT = previousCutover;
  }
});
