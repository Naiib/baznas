import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTOR_IDS, CHECKPOINTS, assertCanonicalArtifactState, assertStagingTarget, createRunnerRequest, findTargetCase, orchestrateCaseWorkflow, planCheckpoint, readProtectedConfig, runBootstrap, sanitizeRunnerDetails, stagePdf, validateActors } from './m6-uat-bootstrap.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const protectedEnv = 'M6_UAT_STAFF_CASE_NAME="M6 UAT Internal Case A"\nM6_UAT_PPD_REVIEW_CASE_NAME="M6 UAT Internal Case B"\nM6_UAT_DOCUMENT_NAME="synthetic.pdf"';

test('protected config validates required distinct M6 UAT names without displaying values', () => {
  assert.equal(readProtectedConfig(protectedEnv).M6_UAT_DOCUMENT_NAME, 'synthetic.pdf');
  assert.throws(() => readProtectedConfig('M6_UAT_STAFF_CASE_NAME=x'), /M6_UAT_CONFIG_INVALID/);
  assert.throws(() => readProtectedConfig(protectedEnv.replace('M6 UAT Internal Case B', 'M6 UAT Internal Case A')), /M6_UAT_CASE_NAMES_MUST_DIFFER/);
});

test('staging and write guards fail closed outside explicit target or dry-run', () => {
  assert.throws(() => assertStagingTarget({ database: 'production', project: 'm6-staging', socket: 'unix:///run/user/999/docker.sock', allowWrites: true }), /M6_STAGING_TARGET_GUARD_FAILED/);
  assert.throws(() => assertStagingTarget({ database: 'baznas_m6_staging', project: 'm6-staging', socket: 'unix:///run/user/999/docker.sock' }), /M6_BOOTSTRAP_DRY_RUN_ONLY/);
});

test('existing actors require the fixed staging identities and roles', () => {
  const rows = Object.entries(ACTOR_IDS).map(([key, id]) => ({ id, role: id < 12 || id === 16 ? 'penyaluran' : 'keuangan', level: [3, 9, 10, 13].includes(id) ? 'leader' : 'staff', is_active: true }));
  assert.equal(validateActors(rows), true);
  assert.throws(() => validateActors(rows.slice(1)), /M6_UAT_ACTOR_GUARD_FAILED/);
});

test('checkpoint decisions noop completed state and execute incomplete state', () => {
  assert.deepEqual(CHECKPOINTS.map((checkpoint) => planCheckpoint(checkpoint, { complete: true })), CHECKPOINTS.map(() => 'noop'));
  assert.equal(planCheckpoint('ppd', { complete: false }), 'execute');
  assert.throws(() => planCheckpoint('unknown', { complete: false }), /M6_CHECKPOINT_UNKNOWN/);
});

test('case lookup fails closed for duplicate, non-P0, or orphaned records', async () => {
  const dbFor = (rows, application = { id: 9 }) => ({ all: async () => rows, get: async () => application });
  assert.equal(await findTargetCase(dbFor([]), 'case'), null);
  assert.equal((await findTargetCase(dbFor([{ id: 3, status: 'Survey', workflow_mode: 'p0' }]), 'case')).application_id, 9);
  await assert.rejects(findTargetCase(dbFor([{ id: 3 }, { id: 4 }]), 'case'), /M6_DUPLICATE_CASE_DETECTED/);
  await assert.rejects(findTargetCase(dbFor([{ id: 3, workflow_mode: 'legacy' }]), 'case'), /M6_INVALID_CASE_WORKFLOW_MODE/);
  await assert.rejects(findTargetCase(dbFor([{ id: 3, workflow_mode: 'p0' }], null), 'case'), /M6_INVALID_CASE_APPLICATION/);
});

test('canonical read-model state validates revisions, statuses, and persisted hashes', () => {
  assert.equal(assertCanonicalArtifactState({ activeAssessment: { id: 1, revision: 1, status: 'accepted', snapshot_hash: 'a'.repeat(64) } }, 'activeAssessment', ['accepted']).id, 1);
  assert.throws(() => assertCanonicalArtifactState({ activeMpzis: { id: 1, revision: 1, status: 'approved', snapshot_hash: 'bad' } }, 'activeMpzis', ['approved']), /M6_INVALID_CANONICAL_ARTIFACT_HASH/);
  assert.throws(() => assertCanonicalArtifactState({ activePpd: { id: 1, revision: 0, status: 'submitted' } }, 'activePpd', ['submitted']), /M6_INVALID_CANONICAL_ARTIFACT_STATE/);
});

test('dry-run inspects cases without invoking write adapters', async () => {
  const actors = Object.keys(ACTOR_IDS).map((key) => ({ id: ACTOR_IDS[key], role: ACTOR_IDS[key] < 12 || ACTOR_IDS[key] === 16 ? 'penyaluran' : 'keuangan', level: [3, 9, 10, 13].includes(ACTOR_IDS[key]) ? 'leader' : 'staff', is_active: true }));
  const result = await runBootstrap({ envFile: await tempEnv(), adapters: { readActors: async () => actors, readCaseCheckpoint: async () => ({ intake: { complete: true } }) } });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.cases[0].checkpoints[0].action, 'noop');
  await assert.rejects(runBootstrap({ envFile: await tempEnv(), dryRun: false }), /M6_MILESTONE_B_GUARD_REQUIRED/);
});

async function tempEnv() {
  const file = path.join(os.tmpdir(), `m6-uat-${process.pid}.env`);
  await fs.writeFile(file, protectedEnv, { mode: 0o600 });
  return file;
}

test('PDF staging rejects invalid bytes and cleanup removes staged file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'm6-pdf-test-'));
  const bytes = Buffer.from('%PDF-1.4\n%%EOF\n');
  try {
    await assert.rejects(stagePdf({ root, filename: 'bad.pdf', bytes: Buffer.from('not pdf') }), /M6_PDF_INVALID/);
    const staged = await stagePdf({ root, filename: 'doc.pdf', bytes });
    assert.equal((await fs.stat(staged.temp)).isFile(), true);
    await staged.cleanup();
    await assert.rejects(fs.stat(staged.temp));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('workflow orchestration resumes from checkpoints and no-ops completed stages', async () => {
  const actors = Object.fromEntries(Object.values(ACTOR_IDS).map((id) => [id, { id }]));
  const db = {
    all: async () => [{ id: 40, status: 'Survey', workflow_mode: 'p0' }],
    get: async () => ({ id: 41 }),
    run: async () => {},
  };
  const executed = [];
  const result = await orchestrateCaseWorkflow({
    baseUrl: 'http://127.0.0.1:1', setActor() {}, db, artifactRoot: '/unused',
    config: readProtectedConfig(protectedEnv), caseKey: 'staff', caseName: 'M6 UAT Internal Case A', isFullCase: true,
    adapters: {
      actors,
      readWorkspace: async () => ({ case: { id: 40, status: 'Survey', workflow_version: 2 } }),
      readCheckpoint: async ({ step }) => ({ complete: ['assessment', 'mpzis', 'ppd', 'finance', 'payment', 'confirmation', 'completion'].includes(step) }),
      executeCheckpoint: async ({ step }) => executed.push(step),
    },
  });
  assert.equal(result.caseId, 40);
  assert.deepEqual(executed, []);
  assert.ok(result.checkpoints.slice(1).every((checkpoint) => checkpoint.action === 'noop'));
});

test('buildCanonicalAdapters constructs valid checkpoint evaluations and intake payload', async () => {
  const { buildCanonicalAdapters } = await import('./m6-uat-bootstrap.mjs');
  const mockDb = {
    all: async () => Object.values(ACTOR_IDS).map((id) => ({ id, role: id < 12 || id === 16 ? 'penyaluran' : 'keuangan', level: [3, 9, 10, 13].includes(id) ? 'leader' : 'staff', is_active: true })),
    get: async () => null,
  };
  const adapters = await buildCanonicalAdapters({ db: mockDb, artifactRoot: '/unused' });
  assert.equal(typeof adapters.intakePayload, 'function');
  assert.equal(typeof adapters.readCheckpoint, 'function');
  assert.equal(typeof adapters.executeCheckpoint, 'function');

  const intake = await adapters.intakePayload({ M6_UAT_STAFF_CASE_NAME: 'Case Staff', M6_UAT_PPD_REVIEW_CASE_NAME: 'Case PPD' }, 'staff');
  assert.equal(intake.name, 'Case Staff');

  assert.equal((await adapters.readCheckpoint({ step: 'assessment', workspace: { activeAssessment: { id: 1, status: 'accepted' } } })).complete, true);
  assert.equal((await adapters.readCheckpoint({ step: 'assessment', workspace: { activeAssessment: { id: 1, status: 'draft' } } })).complete, false);
  assert.equal((await adapters.readCheckpoint({ step: 'assessment', workspace: { assessment: { id: null, status: 'PENDING' } } })).complete, false);
  assert.equal((await adapters.readCheckpoint({ step: 'completion', workspace: { activePpd: { id: 1, status: 'completed', receipt_status: 'ready' } } })).complete, true);
  assert.equal((await adapters.readCheckpoint({ step: 'completion', workspace: { activePpd: { id: 1, status: 'completed', receipt_status: 'pending' } } })).complete, false);
  assert.equal((await adapters.readCheckpoint({ step: 'completion', workspace: { ppd: { id: 1, status: 'completed' }, completion: { receipt_status: 'ready' } } })).complete, true);
});

test('assessment checkpoint creates and accepts an assessment when workspace has a PENDING placeholder', async () => {
  const { buildCanonicalAdapters } = await import('./m6-uat-bootstrap.mjs');
  const actors = Object.fromEntries(Object.values(ACTOR_IDS).map((id) => [id, { id }]));
  let version = 7;
  const db = {
    all: async () => [],
    get: async (sql) => sql.includes('workflow_version') ? { workflow_version: version } : null,
  };
  const adapters = await buildCanonicalAdapters({ db, artifactRoot: '/unused' });
  const requests = [];
  await adapters.executeCheckpoint({
    step: 'assessment', caseId: 3, caseKey: 'ppdReview', caseName: 'M6 UAT test',
    config: readProtectedConfig(protectedEnv), workspace: { assessment: { id: null, status: 'PENDING' } }, db,
    request: async (actorId, route, options) => {
      requests.push({ actorId, route, body: JSON.parse(options.body) });
      version += 1;
      if (route.endsWith('/assessment/drafts')) return { data: { id: 91 } };
      if (route.endsWith('/submit')) return { data: { snapshot_hash: 'd'.repeat(64) } };
      return { data: { status: 'accepted' } };
    },
    headers: (key) => ({ 'Idempotency-Key': `m6-uat-ppdReview-${key}` }), actorIds: ACTOR_IDS,
  });
  assert.deepEqual(requests.map(({ route }) => route.split('/').at(-1)), ['drafts', '91', 'submit', 'review']);
  assert.deepEqual(requests.map(({ body }) => body.expected_version), [7, 8, 9, 10]);
});

test('artifact form and transaction numbers are unique per non-staff case', async () => {
  const { caseScopedArtifactNumbers } = await import('./m6-uat-bootstrap.mjs');
  const fixture = {
    mpzis: { form_number: 'MPZIS-FIXTURE' },
    ppd: { form_number: 'PPD-FORM', ppd_number: 'PPD-NUMBER', transaction_number: 'TX-FIXTURE' },
  };
  assert.deepEqual(caseScopedArtifactNumbers({ caseKey: 'staff', caseId: 2, ...fixture }), {
    mpzisFormNumber: 'MPZIS-FIXTURE', ppdFormNumber: 'PPD-FORM', ppdNumber: 'PPD-NUMBER', transactionNumber: 'TX-FIXTURE',
  });
  assert.deepEqual(caseScopedArtifactNumbers({ caseKey: 'ppdReview', caseId: 3, ...fixture }), {
    mpzisFormNumber: 'MPZIS-FIXTURE-3', ppdFormNumber: 'PPD-FORM-3', ppdNumber: 'PPD-NUMBER-3', transactionNumber: 'TX-FIXTURE-3',
  });
});

test('case orchestration synchronizes newly approved MPZIS before the PPD checkpoint', async () => {
  const actors = Object.fromEntries(Object.values(ACTOR_IDS).map((id) => [id, { id }]));
  const executed = [];
  const db = {
    all: async () => [{ id: 40, status: 'Survey', workflow_mode: 'p0' }],
    get: async () => ({ id: 40 }),
    run: async () => {},
    query: async (sql) => { executed.push(sql); return { rows: [] }; },
  };
  const result = await orchestrateCaseWorkflow({
    baseUrl: 'http://127.0.0.1:1', setActor() {}, db, artifactRoot: '/unused',
    config: readProtectedConfig(protectedEnv), caseKey: 'ppdReview', caseName: 'M6 UAT Internal Case B', isFullCase: false,
    adapters: {
      actors,
      readWorkspace: async () => ({ case: { id: 40, status: 'Survey', workflow_version: 2 } }),
      readCheckpoint: async ({ step }) => ({ complete: step !== 'mpzis' && step !== 'ppd' }),
      executeCheckpoint: async ({ step }) => executed.push(step),
      submitMustahikDecision: async () => {},
    },
  });
  assert.equal(executed[0], 'mpzis');
  assert.match(executed[1], /ALTER TABLE mpzis/);
  assert.ok(db.run);
  assert.deepEqual(result.checkpoints.slice(-2).map(({ checkpoint }) => checkpoint), ['mpzis', 'ppd']);
});

test('runner diagnostics retain route and canonical error while redacting sensitive fields', async () => {
  assert.deepEqual(sanitizeRunnerDetails({ safe: 'ok', nik: '123456789012', details: { expected_status: 'proposed' } }), {
    safe: 'ok', nik: '[REDACTED]', details: { expected_status: 'proposed' },
  });
  const request = createRunnerRequest({
    baseUrl: 'http://local', setActor() {}, actorFor: () => ({ id: 7 }), getCheckpoint: () => 'mpzis',
    fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ code: 'MPZIS_STEP_ORDER', message: 'Wrong step', details: { expected_status: 'examined', actual_status: 'proposed', phone: '0812345678' } }) }),
  });
  await assert.rejects(request(7, '/case/8/mpzis/4/approvals/ashnaf_verified'), (error) => {
    assert.equal(error.status, 409);
    assert.deepEqual(error.runnerDiagnostic, {
      route: '/case/8/mpzis/4/approvals/ashnaf_verified', checkpoint: 'mpzis', http_status: 409,
      code: 'MPZIS_STEP_ORDER', message: 'Wrong step',
      details: { expected_status: 'examined', actual_status: 'proposed', phone: '[REDACTED]' },
    });
    return true;
  });
});

test('MPZIS partial resume from examined executes only remaining ordered approvals with fresh versions', async () => {
  const { buildCanonicalAdapters } = await import('./m6-uat-bootstrap.mjs');
  const actors = Object.fromEntries(Object.values(ACTOR_IDS).map((id) => [id, { id }]));
  let version = 20;
  const mockDb = {
    all: async () => [],
    get: async (sql) => sql.includes('workflow_version') ? { workflow_version: version } : null,
  };
  const adapters = await buildCanonicalAdapters({ db: mockDb, artifactRoot: '/unused' });
  const approvals = ['proposed', 'examined'].map((approval_step) => ({ approval_step }));
  mockDb.all = async (sql) => sql.includes('artifact_approvals') ? approvals : [];
  const requests = [];
  await adapters.executeCheckpoint({
    step: 'mpzis', caseId: 44, caseKey: 'staff', caseName: 'M6 UAT test', config: readProtectedConfig(protectedEnv),
    workspace: { case: { workflow_version: version }, activeMpzis: { id: 55, revision: 1, status: 'examined', snapshot_hash: 'b'.repeat(64) } },
    db: mockDb, artifactRoot: '/unused', actors, actorIds: ACTOR_IDS,
    headers: (key) => ({ 'Idempotency-Key': key }),
    request: async (actorId, route, options) => { requests.push({ actorId, route, body: JSON.parse(options.body) }); version += 1; return { data: {} }; },
  });
  assert.deepEqual(requests.map(({ route }) => route.split('/').at(-1)), ['ashnaf_verified', 'responsible_acknowledged', 'approved']);
  assert.deepEqual(requests.map(({ body }) => body.expected_version), [20, 21, 22]);
  assert.ok(requests.every(({ body }) => body.expected_revision === 1 && body.expected_snapshot_hash === 'b'.repeat(64)));
});

test('payment checkpoint requires persisted verification, not the default pending disbursement object', async () => {
  const { buildCanonicalAdapters } = await import('./m6-uat-bootstrap.mjs');
  const adapters = await buildCanonicalAdapters({ db: { all: async () => [] }, artifactRoot: '/unused' });
  const base = { activePpd: { id: 9, status: 'finance_approved' }, disbursement: { status: 'pending', verification_status: null } };
  assert.deepEqual(await adapters.readCheckpoint({ step: 'payment', workspace: base }), { complete: false });
  assert.deepEqual(await adapters.readCheckpoint({ step: 'payment', workspace: { ...base, payment: { id: 1, verification_status: 'pending' } } }), { complete: false });
  assert.deepEqual(await adapters.readCheckpoint({ step: 'payment', workspace: { ...base, payment: { id: 1, verification_status: 'verified' } } }), { complete: true });
  assert.deepEqual(await adapters.readCheckpoint({ step: 'payment', workspace: { activePpd: { id: 9, status: 'payment_verified' } } }), { complete: true });
});

test('payment checkpoint resumes verification for a persisted pending payment without recording twice', async () => {
  const { buildCanonicalAdapters } = await import('./m6-uat-bootstrap.mjs');
  const actors = Object.fromEntries(Object.values(ACTOR_IDS).map((id) => [id, { id }]));
  const requests = [];
  const adapters = await buildCanonicalAdapters({
    db: { all: async () => [], get: async (sql) => sql.includes('workflow_version') ? { workflow_version: 17 } : { id: 44, verification_status: 'pending' } },
    artifactRoot: '/unused',
  });
  await adapters.executeCheckpoint({
    step: 'payment', caseId: 2, caseKey: 'staff', caseName: 'M6 UAT test', config: readProtectedConfig(protectedEnv),
    workspace: { activePpd: { id: 31, revision: 1, status: 'payment_recorded' } }, db: { get: async (sql) => sql.includes('workflow_version') ? { workflow_version: 17 } : { id: 44, verification_status: 'pending' } },
    artifactRoot: '/unused', actors, actorIds: ACTOR_IDS, headers: (key) => ({ 'Idempotency-Key': key }),
    request: async (actorId, route, options) => { requests.push({ actorId, route, method: options.method }); return { data: {} }; },
  });
  assert.deepEqual(requests, [{ actorId: ACTOR_IDS.paymentVerifier, route: '/api/penyaluran/mustahik/2/ppd/31/payment/verify', method: 'POST' }]);
});

test('case assignments include financeChecker for both full and pending PPD review cases', async () => {
  const { caseAssignmentsFor } = await import('./m6-uat-bootstrap.mjs');
  const fullAssignments = caseAssignmentsFor({ isFullCase: true });
  const pendingAssignments = caseAssignmentsFor({ isFullCase: false });
  assert.ok(fullAssignments.some(([actorId, role]) => actorId === ACTOR_IDS.financeChecker && role === 'staff'));
  assert.ok(pendingAssignments.some(([actorId, role]) => actorId === ACTOR_IDS.financeChecker && role === 'staff'));
});
