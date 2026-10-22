import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { newDb } from 'pg-mem';
import test from 'node:test';
import { migrateMustahikNormalization, validateDisbursementPayload, validateSurveyPayload } from './mustahik-normalization.js';
import { resolveNormalizationTarget } from './run-mustahik-normalization.js';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mustahik-normalization-'));
  const db = await open({ filename: path.join(directory, 'fixture.sqlite'), driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE mustahik (id INTEGER PRIMARY KEY, file_no TEXT, name TEXT, nik TEXT, kk_number TEXT, phone TEXT, address TEXT, received_date TEXT, program TEXT, request_title TEXT, status TEXT, recommended_amount NUMERIC, survey_date TEXT, surveyor_name TEXT, family_dependents INTEGER, monthly_income NUMERIC, survey_recommendation TEXT, asnaf TEXT, desil_score INTEGER, ppd_number TEXT, disbursement_date TEXT, bank_account TEXT, bank_name TEXT, bank_account_name TEXT, approved_amount NUMERIC);
    CREATE TABLE applications (id INTEGER PRIMARY KEY, mustahik_id INTEGER, application_number TEXT, program TEXT, request_title TEXT, status TEXT, rejection_reason TEXT, applied_at TEXT, amount NUMERIC);
    CREATE TABLE assessments (id INTEGER PRIMARY KEY, mustahik_id INTEGER, surveyor_name TEXT, survey_date TEXT, house_ownership TEXT, child_count INTEGER, recommendation TEXT, overall_score NUMERIC);
    CREATE TABLE ppd (id INTEGER PRIMARY KEY, mustahik_id INTEGER, ppd_number TEXT, bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT, amount NUMERIC, payment_type TEXT);
    INSERT INTO mustahik VALUES (1,'M-001','Siti Aminah','3174010101010001','3174010101010002','081200001111','Jalan Mawar','2026-01-02','Kesehatan','Biaya obat','Diajukan',2500000,'2026-01-03','Surveyor A',3,1200000,'Layak','Fakir',2,NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO mustahik VALUES (2,'M-002','Budi Santoso','3174010101010003','3174010101010004','081200002222','Jalan Melati','2026-02-02','Pendidikan','Bantuan sekolah','Diajukan',1500000,'2026-02-03','Surveyor B',2,900000,'Layak','Miskin',3,'PPD-2','2026-03-01','123456789','Bank X','Budi Santoso',1500000);
    INSERT INTO applications VALUES (7,1,'APP-7','Kesehatan','Biaya obat','Diajukan',NULL,'2026-01-02',2500000);
    INSERT INTO assessments VALUES (9,1,'Surveyor A','2026-01-03','Sewa',3,'Layak',74.5);
    INSERT INTO ppd VALUES (11,1,'PPD-11','Bank Y','Siti Aminah','2026-01-30',2500000,'Transfer');
  `);
  return { directory, db, backupPath: path.join(directory, 'legacy-backup.json') };
}

test('normalization creates a protected backup, copies all legacy payloads and reruns idempotently on SQLite', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });

  const result = await migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath });
  assert.deepEqual(result.source_counts, { mustahik: 2, applications: 1, assessments: 1, ppd: 1 });
  assert.deepEqual(result.expected, {
    mustahik_profiles: 2, mustahik_applications: 2,
    mustahik_surveys: 2, mustahik_disbursements: 2,
  });
  assert.equal((await stat(f.backupPath)).mode & 0o777, 0o600);

  const backup = JSON.parse(await readFile(f.backupPath, 'utf8'));
  assert.deepEqual(backup.sources.mustahik.map((row) => row.id), [1, 2]);
  assert.equal((await f.db.get('SELECT name,nik FROM mustahik_profiles WHERE profile_id=1')).name, 'Siti Aminah');
  assert.equal((await f.db.get("SELECT source_payload FROM mustahik_applications WHERE legacy_source_table='applications' AND legacy_source_id=7")).source_payload, JSON.stringify(await f.db.get('SELECT * FROM applications WHERE id=7')));
  assert.equal((await f.db.get("SELECT bank_account FROM mustahik_disbursements WHERE legacy_source_table='mustahik' AND legacy_source_id=2")).bank_account, '123456789');
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_normalized_read_model')).count, 2);
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik')).count, 2, 'legacy operational table stays intact for existing endpoints');

  await assert.rejects(() => migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath }), /NORMALIZATION_BACKUP_ALREADY_EXISTS/);
  const rerun = await migrateMustahikNormalization({ db: f.db, backupPath: path.join(f.directory, 'legacy-backup-rerun.json') });
  assert.deepEqual(rerun.expected, result.expected);
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_profiles')).count, 2);
});

test('normalization detects duplicate legacy NIK values and leaves normalized DDL rolled back with backup retained', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.db.run("UPDATE mustahik SET nik='3174010101010001' WHERE id=2");
  await assert.rejects(() => migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath }), /UNIQUE constraint failed/);
  assert.equal((await f.db.get("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='mustahik_profiles'")).count, 0);
  assert.ok((await stat(f.backupPath)).isFile());
});

test('normalization blocks malformed NIKs before backup or schema mutation', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.db.run("UPDATE mustahik SET nik='317401010101000' WHERE id=2");
  await assert.rejects(() => migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath }), /NORMALIZATION_INVALID_NIK:2/);
  assert.equal((await f.db.get("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='mustahik_profiles'")).count, 0);
  await assert.rejects(() => stat(f.backupPath), { code: 'ENOENT' });
});

test('normalized read models preserve profile and per-entity history cardinality without cross multiplication', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.db.exec(`
    INSERT INTO applications VALUES (8,1,'APP-8','Pendidikan','Buku','Diproses',NULL,'2026-02-02',900);
    INSERT INTO assessments VALUES (10,1,'Surveyor B','2026-02-03','Milik',2,'Layak',81);
    INSERT INTO assessments VALUES (12,1,'Surveyor C','2026-02-04','Sewa',4,'Tinjau',66);
    INSERT INTO ppd VALUES (13,1,'PPD-13','Bank Z','Siti Aminah','2026-02-28',500,'Transfer');
  `);
  await migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath });
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_normalized_read_model')).count, 2);
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_applications_read_model WHERE profile_id=1')).count, 2);
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_surveys_read_model WHERE profile_id=1')).count, 3);
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM mustahik_disbursements_read_model WHERE profile_id=1')).count, 2);
  assert.deepEqual((await f.db.all('SELECT application_number FROM mustahik_applications_read_model WHERE profile_id=1 ORDER BY legacy_source_id')).map((row) => row.application_number), ['APP-7', 'APP-8']);
  assert.deepEqual((await f.db.all('SELECT surveyor_name FROM mustahik_surveys_read_model WHERE profile_id=1 ORDER BY legacy_source_id')).map((row) => row.surveyor_name), ['Surveyor A', 'Surveyor B', 'Surveyor C']);
});

test('history tables enforce profile foreign keys on SQLite and reject orphan inserts', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath });
  assert.equal((await f.db.get('PRAGMA foreign_keys')).foreign_keys, 1, 'SQLite FK enforcement must be enabled');

  for (const [index, table] of ['mustahik_applications', 'mustahik_surveys', 'mustahik_disbursements'].entries()) {
    await f.db.run(`INSERT INTO ${table} (legacy_source_table, legacy_source_id, profile_id, source_payload) VALUES (?, ?, ?, ?)`, ['fk-positive', index + 1, 1, '{}']);
    await assert.rejects(
      () => f.db.run(`INSERT INTO ${table} (legacy_source_table, legacy_source_id, profile_id, source_payload) VALUES (?, ?, ?, ?)`, ['fk-orphan', index + 1, 999999, '{}']),
      /FOREIGN KEY constraint failed/,
      `${table} must reject an orphan profile_id`,
    );
  }
});

test('upgrade adds missing SQLite history foreign keys and preserves valid rows idempotently', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.db.exec(`
    CREATE TABLE mustahik_profiles (profile_id INTEGER PRIMARY KEY, nik TEXT, kk_number TEXT, name TEXT, beneficiary_name TEXT, phone TEXT, marital_status TEXT, pob TEXT, dob TEXT, occupation TEXT, work_place TEXT, education_level TEXT, address TEXT, rt_rw TEXT, kelurahan TEXT, kecamatan TEXT, kabupaten_kota TEXT, province TEXT, legacy_source_id INTEGER NOT NULL UNIQUE, source_payload TEXT NOT NULL);
    CREATE TABLE mustahik_applications (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, application_number TEXT, program TEXT, request_title TEXT, proposed_amount NUMERIC, received_date TEXT, status TEXT, rejection_reason TEXT, applied_at TEXT, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    CREATE TABLE mustahik_surveys (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, survey_date TEXT, surveyor_name TEXT, surveyor_phone TEXT, house_ownership TEXT, family_dependents INTEGER, monthly_income NUMERIC, monthly_expense NUMERIC, recommendation TEXT, asnaf TEXT, desil_score INTEGER, overall_score NUMERIC, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    CREATE TABLE mustahik_disbursements (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, ppd_number TEXT, bank_account TEXT, bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT, payment_method TEXT, amount NUMERIC, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    INSERT INTO mustahik_profiles VALUES (1,NULL,NULL,'Existing',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,'{}');
    INSERT INTO mustahik_applications VALUES ('applications',7,1,'APP-7','Kesehatan','Biaya obat',2500000,'2026-01-02','Diajukan',NULL,'2026-01-02','{"kept":true}');
    INSERT INTO mustahik_surveys VALUES ('assessments',9,1,'2026-01-03','Surveyor A',NULL,'Sewa',3,1200000,NULL,'Layak','Fakir',2,74.5,'{"kept":true}');
    INSERT INTO mustahik_disbursements VALUES ('ppd',11,1,'PPD-11',NULL,'Bank Y','Siti Aminah','2026-01-30','Transfer',2500000,'{"kept":true}');
  `);
  await migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath });
  for (const [table, source, id] of [['mustahik_applications', 'applications', 7], ['mustahik_surveys', 'assessments', 9], ['mustahik_disbursements', 'ppd', 11]]) {
    assert.equal((await f.db.get(`SELECT profile_id FROM ${table} WHERE legacy_source_table=? AND legacy_source_id=?`, [source, id])).profile_id, 1);
    await assert.rejects(
      () => f.db.run(`INSERT INTO ${table} (legacy_source_table, legacy_source_id, profile_id, source_payload) VALUES ('orphan', ?, 999999, '{}')`, [id]),
      /FOREIGN KEY constraint failed/,
      `${table} upgraded schema must reject orphan profiles`,
    );
    const index = `idx_${table}_profile`;
    assert.equal((await f.db.get("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [index])).name, index, `${table} profile index survives SQLite table rebuild`);
  }

  await migrateMustahikNormalization({ db: f.db, backupPath: path.join(f.directory, 'legacy-backup-rerun.json') });
  for (const [table, source, id] of [['mustahik_applications', 'applications', 7], ['mustahik_surveys', 'assessments', 9], ['mustahik_disbursements', 'ppd', 11]]) {
    assert.equal((await f.db.get(`SELECT profile_id FROM ${table} WHERE legacy_source_table=? AND legacy_source_id=?`, [source, id])).profile_id, 1, `${table} valid history survives rerun`);
    assert.equal((await f.db.get(`PRAGMA foreign_key_list(${table})`)).table, 'mustahik_profiles', `${table} foreign key survives rerun`);
    assert.equal((await f.db.get("SELECT name FROM sqlite_master WHERE type='index' AND name=?", [`idx_${table}_profile`])).name, `idx_${table}_profile`, `${table} profile index survives rerun`);
  }
});

test('orphan operational references are rejected after backup and normalized DDL rolls back', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await f.db.run("INSERT INTO applications VALUES (99,999,'APP-X','Health','Need','New',NULL,'2026-04-01',1)");
  await assert.rejects(() => migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath }), /NORMALIZATION_ORPHAN_MUSTAHIK_ID:applications:99:999/);
  assert.equal((await f.db.get("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='mustahik_profiles'")).count, 0);
  assert.ok((await stat(f.backupPath)).isFile());
  assert.equal((await f.db.get('SELECT COUNT(*) AS count FROM applications')).count, 2);
});

test('CLI accepts only an explicit disposable PostgreSQL database and backup path', () => {
  const backupPath = path.resolve('normalization-backup.json');
  assert.deepEqual(resolveNormalizationTarget(
    { MKA141_TEST_DATABASE_URL: 'postgresql://user:secret@127.0.0.1:5432/baznas_mka141_test' },
    ['--apply', '--backup-path', backupPath],
  ), { connectionString: 'postgresql://user:secret@127.0.0.1:5432/baznas_mka141_test', backupPath });
  assert.throws(() => resolveNormalizationTarget(
    { MKA141_TEST_DATABASE_URL: 'postgresql://user:secret@127.0.0.1:5432/baznas_db' },
    ['--apply', '--backup-path', backupPath],
  ), /ONLY_RUNS_ON_POSTGRES_TEST_DATABASES/);
});

test('normalization SQL/data contract executes against PostgreSQL-compatible fixture', async (t) => {
  const f = await fixture();
  await f.db.close();
  const directory = f.directory;
  const backupPath = path.join(directory, 'pg-compatible-backup.json');
  const memory = newDb();
  const pg = memory.adapters.createPg();
  const client = new pg.Client();
  await client.connect();
  t.after(async () => { await client.end(); await rm(directory, { recursive: true, force: true }); });
  await client.query(`
    CREATE TABLE mustahik (id INTEGER PRIMARY KEY, file_no TEXT, name TEXT, nik TEXT, kk_number TEXT, phone TEXT, address TEXT, received_date TEXT, program TEXT, request_title TEXT, status TEXT, recommended_amount NUMERIC, survey_date TEXT, surveyor_name TEXT, family_dependents INTEGER, monthly_income NUMERIC, survey_recommendation TEXT, asnaf TEXT, desil_score INTEGER, ppd_number TEXT, disbursement_date TEXT, bank_account TEXT, bank_name TEXT, bank_account_name TEXT, approved_amount NUMERIC);
    CREATE TABLE applications (id INTEGER PRIMARY KEY, mustahik_id INTEGER, application_number TEXT, program TEXT, request_title TEXT, status TEXT, rejection_reason TEXT, applied_at TEXT, amount NUMERIC);
    CREATE TABLE assessments (id INTEGER PRIMARY KEY, mustahik_id INTEGER, surveyor_name TEXT, survey_date TEXT, house_ownership TEXT, child_count INTEGER, recommendation TEXT, overall_score NUMERIC);
    CREATE TABLE ppd (id INTEGER PRIMARY KEY, mustahik_id INTEGER, ppd_number TEXT, bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT, amount NUMERIC, payment_type TEXT);
    CREATE TABLE mustahik_applications (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, application_number TEXT, program TEXT, request_title TEXT, proposed_amount NUMERIC, received_date TEXT, status TEXT, rejection_reason TEXT, applied_at TEXT, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    CREATE TABLE mustahik_surveys (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, survey_date TEXT, surveyor_name TEXT, surveyor_phone TEXT, house_ownership TEXT, family_dependents INTEGER, monthly_income NUMERIC, monthly_expense NUMERIC, recommendation TEXT, asnaf TEXT, desil_score INTEGER, overall_score NUMERIC, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    CREATE TABLE mustahik_disbursements (legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL, profile_id INTEGER NOT NULL, ppd_number TEXT, bank_account TEXT, bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT, payment_method TEXT, amount NUMERIC, source_payload TEXT NOT NULL, PRIMARY KEY (legacy_source_table, legacy_source_id));
    INSERT INTO mustahik VALUES (1,'M-1','Synthetic User','3174010101010001','3174010101010002','081200000001','Road','2026-01-01','Health','Need','Diajukan',1000,'2026-01-02','Surveyor',1,500,'OK','Fakir',1,NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO applications VALUES (7,1,'APP-7','Health','Need','Diajukan',NULL,'2026-01-01',1000);
    INSERT INTO assessments VALUES (9,1,'Surveyor','2026-01-02',NULL,1,'OK',74);
    INSERT INTO ppd VALUES (11,1,'PPD-11','Bank','Synthetic User','2026-01-30',1000,'Transfer');
    INSERT INTO mustahik_applications VALUES ('applications',7,1,'APP-7','Health','Need',1000,'2026-01-01','Diajukan',NULL,'2026-01-01','{"preexisting":true}');
    INSERT INTO mustahik_surveys VALUES ('assessments',9,1,'2026-01-02','Surveyor',NULL,NULL,1,500,NULL,'OK','Fakir',1,74,'{"preexisting":true}');
  `);
  await client.query(`INSERT INTO mustahik_disbursements VALUES ('ppd',11,1,'PPD-11',NULL,'Bank','Synthetic User','2026-01-30','Transfer',1000,'{"preexisting":true}')`);
  const db = {
    isPg: true,
    all: async (sql, params = []) => (await client.query(sql, params)).rows,
    get: async (sql, params = []) => (await client.query(sql, params)).rows[0] ?? null,
    run: async (sql, params = []) => client.query(sql, params),
    exec: async (sql) => {
      let result;
      for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) {
        if (/^DROP VIEW IF EXISTS /i.test(statement)) continue; // pg-mem parser omits DROP VIEW IF EXISTS; fixture starts clean.
        if (/^LOCK TABLE /i.test(statement)) continue;
        if (/^CREATE TABLE IF NOT EXISTS mustahik_(?:applications|surveys|disbursements) /i.test(statement)) continue;
        result = await client.query(statement.replace(/^CREATE (?:OR REPLACE )?VIEW(?: IF NOT EXISTS)?/i, 'CREATE VIEW'));
      }
      return result;
    },
  };
  const result = await migrateMustahikNormalization({ db, backupPath, transaction: async (_db, callback) => callback(db) });
  assert.deepEqual(result.source_counts, { mustahik: 1, applications: 1, assessments: 1, ppd: 1 });
  assert.deepEqual(result.expected, {
    mustahik_profiles: 1, mustahik_applications: 1,
    mustahik_surveys: 1, mustahik_disbursements: 1,
  });
  assert.equal((await db.get('SELECT name FROM mustahik_profiles WHERE profile_id=$1', [1])).name, 'Synthetic User');
  for (const [index, table] of ['mustahik_applications', 'mustahik_surveys', 'mustahik_disbursements'].entries()) {
    assert.equal((await db.get(`SELECT profile_id FROM ${table} WHERE legacy_source_table=$1`, [table === 'mustahik_applications' ? 'applications' : table === 'mustahik_surveys' ? 'assessments' : 'ppd'])).profile_id, 1, `${table} preexisting valid history survives upgrade`);
    await db.run(`INSERT INTO ${table} (legacy_source_table, legacy_source_id, profile_id, source_payload) VALUES ($1, $2, $3, $4)`, ['fk-positive', index + 1, 1, '{}']);
    await assert.rejects(
      () => db.run(`INSERT INTO ${table} (legacy_source_table, legacy_source_id, profile_id, source_payload) VALUES ($1, $2, $3, $4)`, ['fk-orphan', index + 1, 999999, '{}']),
      undefined,
      `${table} must reject an orphan profile_id`,
    );
  }
  await db.run(`INSERT INTO mustahik_surveys (legacy_source_table,legacy_source_id,profile_id,assistance_type,spiritual_likert_json,raw_assessment_json,calculation_result_json,source_payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, ['contract', 30, 1, 'Pendidikan', '{"prayer_score":4}', '{"deficit":-100}', '{"result":-50}', '{}']);
  await db.run(`INSERT INTO mustahik_disbursements (legacy_source_table,legacy_source_id,profile_id,form_number,amount,fund_source,output_copy_metadata_json,source_payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, ['contract', 31, 1, 'F-PKP/03-31', 500, 'Hibah', '{"copies":3}', '{}']);
  assert.equal((await db.get("SELECT assistance_type FROM mustahik_surveys WHERE legacy_source_table=$1", ['contract'])).assistance_type, 'Pendidikan');
  assert.equal((await db.get("SELECT fund_source FROM mustahik_disbursements WHERE legacy_source_table=$1", ['contract'])).fund_source, 'Hibah');
});

test('SOP survey and disbursement contracts round-trip structured fields and validate ranges/enums', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.db.close(); await rm(f.directory, { recursive: true, force: true }); });
  await migrateMustahikNormalization({ db: f.db, backupPath: f.backupPath });
  const survey = validateSurveyPayload({ faith_practice: 4, prayer_score: 5, fasting_score: 3, charity_score: 2,
    house_indicators: { roof: 'tile', rooms: 2 }, asset_indicators: { vehicle: false }, income_indicators: { monthly: 1200000 },
    raw_assessment: { deficit: -2000000 }, calculation_result: { had_kifayah_gap: -500000 },
    photos: [{ type: 'house_front', file_ref: 'artifact:front-1' }] });
  const disbursement = validateDisbursementPayload({ amount: 2500000, fund_source: 'DSKL', approvals: [{ stage: 'finance', actor_id: 17 }] });
  await f.db.run(`INSERT INTO mustahik_surveys (legacy_source_table,legacy_source_id,profile_id,assistance_type,domicile,
    narrative_family,narrative_economy,narrative_urgency,had_kifayah_conclusion,house_indicators_json,asset_indicators_json,
    income_indicators_json,spiritual_likert_json,raw_assessment_json,calculation_result_json,recommended_amount,source_payload)
    VALUES ('manual',1,1,'Kesehatan','Kota Tangerang','keluarga','ekonomi','mendesak','defisit',?,?,?,?,?,?,2500000,'{}')`,
  [JSON.stringify(survey.house_indicators), JSON.stringify(survey.asset_indicators), JSON.stringify(survey.income_indicators),
    JSON.stringify({ faith_practice: survey.faith_practice, prayer_score: survey.prayer_score, fasting_score: survey.fasting_score, charity_score: survey.charity_score }),
    JSON.stringify(survey.raw_assessment), JSON.stringify(survey.calculation_result)]);
  await f.db.run(`INSERT INTO mustahik_survey_photo_refs (legacy_source_table,legacy_source_id,photo_type,file_ref) VALUES ('manual',1,'house_front','artifact:front-1')`);
  await f.db.run(`INSERT INTO mustahik_disbursements (legacy_source_table,legacy_source_id,profile_id,form_number,transaction_number,
    requester_name,amount,amount_in_words,purpose,fund_source,payment_type,output_copy_metadata_json,source_payload)
    VALUES ('manual',1,1,'F-PKP/03-1','TX-1','Applicant',2500000,'Dua juta lima ratus ribu','Biaya obat',?,'Transfer','{"copies":3}','{}')`, [disbursement.fund_source]);
  await f.db.run(`INSERT INTO mustahik_disbursement_approvals (legacy_source_table,legacy_source_id,stage,actor_id,decision) VALUES ('manual',1,'finance',17,'approved')`);
  const savedSurvey = await f.db.get("SELECT * FROM mustahik_surveys WHERE legacy_source_table='manual'");
  assert.equal(savedSurvey.assistance_type, 'Kesehatan');
  assert.deepEqual(JSON.parse(savedSurvey.spiritual_likert_json), { faith_practice: 4, prayer_score: 5, fasting_score: 3, charity_score: 2 });
  assert.deepEqual(JSON.parse(savedSurvey.calculation_result_json), { had_kifayah_gap: -500000 });
  assert.equal((await f.db.get("SELECT photo_type FROM mustahik_survey_photo_refs WHERE legacy_source_table='manual'")).photo_type, 'house_front');
  const savedPpd = await f.db.get("SELECT * FROM mustahik_disbursements WHERE legacy_source_table='manual'");
  assert.equal(savedPpd.fund_source, 'DSKL');
  assert.equal(savedPpd.amount_in_words, 'Dua juta lima ratus ribu');
  assert.equal(JSON.parse(savedPpd.output_copy_metadata_json).copies, 3);
  assert.equal((await f.db.get("SELECT actor_id FROM mustahik_disbursement_approvals WHERE legacy_source_table='manual'")).actor_id, 17);
  assert.equal((await f.db.get("SELECT source_payload FROM mustahik_surveys WHERE legacy_source_table='assessments'")).source_payload.includes('Surveyor A'), true, 'historical payload remains readable');
  assert.throws(() => validateSurveyPayload({ prayer_score: 6 }), /INVALID_SURVEY_LIKERT/);
  assert.throws(() => validateDisbursementPayload({ fund_source: 'APBN' }), /INVALID_DISBURSEMENT_FUND_SOURCE/);
  await assert.rejects(() => f.db.run(`INSERT INTO mustahik_disbursements (legacy_source_table,legacy_source_id,profile_id,fund_source,source_payload) VALUES ('bad',1,1,'APBN','{}')`), /invalid fund_source/);
});
