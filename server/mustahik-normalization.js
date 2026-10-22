import { link, open as openFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { withTransaction } from './db.js';

const SOURCE_TABLES = ['mustahik', 'applications', 'assessments', 'ppd'];

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS mustahik_profiles (
  profile_id INTEGER PRIMARY KEY,
  nik TEXT, kk_number TEXT, name TEXT, beneficiary_name TEXT, phone TEXT,
  marital_status TEXT, pob TEXT, dob TEXT, occupation TEXT, work_place TEXT,
  education_level TEXT, address TEXT, rt_rw TEXT, kelurahan TEXT, kecamatan TEXT,
  kabupaten_kota TEXT, province TEXT, legacy_source_id INTEGER NOT NULL UNIQUE,
  source_payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mustahik_applications (
  legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
  profile_id INTEGER NOT NULL, application_number TEXT, program TEXT,
  request_title TEXT, proposed_amount NUMERIC, received_date TEXT, status TEXT,
  rejection_reason TEXT, applied_at TEXT, source_payload TEXT NOT NULL,
  PRIMARY KEY (legacy_source_table, legacy_source_id)
);
CREATE TABLE IF NOT EXISTS mustahik_surveys (
  legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
  profile_id INTEGER NOT NULL, survey_date TEXT, surveyor_name TEXT,
  surveyor_phone TEXT, house_ownership TEXT, family_dependents INTEGER,
  monthly_income NUMERIC, monthly_expense NUMERIC, recommendation TEXT,
  asnaf TEXT, desil_score INTEGER, overall_score NUMERIC,
  assistance_type TEXT, domicile TEXT, narrative_family TEXT, narrative_economy TEXT,
  narrative_urgency TEXT, had_kifayah_conclusion TEXT,
  house_indicators_json TEXT NOT NULL DEFAULT '{}', asset_indicators_json TEXT NOT NULL DEFAULT '{}',
  income_indicators_json TEXT NOT NULL DEFAULT '{}', spiritual_likert_json TEXT NOT NULL DEFAULT '{}',
  raw_assessment_json TEXT NOT NULL DEFAULT '{}', calculation_result_json TEXT NOT NULL DEFAULT '{}',
  recommended_amount NUMERIC, scoring_method TEXT,
  source_payload TEXT NOT NULL,
  PRIMARY KEY (legacy_source_table, legacy_source_id)
);
CREATE TABLE IF NOT EXISTS mustahik_disbursements (
  legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
  profile_id INTEGER NOT NULL, ppd_number TEXT, bank_account TEXT,
  bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT,
  payment_method TEXT, amount NUMERIC, form_number TEXT, transaction_number TEXT,
  requester_name TEXT, requester_role TEXT, requester_department TEXT,
  amount_in_words TEXT, purpose TEXT,
  fund_source TEXT NOT NULL DEFAULT 'Zakat' CHECK (fund_source IN ('Zakat','Infaq/Shadaqah','DSKL','Hibah')),
  payment_type TEXT, finance_verification_status TEXT, finance_verified_by INTEGER, finance_verified_at TEXT,
  finance_note TEXT, finance_attachment_ref TEXT, output_copy_metadata_json TEXT NOT NULL DEFAULT '{}',
  source_payload TEXT NOT NULL,
  PRIMARY KEY (legacy_source_table, legacy_source_id)
);
CREATE TABLE IF NOT EXISTS mustahik_survey_photo_refs (
  legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('house_front','interior','interview','calculation_evidence')),
  file_ref TEXT NOT NULL, captured_at TEXT, recorded_by INTEGER,
  FOREIGN KEY (legacy_source_table, legacy_source_id) REFERENCES mustahik_surveys(legacy_source_table, legacy_source_id),
  PRIMARY KEY (legacy_source_table, legacy_source_id, photo_type, file_ref)
);
CREATE TABLE IF NOT EXISTS mustahik_disbursement_approvals (
  legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
  stage TEXT NOT NULL, actor_id INTEGER, actor_name TEXT, decision TEXT, acted_at TEXT, note TEXT,
  FOREIGN KEY (legacy_source_table, legacy_source_id) REFERENCES mustahik_disbursements(legacy_source_table, legacy_source_id),
  PRIMARY KEY (legacy_source_table, legacy_source_id, stage)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mustahik_profiles_nik ON mustahik_profiles(nik) WHERE nik IS NOT NULL AND nik <> '';
`;

const HISTORY_INDEX_DDL = `
CREATE INDEX IF NOT EXISTS idx_mustahik_applications_profile ON mustahik_applications(profile_id);
CREATE INDEX IF NOT EXISTS idx_mustahik_surveys_profile ON mustahik_surveys(profile_id);
CREATE INDEX IF NOT EXISTS idx_mustahik_disbursements_profile ON mustahik_disbursements(profile_id);
`;

const VIEW_DDL = `DROP VIEW IF EXISTS mustahik_normalized_read_model;
DROP VIEW IF EXISTS mustahik_profiles_read_model;
DROP VIEW IF EXISTS mustahik_applications_read_model;
DROP VIEW IF EXISTS mustahik_surveys_read_model;
DROP VIEW IF EXISTS mustahik_disbursements_read_model;
CREATE VIEW mustahik_normalized_read_model AS SELECT profile_id, nik, kk_number, name, beneficiary_name, phone, address FROM mustahik_profiles;
CREATE VIEW mustahik_profiles_read_model AS SELECT profile_id, nik, kk_number, name, beneficiary_name, phone, address FROM mustahik_profiles;
CREATE VIEW mustahik_applications_read_model AS SELECT legacy_source_table, legacy_source_id, profile_id, application_number, program, request_title, proposed_amount, received_date, status, rejection_reason, applied_at FROM mustahik_applications;
CREATE VIEW mustahik_surveys_read_model AS SELECT legacy_source_table, legacy_source_id, profile_id, survey_date, surveyor_name, surveyor_phone, house_ownership, family_dependents, monthly_income, monthly_expense, recommendation, asnaf, desil_score, overall_score, assistance_type, domicile, narrative_family, narrative_economy, narrative_urgency, had_kifayah_conclusion, house_indicators_json, asset_indicators_json, income_indicators_json, spiritual_likert_json, raw_assessment_json, calculation_result_json, recommended_amount, scoring_method FROM mustahik_surveys;
CREATE VIEW mustahik_disbursements_read_model AS SELECT legacy_source_table, legacy_source_id, profile_id, ppd_number, bank_account, bank_name, bank_account_name, disbursement_date, payment_method, amount, form_number, transaction_number, requester_name, requester_role, requester_department, amount_in_words, purpose, fund_source, payment_type, finance_verification_status, finance_verified_by, finance_verified_at, finance_note, finance_attachment_ref, output_copy_metadata_json FROM mustahik_disbursements`;

const HISTORY_TABLES = {
  mustahik_applications: `CREATE TABLE %TABLE% (
    legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL REFERENCES mustahik_profiles(profile_id), application_number TEXT, program TEXT,
    request_title TEXT, proposed_amount NUMERIC, received_date TEXT, status TEXT,
    rejection_reason TEXT, applied_at TEXT, source_payload TEXT NOT NULL,
    PRIMARY KEY (legacy_source_table, legacy_source_id)
  )`,
  mustahik_surveys: `CREATE TABLE %TABLE% (
    legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL REFERENCES mustahik_profiles(profile_id), survey_date TEXT, surveyor_name TEXT,
    surveyor_phone TEXT, house_ownership TEXT, family_dependents INTEGER,
    monthly_income NUMERIC, monthly_expense NUMERIC, recommendation TEXT,
    asnaf TEXT, desil_score INTEGER, overall_score NUMERIC,
    assistance_type TEXT, domicile TEXT, narrative_family TEXT, narrative_economy TEXT,
    narrative_urgency TEXT, had_kifayah_conclusion TEXT,
    house_indicators_json TEXT NOT NULL DEFAULT '{}', asset_indicators_json TEXT NOT NULL DEFAULT '{}',
    income_indicators_json TEXT NOT NULL DEFAULT '{}', spiritual_likert_json TEXT NOT NULL DEFAULT '{}',
    raw_assessment_json TEXT NOT NULL DEFAULT '{}', calculation_result_json TEXT NOT NULL DEFAULT '{}',
    recommended_amount NUMERIC, scoring_method TEXT,
    source_payload TEXT NOT NULL,
    PRIMARY KEY (legacy_source_table, legacy_source_id)
  )`,
  mustahik_disbursements: `CREATE TABLE %TABLE% (
    legacy_source_table TEXT NOT NULL, legacy_source_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL REFERENCES mustahik_profiles(profile_id), ppd_number TEXT, bank_account TEXT,
    bank_name TEXT, bank_account_name TEXT, disbursement_date TEXT,
    payment_method TEXT, amount NUMERIC, form_number TEXT, transaction_number TEXT,
    requester_name TEXT, requester_role TEXT, requester_department TEXT, amount_in_words TEXT, purpose TEXT,
    fund_source TEXT NOT NULL DEFAULT 'Zakat', payment_type TEXT, finance_verification_status TEXT,
    finance_verified_by INTEGER, finance_verified_at TEXT, finance_note TEXT, finance_attachment_ref TEXT,
    output_copy_metadata_json TEXT NOT NULL DEFAULT '{}', source_payload TEXT NOT NULL,
    PRIMARY KEY (legacy_source_table, legacy_source_id)
  )`,
};

const SOP_ADDITIONS = {
  mustahik_surveys: {
    assistance_type: 'TEXT', domicile: 'TEXT', narrative_family: 'TEXT', narrative_economy: 'TEXT',
    narrative_urgency: 'TEXT', had_kifayah_conclusion: 'TEXT', house_indicators_json: "TEXT NOT NULL DEFAULT '{}'",
    asset_indicators_json: "TEXT NOT NULL DEFAULT '{}'", income_indicators_json: "TEXT NOT NULL DEFAULT '{}'",
    spiritual_likert_json: "TEXT NOT NULL DEFAULT '{}'", raw_assessment_json: "TEXT NOT NULL DEFAULT '{}'",
    calculation_result_json: "TEXT NOT NULL DEFAULT '{}'", recommended_amount: 'NUMERIC', scoring_method: 'TEXT',
  },
  mustahik_disbursements: {
    form_number: 'TEXT', transaction_number: 'TEXT', requester_name: 'TEXT', requester_role: 'TEXT',
    requester_department: 'TEXT', amount_in_words: 'TEXT', purpose: 'TEXT', fund_source: "TEXT NOT NULL DEFAULT 'Zakat'",
    payment_type: 'TEXT', finance_verification_status: 'TEXT', finance_verified_by: 'INTEGER',
    finance_verified_at: 'TEXT', finance_note: 'TEXT', finance_attachment_ref: 'TEXT',
    output_copy_metadata_json: "TEXT NOT NULL DEFAULT '{}'",
  },
};

async function ensureSopColumns(db) {
  for (const [table, additions] of Object.entries(SOP_ADDITIONS)) {
    const columns = db.isPg
      ? (await db.all('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [table])).map((row) => row.column_name)
      : (await db.all(`PRAGMA table_info(${table})`)).map((row) => row.name);
    for (const [column, definition] of Object.entries(additions)) {
      if (!columns.includes(column)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  if (db.isPg) {
    const check = await db.get("SELECT 1 AS present FROM information_schema.table_constraints WHERE table_name='mustahik_disbursements' AND constraint_name='mustahik_disbursements_fund_source_check'");
    if (!check) await db.exec("ALTER TABLE mustahik_disbursements ADD CONSTRAINT mustahik_disbursements_fund_source_check CHECK (fund_source IN ('Zakat','Infaq/Shadaqah','DSKL','Hibah'))");
  } else {
    await db.exec(`CREATE TRIGGER IF NOT EXISTS mustahik_disbursements_fund_source_insert
      BEFORE INSERT ON mustahik_disbursements WHEN NEW.fund_source NOT IN ('Zakat','Infaq/Shadaqah','DSKL','Hibah')
      BEGIN SELECT RAISE(ABORT, 'invalid fund_source'); END;
      CREATE TRIGGER IF NOT EXISTS mustahik_disbursements_fund_source_update
      BEFORE UPDATE OF fund_source ON mustahik_disbursements WHEN NEW.fund_source NOT IN ('Zakat','Infaq/Shadaqah','DSKL','Hibah')
      BEGIN SELECT RAISE(ABORT, 'invalid fund_source'); END`);
  }
}

async function ensureHistoryForeignKeys(db) {
  for (const [table, ddl] of Object.entries(HISTORY_TABLES)) {
    if (!db.isPg) {
      const foreignKeys = await db.all(`PRAGMA foreign_key_list(${table})`);
      if (foreignKeys.some((fk) => fk.from === 'profile_id' && fk.table === 'mustahik_profiles' && fk.to === 'profile_id')) continue;
      const replacement = `${table}__fk_upgrade`;
      await db.exec(ddl.replace('%TABLE%', replacement));
      const columns = (await db.all(`PRAGMA table_info(${table})`)).map((column) => column.name);
      const names = columns.join(', ');
      await db.exec(`INSERT INTO ${replacement} (${names}) SELECT ${names} FROM ${table}`);
      await db.exec(`DROP TABLE ${table}`);
      await db.exec(`ALTER TABLE ${replacement} RENAME TO ${table}`);
    } else {
      const constraint = `${table}_profile_id_fkey`;
      const existing = await db.get(
        `SELECT 1 AS present FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_name=$2 AND constraint_type='FOREIGN KEY'`,
        [table, constraint],
      );
      if (!existing) await db.exec(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (profile_id) REFERENCES mustahik_profiles(profile_id)`);
    }
  }
}

function json(row) {
  return JSON.stringify(row, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}

function isPresent(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function projectApplication(table, row, profileId) {
  return {
    legacy_source_table: table, legacy_source_id: row.id, profile_id: profileId,
    application_number: row.application_number ?? row.file_no ?? null,
    program: row.program ?? null, request_title: row.request_title ?? null,
    proposed_amount: row.recommended_amount ?? row.amount ?? null,
    received_date: row.received_date ?? null, status: row.status ?? null,
    rejection_reason: row.rejection_reason ?? null, applied_at: row.applied_at ?? row.received_date ?? null,
    source_payload: json(row),
  };
}

function projectSurvey(table, row, profileId) {
  const spiritual = {
    faith_practice: row.faith_practice ?? null,
    prayer: row.prayer_score ?? null,
    fasting: row.fasting_score ?? null,
    charity: row.charity_score ?? null,
  };
  return {
    legacy_source_table: table, legacy_source_id: row.id, profile_id: profileId,
    survey_date: row.survey_date ?? null, surveyor_name: row.surveyor_name ?? null,
    surveyor_phone: row.surveyor_phone ?? null, house_ownership: row.house_ownership ?? null,
    family_dependents: row.family_dependents ?? row.child_count ?? null,
    monthly_income: row.monthly_income ?? null, monthly_expense: row.monthly_expense ?? null,
    recommendation: row.survey_recommendation ?? row.recommendation ?? null,
    asnaf: row.asnaf ?? null, desil_score: row.desil_score ?? null,
    overall_score: row.overall_score ?? null,
    assistance_type: row.assistance_type ?? row.program ?? null, domicile: row.domicile ?? row.address ?? null,
    narrative_family: row.narrative_family ?? null, narrative_economy: row.narrative_economy ?? row.narrative_income ?? null,
    narrative_urgency: row.narrative_urgency ?? row.narrative_request ?? null,
    had_kifayah_conclusion: row.had_kifayah_conclusion ?? row.narrative_conclusion ?? null,
    house_indicators_json: json(row.house_indicators ?? {}), asset_indicators_json: json(row.asset_indicators ?? {}),
    income_indicators_json: json(row.income_indicators ?? {}), spiritual_likert_json: json(spiritual),
    raw_assessment_json: json(row.raw_assessment ?? {}), calculation_result_json: json(row.calculation_result ?? {}),
    recommended_amount: row.recommended_amount ?? null, scoring_method: row.scoring_method ?? null,
    source_payload: json(row),
  };
}

function projectDisbursement(table, row, profileId) {
  return {
    legacy_source_table: table, legacy_source_id: row.id, profile_id: profileId,
    ppd_number: row.ppd_number ?? null, bank_account: row.bank_account ?? null,
    bank_name: row.bank_name ?? null, bank_account_name: row.bank_account_name ?? null,
    disbursement_date: row.disbursement_date ?? null, payment_method: row.payment_method ?? null,
    amount: row.amount ?? row.approved_amount ?? null,
    form_number: row.form_number ?? null, transaction_number: row.transaction_number ?? null,
    requester_name: row.requester_name ?? row.proposed_by ?? null, requester_role: row.requester_role ?? null,
    requester_department: row.requester_department ?? null, amount_in_words: row.amount_in_words ?? null,
    purpose: row.purpose ?? row.distribution_purpose ?? null,
    fund_source: ['Zakat', 'Infaq/Shadaqah', 'DSKL', 'Hibah'].includes(row.fund_source) ? row.fund_source : 'Zakat',
    payment_type: row.payment_type ?? row.payment_method ?? null,
    finance_verification_status: row.finance_verification_status ?? null,
    finance_verified_by: row.finance_verified_by ?? row.finance_approved_by_id ?? null,
    finance_verified_at: row.finance_verified_at ?? row.finance_approved_at ?? row.finance_checked_at ?? null,
    finance_note: row.finance_note ?? null, finance_attachment_ref: row.finance_attachment_ref ?? null,
    output_copy_metadata_json: json(row.output_copy_metadata ?? {}), source_payload: json(row),
  };
}

export function validateSurveyPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_SURVEY_PAYLOAD');
  for (const key of ['faith_practice', 'prayer_score', 'fasting_score', 'charity_score']) {
    const value = payload[key];
    if (value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 5)) throw new Error(`INVALID_SURVEY_LIKERT:${key}`);
  }
  for (const key of ['house_indicators', 'asset_indicators', 'income_indicators', 'raw_assessment', 'calculation_result']) {
    if (payload[key] !== undefined && (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key]))) throw new Error(`INVALID_SURVEY_OBJECT:${key}`);
  }
  if (payload.photos !== undefined && (!Array.isArray(payload.photos) || payload.photos.some((photo) => !photo || !['house_front', 'interior', 'interview', 'calculation_evidence'].includes(photo.type) || typeof photo.file_ref !== 'string' || !photo.file_ref.trim()))) throw new Error('INVALID_SURVEY_PHOTOS');
  return payload;
}

export function validateDisbursementPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_DISBURSEMENT_PAYLOAD');
  if (payload.fund_source !== undefined && !['Zakat', 'Infaq/Shadaqah', 'DSKL', 'Hibah'].includes(payload.fund_source)) throw new Error('INVALID_DISBURSEMENT_FUND_SOURCE');
  if (payload.amount !== undefined && (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) < 0)) throw new Error('INVALID_DISBURSEMENT_AMOUNT');
  if (payload.approvals !== undefined && (!Array.isArray(payload.approvals) || payload.approvals.some((approval) => !approval || typeof approval.stage !== 'string' || !approval.stage.trim()))) throw new Error('INVALID_DISBURSEMENT_APPROVALS');
  return payload;
}

function withDefaults(table, row, fallbackRows) {
  const hasRows = fallbackRows.some((candidate) => String(candidate.mustahik_id) === String(row.id));
  return hasRows ? [] : [{ table, row: { ...row, id: row.id } }];
}

async function readSources(db) {
  const result = {};
  for (const table of SOURCE_TABLES) {
    result[table] = await db.all(`SELECT * FROM ${table} ORDER BY id`);
  }
  return result;
}

async function writeBackup(backupPath, sources) {
  if (!backupPath || !path.isAbsolute(backupPath)) throw new Error('NORMALIZATION_BACKUP_PATH_MUST_BE_ABSOLUTE');
  const payload = `${JSON.stringify({ format: 'baznas-mustahik-normalization-backup-v1', created_at: new Date().toISOString(), sources }, null, 2)}\n`;
  const temporary = `${backupPath}.${process.pid}.tmp`;
  const handle = await openFile(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, backupPath);
    await unlink(temporary);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (error.code === 'EEXIST') throw new Error(`NORMALIZATION_BACKUP_ALREADY_EXISTS:${backupPath}`);
    throw error;
  }
}

function makeUpsert(table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const conflict = table === 'mustahik_profiles' ? 'profile_id' : 'legacy_source_table, legacy_source_id';
  const updates = columns.filter((column) => !conflict.split(', ').includes(column))
    .map((column) => `${column}=excluded.${column}`).join(', ');
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflict}) DO UPDATE SET ${updates}`,
    values: columns.map((column) => row[column]),
  };
}

async function applyRows(db, table, rows) {
  for (const row of rows) {
    const { sql, values } = makeUpsert(table, row);
    await db.run(sql, values);
  }
}

async function applySopRelations(db, assessments, ppdRows) {
  for (const row of assessments) {
    const refs = Array.isArray(row.photos) ? row.photos : [];
    for (const photo of refs) {
      if (!photo || !['house_front', 'interior', 'interview', 'calculation_evidence'].includes(photo.type) || typeof (photo.file_ref ?? photo.url) !== 'string') continue;
      await db.run(`INSERT INTO mustahik_survey_photo_refs (legacy_source_table,legacy_source_id,photo_type,file_ref,captured_at,recorded_by)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (legacy_source_table,legacy_source_id,photo_type,file_ref) DO NOTHING`,
      ['assessments', row.id, photo.type, photo.file_ref ?? photo.url, photo.captured_at ?? null, photo.recorded_by ?? null]);
    }
  }
  for (const row of ppdRows) {
    const approvals = Array.isArray(row.approvals) ? row.approvals : [];
    for (const approval of approvals) {
      if (!approval || typeof approval.stage !== 'string' || !approval.stage.trim()) continue;
      await db.run(`INSERT INTO mustahik_disbursement_approvals (legacy_source_table,legacy_source_id,stage,actor_id,actor_name,decision,acted_at,note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (legacy_source_table,legacy_source_id,stage)
        DO UPDATE SET actor_id=excluded.actor_id, actor_name=excluded.actor_name, decision=excluded.decision, acted_at=excluded.acted_at, note=excluded.note`,
      ['ppd', row.id, approval.stage, approval.actor_id ?? null, approval.actor_name ?? null, approval.decision ?? null, approval.acted_at ?? null, approval.note ?? null]);
    }
  }
}

/** Copies legacy records into additive normalized tables. The caller must choose a unique, protected backup path. */
export async function migrateMustahikNormalization({ db, backupPath, transaction = withTransaction }) {
  let backupWritten = false;
  try {
    // SQLite disables FK enforcement by default; enable it before the transaction begins.
    if (!db.isPg) await db.exec('PRAGMA foreign_keys = ON');
    return await transaction(db, async (tx) => {
      if (tx.isPg) await tx.exec('LOCK TABLE mustahik, applications, assessments, ppd IN SHARE ROW EXCLUSIVE MODE');
      const sources = await readSources(tx);
      for (const row of sources.mustahik) {
        if (isPresent(row.nik) && !/^\d{16}$/.test(String(row.nik))) {
          throw new Error(`NORMALIZATION_INVALID_NIK:${row.id}`);
        }
      }
      const profiles = sources.mustahik.map((row) => ({
        profile_id: row.id, legacy_source_id: row.id, nik: row.nik ?? null,
        kk_number: row.kk_number ?? null, name: row.name ?? null,
        beneficiary_name: row.beneficiary_name ?? null, phone: row.phone ?? null,
        marital_status: row.marital_status ?? null, pob: row.pob ?? null, dob: row.dob ?? null,
        occupation: row.occupation ?? null, work_place: row.work_place ?? null,
        education_level: row.education_level ?? null, address: row.address ?? null,
        rt_rw: row.rt_rw ?? null, kelurahan: row.kelurahan ?? null,
        kecamatan: row.kecamatan ?? null, kabupaten_kota: row.kabupaten_kota ?? null,
        province: row.province ?? null, source_payload: json(row),
      }));
      const applications = sources.applications.map((row) => projectApplication('applications', row, row.mustahik_id));
      const surveys = sources.assessments.map((row) => projectSurvey('assessments', row, row.mustahik_id));
      const disbursements = sources.ppd.map((row) => projectDisbursement('ppd', row, row.mustahik_id));
      for (const profile of sources.mustahik) {
        for (const fallback of withDefaults('mustahik', profile, sources.applications)) applications.push(projectApplication(fallback.table, fallback.row, profile.id));
        for (const fallback of withDefaults('mustahik', profile, sources.assessments)) surveys.push(projectSurvey(fallback.table, fallback.row, profile.id));
        if (!sources.ppd.some((row) => String(row.mustahik_id) === String(profile.id)) && ['ppd_number', 'bank_account', 'bank_name', 'disbursement_date', 'approved_amount'].some((key) => isPresent(profile[key]))) {
          disbursements.push(projectDisbursement('mustahik', profile, profile.id));
        }
      }

      // The DB lock/snapshot is held while this independent backup file is durably written.
      await writeBackup(backupPath, sources);
      backupWritten = true;
      const profileIds = new Set(sources.mustahik.map((row) => String(row.id)));
      for (const table of ['applications', 'assessments', 'ppd']) {
        for (const row of sources[table]) {
          if (!profileIds.has(String(row.mustahik_id))) throw new Error(`NORMALIZATION_ORPHAN_MUSTAHIK_ID:${table}:${row.id}:${row.mustahik_id}`);
        }
      }
      await tx.exec(TABLE_DDL);
      await applyRows(tx, 'mustahik_profiles', profiles);
      await tx.exec('DROP VIEW IF EXISTS mustahik_normalized_read_model; DROP VIEW IF EXISTS mustahik_profiles_read_model; DROP VIEW IF EXISTS mustahik_applications_read_model; DROP VIEW IF EXISTS mustahik_surveys_read_model; DROP VIEW IF EXISTS mustahik_disbursements_read_model');
      await ensureHistoryForeignKeys(tx);
      await ensureSopColumns(tx);
      await tx.exec(HISTORY_INDEX_DDL);
      await tx.exec(VIEW_DDL);
      await applyRows(tx, 'mustahik_applications', applications);
      await applyRows(tx, 'mustahik_surveys', surveys);
      await applyRows(tx, 'mustahik_disbursements', disbursements);
      await applySopRelations(tx, sources.assessments, sources.ppd);

      const expected = {
        mustahik_profiles: profiles.length,
        mustahik_applications: applications.length,
        mustahik_surveys: surveys.length,
        mustahik_disbursements: disbursements.length,
      };
      for (const [table, count] of Object.entries(expected)) {
        const actual = Number((await tx.get(`SELECT COUNT(*) AS count FROM ${table}`))?.count ?? 0);
        if (actual !== count) throw new Error(`NORMALIZATION_ROW_COUNT_MISMATCH:${table}:${count}:${actual}`);
      }
      for (const row of profiles) {
        const saved = await tx.get('SELECT source_payload FROM mustahik_profiles WHERE profile_id=$1', [row.profile_id]);
        if (saved?.source_payload !== row.source_payload) throw new Error(`NORMALIZATION_PAYLOAD_MISMATCH:mustahik_profiles:${row.profile_id}`);
      }
      for (const [table, rows] of [['mustahik_applications', applications], ['mustahik_surveys', surveys], ['mustahik_disbursements', disbursements]]) {
        for (const row of rows) {
          const saved = await tx.get(`SELECT source_payload FROM ${table} WHERE legacy_source_table=$1 AND legacy_source_id=$2`, [row.legacy_source_table, row.legacy_source_id]);
          if (saved?.source_payload !== row.source_payload) throw new Error(`NORMALIZATION_PAYLOAD_MISMATCH:${table}:${row.legacy_source_table}:${row.legacy_source_id}`);
        }
      }
      const afterSources = await readSources(tx);
      for (const sourceTable of SOURCE_TABLES) {
        if (afterSources[sourceTable].length !== sources[sourceTable].length) {
          throw new Error(`NORMALIZATION_SOURCE_ROW_COUNT_MISMATCH:${sourceTable}:${sources[sourceTable].length}:${afterSources[sourceTable].length}`);
        }
        for (let index = 0; index < sources[sourceTable].length; index += 1) {
          if (json(afterSources[sourceTable][index]) !== json(sources[sourceTable][index])) {
            throw new Error(`NORMALIZATION_SOURCE_PAYLOAD_MISMATCH:${sourceTable}:${sources[sourceTable][index].id}`);
          }
        }
      }
      return { expected, source_counts: Object.fromEntries(Object.entries(sources).map(([name, rows]) => [name, rows.length])), backup_path: backupPath };
    });
  } catch (error) {
    if (backupWritten) error.message = `${error.message}; backup retained at ${backupPath}`;
    throw error;
  }
}
