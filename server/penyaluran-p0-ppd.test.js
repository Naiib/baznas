import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPpdCase,
  createPpdDraft,
  savePpdDraft,
  submitPpd,
  financeCheckPpd,
  financeApprovePpd,
} from './penyaluran-p0/ppd-service.js';
import { createP0TestDatabase } from './penyaluran-p0-test-helpers.js';

test('PPD service exposes draft, submit, and finance commands', () => {
  for (const command of [getPpdCase, createPpdDraft, savePpdDraft, submitPpd, financeCheckPpd, financeApprovePpd]) {
    assert.equal(typeof command, 'function');
  }
});

const creator = { id: 7, name: 'Rina', role: 'penyaluran', level: 'staff', division: 'Penyaluran' };
const checker = { id: 8, name: 'Cek', role: 'keuangan', level: 'staff', division: 'Keuangan' };
const leader = { id: 9, name: 'Pimpinan', role: 'keuangan', level: 'leader', division: 'Keuangan' };
const key = Buffer.alloc(32, 7);

async function fixture() {
  const db = await createP0TestDatabase();
  await db.run("UPDATE mustahik SET status='Pengajuan Dana (FPD)', workflow_mode='p0', workflow_version=1");
  await db.exec('INSERT INTO applications (mustahik_id) VALUES (1);');
  await db.exec("ALTER TABLE mpzis ADD COLUMN approved_amount NUMERIC, ADD COLUMN created_by_id INTEGER, ADD COLUMN template_code TEXT, ADD COLUMN template_version TEXT, ADD COLUMN mpzis_date TEXT, ADD COLUMN purpose TEXT, ADD COLUMN fund_source TEXT");
  const mpzisSnapshot = { total_amount: '1500000.00' };
  await db.run("INSERT INTO mpzis (id,mustahik_id,application_id,revision,status,source,snapshot_json,snapshot_hash,total_amount,approved_amount) VALUES (41,1,1,1,'approved','p0',$1,$2,$3,$3)", [JSON.stringify(mpzisSnapshot), 'a'.repeat(64), '1500000.00']);
  await db.exec("ALTER TABLE ppd ADD COLUMN supersedes_id INTEGER, ADD COLUMN template_code TEXT, ADD COLUMN template_version TEXT, ADD COLUMN submitted_at TIMESTAMPTZ, ADD COLUMN finance_checked_at TIMESTAMPTZ, ADD COLUMN finance_approved_at TIMESTAMPTZ, ADD COLUMN form_number TEXT, ADD COLUMN ppd_number TEXT, ADD COLUMN purpose TEXT, ADD COLUMN fund_source TEXT, ADD COLUMN fund_source_confirmed BOOLEAN, ADD COLUMN payment_type TEXT, ADD COLUMN payment_type_confirmed BOOLEAN, ADD COLUMN payment_type_other TEXT, ADD COLUMN bank_name TEXT, ADD COLUMN bank_account_ciphertext TEXT, ADD COLUMN bank_account_last4 TEXT, ADD COLUMN bank_account_name TEXT, ADD COLUMN requester_name TEXT, ADD COLUMN requester_role TEXT, ADD COLUMN requester_department TEXT, ADD COLUMN amount_in_words TEXT");
  return db;
}
function meta(idempotency_key, revision = 1, hash) { return { idempotency_key, expected_version: 1, expected_revision: revision, ...(hash ? { expected_snapshot_hash: hash } : {}) }; }
const ppdBody = {
  form_number: 'F-PPD-1', ppd_number: 'PPD-1', transaction_number: 'TRX-1', purpose: 'Modal usaha', fund_source: 'Zakat', fund_source_confirmed: true,
  payment_type: 'Pembayaran', payment_type_confirmed: true, bank_name: 'BSI', bank_account_number: '1234567890', bank_account_name: 'Siti',
  rab_lines: [{ line_no: 1, register_number: 'R-1', description: 'Bahan', amount: '1000000.01' }, { line_no: 2, register_number: 'R-2', description: 'Alat', amount: '499999.99' }],
  attachments: [{ file_id: 1, kind: 'supporting_document', mime_type: 'application/pdf', byte_size: 10, sha256: 'b'.repeat(64) }],
};

test('submit derives exact RAB total and terbilang and stores only masked bank data', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create'));
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save'));
  const submitted = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta('submit'));
  assert.equal(submitted.data.amount, '1500000.00');
  assert.equal(submitted.data.amount_in_words, 'Satu Juta Lima Ratus Ribu Rupiah');
  assert.equal(submitted.data.bank_account_last4, '7890');
  assert.equal(submitted.data.bank_account_ciphertext, undefined);
  assert.equal((await db.get('SELECT bank_account_ciphertext FROM ppd WHERE id=$1', [draft.data.id])).bank_account_ciphertext.startsWith('v1:'), true);
});

test('finance check requires Keuangan and approval requires a different leader with stable hash', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-f'));
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-f'));
  const submitted = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta('submit-f'));
  await assert.rejects(financeCheckPpd({ db, actor: creator, mustahik_id: 1 }, draft.data.id, {}, meta('bad-check')), (error) => error.status === 403);
  await financeCheckPpd({ db, actor: checker, mustahik_id: 1 }, draft.data.id, {}, meta('check-f'));
  await assert.rejects(financeApprovePpd({ db, actor: checker, mustahik_id: 1 }, draft.data.id, {}, meta('bad-approve', 1, submitted.data.snapshot_hash)), (error) => error.status === 403);
  const approved = await financeApprovePpd({ db, actor: leader, mustahik_id: 1 }, draft.data.id, {}, meta('approve-f', 1, submitted.data.snapshot_hash));
  assert.equal(approved.data.status, 'finance_approved');
});

test('submit rejects zero and four RAB rows and missing encryption key leaves the draft untouched', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-shape'));
  await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1 }, draft.data.id, ppdBody, meta('save-no-key')), (error) => error.status === 503);
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-shape'));
  const four = { ...ppdBody, rab_lines: [...ppdBody.rab_lines, { line_no: 4, register_number: 'R-4', description: 'Extra', amount: '1.00' }] };
  await assert.rejects(submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, four, meta('submit-four')), (error) => error.status === 422);
  await assert.rejects(submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, { ...ppdBody, rab_lines: [] }, meta('submit-zero')), (error) => error.status === 422);
  const row = await db.get('SELECT status FROM ppd WHERE id=$1', [draft.data.id]); assert.equal(row.status, 'draft');
});

test('PPD rejects client-owned snapshots, references, and bank display claims', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-ownership'));
  for (const field of ['requester_name_snapshot', 'requester_role_snapshot', 'requester_department_snapshot', 'approved_mpzis_id', 'approved_mpzis_revision', 'approved_mpzis_hash', 'bank_account_last4', 'bank_account_ciphertext', 'snapshot_hash']) {
    const payload = { ...ppdBody, [field]: field.endsWith('_id') || field.endsWith('_revision') ? 999 : 'forged' };
    await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, payload, meta(`forbidden-${field}`)), (error) => error.status === 422 && error.field_errors?.[field] === 'FIELD_FORBIDDEN');
  }
});

test('PPD verifies the trusted encrypted account pair before submit', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-bank-pair'));
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-bank-pair'));
  await db.run('UPDATE ppd SET bank_account_last4=$1 WHERE id=$2', ['0000', draft.data.id]);
  await assert.rejects(submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta('submit-bank-pair')), (error) => error.status === 422);
});

test('PPD number conflicts are privacy-safe on draft save', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-number-conflict'));
  await db.run("INSERT INTO ppd (id,mustahik_id,application_id,revision,status,source,form_number,ppd_number,transaction_number) VALUES (99,999,999,1,'submitted','p0',$1,$2,$3)", ['F-PPD-1', 'PPD-OTHER', 'TRX-OTHER']);
  await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-number-conflict')), (error) => error.status === 409 && error.code === 'DUPLICATE_FORM_NUMBER' && !String(error.message).includes('F-PPD-1'));
});

test('PPD detects stale approved MPZIS and ceiling drift before mutating the draft', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-stale-mpzis'));
  await db.run("UPDATE mpzis SET snapshot_hash=$1 WHERE id=41", ['c'.repeat(64)]);
  await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-stale-mpzis')), (error) => error.status === 409 && error.code === 'STALE_ARTIFACT');
  await db.run("UPDATE mpzis SET snapshot_hash=$1 WHERE id=41", ['a'.repeat(64)]);
  const over = { ...ppdBody, rab_lines: [{ line_no: 1, register_number: 'R-1', description: 'Bahan', amount: '1500000.01' }] };
  await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, over, meta('save-over-ceiling')), (error) => error.status === 422 && error.field_errors?.total === 'CEILING');
});

test('PPD supports one and three ordered RAB rows and idempotent submit replay', async () => {
  for (const [index, lines] of [[1, ppdBody.rab_lines.slice(0, 1)], [3, [...ppdBody.rab_lines, { line_no: 3, register_number: 'R-3', description: 'Jasa', amount: '1.00' }]]]) {
    const db = await fixture();
    try {
      const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta(`create-lines-${index}`));
      const body = { ...ppdBody, rab_lines: lines };
      if (index === 3) body.rab_lines[1] = { ...body.rab_lines[1], amount: '499998.99' };
      await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, body, meta(`save-lines-${index}`));
      const first = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta(`submit-lines-${index}`));
      const replay = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta(`submit-lines-${index}`));
      assert.equal(first.data.rab_lines.length, index); assert.equal(replay.replayed, true);
    } finally { await db.close(); }
  }
});

test('finance approval fails when the checked provenance event is missing', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-no-check'));
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-no-check'));
  const submitted = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta('submit-no-check'));
  await db.run("UPDATE ppd SET status='finance_checked' WHERE id=$1", [draft.data.id]);
  await assert.rejects(financeApprovePpd({ db, actor: leader, mustahik_id: 1 }, draft.data.id, {}, meta('approve-no-check', 1, submitted.data.snapshot_hash)), (error) => error.status === 403);
});

test('PPD save and submit require the exact stored approved MPZIS provenance', async () => {
  const cases = [
    ['missing provenance', {}],
    ['same hash with another id', { approved_mpzis_id: 999 }],
    ['same hash with another revision', { approved_mpzis_revision: 2 }],
  ];
  for (const [label, override] of cases) {
    const db = await fixture();
    try {
      const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta(`create-provenance-${label}`));
      const rawSnapshot = (await db.get('SELECT snapshot_json FROM ppd WHERE id=$1', [draft.data.id])).snapshot_json;
      const stored = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
      const snapshot = Object.keys(override).length ? { ...stored, ...override } : { attachments: [] };
      await db.run('UPDATE ppd SET snapshot_json=$1 WHERE id=$2', [JSON.stringify(snapshot), draft.data.id]);
      await assert.rejects(savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta(`save-provenance-${label}`)), (error) => error.code === 'STALE_ARTIFACT' && error.status === 409);
      await assert.rejects(submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta(`submit-provenance-${label}`)), (error) => error.code === 'STALE_ARTIFACT' && error.status === 409);
    } finally { await db.close(); }
  }
});

test('PPD submission retains the trusted MPZIS relation and never persists bank secrets in snapshots or command outputs', async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta('create-redaction'));
  await savePpdDraft({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, ppdBody, meta('save-redaction'));
  const saved = await db.get('SELECT snapshot_json FROM ppd WHERE id=$1', [draft.data.id]);
  assert.doesNotMatch(String(saved.snapshot_json), /1234567890|v1:/);
  const savedSnapshot = typeof saved.snapshot_json === 'string' ? JSON.parse(saved.snapshot_json) : saved.snapshot_json;
  assert.equal(savedSnapshot.bank_account_ciphertext ?? null, null);
  assert.equal(savedSnapshot.bank_account_last4 ?? null, null);
  const submitted = await submitPpd({ db, actor: creator, mustahik_id: 1, encryptionKey: key }, draft.data.id, {}, meta('submit-redaction'));
  const row = await db.get('SELECT mpzis_id,bank_account_ciphertext,bank_account_last4,snapshot_json FROM ppd WHERE id=$1', [draft.data.id]);
  assert.equal(Number(row.mpzis_id), 41);
  assert.match(String(row.bank_account_ciphertext), /^v1:/);
  assert.equal(String(row.bank_account_last4), '7890');
  assert.doesNotMatch(String(row.snapshot_json), /1234567890|v1:/);
  const submittedSnapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
  assert.equal(submittedSnapshot.bank_account_ciphertext ?? null, null);
  assert.equal(submittedSnapshot.bank_account_last4 ?? null, null);
  assert.doesNotMatch(JSON.stringify(submitted), /1234567890|v1:/);
  const idem = await db.get("SELECT response_json FROM p0_idempotency_keys WHERE actor_id=$1 AND idempotency_key=$2", [creator.id, 'submit-redaction']);
  assert.doesNotMatch(String(idem.response_json), /1234567890|v1:/);
  const approvals = await db.all("SELECT note FROM artifact_approvals WHERE artifact_type='ppd' AND artifact_id=$1", [draft.data.id]);
  const activity = await db.all('SELECT title,description FROM activity_logs WHERE mustahik_id=1');
  assert.doesNotMatch(JSON.stringify([...approvals, ...activity]), /1234567890|v1:/);
});

test("getPpdCase enforces case assignment scoping (BOLA remediation)", async (t) => {
  const db = await fixture(); t.after(() => db.close());
  const draft = await createPpdDraft({ db, actor: creator }, 1, {}, meta("create-scoping"));

  // Kasus memiliki active assignment untuk user 7 (creator / Penyaluran staff)
  await db.run(
    "INSERT INTO mustahik_case_assignments (mustahik_id, user_id, assignment_role, assigned_by_id) VALUES (1, 7, 'penyaluran', 1)"
  );

  // Aktor Keuangan user 12 (unassigned) mencoba membaca PPD kasus 1 -> 403
  const unassignedFinance = { id: 12, name: "Finance Staff", role: "keuangan", level: "staff", division: "Keuangan" };
  await assert.rejects(
    getPpdCase({ db, actor: unassignedFinance }, 1),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "PERMISSION_DENIED");
      assert.match(error.message, /penugasan aktif/i);
      return true;
    }
  );

  // Aktor Penyaluran user 99 (unassigned) mencoba membaca PPD kasus 1 -> 403
  const unassignedStaff = { id: 99, name: "Other Staff", role: "penyaluran", level: "staff", division: "Penyaluran" };
  await assert.rejects(
    getPpdCase({ db, actor: unassignedStaff }, 1),
    (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "PERMISSION_DENIED");
      return true;
    }
  );

  // Aktor user 7 (assigned) membaca PPD kasus 1 -> berhasil 200
  const assignedResult = await getPpdCase({ db, actor: creator }, 1);
  assert.equal(assignedResult.success, true);
  assert.equal(assignedResult.data.mustahik_id, 1);
  assert.equal(assignedResult.data.ppd.id, draft.data.id);

  // Admin (cross_case_audit) membaca PPD kasus 1 -> berhasil 200
  const adminActor = { id: 999, name: "System Admin", role: "admin", level: "admin", division: "IT" };
  const adminResult = await getPpdCase({ db, actor: adminActor }, 1);
  assert.equal(adminResult.success, true);
  assert.equal(adminResult.data.mustahik_id, 1);
  assert.equal(adminResult.data.ppd.id, draft.data.id);
});
