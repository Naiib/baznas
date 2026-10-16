function stableStringify(val) {
  if (val === null || typeof val !== "object") return JSON.stringify(val);
  if (Array.isArray(val)) return "[" + val.map(stableStringify).join(",") + "]";
  const keys = Object.keys(val).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(val[k])).join(",") + "}";
}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import express from 'express';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';
import { registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { submitMustahikDecision } from './repository.js';
import { processReceiptJob } from './penyaluran-p0/receipt-jobs.js';
import maskedFixture from './fixtures/penyaluran-p0-masked-case.json' with { type: 'json' };

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.P0_FIELD_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

async function runSyntheticMutation(db, table, sql, params) {
  if (!process.env.P0_PG16_ROUTE_TEST_URL) return db.run(sql, params);
  const client = await db.pool.connect();
  try {
    await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
    return await client.query(sql, params);
  } finally {
    await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ALL`);
    client.release();
  }
}

async function captureFullDatabaseState(db) {
  let tables = [];
  try {
    const rows = await db.all("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    tables = rows.map((r) => r.table_name);
  } catch {
    tables = ['mustahik', 'applications', 'assessments', 'mpzis', 'ppd', 'documents', 'wa_logs', 'approval_decisions', 'activity_logs', 'artifact_approvals', 'artifact_files', 'artifact_access_events', 'ppd_rab_lines', 'ppd_payments', 'recipient_confirmations', 'p0_idempotency_keys', 'mustahik_case_assignments', 'schema_migrations', 'users'];
  }
  const state = {};
  const row_counts = {};
  for (const table of tables) {
    const sortCol = table === 'schema_migrations' ? 'version' : 'id';
    let tRows;
    try {
      tRows = await db.all(`SELECT * FROM "${table}" ORDER BY ${sortCol}`);
    } catch {
      tRows = await db.all(`SELECT * FROM "${table}"`);
    }
    state[table] = tRows;
    row_counts[table] = tRows.length;
  }
  const serialized = stableStringify(state);
  return {
    tables,
    row_counts,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    state,
    serialized,
  };
}

async function captureWorkflowState(db) {
  const full = await captureFullDatabaseState(db);
  return { row_counts: full.row_counts, sha256: full.sha256 };
}

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
    // Ensure approval_decisions table exists for workflow transitions
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
    try {
      await db.exec(statement);
    } catch {}
  }
}

async function setupE2eHarness() {
  const db = await createP0TestDatabase();
  if (!process.env.P0_PG16_ROUTE_TEST_URL) await ensureE2eSchema(db);
  if (process.env.P0_PG16_ROUTE_TEST_URL) {
    const actors = Object.values(maskedFixture.actors);
    for (const actor of actors) {
      await db.run(
        'INSERT INTO users (id, name, email, password_hash, role, level, division, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) ON CONFLICT (id) DO NOTHING',
        [actor.id, actor.name, actor.email, 'synthetic-test-only', actor.role, actor.level, actor.division],
      );
    }
  }
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-e2e-root-'));

  const app = express();
  app.use(express.json());

  let currentActor = null;
  const receiptJobs = [];
  const setActor = (actor) => { currentActor = actor; };

  registerPenyaluranP0Routes(app, {
    db,
    artifactRoot,
    services: { processReceiptJob: (ppdId, deps) => { receiptJobs.push({ ppdId, deps }); } },
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

  const cleanup = async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(artifactRoot, { recursive: true, force: true });
    if (process.env.P0_PG16_ROUTE_TEST_URL) await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await db.close();
  };

  return { db, baseUrl, artifactRoot, setActor, cleanup, receiptJobs };
}

test('PG16 route intake replay is idempotent and rejects a mismatched payload', { skip: !process.env.P0_PG16_ROUTE_TEST_URL }, async (t) => {
  const harness = await setupE2eHarness();
  const { baseUrl, setActor, db, cleanup } = harness;
  const actor = maskedFixture.actors.intake_creator;
  const body = { ...maskedFixture.intake };
  const key = 'pg16-route-intake-replay-001';
  const snapshot = async () => captureFullDatabaseState(db);

  try {
    setActor(actor);
    const baseline = await snapshot();
    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`replay_test:baseline ${JSON.stringify({ row_counts: baseline.row_counts, sha256: baseline.sha256 })}`);
    }
    const send = (payload) => fetch(`${baseUrl}/api/penyaluran/mustahik`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    });
    const first = await send(body);
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    const afterFirst = await snapshot();
    assert.notEqual(afterFirst.sha256, baseline.sha256);
    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`replay_test:after_initial ${JSON.stringify({ row_counts: afterFirst.row_counts, sha256: afterFirst.sha256 })}`);
    }

    const replay = await send(body);
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.deepEqual(replayBody.data, firstBody.data);
    const afterReplay = await snapshot();
    assert.equal(afterReplay.sha256, afterFirst.sha256);
    assert.deepEqual(afterReplay.row_counts, afterFirst.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`replay_test:after_replay ${JSON.stringify({ row_counts: afterReplay.row_counts, sha256: afterReplay.sha256 })}`);
    }

    const mismatch = await send({ ...body, request_title: `${body.request_title} mismatch` });
    assert.equal(mismatch.status, 409);
    const afterMismatch = await snapshot();
    assert.equal(afterMismatch.sha256, afterFirst.sha256);
    assert.deepEqual(afterMismatch.row_counts, afterFirst.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`replay_test:after_mismatch ${JSON.stringify({ row_counts: afterMismatch.row_counts, sha256: afterMismatch.sha256 })}`);
    }
  } finally {
    await cleanup();
  }
});

test('Step 2: Full P0 digital happy path completes from intake to receipt retrieval with masked data', async (t) => {
  const harness = await setupE2eHarness();
  const { baseUrl, setActor, db, artifactRoot, cleanup, receiptJobs } = harness;
  const { actors, intake, assessment: assessmentInput, mpzis: mpzisInput, ppd: ppdInput, payment: paymentInput, confirmation: confirmInput } = maskedFixture;

  try {
    let mustahikId = null;
    const transitions = [];
    const baseline = await captureFullDatabaseState(db);
    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`state:baseline ${JSON.stringify({ row_counts: baseline.row_counts, sha256: baseline.sha256 })}`);
    }

    async function trackStep(stepName, fn) {
      const beforeState = await captureFullDatabaseState(db);
      let statusBefore = null;
      if (mustahikId) {
        try {
          const ws = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
          statusBefore = ws?.case?.status ?? null;
        } catch {}
      }
      if (process.env.P0_PG16_ROUTE_TEST_URL) {
        t.diagnostic(`transition:${stepName}:before ${JSON.stringify({ case_status: statusBefore, row_counts: beforeState.row_counts, sha256: beforeState.sha256 })}`);
      }

      const res = await fn();

      const afterState = await captureFullDatabaseState(db);
      let statusAfter = null;
      if (mustahikId) {
        try {
          const ws = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
          statusAfter = ws?.case?.status ?? null;
        } catch {}
      }
      const deltas = {};
      for (const tbl of afterState.tables) {
        const diff = (afterState.row_counts[tbl] || 0) - (beforeState.row_counts[tbl] || 0);
        if (diff !== 0) deltas[tbl] = diff;
      }
      if (process.env.P0_PG16_ROUTE_TEST_URL) {
        t.diagnostic(`transition:${stepName}:after ${JSON.stringify({ case_status: statusAfter, row_counts: afterState.row_counts, sha256: afterState.sha256, deltas })}`);
      }

      transitions.push({
        step: stepName,
        case_status_before: statusBefore,
        case_status_after: statusAfter,
        before: { row_counts: beforeState.row_counts, sha256: beforeState.sha256 },
        after: { row_counts: afterState.row_counts, sha256: afterState.sha256 },
        row_deltas: deltas,
      });

      return res;
    }

    // 1. Intake: Amil Intake
    setActor(actors.intake_creator);
    const initialCaseCount = Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count);
    const intakeRes = await trackStep('intake', async () => {
      const res = await fetch(`${baseUrl}/api/penyaluran/mustahik`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-intake-001' },
        body: JSON.stringify(intake),
      });
      const clone = res.clone();
      const body = await clone.json();
      mustahikId = body?.data?.id ?? null;
      return res;
    });
    if (intakeRes.status !== 201) {
      console.error('INTAKE STATUS:', intakeRes.status, await intakeRes.text());
    }
    assert.equal(intakeRes.status, 201);
    const intakeBody = await intakeRes.json();
    assert.equal(intakeBody.success, true);
    mustahikId = intakeBody.data.id;
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`state:intake ${JSON.stringify(await captureWorkflowState(db))}`);
    assert.ok(mustahikId > 0);

    const replayResponse = await trackStep('intake_replay', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-intake-001' },
        body: JSON.stringify(intake),
      });
    });
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).data.id, mustahikId);

    const mismatchResponse = await trackStep('intake_mismatch', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-intake-001' },
        body: JSON.stringify({ ...intake, request_title: `${intake.request_title} mismatch` }),
      });
    });
    assert.equal(mismatchResponse.status, 409);
    assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM mustahik')).count), initialCaseCount + 1);

    // Initial workspace check
    const wsRes1 = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`);
    assert.equal(wsRes1.status, 200);
    const ws1 = await wsRes1.json();
    assert.equal(ws1.case.workflow_mode, 'p0');
    assert.equal(ws1.case.status, 'Diajukan');
    assert.equal(ws1.mustahik.name, intake.name);
    assert.equal(ws1.mustahik.asnaf, intake.asnaf);

    // Early generic checks: Diajukan -> Verifikasi Administrasi -> Survey
    await trackStep('admin_verification_approved', async () => {
      return await submitMustahikDecision(mustahikId, {
        action: 'approve',
        target_status: 'Verifikasi Administrasi',
        notes: 'Pemeriksaan berkas administrasi awal',
        expected_status: 'Diajukan',
        expected_version: ws1.case.workflow_version,
      }, actors.intake_creator, db);
    });

    const wsVerif = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    assert.equal(wsVerif.case.status, 'Verifikasi Administrasi');

    await trackStep('survey_approved', async () => {
      return await submitMustahikDecision(mustahikId, {
        action: 'approve',
        target_status: 'Survey',
        notes: 'Lolos verifikasi administrasi, siap survey lapangan',
        expected_status: 'Verifikasi Administrasi',
        expected_version: wsVerif.case.workflow_version,
      }, actors.intake_creator, db);
    });

    const wsSurvey = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    assert.equal(wsSurvey.case.status, 'Survey');
    const vSurvey = wsSurvey.case.workflow_version;

    // 2. Assessment Draft: Amil Intake
    const assDraftRes = await trackStep('assessment_draft_created', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ass-draft-001' },
        body: JSON.stringify({ expected_version: vSurvey }),
      });
    });
    assert.equal(assDraftRes.status, 201);
    const assDraftBody = await assDraftRes.json();
    const assessmentId = assDraftBody.data.id;
    assert.equal(assDraftBody.data.status, 'draft');

    // Save assessment fields
    const assSaveRes = await trackStep('assessment_draft_saved', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assessmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ass-save-001' },
        body: JSON.stringify({ ...assessmentInput, expected_version: vSurvey, expected_revision: 1 }),
      });
    });
    assert.equal(assSaveRes.status, 200);

    // Submit assessment
    const assSubmitRes = await trackStep('assessment_submitted', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ass-submit-001' },
        body: JSON.stringify({ ...assessmentInput, expected_version: vSurvey, expected_revision: 1 }),
      });
    });
    assert.equal(assSubmitRes.status, 200);
    const assSubmitted = await assSubmitRes.json();
    assert.equal(assSubmitted.data.status, 'submitted');
    const assHash = assSubmitted.data.snapshot_hash;
    assert.ok(assHash);

    // Review assessment by distinct reviewer
    setActor(actors.assessment_reviewer);
    const assReviewRes = await trackStep('assessment_accepted', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assessmentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ass-review-001' },
        body: JSON.stringify({ action: 'accept', note: 'Disetujui hasil survey lapangan', expected_version: vSurvey, expected_revision: 1, expected_snapshot_hash: assHash }),
      });
    });
    assert.equal(assReviewRes.status, 200);
    const assReviewed = await assReviewRes.json();
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`state:assessment_accepted ${JSON.stringify(await captureWorkflowState(db))}`);
    assert.equal(assReviewed.data.status, 'accepted');

    // 3. MPZIS: Staf MPZIS
    const wsBeforeMpzis = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    const vMpzis = wsBeforeMpzis.case.workflow_version;

    setActor(actors.mpzis_creator);
    const mpzisDraftRes = await trackStep('mpzis_draft_created', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-mpzis-draft-001' },
        body: JSON.stringify({ expected_version: vMpzis, expected_revision: 1 }),
      });
    });
    assert.equal(mpzisDraftRes.status, 201);
    const mpzisDraft = await mpzisDraftRes.json();
    const mpzisId = mpzisDraft.data.id;

    // Save MPZIS
    const mpzisSaveRes = await trackStep('mpzis_draft_saved', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-mpzis-save-001' },
        body: JSON.stringify({
          ...mpzisInput,
          recipient_section_confirmed: true,
          fund_source_confirmed: true,
          expected_version: vMpzis,
          expected_revision: 1,
        }),
      });
    });
    assert.equal(mpzisSaveRes.status, 200);

    // Submit MPZIS with distinct submitter
    setActor(actors.mpzis_submitter);
    const mpzisSubmitRes = await trackStep('mpzis_submitted', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-mpzis-submit-001' },
        body: JSON.stringify({ expected_version: vMpzis, expected_revision: 1 }),
      });
    });
    const mpzisSubmitBody = await mpzisSubmitRes.json();
    assert.equal(mpzisSubmitRes.status, 200, JSON.stringify(mpzisSubmitBody));
    const mpzisSubmitted = mpzisSubmitBody;
    const mpzisHash = mpzisSubmitted.data.snapshot_hash;

    // Five distinct approvals
    const approvalSteps = [
      { step: 'proposed', actor: actors.mpzis_approver_1 },
      { step: 'examined', actor: actors.mpzis_approver_2 },
      { step: 'ashnaf_verified', actor: actors.mpzis_approver_3 },
      { step: 'responsible_acknowledged', actor: actors.mpzis_approver_4 },
      { step: 'approved', actor: actors.mpzis_approver_5 },
    ];

    for (const { step, actor } of approvalSteps) {
      setActor(actor);
      const res = await trackStep(`mpzis_approval_${step}`, async () => {
        return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisId}/approvals/${step}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `e2e-mpzis-step-${step}` },
          body: JSON.stringify({ action: 'approve', note: `Persetujuan langkah ${step}`, expected_version: vMpzis, expected_revision: 1, expected_snapshot_hash: mpzisHash }),
        });
      });
      assert.equal(res.status, 200, `Step ${step} failed`);
    }

    setActor(actors.mpzis_approver_5);
    const mpzisReplayBody = { action: 'approve', note: 'Persetujuan langkah approved', expected_version: vMpzis, expected_revision: 1, expected_snapshot_hash: mpzisHash };
    const mpzisReplayBefore = await captureFullDatabaseState(db);
    const mpzisReplay = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisId}/approvals/approved`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-mpzis-step-approved' }, body: JSON.stringify(mpzisReplayBody),
    });
    assert.equal(mpzisReplay.status, 200);
    assert.equal((await mpzisReplay.json()).replayed, true);
    const mpzisReplayAfter = await captureFullDatabaseState(db);
    assert.equal(mpzisReplayAfter.sha256, mpzisReplayBefore.sha256);
    assert.deepEqual(mpzisReplayAfter.row_counts, mpzisReplayBefore.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`full_db_replay:mpzis_approval ${JSON.stringify({ status: 200, tables: mpzisReplayAfter.tables.length, before: mpzisReplayBefore.sha256, after: mpzisReplayAfter.sha256, row_counts: mpzisReplayAfter.row_counts })}`);
    const mpzisMismatch = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisId}/approvals/approved`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-mpzis-step-approved' }, body: JSON.stringify({ ...mpzisReplayBody, note: 'Mismatch payload' }),
    });
    assert.equal(mpzisMismatch.status, 409);
    const mpzisMismatchAfter = await captureFullDatabaseState(db);
    assert.equal(mpzisMismatchAfter.sha256, mpzisReplayBefore.sha256);
    assert.deepEqual(mpzisMismatchAfter.row_counts, mpzisReplayBefore.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`full_db_mismatch:mpzis_approval ${JSON.stringify({ status: 409, tables: mpzisMismatchAfter.tables.length, before: mpzisReplayBefore.sha256, after: mpzisMismatchAfter.sha256, row_counts: mpzisMismatchAfter.row_counts })}`);

    // Check workspace after MPZIS approval
    const wsMpzis = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`state:mpzis_approved ${JSON.stringify(await captureWorkflowState(db))}`);
    assert.equal(wsMpzis.mpzis.status, 'approved');
    const vPpd = wsMpzis.case.workflow_version;

    // 4. PPD: Staf PPD
    setActor(actors.ppd_creator);
    const ppdDraftRes = await trackStep('ppd_draft_created', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ppd-draft-001' },
        body: JSON.stringify({ expected_version: vPpd, expected_revision: 1 }),
      });
    });
    const ppdDraftBody = await ppdDraftRes.json();
    assert.equal(ppdDraftRes.status, 201, JSON.stringify(ppdDraftBody));
    const ppdDraft = ppdDraftBody;
    const ppdId = ppdDraft.data.id;

    // Attach supporting document for PPD
    const sampleSha = 'a'.repeat(64);
    const suppDoc = await trackStep('ppd_supporting_doc_attached', async () => {
      return await db.get("INSERT INTO artifact_files (mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, original_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES ($1, 'ppd', $2, 1, 'supporting_document', 'supp-doc.pdf', 'supp-doc.pdf', 'application/pdf', 100, $3, $4) RETURNING *", [mustahikId, ppdId, sampleSha, actors.ppd_creator.id]);
    });

    const ppdPayloadWithAttachment = {
      ...ppdInput,
      attachments: [{
        file_id: suppDoc.id,
        kind: 'supporting_document',
        mime_type: 'application/pdf',
        byte_size: 100,
        sha256: sampleSha,
      }],
      fund_source_confirmed: true,
      payment_type_confirmed: true,
    };

    // Save PPD
    const ppdSaveRes = await trackStep('ppd_draft_saved', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ppd-save-001' },
        body: JSON.stringify({
          ...ppdPayloadWithAttachment,
          expected_version: vPpd,
          expected_revision: 1,
        }),
      });
    });
    assert.equal(ppdSaveRes.status, 200);

    // Submit PPD
    const ppdSubmitRes = await trackStep('ppd_submitted', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-ppd-submit-001' },
        body: JSON.stringify({ ...ppdPayloadWithAttachment, expected_version: vPpd, expected_revision: 1 }),
      });
    });
    assert.equal(ppdSubmitRes.status, 200);
    const ppdSubmitted = await ppdSubmitRes.json();
    const ppdHash = ppdSubmitted.data.snapshot_hash;

    // 5. Finance Check & Approval
    setActor(actors.finance_checker);
    const finCheckRes = await trackStep('ppd_finance_checked', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-fin-check-001' },
        body: JSON.stringify({ note: 'Dokumen dan RAB telah diverifikasi lengkap', expected_version: vPpd, expected_revision: 1 }),
      });
    });
    assert.equal(finCheckRes.status, 200);

    const financeCheckBody = { note: 'Dokumen dan RAB telah diverifikasi lengkap', expected_version: vPpd, expected_revision: 1 };
    const financeReplayBefore = await captureFullDatabaseState(db);
    const financeReplay = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-fin-check-001' }, body: JSON.stringify(financeCheckBody),
    });
    assert.equal(financeReplay.status, 200);
    assert.equal((await financeReplay.json()).replayed, true);
    const financeReplayAfter = await captureFullDatabaseState(db);
    assert.equal(financeReplayAfter.sha256, financeReplayBefore.sha256);
    assert.deepEqual(financeReplayAfter.row_counts, financeReplayBefore.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`full_db_replay:ppd_finance_check ${JSON.stringify({ status: 200, tables: financeReplayAfter.tables.length, before: financeReplayBefore.sha256, after: financeReplayAfter.sha256, row_counts: financeReplayAfter.row_counts })}`);
    const financeMismatch = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-fin-check-001' }, body: JSON.stringify({ ...financeCheckBody, note: 'Mismatch payload' }),
    });
    assert.equal(financeMismatch.status, 409);
    const financeMismatchAfter = await captureFullDatabaseState(db);
    assert.equal(financeMismatchAfter.sha256, financeReplayBefore.sha256);
    assert.deepEqual(financeMismatchAfter.row_counts, financeReplayBefore.row_counts);
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`full_db_mismatch:ppd_finance_check ${JSON.stringify({ status: 409, tables: financeMismatchAfter.tables.length, before: financeReplayBefore.sha256, after: financeMismatchAfter.sha256, row_counts: financeMismatchAfter.row_counts })}`);

    setActor(actors.finance_approver);
    const finApproveRes = await trackStep('ppd_finance_approved', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-fin-approve-001' },
        body: JSON.stringify({ note: 'Disetujui pencairan dana', expected_version: vPpd, expected_revision: 1, expected_snapshot_hash: ppdHash }),
      });
    });
    assert.equal(finApproveRes.status, 200);

    // 6. Payment Record & Verification: Keuangan
    setActor(actors.payment_recorder);
    const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
    const paymentForm = new FormData();
    paymentForm.set('transaction_number', paymentInput.transaction_number);
    paymentForm.set('paid_amount', String(paymentInput.paid_amount));
    paymentForm.set('paid_at', new Date().toISOString());
    paymentForm.set('proof', new Blob([tinyPdf], { type: paymentInput.proof_mime_type }), paymentInput.proof_filename);

    const paymentRes = await trackStep('ppd_payment_recorded', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/payment`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'e2e-payment-001' },
        body: paymentForm,
      });
    });
    assert.equal(paymentRes.status, 201);

    // Distinct payment verifier
    setActor(actors.payment_verifier);
    const verifyRes = await trackStep('ppd_payment_verified', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/payment/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-pay-verify-001' },
        body: JSON.stringify({}),
      });
    });
    assert.equal(verifyRes.status, 200);

    // 7. Recipient Confirmation: Penyaluran field staff
    setActor(actors.recipient_confirmer);
    const confirmPdf = Buffer.from('%PDF-1.4\n2 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
    const confirmForm = new FormData();
    confirmForm.set('method', 'Tatap Muka');
    confirmForm.set('recipient_name_snapshot', confirmInput.recipient_name_snapshot);
    confirmForm.set('confirmed_at', new Date().toISOString());
    confirmForm.set('note', confirmInput.note);
    confirmForm.set('evidence', new Blob([confirmPdf], { type: confirmInput.evidence_mime_type }), confirmInput.evidence_filename);

    const confirmRes = await trackStep('ppd_recipient_confirmed', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/recipient-confirmation`, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'e2e-confirm-001' },
        body: confirmForm,
      });
    });
    assert.equal(confirmRes.status, 201);

    // 8. Completion: Penyaluran Leader
    setActor(actors.mpzis_approver_5); // Penyaluran leader
    const completeRes = await trackStep('ppd_completed', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-complete-001' },
        body: JSON.stringify({}),
      });
    });
    assert.equal(completeRes.status, 200);

    assert.equal(receiptJobs.length, 1);
    await trackStep('receipt_job_processed', async () => {
      const job = receiptJobs.shift();
      assert.equal(job.ppdId, ppdId);
      await processReceiptJob(job.ppdId, job.deps);
      await db.run('INSERT INTO mustahik_case_assignments (mustahik_id, user_id, assignment_role) VALUES ($1, $2, $3)', [mustahikId, actors.mpzis_approver_5.id, 'leader']);
    });

    // 9. Receipt Retrieval
    const receiptRes = await trackStep('receipt_retrieved', async () => {
      return await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/receipt`);
    });
    assert.equal(receiptRes.status, 200);
    assert.equal(receiptRes.headers.get('content-type'), 'application/pdf');
    const receiptBuffer = Buffer.from(await receiptRes.arrayBuffer());
    assert.ok(receiptBuffer.length > 50);
    assert.ok(receiptBuffer.subarray(0, 5).equals(Buffer.from('%PDF-')));

    // Final case workspace verification
    const wsFinal = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    assert.equal(wsFinal.case.status, 'Penyaluran Selesai');
    assert.equal(wsFinal.completion.status, 'completed');
    assert.equal(wsFinal.completion.receipt_status, 'ready');
    if (process.env.P0_PG16_ROUTE_TEST_URL) t.diagnostic(`state:ppd_completed ${JSON.stringify(await captureWorkflowState(db))}`);

    // Verify unbroken hash chain across every transition
    for (let i = 0; i < transitions.length - 1; i++) {
      const cur = transitions[i];
      const next = transitions[i + 1];
      assert.equal(
        cur.after.sha256,
        next.before.sha256,
        `Discontinuity detected between transition [${i}] ${cur.step} and [${i + 1}] ${next.step}: after sha256 ${cur.after.sha256} !== before sha256 ${next.before.sha256}`
      );
    }

    // Persist evidence artifacts
    const finalState = await captureFullDatabaseState(db);
    const evidencePayload = {
      generated_at: new Date().toISOString(),
      test_suite: 'server/penyaluran-p0-e2e.test.js',
      database: process.env.P0_PG16_ROUTE_TEST_URL ? 'postgresql-16-disposable' : 'pg-mem',
      baseline: { row_counts: baseline.row_counts, sha256: baseline.sha256 },
      transitions_count: transitions.length,
      transitions,
      final_state: { row_counts: finalState.row_counts, sha256: finalState.sha256 },
    };
    const evidenceJsonPath = process.env.P0_EVIDENCE_OUTPUT_PATH || path.join(process.cwd(), 'mka24-granular-evidence.json');
    await fs.writeFile(evidenceJsonPath, JSON.stringify(evidencePayload, null, 2), 'utf8');

    let logText = '================================================================================\n';
    logText += 'MKA-24 GRANULAR TRANSITION AUDIT LOG\n';
    logText += `Generated: ${evidencePayload.generated_at}\n`;
    logText += `Database Engine: ${evidencePayload.database}\n`;
    logText += `Baseline SHA-256: ${baseline.sha256}\n`;
    logText += `Total Transitions: ${transitions.length}\n`;
    logText += '================================================================================\n\n';

    transitions.forEach((tr, idx) => {
      const deltaStr = Object.keys(tr.row_deltas).length > 0
        ? Object.entries(tr.row_deltas).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join(', ')
        : '0 delta (identik / tidak ada mutasi)';
      logText += `[Step ${String(idx + 1).padStart(2, '0')}] ${tr.step}\n`;
      logText += `  Status Case:  ${tr.case_status_before || 'null'} -> ${tr.case_status_after || 'null'}\n`;
      logText += `  SHA-256 Pre:  ${tr.before.sha256}\n`;
      logText += `  SHA-256 Post: ${tr.after.sha256} ${tr.before.sha256 === tr.after.sha256 ? '(EQUAL - NO MUTATION)' : '(MUTATED)'}\n`;
      logText += `  Row Deltas:   ${deltaStr}\n\n`;
    });

    logText += '================================================================================\n';
    logText += 'FINAL VERIFICATION:\n';
    logText += `Final SHA-256: ${finalState.sha256}\n`;
    logText += `Final Row Counts: ${JSON.stringify(finalState.row_counts)}\n`;
    logText += '================================================================================\n';

    const evidenceLogPath = process.env.P0_EVIDENCE_LOG_PATH || path.join(process.cwd(), 'mka24-granular-evidence.log');
    await fs.writeFile(evidenceLogPath, logText, 'utf8');

    if (process.env.P0_PG16_ROUTE_TEST_URL) {
      t.diagnostic(`evidence_json_written ${evidenceJsonPath}`);
      t.diagnostic(`evidence_log_written ${evidenceLogPath}`);
    }
  } finally {
    await cleanup();
  }
});

test('Step 3: Negative E2E cases independently block completion without partial mutations', async () => {
  const harness = await setupE2eHarness();
  const { baseUrl, setActor, db, artifactRoot, cleanup } = harness;
  const { actors, intake, assessment: assessmentInput, mpzis: mpzisInput, ppd: ppdInput, payment: paymentInput, confirmation: confirmInput } = maskedFixture;

  try {
    // Drive case up to confirmed state
    setActor(actors.intake_creator);
    const intakeRes = await (await fetch(`${baseUrl}/api/penyaluran/mustahik`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-intake-001' }, body: JSON.stringify(intake) })).json();
    const mustahikId = intakeRes.data.id;

    await submitMustahikDecision(mustahikId, { action: 'approve', target_status: 'Verifikasi Administrasi', notes: 'Verifikasi berkas', expected_status: 'Diajukan', expected_version: 0 }, actors.intake_creator, db);
    await submitMustahikDecision(mustahikId, { action: 'approve', target_status: 'Survey', notes: 'Siap survey', expected_status: 'Verifikasi Administrasi', expected_version: 1 }, actors.intake_creator, db);

    const assDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ass-draft' }, body: JSON.stringify({ expected_version: 2 }) })).json();
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assDraft.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ass-save' }, body: JSON.stringify({ ...assessmentInput, expected_version: 2, expected_revision: 1 }) });
    const assSubmitted = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assDraft.data.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ass-submit' }, body: JSON.stringify({ ...assessmentInput, expected_version: 2, expected_revision: 1 }) })).json();
    const assNegHash = assSubmitted.data.snapshot_hash;

    setActor(actors.assessment_reviewer);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/assessment/${assDraft.data.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ass-review' }, body: JSON.stringify({ action: 'accept', expected_version: 2, expected_revision: 1, expected_snapshot_hash: assNegHash }) });

    const wsNegMpzis = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    const vNegMpzis = wsNegMpzis.case.workflow_version;

    setActor(actors.mpzis_creator);
    const mpzisDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-mpz-draft' }, body: JSON.stringify({ expected_version: vNegMpzis, expected_revision: 1 }) })).json();
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisDraft.data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-mpz-save' }, body: JSON.stringify({ ...mpzisInput, recipient_section_confirmed: true, fund_source_confirmed: true, expected_version: vNegMpzis, expected_revision: 1 }) });
    setActor(actors.mpzis_submitter);
    const mpzisSubmitted = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisDraft.data.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-mpz-submit' }, body: JSON.stringify({ expected_version: vNegMpzis, expected_revision: 1 }) })).json();
    const mpzisHash = mpzisSubmitted.data.snapshot_hash;

    const approvalSteps = [
      { step: 'proposed', actor: actors.mpzis_approver_1 },
      { step: 'examined', actor: actors.mpzis_approver_2 },
      { step: 'ashnaf_verified', actor: actors.mpzis_approver_3 },
      { step: 'responsible_acknowledged', actor: actors.mpzis_approver_4 },
      { step: 'approved', actor: actors.mpzis_approver_5 },
    ];
    for (const { step, actor } of approvalSteps) {
      setActor(actor);
      await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/mpzis/${mpzisDraft.data.id}/approvals/${step}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `e2e-neg-mpz-step-${step}` }, body: JSON.stringify({ action: 'approve', expected_version: vNegMpzis, expected_revision: 1, expected_snapshot_hash: mpzisHash }) });
    }

    const wsNegPpd = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/workspace`)).json();
    const vNegPpd = wsNegPpd.case.workflow_version;

    setActor(actors.ppd_creator);
    const ppdDraft = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ppd-draft' }, body: JSON.stringify({ expected_version: vNegPpd, expected_revision: 1 }) })).json();
    const ppdId = ppdDraft.data.id;
    const sampleSha = 'a'.repeat(64);
    const suppDocNeg = await db.get("INSERT INTO artifact_files (mustahik_id, artifact_type, artifact_id, artifact_revision, kind, stored_name, original_name, mime_type, byte_size, sha256, uploaded_by_id) VALUES ($1, 'ppd', $2, 1, 'supporting_document', 'supp-doc-neg.pdf', 'supp-doc-neg.pdf', 'application/pdf', 100, $3, $4) RETURNING *", [mustahikId, ppdId, sampleSha, actors.ppd_creator.id]);
    const ppdNegPayload = {
      ...ppdInput,
      attachments: [{
        file_id: suppDocNeg.id,
        kind: 'supporting_document',
        mime_type: 'application/pdf',
        byte_size: 100,
        sha256: sampleSha,
      }],
      fund_source_confirmed: true,
      payment_type_confirmed: true,
    };

    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ppd-save' }, body: JSON.stringify({ ...ppdNegPayload, expected_version: vNegPpd, expected_revision: 1 }) });
    const ppdSubmitted = await (await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-ppd-submit' }, body: JSON.stringify({ ...ppdNegPayload, expected_version: vNegPpd, expected_revision: 1 }) })).json();
    const ppdHash = ppdSubmitted.data.snapshot_hash;

    setActor(actors.finance_checker);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-check`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-fin-check' }, body: JSON.stringify({ note: 'Cek PPD ok', expected_version: vNegPpd, expected_revision: 1 }) });

    setActor(actors.finance_approver);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/finance-approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-fin-approve' }, body: JSON.stringify({ note: 'Approve PPD ok', expected_version: vNegPpd, expected_revision: 1, expected_snapshot_hash: ppdHash }) });

    setActor(actors.payment_recorder);
    const tinyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
    const paymentForm = new FormData();
    paymentForm.set('transaction_number', paymentInput.transaction_number);
    paymentForm.set('paid_amount', String(paymentInput.paid_amount));
    paymentForm.set('paid_at', new Date().toISOString());
    paymentForm.set('proof', new Blob([tinyPdf], { type: paymentInput.proof_mime_type }), paymentInput.proof_filename);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/payment`, { method: 'POST', headers: { 'Idempotency-Key': 'e2e-neg-pay-record' }, body: paymentForm });

    setActor(actors.payment_verifier);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'e2e-neg-pay-verify' }, body: JSON.stringify({}) });

    setActor(actors.recipient_confirmer);
    const confirmPdf = Buffer.from('%PDF-1.4\n2 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'ascii');
    const confirmForm = new FormData();
    confirmForm.set('method', 'Tatap Muka');
    confirmForm.set('recipient_name_snapshot', confirmInput.recipient_name_snapshot);
    confirmForm.set('confirmed_at', new Date().toISOString());
    confirmForm.set('note', confirmInput.note);
    confirmForm.set('evidence', new Blob([confirmPdf], { type: confirmInput.evidence_mime_type }), confirmInput.evidence_filename);
    await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/recipient-confirmation`, { method: 'POST', headers: { 'Idempotency-Key': 'e2e-neg-confirm' }, body: confirmForm });

    // Verify snapshot state before negative tests
    const preFailCase = await db.get('SELECT status, workflow_version FROM mustahik WHERE id=$1', [mustahikId]);
    const preFailPpd = await db.get('SELECT status FROM ppd WHERE id=$1', [ppdId]);

    // Negative 1: Wrong amount in payment blocks completion
    await runSyntheticMutation(db, 'ppd_payments', 'UPDATE ppd_payments SET paid_amount=1000 WHERE ppd_id=$1', [ppdId]);
    setActor(actors.mpzis_approver_5);
    const wrongAmountRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(wrongAmountRes.status, 409);
    assert.equal((await db.get('SELECT status FROM mustahik WHERE id=$1', [mustahikId])).status, preFailCase.status);
    await runSyntheticMutation(db, 'ppd_payments', 'UPDATE ppd_payments SET paid_amount=$1 WHERE ppd_id=$2', [paymentInput.paid_amount, ppdId]);

    // Negative 2: Unverified payment blocks completion
    await runSyntheticMutation(db, 'ppd_payments', "UPDATE ppd_payments SET verification_status='pending' WHERE ppd_id=$1", [ppdId]);
    const unverifiedRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(unverifiedRes.status, 409);
    assert.equal((await db.get('SELECT status FROM mustahik WHERE id=$1', [mustahikId])).status, preFailCase.status);
    await runSyntheticMutation(db, 'ppd_payments', "UPDATE ppd_payments SET verification_status='verified' WHERE ppd_id=$1", [ppdId]);

    // Negative 3: Altered proof bytes blocks completion
    const proofFile = await db.get("SELECT id, stored_name FROM artifact_files WHERE kind='payment_proof' AND artifact_id=$1", [ppdId]);
    const proofDiskPath = path.join(artifactRoot, proofFile.stored_name);
    const originalProofBytes = await fs.readFile(proofDiskPath);
    await fs.writeFile(proofDiskPath, Buffer.from('%PDF-1.4\nTAMPERED\n%%EOF\n', 'ascii'));

    const tamperedRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(tamperedRes.status, 409);
    assert.equal((await db.get('SELECT status FROM mustahik WHERE id=$1', [mustahikId])).status, preFailCase.status);
    await fs.writeFile(proofDiskPath, originalProofBytes);

    // Negative 4: Missing recipient confirmation blocks completion
    await runSyntheticMutation(db, 'recipient_confirmations', 'DELETE FROM recipient_confirmations WHERE ppd_id=$1', [ppdId]);
    const missingConfirmRes = await fetch(`${baseUrl}/api/penyaluran/mustahik/${mustahikId}/ppd/${ppdId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(missingConfirmRes.status, 409);
    assert.equal((await db.get('SELECT status FROM mustahik WHERE id=$1', [mustahikId])).status, preFailCase.status);
  } finally {
    await cleanup();
  }
});
