import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTOR_ROLES, APPROVALS, assertActors, assertApprovedReadModel, assertInitialState, assertTarget, parseEnv, runBounded, TARGET } from './m6-uat-bootstrap-id1.mjs';

const actorRows = Object.entries(ACTOR_ROLES).map(([id, [role, level]]) => ({ id, role, level, division: role === 'penyaluran' ? 'Penyaluran' : 'Keuangan', is_active: true }));
const config = { project: TARGET.project, socket: TARGET.socket, database: TARGET.database, applicantName: TARGET.name };
const target = { id: 1, name: TARGET.name, status: 'Diajukan', workflow_mode: 'p0', workflow_version: 0, marital_status: 'Menikah' };
const neighbors = [{ id: 2, name: 'M6 UAT Completed Receipt 907d8f989e' }, { id: 3, name: 'M6 UAT Pending PPD Review 907d8f989e' }];
function fakeDb({ ppd = 0, row = target, other = neighbors } = {}) {
  return {
    get: async (sql) => sql.includes('SELECT COUNT(*) AS count FROM ppd') ? { count: ppd } : sql.includes('SELECT (SELECT COUNT') ? { assessments: 0, mpzis: 0 } : row,
    all: async (sql) => sql.includes('mustahik_case_assignments') ? (row.status === 'Diajukan' ? [] : [[2, 'staff'], [10, 'leader']].map(([user_id, assignment_role]) => ({ user_id, assignment_role }))) : other,
  };
}

test('parses env assignments and quoted values', () => {
  assert.deepEqual(parseEnv('M6_UAT_APPLICANT_NAME="M6 UAT Synthetic 907d8f989e"\n# ignored\nX=abc'), { M6_UAT_APPLICANT_NAME: TARGET.name, X: 'abc' });
});

test('pins exact staging identity and applicant name', () => {
  assert.doesNotThrow(() => assertTarget(config));
  for (const field of ['project', 'socket', 'database', 'applicantName']) assert.throws(() => assertTarget({ ...config, [field]: 'wrong' }), /GUARD_FAILED/);
});

test('requires all active canonical actors 2 through 16', () => {
  assert.equal(assertActors(actorRows).size, 15);
  for (const mutate of [(rows) => rows.filter((row) => Number(row.id) !== 12), (rows) => rows.map((row) => Number(row.id) === 3 ? { ...row, is_active: false } : row), (rows) => rows.map((row) => Number(row.id) === 10 ? { ...row, level: 'staff' } : row), (rows) => rows.map((row) => Number(row.id) === 2 ? { ...row, division: 'Keuangan' } : row)]) {
    assert.throws(() => assertActors(mutate(actorRows)), /ID1_ACTOR_GUARD_FAILED/);
  }
});

test('rejects any target mismatch, nonzero PPD, or changed neighboring fixture', () => {
  assert.doesNotThrow(() => assertInitialState({ target, ppdCount: 0, caseNames: new Map(neighbors.map((row) => [row.id, row.name])) }));
  assert.throws(() => assertInitialState({ target: { ...target, id: 2 }, ppdCount: 0, caseNames: new Map([[2, neighbors[0].name], [3, neighbors[1].name]]) }), /CASE_STATE_GUARD/);
  assert.throws(() => assertInitialState({ target, ppdCount: 1, caseNames: new Map([[2, neighbors[0].name], [3, neighbors[1].name]]) }), /PPD_NOT_EMPTY/);
  assert.throws(() => assertInitialState({ target, ppdCount: 0, caseNames: new Map([[2, 'modified'], [3, neighbors[1].name]]) }), /NEIGHBOR_CASE_GUARD/);
});

test('permits only the exact controlled resume checkpoint after earlier canonical steps', () => {
  assert.doesNotThrow(() => assertInitialState({ target: { ...target, status: 'Survey', workflow_version: 2 }, ppdCount: 0, caseNames: new Map(neighbors.map((row) => [row.id, row.name])) }));
  assert.throws(() => assertInitialState({ target: { ...target, status: 'Persetujuan MPZIS', workflow_version: 4 }, ppdCount: 0, caseNames: new Map(neighbors.map((row) => [row.id, row.name])) }), /CASE_STATE_GUARD/);
});

test('accepts only the verified terminal fixture state and null-ID PPD read model', () => {
  const completed = { ...target, status: 'Pengajuan Dana (FPD)', workflow_version: 4 };
  assert.doesNotThrow(() => assertInitialState({ target: completed, ppdCount: 0, caseNames: new Map(neighbors.map((row) => [row.id, row.name])) }));
  assert.doesNotThrow(() => assertApprovedReadModel({ case_progress: { current_stage: 'mpzis', active_artifact: 'mpzis' }, mpzis: { status: 'approved' }, ppd: { id: null, status: null, rab_lines: [] } }));
  assert.throws(() => assertApprovedReadModel({ case_progress: { current_stage: 'mpzis', active_artifact: 'mpzis' }, mpzis: { status: 'approved' }, ppd: { id: 88 } }), /READ_MODEL_GUARD/);
});

test('dry-run performs only bounded reads and never invokes executor', async () => {
  const result = await runBounded({ dryRun: true, config, db: fakeDb(), actors: actorRows, executeSteps: () => assert.fail('write path invoked') });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.writes, 0);
  assert.deepEqual(result.actorIds, Object.keys(ACTOR_ROLES).map(Number));
});

test('execute path verifies PPD remains zero and stops at approved MPZIS', async () => {
  let executed = false;
  const db = { ...fakeDb(), all: async (sql) => sql.includes('artifact_approvals') ? Array.from({ length: 5 }, (_, index) => ({ mustahik_id: 1, artifact_type: 'mpzis', action: 'approve', id: index + 1 })) : sql.includes('mustahik') ? [target, ...neighbors] : [] };
  const result = await runBounded({ dryRun: false, config, db, actors: actorRows, executeSteps: async () => { executed = true; }, readModel: async () => ({ case_progress: { current_stage: 'mpzis', active_artifact: 'mpzis' }, mpzis: { status: 'approved' }, ppd: null }) });
  assert.equal(executed, true);
  assert.equal(result.stoppedAfter, 'mpzis:approved');
  assert.equal(result.ppdCount, 0);
  assert.deepEqual(APPROVALS.map(([step]) => step), ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved']);
});

test('execute path refuses PPD created during workflow', async () => {
  let countReads = 0;
  const db = { ...fakeDb(), get: async (sql) => sql.startsWith('SELECT COUNT(*) AS count FROM ppd') ? { count: ++countReads > 1 ? 1 : 0 } : sql.includes('SELECT (SELECT COUNT') ? { assessments: 0, mpzis: 0 } : target, all: async (sql) => sql.includes('mustahik_case_assignments') ? [] : sql.includes('mustahik') ? [target, ...neighbors] : [] };
  await assert.rejects(runBounded({ dryRun: false, config, db, actors: actorRows, executeSteps: async () => {}, readModel: async () => ({ case_progress: { current_stage: 'mpzis', active_artifact: 'mpzis' }, mpzis: { status: 'approved' }, ppd: null }) }), /ID1_PPD_CREATED/);
});

test('invalid target prevents every write executor call', async () => {
  let invoked = false;
  await assert.rejects(runBounded({ dryRun: false, config, db: fakeDb({ row: { ...target, workflow_version: 2 } }), actors: actorRows, executeSteps: async () => { invoked = true; } }), /CASE_STATE_GUARD/);
  assert.equal(invoked, false);
});

test('missing canonical MPZIS source field blocks before writes', async () => {
  let invoked = false;
  await assert.rejects(runBounded({ config, db: fakeDb({ row: { ...target, marital_status: null } }), actors: actorRows, executeSteps: async () => { invoked = true; } }), /ID1_REQUIRED_SOURCE_MARITAL_STATUS_MISSING/);
  assert.equal(invoked, false);
});

test('already completed fixture dry-run confirms 5/5 and never writes', async () => {
  const completed = { ...target, status: 'Pengajuan Dana (FPD)', workflow_version: 4 };
  const approvals = APPROVALS.map(([approval_step, actor_id]) => ({ approval_step, actor_id }));
  const db = {
    get: async (sql) => {
      if (sql.includes('COUNT(*) AS count FROM ppd')) return { count: 0 };
      if (sql.includes('(SELECT COUNT(*) FROM assessments')) return { assessments: 1, mpzis: 1 };
      if (sql.includes('SELECT id,status,revision,form_number,approved_amount FROM mpzis')) return { id: 3, status: 'approved', revision: 1, form_number: 'MPZIS-2026-09-0012-ID1', approved_amount: 2500000 };
      return completed;
    },
    all: async (sql) => {
      if (sql.includes('SELECT id,name FROM mustahik')) return neighbors;
      if (sql.includes('mustahik_case_assignments')) return [{ user_id: 2, assignment_role: 'staff' }, { user_id: 10, assignment_role: 'leader' }];
      if (sql.includes('SELECT approval_step,actor_id')) return approvals;
      if (sql.includes('FROM mustahik WHERE id IN')) return [completed, ...neighbors];
      return [];
    },
  };
  const result = await runBounded({ dryRun: true, config, db, actors: actorRows, executeSteps: () => assert.fail('completed path must not write'), readModel: async () => ({ case_progress: { current_stage: 'mpzis', active_artifact: 'mpzis' }, mpzis: { status: 'approved' }, ppd: { id: null } }) });
  assert.equal(result.alreadyComplete, true);
  assert.equal(result.writes, 0);
  assert.equal(result.approvals.length, 5);
});
