import test from 'node:test';
import assert from 'node:assert/strict';
import { createMpzisDraft, saveMpzisDraft, submitMpzis, decideMpzisStep } from './penyaluran-p0/mpzis-service.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';

test('MPZIS service exposes the revision and approval commands', () => {
  assert.equal(typeof createMpzisDraft, 'function');
  assert.equal(typeof saveMpzisDraft, 'function');
  assert.equal(typeof submitMpzis, 'function');
  assert.equal(typeof decideMpzisStep, 'function');
});

const creator = { id: 7, name: 'Creator', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const submitter = { id: 8, name: 'Submitter', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const staff = [10, 11, 12].map((id) => ({ id, name: `Staff ${id}`, role: 'penyaluran', level: 'staff', division: 'Penyaluran' }));
const leaders = [13, 14].map((id) => ({ id, name: `Leader ${id}`, role: 'penyaluran', level: 'leader', division: 'Penyaluran' }));
const mpzisFields = {
  form_number: 'F-BPP/06-001', mpzis_date: '2026-09-13', program_classification: 'Tangerang Makmur', purpose: 'Modal usaha', asnaf: 'Fakir Miskin',
  fund_source: 'Zakat', recipient_name: 'Siti', recipient_type: 'Individu', beneficiary_count: 1, total_amount: '1250000.00',
  recipient_section_confirmed: true, fund_source_confirmed: true,
};

async function fixture() {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Persetujuan MPZIS', workflow_mode='p0', workflow_version=1");
  await db.exec("ALTER TABLE mustahik ADD COLUMN address TEXT, ADD COLUMN rt_rw TEXT, ADD COLUMN kelurahan TEXT, ADD COLUMN kecamatan TEXT, ADD COLUMN kabupaten_kota TEXT, ADD COLUMN province TEXT, ADD COLUMN approved_amount NUMERIC, ADD COLUMN mpzis_date TEXT, ADD COLUMN asnaf TEXT, ADD COLUMN fund_source TEXT, ADD COLUMN distribution_purpose TEXT");
  await db.run("UPDATE mustahik SET address='Jalan Mawar',rt_rw='01/02',kelurahan='Sukarasa',kecamatan='Tangerang',kabupaten_kota='Kota Tangerang',province='Banten',marital_status='Menikah'");
  await db.exec('INSERT INTO applications (mustahik_id) VALUES (1);');
  await db.exec("ALTER TABLE assessments ADD COLUMN template_code TEXT, ADD COLUMN template_version TEXT, ADD COLUMN supersedes_id INTEGER, ADD COLUMN submitted_at TIMESTAMPTZ, ADD COLUMN reviewed_at TIMESTAMPTZ");
  const accepted = { schema_version: 1, artifact_type: 'assessment', id: 21, revision: 1, mustahik_id: 1, application_id: 1, source: 'p0' };
  await db.run("INSERT INTO assessments (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash,template_code,template_version) VALUES (21,1,1,1,'accepted','p0',$1,$2,'ASSESSMENT_LANGSUNG_MUSTAHIK','2026-09-13')", [JSON.stringify(accepted), 'a'.repeat(64)]);
  await db.exec("ALTER TABLE mpzis ADD COLUMN supersedes_id INTEGER, ADD COLUMN template_code TEXT, ADD COLUMN template_version TEXT, ADD COLUMN created_by_id INTEGER, ADD COLUMN submitted_by_id INTEGER, ADD COLUMN submitted_at TIMESTAMPTZ, ADD COLUMN approved_at TIMESTAMPTZ, ADD COLUMN address_snapshot JSONB, ADD COLUMN marital_status_snapshot TEXT, ADD COLUMN recipient_section_confirmed BOOLEAN, ADD COLUMN fund_source_confirmed BOOLEAN, ADD COLUMN mpzis_date TEXT, ADD COLUMN program_classification TEXT, ADD COLUMN purpose TEXT, ADD COLUMN asnaf TEXT, ADD COLUMN fund_source TEXT, ADD COLUMN recipient_type TEXT, ADD COLUMN beneficiary_count INTEGER");
  return db;
}

function meta(key, hash, revision = 1) { return { idempotency_key: key, expected_version: 1, expected_revision: revision, ...(hash ? { expected_snapshot_hash: hash } : {}) }; }

test('draft is seeded from the accepted Assessment and Mustahik snapshots', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const result = await createMpzisDraft({ db, actor: creator }, 1, {}, meta('draft-seed'));
  assert.equal(result.data.status, 'draft');
  assert.deepEqual(result.data.source_fields.address_snapshot, { address: 'Jalan Mawar', rt_rw: '01/02', kelurahan: 'Sukarasa', kecamatan: 'Tangerang', kabupaten_kota: 'Kota Tangerang', province: 'Banten' });
  assert.equal(result.data.source_fields.marital_status_snapshot, 'Menikah');
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM artifact_approvals WHERE artifact_type='mpzis'")).count), 0);
});

test('submit freezes one hash and five distinct ordered approvals project only at step five', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createMpzisDraft({ db, actor: creator }, 1, {}, meta('draft-happy'));
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, mpzisFields, meta('save-happy'));
  const submitted = await submitMpzis({ db, actor: submitter, mustahik_id: 1 }, draft.data.id, {}, meta('submit-happy'));
  const hash = submitted.data.snapshot_hash; assert.match(hash, /^[a-f0-9]{64}$/); assert.equal(submitted.data.status, 'submitted');
  for (const [index, approver] of [...staff, ...leaders].entries()) {
    const result = await decideMpzisStep({ db, actor: approver, mustahik_id: 1 }, draft.data.id, ['proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved'][index], { action: 'approve' }, meta(`approve-${index}`, hash));
    assert.equal(result.data.snapshot_hash, hash);
    if (index < 4) assert.equal((await db.get('SELECT approved_amount FROM mustahik WHERE id=1')).approved_amount, null);
  }
  const caseRow = await db.get('SELECT status,approved_amount FROM mustahik WHERE id=1');
  assert.equal(caseRow.status, 'Pengajuan Dana (FPD)'); assert.equal(Number(caseRow.approved_amount), 1250000);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM artifact_approvals WHERE artifact_type='mpzis' AND action='approve'")).count), 5);
});

test('creator and reused actors are rejected without writing an approval', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createMpzisDraft({ db, actor: creator }, 1, mpzisFields, meta('draft-seg'));
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, mpzisFields, meta('save-seg'));
  const submitted = await submitMpzis({ db, actor: submitter, mustahik_id: 1 }, draft.data.id, {}, meta('submit-seg'));
  await assert.rejects(decideMpzisStep({ db, actor: creator, mustahik_id: 1 }, draft.data.id, 'proposed', { action: 'approve' }, meta('bad-self', submitted.data.snapshot_hash)), (error) => error.status === 403 && error.code === 'ACTOR_SEPARATION');
  await decideMpzisStep({ db, actor: staff[0], mustahik_id: 1 }, draft.data.id, 'proposed', { action: 'approve' }, meta('good-one', submitted.data.snapshot_hash));
  await assert.rejects(decideMpzisStep({ db, actor: staff[0], mustahik_id: 1 }, draft.data.id, 'examined', { action: 'approve' }, meta('bad-reuse', submitted.data.snapshot_hash)), (error) => error.status === 403 && error.code === 'ACTOR_SEPARATION');
});

test('return freezes a revision and successor increments revision without copying approvals', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createMpzisDraft({ db, actor: creator }, 1, mpzisFields, meta('draft-return'));
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, mpzisFields, meta('save-return'));
  const submitted = await submitMpzis({ db, actor: submitter, mustahik_id: 1 }, draft.data.id, {}, meta('submit-return'));
  const returned = await decideMpzisStep({ db, actor: staff[0], mustahik_id: 1 }, draft.data.id, 'proposed', { action: 'return', note: 'Mohon koreksi nominal dan tujuan bantuan.' }, meta('return-step', submitted.data.snapshot_hash));
  assert.equal(returned.data.status, 'returned');
  const next = await createMpzisDraft({ db, actor: creator }, 1, { note: 'Koreksi sesuai catatan pemeriksa.' }, meta('successor'));
  assert.equal(next.data.revision, 2); assert.equal(next.data.supersedes_id, draft.data.id); assert.equal(next.data.snapshot_hash, null);
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM artifact_approvals WHERE artifact_type='mpzis' AND action='approve'")).count), 0);
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, next.data.id, mpzisFields, meta('save-successor', null, 2));
  const successorSubmit = await submitMpzis({ db, actor: submitter, mustahik_id: 1 }, next.data.id, {}, meta('submit-successor', null, 2));
  assert.equal(successorSubmit.data.status, 'submitted'); assert.match(successorSubmit.data.snapshot_hash, /^[a-f0-9]{64}$/);
});

test('same creator and submitter is rejected with no preparation side effects', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createMpzisDraft({ db, actor: creator }, 1, mpzisFields, meta('draft-same-actor'));
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, mpzisFields, meta('save-same-actor'));
  await assert.rejects(submitMpzis({ db, actor: creator, mustahik_id: 1 }, draft.data.id, {}, meta('submit-same-actor')), (error) => error.status === 403 && error.code === 'ACTOR_SEPARATION');
  assert.equal((await db.get('SELECT status,submitted_by_id,snapshot_hash FROM mpzis WHERE id=$1', [draft.data.id])).status, 'draft');
  assert.equal(Number((await db.get("SELECT COUNT(*) AS count FROM artifact_approvals WHERE artifact_type='mpzis'")).count), 0);
});

test('submit rejects a form number used by another active MPZIS revision', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createMpzisDraft({ db, actor: creator }, 1, mpzisFields, meta('draft-collision'));
  await saveMpzisDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, mpzisFields, meta('save-collision'));
  await db.run("INSERT INTO mpzis (id,mustahik_id,revision,status,source,form_number) VALUES (99,1,99,'submitted','p0',$1)", [mpzisFields.form_number]);
  await assert.rejects(submitMpzis({ db, actor: submitter, mustahik_id: 1 }, draft.data.id, {}, meta('submit-collision')), (error) => error.status === 409 && error.code === 'DUPLICATE_FORM_NUMBER');
});
