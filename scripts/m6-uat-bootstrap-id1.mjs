import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET = Object.freeze({
  id: 1,
  name: 'M6 UAT Synthetic 907d8f989e',
  mode: 'p0',
  initialVersion: 0,
  project: 'baznas-m6-staging',
  socket: 'unix:///run/user/999/docker.sock',
  database: 'baznas_m6_staging',
});

export const ACTOR_ROLES = Object.freeze({
  2: ['penyaluran', 'staff'], 3: ['penyaluran', 'leader'],
  4: ['penyaluran', 'staff'], 5: ['penyaluran', 'staff'],
  6: ['penyaluran', 'staff'], 7: ['penyaluran', 'staff'],
  8: ['penyaluran', 'staff'], 9: ['penyaluran', 'leader'],
  10: ['penyaluran', 'leader'], 11: ['penyaluran', 'staff'],
  12: ['keuangan', 'staff'], 13: ['keuangan', 'leader'],
  14: ['keuangan', 'staff'], 15: ['keuangan', 'staff'],
  16: ['penyaluran', 'staff'],
});
export const APPROVALS = Object.freeze([
  ['proposed', 6], ['examined', 7], ['ashnaf_verified', 8],
  ['responsible_acknowledged', 9], ['approved', 10],
]);

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(?:['"])(.*)(?:['"])$/, '$1');
  }
  return values;
}

export function assertTarget(config) {
  if (config.project !== TARGET.project || config.socket !== TARGET.socket || config.database !== TARGET.database) throw new Error('ID1_STAGING_TARGET_GUARD_FAILED');
  if (config.applicantName !== TARGET.name) throw new Error('ID1_APPLICANT_NAME_GUARD_FAILED');
}

export function assertActors(rows) {
  const actors = new Map(rows.map((row) => [Number(row.id), row]));
  for (const [id, [role, level]] of Object.entries(ACTOR_ROLES)) {
    const actor = actors.get(Number(id));
    if (!actor || ![true, 1, '1', 't', 'true'].includes(actor.is_active) || String(actor.role).toLowerCase() !== role || String(actor.level).toLowerCase() !== level || !String(actor.division || '').toLowerCase().includes(role === 'penyaluran' ? 'penyaluran' : 'keuangan')) throw new Error(`ID1_ACTOR_GUARD_FAILED_${id}`);
  }
  return actors;
}

export function assertInitialState({ target, ppdCount, caseNames }) {
  const pristine = target?.status === 'Diajukan' && Number(target.workflow_version) === TARGET.initialVersion;
  const resumable = target?.status === 'Survey' && Number(target.workflow_version) === 2;
  const boundedResume = target?.status === 'Persetujuan MPZIS' && Number(target.workflow_version) === 3;
  const completed = target?.status === 'Pengajuan Dana (FPD)' && Number(target.workflow_version) === 4;
  if (!target || Number(target.id) !== TARGET.id || target.name !== TARGET.name || target.workflow_mode !== TARGET.mode || (!pristine && !resumable && !boundedResume && !completed)) throw new Error('ID1_CASE_STATE_GUARD_FAILED');
  if (Number(ppdCount) !== 0) throw new Error('ID1_PPD_NOT_EMPTY');
  for (const [id, expected] of [[2, 'M6 UAT Completed Receipt 907d8f989e'], [3, 'M6 UAT Pending PPD Review 907d8f989e']]) {
    if (caseNames.get(Number(id)) !== expected) throw new Error(`ID1_NEIGHBOR_CASE_GUARD_FAILED_${id}`);
  }
}

export function assertApprovedReadModel(workspace) {
  if (workspace.case_progress?.current_stage !== 'mpzis' || workspace.case_progress?.active_artifact !== 'mpzis' || workspace.mpzis?.status !== 'approved' || workspace.ppd?.id) throw new Error('ID1_READ_MODEL_GUARD_FAILED');
}

export async function snapshotFixture(db) {
  const queries = {
    mustahik: 'SELECT id,name,status,workflow_mode,workflow_version,approved_amount,mpzis_date FROM mustahik WHERE id IN ($1,$2,$3) ORDER BY id',
    applications: 'SELECT id,mustahik_id,status FROM applications WHERE mustahik_id IN ($1,$2,$3) ORDER BY id',
    assessments: 'SELECT id,mustahik_id,status,source,revision,created_by_id,updated_by_id,submitted_at,reviewed_at FROM assessments WHERE mustahik_id IN ($1,$2,$3) ORDER BY id',
    mpzis: 'SELECT id,mustahik_id,status,source,revision,form_number,total_amount,approved_amount,created_by_id,submitted_by_id FROM mpzis WHERE mustahik_id IN ($1,$2,$3) ORDER BY id',
    artifact_approvals: "SELECT id,mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,actor_id FROM artifact_approvals WHERE mustahik_id IN ($1,$2,$3) ORDER BY id",
    ppd: 'SELECT id,mustahik_id,status,source,revision,form_number,amount FROM ppd WHERE mustahik_id IN ($1,$2,$3) ORDER BY id',
  };
  return Object.fromEntries(await Promise.all(Object.entries(queries).map(async ([table, sql]) => [table, await db.all(sql, [1, 2, 3])])));
}

export function assertUntouchedNeighbors(before, after) {
  for (const table of Object.keys(before)) {
    const idColumn = table === 'mustahik' ? 'id' : 'mustahik_id';
    for (const id of [2, 3]) {
      const oldRows = before[table].filter((row) => Number(row[idColumn]) === id);
      const newRows = after[table].filter((row) => Number(row[idColumn]) === id);
      if (JSON.stringify(oldRows) !== JSON.stringify(newRows)) throw new Error(`ID1_NEIGHBOR_MUTATED_${table}_${id}`);
    }
  }
}

export async function runBounded({ dryRun = true, config, db, actors, executeSteps, readModel }) {
  assertTarget(config);
  const actorMap = assertActors(actors);
  const [target, neighbors, ppd] = await Promise.all([
    db.get('SELECT id,name,status,workflow_mode,workflow_version,marital_status FROM mustahik WHERE id=$1', [TARGET.id]),
    db.all('SELECT id,name FROM mustahik WHERE id IN ($1,$2) ORDER BY id', [2, 3]),
    db.get('SELECT COUNT(*) AS count FROM ppd WHERE mustahik_id=$1', [TARGET.id]),
  ]);
  assertInitialState({ target, ppdCount: ppd?.count, caseNames: new Map(neighbors.map((row) => [Number(row.id), row.name])) });
  const completed = target.status === 'Pengajuan Dana (FPD)';
  if (!String(target.marital_status || '').trim()) throw new Error('ID1_REQUIRED_SOURCE_MARITAL_STATUS_MISSING');
  const resumable = target.status === 'Survey';
  const boundedResume = target.status === 'Persetujuan MPZIS';
  const existingArtifacts = await db.get('SELECT (SELECT COUNT(*) FROM assessments WHERE mustahik_id=$1) AS assessments, (SELECT COUNT(*) FROM mpzis WHERE mustahik_id=$1) AS mpzis', [TARGET.id]);
  const existingAssignments = await db.all('SELECT user_id,assignment_role FROM mustahik_case_assignments WHERE mustahik_id=$1 AND ended_at IS NULL ORDER BY user_id', [TARGET.id]);
  const existingArtifactCounts = Number(existingArtifacts?.assessments) + Number(existingArtifacts?.mpzis);
  const exactlyOneResume = Number(existingArtifacts?.assessments) === 1 && Number(existingArtifacts?.mpzis) === 1 && (boundedResume || completed);
  if (existingArtifactCounts !== 0 && !exactlyOneResume) throw new Error('ID1_ARTIFACTS_ALREADY_EXIST');
  if (target.status !== 'Diajukan' && JSON.stringify(existingAssignments.map((row) => [Number(row.user_id), row.assignment_role])) !== JSON.stringify([[2, 'staff'], [10, 'leader']])) throw new Error('ID1_RESUME_ASSIGNMENT_GUARD_FAILED');
  const before = await snapshotFixture(db);
  if (completed) {
    const approved = await db.get("SELECT id,status,revision,form_number,approved_amount FROM mpzis WHERE mustahik_id=$1 AND source='p0' ORDER BY revision DESC,id DESC LIMIT 1", [TARGET.id]);
    const approvals = await db.all("SELECT approval_step,actor_id FROM artifact_approvals WHERE mustahik_id=$1 AND artifact_type='mpzis' AND artifact_id=$2 AND artifact_revision=$3 AND action='approve' ORDER BY id", [TARGET.id, approved?.id, approved?.revision]);
    if (approved?.status !== 'approved' || approvals.length !== 5 || JSON.stringify(approvals.map((row) => [row.approval_step, Number(row.actor_id)])) !== JSON.stringify(APPROVALS)) throw new Error('ID1_COMPLETED_STATE_GUARD_FAILED');
    const getWorkspace = readModel || (await import('../server/penyaluran-p0/case-read-model.js')).getP0CaseWorkspace;
    const workspace = await getWorkspace({ actor: actorMap.get(2), db }, TARGET.id);
    assertApprovedReadModel(workspace);
    return { mode: dryRun ? 'dry-run' : 'execute', alreadyComplete: true, target: { id: TARGET.id, name: target.name, status: target.status, version: Number(target.workflow_version) }, mpzis: approved, approvals, ppdCount: 0, writes: 0, caseReadModel: { case_progress: workspace.case_progress, mpzis: workspace.mpzis, ppd: workspace.ppd }, snapshot: before };
  }
  if (dryRun) return { mode: 'dry-run', target: { id: TARGET.id, name: target.name, status: target.status, version: Number(target.workflow_version) }, resumeFrom: boundedResume ? 'mpzis-draft' : resumable ? 'assessment' : null, actorIds: [...actorMap.keys()].sort((a, b) => a - b), ppdCount: 0, writes: 0, snapshot: before };
  if (typeof executeSteps !== 'function') throw new Error('ID1_EXECUTOR_REQUIRED');
  await executeSteps({ target, actorMap });
  const afterPpd = await db.get('SELECT COUNT(*) AS count FROM ppd WHERE mustahik_id=$1', [TARGET.id]);
  if (Number(afterPpd?.count) !== 0) throw new Error('ID1_PPD_CREATED');
  const after = await snapshotFixture(db);
  assertUntouchedNeighbors(before, after);
  const getWorkspace = readModel || (await import('../server/penyaluran-p0/case-read-model.js')).getP0CaseWorkspace;
  const workspace = await getWorkspace({ actor: actorMap.get(2), db }, TARGET.id);
  assertApprovedReadModel(workspace);
  if (after.artifact_approvals.filter((row) => Number(row.mustahik_id) === 1 && row.artifact_type === 'mpzis' && row.action === 'approve').length !== 5) throw new Error('ID1_APPROVAL_COUNT_GUARD_FAILED');
  return { mode: 'execute', targetId: TARGET.id, stoppedAfter: 'mpzis:approved', ppdCount: 0, before, after, caseReadModel: { case_progress: workspace.case_progress, mpzis: workspace.mpzis, ppd: workspace.ppd } };
}

export async function executeCanonical({ db, actorMap, caseId, adapters, fixture }) {
  const actor = (id) => actorMap.get(id);
  const { submitMustahikDecision } = await import('../server/repository.js');
  const assignments = [[2, 'staff'], [10, 'leader']];
  for (const [userId, role] of assignments) await db.run('INSERT INTO mustahik_case_assignments (mustahik_id,user_id,assignment_role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [caseId, userId, role]);
  let current = await db.get('SELECT status,workflow_version FROM mustahik WHERE id=$1', [caseId]);
  if (current.status === 'Diajukan') {
    await submitMustahikDecision(caseId, { action: 'approve', target_status: 'Verifikasi Administrasi', notes: 'Verifikasi berkas', expected_status: current.status, expected_version: Number(current.workflow_version) }, actor(2), db);
    current = await db.get('SELECT status,workflow_version FROM mustahik WHERE id=$1', [caseId]);
  }
  if (current.status === 'Verifikasi Administrasi') {
    await submitMustahikDecision(caseId, { action: 'approve', target_status: 'Survey', notes: 'Lolos berkas', expected_status: current.status, expected_version: Number(current.workflow_version) }, actor(2), db);
  }
  const harness = await adapters.createHarness();
  try {
    const invoke = async (actorId, route, method, data, key) => {
      harness.setActor(actor(actorId));
      const response = await fetch(`${harness.baseUrl}${route}`, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `m6-id1-${key}` }, body: method === 'GET' ? undefined : JSON.stringify(data) });
      const body = await response.json();
      if (!response.ok) throw new Error(`ID1_CANONICAL_STEP_FAILED_${key}_${response.status}:${JSON.stringify({ code: body?.code || body?.error?.code || body?.error || 'unknown', field_errors: body?.field_errors || null })}`);
      return body;
    };
    const prefix = `/api/penyaluran/mustahik/${TARGET.id}`;
    let assessment = await db.get("SELECT id,status,revision,snapshot_hash FROM assessments WHERE mustahik_id=$1 AND source='p0' ORDER BY revision DESC,id DESC LIMIT 1", [TARGET.id]);
    if (!assessment) assessment = (await invoke(2, `${prefix}/assessment/drafts`, 'POST', { expected_version: 2 }, 'assessment-draft')).data;
    if (assessment.status === 'draft') {
      await invoke(2, `${prefix}/assessment/${assessment.id}`, 'PUT', { ...fixture.assessment, expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(assessment.revision) }, 'assessment-save');
      assessment = (await invoke(2, `${prefix}/assessment/${assessment.id}/submit`, 'POST', { ...fixture.assessment, expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(assessment.revision) }, 'assessment-submit')).data;
    }
    if (assessment.status === 'submitted') await invoke(3, `${prefix}/assessment/${assessment.id}/review`, 'POST', { action: 'accept', note: 'UAT Asesmen Valid', expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(assessment.revision), expected_snapshot_hash: assessment.snapshot_hash }, 'assessment-review');

    let mpzis = await db.get("SELECT id,status,revision,snapshot_hash FROM mpzis WHERE mustahik_id=$1 AND source='p0' ORDER BY revision DESC,id DESC LIMIT 1", [TARGET.id]);
    if (!mpzis) mpzis = (await invoke(4, `${prefix}/mpzis/drafts`, 'POST', { expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: 1 }, 'mpzis-draft')).data;
    if (mpzis.status === 'draft') {
      const data = { ...fixture.mpzis, form_number: `${fixture.mpzis.form_number}-ID1`, recipient_section_confirmed: true, fund_source_confirmed: true, expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(mpzis.revision) };
      await invoke(4, `${prefix}/mpzis/${mpzis.id}`, 'PUT', data, 'mpzis-save');
      mpzis = (await invoke(5, `${prefix}/mpzis/${mpzis.id}/submit`, 'POST', { form_number: data.form_number, expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(mpzis.revision) }, 'mpzis-submit')).data;
    }
    for (const [step, actorId] of APPROVALS) {
      const latest = await db.get('SELECT status,revision,snapshot_hash FROM mpzis WHERE id=$1', [mpzis.id]);
      if (latest.status === ({ proposed: 'proposed', examined: 'examined', ashnaf_verified: 'ashnaf_verified', responsible_acknowledged: 'responsible_acknowledged', approved: 'approved' })[step]) continue;
      await invoke(actorId, `${prefix}/mpzis/${mpzis.id}/approvals/${step}`, 'POST', { action: 'approve', note: `UAT ${step} approved`, expected_version: Number((await db.get('SELECT workflow_version FROM mustahik WHERE id=$1', [TARGET.id])).workflow_version), expected_revision: Number(latest.revision), expected_snapshot_hash: latest.snapshot_hash }, `mpzis-${step}`);
    }
  } finally { await harness.close(); }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.argv.includes('--execute')) throw new Error('Use --dry-run or --execute explicitly');
  const envFile = process.env.M6_UAT_ENV_FILE || '/run/secrets/m6-uat.env';
  const env = parseEnv(await fs.readFile(envFile, 'utf8'));
  process.env.DB_PASSWORD = (await fs.readFile(process.env.DB_PASSWORD_FILE || '/run/secrets/m6_staging_postgres_password', 'utf8')).trim();
  process.env.P0_FIELD_ENCRYPTION_KEY = (await fs.readFile(process.env.P0_FIELD_ENCRYPTION_KEY_FILE || '/run/secrets/m6_staging_p0_field_key', 'utf8')).trim();
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ host: process.env.DB_HOST || 'postgres', port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 2 });
  const db = {
    isPg: true,
    pool,
    query: (sql, params = []) => pool.query(sql, params),
    get: async (sql, params = []) => (await pool.query(sql, params)).rows[0] || null,
    all: async (sql, params = []) => (await pool.query(sql, params)).rows,
    run: (sql, params = []) => pool.query(sql, params),
    close: () => pool.end(),
  };
  try {
    const [dbName] = await db.all('SELECT current_database() AS name');
    const { execFileSync } = await import('node:child_process');
    const project = process.env.COMPOSE_PROJECT_NAME || 'baznas-m6-staging';
    const socket = process.env.DOCKER_HOST || 'unix:///run/user/999/docker.sock';
    const containerProject = process.env.COMPOSE_PROJECT_NAME || execFileSync('docker', ['--host', socket, 'inspect', '-f', '{{ index .Config.Labels "com.docker.compose.project" }}', process.env.HOSTNAME], { encoding: 'utf8' }).trim();
    const actorRows = await db.all('SELECT id,name,role,level,division,is_active FROM users WHERE id BETWEEN 2 AND 16');
    const config = { project: containerProject || project, socket, database: dbName.name, applicantName: env.M6_UAT_APPLICANT_NAME };
    const fixture = (await import('../server/fixtures/penyaluran-p0-masked-case.json', { with: { type: 'json' } })).default;
    const result = await runBounded({ dryRun, config, db, actors: actorRows, executeSteps: ({ target, actorMap }) => executeCanonical({ db, actorMap, caseId: target.id, adapters: { createHarness: async () => {
      const express = (await import('express')).default;
      const { registerPenyaluranP0Routes } = await import('../server/penyaluran-p0/routes.js');
      const app = express(); app.use(express.json()); let currentActor;
      registerPenyaluranP0Routes(app, { db, isEnabled: () => true, authenticateToken: (req, res, next) => { if (!currentActor) return res.status(401).json({ error: 'ID1_ACTOR_REQUIRED' }); req.user = currentActor; return next(); } });
      const server = await new Promise((resolve, reject) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
      return { baseUrl: `http://127.0.0.1:${server.address().port}`, setActor: (actor) => { currentActor = actor; }, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
    } }, fixture }) });
    console.log(JSON.stringify(result, null, 2));
  } finally { await db.close?.(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
