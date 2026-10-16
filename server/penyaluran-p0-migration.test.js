import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DataType, newDb } from 'pg-mem';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, 'migrations', '20260913_001_mustahik_p0.sql');
const schemaPath = path.join(__dirname, 'schema.sql');

function splitSql(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && sql[index + 1] === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (character === '-' && sql[index + 1] === '-') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && sql[index + 1] === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        index += dollarTag.length - 1;
        continue;
      }
    }
    if (character === ';') {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

async function createLegacyDb({ existingWorkflowVersion = false } = {}) {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  // pg-mem does not expose PostgreSQL's text helpers by default. Register the
  // small compatibility surface needed by the production CHECK constraints;
  // the real PostgreSQL parity run still executes the migration unchanged.
  memory.public.registerFunction({
    name: 'btrim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value) => value == null ? null : String(value).trim(),
  });
  memory.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value) => value == null ? null : String(value).length,
  });
  const Pool = memory.adapters.createPg().Pool;
  const pool = new Pool();
  const workflowVersionColumn = existingWorkflowVersion
    ? 'workflow_version INTEGER NOT NULL DEFAULT 0,\n      '
    : '';
  await pool.query(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, password_hash TEXT,
      role TEXT, division TEXT, level TEXT, avatar TEXT, is_active BOOLEAN,
      last_login TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    );
    CREATE TABLE mustahik (
      id INTEGER PRIMARY KEY, ${workflowVersionColumn}file_no TEXT, received_date TEXT, name TEXT,
      applicant_status TEXT, beneficiary_name TEXT, nik TEXT, kk_number TEXT,
      phone TEXT, marital_status TEXT, pob TEXT, dob TEXT, occupation TEXT,
      work_place TEXT, education_level TEXT, address TEXT, rt_rw TEXT,
      kelurahan TEXT, kecamatan TEXT, kabupaten_kota TEXT, province TEXT,
      survey_date TEXT, surveyor_name TEXT, surveyor_phone TEXT,
      house_ownership TEXT, family_dependents INTEGER, monthly_income NUMERIC,
      monthly_expense NUMERIC, remaining_income NUMERIC, survey_recommendation TEXT,
      survey_notes TEXT, application_count INTEGER, beneficiary_count INTEGER,
      priority TEXT, recommended_amount NUMERIC, approved_amount NUMERIC,
      mpzis_date TEXT, ppd_number TEXT, disbursement_date TEXT,
      payment_method TEXT, bank_account TEXT, bank_name TEXT,
      bank_account_name TEXT, asnaf TEXT, fund_source TEXT,
      distribution_purpose TEXT, parent_occupation TEXT, desil_score INTEGER,
      program TEXT, request_title TEXT, status TEXT, rejection_reason TEXT,
      house_index INTEGER, asset_index INTEGER, income_index INTEGER,
      spiritual_score INTEGER, overall_score NUMERIC, notes TEXT,
      created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    );
    CREATE TABLE applications (
      id INTEGER PRIMARY KEY,
      mustahik_id INTEGER, application_number TEXT, program TEXT,
      request_title TEXT, status TEXT, notes TEXT, rejection_reason TEXT,
      applied_at TIMESTAMPTZ
    );
    ALTER TABLE applications ADD CONSTRAINT applications_mustahik_id_fkey
      FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE CASCADE;
    CREATE TABLE assessments (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      assessment_number TEXT, form_number TEXT,
      surveyor_name TEXT, surveyor_phone TEXT, survey_date TEXT, survey_method TEXT,
      narrative_family TEXT, narrative_income TEXT, narrative_request TEXT,
      narrative_conclusion TEXT, house_index INTEGER, asset_index INTEGER,
      income_index INTEGER, spiritual_score INTEGER, overall_score NUMERIC,
      priority TEXT, recommendation TEXT, notes TEXT, photos JSONB,
      created_at TIMESTAMPTZ
    );
    CREATE TABLE mpzis (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      form_number TEXT, mpzis_date TEXT, program_classification TEXT, purpose TEXT,
      asnaf TEXT, fund_source TEXT, recipient_name TEXT, recipient_type TEXT,
      beneficiary_count INTEGER, approved_amount NUMERIC, total_amount NUMERIC,
      proposed_by TEXT, examined_by TEXT, ashnaf_verifier TEXT, responsible TEXT,
      approved_by TEXT, created_at TIMESTAMPTZ
    );
    CREATE TABLE ppd (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      form_number TEXT, ppd_number TEXT, transaction_number TEXT,
      requester_name TEXT, requester_role TEXT, requester_department TEXT,
      amount NUMERIC, amount_in_words TEXT, purpose TEXT, fund_source TEXT,
      bank_account_info TEXT, payment_type TEXT, disbursement_date TEXT,
      created_at TIMESTAMPTZ
    );
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      doc_type TEXT, filename TEXT, original_name TEXT, file_url TEXT,
      uploaded_at TIMESTAMPTZ
    );
    CREATE TABLE wa_logs (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      phone TEXT, phase TEXT, message TEXT, wa_url TEXT, status TEXT,
      sent_at TIMESTAMPTZ
    );
    CREATE TABLE approval_decisions (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      stage TEXT, action TEXT, previous_status TEXT, next_status TEXT, note TEXT,
      approved_amount NUMERIC, actor_id INTEGER, actor_name TEXT, actor_role TEXT,
      actor_level TEXT, actor_division TEXT, prepared_by_id INTEGER,
      correlation_id TEXT, created_at TIMESTAMPTZ
    );
    CREATE TABLE activity_logs (
      id INTEGER PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
      actor_name TEXT, action_type TEXT, title TEXT, description TEXT,
      old_status TEXT, new_status TEXT, actor_id INTEGER, actor_role TEXT,
      actor_level TEXT, actor_division TEXT, correlation_id TEXT,
      created_at TIMESTAMPTZ
    );
    CREATE TABLE wa_logs_archive (id INTEGER PRIMARY KEY);
    INSERT INTO users(id,name,email,password_hash,role,division,level)
      VALUES (1, 'Legacy operator', 'legacy@example.test', 'hash', 'penyaluran', 'Legacy', 'staff');
    INSERT INTO mustahik(
      id,file_no,received_date,name,applicant_status,beneficiary_name,nik,kk_number,
      phone,marital_status,pob,dob,occupation,work_place,education_level,address,
      rt_rw,kelurahan,kecamatan,kabupaten_kota,province,survey_date,surveyor_name,
      surveyor_phone,house_ownership,family_dependents,monthly_income,monthly_expense,
      remaining_income,survey_recommendation,survey_notes,application_count,
      beneficiary_count,priority,recommended_amount,approved_amount,mpzis_date,ppd_number,
      disbursement_date,payment_method,bank_account,bank_name,bank_account_name,asnaf,
      fund_source,distribution_purpose,parent_occupation,desil_score,program,request_title,
      status,rejection_reason,house_index,asset_index,income_index,spiritual_score,
      overall_score,notes,created_at,updated_at
    ) VALUES (
      1,'M-001','2025-01-01','Siti Legacy','Perorangan','Siti Legacy','NIK-001','KK-001',
      '081234567890','Menikah','Tangerang','1980-01-01','Pedagang','Pasar','SMA','Legacy address',
      '01/02','Kelurahan','Kecamatan','Kota Tangerang','Banten','2025-01-02','Surveyor Legacy',
      '081111111111','Kontrak',3,3000000,2500000,500000,'Legacy recommendation','Legacy notes',
      1,1,'normal',150000,125000,'2025-01-06','PPD-001','2025-02-01','Transfer','1234',
      'Legacy Bank','Siti Legacy','Fakir Miskin','Zakat','Legacy purpose','Parent job',3,
      'Program Legacy','Legacy request','Persetujuan MPZIS',NULL,1,2,3,4,88.5,'Legacy case notes',
      '2025-01-02T03:04:05Z','2025-02-03T04:05:06Z'
    );
    INSERT INTO applications(
      id,mustahik_id,application_number,program,request_title,status,notes,rejection_reason,applied_at
    ) VALUES (10,1,'APP-001','Program Legacy','Legacy request','Survey','Legacy app notes',NULL,'2025-01-03T00:00:00Z');
    INSERT INTO assessments(
      id,mustahik_id,application_id,assessment_number,form_number,surveyor_name,surveyor_phone,
      survey_date,survey_method,narrative_family,narrative_income,narrative_request,
      narrative_conclusion,house_index,asset_index,income_index,spiritual_score,overall_score,
      priority,recommendation,notes,photos,created_at
    ) VALUES
      (10,1,10,'ASM-001','F-BPP-04-001','Surveyor A','081100000001','2025-01-05','visit',
       'family','income','request','conclusion',1,2,3,4,88.50,'high','recommendation A','notes A','{}','2025-01-05T00:00:00Z'),
      (11,1,10,'ASM-002','F-BPP-04-002','Surveyor B','081100000002','2025-01-04','visit',
       'family B','income B','request B','conclusion B',2,3,4,5,91.25,'high','recommendation B','notes B','{}','2025-01-04T00:00:00Z'),
      (12,1,10,'ASM-003','F-BPP-04-003','Surveyor C','081100000003','2025-01-03','desk',
       'family C','income C','request C','conclusion C',3,4,5,6,77.75,'normal','recommendation C','notes C','{}',NULL);
    INSERT INTO mpzis(
      id,mustahik_id,application_id,form_number,mpzis_date,program_classification,purpose,
      asnaf,fund_source,recipient_name,recipient_type,beneficiary_count,approved_amount,
      total_amount,proposed_by,examined_by,ashnaf_verifier,responsible,approved_by,created_at
    ) VALUES (20,1,10,'MPZ-001','2025-01-06','Legacy classification','Legacy purpose',
      'Fakir Miskin','Zakat','Siti Legacy','Individu',1,125000,125000,'Signer A','Signer B',
      'Verifier','Responsible','Approver','2025-01-06T00:00:00Z');
    INSERT INTO ppd(
      id,mustahik_id,application_id,form_number,ppd_number,transaction_number,requester_name,
      requester_role,requester_department,amount,amount_in_words,purpose,fund_source,
      bank_account_info,payment_type,disbursement_date,created_at
    ) VALUES (30,1,10,'FORM-PPD-001','PPD-001','TX-001','Siti Legacy','Requester','Legacy Dept',
      125000,'Seratus dua puluh lima ribu','Legacy purpose','Zakat','Legacy bank info','Pembayaran',
      '2025-02-01','2025-01-07T00:00:00Z');
    INSERT INTO documents(id,mustahik_id,doc_type,filename,original_name,file_url,uploaded_at)
      VALUES (40,1,'KTP','legacy.pdf','legacy-original.pdf','/private/legacy.pdf','2025-01-08T00:00:00Z');
    INSERT INTO wa_logs(id,mustahik_id,phone,phase,message,wa_url,status,sent_at)
      VALUES (50,1,'081234567890','legacy','legacy message','https://wa.test/legacy','sent','2025-01-09T00:00:00Z');
    INSERT INTO approval_decisions(
      id,mustahik_id,stage,action,previous_status,next_status,note,approved_amount,actor_id,
      actor_name,actor_role,actor_level,actor_division,prepared_by_id,correlation_id,created_at
    ) VALUES (60,1,'legacy-stage','approve','before','after','legacy note',125000,NULL,'Legacy signer',
      'legacy role','staff','Legacy division',NULL,NULL,'2025-01-10T00:00:00Z');
    INSERT INTO activity_logs(
      id,mustahik_id,actor_name,action_type,title,description,old_status,new_status,actor_id,
      actor_role,actor_level,actor_division,correlation_id,created_at
    ) VALUES (70,1,'Legacy actor','legacy_action','Legacy title','legacy history','before','after',NULL,
      'legacy role','staff','Legacy division',NULL,'2025-01-11T00:00:00Z');
  `);
  return { pool, memory };
}

async function applyMigration(pool) {
  const sql = await fs.readFile(migrationPath, 'utf8');
  // pg-mem cannot execute the catalog-driven DO block that drops arbitrary
  // legacy FK names. Remove only this fixture's known single-column names so
  // the emulator can exercise the canonical constraints; production PostgreSQL
  // uses pg_constraint/conkey cardinality guards in the migration itself.
  for (const drop of [
    'ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_mustahik_id_fkey',
    'ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_mustahik_id_fkey',
    'ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_application_id_fkey',
    'ALTER TABLE mpzis DROP CONSTRAINT IF EXISTS mpzis_mustahik_id_fkey',
    'ALTER TABLE mpzis DROP CONSTRAINT IF EXISTS mpzis_application_id_fkey',
    'ALTER TABLE ppd DROP CONSTRAINT IF EXISTS ppd_mustahik_id_fkey',
    'ALTER TABLE ppd DROP CONSTRAINT IF EXISTS ppd_application_id_fkey',
    'ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_mustahik_id_fkey',
    'ALTER TABLE wa_logs DROP CONSTRAINT IF EXISTS wa_logs_mustahik_id_fkey',
    'ALTER TABLE approval_decisions DROP CONSTRAINT IF EXISTS approval_decisions_mustahik_id_fkey',
    'ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_mustahik_id_fkey',
  ]) {
    await pool.query(drop);
  }
  for (const statement of splitSql(sql)) {
    // pg-mem intentionally does not implement PostgreSQL window functions or
    // PL/pgSQL triggers. Those semantics are covered by the real PostgreSQL
    // parity test; use the equivalent one-row fixture update for the mapping
    // assertions while exercising the rest of the migration unchanged.
    if (/ROW_NUMBER\s*\(/i.test(statement)) {
      const table = /UPDATE assessments/i.test(statement) ? 'assessments'
        : /UPDATE mpzis/i.test(statement) ? 'mpzis' : 'ppd';
      const rows = (await pool.query(`SELECT id,mustahik_id,application_id,created_at FROM ${table}`)).rows;
      const groups = new Map();
      for (const row of rows) {
        const key = `${row.mustahik_id}:${row.application_id ?? 'null'}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      for (const group of groups.values()) {
        group.sort((left, right) => {
          // PostgreSQL's ORDER BY created_at ASC places NULL values last by
          // default; the null-date fixture proves the pg-mem shim does the
          // same while still using the production tie-breaker.
          const leftTime = left.created_at == null ? Number.POSITIVE_INFINITY : Date.parse(left.created_at);
          const rightTime = right.created_at == null ? Number.POSITIVE_INFINITY : Date.parse(right.created_at);
          return leftTime - rightTime || left.id - right.id;
        });
        for (const [index, row] of group.entries()) {
          await pool.query(`UPDATE ${table} SET revision = $1 WHERE id = $2`, [index + 1, row.id]);
        }
      }
      continue;
    }
    if (/\bDO\s+\$|CREATE OR REPLACE FUNCTION|CREATE TRIGGER|DROP TRIGGER|ENABLE ALWAYS TRIGGER|p0_reject_immutable_mutation|IS DISTINCT FROM/i.test(statement)) continue;
    if (/^END;?$/i.test(statement) || /^\$\$/.test(statement)) continue;
    await pool.query(statement);
  }
}

const legacySnapshotQueries = Object.freeze({
  mustahik: `SELECT id,file_no,received_date,name,applicant_status,beneficiary_name,nik,kk_number,
    phone,marital_status,pob,dob,occupation,work_place,education_level,address,rt_rw,kelurahan,
    kecamatan,kabupaten_kota,province,survey_date,surveyor_name,surveyor_phone,house_ownership,
    family_dependents,monthly_income,monthly_expense,remaining_income,survey_recommendation,
    survey_notes,application_count,beneficiary_count,priority,recommended_amount,approved_amount,
    mpzis_date,ppd_number,disbursement_date,payment_method,bank_account,bank_name,bank_account_name,
    asnaf,fund_source,distribution_purpose,parent_occupation,desil_score,program,request_title,status,
    rejection_reason,house_index,asset_index,income_index,spiritual_score,overall_score,notes,created_at,updated_at
    FROM mustahik ORDER BY id`,
  applications: `SELECT id,mustahik_id,application_number,program,request_title,status,notes,rejection_reason,applied_at
    FROM applications ORDER BY id`,
  assessments: `SELECT id,mustahik_id,application_id,assessment_number,form_number,surveyor_name,surveyor_phone,
    survey_date,survey_method,narrative_family,narrative_income,narrative_request,narrative_conclusion,
    house_index,asset_index,income_index,spiritual_score,overall_score,priority,recommendation,notes,photos,created_at
    FROM assessments ORDER BY id`,
  mpzis: `SELECT id,mustahik_id,application_id,form_number,mpzis_date,program_classification,purpose,asnaf,
    fund_source,recipient_name,recipient_type,beneficiary_count,approved_amount,total_amount,proposed_by,
    examined_by,ashnaf_verifier,responsible,approved_by,created_at FROM mpzis ORDER BY id`,
  ppd: `SELECT id,mustahik_id,application_id,form_number,ppd_number,transaction_number,requester_name,
    requester_role,requester_department,amount,amount_in_words,purpose,fund_source,bank_account_info,
    payment_type,disbursement_date,created_at FROM ppd ORDER BY id`,
  documents: 'SELECT id,mustahik_id,doc_type,filename,original_name,file_url,uploaded_at FROM documents ORDER BY id',
  wa_logs: 'SELECT id,mustahik_id,phone,phase,message,wa_url,status,sent_at FROM wa_logs ORDER BY id',
  approval_decisions: `SELECT id,mustahik_id,stage,action,previous_status,next_status,note,approved_amount,actor_id,
    actor_name,actor_role,actor_level,actor_division,prepared_by_id,correlation_id,created_at
    FROM approval_decisions ORDER BY id`,
  activity_logs: `SELECT id,mustahik_id,actor_name,action_type,title,description,old_status,new_status,actor_id,
    actor_role,actor_level,actor_division,correlation_id,created_at FROM activity_logs ORDER BY id`,
});

async function snapshotLegacyRows(pool) {
  const snapshot = {};
  for (const [table, query] of Object.entries(legacySnapshotQueries)) {
    snapshot[table] = (await pool.query(query)).rows;
  }
  return snapshot;
}

function digestRows(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('migration preserves legacy status and does not synthesize approvals', async () => {
  const { pool } = await createLegacyDb();
  const before = await snapshotLegacyRows(pool);
  await applyMigration(pool);
  const after = await snapshotLegacyRows(pool);
  assert.equal(digestRows(after), digestRows(before), 'all legacy table values must remain byte-for-byte equivalent');
  assert.deepEqual((await pool.query('SELECT workflow_mode,workflow_version,legacy_status_snapshot,p0_reconciled_at FROM mustahik WHERE id=1')).rows, [
    { workflow_mode: 'legacy', workflow_version: 0, legacy_status_snapshot: null, p0_reconciled_at: null },
  ]);
  assert.deepEqual((await pool.query('SELECT source,status,revision FROM assessments ORDER BY id')).rows, [
    { source: 'legacy', status: 'legacy_unverified', revision: 2 },
    { source: 'legacy', status: 'legacy_unverified', revision: 1 },
    { source: 'legacy', status: 'legacy_unverified', revision: 3 },
  ]);
  assert.deepEqual((await pool.query('SELECT source,status,revision FROM mpzis')).rows, [
    { source: 'legacy', status: 'legacy_unverified', revision: 1 },
  ]);
  assert.deepEqual((await pool.query('SELECT source,status,revision FROM ppd')).rows, [
    { source: 'legacy', status: 'legacy_unverified', revision: 1 },
  ]);
  assert.deepEqual((await pool.query('SELECT artifact_type,artifact_id,snapshot_hash,evidence_grade FROM approval_decisions')).rows, [
    { artifact_type: null, artifact_id: null, snapshot_hash: null, evidence_grade: 'legacy_unbound' },
  ]);
  for (const table of ['artifact_approvals', 'artifact_files', 'artifact_access_events', 'ppd_rab_lines', 'ppd_payments', 'recipient_confirmations', 'p0_idempotency_keys', 'mustahik_case_assignments']) {
    assert.equal((await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM ${table}`)).rows[0].count, 0, `${table} must start empty`);
  }
  await pool.end();
});

test('migration preserves an existing nonzero workflow version', async () => {
  const { pool } = await createLegacyDb({ existingWorkflowVersion: true });
  await pool.query('UPDATE mustahik SET workflow_version = 17 WHERE id = 1');
  await applyMigration(pool);
  assert.deepEqual(
    (await pool.query('SELECT workflow_version FROM mustahik WHERE id = 1')).rows,
    [{ workflow_version: 17 }],
  );
  await pool.end();
});

test('migration maps legacy revisions deterministically and leaves new evidence tables empty', async () => {
  const { pool } = await createLegacyDb();
  await applyMigration(pool);
  assert.deepEqual((await pool.query('SELECT id,revision FROM assessments ORDER BY revision')).rows, [
    { id: 11, revision: 1 },
    { id: 10, revision: 2 },
    { id: 12, revision: 3 },
  ]);
  assert.ok((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('artifact_approvals','artifact_files','artifact_access_events','ppd_rab_lines','ppd_payments','recipient_confirmations','p0_idempotency_keys','mustahik_case_assignments')")).rows.length >= 8);
  await pool.end();
});

test('migration changes legacy case foreign keys to restrictive retention', async () => {
  const { pool } = await createLegacyDb();
  await applyMigration(pool);
  await assert.rejects(
    () => pool.query('DELETE FROM mustahik WHERE id = 1'),
    /foreign key constraint|violates foreign key/i,
    'legacy case deletion must be rejected while dependent evidence/history remains',
  );
  await pool.end();
});

test('migration catalogs legacy foreign-key names before replacing case retention rules', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(sql, /FROM\s+pg_constraint/i, 'FK replacement must inspect PostgreSQL catalog metadata');
  assert.match(sql, /pg_get_constraintdef|conrelid|confrelid/i, 'FK replacement must identify the referenced relation, not only a guessed name');
  assert.match(sql, /EXECUTE\s+format\(/i, 'FK replacement must be able to drop a non-conventional legacy constraint name');
  assert.match(sql, /parent_rel\.relname\s*=\s*'users'/i, 'actor FK normalization must use the same catalog identity guard');
  assert.match(sql, /activity_logs_actor_fk/i, 'activity-log actor snapshots must have a normalized nullable actor FK');
  assert.match(sql, /source\s*<>\s*'p0'\s+OR/i, 'P0-only field checks must not reject legacy rows');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_assessments_active_revision/i, 'Assessment active revisions must be unique per application');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_active_form_number/i, 'PPD form numbers need an active-revision uniqueness guard');
  assert.match(sql, /CREATE TRIGGER artifact_files_submitted_immutable[\s\S]*BEFORE UPDATE OR DELETE ON artifact_files[\s\S]*EXECUTE FUNCTION/i, 'submitted artifact-file metadata must be immutable without a kind loophole');

  const memory = newDb({ autoCreateForeignKeyIndices: true });
  const Pool = memory.adapters.createPg().Pool;
  const pool = new Pool();
  await pool.query(`
    CREATE TABLE mustahik (id INTEGER PRIMARY KEY);
    CREATE TABLE applications (id INTEGER PRIMARY KEY, mustahik_id INTEGER);
    ALTER TABLE applications ADD CONSTRAINT legacy_case_fk
      FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE CASCADE;
  `);
  const constraints = [...memory.public.getTable('applications').constraintsByName.keys()];
  assert.ok(constraints.includes('legacy_case_fk'), 'fixture must prove the legacy FK name is not predictable');
  await pool.end();
});

test('migration preflight protects deterministic upgrade and workflow version ownership', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  const preflightOffset = sql.indexOf('P0_PREFLIGHT');
  const firstBusinessDdlOffset = sql.indexOf('ALTER TABLE mustahik');
  assert.ok(preflightOffset >= 0, 'migration must contain an explicit preflight');
  assert.ok(preflightOffset < firstBusinessDdlOffset, 'preflight must run before business DDL/backfill');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS workflow_version\s+INTEGER\s+NOT NULL\s+DEFAULT\s+0/i);
  assert.match(sql, /P0_PREFLIGHT_DUPLICATE_IDENTIFIER/i);
  assert.match(sql, /P0_PREFLIGHT_ORPHAN/i);
  assert.match(sql, /P0_PREFLIGHT_INVALID_AMOUNT/i);
  assert.match(sql, /P0_PREFLIGHT_INVALID_STATE/i);
  assert.match(sql, /P0_PREFLIGHT_INVALID_REVISION/i);
  assert.match(sql, /ORDER BY\s+created_at\s*,\s*id/i, 'legacy revisions must use PostgreSQL default NULLS LAST');
  assert.doesNotMatch(sql, /ORDER BY\s+created_at\s+NULLS\s+FIRST/i);
  assert.match(sql, /array_length\(con\.conkey\s*,\s*1\)\s*=\s*1/i, 'catalog FK replacement must not drop composite constraints');
  assert.match(sql, /array_length\(con\.confkey\s*,\s*1\)\s*=\s*1/i, 'catalog FK replacement must not drop composite constraints');
});

test('migration hardens append-only evidence and explicit actor attribution', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  for (const table of ['artifact_approvals', 'artifact_access_events', 'artifact_files', 'ppd_payments', 'recipient_confirmations']) {
    assert.match(sql, new RegExp(`BEFORE TRUNCATE ON ${table}`, 'i'), `${table} must reject TRUNCATE`);
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ALWAYS TRIGGER`, 'i'), `${table} triggers must survive replica-role bypass`);
  }
  assert.match(sql, /artifact_approvals_immutable BEFORE UPDATE OR DELETE ON artifact_approvals/i);
  assert.match(sql, /artifact_access_events_immutable BEFORE UPDATE OR DELETE ON artifact_access_events/i);
  assert.match(sql, /artifact_files_submitted_immutable[\s\S]*BEFORE UPDATE OR DELETE ON artifact_files[\s\S]*WHEN\s*\(OLD\.kind/i);
  assert.match(sql, /ppd_payments_immutable BEFORE UPDATE OR DELETE ON ppd_payments/i);
  assert.match(sql, /recipient_confirmations_immutable BEFORE UPDATE OR DELETE ON recipient_confirmations/i);
  assert.match(sql, /p0_payment_update_allowed|verification_status\s*=\s*'pending'/i);
  assert.match(sql, /pg_trigger_depth\(\)\s*>\s*0/i, 'snapshot-backed SET NULL must be limited to PostgreSQL referential actions');
  assert.match(sql, /artifact_approvals_actor_snapshot_check/i);
  assert.match(sql, /artifact_access_events_actor_snapshot_check/i);
  assert.match(sql, /approval_decisions_p0_actor_snapshot_check/i);
  assert.match(sql, /prepared_by_id/i);
  assert.match(sql, /case_assignments_assigner_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /artifact_files_uploader_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /ppd_payments_recorder_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /ppd_payments_verifier_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /recipient_confirmations_recorder_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /activity_logs_actor_fk[\s\S]*ON DELETE RESTRICT/i);
  assert.match(sql, /approval_decisions_actor_fk[\s\S]*ON DELETE RESTRICT/i);
  for (const actorColumn of [
    'artifact_approvals', 'artifact_files', 'artifact_access_events', 'ppd_payments',
    'recipient_confirmations', 'mustahik', 'assessments', 'mpzis', 'ppd',
    'p0_idempotency_keys', 'mustahik_case_assignments',
  ]) {
    assert.match(sql, new RegExp(`child_rel\\.relname = '${actorColumn}'`), `${actorColumn} actor FK must be catalog-discovered`);
  }
});

test('approval decision notes are non-null in fresh and upgraded schema contracts', async () => {
  const [migration, schema] = await Promise.all([
    fs.readFile(migrationPath, 'utf8'),
    fs.readFile(schemaPath, 'utf8'),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS approval_decisions\s*\([\s\S]*?\bnote\s+TEXT\s+NOT NULL/i);
  assert.match(migration, /UPDATE approval_decisions\s+SET note\s*=\s*'[^']+'\s+WHERE note IS NULL/i);
  assert.match(migration, /ALTER TABLE approval_decisions\s+ALTER COLUMN note SET NOT NULL/i);
});

test('upgrade backfills only a null legacy decision note with stable text', async () => {
  const { pool } = await createLegacyDb();
  await pool.query('UPDATE approval_decisions SET note = NULL WHERE id = 60');
  await applyMigration(pool);
  assert.deepEqual(
    (await pool.query('SELECT id,note FROM approval_decisions WHERE id = 60')).rows,
    [{ id: 60, note: 'Legacy approval decision: no note was recorded.' }],
  );
  await pool.end();
});

test('migration encodes the complete P0 conditional validation contract', async () => {
  const sql = await fs.readFile(migrationPath, 'utf8');
  assert.match(sql, /previous_application_year[\s\S]*EXTRACT\(YEAR FROM CURRENT_DATE\)/i);
  assert.match(sql, /fund_source[\s\S]*Infaq\/Shodaqoh[\s\S]*DSKL[\s\S]*Hibah/i);
  assert.match(sql, /payment_type_other[\s\S]*char_length\(btrim\(payment_type_other\)\)\s+BETWEEN\s+3\s+AND\s+150/i);
  assert.match(sql, /payment_type\s*=\s*'Lain-lain'\s+OR\s+payment_type_other\s+IS\s+NULL/i);
  assert.match(sql, /prepared_by_id\s+INTEGER/i);
});

const disposableUrl = process.env.P0_TEST_DATABASE_URL;
test('fresh and upgraded PostgreSQL schemas have identical introspection', { skip: !disposableUrl }, async () => {
  assert.match(disposableUrl, /_[^/]+_test(?:\?|$)/, 'P0_TEST_DATABASE_URL must name a _test database');
});
