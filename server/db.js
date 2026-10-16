import pg from 'pg';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import {
  generateMustahikSeed,
  INITIAL_PROGRAM_INITIATIVES,
  INITIAL_REPORTS
} from './seed_data.js';
import { allowsDemoSeed, requiresPostgres } from './runtime-policy.js';
import { runPendingMigrations, verifyP0Schema } from './penyaluran-p0/migration-runner.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Complete 60 columns master schema definition for mustahik
export const MUSTAHIK_COLUMNS = [
  { name: 'id', type: 'SERIAL PRIMARY KEY' },
  { name: 'file_no', type: 'VARCHAR(100) UNIQUE' },
  { name: 'received_date', type: 'VARCHAR(50)' },
  { name: 'name', type: 'VARCHAR(255)' },
  { name: 'applicant_status', type: "VARCHAR(50) DEFAULT 'Perorangan'" },
  { name: 'beneficiary_name', type: 'VARCHAR(255)' },
  { name: 'nik', type: 'VARCHAR(50)' },
  { name: 'kk_number', type: 'VARCHAR(50)' },
  { name: 'phone', type: 'VARCHAR(50)' },
  { name: 'marital_status', type: 'VARCHAR(50)' },
  { name: 'pob', type: 'VARCHAR(100)' },
  { name: 'dob', type: 'VARCHAR(50)' },
  { name: 'occupation', type: 'VARCHAR(100)' },
  { name: 'work_place', type: 'VARCHAR(255)' },
  { name: 'education_level', type: 'VARCHAR(50)' },
  { name: 'address', type: 'TEXT' },
  { name: 'rt_rw', type: 'VARCHAR(50)' },
  { name: 'kelurahan', type: 'VARCHAR(100)' },
  { name: 'kecamatan', type: 'VARCHAR(100)' },
  { name: 'kabupaten_kota', type: "VARCHAR(100) DEFAULT 'Kota Tangerang'" },
  { name: 'province', type: "VARCHAR(100) DEFAULT 'Banten'" },
  { name: 'survey_date', type: 'VARCHAR(50)' },
  { name: 'surveyor_name', type: 'VARCHAR(255)' },
  { name: 'surveyor_phone', type: 'VARCHAR(50)' },
  { name: 'house_ownership', type: 'VARCHAR(100)' },
  { name: 'family_dependents', type: 'INTEGER DEFAULT 0' },
  { name: 'monthly_income', type: 'NUMERIC DEFAULT 0' },
  { name: 'monthly_expense', type: 'NUMERIC DEFAULT 0' },
  { name: 'remaining_income', type: 'NUMERIC DEFAULT 0' },
  { name: 'survey_recommendation', type: 'TEXT' },
  { name: 'survey_notes', type: 'TEXT' },
  { name: 'application_count', type: 'INTEGER DEFAULT 1' },
  { name: 'beneficiary_count', type: 'INTEGER DEFAULT 1' },
  { name: 'priority', type: 'VARCHAR(50)' },
  { name: 'recommended_amount', type: 'NUMERIC DEFAULT 0' },
  { name: 'approved_amount', type: 'NUMERIC DEFAULT 0' },
  { name: 'mpzis_date', type: 'VARCHAR(50)' },
  { name: 'ppd_number', type: 'VARCHAR(100)' },
  { name: 'disbursement_date', type: 'VARCHAR(50)' },
  { name: 'payment_method', type: 'VARCHAR(100)' },
  { name: 'bank_account', type: 'VARCHAR(100)' },
  { name: 'bank_name', type: 'VARCHAR(100)' },
  { name: 'bank_account_name', type: 'VARCHAR(255)' },
  { name: 'asnaf', type: "VARCHAR(100) DEFAULT 'Fakir Miskin'" },
  { name: 'fund_source', type: "VARCHAR(100) DEFAULT 'Zakat'" },
  { name: 'distribution_purpose', type: 'TEXT' },
  { name: 'parent_occupation', type: 'VARCHAR(100)' },
  { name: 'desil_score', type: 'INTEGER' },
  { name: 'program', type: 'VARCHAR(100)' },
  { name: 'request_title', type: 'TEXT' },
  { name: 'status', type: "VARCHAR(100) DEFAULT 'Diajukan'" },
  { name: 'rejection_reason', type: 'TEXT' },
  { name: 'house_index', type: 'INTEGER' },
  { name: 'asset_index', type: 'INTEGER' },
  { name: 'income_index', type: 'INTEGER' },
  { name: 'spiritual_score', type: 'INTEGER' },
  { name: 'overall_score', type: 'NUMERIC' },
  { name: 'notes', type: 'TEXT' },
  { name: 'workflow_version', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'workflow_mode', type: "TEXT NOT NULL DEFAULT 'legacy'" },
  { name: 'created_by_id', type: 'INTEGER' },
  { name: 'legacy_status_snapshot', type: 'TEXT' },
  { name: 'p0_reconciled_at', type: 'TIMESTAMP' },
  { name: 'p0_reconciled_by', type: 'INTEGER' },
  { name: 'archived_at', type: 'TIMESTAMP' },
  { name: 'archived_by_id', type: 'INTEGER' },
  { name: 'archive_reason', type: 'TEXT' },
  { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
  { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
];

export const P0_CONTROL_COLUMNS = Object.freeze([
  'workflow_version',
  'workflow_mode',
  'created_by_id',
  'legacy_status_snapshot',
  'p0_reconciled_at',
  'p0_reconciled_by',
  'archived_at',
  'archived_by_id',
  'archive_reason',
]);

export const LEGACY_MUSTAHIK_WRITABLE_COLUMNS = Object.freeze(
  MUSTAHIK_COLUMNS
    .map(c => c.name)
    .filter(n => n !== 'id' && n !== 'created_at' && n !== 'updated_at' && !P0_CONTROL_COLUMNS.includes(n))
);

// These are the legacy application tables required before a PostgreSQL
// database may proceed to versioned P0 migrations. A partially-created
// database fails closed instead of relying on swallowed ALTER errors.
export const REQUIRED_LEGACY_TABLES = Object.freeze([
  'mustahik',
  'applications',
  'assessments',
  'mpzis',
  'ppd',
  'documents',
  'wa_logs',
  'bot_sessions',
  'users',
  'program_initiatives',
  'reports',
  'activity_logs',
  'master_data',
  'approval_decisions',
  'auth_sessions',
]);

// Transitional PostgreSQL bootstrap for legacy application tables absent from
// the canonical schema.sql when P0 is disabled. P0-enabled PostgreSQL starts
// from the complete fresh-state schema and then verifies versioned migrations.
const LEGACY_PG_BOOTSTRAP_DDL = `
  CREATE TABLE IF NOT EXISTS program_initiatives (
    id SERIAL PRIMARY KEY,
    pilar_id VARCHAR(50) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    pic VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Aktif',
    next_milestone VARCHAR(255),
    mustahik_target INTEGER DEFAULT 0,
    mustahik_count INTEGER DEFAULT 0,
    budget_amount NUMERIC DEFAULT 0,
    realized_amount NUMERIC DEFAULT 0,
    percentage NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(100) PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    period VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Siap diekspor',
    file_url TEXT,
    metrics_json TEXT,
    updated_at VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
    actor_name VARCHAR(255),
    action_type VARCHAR(100),
    title VARCHAR(255),
    description TEXT,
    old_status VARCHAR(100),
    new_status VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    jti VARCHAR(100) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
`;

let poolInstance = null;
let dbWrapper = null;
let isPgActive = false;

/**
 * Returns optimized PostgreSQL Connection Pool instance
 * Configured with:
 * - max: 20 connection pool limit
 * - idleTimeoutMillis: 30000 (30 seconds)
 * - connectionTimeoutMillis: 5000 (5 seconds fast-fail)
 */
export function getPool() {
  if (!poolInstance) {
    const connectionConfig = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('sslmode=require') || process.env.PGSSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
        }
      : {
          host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5432', 10),
          database: process.env.PGDATABASE || process.env.DB_NAME || 'baznas_db',
          user: process.env.PGUSER || process.env.DB_USER || 'postgres',
          password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'postgres',
          ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
        };

    poolInstance = new Pool({
      ...connectionConfig,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    poolInstance.isPg = true;

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client pool:', err.message);
    });
  }
  return poolInstance;
}

/**
 * Helper to adapt PostgreSQL queries ($1, $2, RETURNING, ILIKE) for SQLite fallback
 */
function adaptSqlForSqlite(sql) {
  let adapted = sql;
  adapted = adapted.replace(/ILIKE/gi, 'LIKE');
  adapted = adapted.replace(/\$([0-9]+)/g, '?');
  adapted = adapted.replace(/\s+RETURNING\s+[\w\s,*()]+/gi, '');
  adapted = adapted.replace(/\s+FOR\s+UPDATE(\s+OF\s+[\w\s,]+)?(\s+NOWAIT|\s+SKIP\s+LOCKED)?/gi, '');
  adapted = adapted.replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  adapted = adapted.replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'TIMESTAMP');
  adapted = adapted.replace(/TIMESTAMPTZ/gi, 'TIMESTAMP');
  adapted = adapted.replace(/::jsonb/gi, '');
  adapted = adapted.replace(/JSONB/gi, 'TEXT');
  return adapted;
}

function adaptSqlAndParamsForSqlite(sql, params = []) {
  const normalizedParams = Array.isArray(params) ? params : [params];
  const newParams = [];
  let adapted = sql.replace(/ILIKE/gi, 'LIKE');
  adapted = adapted.replace(/\$([0-9]+)/g, (_match, p1) => {
    const idx = parseInt(p1, 10) - 1;
    newParams.push(normalizedParams[idx]);
    return '?';
  });
  adapted = adapted.replace(/\s+RETURNING\s+[\w\s,*()]+/gi, '');
  adapted = adapted.replace(/\s+FOR\s+UPDATE(\s+OF\s+[\w\s,]+)?(\s+NOWAIT|\s+SKIP\s+LOCKED)?/gi, '');
  adapted = adapted.replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  adapted = adapted.replace(/TIMESTAMP\s+WITH\s+TIME\s+ZONE/gi, 'TIMESTAMP');
  adapted = adapted.replace(/TIMESTAMPTZ/gi, 'TIMESTAMP');
  adapted = adapted.replace(/::jsonb/gi, '');
  adapted = adapted.replace(/JSONB/gi, 'TEXT');
  return { sql: adapted, params: newParams };
}

/**
 * Provides a database adapter with SQLite-compatible method ergonomics
 * (get, all, run, query, exec) powered by PostgreSQL Pool with resilient local fallback.
 */
export async function getDb({ env = process.env, poolFactory = getPool } = {}) {
  if (dbWrapper) return dbWrapper;

  const pool = poolFactory();

  try {
    // Probe PostgreSQL connection with timeout
    const testClient = await pool.connect();
    testClient.release();
    isPgActive = true;
    pool.isPg = true;
    console.log('⚡ Connected to PostgreSQL Database Engine (Pool max: 20, idle: 30s)');

    dbWrapper = {
      isPg: true,
      pool,

      async query(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        return pool.query(text, normalizedParams);
      },

      async get(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await pool.query(text, normalizedParams);
        return res.rows && res.rows.length > 0 ? res.rows[0] : null;
      },

      async all(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await pool.query(text, normalizedParams);
        return res.rows || [];
      },

      async run(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await pool.query(text, normalizedParams);
        const firstRow = res.rows && res.rows[0] ? res.rows[0] : null;
        const lastID = firstRow ? (firstRow.id !== undefined ? firstRow.id : (firstRow.chat_id !== undefined ? firstRow.chat_id : null)) : null;

        return {
          lastID,
          rowCount: res.rowCount,
          rows: res.rows || []
        };
      },

      async exec(sql) {
        return pool.query(sql);
      }
    };
  } catch (pgErr) {
    if (requiresPostgres(env)) {
      const error = new Error('PostgreSQL wajib tersedia di production. Backend tidak akan menggunakan SQLite fallback.');
      error.code = 'POSTGRES_REQUIRED';
      error.cause = pgErr;
      throw error;
    }
    console.warn(`⚠️ PostgreSQL unavailable (${pgErr.message}), activating high-speed SQLite adapter engine...`);
    const sqlitePath = path.resolve(__dirname, 'baznas_demo.db');
    const sqliteDb = await open({
      filename: sqlitePath,
      driver: sqlite3.Database
    });

    dbWrapper = {
      isPg: false,
      pool: null,
      sqliteDb,

      async query(text, params = []) {
        const { sql: adapted, params: newParams } = adaptSqlAndParamsForSqlite(text, params);
        const rows = await sqliteDb.all(adapted, newParams);
        return { rows, rowCount: rows.length };
      },

      async get(text, params = []) {
        const { sql: adapted, params: newParams } = adaptSqlAndParamsForSqlite(text, params);
        return sqliteDb.get(adapted, newParams);
      },

      async all(text, params = []) {
        const { sql: adapted, params: newParams } = adaptSqlAndParamsForSqlite(text, params);
        return sqliteDb.all(adapted, newParams);
      },

      async run(text, params = []) {
        const { sql: adapted, params: newParams } = adaptSqlAndParamsForSqlite(text, params);
        const res = await sqliteDb.run(adapted, newParams);
        return {
          lastID: res.lastID,
          rowCount: res.changes,
          rows: []
        };
      },

      async exec(sql) {
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(Boolean);

        for (const stmt of statements) {
          const adapted = adaptSqlForSqlite(stmt);
          try {
            await sqliteDb.exec(adapted);
          } catch (e) {
            // Ignore index or column exists notices
          }
        }
      }
    };
  }

  return dbWrapper;
}

export const PENERIMAAN_DDL_MARKER = '-- Divisi Penerimaan - PostgreSQL DDL Schema';

export function getPenerimaanDdl() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const idx = schemaSql.indexOf(PENERIMAAN_DDL_MARKER);
  if (idx === -1) {
    throw new Error(`Penerimaan DDL marker "${PENERIMAAN_DDL_MARKER}" not found in server/schema.sql`);
  }
  return schemaSql.slice(idx);
}

export async function initDb(options = {}) {
  const {
    dbProvider = getDb,
    schemaRunner = null,
    migrationRunner = runPendingMigrations,
    p0SchemaVerifier = verifyP0Schema,
    legacyBootstrapRunner = null,
    compatibilityRunner = null,
    seedRunner = null,
    migrationsDir: configuredMigrationsDir = null,
  } = options;
  if (Object.keys(options).length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error('P0_TEST_SEAMS_REQUIRE_TEST_ENV');
  }
  const db = await dbProvider();
  const isPostgres = db.isPg === true;
  const migrationsDir = configuredMigrationsDir || path.resolve(__dirname, 'migrations');
  const p0Enabled = process.env.PENYALURAN_P0_ENABLED === 'true';
  if (p0Enabled && !isPostgres) {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES');
  }

  try {
    // SQLite keeps the existing local/legacy bootstrap. P0 migrations are
    // PostgreSQL-only and must never be adapted or partially applied here.
    if (!isPostgres) {
      await db.exec(`
      CREATE TABLE IF NOT EXISTS mustahik (
        id SERIAL PRIMARY KEY,
        file_no VARCHAR(100) UNIQUE,
        received_date VARCHAR(50),
        name VARCHAR(255),
        applicant_status VARCHAR(50) DEFAULT 'Perorangan',
        beneficiary_name VARCHAR(255),
        nik VARCHAR(50),
        kk_number VARCHAR(50),
        phone VARCHAR(50),
        marital_status VARCHAR(50),
        pob VARCHAR(100),
        dob VARCHAR(50),
        occupation VARCHAR(100),
        work_place VARCHAR(255),
        education_level VARCHAR(50),
        address TEXT,
        rt_rw VARCHAR(50),
        kelurahan VARCHAR(100),
        kecamatan VARCHAR(100),
        kabupaten_kota VARCHAR(100) DEFAULT 'Kota Tangerang',
        province VARCHAR(100) DEFAULT 'Banten',
        survey_date VARCHAR(50),
        surveyor_name VARCHAR(255),
        surveyor_phone VARCHAR(50),
        house_ownership VARCHAR(100),
        family_dependents INTEGER DEFAULT 0,
        monthly_income NUMERIC DEFAULT 0,
        monthly_expense NUMERIC DEFAULT 0,
        remaining_income NUMERIC DEFAULT 0,
        survey_recommendation TEXT,
        survey_notes TEXT,
        application_count INTEGER DEFAULT 1,
        beneficiary_count INTEGER DEFAULT 1,
        priority VARCHAR(50),
        recommended_amount NUMERIC DEFAULT 0,
        approved_amount NUMERIC DEFAULT 0,
        mpzis_date VARCHAR(50),
        ppd_number VARCHAR(100),
        disbursement_date VARCHAR(50),
        payment_method VARCHAR(100),
        bank_account VARCHAR(100),
        bank_name VARCHAR(100),
        bank_account_name VARCHAR(255),
        asnaf VARCHAR(100) DEFAULT 'Fakir Miskin',
        fund_source VARCHAR(100) DEFAULT 'Zakat',
        distribution_purpose TEXT,
        parent_occupation VARCHAR(100),
        desil_score INTEGER,
        program VARCHAR(100),
        request_title TEXT,
        status VARCHAR(100) DEFAULT 'Diajukan',
        rejection_reason TEXT,
        house_index INTEGER,
        asset_index INTEGER,
        income_index INTEGER,
        spiritual_score INTEGER,
        overall_score NUMERIC,
        notes TEXT,
        workflow_version INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        application_number VARCHAR(100),
        program VARCHAR(100),
        request_title TEXT,
        status VARCHAR(100) DEFAULT 'Diajukan',
        notes TEXT,
        rejection_reason TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
        surveyor_name VARCHAR(255),
        surveyor_phone VARCHAR(50),
        survey_date VARCHAR(50),
        survey_method VARCHAR(100),
        narrative_family TEXT,
        narrative_income TEXT,
        narrative_request TEXT,
        narrative_conclusion TEXT,
        house_index INTEGER,
        asset_index INTEGER,
        income_index INTEGER,
        spiritual_score INTEGER,
        overall_score NUMERIC,
        priority VARCHAR(50),
        recommendation TEXT,
        notes TEXT,
        photos TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS mpzis (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
        form_number VARCHAR(100),
        mpzis_date VARCHAR(50),
        program_classification VARCHAR(100),
        purpose TEXT,
        asnaf VARCHAR(100),
        fund_source VARCHAR(100),
        recipient_name VARCHAR(255),
        recipient_type VARCHAR(100),
        beneficiary_count INTEGER,
        total_amount NUMERIC,
        proposed_by VARCHAR(255),
        examined_by VARCHAR(255),
        ashnaf_verifier VARCHAR(255),
        responsible VARCHAR(255),
        approved_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ppd (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
        form_number VARCHAR(100),
        ppd_number VARCHAR(100),
        transaction_number VARCHAR(100),
        requester_name VARCHAR(255),
        requester_role VARCHAR(255),
        requester_department VARCHAR(255),
        amount NUMERIC,
        amount_in_words TEXT,
        purpose TEXT,
        fund_source TEXT,
        bank_account_info TEXT,
        payment_type VARCHAR(100),
        disbursement_date VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        doc_type VARCHAR(100),
        filename VARCHAR(255),
        original_name VARCHAR(255),
        file_url TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wa_logs (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        phone VARCHAR(50),
        phase VARCHAR(100),
        message TEXT,
        wa_url TEXT,
        status VARCHAR(50) DEFAULT 'sent',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bot_sessions (
        chat_id BIGINT PRIMARY KEY,
        state VARCHAR(50) DEFAULT 'idle',
        temp_data TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'penyaluran',
        division VARCHAR(100) DEFAULT 'Divisi Penyaluran',
        level VARCHAR(20) NOT NULL DEFAULT 'staff',
        avatar VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS program_initiatives (
        id SERIAL PRIMARY KEY,
        pilar_id VARCHAR(50) NOT NULL,
        code VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        pic VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Aktif',
        next_milestone VARCHAR(255),
        mustahik_target INTEGER DEFAULT 0,
        mustahik_count INTEGER DEFAULT 0,
        budget_amount NUMERIC DEFAULT 0,
        realized_amount NUMERIC DEFAULT 0,
        percentage NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(100) PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        period VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        scope VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Siap diekspor',
        file_url TEXT,
        metrics_json TEXT,
        updated_at VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER REFERENCES mustahik(id) ON DELETE CASCADE,
        actor_name VARCHAR(255),
        action_type VARCHAR(100),
        title VARCHAR(255),
        description TEXT,
        old_status VARCHAR(100),
        new_status VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS master_data (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        record_key VARCHAR(100) NOT NULL,
        label VARCHAR(255) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, record_key)
      );

      CREATE TABLE IF NOT EXISTS approval_decisions (
        id SERIAL PRIMARY KEY,
        mustahik_id INTEGER NOT NULL,
        stage VARCHAR(100) NOT NULL,
        action VARCHAR(30) NOT NULL,
        previous_status VARCHAR(100) NOT NULL,
        next_status VARCHAR(100) NOT NULL,
        note TEXT NOT NULL,
        approved_amount NUMERIC,
        actor_id INTEGER,
        actor_name VARCHAR(255) NOT NULL,
        actor_role VARCHAR(100) NOT NULL,
        actor_level VARCHAR(20),
        actor_division VARCHAR(100),
        prepared_by_id INTEGER,
        correlation_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        jti VARCHAR(100) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_mustahik_file_no ON mustahik(file_no);
      CREATE INDEX IF NOT EXISTS idx_mustahik_nik ON mustahik(nik);
      CREATE INDEX IF NOT EXISTS idx_mustahik_phone ON mustahik(phone);
      CREATE INDEX IF NOT EXISTS idx_mustahik_status ON mustahik(status);
      CREATE INDEX IF NOT EXISTS idx_mustahik_program ON mustahik(program);
      CREATE INDEX IF NOT EXISTS idx_mustahik_received_date ON mustahik(received_date);
      CREATE INDEX IF NOT EXISTS idx_mustahik_kecamatan ON mustahik(kecamatan);
      CREATE INDEX IF NOT EXISTS idx_mustahik_created_at ON mustahik(created_at);
      CREATE INDEX IF NOT EXISTS idx_mustahik_asnaf ON mustahik(asnaf);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at DESC);
      CREATE INDEX IF NOT EXISTS idx_applications_mustahik ON applications(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_assessments_mustahik ON assessments(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_mpzis_mustahik ON mpzis(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_ppd_mustahik ON ppd(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_documents_mustahik ON documents(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_wa_logs_mustahik ON wa_logs(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_initiatives_pilar ON program_initiatives(pilar_id);
      CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
      CREATE INDEX IF NOT EXISTS idx_activity_mustahik ON activity_logs(mustahik_id);
      CREATE INDEX IF NOT EXISTS idx_master_data_category ON master_data(category);
      CREATE INDEX IF NOT EXISTS idx_approval_decisions_mustahik ON approval_decisions(mustahik_id, created_at DESC);
      `);
    }

    if (isPostgres) {
      // A clean PostgreSQL database receives the canonical baseline schema
      // before versioned migrations. Existing databases are handled by the
      // compatibility/evolution block below.
      const existingTables = await db.all(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> 'schema_migrations'
      `);
      if (existingTables.length === 0) {
        const baselineSchema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
        if (schemaRunner) await schemaRunner(db, baselineSchema);
        else await db.exec(baselineSchema);
      if (!p0Enabled) {
          if (legacyBootstrapRunner) await legacyBootstrapRunner(db, LEGACY_PG_BOOTSTRAP_DDL);
          else await db.exec(LEGACY_PG_BOOTSTRAP_DDL);
        }
      } else {
        const existingTableNames = new Set(existingTables.map((row) => String(row.table_name || '').toLowerCase()));
        const missingLegacyTables = REQUIRED_LEGACY_TABLES.filter((table) => !existingTableNames.has(table));
        if (missingLegacyTables.length > 0) {
          throw new Error(`P0_REQUIRED_LEGACY_TABLES_MISSING:${missingLegacyTables.join(',')}`);
        }
      }
      if (p0Enabled) {
        await migrationRunner({ pool: db.pool, migrationsDir });
        await p0SchemaVerifier(db);
      }
    }

    if (compatibilityRunner) {
      await compatibilityRunner(db);
    } else {
      // Divisi Penerimaan: executed directly from server/schema.sql (single source of truth)
      const penerimaanDdl = getPenerimaanDdl();
      await db.exec(penerimaanDdl);
    }


    // Ensure all 60 columns exist in mustahik (schema evolution)
    if (!compatibilityRunner) try {
      let existingCols = [];
      if (db.isPg) {
        const colRes = await db.all(`
          SELECT column_name FROM information_schema.columns WHERE table_name = 'mustahik'
        `);
        existingCols = colRes.map(r => r.column_name.toLowerCase());
      } else {
        const colRes = await db.all(`PRAGMA table_info(mustahik)`);
        existingCols = colRes.map(r => r.name.toLowerCase());
      }

      for (const col of MUSTAHIK_COLUMNS) {
        if (col.name === 'id') continue;
        if (!existingCols.includes(col.name.toLowerCase())) {
          let colDef = col.type;
          if (!db.isPg) {
            colDef = adaptSqlForSqlite(colDef);
          }
          try {
            await db.exec(`ALTER TABLE mustahik ADD COLUMN ${col.name} ${colDef}`);
          } catch (e) {
            // Ignore if added concurrently
          }
        }
      }

      // Ensure all fields exist on relation tables (schema evolution)
      const tableSchemas = {
        ppd: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'application_id', type: 'INTEGER' },
          { name: 'form_number', type: 'VARCHAR(100)' },
          { name: 'ppd_number', type: 'VARCHAR(100)' },
          { name: 'transaction_number', type: 'VARCHAR(100)' },
          { name: 'requester_name', type: 'VARCHAR(255)' },
          { name: 'requester_role', type: 'VARCHAR(255)' },
          { name: 'requester_department', type: 'VARCHAR(255)' },
          { name: 'amount', type: 'NUMERIC' },
          { name: 'amount_in_words', type: 'TEXT' },
          { name: 'purpose', type: 'TEXT' },
          { name: 'fund_source', type: 'TEXT' },
          { name: 'bank_account_info', type: 'TEXT' },
          { name: 'payment_type', type: 'VARCHAR(100)' },
          { name: 'disbursement_date', type: 'VARCHAR(50)' },
        ],
        mpzis: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'application_id', type: 'INTEGER' },
          { name: 'form_number', type: 'VARCHAR(100)' },
          { name: 'mpzis_date', type: 'VARCHAR(50)' },
          { name: 'program_classification', type: 'VARCHAR(100)' },
          { name: 'purpose', type: 'TEXT' },
          { name: 'asnaf', type: 'VARCHAR(100)' },
          { name: 'fund_source', type: 'VARCHAR(100)' },
          { name: 'recipient_name', type: 'VARCHAR(255)' },
          { name: 'recipient_type', type: 'VARCHAR(100)' },
          { name: 'beneficiary_count', type: 'INTEGER' },
          { name: 'total_amount', type: 'NUMERIC' },
          { name: 'proposed_by', type: 'VARCHAR(255)' },
          { name: 'examined_by', type: 'VARCHAR(255)' },
          { name: 'ashnaf_verifier', type: 'VARCHAR(255)' },
          { name: 'responsible', type: 'VARCHAR(255)' },
          { name: 'approved_by', type: 'VARCHAR(255)' },
        ],
        assessments: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'application_id', type: 'INTEGER' },
          { name: 'surveyor_name', type: 'VARCHAR(255)' },
          { name: 'surveyor_phone', type: 'VARCHAR(50)' },
          { name: 'survey_date', type: 'VARCHAR(50)' },
          { name: 'survey_method', type: 'VARCHAR(100)' },
          { name: 'narrative_family', type: 'TEXT' },
          { name: 'narrative_income', type: 'TEXT' },
          { name: 'narrative_request', type: 'TEXT' },
          { name: 'narrative_conclusion', type: 'TEXT' },
          { name: 'house_index', type: 'INTEGER' },
          { name: 'asset_index', type: 'INTEGER' },
          { name: 'income_index', type: 'INTEGER' },
          { name: 'spiritual_score', type: 'INTEGER' },
          { name: 'overall_score', type: 'NUMERIC' },
          { name: 'priority', type: 'VARCHAR(50)' },
          { name: 'recommendation', type: 'TEXT' },
          { name: 'notes', type: 'TEXT' },
          { name: 'photos', type: 'TEXT' },
        ],
        applications: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'application_number', type: 'VARCHAR(100)' },
          { name: 'program', type: 'VARCHAR(100)' },
          { name: 'request_title', type: 'TEXT' },
          { name: 'status', type: 'VARCHAR(100)' },
          { name: 'notes', type: 'TEXT' },
          { name: 'rejection_reason', type: 'TEXT' },
        ],
        documents: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'doc_type', type: 'VARCHAR(100)' },
          { name: 'filename', type: 'VARCHAR(255)' },
          { name: 'original_name', type: 'VARCHAR(255)' },
          { name: 'file_url', type: 'TEXT' },
        ],
        wa_logs: [
          { name: 'mustahik_id', type: 'INTEGER' },
          { name: 'phone', type: 'VARCHAR(50)' },
          { name: 'phase', type: 'VARCHAR(100)' },
          { name: 'message', type: 'TEXT' },
          { name: 'wa_url', type: 'TEXT' },
          { name: 'status', type: 'VARCHAR(50)' },
        ],
        bot_sessions: [
          { name: 'state', type: 'VARCHAR(50)' },
          { name: 'temp_data', type: 'TEXT' },
        ],
        users: [
          { name: 'level', type: "VARCHAR(20) NOT NULL DEFAULT 'staff'" },
        ],
        approval_decisions: [
          { name: 'actor_level', type: 'VARCHAR(20)' },
          { name: 'actor_division', type: 'VARCHAR(100)' },
          { name: 'prepared_by_id', type: 'INTEGER' },
          { name: 'correlation_id', type: 'VARCHAR(100)' },
        ],
        penerimaan_transactions: [
          { name: 'workflow_version', type: 'INTEGER NOT NULL DEFAULT 0' },
        ],
        penerimaan_export_jobs: [
          { name: 'artifact_path', type: 'TEXT' },
          { name: 'processing_started_at', type: 'TIMESTAMPTZ' },
          { name: 'attempt_count', type: 'INTEGER DEFAULT 0' },
        ],
      };

      for (const [table, colDefs] of Object.entries(tableSchemas)) {
        let cols = [];
        if (db.isPg) {
          const colRes = await db.all(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]);
          cols = colRes.map(r => r.column_name.toLowerCase());
        } else {
          const colRes = await db.all(`PRAGMA table_info(${table})`);
          cols = colRes.map(r => r.name.toLowerCase());
        }

        for (const col of colDefs) {
          if (!cols.includes(col.name.toLowerCase())) {
            let colType = col.type;
            if (!db.isPg) colType = adaptSqlForSqlite(colType);
            try {
              await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${colType}`);
            } catch (e) {}
          }
        }
      }
    } catch (colErr) {
      console.warn('Column sync notice:', colErr.message);
    }

    if (seedRunner) {
      await seedRunner(db);
    } else if (allowsDemoSeed()) {
      await seedDataIfEmpty(db);
      await seedMasterData(db);
      await seedDefaultUsers(db);
      await seedPenerimaanData(db);
    } else {
      console.log('Production mode: demo data and default-user seeding are disabled.');
    }
    return db;
  } catch (err) {
    console.error('Database initialization notice/error:', err.message);
    throw err;
  }
}

async function seedMasterData(db) {
  const count = await db.get('SELECT COUNT(*) as total FROM master_data');
  if (parseInt(count?.total || 0, 10) > 0) return;

  const records = [
    ['program', 'tangerang-cerdas', 'Tangerang Cerdas', 'Pendidikan dan penguatan kapasitas belajar.', 1],
    ['program', 'tangerang-sehat', 'Tangerang Sehat', 'Bantuan pengobatan dan layanan kesehatan.', 2],
    ['program', 'tangerang-makmur', 'Tangerang Makmur', 'Pemberdayaan usaha dan ekonomi keluarga.', 3],
    ['program', 'tangerang-peduli', 'Tangerang Peduli', 'Respons sosial, darurat, dan kemanusiaan.', 4],
    ['program', 'tangerang-taqwa', 'Tangerang Taqwa', 'Dakwah, advokasi, dan pembinaan umat.', 5],
    ['asnaf', 'fakir', 'Fakir', 'Tidak memiliki sumber penghidupan yang mencukupi.', 1],
    ['asnaf', 'miskin', 'Miskin', 'Penghasilan belum memenuhi kebutuhan dasar.', 2],
    ['asnaf', 'gharimin', 'Gharimin', 'Memiliki utang untuk kebutuhan yang dibenarkan.', 3],
    ['asnaf', 'fisabilillah', 'Fisabilillah', 'Mendukung kemaslahatan dan perjuangan di jalan Allah.', 4],
    ['dokumen', 'ktp', 'KTP', 'Identitas pemohon yang masih berlaku.', 1],
    ['dokumen', 'kk', 'Kartu Keluarga', 'Kartu keluarga terbaru.', 2],
    ['dokumen', 'sktm', 'SKTM / surat keterangan', 'Dokumen pendukung kondisi ekonomi bila diperlukan.', 3],
    ['pencairan', 'transfer', 'Transfer bank', 'Pencairan melalui rekening terverifikasi.', 1],
    ['pencairan', 'tunai', 'Tunai', 'Penyaluran langsung dengan bukti serah terima.', 2],
  ];

  for (const [category, recordKey, label, description, sortOrder] of records) {
    await db.run(
      `INSERT INTO master_data (category, record_key, label, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, TRUE, $5)
       ON CONFLICT(category, record_key) DO NOTHING`,
      [category, recordKey, label, description, sortOrder]
    );
  }
}

async function seedDataIfEmpty(db) {
  try {
    // 1. Seed Mustahik dataset
    const countRes = await db.get('SELECT COUNT(*) as total FROM mustahik');
    const total = parseInt(countRes?.total || 0, 10);
    if (total < 10) {
      console.log('Seeding rich 218 Kota Tangerang Mustahik records...');
      // Clean up incomplete demo entries if any
      await db.run('DELETE FROM activity_logs');
      await db.run('DELETE FROM documents');
      await db.run('DELETE FROM ppd');
      await db.run('DELETE FROM mpzis');
      await db.run('DELETE FROM assessments');
      await db.run('DELETE FROM applications');
      await db.run('DELETE FROM mustahik');

      const mustahikSeed = generateMustahikSeed();

      for (const m of mustahikSeed) {
        const allowedCols = MUSTAHIK_COLUMNS.map(c => c.name).filter(n => n !== 'id' && n !== 'created_at' && n !== 'updated_at');
        const cols = [];
        const placeholders = [];
        const values = [];

        for (const col of allowedCols) {
          if (m[col] !== undefined) {
            cols.push(col);
            values.push(m[col]);
            placeholders.push(`$${values.length}`);
          }
        }

        const res = await db.run(
          `INSERT INTO mustahik (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
          values
        );
        const mustahikId = res.lastID;

        // Create application
        await db.run(
          `INSERT INTO applications (mustahik_id, application_number, program, request_title, status, applied_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING id`,
          [mustahikId, m.file_no, m.program, m.request_title, m.status]
        );

        // Create assessment if surveyed
        if (m.survey_date) {
          await db.run(
            `INSERT INTO assessments (
              mustahik_id, surveyor_name, surveyor_phone, survey_date, survey_method,
              narrative_family, narrative_income, narrative_conclusion,
              house_index, asset_index, income_index, spiritual_score, overall_score,
              priority, recommendation, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
              mustahikId, m.surveyor_name, m.surveyor_phone, m.survey_date, 'On Location',
              m.survey_notes, `Pendapatan: Rp ${m.monthly_income.toLocaleString('id-ID')}`, m.survey_notes,
              m.house_index, m.asset_index, m.income_index, m.spiritual_score, m.overall_score,
              m.priority, m.survey_recommendation, m.survey_notes
            ]
          );
        }

        // Create MPZIS if approved
        if (m.mpzis_date) {
          await db.run(
            `INSERT INTO mpzis (
              mustahik_id, form_number, mpzis_date, program_classification, purpose,
              asnaf, fund_source, recipient_name, recipient_type, beneficiary_count, total_amount,
              proposed_by, examined_by, ashnaf_verifier, responsible, approved_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
              mustahikId, `MPZIS/202608/${String(m.id).padStart(3, '0')}`, m.mpzis_date,
              m.program, m.distribution_purpose, m.asnaf, m.fund_source, m.name,
              'Individu', m.beneficiary_count, m.approved_amount,
              'Petugas Lapangan', 'Tim Verifikasi', 'Asesor Syariah', 'Kabid Penyaluran', 'Pimpinan BAZNAS'
            ]
          );
        }

        // Create PPD if funded or completed
        if (m.ppd_number) {
          await db.run(
            `INSERT INTO ppd (
              mustahik_id, form_number, ppd_number, transaction_number, requester_name,
              requester_role, requester_department, amount, amount_in_words, purpose,
              fund_source, bank_account_info, payment_type, disbursement_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id`,
            [
              mustahikId, m.ppd_number, m.ppd_number, `TRX-202608-${String(m.id).padStart(4, '0')}`,
              'H. Rahmat Hidayat', 'Kabid Penyaluran', 'Divisi Pendistribusian',
              m.approved_amount, `Terbilang Rp ${m.approved_amount.toLocaleString('id-ID')}`,
              m.distribution_purpose, 'Zakat', `${m.bank_name} - ${m.bank_account} a.n ${m.bank_account_name}`,
              m.payment_method, m.disbursement_date
            ]
          );
        }

        // Create default documents
        const defaultDocs = [
          { doc_type: 'KTP', filename: `ktp_${m.nik}.pdf`, original_name: `KTP_${m.name}.pdf` },
          { doc_type: 'Kartu Keluarga (KK)', filename: `kk_${m.kk_number}.pdf`, original_name: `KK_${m.name}.pdf` },
          { doc_type: 'SKTM', filename: `sktm_${m.id}.pdf`, original_name: `SKTM_${m.kelurahan}.pdf` },
          { doc_type: 'Foto rumah', filename: `rumah_${m.id}.jpg`, original_name: `Foto_Kondisi_Rumah.jpg` }
        ];

        for (const doc of defaultDocs) {
          await db.run(
            `INSERT INTO documents (mustahik_id, doc_type, filename, original_name, file_url)
             VALUES ($1, $2, $3, $4, $5)`,
            [mustahikId, doc.doc_type, doc.filename, doc.original_name, `/uploads/${doc.filename}`]
          );
        }

        // Create initial activity logs
        await db.run(
          `INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description, new_status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            mustahikId, 'Sistem BAZNAS', 'PENDAFTARAN', 'Pengajuan Berkas Diterima',
            `Berkas permohonan bantuan ${m.program} diterima di sistem dengan nomor ${m.file_no}.`,
            'Diajukan'
          ]
        );

        if (m.status !== 'Diajukan') {
          await db.run(
            `INSERT INTO activity_logs (mustahik_id, actor_name, action_type, title, description, old_status, new_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              mustahikId, 'Tim Verifikasi', 'STATUS_CHANGE', 'Pembaruan Tahap Berkas',
              `Berkas telah diproses dan status diperbarui menjadi ${m.status}.`,
              'Diajukan', m.status
            ]
          );
        }
      }
      console.log('218 Kota Tangerang Mustahik records successfully seeded.');
    }

    // 2. Seed Program Initiatives
    const initCount = await db.get('SELECT COUNT(*) as total FROM program_initiatives');
    if (parseInt(initCount?.total || 0, 10) === 0) {
      console.log('Seeding 5 Pilar program initiatives...');
      for (const item of INITIAL_PROGRAM_INITIATIVES) {
        await db.run(
          `INSERT INTO program_initiatives (
            pilar_id, code, name, pic, status, next_milestone,
            mustahik_target, mustahik_count, budget_amount, realized_amount, percentage
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            item.pilar_id, item.code, item.name, item.pic, item.status, item.next_milestone,
            item.mustahik_target, item.mustahik_count, item.budget_amount, item.realized_amount, item.percentage
          ]
        );
      }
      console.log('Program initiatives successfully seeded.');
    }

    // 3. Seed Reports Catalog
    const reportCount = await db.get('SELECT COUNT(*) as total FROM reports');
    if (parseInt(reportCount?.total || 0, 10) === 0) {
      console.log('Seeding reports catalog...');
      for (const rep of INITIAL_REPORTS) {
        await db.run(
          `INSERT INTO reports (
            id, category, period, title, description, scope, status, file_url, updated_at, metrics_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING`,
          [
            rep.id, rep.category, rep.period, rep.title, rep.description, rep.scope,
            rep.status, rep.file_url, rep.updated_at, rep.metrics_json
          ]
        );
      }
      console.log('Reports catalog successfully seeded.');
    } else {
      // Migrate any legacy categories to standardized names
      await db.run("UPDATE reports SET category = 'Per Program' WHERE category = 'Program & Pilar' OR category = 'program'");
      await db.run("UPDATE reports SET category = 'Per Kecamatan' WHERE category = 'Kecamatan' OR category = 'wilayah'");
      await db.run("UPDATE reports SET category = 'Per Asnaf' WHERE category = 'Asnaf'");
      await db.run("UPDATE reports SET category = 'Audit & LPJ' WHERE category = 'Keuangan' OR category = 'audit'");
    }
  } catch (err) {
    console.warn('Seeding notice (non-fatal):', err.message);
  }
}

export async function seedDefaultUsers(db) {
  try {
    const userCount = await db.get('SELECT COUNT(*) as cnt FROM users');
    const cnt = userCount ? parseInt(userCount.cnt || userCount.count || 0, 10) : 0;
    if (cnt > 0) return;

    console.log('Seeding default BAZNAS role accounts...');
    const defaultAccounts = [
      {
        name: 'Ahmad Naufal, S.E.I',
        email: 'admin@baznas.go.id',
        password: 'admin123',
        role: 'admin',
        level: 'admin',
        division: 'Pimpinan & Super Admin',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      },
      {
        name: 'H. Rahmat Hidayat (Kabid Penyaluran)',
        email: 'penyaluran@baznas.go.id',
        password: 'penyaluran123',
        role: 'penyaluran',
        level: 'leader',
        division: 'Bidang Pendistribusian & Pendayagunaan',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      },
      {
        name: 'Siti Rahmah, M.E (Kabid Penerimaan)',
        email: 'penerimaan@baznas.go.id',
        password: 'penerimaan123',
        role: 'penerimaan',
        level: 'staff',
        division: 'Bidang Pengumpulan & ZIS',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      },
      {
        name: 'Bambang Irawan (Surveyor BAZNAS)',
        email: 'surveyor@baznas.go.id',
        password: 'surveyor123',
        role: 'surveyor',
        level: 'staff',
        division: 'Tim Asesmen & Survey Lapangan',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      },
    ];

    for (const acc of defaultAccounts) {
      const passwordHash = await bcrypt.hash(acc.password, 10);
      await db.run(
        `INSERT INTO users (name, email, password_hash, role, level, division, avatar, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [acc.name, acc.email, passwordHash, acc.role, acc.level || 'staff', acc.division, acc.avatar]
      );
    }
    console.log('Default BAZNAS role accounts successfully seeded.');
    await db.run(`UPDATE users SET level = 'leader' WHERE email = 'penyaluran@baznas.go.id' AND (level IS NULL OR level = 'staff')`);
  } catch (err) {
    console.warn('User seeding notice (non-fatal):', err.message);
  }
}

export async function seedPenerimaanData(db) {
  try {
    // 1. Seed default channels
    const channels = [
      { code: 'portal_web', name: 'Portal Web BAZNAS', category: 'digital', provider: 'portal' },
      { code: 'portal_publik', name: 'Portal Publik', category: 'digital', provider: 'portal' },
      { code: 'portal', name: 'Portal Web', category: 'digital', provider: 'portal' },
      { code: 'bank_transfer', name: 'Transfer Bank', category: 'digital', provider: 'bsi' },
      { code: 'qris', name: 'QRIS BAZNAS Kota Tangerang', category: 'digital', provider: 'qris_national' },
      { code: 'counter_kasir', name: 'Counter Kasir Kantor BAZNAS', category: 'manual', provider: 'internal' },
      { code: 'tunai', name: 'Tunai Kasir Kantor', category: 'manual', provider: 'internal' },
      { code: 'virtual_account', name: 'Virtual Account', category: 'digital', provider: 'bni_syariah' },
      { code: 'jemput_zakat', name: 'Layanan Jemput Zakat', category: 'manual', provider: 'internal' },
    ];

    for (const c of channels) {
      const exists = await db.get('SELECT id FROM penerimaan_channels WHERE code = $1', [c.code]);
      if (!exists) {
        await db.run(
          `INSERT INTO penerimaan_channels (code, name, category, provider, is_active)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [c.code, c.name, c.category, c.provider]
        );
      }
    }

    // 2. Seed default bank accounts
    const accCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_accounts');
    const accCnt = accCheck ? parseInt(accCheck.cnt || accCheck.count || 0, 10) : 0;
    if (accCnt === 0) {
    const accounts = [
      { channel_code: 'bank_transfer', bank_name: 'Bank Syariah Indonesia (BSI)', account_number: '7001122334', account_holder: 'BAZNAS Kota Tangerang - Zakat' },
      { channel_code: 'bank_transfer', bank_name: 'Bank Muamalat', account_number: '3010099881', account_holder: 'BAZNAS Kota Tangerang - Infak/Sedekah' },
      { channel_code: 'qris', bank_name: 'QRIS Bank BSI', account_number: '936001234567', account_holder: 'BAZNAS Kota Tangerang QRIS' },
    ];

    for (const a of accounts) {
      const channelRow = await db.get(`SELECT id FROM penerimaan_channels WHERE code = $1`, [a.channel_code]);
      const channelId = channelRow?.id || null;
      await db.run(
        `INSERT INTO penerimaan_accounts (channel_id, bank_name, account_number, account_holder, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [channelId, a.bank_name, a.account_number, a.account_holder]
      );
    }
  }

    // 3. Seed demo transactions if empty
    const txCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_transactions');
    const txCnt = txCheck ? parseInt(txCheck.cnt || txCheck.count || 0, 10) : 0;
    if (txCnt === 0) {
      const now = new Date();
      const sampleTxs = [
        {
          transaction_number: 'TRX-202609-0001',
          receipt_number: 'BSZ-2026-0001',
          channel: 'bank_transfer',
          channel_category: 'digital',
          muzakki_name: 'H. Abdul Rahman, M.Si',
          fund_type: 'zakat_maal',
          amount: 5000000,
          net_amount: 5000000,
          status: 'Tervalidasi',
          created_by_name: 'Siti Rahmah, M.E',
          daysAgo: 1,
        },
        {
          transaction_number: 'TRX-202609-0002',
          receipt_number: 'BSZ-2026-0002',
          channel: 'qris',
          channel_category: 'digital',
          muzakki_name: 'PT Sinar Berkah Nusantara',
          fund_type: 'zakat_profesi',
          amount: 25000000,
          net_amount: 25000000,
          status: 'Menunggu Approval',
          is_flagged: true,
          created_by_name: 'Ahmad Naufal',
          daysAgo: 2,
        },
        {
          transaction_number: 'TRX-202609-0003',
          receipt_number: 'BSZ-2026-0003',
          channel: 'counter_kasir',
          channel_category: 'manual',
          muzakki_name: 'Hj. Fatimah Zahra',
          fund_type: 'infak',
          amount: 750000,
          net_amount: 750000,
          status: 'Menunggu Validasi',
          created_by_name: 'Staff Kasir BAZNAS',
          daysAgo: 0,
        },
        {
          transaction_number: 'TRX-202609-0004',
          receipt_number: 'BSZ-2026-0004',
          channel: 'bank_transfer',
          channel_category: 'digital',
          muzakki_name: 'Ir. Bambang Trihatmojo',
          fund_type: 'sedekah',
          amount: 1200000,
          net_amount: 1200000,
          status: 'Posted',
          created_by_name: 'Siti Rahmah, M.E',
          daysAgo: 3,
        },
        {
          transaction_number: 'TRX-202609-0005',
          receipt_number: 'BSZ-2026-0005',
          channel: 'jemput_zakat',
          channel_category: 'manual',
          muzakki_name: 'Dra. Sri Wahyuni',
          fund_type: 'zakat_maal',
          amount: 8500000,
          net_amount: 8500000,
          status: 'Tervalidasi',
          created_by_name: 'Petugas Jemput Zakat',
          daysAgo: 4,
        },
        {
          transaction_number: 'TRX-202609-0006',
          receipt_number: 'BSZ-2026-0006',
          channel: 'qris',
          channel_category: 'digital',
          muzakki_name: 'Ahmad Fauzi',
          fund_type: 'dskl',
          amount: 350000,
          net_amount: 350000,
          status: 'Posted',
          created_by_name: 'QRIS Gateway',
          daysAgo: 5,
        },
      ];

      for (const tx of sampleTxs) {
        const txDate = new Date(now.getTime() - tx.daysAgo * 86400000).toISOString();
        await db.run(
          `INSERT INTO penerimaan_transactions (
             transaction_number, receipt_number, channel, channel_category,
             muzakki_name, fund_type, amount, fee_amount, net_amount, status,
             is_flagged, created_by_name, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12)`,
          [
            tx.transaction_number,
            tx.receipt_number,
            tx.channel,
            tx.channel_category,
            tx.muzakki_name,
            tx.fund_type,
            tx.amount,
            tx.net_amount,
            tx.status,
            Boolean(tx.is_flagged),
            tx.created_by_name,
            txDate,
          ]
        );
      }
    }

    // 4. Seed fund categories if empty
    const catCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_fund_categories');
    const catCnt = catCheck ? parseInt(catCheck.cnt || catCheck.count || 0, 10) : 0;
    if (catCnt === 0) {
      const defaultCategories = [
        { code: 'zakat_maal', name: 'Zakat Maal', description: 'Zakat atas harta kekayaan, emas, perak, dan perniagaan' },
        { code: 'zakat_profesi', name: 'Zakat Profesi', description: 'Zakat pendapatan, gaji, honorarium bulanan' },
        { code: 'zakat_fitrah', name: 'Zakat Fitrah', description: 'Zakat jiwa saat bulan Ramadan' },
        { code: 'infak', name: 'Infak & Sedekah Terikat', description: 'Infak peruntukan program pendidikan/kesehatan' },
        { code: 'sedekah', name: 'Sedekah Umum', description: 'Sedekah umum tidak terikat' },
        { code: 'fidyah', name: 'Fidyah & Kafarat', description: 'Pengganti puasa dan kafarat syari' },
        { code: 'dskl', name: 'Dana Sosial Keagamaan Lainnya', description: 'DSKL dan CSR mitra korporasi' },
      ];
      for (const cat of defaultCategories) {
        await db.run(
          `INSERT INTO penerimaan_fund_categories (code, name, description, is_active)
           VALUES ($1, $2, $3, TRUE)`,
          [cat.code, cat.name, cat.description]
        );
      }
    }

    // 5. Seed provider configs if empty
    const provCheck = await db.get('SELECT COUNT(*) as cnt FROM penerimaan_provider_configs');
    const provCnt = provCheck ? parseInt(provCheck.cnt || provCheck.count || 0, 10) : 0;
      const defaultProviders = [
        { provider_name: 'portal', display_name: 'Portal Web Publik BAZNAS' },
        { provider_name: 'portal_publik', display_name: 'Portal Web Publik BAZNAS' },
        { provider_name: 'bsi', display_name: 'Bank Syariah Indonesia' },
        { provider_name: 'qris', display_name: 'QRIS' },
        { provider_name: 'qris_national', display_name: 'QRIS Nasional' },
        { provider_name: 'bni_syariah', display_name: 'BNI Syariah / Virtual Account' },
        { provider_name: 'midtrans', display_name: 'Midtrans Payment Gateway' },
        { provider_name: 'generic', display_name: 'Integrasi Webhook Generik' },
      ];
      for (const p of defaultProviders) {
        const existing = await db.get('SELECT id FROM penerimaan_provider_configs WHERE provider_name = $1', [p.provider_name]);
        if (!existing) {
          await db.run(
            `INSERT INTO penerimaan_provider_configs (provider_name, display_name, is_active)
             VALUES ($1, $2, TRUE)`,
            [p.provider_name, p.display_name]
          );
        }
      }

    console.log('Penerimaan channels, accounts, fund categories, and demo data successfully seeded.');
  } catch (err) {
    console.warn('Penerimaan seeding notice (non-fatal):', err.message);
  }
}

/**
 * Executes a callback inside an atomic transaction.
 * Supports PostgreSQL dedicated client checkout (BEGIN/COMMIT/ROLLBACK)
 * and SQLite SAVEPOINT nesting.
 *
 * @param {Object} [dbOverride]
 * @param {Function} callback
 * @returns {Promise<any>}
 */
export async function withTransaction(dbOverride = null, callback) {
  if (dbOverride && dbOverride._isInTransaction) {
    return callback(dbOverride);
  }
  const db = dbOverride || (await getDb());
  if (db._isInTransaction) {
    return callback(db);
  }

  if (db.isPg) {
    const client = await db.pool.connect();
    const rollbackHooks = [];
    let discarded = false;
    const txDb = {
      isPg: true,
      pool: db.pool,
      _isInTransaction: true,
      onRollback(hook) {
        if (typeof hook !== 'function') throw new TypeError('rollback hook must be a function');
        rollbackHooks.push(hook);
      },
      async query(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        return client.query(text, normalizedParams);
      },
      async get(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await client.query(text, normalizedParams);
        return res.rows && res.rows.length > 0 ? res.rows[0] : null;
      },
      async all(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await client.query(text, normalizedParams);
        return res.rows || [];
      },
      async run(text, params = []) {
        const normalizedParams = Array.isArray(params) ? params : [params];
        const res = await client.query(text, normalizedParams);
        const firstRow = res.rows && res.rows[0] ? res.rows[0] : null;
        const lastID = firstRow ? (firstRow.id !== undefined ? firstRow.id : null) : null;
        return {
          lastID,
          rowCount: res.rowCount,
          rows: res.rows || []
        };
      },
      async exec(sql) {
        return client.query(sql);
      }
    };

    try {
      await client.query('BEGIN');
      const result = await callback(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      let rollbackError = null;
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        rollbackError = error;
        // A failed rollback leaves the connection unsafe for pool reuse.
        // Hooks still must run because they clean caller-owned files.
      }
      const cleanupErrors = [];
      for (const hook of rollbackHooks.reverse()) {
        try { await hook(); } catch (error) { cleanupErrors.push(error); }
      }
      if (rollbackError) {
        try { err.rollbackError = rollbackError; } catch { /* preserve original error */ }
      }
      if (cleanupErrors.length) {
        try { err.rollbackCleanupErrors = cleanupErrors; } catch { /* preserve original error */ }
      }
      if (rollbackError) {
        // pg.Pool's release(error) discards rather than reuses the client.
        // Mark disposal as attempted before calling release: if disposal itself
        // throws, finally must never return the unsafe client to the pool or
        // replace the original operation error with the disposal error.
        discarded = true;
        try { client.release(rollbackError); } catch (disposalError) {
          try { err.rollbackClientDisposeError = disposalError; } catch { /* preserve original error */ }
        }
        throw err;
      }
      throw err;
    } finally {
      // A client already released with an error is not released a second time.
      if (!discarded) client.release();
    }
  } else {
    // SQLite: using atomic SAVEPOINT
    const spName = `sp_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    const rollbackHooks = [];
    const txDb = db._isInTransaction ? db : Object.create(db);
    if (!db._isInTransaction) {
      txDb._isInTransaction = true;
      txDb.onRollback = (hook) => {
        if (typeof hook !== 'function') throw new TypeError('rollback hook must be a function');
        rollbackHooks.push(hook);
      };
    }
    await db.run(`SAVEPOINT ${spName}`);
    try {
      const result = await callback(txDb);
      await db.run(`RELEASE SAVEPOINT ${spName}`);
      return result;
    } catch (err) {
      try {
        await db.run(`ROLLBACK TO SAVEPOINT ${spName}`);
        // Always RELEASE after ROLLBACK TO SAVEPOINT so the savepoint slot is freed.
        // In SQLite a rolled-back savepoint still exists until explicitly released.
        await db.run(`RELEASE SAVEPOINT ${spName}`);
      } catch (_) {
        // ignore secondary savepoint cleanup error
      }
      for (const hook of rollbackHooks.reverse()) {
        try { await hook(); } catch (error) {
          try { err.rollbackCleanupErrors = [...(err.rollbackCleanupErrors || []), error]; } catch { /* preserve original error */ }
        }
      }
      throw err;
    }
  }
}


