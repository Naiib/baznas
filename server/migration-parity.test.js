import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  assertDisposableTestDatabaseUrl,
  migrationChecksum,
  readMigrationFiles,
  runPendingMigrations,
} from './penyaluran-p0/migration-runner.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
const migrationPath = path.join(migrationsDir, '20260913_001_mustahik_p0.sql');
const schemaPath = path.join(__dirname, 'schema.sql');
const migrationVersion = '20260913_001';
const legacyPreservationTables = Object.freeze([
  'mustahik', 'applications', 'assessments', 'mpzis', 'ppd', 'documents',
  'approval_decisions', 'activity_logs', 'wa_logs', 'ppd_payments',
  'recipient_confirmations',
]);
const migrationTables = Object.freeze([
  'mustahik',
  'applications',
  'assessments',
  'mpzis',
  'ppd',
  'documents',
  'wa_logs',
  'approval_decisions',
  'activity_logs',
  'artifact_approvals',
  'artifact_files',
  'artifact_access_events',
  'ppd_rab_lines',
  'ppd_payments',
  'recipient_confirmations',
  'p0_idempotency_keys',
  'mustahik_case_assignments',
  'schema_migrations',
  'users',
]);

function randomSchema(prefix) {
  return `${prefix}_${cryptoRandomHex(10)}`;
}

function cryptoRandomHex(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function quoteIdentifier(identifier) {
  assert.match(identifier, /^p0_(?:parity_(?:fresh|upgrade|preflight|triggers|missing)|negative_(?:income|disbursement))_[0-9a-f]+$/);
  return `"${identifier}"`;
}

function quoteSqlIdentifier(identifier) {
  assert.match(identifier, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return `"${identifier}"`;
}

const legacyFixtureSql = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'penyaluran',
  division VARCHAR(100) DEFAULT 'Divisi Penyaluran', level VARCHAR(20) NOT NULL DEFAULT 'staff',
  avatar VARCHAR(255), is_active BOOLEAN DEFAULT TRUE, last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE mustahik (
  id SERIAL PRIMARY KEY, file_no VARCHAR(50) UNIQUE, received_date VARCHAR(50),
  name VARCHAR(255) NOT NULL, applicant_status VARCHAR(50) DEFAULT 'Perorangan',
  beneficiary_name VARCHAR(255), nik VARCHAR(50), kk_number VARCHAR(50), phone VARCHAR(50),
  marital_status VARCHAR(50), pob VARCHAR(100), dob VARCHAR(50), occupation VARCHAR(100),
  work_place VARCHAR(150), education_level VARCHAR(50), address TEXT, rt_rw VARCHAR(50),
  kelurahan VARCHAR(100), kecamatan VARCHAR(100), kabupaten_kota VARCHAR(100) DEFAULT 'Kota Tangerang',
  province VARCHAR(100) DEFAULT 'Banten', survey_date VARCHAR(50), surveyor_name VARCHAR(150),
  surveyor_phone VARCHAR(50), house_ownership VARCHAR(50), family_dependents INTEGER DEFAULT 0,
  monthly_income NUMERIC(15,2) DEFAULT 0, monthly_expense NUMERIC(15,2) DEFAULT 0,
  remaining_income NUMERIC(15,2) DEFAULT 0, survey_recommendation TEXT, survey_notes TEXT,
  application_count INTEGER DEFAULT 1, beneficiary_count INTEGER DEFAULT 1, priority VARCHAR(50),
  recommended_amount NUMERIC(15,2) DEFAULT 0, approved_amount NUMERIC(15,2) DEFAULT 0,
  mpzis_date VARCHAR(50), ppd_number VARCHAR(100), disbursement_date VARCHAR(50),
  payment_method VARCHAR(50), bank_account VARCHAR(100), bank_name VARCHAR(100),
  bank_account_name VARCHAR(150), asnaf VARCHAR(100) DEFAULT 'Fakir Miskin',
  fund_source VARCHAR(100) DEFAULT 'Zakat', distribution_purpose TEXT, parent_occupation VARCHAR(100),
  desil_score INTEGER, program VARCHAR(100), request_title TEXT, status VARCHAR(100) DEFAULT 'Diajukan',
  rejection_reason TEXT, house_index INTEGER, asset_index INTEGER, income_index INTEGER,
  spiritual_score INTEGER, overall_score NUMERIC(5,2), notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE applications (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  application_number VARCHAR(100), program VARCHAR(100), request_title TEXT,
  status VARCHAR(100) DEFAULT 'Diajukan', notes TEXT, rejection_reason TEXT,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE assessments (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  surveyor_name VARCHAR(150), surveyor_phone VARCHAR(50), survey_date VARCHAR(50), survey_method VARCHAR(100),
  narrative_family TEXT, narrative_income TEXT, narrative_request TEXT, narrative_conclusion TEXT,
  house_index INTEGER, asset_index INTEGER, income_index INTEGER, spiritual_score INTEGER,
  overall_score NUMERIC(5,2), priority VARCHAR(50), recommendation TEXT, notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE mpzis (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  form_number VARCHAR(100), mpzis_date VARCHAR(50), program_classification VARCHAR(150),
  purpose TEXT, asnaf VARCHAR(100), fund_source VARCHAR(100), recipient_name VARCHAR(255),
  recipient_type VARCHAR(100), beneficiary_count INTEGER DEFAULT 1, approved_amount NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2) DEFAULT 0, proposed_by VARCHAR(150), examined_by VARCHAR(150),
  ashnaf_verifier VARCHAR(150), responsible VARCHAR(150), approved_by VARCHAR(150),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ppd (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  form_number VARCHAR(100), ppd_number VARCHAR(100), transaction_number VARCHAR(100),
  requester_name VARCHAR(150), requester_role VARCHAR(100), requester_department VARCHAR(100),
  amount NUMERIC(15,2) DEFAULT 0, amount_in_words TEXT, purpose TEXT, fund_source VARCHAR(100),
  bank_account_info TEXT, payment_type VARCHAR(50), disbursement_date VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE documents (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  doc_type VARCHAR(100), filename VARCHAR(255) NOT NULL, original_name VARCHAR(255),
  file_url TEXT NOT NULL, uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE wa_logs (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  phone VARCHAR(50), phase VARCHAR(100), message TEXT, wa_url TEXT,
  status VARCHAR(50) DEFAULT 'sent', sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE approval_decisions (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER NOT NULL REFERENCES mustahik(id) ON DELETE CASCADE,
  stage VARCHAR(100) NOT NULL, action VARCHAR(30) NOT NULL, previous_status VARCHAR(100) NOT NULL,
  next_status VARCHAR(100) NOT NULL, note TEXT NOT NULL, approved_amount NUMERIC,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL, actor_level VARCHAR(30), actor_division VARCHAR(100),
  prepared_by_id INTEGER, correlation_id VARCHAR(100), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY, mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
  actor_name VARCHAR(255), action_type VARCHAR(100), title VARCHAR(255), description TEXT,
  old_status VARCHAR(100), new_status VARCHAR(100), actor_id INTEGER, actor_role VARCHAR(100),
  actor_level VARCHAR(30), actor_division VARCHAR(100), correlation_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO users(id,name,email,password_hash,role,division,level) VALUES
  (1,'Parity operator','parity@example.test','hash','penyaluran','Legacy','staff');
INSERT INTO mustahik(
  file_no,received_date,name,applicant_status,beneficiary_name,nik,kk_number,phone,marital_status,pob,dob,
  occupation,work_place,education_level,address,rt_rw,kelurahan,kecamatan,kabupaten_kota,province,survey_date,
  surveyor_name,surveyor_phone,house_ownership,family_dependents,monthly_income,monthly_expense,remaining_income,
  survey_recommendation,survey_notes,application_count,beneficiary_count,priority,recommended_amount,approved_amount,
  mpzis_date,ppd_number,disbursement_date,payment_method,bank_account,bank_name,bank_account_name,asnaf,fund_source,
  distribution_purpose,parent_occupation,desil_score,program,request_title,status,rejection_reason,house_index,
  asset_index,income_index,spiritual_score,overall_score,notes,created_at,updated_at
) VALUES (
  'P0-PARITY','2025-01-01','Parity fixture','Perorangan','Parity fixture','NIK-PARITY','KK-PARITY','081234567890',
  'Menikah','Tangerang','1980-01-01','Trader','Market','SMA','Parity address','01/02','Kelurahan','Kecamatan',
  'Kota Tangerang','Banten','2025-01-02','Parity surveyor','081111111111','Kontrak',2,3000000,2500000,500000,
  'Legacy recommendation','Legacy notes',1,1,'normal',150000,100000,'2025-01-06','PPD-PARITY','2025-02-01',
  'Transfer','1234','Legacy Bank','Parity fixture','Fakir Miskin','Zakat','Legacy purpose','Parent job',3,
  'Legacy program','Legacy request','Persetujuan MPZIS',NULL,1,2,3,4,88.5,'Legacy text',
  '2025-01-01T00:00:00Z','2025-01-02T00:00:00Z'
);
INSERT INTO applications(mustahik_id,application_number,program,request_title,status,notes,rejection_reason,applied_at)
  VALUES (1,'PARITY-APP','Legacy program','Legacy request','Survey','Legacy app text',NULL,'2025-01-03');
INSERT INTO assessments(
  mustahik_id,application_id,surveyor_name,surveyor_phone,survey_date,survey_method,narrative_family,
  narrative_income,narrative_request,narrative_conclusion,house_index,asset_index,income_index,spiritual_score,
  overall_score,priority,recommendation,notes,photos,created_at
) VALUES
  (1,1,'Parity surveyor','081100000001','2025-01-05','visit','family','income','request','conclusion',1,2,3,4,88.5,'high','recommendation','assessment text','{}','2025-01-05'),
  (1,1,'Parity surveyor 2','081100000002','2025-01-04','desk','family2','income2','request2','conclusion2',2,3,4,5,91.25,'high','recommendation2','assessment text2','{}',NULL);
INSERT INTO mpzis(
  mustahik_id,application_id,form_number,mpzis_date,program_classification,purpose,asnaf,fund_source,
  recipient_name,recipient_type,beneficiary_count,approved_amount,total_amount,proposed_by,examined_by,
  ashnaf_verifier,responsible,approved_by,created_at
) VALUES (1,1,'MPZ-PARITY','2025-01-06','Legacy classification','Legacy purpose','Fakir Miskin','Zakat',
  'Parity fixture','Individu',1,100000,100000,'Signer A','Signer B','Verifier','Responsible','Approver','2025-01-06');
INSERT INTO ppd(
  mustahik_id,application_id,form_number,ppd_number,transaction_number,requester_name,requester_role,
  requester_department,amount,amount_in_words,purpose,fund_source,bank_account_info,payment_type,
  disbursement_date,created_at
) VALUES (1,1,'FORM-PARITY','PPD-PARITY','TX-PARITY','Parity fixture','Requester','Legacy Dept',100000,
  'Seratus ribu','Legacy purpose','Zakat','Legacy bank info','Pembayaran','2025-02-01','2025-01-07');
CREATE TABLE ppd_payments (
  id SERIAL PRIMARY KEY, ppd_id INTEGER NOT NULL, transaction_number VARCHAR(100) NOT NULL,
  paid_amount NUMERIC(15,2) NOT NULL, paid_at TIMESTAMPTZ NOT NULL, proof_file_id INTEGER,
  recorded_by_id INTEGER, verification_status VARCHAR(20) NOT NULL DEFAULT 'verified',
  verified_by_id INTEGER, verified_at TIMESTAMPTZ, snapshot_hash CHAR(64),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE recipient_confirmations (
  id SERIAL PRIMARY KEY, ppd_id INTEGER NOT NULL, method VARCHAR(30) NOT NULL,
  recipient_name_snapshot VARCHAR(255) NOT NULL, confirmed_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL, evidence_file_id INTEGER, recorded_by_id INTEGER,
  snapshot_hash CHAR(64), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO ppd_payments(
  id,ppd_id,transaction_number,paid_amount,paid_at,proof_file_id,recorded_by_id,
  verification_status,verified_by_id,verified_at,snapshot_hash
) VALUES (1,1,'TX-PARITY',100000,'2025-02-02T00:00:00Z',NULL,1,'verified',1,
  '2025-02-03T00:00:00Z',repeat('e',64));
INSERT INTO recipient_confirmations(
  id,ppd_id,method,recipient_name_snapshot,confirmed_at,note,evidence_file_id,recorded_by_id,snapshot_hash
) VALUES (1,1,'Telepon','Parity fixture','2025-02-04T00:00:00Z','Legacy confirmation',NULL,1,repeat('f',64));
INSERT INTO documents(mustahik_id,doc_type,filename,original_name,file_url,uploaded_at)
  VALUES (1,'KTP','legacy.pdf','legacy-original.pdf','/private/legacy.pdf','2025-01-08');
INSERT INTO wa_logs(mustahik_id,phone,phase,message,wa_url,status,sent_at)
  VALUES (1,'081234567890','legacy','legacy message','https://wa.test/legacy','sent','2025-01-09');
INSERT INTO approval_decisions(
  mustahik_id,stage,action,previous_status,next_status,note,approved_amount,actor_id,actor_name,actor_role,
  actor_level,actor_division,prepared_by_id,correlation_id,created_at
) VALUES (1,'legacy-stage','approve','before','after','legacy note',100000,1,'Parity signer','legacy role','staff',
  'Legacy',1,'123e4567-e89b-12d3-a456-426614174000','2025-01-10');
INSERT INTO activity_logs(
  mustahik_id,actor_name,action_type,title,description,old_status,new_status,actor_id,actor_role,actor_level,
  actor_division,correlation_id,created_at
) VALUES (1,'Parity actor','legacy_action','Legacy title','legacy history','before','after',1,'legacy role','staff',
  'Legacy','123e4567-e89b-12d3-a456-426614174001','2025-01-11');
INSERT INTO activity_logs(
  mustahik_id,actor_name,action_type,title,description,old_status,new_status,actor_id,actor_role,actor_level,
  actor_division,correlation_id,created_at
) VALUES (NULL,'System Export','REPORT_EXPORT','Export report','Target: report.pdf',NULL,NULL,1,'admin','admin',
  'IT','123e4567-e89b-12d3-a456-426614174002','2025-01-12');
CREATE INDEX idx_mustahik_file_no ON mustahik(file_no);
CREATE INDEX idx_mustahik_nik ON mustahik(nik);
CREATE INDEX idx_mustahik_phone ON mustahik(phone);
CREATE INDEX idx_mustahik_status ON mustahik(status);
CREATE INDEX idx_mustahik_program ON mustahik(program);
CREATE INDEX idx_mustahik_received_date ON mustahik(received_date);
CREATE INDEX idx_mustahik_kecamatan ON mustahik(kecamatan);
CREATE INDEX idx_mustahik_created_at ON mustahik(created_at);
CREATE INDEX idx_mustahik_asnaf ON mustahik(asnaf);
CREATE INDEX idx_mustahik_status_program ON mustahik(status, program);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_applications_mustahik_id ON applications(mustahik_id);
CREATE INDEX idx_assessments_mustahik_id ON assessments(mustahik_id);
CREATE INDEX idx_mpzis_mustahik_id ON mpzis(mustahik_id);
CREATE INDEX idx_ppd_mustahik_id ON ppd(mustahik_id);
CREATE INDEX idx_documents_mustahik_id ON documents(mustahik_id);
CREATE INDEX idx_wa_logs_mustahik_id ON wa_logs(mustahik_id);
CREATE INDEX idx_approval_decisions_mustahik ON approval_decisions(mustahik_id, created_at DESC);
`;

async function withSchema(client, schema, callback) {
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
    return await callback();
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`);
  }
}

async function applyVersionedMigration(client, migrationSql, checksum, version = migrationVersion) {
  await client.query('BEGIN');
  try {
    await client.query(migrationSql);
    await client.query(
      `INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)`,
      [version, checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function readVersionedMigrations() {
  return readMigrationFiles(migrationsDir);
}

async function applyVersionedMigrations(client, migrations) {
  for (const migration of migrations) await applyVersionedMigration(client, migration.sql, migration.checksum, migration.version);
}

function normalizeSql(value) {
  return String(value ?? '')
    .replace(/"?p0_parity_(?:fresh|upgrade)_[0-9a-f]+"?\./gi, '__schema__.')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeIntentionalLegacySnapshotNullability(introspection) {
  return {
    ...introspection,
    columns: introspection.columns.map((row) => (
      (row.column_name === 'snapshot_json'
        && ['ppd_payments', 'recipient_confirmations'].includes(row.table_name))
        ? { ...row, is_nullable: 'NO' }
        : row
    )),
  };
}

async function introspect(client) {
  const tableRows = (await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [migrationTables],
  )).rows;
  const columns = (await client.query(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale, datetime_precision
     FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
       ORDER BY table_name, column_name`,
    [migrationTables],
  )).rows.map((row) => ({
    ...row,
    column_default: normalizeSql(row.column_default),
  }));
  const checks = (await client.query(
    `SELECT c.relname AS table_name, con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND con.contype = 'c'
       AND c.relname = ANY($1::text[]) ORDER BY c.relname, con.conname`,
    [migrationTables],
  )).rows.map((row) => ({ ...row, definition: normalizeSql(row.definition) }));
  const indexes = (await client.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname = current_schema() AND tablename = ANY($1::text[])
     ORDER BY tablename, indexname`,
    [migrationTables],
  )).rows.map((row) => ({
    ...row,
    indexdef: normalizeSql(row.indexdef),
  }));
  const uniqueConstraints = (await client.query(
    `SELECT c.relname AS table_name, con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS definition
     FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND con.contype = 'u'
       AND c.relname = ANY($1::text[]) ORDER BY c.relname, con.conname`,
    [migrationTables],
  )).rows.map((row) => ({ ...row, definition: normalizeSql(row.definition) }));
  const foreignKeys = (await client.query(
    `SELECT c.relname AS table_name, con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS definition,
            CASE con.confdeltype
              WHEN 'a' THEN 'NO ACTION'
              WHEN 'r' THEN 'RESTRICT'
              WHEN 'c' THEN 'CASCADE'
              WHEN 'n' THEN 'SET NULL'
              WHEN 'd' THEN 'SET DEFAULT'
              ELSE con.confdeltype::text
            END AS delete_action
     FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema() AND con.contype = 'f'
       AND c.relname = ANY($1::text[]) ORDER BY c.relname, con.conname`,
    [migrationTables],
  )).rows.map((row) => ({ ...row, definition: normalizeSql(row.definition) }));
  const triggers = (await client.query(
    `SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing,
            action_orientation, action_statement
     FROM information_schema.triggers
     WHERE trigger_schema = current_schema() AND event_object_table = ANY($1::text[])
     ORDER BY event_object_table, trigger_name, event_manipulation`,
    [migrationTables],
  )).rows.map((row) => ({
    ...row,
    action_statement: normalizeSql(row.action_statement),
  }));
  const ledger = (await client.query(
    `SELECT version, checksum FROM schema_migrations ORDER BY version`,
  )).rows;
  return { tables: tableRows, columns, checks, indexes, uniqueConstraints, foreignKeys, triggers, ledger };
}

async function captureLegacyColumnInventory(client) {
  const inventory = {};
  for (const table of legacyPreservationTables) {
    const columns = (await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position`,
      [table],
    )).rows.map((row) => row.column_name);
    assert.ok(columns.length > 0, `legacy fixture must expose columns for ${table}`);
    inventory[table] = Object.freeze(columns);
  }
  return Object.freeze(inventory);
}

function projectLegacySnapshot(rowsByTable, columnInventory) {
  const projected = {};
  for (const table of legacyPreservationTables) {
    const columns = columnInventory[table];
    assert.ok(Array.isArray(columns) && columns.length > 0, `missing legacy inventory for ${table}`);
    projected[table] = (rowsByTable[table] ?? []).map((row) => Object.fromEntries(
      columns.map((column) => [column, row[column]]),
    ));
  }
  return projected;
}

function stableSerializeLegacySnapshot(rowsByTable, columnInventory) {
  const projected = projectLegacySnapshot(rowsByTable, columnInventory);
  return JSON.stringify(legacyPreservationTables.map((table) => ({
    table,
    columns: columnInventory[table],
    rows: projected[table].map((row) => columnInventory[table].map((column) => row[column])),
  })));
}

async function snapshotLegacyRows(client, columnInventory) {
  const rows = {};
  for (const table of legacyPreservationTables) {
    const columns = columnInventory[table];
    assert.ok(Array.isArray(columns) && columns.length > 0, `missing legacy inventory for ${table}`);
    rows[table] = (await client.query(
      `SELECT ${columns.map(quoteSqlIdentifier).join(', ')} FROM ${quoteSqlIdentifier(table)} ORDER BY "id"`,
    )).rows;
  }
  return projectLegacySnapshot(rows, columnInventory);
}

test('fresh schema and upgraded legacy schema have identical P0 PostgreSQL introspection', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const [schemaSql, migrations] = await Promise.all([fs.readFile(schemaPath, 'utf8'), readVersionedMigrations()]);
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const freshSchema = randomSchema('p0_parity_fresh');
  const upgradeSchema = randomSchema('p0_parity_upgrade');
  try {
    const fresh = await withSchema(client, freshSchema, async () => {
      await client.query(schemaSql);
      await applyVersionedMigrations(client, migrations);
      return introspect(client);
    });
    const upgraded = await withSchema(client, upgradeSchema, async () => {
      await client.query(legacyFixtureSql);
      const legacyColumnInventory = await captureLegacyColumnInventory(client);
      const before = await snapshotLegacyRows(client, legacyColumnInventory);
      await applyVersionedMigrations(client, migrations);
      const after = await snapshotLegacyRows(client, legacyColumnInventory);
      const evidenceCounts = {};
      for (const table of ['artifact_approvals', 'artifact_files', 'artifact_access_events', 'ppd_payments', 'recipient_confirmations']) {
        evidenceCounts[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
      }
      const legacyNullSnapshots = {
        payment: (await client.query('SELECT snapshot_json FROM ppd_payments WHERE id=1')).rows[0].snapshot_json,
        confirmation: (await client.query('SELECT snapshot_json FROM recipient_confirmations WHERE id=1')).rows[0].snapshot_json,
      };
      return {
        introspection: await introspect(client),
        legacyColumnInventory,
        before,
        after,
        beforeSerialized: stableSerializeLegacySnapshot(before, legacyColumnInventory),
        afterSerialized: stableSerializeLegacySnapshot(after, legacyColumnInventory),
        evidenceCounts,
        legacyNullSnapshots,
      };
    });
    assert.deepEqual(fresh.ledger, migrations.map(({ version, checksum }) => ({ version, checksum })));
    assert.deepEqual(upgraded.introspection.ledger, fresh.ledger);
    assert.deepEqual(upgraded.introspection.tables, fresh.tables);
    assert.deepEqual(
      normalizeIntentionalLegacySnapshotNullability(upgraded.introspection).columns,
      fresh.columns,
    );
    assert.deepEqual(upgraded.introspection.checks, fresh.checks);
    assert.deepEqual(upgraded.introspection.indexes, fresh.indexes);
    assert.deepEqual(upgraded.introspection.uniqueConstraints, fresh.uniqueConstraints);
    assert.deepEqual(upgraded.introspection.foreignKeys, fresh.foreignKeys);
    assert.deepEqual(upgraded.introspection.triggers, fresh.triggers);
    assert.deepEqual(upgraded.after, upgraded.before, 'legacy rows must preserve every pre-existing column');
    assert.equal(upgraded.afterSerialized, upgraded.beforeSerialized, 'legacy preservation serialization must use the pre-migration inventory');
    assert.deepEqual(upgraded.evidenceCounts, {
      artifact_approvals: 0,
      artifact_files: 0,
      artifact_access_events: 0,
      ppd_payments: 1,
      recipient_confirmations: 1,
    });
    assert.equal(upgraded.legacyNullSnapshots.payment, null,
      'legacy payment snapshot remains null rather than being fabricated during upgrade');
    assert.equal(upgraded.legacyNullSnapshots.confirmation, null,
      'legacy confirmation snapshot remains null rather than being fabricated during upgrade');
  } finally {
    client.release();
    await pool.end();
  }
});

test('legacy preservation snapshots use one pre-migration inventory and stable projection', () => {
  const inventory = Object.freeze({
    mustahik: Object.freeze(['id', 'name', 'status']),
    applications: Object.freeze(['id']),
    assessments: Object.freeze(['id', 'notes']),
    mpzis: Object.freeze(['id']),
    ppd: Object.freeze(['id']),
    documents: Object.freeze(['id']),
    approval_decisions: Object.freeze(['id']),
    activity_logs: Object.freeze(['id']),
    wa_logs: Object.freeze(['id']),
    ppd_payments: Object.freeze(['id', 'ppd_id', 'snapshot_hash']),
    recipient_confirmations: Object.freeze(['id', 'ppd_id', 'snapshot_hash']),
  });
  const before = {
    mustahik: [{ id: 1, name: 'Legacy', status: 'Diajukan' }],
    assessments: [{ id: 2, notes: 'Legacy assessment' }],
  };
  const after = {
    mustahik: [{ id: 1, name: 'Legacy', status: 'Diajukan', workflow_version: 17 }],
    assessments: [{ id: 2, notes: 'Legacy assessment', source: 'legacy' }],
  };
  assert.deepEqual(projectLegacySnapshot(after, inventory), projectLegacySnapshot(before, inventory));
  assert.equal(stableSerializeLegacySnapshot(after, inventory), stableSerializeLegacySnapshot(before, inventory));
});

test('migration preflight rolls back ledger and business rows on invalid legacy data', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const [migrationSql] = await Promise.all([fs.readFile(migrationPath, 'utf8')]);
  const checksum = migrationChecksum(Buffer.from(migrationSql, 'utf8'));
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const schema = randomSchema('p0_parity_preflight');
  try {
    await withSchema(client, schema, async () => {
      await client.query(legacyFixtureSql);
      await client.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(40) PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO schema_migrations(version, checksum) VALUES ('prior_version', repeat('a', 64));
        INSERT INTO mustahik(file_no,name,nik,status)
          VALUES ('P0-DUPLICATE','Duplicate NIK','NIK-PARITY','Persetujuan MPZIS');
      `);
      const beforeRows = (await client.query(
        'SELECT id,file_no,name,nik,status FROM mustahik ORDER BY id',
      )).rows;
      const beforeLedger = (await client.query(
        'SELECT version,checksum FROM schema_migrations ORDER BY version',
      )).rows;
      await assert.rejects(
        () => applyVersionedMigration(client, migrationSql, checksum),
        /P0_PREFLIGHT_DUPLICATE_IDENTIFIER:mustahik\.nik/,
      );
      assert.deepEqual(
        (await client.query('SELECT id,file_no,name,nik,status FROM mustahik ORDER BY id')).rows,
        beforeRows,
      );
      assert.deepEqual(
        (await client.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,
        beforeLedger,
      );
      assert.equal(
        (await client.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema=current_schema() AND table_name='mustahik' AND column_name='workflow_version'`,
        )).rowCount,
        0,
        'business DDL must not survive a failed preflight',
      );
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('migration preflight allows negative derived remaining income but rejects negative disbursement amounts', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const migrationSql = await fs.readFile(migrationPath, 'utf8');
  const checksum = migrationChecksum(Buffer.from(migrationSql, 'utf8'));
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await withSchema(client, randomSchema('p0_negative_income'), async () => {
      await client.query(legacyFixtureSql);
      await client.query("UPDATE mustahik SET remaining_income = -500000 WHERE id = 1");
      await applyVersionedMigration(client, migrationSql, checksum);
      assert.equal((await client.query("SELECT remaining_income FROM mustahik WHERE id=1")).rows[0].remaining_income, '-500000.00');
    });
    await withSchema(client, randomSchema('p0_negative_disbursement'), async () => {
      await client.query(legacyFixtureSql);
      await client.query("UPDATE ppd SET amount = -1 WHERE id = 1");
      await assert.rejects(
        () => applyVersionedMigration(client, migrationSql, checksum),
        /P0_PREFLIGHT_INVALID_AMOUNT:ppd\.amount/,
      );
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('PostgreSQL evidence triggers reject destructive mutations while allowing payment verification', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const [schemaSql, migrations] = await Promise.all([fs.readFile(schemaPath, 'utf8'), readVersionedMigrations()]);
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const schema = randomSchema('p0_parity_triggers');
  try {
    await withSchema(client, schema, async () => {
      await client.query(schemaSql);
      await applyVersionedMigrations(client, migrations);
      await client.query('BEGIN');
      try {
        await client.query(`
          INSERT INTO users(id,name,email,password_hash,role,division,level)
            VALUES (1,'Trigger actor','trigger@example.test','hash','penyaluran','P0','staff');
          INSERT INTO mustahik(id,name,file_no) VALUES (1,'Trigger case','TRIGGER-001');
          INSERT INTO ppd(id,mustahik_id,status,source,revision,form_number,ppd_number,transaction_number,amount)
            VALUES (1,1,'draft','p0',1,'TRIGGER-FORM','TRIGGER-PPD','TRIGGER-TX',1);
          INSERT INTO artifact_files(
            id,mustahik_id,artifact_type,artifact_id,artifact_revision,kind,stored_name,original_name,
            mime_type,byte_size,sha256,uploaded_by_id
          ) VALUES (1,1,'ppd',1,1,'payment_proof','stored-proof','proof.pdf','application/pdf',1,repeat('a',64),1);
          INSERT INTO artifact_approvals(
            id,mustahik_id,artifact_type,artifact_id,artifact_revision,approval_step,action,snapshot_hash,
            actor_id,actor_name,actor_role,actor_level,actor_division
          ) VALUES (1,1,'ppd',1,1,'finance','approve',repeat('b',64),1,'Trigger actor','staff','staff','P0');
          INSERT INTO artifact_access_events(
            id,file_id,mustahik_id,artifact_type,artifact_id,artifact_revision,actor_id,actor_name,
            actor_role,actor_level,actor_division,action
          ) VALUES (1,1,1,'ppd',1,1,1,'Trigger actor','staff','staff','P0','download');
          INSERT INTO ppd_payments(
            id,ppd_id,transaction_number,paid_amount,paid_at,proof_file_id,recorded_by_id,
            verification_status,snapshot_json,snapshot_hash
          ) VALUES (1,1,'TRIGGER-TX',1,CURRENT_TIMESTAMP,1,1,'pending','{}'::jsonb,repeat('c',64));
          INSERT INTO recipient_confirmations(
            id,ppd_id,method,recipient_name_snapshot,confirmed_at,note,recorded_by_id,snapshot_json,snapshot_hash
          ) VALUES (1,1,'Telepon','Trigger recipient',CURRENT_TIMESTAMP,'Trigger note',1,'{}'::jsonb,repeat('d',64));
        `);
        const assertRejected = async (statement) => {
          await client.query('SAVEPOINT p0_trigger_assert');
          try {
            await assert.rejects(() => client.query(statement), /P0_IMMUTABLE_RECORD/);
          } finally {
            await client.query('ROLLBACK TO SAVEPOINT p0_trigger_assert');
          }
        };
        await assertRejected(`UPDATE artifact_approvals SET note='tampered' WHERE id=1`);
        await assertRejected(`DELETE FROM artifact_approvals WHERE id=1`);
        await assertRejected(`TRUNCATE artifact_approvals CASCADE`);
        await assertRejected(`UPDATE artifact_access_events SET action='tampered' WHERE id=1`);
        await assertRejected(`DELETE FROM artifact_access_events WHERE id=1`);
        await assertRejected(`TRUNCATE artifact_access_events CASCADE`);
        await assertRejected(`UPDATE artifact_files SET original_name='tampered.pdf' WHERE id=1`);
        await assertRejected(`DELETE FROM artifact_files WHERE id=1`);
        await assertRejected(`TRUNCATE artifact_files CASCADE`);
        await assertRejected(`DELETE FROM ppd_payments WHERE id=1`);
        await assertRejected(`TRUNCATE ppd_payments CASCADE`);
        await assertRejected(`UPDATE recipient_confirmations SET note='tampered' WHERE id=1`);
        await assertRejected(`DELETE FROM recipient_confirmations WHERE id=1`);
        await assertRejected(`TRUNCATE recipient_confirmations CASCADE`);
        await client.query(`
          UPDATE ppd_payments
          SET verification_status='verified', verified_by_id=1, verified_at=CURRENT_TIMESTAMP
          WHERE id=1
        `);
        await assertRejected(`UPDATE ppd_payments SET snapshot_json='{"tampered":true}'::jsonb WHERE id=1`);
        await assertRejected(`UPDATE ppd_payments SET paid_amount=2 WHERE id=1`);
        assert.equal((await client.query('SELECT verification_status FROM ppd_payments WHERE id=1')).rows[0].verification_status, 'verified');
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('fresh schema accepts global activity log with null mustahik_id', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const [schemaSql, migrations] = await Promise.all([fs.readFile(schemaPath, 'utf8'), readVersionedMigrations()]);
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const schema = randomSchema('p0_parity_fresh');
  try {
    await withSchema(client, schema, async () => {
      await client.query(schemaSql);
      await applyVersionedMigrations(client, migrations);

      const res = await client.query(`
        INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description)
        VALUES (NULL, 'Export Service', 'REPORT_EXPORT', 'Export Mustahik', 'Target: mustahik.xlsx')
        RETURNING id, mustahik_id, action_type;
      `);
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].mustahik_id, null);
      assert.equal(res.rows[0].action_type, 'REPORT_EXPORT');

      const queried = (await client.query('SELECT mustahik_id, action_type FROM activity_logs WHERE id=$1', [res.rows[0].id])).rows[0];
      assert.equal(queried.mustahik_id, null);
      assert.equal(queried.action_type, 'REPORT_EXPORT');
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('migration 003 enforces ppd_payments.verification_status fail-closed contract', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const migration003Path = path.join(migrationsDir, '20260919_003_p0_contract_parity.sql');
  const migration003Sql = await fs.readFile(migration003Path, 'utf8');
  const checksum003 = migrationChecksum(Buffer.from(migration003Sql, 'utf8'));

  // Case A: Table with nullable verification_status and NULL row -> must fail-closed and rollback
  const invalidSchema = randomSchema('p0_parity_preflight');
  try {
    await withSchema(client, invalidSchema, async () => {
      await client.query(legacyFixtureSql);
      // Alter column to drop not null to simulate legacy NULL row
      await client.query('ALTER TABLE ppd_payments ALTER COLUMN verification_status DROP NOT NULL');
      await client.query(`
        INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, verification_status, snapshot_hash)
        VALUES (999, 1, 'TX-NULL-STATUS', 50000, CURRENT_TIMESTAMP, NULL, repeat('0', 64))
      `);

      await assert.rejects(
        () => applyVersionedMigration(client, migration003Sql, checksum003, '20260919_003'),
        /P0_MIGRATION_NULL_VERIFICATION_STATUS/,
      );

      // Verify rollback: migration not in schema_migrations
      const ledger = (await client.query("SELECT * FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='schema_migrations'")).rows;
      if (ledger.length > 0) {
        const rows = (await client.query("SELECT * FROM schema_migrations WHERE version='20260919_003'")).rows;
        assert.equal(rows.length, 0, 'failed migration must not be recorded in ledger');
      }

      // Verify column remains nullable
      const colInfo = (await client.query(`
        SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='ppd_payments' AND column_name='verification_status'
      `)).rows[0];
      assert.equal(colInfo.is_nullable, 'YES');
    });

    // Case B: Table with valid non-null rows -> migrates cleanly to NOT NULL DEFAULT 'pending'
    const validSchema = randomSchema('p0_parity_preflight');
    await withSchema(client, validSchema, async () => {
      await client.query(legacyFixtureSql);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(40) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await applyVersionedMigration(client, migration003Sql, checksum003, '20260919_003');

      const colInfo = (await client.query(`
        SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='ppd_payments' AND column_name='verification_status'
      `)).rows[0];
      assert.equal(colInfo.is_nullable, 'NO');
      assert.match(colInfo.column_default, /'pending'/);

      // Verify default is applied on insert without status
      await client.query(`
        INSERT INTO ppd_payments (id, ppd_id, transaction_number, paid_amount, paid_at, snapshot_hash)
        VALUES (1000, 1, 'TX-DEFAULT-STATUS', 75000, CURRENT_TIMESTAMP, repeat('1', 64))
      `);
      const inserted = (await client.query('SELECT verification_status FROM ppd_payments WHERE id=1000')).rows[0];
      assert.equal(inserted.verification_status, 'pending');
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('migration runner refuses every missing 003 contract object without a ledger row or partial DDL', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const pre003Dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-runner-pre003-'));
  const migrationNames = ['20260913_001_mustahik_p0.sql', '20260919_002_p0_receipt.sql'];
  try {
    for (const migrationName of migrationNames) {
      await fs.copyFile(path.join(migrationsDir, migrationName), path.join(pre003Dir, migrationName));
    }

    const missingObjects = [
      {
        label: 'activity_logs table',
        expected: 'activity_logs',
        drop: 'DROP TABLE activity_logs',
        assertAfter: async () => {
          assert.equal((await client.query(
            "SELECT to_regclass(format('%I.%I', current_schema(), $1::text)) AS relation",
            ['activity_logs'],
          )).rows[0].relation, null);
        },
      },
      {
        label: 'activity_logs.mustahik_id column',
        expected: 'activity_logs.mustahik_id',
        drop: `
          ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_mustahik_id_fkey;
          ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL;
          ALTER TABLE activity_logs DROP COLUMN mustahik_id;
        `,
        assertAfter: async () => {
          assert.equal((await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
          `)).rowCount, 0);
        },
      },
      {
        label: 'ppd_payments table',
        expected: 'ppd_payments',
        drop: 'DROP TABLE ppd_payments',
        assertAfter: async () => {
          assert.equal((await client.query(
            "SELECT to_regclass(format('%I.%I', current_schema(), $1::text)) AS relation",
            ['ppd_payments'],
          )).rows[0].relation, null);
        },
      },
      {
        label: 'ppd_payments.verification_status column',
        expected: 'ppd_payments.verification_status',
        drop: `
          DROP TRIGGER IF EXISTS ppd_payments_immutable ON ppd_payments;
          DROP TRIGGER IF EXISTS ppd_payments_truncate_immutable ON ppd_payments;
          ALTER TABLE ppd_payments DROP CONSTRAINT IF EXISTS ppd_payment_status_check;
          ALTER TABLE ppd_payments DROP COLUMN verification_status;
        `,
        assertAfter: async () => {
          assert.equal((await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name='ppd_payments' AND column_name='verification_status'
          `)).rowCount, 0);
        },
      },
    ];

    for (const missingObject of missingObjects) {
      const schema = randomSchema('p0_parity_missing');
      await withSchema(client, schema, async () => {
        await client.query(schemaSql);
        const schemaPool = new Pool({
          connectionString: `${url}${url.includes('?') ? '&' : '?'}options=-csearch_path%3D${schema}`,
          max: 1,
        });
        schemaPool.isPg = true;
        try {
          await runPendingMigrations({ pool: schemaPool, migrationsDir: pre003Dir });
          await client.query('ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL');
          await client.query(missingObject.drop);

          await assert.rejects(
            () => runPendingMigrations({ pool: schemaPool, migrationsDir }),
            new RegExp(`P0_MIGRATION_PRECONDITION_FAILED:${missingObject.expected.replace('.', '\\.')}`),
            `missing ${missingObject.label} must fail closed through the real migration runner`,
          );

          assert.equal(
            (await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version='20260919_003'")).rows[0].count,
            0,
            `missing ${missingObject.label} must not create a version 003 ledger row`,
          );
          await missingObject.assertAfter();
          if (missingObject.expected.startsWith('ppd_payments')) {
            assert.equal((await client.query(`
              SELECT is_nullable FROM information_schema.columns
              WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
            `)).rows[0].is_nullable, 'NO', 'failed 003 precondition must roll back earlier activity_logs DDL');
          }
        } finally {
          await schemaPool.end();
        }
      });
    }
  } finally {
    client.release();
    await pool.end();
    await fs.rm(pre003Dir, { recursive: true, force: true });
  }
});

test('real migration runner rolls back 003 activity DDL when verification status reconciliation fails', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const pre003Dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-runner-null-pre003-'));
  for (const migrationName of ['20260913_001_mustahik_p0.sql', '20260919_002_p0_receipt.sql']) {
    await fs.copyFile(path.join(migrationsDir, migrationName), path.join(pre003Dir, migrationName));
  }
  const schema = randomSchema('p0_parity_preflight');
  try {
    await withSchema(client, schema, async () => {
      await client.query(schemaSql);
      const schemaPool = new Pool({
        connectionString: `${url}${url.includes('?') ? '&' : '?'}options=-csearch_path%3D${schema}`,
        max: 1,
      });
      schemaPool.isPg = true;
      try {
        await runPendingMigrations({ pool: schemaPool, migrationsDir: pre003Dir });

        await client.query("INSERT INTO mustahik (id, name) VALUES (9101, 'Synthetic runner fixture')");
        await client.query("INSERT INTO ppd (id, mustahik_id, source, status, revision) VALUES (9101, 9101, 'legacy', 'legacy_unverified', 1)");
        await client.query('ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL');
        await client.query('ALTER TABLE ppd_payments ALTER COLUMN verification_status DROP NOT NULL');
        await client.query(`
          INSERT INTO ppd_payments (
            id, ppd_id, transaction_number, paid_amount, paid_at, verification_status,
            snapshot_json, snapshot_hash
          ) VALUES (9101, 9101, 'TX-RUNNER-NULL', 50000, CURRENT_TIMESTAMP, NULL, '{}'::jsonb, repeat('0', 64))
        `);

        const activityBefore = (await client.query(`
          SELECT is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
        `)).rows[0];
        const activityFkBefore = (await client.query(`
          SELECT pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=current_schema()
            AND c.relname='activity_logs'
            AND con.conname='activity_logs_mustahik_id_fkey'
        `)).rows[0];
        const paymentBefore = (await client.query(`
          SELECT is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='ppd_payments' AND column_name='verification_status'
        `)).rows[0];
        const paymentStatusCheckBefore = (await client.query(`
          SELECT pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=current_schema()
            AND c.relname='ppd_payments'
            AND con.conname='ppd_payment_status_check'
        `)).rows[0];
        assert.equal(activityBefore.is_nullable, 'NO');
        assert.equal(paymentBefore.is_nullable, 'YES');
        assert.match(paymentBefore.column_default, /pending/i);
        assert.ok(activityFkBefore?.definition, 'legacy activity_logs FK must exist before failed 003');
        assert.ok(paymentStatusCheckBefore?.definition, 'payment status check must exist before failed 003');

        await assert.rejects(
          () => runPendingMigrations({ pool: schemaPool, migrationsDir }),
          /P0_MIGRATION_NULL_VERIFICATION_STATUS/,
          'real runner must reject NULL verification status after earlier activity DDL runs',
        );

        assert.equal(
          (await client.query("SELECT COUNT(*)::int AS count FROM schema_migrations WHERE version='20260919_003'")).rows[0].count,
          0,
          'failed 003 must not create a ledger row',
        );
        const activityAfter = (await client.query(`
          SELECT is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
        `)).rows[0];
        const activityFkAfter = (await client.query(`
          SELECT pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=current_schema()
            AND c.relname='activity_logs'
            AND con.conname='activity_logs_mustahik_id_fkey'
        `)).rows[0];
        const paymentAfter = (await client.query(`
          SELECT is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema=current_schema() AND table_name='ppd_payments' AND column_name='verification_status'
        `)).rows[0];
        const paymentStatusCheckAfter = (await client.query(`
          SELECT pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class c ON c.oid=con.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=current_schema()
            AND c.relname='ppd_payments'
            AND con.conname='ppd_payment_status_check'
        `)).rows[0];
        assert.deepEqual(activityAfter, activityBefore, 'activity_logs nullability/default must roll back');
        assert.deepEqual(activityFkAfter, activityFkBefore, 'activity_logs FK must roll back unchanged');
        assert.deepEqual(paymentAfter, paymentBefore, 'verification_status nullability/default must remain legacy state');
        assert.deepEqual(paymentStatusCheckAfter, paymentStatusCheckBefore, 'payment status constraint must remain unchanged');
        assert.equal(
          (await client.query('SELECT COUNT(*)::int AS count FROM ppd_payments WHERE id=9101 AND verification_status IS NULL')).rows[0].count,
          1,
          'failed migration must not rewrite the NULL legacy row',
        );
      } finally {
        await schemaPool.end();
      }
    });
  } finally {
    client.release();
    await pool.end();
    await fs.rm(pre003Dir, { recursive: true, force: true });
  }
});

test('upgraded schema converts legacy activity_logs.mustahik_id NOT NULL to nullable and accepts global logs', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const schema = randomSchema('p0_parity_upgrade');
  try {
    await withSchema(client, schema, async () => {
      await client.query(legacyFixtureSql);
      // Clean up any global rows with NULL mustahik_id first, then simulate legacy schema where mustahik_id was forced NOT NULL
      await client.query('DELETE FROM activity_logs WHERE mustahik_id IS NULL');
      await client.query('ALTER TABLE activity_logs ALTER COLUMN mustahik_id SET NOT NULL');

      const beforeCol = (await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
      `)).rows[0];
      assert.equal(beforeCol.is_nullable, 'NO', 'precondition: mustahik_id must start as NOT NULL');

      // Attempting to insert a global log with mustahik_id=NULL must fail prior to migration
      await assert.rejects(
        () => client.query(`
          INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description)
          VALUES (NULL, 'Legacy System', 'REPORT_EXPORT', 'Export Report', 'Fails before migration')
        `),
        /null value in column "mustahik_id"/,
      );

      // Apply migrations
      const migrations = await readVersionedMigrations();
      await applyVersionedMigrations(client, migrations);

      // Verify introspection shows nullable
      const afterCol = (await client.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='activity_logs' AND column_name='mustahik_id'
      `)).rows[0];
      assert.equal(afterCol.is_nullable, 'YES', 'post-condition: migration 003 must drop NOT NULL');

      // Insert global log with mustahik_id=NULL succeeds
      const res = await client.query(`
        INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description)
        VALUES (NULL, 'Export Service', 'REPORT_EXPORT', 'Export Mustahik', 'Target: mustahik.xlsx')
        RETURNING id, mustahik_id, action_type;
      `);
      assert.equal(res.rowCount, 1);
      assert.equal(res.rows[0].mustahik_id, null);
      assert.equal(res.rows[0].action_type, 'REPORT_EXPORT');
    });
  } finally {
    client.release();
    await pool.end();
  }
});

test('runPendingMigrations on live PostgreSQL proves non-vacuous transaction rollback and idempotent replay', { skip: !process.env.P0_TEST_DATABASE_URL }, async () => {
  const url = process.env.P0_TEST_DATABASE_URL;
  assertDisposableTestDatabaseUrl(url);
  const pool = new Pool({ connectionString: url, max: 2 });
  pool.isPg = true;
  const client = await pool.connect();
  const schema = randomSchema('p0_parity_preflight');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-runner-rollback-'));

  try {
    await withSchema(client, schema, async () => {
      // Create schema-isolated pool for runPendingMigrations
      const schemaPool = new Pool({
        connectionString: `${url}${url.includes('?') ? '&' : '?'}options=-csearch_path%3D${schema}`,
        max: 2,
      });
      schemaPool.isPg = true;

      try {
        // Step 1: Write Migration 001 (Valid) and Migration 002 (Failing mid-transaction)
        await fs.writeFile(
          path.join(tempDir, '20260920_001_initial.sql'),
          'CREATE TABLE test_ledger_alpha (id SERIAL PRIMARY KEY, note TEXT NOT NULL);\n',
          'utf8',
        );
        await fs.writeFile(
          path.join(tempDir, '20260920_002_broken.sql'),
          'CREATE TABLE test_ledger_beta (id SERIAL PRIMARY KEY, note TEXT NOT NULL);\n' +
          'SELECT * FROM non_existent_table_triggering_syntax_error;\n',
          'utf8',
        );

        // Step 2: Run migrations. Must reject due to broken migration 002
        await assert.rejects(
          () => runPendingMigrations({ pool: schemaPool, migrationsDir: tempDir }),
          /non_existent_table_triggering_syntax_error/,
        );

        // Step 3: Verify non-vacuous rollback on live PostgreSQL
        // Migration 001 committed successfully:
        const tableAlpha = (await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='test_ledger_alpha'",
        )).rows;
        assert.equal(tableAlpha.length, 1, 'test_ledger_alpha must exist (committed)');

        const migration001Ledger = (await client.query(
          "SELECT version FROM schema_migrations WHERE version='20260920_001'",
        )).rows;
        assert.equal(migration001Ledger.length, 1, 'version 20260920_001 must be in schema_migrations');

        // Migration 002 rolled back completely:
        const tableBeta = (await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='test_ledger_beta'",
        )).rows;
        assert.equal(tableBeta.length, 0, 'test_ledger_beta must NOT exist (transaction rolled back)');

        const migration002Ledger = (await client.query(
          "SELECT version FROM schema_migrations WHERE version='20260920_002'",
        )).rows;
        assert.equal(migration002Ledger.length, 0, 'version 20260920_002 must NOT be in schema_migrations');

        // Step 4: Replay fix — fix Migration 002 with valid SQL
        await fs.writeFile(
          path.join(tempDir, '20260920_002_broken.sql'),
          'CREATE TABLE test_ledger_beta (id SERIAL PRIMARY KEY, note TEXT NOT NULL);\n',
          'utf8',
        );

        // Step 5: Re-run runPendingMigrations — must succeed cleanly
        await runPendingMigrations({ pool: schemaPool, migrationsDir: tempDir });

        // Step 6: Verify replay results
        const tableBetaAfter = (await client.query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='test_ledger_beta'",
        )).rows;
        assert.equal(tableBetaAfter.length, 1, 'test_ledger_beta must exist after replay');

        const ledgerAll = (await client.query(
          'SELECT version FROM schema_migrations ORDER BY version',
        )).rows.map((r) => r.version);
        assert.deepEqual(ledgerAll, ['20260920_001', '20260920_002']);

        // Step 7: Idempotency check — running again does not re-apply or error
        await runPendingMigrations({ pool: schemaPool, migrationsDir: tempDir });
        const ledgerAfterThirdRun = (await client.query(
          'SELECT version FROM schema_migrations ORDER BY version',
        )).rows.map((r) => r.version);
        assert.deepEqual(ledgerAfterThirdRun, ['20260920_001', '20260920_002']);
      } finally {
        await schemaPool.end();
      }
    });
  } finally {
    client.release();
    await pool.end();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
