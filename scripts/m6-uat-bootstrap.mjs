import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const ACTOR_IDS = Object.freeze({
  intake: 2, assessmentReviewer: 3, mpzisCreator: 4, mpzisSubmitter: 5,
  mpzisProposed: 6, mpzisExamined: 7, mpzisAshnaf: 8,
  mpzisResponsible: 9, mpzisApprover: 10, ppdCreator: 11,
  financeChecker: 12, financeApprover: 13, paymentRecorder: 14,
  paymentVerifier: 15, recipientConfirmer: 16,
});

export const CHECKPOINTS = Object.freeze([
  'intake', 'assessment', 'mpzis', 'ppd', 'payment', 'confirmation', 'completion',
]);

const expectedUsers = Object.freeze({
  2: ['penyaluran', 'staff'], 3: ['penyaluran', 'leader'],
  4: ['penyaluran', 'staff'], 5: ['penyaluran', 'staff'],
  6: ['penyaluran', 'staff'], 7: ['penyaluran', 'staff'],
  8: ['penyaluran', 'staff'], 9: ['penyaluran', 'leader'],
  10: ['penyaluran', 'leader'], 11: ['penyaluran', 'staff'],
  12: ['keuangan', 'staff'], 13: ['keuangan', 'leader'],
  14: ['keuangan', 'staff'], 15: ['keuangan', 'staff'],
  16: ['penyaluran', 'staff'],
});

export function readProtectedConfig(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(M6_UAT_(?:STAFF_CASE_NAME|PPD_REVIEW_CASE_NAME|DOCUMENT_NAME))\s*=\s*(.*?)\s*$/);
    if (match) values.set(match[1], match[2].replace(/^(?:['"])(.*)(?:['"])$/, '$1'));
  }
  const keys = ['M6_UAT_STAFF_CASE_NAME', 'M6_UAT_PPD_REVIEW_CASE_NAME', 'M6_UAT_DOCUMENT_NAME'];
  const config = Object.fromEntries(keys.map((key) => [key, values.get(key)]));
  if (keys.some((key) => typeof config[key] !== 'string' || !config[key].trim())) throw new Error('M6_UAT_CONFIG_INVALID');
  if (!config.M6_UAT_STAFF_CASE_NAME.startsWith('M6 UAT') || !config.M6_UAT_PPD_REVIEW_CASE_NAME.startsWith('M6 UAT')) throw new Error('M6_UAT_CASE_NAME_INVALID');
  if (config.M6_UAT_STAFF_CASE_NAME === config.M6_UAT_PPD_REVIEW_CASE_NAME) throw new Error('M6_UAT_CASE_NAMES_MUST_DIFFER');
  return config;
}

export function assertStagingTarget({ database, project, socket, allowWrites = false }) {
  if (database !== 'baznas_m6_staging' || !project?.includes('m6-staging') || socket !== 'unix:///run/user/999/docker.sock') throw new Error('M6_STAGING_TARGET_GUARD_FAILED');
  if (allowWrites !== true) throw new Error('M6_BOOTSTRAP_DRY_RUN_ONLY');
  return true;
}

export function validateActors(rows) {
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  for (const [id, [role, level]] of Object.entries(expectedUsers)) {
    const user = byId.get(Number(id));
    if (!user || user.is_active === false || user.is_active === 0 || String(user.role).toLowerCase() !== role || String(user.level).toLowerCase() !== level) throw new Error('M6_UAT_ACTOR_GUARD_FAILED');
  }
  return true;
}

export function planCheckpoint(checkpoint, observed) {
  if (!CHECKPOINTS.includes(checkpoint)) throw new Error('M6_CHECKPOINT_UNKNOWN');
  if (!observed || typeof observed.complete !== 'boolean') throw new Error('M6_CHECKPOINT_STATE_INVALID');
  return observed.complete ? 'noop' : 'execute';
}

export async function findTargetCase(db, name) {
  const rows = await db.all('SELECT id,status,workflow_mode FROM mustahik WHERE name=$1', [name]);
  if (rows.length > 1) throw new Error('M6_DUPLICATE_CASE_DETECTED');
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.workflow_mode !== 'p0') throw new Error('M6_INVALID_CASE_WORKFLOW_MODE');
  const application = await db.get('SELECT id FROM applications WHERE mustahik_id=$1 ORDER BY id DESC LIMIT 1', [row.id]);
  if (!application) throw new Error('M6_INVALID_CASE_APPLICATION');
  return { ...row, application_id: application.id };
}

export async function withCaseAdvisoryLock(db, caseName, callback) {
  if (db?.pool?.connect) {
    const client = await db.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended('m6-uat:' || $1, 0))", [caseName]);
      return await callback();
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtextextended('m6-uat:' || $1, 0))", [caseName]);
      } catch {}
      client.release();
    }
  }
  const { withTransaction } = await import('../server/db.js');
  return withTransaction(db, async (tx) => {
    if (tx?.query) {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('m6-uat:' || $1, 0))", [caseName]);
    }
    return callback(tx);
  });
}

export function assertCanonicalArtifactState(workspace, artifactKey, expectedStatuses) {
  const artifact = workspace?.[artifactKey];
  if (!artifact) return null;
  if (!Number.isSafeInteger(Number(artifact.id)) || Number(artifact.revision) < 1 || !Array.isArray(expectedStatuses) || !expectedStatuses.includes(artifact.status)) {
    throw new Error('M6_INVALID_CANONICAL_ARTIFACT_STATE');
  }
  if (['submitted', 'accepted', 'approved', 'completed'].includes(artifact.status) && !/^[a-f0-9]{64}$/i.test(String(artifact.snapshot_hash || ''))) {
    throw new Error('M6_INVALID_CANONICAL_ARTIFACT_HASH');
  }
  return artifact;
}

export async function readCanonicalWorkspace(db, actor, caseId) {
  const { getP0CaseWorkspace } = await import('../server/penyaluran-p0/case-read-model.js');
  const workspace = await getP0CaseWorkspace({ actor, db }, caseId);
  if (!workspace?.case || Number(workspace.case.id) !== Number(caseId)) throw new Error('M6_CANONICAL_WORKSPACE_INVALID');
  return workspace;
}

export async function storeCanonicalSupportingDocument({ db, artifactRoot, actor, caseId, ppdId, revision, originalName, bytes }) {
  const { storeArtifactFile } = await import('../server/penyaluran-p0/artifact-files.js');
  const result = await storeArtifactFile({
    db,
    artifactRoot,
    actor,
    mustahik_id: caseId,
    artifact_type: 'ppd',
    artifact_id: ppdId,
    artifact_revision: revision,
    kind: 'supporting_document',
    requireAssignment: false,
    file: { buffer: bytes, originalname: originalName, mimetype: 'application/pdf', size: bytes.length },
  });
  if (!result?.data?.id || result.data.original_name !== originalName) throw new Error('M6_CANONICAL_ARTIFACT_STORE_FAILED');
  return result.data;
}

export async function stagePdf({ root, filename, bytes, finalize = false }) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) || !bytes.includes(Buffer.from('%%EOF'))) throw new Error('M6_PDF_INVALID');
  const safeName = path.basename(filename);
  if (!safeName.endsWith('.pdf')) throw new Error('M6_PDF_NAME_INVALID');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const temp = path.join(root, `.${crypto.randomUUID()}.tmp`);
  const target = path.join(root, safeName);
  await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
  if (!finalize) return { temp, target, cleanup: () => fs.unlink(temp).catch(() => {}) };
  await fs.rename(temp, target);
  return { target, cleanup: () => fs.unlink(target).catch(() => {}) };
}

export async function runBootstrap({ envFile = '/run/secrets/m6-uat.env', dryRun = true, adapters = {} } = {}) {
  if (!dryRun) throw new Error('M6_MILESTONE_B_GUARD_REQUIRED');
  const config = readProtectedConfig(await fs.readFile(envFile, 'utf8'));
  if (!adapters.readActors || !adapters.readCaseCheckpoint) throw new Error('M6_READ_ADAPTER_REQUIRED');
  validateActors(await adapters.readActors());
  const result = [];
  for (const [caseKey, caseName] of [['staff', config.M6_UAT_STAFF_CASE_NAME], ['ppdReview', config.M6_UAT_PPD_REVIEW_CASE_NAME]]) {
    const observed = await adapters.readCaseCheckpoint(caseName);
    result.push({ caseKey, checkpoints: CHECKPOINTS.map((checkpoint) => ({ checkpoint, action: planCheckpoint(checkpoint, observed[checkpoint] || { complete: false }) })) });
  }
  return { mode: 'dry-run', cases: result };
}

export async function createLocalP0Harness({ db, artifactRoot }) {
  if (!db || typeof artifactRoot !== 'string' || !artifactRoot) throw new Error('M6_HARNESS_CONFIG_INVALID');
  const express = (await import('express')).default;
  const { registerPenyaluranP0Routes } = await import('../server/penyaluran-p0/routes.js');
  const app = express();
  app.use(express.json());
  let currentActor;
  const setActor = (actor) => {
    if (!actor || !Number.isSafeInteger(Number(actor.id))) throw new Error('M6_ACTOR_INVALID');
    currentActor = actor;
  };
  registerPenyaluranP0Routes(app, {
    db,
    artifactRoot,
    isEnabled: () => true,
    authenticateToken: (req, res, next) => {
      if (!currentActor) return res.status(401).json({ error: 'M6_ACTOR_REQUIRED' });
      req.user = currentActor;
      return next();
    },
  });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    setActor,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const workflowSteps = Object.freeze([
  'intake', 'administrationSurvey', 'assessment', 'mpzis', 'ppd',
  'finance', 'payment', 'confirmation', 'completion',
]);

export function caseScopedArtifactNumbers({ caseKey, caseId, mpzis, ppd }) {
  const suffix = caseKey === 'staff' ? '' : `-${caseId}`;
  return {
    mpzisFormNumber: `${mpzis.form_number}${suffix}`,
    ppdFormNumber: `${ppd.form_number}${suffix}`,
    ppdNumber: `${ppd.ppd_number}${suffix}`,
    transactionNumber: `${ppd.transaction_number}${suffix}`,
  };
}

export function caseAssignmentsFor({ isFullCase }) {
  return isFullCase
    ? [[ACTOR_IDS.intake, 'staff'], [ACTOR_IDS.mpzisApprover, 'leader'], [ACTOR_IDS.financeChecker, 'staff']]
    : [[ACTOR_IDS.intake, 'staff'], [ACTOR_IDS.ppdCreator, 'staff'], [ACTOR_IDS.financeChecker, 'staff']];
}

export async function orchestrateCaseWorkflow({
  baseUrl, setActor, db, artifactRoot, config, caseKey, caseName, isFullCase, adapters = {},
}) {
  if (!baseUrl || typeof setActor !== 'function' || !db || !artifactRoot || !config || !caseName) throw new Error('M6_ORCHESTRATOR_CONFIG_INVALID');
  if (caseKey !== 'staff' && caseKey !== 'ppdReview') throw new Error('M6_CASE_KEY_INVALID');
  const submitDecision = adapters.submitMustahikDecision || (async (...args) => {
    const { submitMustahikDecision } = await import('../server/repository.js');
    return submitMustahikDecision(...args);
  });
  const receiptJob = adapters.processReceiptJob || (async (...args) => {
    const { processReceiptJob } = await import('../server/penyaluran-p0/receipt-jobs.js');
    return processReceiptJob(...args);
  });
  const actorFor = (id) => adapters.actors?.[id];
  let activeCheckpoint = 'intake';
  const request = createRunnerRequest({ baseUrl, setActor, actorFor, getCheckpoint: () => activeCheckpoint });
  const call = async (name, ...args) => {
    if (typeof adapters[name] !== 'function') throw new Error(`M6_WORKFLOW_ADAPTER_MISSING_${name}`);
    return adapters[name](...args);
  };
  const headers = (key) => ({ 'Content-Type': 'application/json', 'Idempotency-Key': `m6-uat-${caseKey}-${key}` });
  const results = [];
  let target = await findTargetCase(db, caseName);
  if (!target) {
    const intake = await call('intakePayload', config, caseKey);
    const created = await request(ACTOR_IDS.intake, '/api/penyaluran/mustahik', { method: 'POST', headers: headers('intake'), body: JSON.stringify(intake) });
    target = { id: created?.data?.id };
    if (!target.id) throw new Error('M6_INTAKE_RESULT_INVALID');
  }
  const caseId = target.id;
  const caseAssignments = caseAssignmentsFor({ isFullCase });
  for (const [caseUser, role] of caseAssignments) {
    await db.run('INSERT INTO mustahik_case_assignments (mustahik_id, user_id, assignment_role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [caseId, caseUser, role]);
  }
  const refresh = async (actorId = ACTOR_IDS.intake) => (adapters.readWorkspace
    ? adapters.readWorkspace({ db, actor: actorFor(actorId), caseId })
    : readCanonicalWorkspace(db, actorFor(actorId), caseId));

  let workspace = await refresh();
  let status = workspace.case.status ?? target.status;
  if (status === 'Diajukan') {
    await submitDecision(caseId, { action: 'approve', target_status: 'Verifikasi Administrasi', notes: 'Verifikasi berkas', expected_status: 'Diajukan', expected_version: Number(workspace.case.workflow_version ?? 0) }, actorFor(ACTOR_IDS.intake), db);
    workspace = await refresh();
    status = workspace.case.status;
  }
  if (status === 'Verifikasi Administrasi') {
    await submitDecision(caseId, { action: 'approve', target_status: 'Survey', notes: 'Lolos berkas', expected_status: status, expected_version: Number(workspace.case.workflow_version) }, actorFor(ACTOR_IDS.intake), db);
  }
  results.push({ checkpoint: 'administrationSurvey', action: status === 'Survey' ? 'noop' : 'checked' });

  for (const step of workflowSteps.slice(2, isFullCase ? undefined : 5)) {
    activeCheckpoint = step;
    workspace = await refresh();
    const state = await call('readCheckpoint', { step, workspace, caseId, db });
    if (state?.complete) {
      results.push({ checkpoint: step, action: 'noop' });
      continue;
    }
    await call('executeCheckpoint', {
      step, workspace, caseId, caseName, caseKey, config, db, artifactRoot,
      request, headers, setActor, actorIds: ACTOR_IDS,
      storeCanonicalSupportingDocument, processReceiptJob: receiptJob,
    });
    if (step === 'mpzis') await ensureP0Schema(db);
    results.push({ checkpoint: step, action: 'executed' });
  }
  return { caseId, caseKey, checkpoints: results };
}

export const orchestrateCase = orchestrateCaseWorkflow;



const sensitiveDiagnosticKey = /(?:secret|password|token|authorization|cookie|nik|phone|address|recipient_name|bank_account|email|payload|body|stack)/i;

export function sanitizeRunnerDetails(value, key = '', depth = 0) {
  if (sensitiveDiagnosticKey.test(key)) return '[REDACTED]';
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return typeof value === 'string'
    ? value.replace(/\b\d{12,16}\b/g, '[REDACTED_ID]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]').replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g, '[REDACTED_PHONE]').replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 300)
    : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeRunnerDetails(item, '', depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 30).map(([childKey, child]) => [childKey, sanitizeRunnerDetails(child, childKey, depth + 1)]));
  return String(value).slice(0, 300);
}

export function createRunnerRequest({ baseUrl, setActor, actorFor, getCheckpoint, fetchImpl = fetch }) {
  return async (actorId, route, options = {}) => {
    const actor = actorFor(actorId);
    if (!actor) throw new Error('M6_UAT_ACTOR_GUARD_FAILED');
    setActor(actor);
    const response = await fetchImpl(`${baseUrl}${route}`, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const diagnostic = sanitizeRunnerDetails({
        route, checkpoint: getCheckpoint(), http_status: response.status,
        code: body.code || body.error?.code || `HTTP_${response.status}`,
        message: body.message || body.error?.message || 'Canonical route rejected the request.',
        details: body.details || body.error?.details,
        ...(body.field_errors ? { field_errors: body.field_errors } : {}),
      });
      const error = new Error(`M6_CANONICAL_ROUTE_FAILED_${response.status}`);
      error.code = diagnostic.code;
      error.status = response.status;
      error.runnerDiagnostic = diagnostic;
      throw error;
    }
    return body;
  };
}

export async function ensureP0Schema(db) {
  await db.query(`
    ALTER TABLE mpzis ADD COLUMN IF NOT EXISTS recipient_section_confirmed BOOLEAN DEFAULT true;
    ALTER TABLE mpzis ADD COLUMN IF NOT EXISTS fund_source_confirmed BOOLEAN DEFAULT true;
    ALTER TABLE ppd ADD COLUMN IF NOT EXISTS fund_source_confirmed BOOLEAN DEFAULT true;
    ALTER TABLE ppd ADD COLUMN IF NOT EXISTS payment_type_confirmed BOOLEAN DEFAULT true;
    UPDATE mpzis SET approved_amount = total_amount WHERE (approved_amount = 0 OR approved_amount IS NULL) AND total_amount > 0;
  `);
}

export async function buildCanonicalAdapters({ db, artifactRoot }) {
  const { default: maskedFixture } = await import('../server/fixtures/penyaluran-p0-masked-case.json', { with: { type: 'json' } });
  const userRows = await db.all('SELECT id, name, role, level, division, is_active FROM users WHERE id BETWEEN 2 AND 16');
  const actors = Object.fromEntries(userRows.map((u) => [Number(u.id), u]));

  const intakePayload = async (config, caseKey) => ({
    ...maskedFixture.intake,
    name: caseKey === 'staff' ? config.M6_UAT_STAFF_CASE_NAME : config.M6_UAT_PPD_REVIEW_CASE_NAME,
  });

  const readCheckpoint = async ({ step, workspace }) => {
    const activeAssessment = workspace?.activeAssessment?.id ? workspace.activeAssessment : workspace?.assessment?.id ? workspace.assessment : null;
    const activeMpzis = workspace?.activeMpzis?.id ? workspace.activeMpzis : workspace?.mpzis?.id ? workspace.mpzis : null;
    const activePpd = workspace?.activePpd?.id ? workspace.activePpd : workspace?.ppd?.id ? workspace.ppd : null;
    switch (step) {
      case 'assessment':
        return { complete: activeAssessment?.status === 'accepted' };
      case 'mpzis':
        return { complete: activeMpzis?.status === 'approved' };
      case 'ppd':
        return { complete: ['submitted', 'approved', 'completed'].includes(activePpd?.status) };
      case 'finance':
        return { complete: ['approved', 'completed'].includes(activePpd?.status) };
      case 'payment':
        return { complete: workspace.payment?.verification_status === 'verified' || workspace.payment?.status === 'verified' || workspace.disbursement?.verification_status === 'verified' || activePpd?.status === 'payment_verified' || ['recipient_confirmed', 'completed'].includes(activePpd?.status) };
      case 'confirmation':
        return { complete: Boolean(workspace.confirmation || (activePpd && ['recipient_confirmed', 'completed'].includes(activePpd.status))) };
      case 'completion':
        return { complete: activePpd?.status === 'completed' && (activePpd?.receipt_status || workspace?.completion?.receipt_status) === 'ready' };
      default:
        return { complete: false };
    }
  };

  const executeCheckpoint = async ({
    step, workspace, caseId, caseName, caseKey, config, db: stepDb, artifactRoot: root,
    request, headers, actorIds, storeCanonicalSupportingDocument: storeDoc, processReceiptJob: receiptJob,
  }) => {
    const curVer = async () => Number((await stepDb.get('SELECT workflow_version FROM mustahik WHERE id=$1', [caseId])).workflow_version);
    const activeAssessment = workspace?.activeAssessment?.id ? workspace.activeAssessment : workspace?.assessment?.id ? workspace.assessment : null;
    const activeMpzis = workspace?.activeMpzis?.id ? workspace.activeMpzis : workspace?.mpzis?.id ? workspace.mpzis : null;
    const activePpd = workspace?.activePpd?.id ? workspace.activePpd : workspace?.ppd?.id ? workspace.ppd : null;
    if (step === 'assessment') {
      const { assessment } = maskedFixture;
      if (!activeAssessment) {
        const draft = await request(actorIds.intake, `/api/penyaluran/mustahik/${caseId}/assessment/drafts`, { method: 'POST', headers: headers('ass-draft'), body: JSON.stringify({ expected_version: await curVer() }) });
        const assId = draft.data.id;
        await request(actorIds.intake, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}`, { method: 'PUT', headers: headers('ass-save'), body: JSON.stringify({ ...assessment, expected_version: await curVer(), expected_revision: 1 }) });
        const sub = await request(actorIds.intake, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}/submit`, { method: 'POST', headers: headers('ass-submit'), body: JSON.stringify({ ...assessment, expected_version: await curVer(), expected_revision: 1 }) });
        await request(actorIds.assessmentReviewer, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}/review`, { method: 'POST', headers: headers('ass-review'), body: JSON.stringify({ action: 'accept', note: 'UAT Asesmen Valid', expected_version: await curVer(), expected_revision: 1, expected_snapshot_hash: sub.data.snapshot_hash }) });
      } else if (activeAssessment.status === 'draft') {
        const assId = activeAssessment.id;
        const sub = await request(actorIds.intake, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}/submit`, { method: 'POST', headers: headers('ass-submit'), body: JSON.stringify({ ...assessment, expected_version: await curVer(), expected_revision: Number(activeAssessment.revision) }) });
        await request(actorIds.assessmentReviewer, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}/review`, { method: 'POST', headers: headers('ass-review'), body: JSON.stringify({ action: 'accept', note: 'UAT Asesmen Valid', expected_version: await curVer(), expected_revision: Number(activeAssessment.revision), expected_snapshot_hash: sub.data.snapshot_hash }) });
      } else if (activeAssessment.status === 'submitted') {
        const assId = activeAssessment.id;
        await request(actorIds.assessmentReviewer, `/api/penyaluran/mustahik/${caseId}/assessment/${assId}/review`, { method: 'POST', headers: headers('ass-review'), body: JSON.stringify({ action: 'accept', note: 'UAT Asesmen Valid', expected_version: await curVer(), expected_revision: Number(activeAssessment.revision), expected_snapshot_hash: activeAssessment.snapshot_hash }) });
      }
    } else if (step === 'mpzis') {
      const { mpzis } = maskedFixture;
      const { mpzisFormNumber } = caseScopedArtifactNumbers({ caseKey, caseId, mpzis, ppd: maskedFixture.ppd });
      let mpzisId, revision, hash;
      if (!activeMpzis) {
        const draft = await request(actorIds.mpzisCreator, `/api/penyaluran/mustahik/${caseId}/mpzis/drafts`, { method: 'POST', headers: headers('mpz-draft'), body: JSON.stringify({ expected_version: await curVer(), expected_revision: 1 }) });
        mpzisId = draft.data.id; revision = 1;
        await request(actorIds.mpzisCreator, `/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisId}`, { method: 'PUT', headers: headers('mpz-save'), body: JSON.stringify({ ...mpzis, form_number: mpzisFormNumber, recipient_section_confirmed: true, fund_source_confirmed: true, expected_version: await curVer(), expected_revision: 1 }) });
        const sub = await request(actorIds.mpzisSubmitter, `/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisId}/submit`, { method: 'POST', headers: headers('mpz-submit'), body: JSON.stringify({ form_number: mpzisFormNumber, expected_version: await curVer(), expected_revision: 1 }) });
        hash = sub.data.snapshot_hash;
      } else if (activeMpzis.status === 'draft') {
        mpzisId = activeMpzis.id; revision = Number(activeMpzis.revision);
        await request(actorIds.mpzisCreator, `/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisId}`, { method: 'PUT', headers: headers('mpz-save'), body: JSON.stringify({ ...mpzis, form_number: mpzisFormNumber, recipient_section_confirmed: true, fund_source_confirmed: true, expected_version: await curVer(), expected_revision: revision }) });
        const sub = await request(actorIds.mpzisSubmitter, `/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisId}/submit`, { method: 'POST', headers: headers('mpz-submit'), body: JSON.stringify({ form_number: mpzisFormNumber, expected_version: await curVer(), expected_revision: revision }) });
        hash = sub.data.snapshot_hash;
      } else {
        mpzisId = activeMpzis.id; revision = Number(activeMpzis.revision); hash = activeMpzis.snapshot_hash;
      }
      const steps = [
        { step: 'proposed', actorId: actorIds.mpzisProposed },
        { step: 'examined', actorId: actorIds.mpzisExamined },
        { step: 'ashnaf_verified', actorId: actorIds.mpzisAshnaf },
        { step: 'responsible_acknowledged', actorId: actorIds.mpzisResponsible },
        { step: 'approved', actorId: actorIds.mpzisApprover },
      ];
      const existing = (await stepDb.all('SELECT approval_step FROM artifact_approvals WHERE artifact_type=\'mpzis\' AND artifact_id=$1 AND action=\'approve\'', [mpzisId])).map((r) => r.approval_step);
      for (const s of steps) {
        if (!existing.includes(s.step)) {
          await request(s.actorId, `/api/penyaluran/mustahik/${caseId}/mpzis/${mpzisId}/approvals/${s.step}`, { method: 'POST', headers: headers(`mpz-${s.step}`), body: JSON.stringify({ action: 'approve', note: `UAT ${s.step}`, expected_version: await curVer(), expected_revision: revision, expected_snapshot_hash: hash }) });
        }
      }
    } else if (step === 'ppd') {
      const { ppd } = maskedFixture;
      const { ppdFormNumber, ppdNumber, transactionNumber } = caseScopedArtifactNumbers({ caseKey, caseId, mpzis: maskedFixture.mpzis, ppd });
      let ppdId, revision;
      if (!activePpd) {
        const draft = await request(actorIds.ppdCreator, `/api/penyaluran/mustahik/${caseId}/ppd/drafts`, { method: 'POST', headers: headers('ppd-draft'), body: JSON.stringify({ expected_version: await curVer(), expected_revision: 1 }) });
        ppdId = draft.data.id; revision = 1;
      } else {
        ppdId = activePpd.id; revision = Number(activePpd.revision);
      }
      let doc = await stepDb.get('SELECT id, sha256 FROM artifact_files WHERE mustahik_id=$1 AND artifact_type=\'ppd\' AND kind=\'supporting_document\' LIMIT 1', [caseId]);
      if (!doc) {
        const pdfBytes = Buffer.from(`%PDF-1.4\n% M6 UAT case ${caseId}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n`, 'ascii');
        doc = await storeDoc({ db: stepDb, artifactRoot: root, actor: actors[actorIds.ppdCreator], caseId, ppdId, revision, originalName: config.M6_UAT_DOCUMENT_NAME, bytes: pdfBytes });
      }
      if (!activePpd || activePpd.status === 'draft') {
        const ppdPayload = { ...ppd, form_number: ppdFormNumber, ppd_number: ppdNumber, transaction_number: transactionNumber, attachments: [{ file_id: doc.id, kind: 'supporting_document', mime_type: 'application/pdf', byte_size: 100, sha256: doc.sha256 || 'c'.repeat(64) }], fund_source_confirmed: true, payment_type_confirmed: true, expected_version: await curVer(), expected_revision: revision };
        await request(actorIds.ppdCreator, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}`, { method: 'PUT', headers: headers('ppd-save'), body: JSON.stringify(ppdPayload) });
        await request(actorIds.ppdCreator, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/submit`, { method: 'POST', headers: headers('ppd-submit'), body: JSON.stringify(ppdPayload) });
      }
    } else if (step === 'finance') {
      const ppdId = activePpd.id; const revision = Number(activePpd.revision); const hash = activePpd.snapshot_hash;
      await request(actorIds.financeChecker, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/finance-check`, { method: 'POST', headers: headers('fin-check'), body: JSON.stringify({ note: 'UAT Fin Check OK', expected_version: await curVer(), expected_revision: revision }) });
      await request(actorIds.financeApprover, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/finance-approve`, { method: 'POST', headers: headers('fin-approve'), body: JSON.stringify({ note: 'UAT Fin Approve OK', expected_version: await curVer(), expected_revision: revision, expected_snapshot_hash: hash }) });
    } else if (step === 'payment') {
      const { payment } = maskedFixture;
      const ppdId = activePpd.id;
      const existingPayment = await stepDb.get('SELECT id, verification_status FROM ppd_payments WHERE ppd_id=$1 ORDER BY id DESC LIMIT 1', [ppdId]);
      if (!existingPayment) {
        const paymentPdf = Buffer.from('%PDF-1.4\n2 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n', 'ascii');
        const form = new FormData();
        form.set('transaction_number', payment.transaction_number);
        form.set('paid_amount', String(payment.paid_amount));
        form.set('paid_at', new Date().toISOString());
        form.set('proof', new Blob([paymentPdf], { type: 'application/pdf' }), payment.proof_filename || 'payment.pdf');
        await request(actorIds.paymentRecorder, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/payment`, { method: 'POST', headers: { 'Idempotency-Key': `m6-uat-${caseKey}-payment` }, body: form });
      }
      if (existingPayment?.verification_status !== 'verified') {
        await request(actorIds.paymentVerifier, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/payment/verify`, { method: 'POST', headers: headers('pay-verify'), body: JSON.stringify({}) });
      }
    } else if (step === 'confirmation') {
      const { confirmation } = maskedFixture;
      const ppdId = activePpd.id;
      const confPdf = Buffer.from('%PDF-1.4\n3 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n0\n%%EOF\n', 'ascii');
      const form = new FormData();
      form.set('method', 'Tatap Muka');
      form.set('recipient_name_snapshot', confirmation.recipient_name_snapshot);
      form.set('confirmed_at', new Date().toISOString());
      form.set('note', confirmation.note);
      form.set('evidence', new Blob([confPdf], { type: 'application/pdf' }), confirmation.evidence_filename || 'conf.pdf');
      await request(actorIds.recipientConfirmer, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/recipient-confirmation`, { method: 'POST', headers: { 'Idempotency-Key': `m6-uat-${caseKey}-confirm` }, body: form });
    } else if (step === 'completion') {
      const ppdId = activePpd.id;
      if (activePpd.status !== 'completed') {
        await request(actorIds.mpzisApprover, `/api/penyaluran/mustahik/${caseId}/ppd/${ppdId}/complete`, { method: 'POST', headers: headers('complete'), body: JSON.stringify({}) });
      }
      if (activePpd.receipt_status !== 'ready') {
        await receiptJob(ppdId, { db: stepDb, artifactRoot: root });
      }
    }
  };

  return { actors, intakePayload, readCheckpoint, executeCheckpoint };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { bootstrapSecrets } = await import('../server/secrets.js');
    bootstrapSecrets();
    let rawKey;
    try {
      rawKey = await fs.readFile('/run/secrets/m6_staging_p0_field_key', 'utf8');
    } catch {
      rawKey = await fs.readFile('/run/secrets/p0_field_encryption_key.txt', 'utf8');
    }
    process.env.P0_FIELD_ENCRYPTION_KEY = rawKey.trim();
    const { getDb } = await import('../server/db.js');
    const db = await getDb();
    try {
      const config = readProtectedConfig(await fs.readFile('/run/secrets/m6-uat.env', 'utf8'));
      const mode = process.env.M6_UAT_BOOTSTRAP_MODE;
      if (mode !== 'dry-run' && mode !== 'execute') throw new Error('M6_BOOTSTRAP_MODE_INVALID');
      if (String(process.env.PGDATABASE || process.env.DB_NAME) !== 'baznas_m6_staging') throw new Error('M6_STAGING_TARGET_GUARD_FAILED');
      validateActors(await db.all('SELECT id,role,level,is_active FROM users WHERE id BETWEEN 2 AND 16'));
      if (mode === 'dry-run') {
        const cases = [];
        for (const [caseKey, name] of [['staff', config.M6_UAT_STAFF_CASE_NAME], ['ppdReview', config.M6_UAT_PPD_REVIEW_CASE_NAME]]) {
          const row = await db.get('SELECT id,status,workflow_mode FROM mustahik WHERE name=$1 ORDER BY id DESC LIMIT 1', [name]);
          cases.push({ caseKey, present: Boolean(row), checkpoint: row ? row.status : 'not_seeded' });
        }
        console.log(JSON.stringify({ mode: 'dry-run', actorsValid: true, cases }));
      } else {
        assertStagingTarget({
          database: String(process.env.PGDATABASE || process.env.DB_NAME),
          project: process.env.COMPOSE_PROJECT_NAME,
          socket: process.env.DOCKER_SOCKET,
          allowWrites: true,
        });
        const artifactRoot = process.env.PENYALURAN_ARTIFACT_DIR || '/app/private-artifacts';
        const harness = await createLocalP0Harness({ db, artifactRoot });
        try {
          await ensureP0Schema(db);
          const adapters = await buildCanonicalAdapters({ db, artifactRoot });
          const staffResult = await withCaseAdvisoryLock(db, config.M6_UAT_STAFF_CASE_NAME, () => orchestrateCaseWorkflow({
            baseUrl: harness.baseUrl, setActor: harness.setActor, db, artifactRoot,
            config, caseKey: 'staff', caseName: config.M6_UAT_STAFF_CASE_NAME, isFullCase: true, adapters,
          }));
          const ppdResult = await withCaseAdvisoryLock(db, config.M6_UAT_PPD_REVIEW_CASE_NAME, () => orchestrateCaseWorkflow({
            baseUrl: harness.baseUrl, setActor: harness.setActor, db, artifactRoot,
            config, caseKey: 'ppdReview', caseName: config.M6_UAT_PPD_REVIEW_CASE_NAME, isFullCase: false, adapters,
          }));
          console.log(JSON.stringify({ mode: 'execute', cases: [staffResult, ppdResult] }));
        } finally {
          await harness.close();
        }
      }
    } finally { await db.pool.end(); }
  } catch (error) {
    if (error?.runnerDiagnostic) console.error(JSON.stringify(error.runnerDiagnostic));
    else if (error?.message) console.error(JSON.stringify({ guard: 'M6_UAT_BOOTSTRAP_GUARD_FAILED', detail: sanitizeRunnerDetails(error.message) }));
    const safeCode = typeof error?.message === 'string' && /^M6_[A-Z0-9_]+$/.test(error.message) ? error.message : 'M6_UAT_BOOTSTRAP_GUARD_FAILED';
    console.error(safeCode);
    process.exitCode = 1;
  }
}
