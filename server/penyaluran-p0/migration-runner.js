import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const P0_MIGRATION_LOCK_KEY = 20260913001;
export const P0_KNOWN_MIGRATIONS = Object.freeze([
  Object.freeze({ version: '20260913_001', checksum: 'd414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38' }),
  Object.freeze({ version: '20260919_002', checksum: '3db9f368e075ee3f76ae73854d4d4811543263ee71703b9c5e7afb1972a8a4bd' }),
  Object.freeze({ version: '20260919_003', checksum: '0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c' }),
]);
export const P0_CRITICAL_OBJECTS = Object.freeze({
  constraints: Object.freeze([
    'approval_decisions_evidence_grade_check', 'approval_decisions_p0_actor_snapshot_check',
    'artifact_access_events_actor_snapshot_check', 'artifact_approvals_actor_snapshot_check',
    'artifact_file_kind_check', 'artifact_file_size_check', 'assessments_p0_child_count_check',
    'assessments_p0_house_ownership_check', 'assessments_p0_money_check', 'assessments_p0_previous_application_year_check',
    'assessments_p0_submitted_fields_check', 'assessments_previous_application_year_range_check',
    'assessments_source_check', 'assessments_status_check', 'mustahik_archive_fields_check',
    'mustahik_workflow_mode_check', 'mustahik_workflow_version_check', 'mpzis_p0_fund_source_check',
    'mpzis_p0_recipient_type_check', 'mpzis_p0_submitted_fields_check', 'mpzis_source_check', 'mpzis_status_check',
    'p0_idempotency_actor_key', 'ppd_p0_fund_source_check', 'ppd_p0_money_check', 'ppd_p0_payment_type_check',
    'ppd_p0_payment_type_other_check', 'ppd_p0_submitted_fields_check', 'ppd_rab_amount_check', 'ppd_rab_line_no_check',
    'ppd_rab_unique_line', 'ppd_payment_amount_check', 'ppd_payment_status_check', 'ppd_receipt_status_check',
    'ppd_source_check', 'ppd_status_check', 'recipient_confirmation_method_check',
  ]),
  indexes: Object.freeze([
    'uq_active_case_assignment', 'uq_active_ppd_payment', 'uq_active_recipient_confirmation', 'uq_artifact_approval_step',
    'uq_assessments_active_revision', 'uq_assessments_revision', 'uq_mpzis_active_form_number', 'uq_mpzis_active_revision',
    'uq_mpzis_form_revision', 'uq_mpzis_revision', 'uq_ppd_active_form_number', 'uq_ppd_active_ppd_number',
    'uq_ppd_active_revision', 'uq_ppd_active_transaction_number', 'uq_ppd_form_revision', 'uq_ppd_ppd_number_revision',
    'uq_ppd_revision', 'uq_ppd_transaction_revision', 'uq_system_receipt_artifact', 'uq_system_receipt_generated_event',
  ]),
  triggers: Object.freeze([
    'artifact_access_events_immutable', 'artifact_access_events_truncate_immutable', 'artifact_approvals_immutable',
    'artifact_approvals_truncate_immutable', 'artifact_files_submitted_immutable', 'artifact_files_truncate_immutable',
    'ppd_payments_immutable', 'ppd_payments_truncate_immutable', 'recipient_confirmations_immutable',
    'recipient_confirmations_truncate_immutable',
  ]),
  foreignKeys: Object.freeze([
    'activity_logs_actor_fk', 'activity_logs_mustahik_id_fkey', 'applications_mustahik_id_fkey',
    'approval_decisions_actor_fk', 'approval_decisions_mustahik_id_fkey', 'approval_decisions_prepared_by_fk',
    'artifact_access_events_actor_fk', 'artifact_access_events_file_fk', 'artifact_access_events_mustahik_fk',
    'artifact_approvals_actor_fk', 'artifact_approvals_mustahik_fk', 'artifact_files_mustahik_fk',
    'artifact_files_uploader_fk', 'assessments_application_id_fkey', 'assessments_creator_fk', 'assessments_mustahik_id_fkey',
    'assessments_supersedes_fk', 'assessments_updater_fk', 'case_assignments_assigner_fk', 'case_assignments_mustahik_fk',
    'case_assignments_user_fk', 'documents_mustahik_id_fkey', 'mpzis_application_id_fkey', 'mpzis_creator_fk',
    'mpzis_mustahik_id_fkey', 'mpzis_submitter_fk', 'mpzis_supersedes_fk', 'mustahik_archiver_fk', 'mustahik_creator_fk',
    'mustahik_reconciler_fk', 'p0_idempotency_actor_fk', 'ppd_application_id_fkey', 'ppd_creator_fk',
    'ppd_mpzis_fk', 'ppd_mustahik_id_fkey', 'ppd_payments_ppd_fk', 'ppd_payments_proof_fk', 'ppd_payments_recorder_fk',
    'ppd_payments_verifier_fk', 'ppd_rab_lines_ppd_fk', 'ppd_supersedes_fk', 'recipient_confirmations_evidence_fk',
    'recipient_confirmations_ppd_fk', 'recipient_confirmations_recorder_fk', 'wa_logs_mustahik_id_fkey',
  ]),
});
const LEGACY_TERMINAL_STATUSES = [
  'Penyaluran Selesai',
  'Ditolak',
  'Selesai',
  'completed',
  'rejected',
];
const LEGACY_RELATIONS = [
  'applications',
  'assessments',
  'mpzis',
  'ppd',
  'documents',
  'approval_decisions',
  'activity_logs',
  'wa_logs',
];
const P0_RELATIONS = [
  'mustahik',
  ...LEGACY_RELATIONS,
  'artifact_approvals',
  'artifact_files',
  'artifact_access_events',
  'ppd_rab_lines',
  'ppd_payments',
  'recipient_confirmations',
];
const DUPLICATE_IDENTIFIER_CANDIDATES = Object.freeze({
  mustahik: ['nik', 'file_no'],
  applications: ['application_number'],
  assessments: ['assessment_number', 'form_number'],
  mpzis: ['form_number'],
  ppd: ['form_number', 'ppd_number', 'transaction_number'],
});
export const P0_SCHEMA_CONTRACT = Object.freeze({
  mustahik: ['workflow_mode', 'workflow_version', 'created_by_id', 'legacy_status_snapshot', 'p0_reconciled_at', 'p0_reconciled_by', 'archived_at', 'archived_by_id', 'archive_reason'],
  assessments: [
    'id', 'mustahik_id', 'application_id', 'template_code', 'template_version', 'revision', 'supersedes_id', 'status',
    'created_by_id', 'updated_by_id', 'submitted_at', 'reviewed_at',
    'husband_in_household', 'husband_name', 'wife_in_household', 'wife_name', 'child_count',
    'house_ownership', 'home_address', 'address_matches_ktp', 'monthly_rent_amount',
    'husband_occupation', 'husband_monthly_income', 'wife_occupation', 'wife_monthly_income',
    'child_occupation', 'child_monthly_support', 'assistance_request', 'applied_to_baznas_before',
    'previous_application_year', 'source', 'snapshot_json', 'snapshot_hash',
  ],
  mpzis: [
    'id', 'mustahik_id', 'application_id', 'template_code', 'template_version', 'source', 'revision', 'supersedes_id',
    'status', 'created_by_id', 'submitted_by_id', 'submitted_at', 'approved_at',
    'form_number', 'mpzis_date', 'program_classification', 'purpose', 'asnaf', 'fund_source',
    'recipient_name', 'recipient_type', 'beneficiary_count', 'address_snapshot', 'marital_status_snapshot',
    'total_amount', 'snapshot_json', 'snapshot_hash',
  ],
  ppd: [
    'id', 'mustahik_id', 'application_id', 'template_code', 'template_version', 'source', 'revision', 'supersedes_id',
    'mpzis_id', 'status', 'created_by_id', 'submitted_at', 'finance_checked_at', 'finance_approved_at',
    'form_number', 'ppd_number', 'transaction_number', 'requester_name', 'requester_role', 'requester_department',
    'amount', 'amount_in_words', 'purpose', 'fund_source', 'payment_type', 'bank_name',
    'bank_account_ciphertext', 'bank_account_last4', 'bank_account_name', 'payment_type_other',
    'receipt_status', 'receipt_error', 'receipt_lease_token', 'receipt_lease_started_at',
    'receipt_lease_expires_at', 'receipt_payload_sha256', 'receipt_file_id', 'receipt_file_sha256',
    'receipt_created_at', 'snapshot_json', 'snapshot_hash',
  ],
  artifact_approvals: [
    'id', 'mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'approval_step', 'action',
    'snapshot_hash', 'note', 'correlation_id', 'actor_id', 'actor_name', 'actor_role', 'actor_level',
    'actor_division', 'is_admin_override', 'override_reason', 'completion_hash', 'completion_snapshot_json', 'created_at',
  ],
  approval_decisions: [
    'id', 'mustahik_id', 'stage', 'action', 'previous_status', 'next_status', 'note', 'approved_amount',
    'actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'prepared_by_id', 'correlation_id', 'created_at',
    'artifact_type', 'artifact_id', 'artifact_revision', 'snapshot_hash', 'evidence_grade',
  ],
  activity_logs: [
    'id', 'mustahik_id', 'actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division',
    'action_type', 'title', 'description', 'old_status', 'new_status', 'correlation_id', 'created_at',
  ],
  p0_idempotency_keys: ['id', 'actor_id', 'idempotency_key', 'request_hash', 'response_json', 'created_at'],
  mustahik_case_assignments: ['id', 'mustahik_id', 'user_id', 'assignment_role', 'assigned_by_id', 'assigned_at', 'ended_at'],
  artifact_files: [
    'id', 'mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'kind', 'stored_name',
    'original_name', 'mime_type', 'byte_size', 'sha256', 'uploaded_by_id', 'created_at',
  ],
  ppd_rab_lines: ['id', 'ppd_id', 'line_no', 'register_number', 'description', 'amount'],
  ppd_payments: [
    'id', 'ppd_id', 'transaction_number', 'paid_amount', 'paid_at', 'proof_file_id', 'recorded_by_id',
    'verification_status', 'verified_by_id', 'verified_at', 'snapshot_json', 'snapshot_hash', 'created_at',
  ],
  recipient_confirmations: [
    'id', 'ppd_id', 'method', 'recipient_name_snapshot', 'confirmed_at', 'note', 'evidence_file_id',
    'recorded_by_id', 'snapshot_json', 'snapshot_hash', 'created_at',
  ],
  artifact_access_events: [
    'id', 'file_id', 'mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'actor_id',
    'actor_name', 'actor_role', 'actor_level', 'actor_division', 'action', 'created_at', 'correlation_id',
  ],
});

export function migrationChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

export async function readMigrationFiles(migrationsDir, { allowEmpty = false } = {}) {
  let names;
  try {
    names = await readdir(migrationsDir);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`P0_MIGRATIONS_DIRECTORY_MISSING:${migrationsDir}`);
    }
    throw error;
  }

  const migrationNames = names
    .filter((name) => /^(\d{8}_\d{3})(?:[_-].*)?\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (migrationNames.length === 0 && !allowEmpty) {
    throw new Error(`P0_MIGRATIONS_DIRECTORY_EMPTY:${migrationsDir}`);
  }

  const versions = migrationNames.map((name) => name.match(/^(\d{8}_\d{3})(?:[_-].*)?\.sql$/i)[1]);
  const duplicateVersions = versions.filter((version, index) => versions.indexOf(version) !== index);
  if (duplicateVersions.length > 0) {
    throw new Error(`P0_DUPLICATE_MIGRATION_VERSION:${[...new Set(duplicateVersions)].join(',')}`);
  }

  return Promise.all(migrationNames.map(async (name) => {
    const bytes = await readFile(path.join(migrationsDir, name));
    const match = name.match(/^(\d{8}_\d{3})(?:[_-].*)?\.sql$/i);
    const sql = bytes.toString('utf8');
    return {
      version: match[1],
      name,
      sql,
      checksum: migrationChecksum(bytes),
    };
  }));
}

export function assertDisposableTestDatabaseUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!/_test$/i.test(databaseName)) {
    throw new Error('P0_MIGRATIONS_REQUIRE_TEST_DATABASE:_test');
  }
  return parsed;
}

function assertPostgresUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('P0_MIGRATION_DRY_RUN_REQUIRES_POSTGRES_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('P0_MIGRATION_DRY_RUN_REQUIRES_POSTGRES_URL');
  }
  return url;
}

export function resolveDryRunDatabaseUrl(env = process.env) {
  const testMode = env.NODE_ENV === 'test' || env.P0_MIGRATION_TEST_MODE === '1';
  const testUrl = env.P0_TEST_DATABASE_URL;
  if (testMode && (typeof testUrl !== 'string' || testUrl.trim() === '')) {
    throw new Error('P0_MIGRATION_TEST_MODE_REQUIRES_P0_TEST_DATABASE_URL');
  }
  if (typeof testUrl === 'string' && testUrl.trim() !== '') {
    assertPostgresUrl(testUrl);
    assertDisposableTestDatabaseUrl(testUrl);
    return testUrl;
  }
  if (env.P0_ALLOW_LIVE_MIGRATION_DRY_RUN === '1') {
    const liveUrl = env.DATABASE_URL || env.POSTGRES_URL;
    if (!liveUrl) throw new Error('P0_MIGRATION_DRY_RUN_REQUIRES_DATABASE_URL');
    return assertPostgresUrl(liveUrl);
  }
  throw new Error('P0_MIGRATION_DRY_RUN_REQUIRES_P0_TEST_DATABASE_URL');
}

function assertPostgresAdapter(pool) {
  if (pool?.isPg !== true) {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES');
  }
  if (!pool || typeof pool.connect !== 'function') {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES');
  }
}

export async function runPendingMigrations({ pool, migrationsDir, allowEmptyMigrations = false }) {
  assertPostgresAdapter(pool);
  const migrations = await readMigrationFiles(migrationsDir, { allowEmpty: allowEmptyMigrations });
  const client = await pool.connect();
  let locked = false;
  let unsafeError = null;
  let primaryError = null;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [P0_MIGRATION_LOCK_KEY]);
    locked = true;
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(40) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');

    for (const migration of migrations) {
      const applied = (await client.query(
        'SELECT checksum FROM schema_migrations WHERE version=$1',
        [migration.version],
      )).rows[0];
      if (applied && applied.checksum !== migration.checksum) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.version}`);
      }
      if (applied) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',
          [migration.version, migration.checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          unsafeError = rollbackError;
          try {
            error.rollbackError = rollbackError;
          } catch {
            // Preserve the primary migration error even if it cannot be annotated.
          }
        }
        throw error;
      }
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (locked) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [P0_MIGRATION_LOCK_KEY]);
      } catch (error) {
        if (primaryError) {
          try {
            primaryError.unlockError = error;
          } catch {
            // Preserve the primary migration error even if it cannot be annotated.
          }
          // Do not return a possibly locked or transaction-uncertain client.
          client.release(unsafeError || error);
          throw primaryError;
        }
        // Do not return a possibly locked client to the pool.
        client.release(unsafeError || error);
        throw error;
      }
    }
    if (unsafeError) client.release(unsafeError);
    else client.release();
  }
}

export async function verifyP0Schema(db, contract = P0_SCHEMA_CONTRACT) {
  if (db?.isPg !== true || typeof db.query !== 'function') {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES');
  }
  const expectedTables = Object.keys(contract);
  const tableRows = (await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name = ANY($1::text[])`,
    [expectedTables],
  )).rows || [];
  const existingTables = new Set(tableRows.map((row) => String(row.table_name || '').toLowerCase()));
  const missingTables = expectedTables.filter((table) => !existingTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`P0_SCHEMA_REQUIRED_TABLES_MISSING:${missingTables.join(',')}`);
  }
  const columnRows = (await db.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [expectedTables],
  )).rows || [];
  const existingColumns = new Set(columnRows.map((row) => `${String(row.table_name || '').toLowerCase()}.${String(row.column_name || '').toLowerCase()}`));
  const missingColumns = [];
  for (const [table, columns] of Object.entries(contract)) {
    for (const column of columns) {
      if (!existingColumns.has(`${table}.${column}`)) missingColumns.push(`${table}.${column}`);
    }
  }
  if (missingColumns.length > 0) {
    throw new Error(`P0_SCHEMA_REQUIRED_COLUMNS_MISSING:${missingColumns.join(',')}`);
  }
  const ledgerRows = (await db.query('SELECT version, checksum FROM schema_migrations ORDER BY version')).rows || [];
  const knownVersions = new Map(P0_KNOWN_MIGRATIONS.map((migration) => [migration.version, migration.checksum]));
  const unknownVersions = ledgerRows
    .filter((row) => !knownVersions.has(String(row.version)))
    .map((row) => String(row.version));
  if (unknownVersions.length > 0) {
    throw new Error(`P0_SCHEMA_UNKNOWN_MIGRATION:${unknownVersions.join(',')}`);
  }
  const ledgerMatches = ledgerRows.length === P0_KNOWN_MIGRATIONS.length
    && P0_KNOWN_MIGRATIONS.every((migration, index) => (
      ledgerRows[index]
      && String(ledgerRows[index].version) === migration.version
      && String(ledgerRows[index].checksum).toLowerCase() === migration.checksum
    ));
  if (!ledgerMatches) throw new Error('P0_SCHEMA_MIGRATION_LEDGER_MISMATCH');

  const objectRows = (await db.query(`
    SELECT 'constraint' AS object_type, conname AS object_name
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL
    SELECT 'index' AS object_type, indexname AS object_name
    FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL
    SELECT 'trigger' AS object_type, tgname AS object_name
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    UNION ALL
    SELECT 'foreign_key' AS object_type, conname AS object_name
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'
  `)).rows || [];
  const existingObjects = new Set(objectRows.map((row) => `${row.object_type}:${row.object_name}`));
  const missingObjects = [];
  for (const [group, names] of Object.entries(P0_CRITICAL_OBJECTS)) {
    const objectType = group === 'foreignKeys' ? 'foreign_key' : group === 'indexes' ? 'index' : group.slice(0, -1);
    for (const name of names) {
      if (!existingObjects.has(`${objectType}:${name}`)) missingObjects.push(`${group}.${name}`);
    }
  }
  if (missingObjects.length > 0) {
    throw new Error(`P0_SCHEMA_CRITICAL_OBJECTS_MISSING:${missingObjects.join(',')}`);
  }
  return true;
}

async function queryCount(db, sql) {
  const result = await db.query(sql);
  return Number(result.rows?.[0]?.count ?? 0);
}

async function discoverColumns(db, candidates) {
  const tableNames = Object.keys(candidates);
  const columnNames = [...new Set(Object.values(candidates).flat())];
  const result = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = ANY($1::text[]) AND column_name = ANY($2::text[])`,
    [tableNames, columnNames],
  );
  const allowed = new Set(tableNames.flatMap((table) => candidates[table].map((column) => `${table}.${column}`)));
  return (result.rows || [])
    .map((row) => `${String(row.table_name || '').toLowerCase()}.${String(row.column_name || '').toLowerCase()}`)
    .filter((identifier) => allowed.has(identifier));
}

async function collectDuplicateIdentifierCount(db) {
  const identifiers = await discoverColumns(db, DUPLICATE_IDENTIFIER_CANDIDATES);
  if (identifiers.length === 0) return 0;
  const duplicateGroups = identifiers.map((identifier) => {
    const [table, column] = identifier.split('.');
    return `SELECT '${identifier}' AS identifier, COUNT(*)::int AS count FROM (SELECT btrim(${column}::text) AS normalized_value FROM ${table} WHERE NULLIF(btrim(${column}::text),'') IS NOT NULL GROUP BY btrim(${column}::text) HAVING COUNT(*) > 1) duplicate_groups`;
  }).join(' UNION ALL ');
  return queryCount(db, `SELECT COALESCE(SUM(count),0)::int AS count FROM (${duplicateGroups}) duplicate_identifier_groups`);
}

export async function collectP0MigrationDryRun(db) {
  if (db?.isPg !== true || typeof db.query !== 'function') {
    throw new Error('P0_MIGRATIONS_REQUIRE_POSTGRES');
  }
  const statuses = (await db.query(
    'SELECT status, COUNT(*)::int AS count FROM mustahik GROUP BY status ORDER BY status',
  )).rows.map((row) => ({ status: row.status, count: Number(row.count) }));
  const orphanRows = LEGACY_RELATIONS
    .map((relation) => `SELECT ${relation}.id FROM ${relation} LEFT JOIN mustahik m ON m.id=${relation}.mustahik_id WHERE m.id IS NULL AND ${relation}.mustahik_id IS NOT NULL`)
    .join(' UNION ALL ');
  const orphans = await queryCount(db, `SELECT COUNT(*)::int AS count FROM (${orphanRows}) orphan_rows`);
  const duplicate_identifiers = await collectDuplicateIdentifierCount(db);
  const invalid_amounts = await queryCount(db, 'SELECT COUNT(*)::int AS count FROM (SELECT id FROM mpzis WHERE total_amount IS NULL OR total_amount < 0 UNION ALL SELECT id FROM ppd WHERE amount IS NULL OR amount < 0) invalid_amounts');
  const relationList = P0_RELATIONS.map((relation) => `'${relation}'`).join(', ');
  const cascading_foreign_keys = await queryCount(db, `SELECT COUNT(*)::int AS count FROM information_schema.referential_constraints rc JOIN information_schema.table_constraints tc ON tc.constraint_catalog=rc.constraint_catalog AND tc.constraint_schema=rc.constraint_schema AND tc.constraint_name=rc.constraint_name WHERE rc.delete_rule='CASCADE' AND tc.table_schema='public' AND tc.table_name IN (${relationList})`);
  const terminalStatusesSql = LEGACY_TERMINAL_STATUSES.map((status) => `'${status.toLowerCase()}'`).join(', ');
  const workflowModeColumns = await discoverColumns(db, { mustahik: ['workflow_mode'] });
  const in_flight_legacy_cases = workflowModeColumns.includes('mustahik.workflow_mode')
    ? await queryCount(db, `SELECT COUNT(*)::int AS count FROM mustahik WHERE COALESCE(workflow_mode,'legacy') IN ('legacy','legacy_reconciliation') AND LOWER(TRIM(status)) NOT IN (${terminalStatusesSql})`)
    : await queryCount(db, `SELECT COUNT(*)::int AS count FROM mustahik WHERE LOWER(TRIM(status)) NOT IN (${terminalStatusesSql})`);
  return {
    statuses,
    orphans,
    duplicate_identifiers,
    invalid_amounts,
    cascading_foreign_keys,
    in_flight_legacy_cases,
  };
}

function resolveApplyDatabaseUrl(env = process.env) {
  const testMode = env.NODE_ENV === 'test' || env.P0_MIGRATION_TEST_MODE === '1';
  const testUrl = env.P0_TEST_DATABASE_URL;
  if (testMode && (typeof testUrl !== 'string' || testUrl.trim() === '')) {
    throw new Error('P0_MIGRATION_TEST_MODE_REQUIRES_P0_TEST_DATABASE_URL');
  }
  if (typeof testUrl === 'string' && testUrl.trim() !== '') {
    assertPostgresUrl(testUrl);
    assertDisposableTestDatabaseUrl(testUrl);
    return testUrl;
  }
  const liveUrl = env.DATABASE_URL || env.POSTGRES_URL;
  if (!liveUrl) throw new Error('P0_MIGRATION_REQUIRES_DATABASE_URL');
  return assertPostgresUrl(liveUrl);
}

async function runCli() {
  if (process.argv.includes('--dry-run')) {
    const { Pool } = await import('pg');
    const databaseUrl = resolveDryRunDatabaseUrl(process.env);
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await collectP0MigrationDryRun({ isPg: true, query: (sql, params) => pool.query(sql, params) });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      await pool.end();
    }
    return;
  }
  if (process.argv.includes('--apply') || process.argv.includes('--run')) {
    const { Pool } = await import('pg');
    const databaseUrl = resolveApplyDatabaseUrl(process.env);
    const pool = new Pool({ connectionString: databaseUrl });
    pool.isPg = true;
    try {
      const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
      await runPendingMigrations({ pool, migrationsDir });
      process.stdout.write('Migrations applied successfully.\n');
    } finally {
      await pool.end();
    }
    return;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
