-- Mustahik P0 additive schema and deterministic legacy backfill.
-- This file is PostgreSQL-only and is executed under the migration runner lock.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(40) PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fail closed before any business DDL or backfill. The migration runner wraps
-- this file and its ledger insert in one transaction, so a rejected legacy
-- database cannot receive a partial schema or data mutation.
DO $p0_preflight$
DECLARE
  spec RECORD;
  duplicate_value TEXT;
  invalid_value TEXT;
  has_violation BOOLEAN;
  required_column TEXT;
BEGIN
  FOR spec IN
    SELECT relation_name
    FROM (VALUES
      ('mustahik'), ('applications'), ('assessments'), ('mpzis'), ('ppd'),
      ('documents'), ('wa_logs'), ('approval_decisions'), ('activity_logs'),
      ('users')
    ) AS required_tables(relation_name)
  LOOP
    IF to_regclass(format('%I.%I', current_schema(), spec.relation_name)) IS NULL THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_REQUIRED_TABLE:%', spec.relation_name;
    END IF;
  END LOOP;

  -- Never silently replace a composite FK with a weaker single-column FK.
  -- The catalog replacement blocks below also guard cardinality, while this
  -- preflight produces an explicit fail-closed result before business DDL.
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_attribute child_attr ON child_attr.attrelid = con.conrelid AND child_attr.attnum = ANY(con.conkey)
    JOIN pg_attribute parent_attr ON parent_attr.attrelid = con.confrelid AND parent_attr.attnum = ANY(con.confkey)
    WHERE con.contype = 'f'
      AND child_ns.nspname = current_schema()
      AND parent_ns.nspname = current_schema()
      AND parent_attr.attname = 'id'
      AND (
        (parent_rel.relname = 'mustahik' AND child_rel.relname IN ('applications', 'assessments', 'mpzis', 'ppd', 'documents', 'wa_logs', 'approval_decisions', 'activity_logs') AND child_attr.attname = 'mustahik_id')
        OR (parent_rel.relname = 'applications' AND child_rel.relname IN ('assessments', 'mpzis', 'ppd') AND child_attr.attname = 'application_id')
      )
      AND (COALESCE(array_length(con.conkey, 1), 0) <> 1 OR COALESCE(array_length(con.confkey, 1), 0) <> 1)
  ) INTO has_violation;
  IF has_violation THEN
    RAISE EXCEPTION 'P0_PREFLIGHT_COMPOSITE_FK:case_or_application';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_attribute child_attr ON child_attr.attrelid = con.conrelid AND child_attr.attnum = ANY(con.conkey)
    JOIN pg_attribute parent_attr ON parent_attr.attrelid = con.confrelid AND parent_attr.attnum = ANY(con.confkey)
    WHERE con.contype = 'f'
      AND child_ns.nspname = current_schema()
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname = 'users'
      AND parent_attr.attname = 'id'
      AND (
        (child_rel.relname = 'approval_decisions' AND child_attr.attname IN ('actor_id', 'prepared_by_id'))
        OR (child_rel.relname = 'activity_logs' AND child_attr.attname = 'actor_id')
        OR (child_rel.relname = 'artifact_approvals' AND child_attr.attname = 'actor_id')
        OR (child_rel.relname = 'artifact_files' AND child_attr.attname = 'uploaded_by_id')
        OR (child_rel.relname = 'artifact_access_events' AND child_attr.attname = 'actor_id')
        OR (child_rel.relname = 'ppd_payments' AND child_attr.attname IN ('recorded_by_id', 'verified_by_id'))
        OR (child_rel.relname = 'recipient_confirmations' AND child_attr.attname = 'recorded_by_id')
        OR (child_rel.relname = 'mustahik' AND child_attr.attname IN ('created_by_id', 'p0_reconciled_by', 'archived_by_id'))
        OR (child_rel.relname = 'assessments' AND child_attr.attname IN ('created_by_id', 'updated_by_id'))
        OR (child_rel.relname = 'mpzis' AND child_attr.attname IN ('created_by_id', 'submitted_by_id'))
        OR (child_rel.relname = 'ppd' AND child_attr.attname = 'created_by_id')
        OR (child_rel.relname = 'p0_idempotency_keys' AND child_attr.attname = 'actor_id')
        OR (child_rel.relname = 'mustahik_case_assignments' AND child_attr.attname = 'assigned_by_id')
      )
      AND (COALESCE(array_length(con.conkey, 1), 0) <> 1 OR COALESCE(array_length(con.confkey, 1), 0) <> 1)
  ) INTO has_violation;
  IF has_violation THEN
    RAISE EXCEPTION 'P0_PREFLIGHT_COMPOSITE_FK:actor';
  END IF;

  -- Logical identifiers must be unique before any new partial/unique index is
  -- created. NULL and whitespace-only values are legacy omissions, not IDs.
  FOR spec IN
    SELECT table_name, column_name
    FROM (VALUES
      ('mustahik', 'nik'), ('mustahik', 'file_no'),
      ('applications', 'application_number'),
      ('assessments', 'assessment_number'), ('assessments', 'form_number'),
      ('mpzis', 'form_number'),
      ('ppd', 'form_number'), ('ppd', 'ppd_number'), ('ppd', 'transaction_number')
    ) AS identifiers(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = spec.table_name
        AND column_name = spec.column_name
    ) THEN
      EXECUTE format($sql$
        SELECT NULLIF(btrim(%1$I::text), '')
        FROM %2$I.%3$I
        WHERE NULLIF(btrim(%1$I::text), '') IS NOT NULL
        GROUP BY NULLIF(btrim(%1$I::text), '')
        HAVING COUNT(*) > 1
        LIMIT 1
      $sql$, spec.column_name, current_schema(), spec.table_name)
      INTO duplicate_value;
      IF duplicate_value IS NOT NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_DUPLICATE_IDENTIFIER:%', spec.table_name || '.' || spec.column_name;
      END IF;
    END IF;
  END LOOP;

  -- Every legacy relation must point at an existing case/application before
  -- the migration replaces permissive foreign keys with RESTRICT rules.
  FOR spec IN
    SELECT child_table, child_column, parent_table
    FROM (VALUES
      ('applications', 'mustahik_id', 'mustahik'),
      ('assessments', 'mustahik_id', 'mustahik'),
      ('assessments', 'application_id', 'applications'),
      ('mpzis', 'mustahik_id', 'mustahik'),
      ('mpzis', 'application_id', 'applications'),
      ('ppd', 'mustahik_id', 'mustahik'),
      ('ppd', 'application_id', 'applications'),
      ('documents', 'mustahik_id', 'mustahik'),
      ('wa_logs', 'mustahik_id', 'mustahik'),
      ('approval_decisions', 'mustahik_id', 'mustahik'),
      ('activity_logs', 'mustahik_id', 'mustahik')
    ) AS relations(child_table, child_column, parent_table)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = spec.child_table
        AND column_name = spec.child_column
    ) THEN
      EXECUTE format($sql$
        SELECT EXISTS (
          SELECT 1
          FROM %1$I.%2$I child
          LEFT JOIN %1$I.%3$I parent ON parent.id = child.%4$I
          WHERE child.%4$I IS NOT NULL AND parent.id IS NULL
        )
      $sql$, current_schema(), spec.child_table, spec.parent_table, spec.child_column)
      INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_ORPHAN:%', spec.child_table || '.' || spec.child_column;
      END IF;
    END IF;
  END LOOP;

  FOR spec IN
    SELECT table_name, column_name
    FROM (VALUES
      ('mustahik', 'created_by_id'), ('mustahik', 'p0_reconciled_by'), ('mustahik', 'archived_by_id'),
      ('assessments', 'created_by_id'), ('assessments', 'updated_by_id'),
      ('mpzis', 'created_by_id'), ('mpzis', 'submitted_by_id'), ('ppd', 'created_by_id'),
      ('approval_decisions', 'actor_id'), ('approval_decisions', 'prepared_by_id'),
      ('activity_logs', 'actor_id'), ('artifact_approvals', 'actor_id'),
      ('artifact_files', 'uploaded_by_id'), ('artifact_access_events', 'actor_id'),
      ('ppd_payments', 'recorded_by_id'), ('ppd_payments', 'verified_by_id'),
      ('recipient_confirmations', 'recorded_by_id'), ('p0_idempotency_keys', 'actor_id'),
      ('mustahik_case_assignments', 'user_id'), ('mustahik_case_assignments', 'assigned_by_id')
    ) AS actor_relations(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = spec.table_name
        AND column_name = spec.column_name
    ) THEN
      EXECUTE format($sql$
        SELECT EXISTS (
          SELECT 1
          FROM %1$I.%2$I child
          LEFT JOIN %1$I.users parent ON parent.id = child.%3$I
          WHERE child.%3$I IS NOT NULL AND parent.id IS NULL
        )
      $sql$, current_schema(), spec.table_name, spec.column_name) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_ORPHAN:%', spec.table_name || '.' || spec.column_name;
      END IF;
    END IF;
  END LOOP;

  FOR spec IN
    SELECT table_name, column_name
    FROM (VALUES
      ('mustahik', 'monthly_income'), ('mustahik', 'monthly_expense'),
      -- remaining_income is a derived household deficit and may be negative.
      ('mustahik', 'recommended_amount'),
      ('mustahik', 'approved_amount'), ('mpzis', 'approved_amount'),
      ('mpzis', 'total_amount'), ('ppd', 'amount'), ('ppd_payments', 'paid_amount'),
      ('ppd_rab_lines', 'amount')
    ) AS amounts(table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = spec.table_name
        AND column_name = spec.column_name
    ) THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I IS NOT NULL AND %I < 0)',
        current_schema(), spec.table_name, spec.column_name, spec.column_name
      ) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_AMOUNT:%', spec.table_name || '.' || spec.column_name;
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'assessments'
      AND column_name = 'previous_application_year'
  ) THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1 FROM assessments
      WHERE previous_application_year IS NOT NULL
        AND previous_application_year NOT BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
    )' INTO has_violation;
    IF has_violation THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_STATE:assessments.previous_application_year';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'mustahik'
      AND column_name = 'workflow_version'
  ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM mustahik WHERE workflow_version IS NULL OR workflow_version < 0)'
      INTO has_violation;
    IF has_violation THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_REVISION:mustahik.workflow_version';
    END IF;
  END IF;

  FOR spec IN
    SELECT table_name, column_name, allowed_values
    FROM (VALUES
      ('mustahik', 'workflow_mode', ARRAY['legacy', 'legacy_reconciliation', 'p0']::text[]),
      ('assessments', 'source', ARRAY['legacy', 'p0']::text[]),
      ('mpzis', 'source', ARRAY['legacy', 'p0']::text[]),
      ('ppd', 'source', ARRAY['legacy', 'p0']::text[])
    ) AS states(table_name, column_name, allowed_values)
  LOOP
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = spec.table_name
        AND column_name = spec.column_name
    ) THEN
      EXECUTE format(
        'SELECT %I FROM %I.%I WHERE %I IS NOT NULL AND %I <> ALL($1::text[]) LIMIT 1',
        spec.column_name, current_schema(), spec.table_name,
        spec.column_name, spec.column_name
      ) INTO invalid_value USING spec.allowed_values;
      IF invalid_value IS NOT NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_STATE:%', spec.table_name || '.' || spec.column_name;
      END IF;
    END IF;
  END LOOP;

  -- Existing workflow statuses are normalized only when NULL. A non-NULL
  -- value outside the documented legacy/P0 vocabulary is ambiguous and must
  -- abort before the migration could turn it into a constrained row.
  FOR spec IN
    SELECT table_name, column_name, allowed_values
    FROM (VALUES
      ('assessments', 'status', ARRAY['draft', 'submitted', 'accepted', 'returned', 'superseded', 'legacy_unverified']::text[]),
      ('mpzis', 'status', ARRAY['draft', 'submitted', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved', 'returned', 'superseded', 'legacy_unverified']::text[]),
      ('ppd', 'status', ARRAY['draft', 'submitted', 'finance_checked', 'finance_approved', 'payment_recorded', 'payment_verified', 'recipient_confirmed', 'completed', 'returned', 'superseded', 'legacy_unverified']::text[])
    ) AS statuses(table_name, column_name, allowed_values)
  LOOP
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = spec.table_name
        AND column_name = spec.column_name
    ) THEN
      EXECUTE format(
        'SELECT %I FROM %I.%I WHERE %I IS NOT NULL AND %I <> ALL($1::text[]) LIMIT 1',
        spec.column_name, current_schema(), spec.table_name,
        spec.column_name, spec.column_name
      ) INTO invalid_value USING spec.allowed_values;
      IF invalid_value IS NOT NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_STATE:%', spec.table_name || '.status';
      END IF;
    END IF;
  END LOOP;

  FOR spec IN
    SELECT table_name
    FROM (VALUES ('assessments'), ('mpzis'), ('ppd')) AS revision_tables(table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = spec.table_name AND column_name = 'revision'
    ) THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE revision IS NOT NULL AND revision < 1)',
        current_schema(), spec.table_name
      ) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_REVISION:%', spec.table_name;
      END IF;
      EXECUTE format($sql$
        SELECT EXISTS (
          SELECT 1
          FROM %1$I.%2$I nullable_revision
          WHERE nullable_revision.revision IS NULL
            AND EXISTS (
              SELECT 1 FROM %1$I.%2$I existing_revision
              WHERE existing_revision.mustahik_id IS NOT DISTINCT FROM nullable_revision.mustahik_id
                AND existing_revision.application_id IS NOT DISTINCT FROM nullable_revision.application_id
                AND existing_revision.revision IS NOT NULL
            )
        )
      $sql$, current_schema(), spec.table_name) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_REVISION_MIX:%', spec.table_name;
      END IF;
      EXECUTE format($sql$
        SELECT EXISTS (
          SELECT 1 FROM %1$I.%2$I
          WHERE revision IS NOT NULL
          GROUP BY mustahik_id, application_id, revision
          HAVING COUNT(*) > 1
        )
      $sql$, current_schema(), spec.table_name) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_DUPLICATE_REVISION:%', spec.table_name;
      END IF;
    END IF;
  END LOOP;

  -- Existing P0 rows must already carry the immutable actor snapshots that
  -- make account cleanup safe. Missing columns/values fail before DDL.
  FOR spec IN
    SELECT table_name, required_columns
    FROM (VALUES
      ('artifact_approvals', ARRAY['mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'action', 'snapshot_hash', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'created_at']::text[]),
      ('artifact_access_events', ARRAY['file_id', 'mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'actor_name', 'actor_role', 'actor_level', 'actor_division', 'action', 'created_at']::text[]),
      ('artifact_files', ARRAY['mustahik_id', 'artifact_type', 'artifact_id', 'artifact_revision', 'kind', 'stored_name', 'original_name', 'mime_type', 'byte_size', 'sha256', 'created_at']::text[]),
      ('ppd_payments', ARRAY['ppd_id', 'transaction_number', 'paid_amount', 'paid_at', 'verification_status', 'snapshot_hash', 'created_at']::text[]),
      ('recipient_confirmations', ARRAY['ppd_id', 'method', 'recipient_name_snapshot', 'confirmed_at', 'note', 'snapshot_hash', 'created_at']::text[])
    ) AS actor_snapshots(table_name, required_columns)
  LOOP
    IF to_regclass(format('%I.%I', current_schema(), spec.table_name)) IS NOT NULL THEN
      FOREACH required_column IN ARRAY spec.required_columns LOOP
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = spec.table_name
            AND column_name = required_column
        ) THEN
          RAISE EXCEPTION 'P0_PREFLIGHT_REQUIRED_COLUMN:%', spec.table_name || '.' || required_column;
        END IF;
      END LOOP;
      EXECUTE format($sql$
        SELECT EXISTS (SELECT 1 FROM %1$I.%2$I WHERE %3$s)
      $sql$, current_schema(), spec.table_name,
        array_to_string(ARRAY(SELECT format('%I IS NULL', column_name) FROM unnest(spec.required_columns) AS column_name), ' OR ')
      ) INTO has_violation;
      IF has_violation THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_ACTOR_SNAPSHOT:%', spec.table_name;
      END IF;
    END IF;
  END LOOP;

  IF to_regclass(format('%I.%I', current_schema(), 'ppd_rab_lines')) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ppd_rab_lines' AND column_name = 'line_no'
     ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ppd_rab_lines WHERE line_no NOT BETWEEN 1 AND 3)'
      INTO has_violation;
    IF has_violation THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_STATE:ppd_rab_lines.line_no';
    END IF;
  END IF;

  IF to_regclass(format('%I.%I', current_schema(), 'artifact_files')) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'artifact_files' AND column_name = 'byte_size'
     ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM artifact_files WHERE byte_size <= 0)'
      INTO has_violation;
    IF has_violation THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_AMOUNT:artifact_files.byte_size';
    END IF;
  END IF;

  IF to_regclass(format('%I.%I', current_schema(), 'ppd_rab_lines')) IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'ppd_rab_lines' AND column_name = 'amount'
     ) THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM ppd_rab_lines WHERE amount <= 0)'
      INTO has_violation;
    IF has_violation THEN
      RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_AMOUNT:ppd_rab_lines.amount';
    END IF;
  END IF;

  -- Existing P0 rows also have to satisfy the immutable evidence vocabulary
  -- before their checks/triggers are installed. This prevents a legacy row
  -- from becoming an unclassified append-only record.
  FOR spec IN
    SELECT table_name, column_name, allowed_values
    FROM (VALUES
      ('artifact_files', 'kind', ARRAY['supporting_document', 'payment_proof', 'recipient_confirmation', 'system_receipt_pdf']::text[]),
      ('ppd_payments', 'verification_status', ARRAY['pending', 'verified']::text[]),
      ('recipient_confirmations', 'method', ARRAY['Tatap Muka', 'Telepon', 'WhatsApp', 'Tanda Terima']::text[])
    ) AS evidence_states(table_name, column_name, allowed_values)
  LOOP
    IF to_regclass(format('%I.%I', current_schema(), spec.table_name)) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = spec.table_name
           AND column_name = spec.column_name
       ) THEN
      EXECUTE format(
        'SELECT %I FROM %I.%I WHERE %I IS NOT NULL AND %I <> ALL($1::text[]) LIMIT 1',
        spec.column_name, current_schema(), spec.table_name,
        spec.column_name, spec.column_name
      ) INTO invalid_value USING spec.allowed_values;
      IF invalid_value IS NOT NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_STATE:%', spec.table_name || '.' || spec.column_name;
      END IF;
    END IF;
  END LOOP;

  -- Existing varchar correlation IDs are accepted only when losslessly
  -- convertible to the UUID contract; the type is normalized after this gate.
  FOR spec IN
    SELECT table_name
    FROM (VALUES ('approval_decisions'), ('activity_logs')) AS correlation_tables(table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = spec.table_name AND column_name = 'correlation_id'
    ) THEN
      EXECUTE format($sql$
        SELECT correlation_id::text
        FROM %1$I.%2$I
        WHERE NULLIF(btrim(correlation_id::text), '') IS NOT NULL
          AND btrim(correlation_id::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        LIMIT 1
      $sql$, current_schema(), spec.table_name) INTO invalid_value;
      IF invalid_value IS NOT NULL THEN
        RAISE EXCEPTION 'P0_PREFLIGHT_INVALID_CORRELATION:%', spec.table_name;
      END IF;
    END IF;
  END LOOP;
END
$p0_preflight$;

ALTER TABLE mustahik
  ADD COLUMN IF NOT EXISTS workflow_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workflow_mode VARCHAR(30) DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS created_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS legacy_status_snapshot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS p0_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS p0_reconciled_by INTEGER,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS template_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS template_version VARCHAR(30),
  ADD COLUMN IF NOT EXISTS revision INTEGER,
  ADD COLUMN IF NOT EXISTS supersedes_id INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS created_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS updated_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS husband_in_household BOOLEAN,
  ADD COLUMN IF NOT EXISTS husband_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wife_in_household BOOLEAN,
  ADD COLUMN IF NOT EXISTS wife_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS child_count INTEGER,
  ADD COLUMN IF NOT EXISTS house_ownership VARCHAR(100),
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS address_matches_ktp BOOLEAN,
  ADD COLUMN IF NOT EXISTS monthly_rent_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS husband_occupation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS husband_monthly_income NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS wife_occupation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wife_monthly_income NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS child_occupation VARCHAR(255),
  ADD COLUMN IF NOT EXISTS child_monthly_support NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS assistance_request TEXT,
  ADD COLUMN IF NOT EXISTS applied_to_baznas_before BOOLEAN,
  ADD COLUMN IF NOT EXISTS previous_application_year INTEGER,
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64);

ALTER TABLE mpzis
  ADD COLUMN IF NOT EXISTS template_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS template_version VARCHAR(30),
  ADD COLUMN IF NOT EXISTS source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS revision INTEGER,
  ADD COLUMN IF NOT EXISTS supersedes_id INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS created_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS address_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS marital_status_snapshot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64);

ALTER TABLE ppd
  ADD COLUMN IF NOT EXISTS template_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS template_version VARCHAR(30),
  ADD COLUMN IF NOT EXISTS source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS revision INTEGER,
  ADD COLUMN IF NOT EXISTS supersedes_id INTEGER,
  ADD COLUMN IF NOT EXISTS mpzis_id INTEGER,
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS created_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finance_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finance_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_account_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_last4 CHAR(4),
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_type_other VARCHAR(150),
  ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS receipt_error TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64);

ALTER TABLE approval_decisions
  ADD COLUMN IF NOT EXISTS actor_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS actor_division VARCHAR(100),
  ADD COLUMN IF NOT EXISTS prepared_by_id INTEGER,
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS artifact_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS artifact_id INTEGER,
  ADD COLUMN IF NOT EXISTS artifact_revision INTEGER,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS evidence_grade VARCHAR(30) DEFAULT 'legacy_unbound';

-- Legacy decision notes were nullable. Preserve all existing text while filling
-- only omitted notes with a stable, non-sensitive explanation before enforcing
-- the same NOT NULL contract used by the fresh schema.
UPDATE approval_decisions
SET note = 'Legacy approval decision: no note was recorded.'
WHERE note IS NULL;
ALTER TABLE approval_decisions ALTER COLUMN note SET NOT NULL;

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS actor_id INTEGER,
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(100),
  ADD COLUMN IF NOT EXISTS actor_level VARCHAR(30),
  ADD COLUMN IF NOT EXISTS actor_division VARCHAR(100),
  ADD COLUMN IF NOT EXISTS correlation_id UUID;

ALTER TABLE mustahik ALTER COLUMN workflow_mode SET DEFAULT 'legacy';
UPDATE mustahik SET workflow_version = 0 WHERE workflow_version IS NULL;
ALTER TABLE mustahik ALTER COLUMN workflow_version SET DEFAULT 0;
ALTER TABLE mustahik ALTER COLUMN workflow_version SET NOT NULL;
ALTER TABLE approval_decisions ALTER COLUMN evidence_grade SET DEFAULT 'legacy_unbound';
ALTER TABLE mpzis
  ALTER COLUMN fund_source SET DEFAULT 'Zakat',
  ALTER COLUMN recipient_type SET DEFAULT 'Individu';
ALTER TABLE ppd
  ALTER COLUMN fund_source SET DEFAULT 'Zakat',
  ALTER COLUMN payment_type SET DEFAULT 'Pembayaran';

UPDATE mustahik SET workflow_mode = CASE WHEN workflow_mode IS NULL THEN 'legacy' ELSE workflow_mode END;
UPDATE assessments SET source = CASE WHEN source IS NULL THEN 'legacy' ELSE source END;
UPDATE assessments SET status = CASE WHEN status IS NULL THEN 'legacy_unverified' ELSE status END;
UPDATE assessments AS a
SET revision = numbered.revision
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY mustahik_id, application_id
    ORDER BY created_at, id
  )::INTEGER AS revision
  FROM assessments
) AS numbered
WHERE a.id = numbered.id AND a.revision IS NULL;
UPDATE mpzis SET source = CASE WHEN source IS NULL THEN 'legacy' ELSE source END;
UPDATE mpzis SET status = CASE WHEN status IS NULL THEN 'legacy_unverified' ELSE status END;
UPDATE mpzis AS m
SET revision = numbered.revision
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY mustahik_id, application_id
    ORDER BY created_at, id
  )::INTEGER AS revision
  FROM mpzis
) AS numbered
WHERE m.id = numbered.id AND m.revision IS NULL;
UPDATE ppd SET source = CASE WHEN source IS NULL THEN 'legacy' ELSE source END;
UPDATE ppd SET status = CASE WHEN status IS NULL THEN 'legacy_unverified' ELSE status END;
UPDATE ppd AS p
SET revision = numbered.revision
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY mustahik_id, application_id
    ORDER BY created_at, id
  )::INTEGER AS revision
  FROM ppd
) AS numbered
WHERE p.id = numbered.id AND p.revision IS NULL;
UPDATE approval_decisions SET evidence_grade = 'legacy_unbound' WHERE evidence_grade IS NULL;

DO $p0_uuid_types$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'approval_decisions'
      AND column_name = 'correlation_id' AND udt_name <> 'uuid'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE approval_decisions
      ALTER COLUMN correlation_id TYPE UUID
      USING NULLIF(btrim(correlation_id::text), '')::uuid
    $sql$;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'activity_logs'
      AND column_name = 'correlation_id' AND udt_name <> 'uuid'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE activity_logs
      ALTER COLUMN correlation_id TYPE UUID
      USING NULLIF(btrim(correlation_id::text), '')::uuid
    $sql$;
  END IF;
END
$p0_uuid_types$;

ALTER TABLE mustahik ALTER COLUMN workflow_mode SET NOT NULL;
ALTER TABLE assessments
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL;
ALTER TABLE mpzis
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL;
ALTER TABLE ppd
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN revision SET NOT NULL;
ALTER TABLE approval_decisions ALTER COLUMN evidence_grade SET NOT NULL;

ALTER TABLE mustahik
  ADD CONSTRAINT mustahik_workflow_mode_check
  CHECK (workflow_mode IN ('legacy', 'legacy_reconciliation', 'p0')),
  ADD CONSTRAINT mustahik_workflow_version_check
  CHECK (workflow_version >= 0);
ALTER TABLE assessments
  ADD CONSTRAINT assessments_source_check CHECK (source IN ('legacy', 'p0')),
  ADD CONSTRAINT assessments_status_check CHECK (status IN ('draft', 'submitted', 'accepted', 'returned', 'superseded', 'legacy_unverified'));
ALTER TABLE mpzis
  ADD CONSTRAINT mpzis_source_check CHECK (source IN ('legacy', 'p0')),
  ADD CONSTRAINT mpzis_status_check CHECK (status IN ('draft', 'submitted', 'proposed', 'examined', 'ashnaf_verified', 'responsible_acknowledged', 'approved', 'returned', 'superseded', 'legacy_unverified'));
ALTER TABLE ppd
  ADD CONSTRAINT ppd_source_check CHECK (source IN ('legacy', 'p0')),
  ADD CONSTRAINT ppd_status_check CHECK (status IN ('draft', 'submitted', 'finance_checked', 'finance_approved', 'payment_recorded', 'payment_verified', 'recipient_confirmed', 'completed', 'returned', 'superseded', 'legacy_unverified'));

ALTER TABLE mustahik
  ADD CONSTRAINT mustahik_archive_fields_check CHECK (
    archived_at IS NULL
    OR (
      archived_by_id IS NOT NULL
      AND archive_reason IS NOT NULL
      AND char_length(btrim(archive_reason)) BETWEEN 20 AND 1000
    )
      );

ALTER TABLE approval_decisions
  ADD CONSTRAINT approval_decisions_evidence_grade_check
  CHECK (evidence_grade IN ('legacy_unbound', 'p0')),
  ADD CONSTRAINT approval_decisions_p0_actor_snapshot_check
  CHECK (
    evidence_grade <> 'p0'
    OR (
      actor_name IS NOT NULL
      AND actor_role IS NOT NULL
      AND actor_level IS NOT NULL
      AND actor_division IS NOT NULL
      AND snapshot_hash IS NOT NULL
    )
  );

ALTER TABLE assessments
  ADD CONSTRAINT assessments_previous_application_year_range_check CHECK (
    previous_application_year IS NULL
    OR previous_application_year BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  ),
  ADD CONSTRAINT assessments_p0_child_count_check CHECK (
    source <> 'p0' OR child_count IS NULL OR child_count BETWEEN 0 AND 30
  ),
  ADD CONSTRAINT assessments_p0_money_check CHECK (
    source <> 'p0'
    OR (
      COALESCE(monthly_rent_amount, 0) >= 0
      AND COALESCE(husband_monthly_income, 0) >= 0
      AND COALESCE(wife_monthly_income, 0) >= 0
      AND COALESCE(child_monthly_support, 0) >= 0
    )
  ),
  ADD CONSTRAINT assessments_p0_house_ownership_check CHECK (
    source <> 'p0'
    OR house_ownership IS NULL
    OR house_ownership IN ('Kontrak', 'Milik Sendiri', 'Orang Tua (Menumpang)')
  ),
  ADD CONSTRAINT assessments_p0_previous_application_year_check CHECK (
    source <> 'p0'
    OR applied_to_baznas_before IS NULL
    OR applied_to_baznas_before = FALSE
    OR previous_application_year BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  ),
  ADD CONSTRAINT assessments_p0_submitted_fields_check CHECK (
    source <> 'p0'
    OR status IN ('draft', 'returned', 'superseded')
    OR (
      template_code IS NOT NULL
      AND template_version IS NOT NULL
      AND revision IS NOT NULL
      AND husband_in_household IS NOT NULL
      AND wife_in_household IS NOT NULL
      AND child_count IS NOT NULL
      AND house_ownership IS NOT NULL
      AND home_address IS NOT NULL
      AND address_matches_ktp IS NOT NULL
      AND applied_to_baznas_before IS NOT NULL
      AND snapshot_json IS NOT NULL
      AND snapshot_hash IS NOT NULL
      AND (
        (husband_in_household = TRUE AND husband_name IS NOT NULL AND husband_occupation IS NOT NULL AND husband_monthly_income IS NOT NULL)
        OR (husband_in_household = FALSE AND husband_name IS NULL AND husband_occupation IS NULL AND husband_monthly_income IS NULL)
      )
      AND (
        (wife_in_household = TRUE AND wife_name IS NOT NULL AND wife_occupation IS NOT NULL AND wife_monthly_income IS NOT NULL)
        OR (wife_in_household = FALSE AND wife_name IS NULL AND wife_occupation IS NULL AND wife_monthly_income IS NULL)
      )
      AND (
        (child_count = 0 AND child_occupation IS NULL AND child_monthly_support IS NULL)
        OR (child_count > 0 AND child_occupation IS NOT NULL AND child_monthly_support IS NOT NULL)
      )
      AND (
        (house_ownership = 'Kontrak' AND monthly_rent_amount > 0)
        OR (house_ownership <> 'Kontrak' AND monthly_rent_amount IS NULL)
      )
      AND (
        (applied_to_baznas_before = TRUE AND previous_application_year IS NOT NULL)
        OR (applied_to_baznas_before = FALSE AND previous_application_year IS NULL)
      )
      AND (
        applied_to_baznas_before = FALSE
        OR previous_application_year BETWEEN 2000 AND EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
      )
    )
  );

ALTER TABLE mpzis
  ADD CONSTRAINT mpzis_p0_recipient_type_check CHECK (
    source <> 'p0'
    OR recipient_type IS NULL
    OR recipient_type IN ('Individu', 'Keluarga', 'Kelompok / Yayasan')
  ),
  ADD CONSTRAINT mpzis_p0_fund_source_check CHECK (
    source <> 'p0'
    OR fund_source IS NULL
    OR fund_source IN ('Zakat', 'Infaq/Shodaqoh', 'DSKL', 'Hibah')
  ),
  ADD CONSTRAINT mpzis_p0_submitted_fields_check CHECK (
    source <> 'p0'
    OR status IN ('draft', 'returned', 'superseded')
    OR (
      template_code IS NOT NULL
      AND template_version IS NOT NULL
      AND revision IS NOT NULL
      AND form_number IS NOT NULL
      AND mpzis_date IS NOT NULL
      AND program_classification IS NOT NULL
      AND purpose IS NOT NULL
      AND asnaf IS NOT NULL
      AND fund_source IS NOT NULL
      AND recipient_name IS NOT NULL
      AND recipient_type IS NOT NULL
      AND beneficiary_count IS NOT NULL
      AND beneficiary_count >= 1
      AND address_snapshot IS NOT NULL
      AND marital_status_snapshot IS NOT NULL
      AND total_amount > 0
      AND snapshot_json IS NOT NULL
      AND snapshot_hash IS NOT NULL
    )
  );

ALTER TABLE ppd
  ADD CONSTRAINT ppd_p0_money_check CHECK (
    source <> 'p0' OR COALESCE(amount, 0) >= 0
  ),
  ADD CONSTRAINT ppd_p0_fund_source_check CHECK (
    source <> 'p0'
    OR fund_source IS NULL
    OR fund_source IN ('Zakat', 'Infaq/Shodaqoh', 'DSKL', 'Hibah')
  ),
  ADD CONSTRAINT ppd_p0_payment_type_check CHECK (
    source <> 'p0'
    OR payment_type IS NULL
    OR payment_type IN ('Uang Muka', 'Reimbursement', 'Pembayaran', 'Lain-lain')
  ),
  ADD CONSTRAINT ppd_p0_submitted_fields_check CHECK (
    source <> 'p0'
    OR status IN ('draft', 'returned', 'superseded')
    OR (
      template_code IS NOT NULL
      AND template_version IS NOT NULL
      AND revision IS NOT NULL
      AND mpzis_id IS NOT NULL
      AND form_number IS NOT NULL
      AND ppd_number IS NOT NULL
      AND transaction_number IS NOT NULL
      AND requester_name IS NOT NULL
      AND requester_role IS NOT NULL
      AND requester_department IS NOT NULL
      AND amount > 0
      AND purpose IS NOT NULL
      AND fund_source IS NOT NULL
      AND payment_type IS NOT NULL
      AND bank_account_ciphertext IS NOT NULL
      AND bank_account_last4 IS NOT NULL
      AND bank_account_name IS NOT NULL
      AND snapshot_json IS NOT NULL
      AND snapshot_hash IS NOT NULL
          AND (
            payment_type <> 'Lain-lain'
            OR payment_type_other IS NOT NULL
            AND char_length(btrim(payment_type_other)) BETWEEN 3 AND 150
          )
          AND (payment_type = 'Lain-lain' OR payment_type_other IS NULL)
        )
      ),
  ADD CONSTRAINT ppd_p0_payment_type_other_check CHECK (
    source <> 'p0'
    OR (
      (payment_type = 'Lain-lain' OR payment_type_other IS NULL)
      AND (payment_type_other IS NULL OR char_length(btrim(payment_type_other)) BETWEEN 3 AND 150)
    )
  );

CREATE TABLE IF NOT EXISTS artifact_approvals (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  approval_step VARCHAR(60),
  action VARCHAR(30) NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  note TEXT,
  correlation_id UUID,
  actor_id INTEGER,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  actor_level VARCHAR(30) NOT NULL,
  actor_division VARCHAR(100) NOT NULL,
  is_admin_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  completion_hash CHAR(64),
  completion_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artifact_files (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  kind VARCHAR(40) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artifact_access_events (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL,
  mustahik_id INTEGER NOT NULL,
  artifact_type VARCHAR(40) NOT NULL,
  artifact_id INTEGER NOT NULL,
  artifact_revision INTEGER NOT NULL,
  actor_id INTEGER,
  actor_name VARCHAR(255) NOT NULL,
  actor_role VARCHAR(100) NOT NULL,
  actor_level VARCHAR(30) NOT NULL,
  actor_division VARCHAR(100) NOT NULL,
  action VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correlation_id UUID
);

CREATE TABLE IF NOT EXISTS ppd_rab_lines (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  register_number VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  CONSTRAINT ppd_rab_line_no_check CHECK (line_no BETWEEN 1 AND 3),
  CONSTRAINT ppd_rab_amount_check CHECK (amount > 0),
  CONSTRAINT ppd_rab_unique_line UNIQUE (ppd_id, line_no)
);

CREATE TABLE IF NOT EXISTS ppd_payments (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  transaction_number VARCHAR(100) NOT NULL,
  paid_amount NUMERIC(15,2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL,
  proof_file_id INTEGER,
  recorded_by_id INTEGER,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  verified_by_id INTEGER,
  verified_at TIMESTAMPTZ,
  snapshot_json JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ppd_payment_amount_check CHECK (paid_amount > 0),
  CONSTRAINT ppd_payment_status_check CHECK (verification_status IN ('pending', 'verified'))
);

CREATE TABLE IF NOT EXISTS recipient_confirmations (
  id SERIAL PRIMARY KEY,
  ppd_id INTEGER NOT NULL,
  method VARCHAR(30) NOT NULL,
  recipient_name_snapshot VARCHAR(255) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL,
  evidence_file_id INTEGER,
  recorded_by_id INTEGER,
  snapshot_json JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE artifact_files
  ADD CONSTRAINT artifact_file_size_check CHECK (byte_size > 0);
ALTER TABLE artifact_approvals
  ADD COLUMN IF NOT EXISTS completion_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS completion_snapshot_json JSONB;
ALTER TABLE recipient_confirmations
  ADD CONSTRAINT recipient_confirmation_method_check CHECK (method IN ('Tatap Muka', 'Telepon', 'WhatsApp', 'Tanda Terima'));
ALTER TABLE artifact_files
  ADD CONSTRAINT artifact_file_kind_check CHECK (kind IN ('supporting_document', 'payment_proof', 'recipient_confirmation', 'system_receipt_pdf'));
ALTER TABLE artifact_approvals
  ALTER COLUMN snapshot_hash SET NOT NULL,
  ALTER COLUMN actor_name SET NOT NULL,
  ALTER COLUMN actor_role SET NOT NULL,
  ALTER COLUMN actor_level SET NOT NULL,
  ALTER COLUMN actor_division SET NOT NULL,
  ADD CONSTRAINT artifact_approvals_actor_snapshot_check CHECK (
    actor_name IS NOT NULL
    AND actor_role IS NOT NULL
    AND actor_level IS NOT NULL
    AND actor_division IS NOT NULL
    AND snapshot_hash IS NOT NULL
  );
ALTER TABLE artifact_access_events
  ALTER COLUMN actor_name SET NOT NULL,
  ALTER COLUMN actor_role SET NOT NULL,
  ALTER COLUMN actor_level SET NOT NULL,
  ALTER COLUMN actor_division SET NOT NULL,
  ADD CONSTRAINT artifact_access_events_actor_snapshot_check CHECK (
    actor_name IS NOT NULL
    AND actor_role IS NOT NULL
    AND actor_level IS NOT NULL
    AND actor_division IS NOT NULL
  );
ALTER TABLE ppd_payments
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
  ALTER COLUMN snapshot_hash SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE recipient_confirmations
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB,
  ALTER COLUMN snapshot_hash SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
-- Upgrade safety: existing payment/confirmation rows may predate P0 and have
-- no canonical snapshot.  Do not fabricate evidence or fail the whole
-- migration; P0 service reads fail closed whenever either snapshot is null.
-- Fresh installs retain NOT NULL in the CREATE TABLE definitions above.
DO $p0_payment_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ppd_payment_amount_check' AND conrelid = 'ppd_payments'::regclass
  ) THEN
    ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payment_amount_check CHECK (paid_amount > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ppd_payment_status_check' AND conrelid = 'ppd_payments'::regclass
  ) THEN
    ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payment_status_check CHECK (verification_status IN ('pending', 'verified'));
  END IF;
END
$p0_payment_checks$;

CREATE TABLE IF NOT EXISTS p0_idempotency_keys (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL,
  idempotency_key VARCHAR(150) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT p0_idempotency_actor_key UNIQUE (actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS mustahik_case_assignments (
  id SERIAL PRIMARY KEY,
  mustahik_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  assignment_role VARCHAR(40) NOT NULL,
  assigned_by_id INTEGER,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ
);

-- Legacy installations may have arbitrary FK names. Discover and remove every
-- case/application FK by catalog identity before adding the canonical
-- restrictive constraints below; guessing the PostgreSQL-generated _fkey name
-- can leave an older CASCADE constraint active.
DO $p0_fk$
DECLARE
  legacy_fk RECORD;
BEGIN
  FOR legacy_fk IN
    SELECT child_ns.nspname AS child_schema,
           child_rel.relname AS child_table,
           con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_attribute child_attr
      ON child_attr.attrelid = con.conrelid
     AND child_attr.attnum = ANY (con.conkey)
    JOIN pg_attribute parent_attr
      ON parent_attr.attrelid = con.confrelid
     AND parent_attr.attnum = ANY (con.confkey)
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND child_ns.nspname = current_schema()
      AND parent_ns.nspname = current_schema()
      AND (
        (parent_rel.relname = 'mustahik'
         AND child_rel.relname IN ('applications', 'assessments', 'mpzis', 'ppd', 'documents', 'wa_logs', 'approval_decisions', 'activity_logs')
         AND child_attr.attname = 'mustahik_id'
         AND parent_attr.attname = 'id')
        OR
        (parent_rel.relname = 'applications'
         AND child_rel.relname IN ('assessments', 'mpzis', 'ppd')
         AND child_attr.attname = 'application_id'
         AND parent_attr.attname = 'id')
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', legacy_fk.child_schema, legacy_fk.child_table, legacy_fk.constraint_name);
  END LOOP;
END
$p0_fk$;

ALTER TABLE applications ADD CONSTRAINT applications_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE assessments ADD CONSTRAINT assessments_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE assessments ADD CONSTRAINT assessments_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT;
ALTER TABLE mpzis ADD CONSTRAINT mpzis_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE mpzis ADD CONSTRAINT mpzis_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT;
ALTER TABLE ppd ADD CONSTRAINT ppd_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE ppd ADD CONSTRAINT ppd_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE RESTRICT;
ALTER TABLE documents ADD CONSTRAINT documents_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE wa_logs ADD CONSTRAINT wa_logs_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE approval_decisions ADD CONSTRAINT approval_decisions_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_mustahik_id_fkey FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;

ALTER TABLE artifact_approvals ADD CONSTRAINT artifact_approvals_mustahik_fk FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE artifact_files ADD CONSTRAINT artifact_files_mustahik_fk FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE artifact_access_events ADD CONSTRAINT artifact_access_events_file_fk FOREIGN KEY (file_id) REFERENCES artifact_files(id) ON DELETE RESTRICT;
ALTER TABLE artifact_access_events ADD CONSTRAINT artifact_access_events_mustahik_fk FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE ppd_rab_lines ADD CONSTRAINT ppd_rab_lines_ppd_fk FOREIGN KEY (ppd_id) REFERENCES ppd(id) ON DELETE RESTRICT;
ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payments_ppd_fk FOREIGN KEY (ppd_id) REFERENCES ppd(id) ON DELETE RESTRICT;
ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payments_proof_fk FOREIGN KEY (proof_file_id) REFERENCES artifact_files(id) ON DELETE RESTRICT;
ALTER TABLE recipient_confirmations ADD CONSTRAINT recipient_confirmations_ppd_fk FOREIGN KEY (ppd_id) REFERENCES ppd(id) ON DELETE RESTRICT;
ALTER TABLE recipient_confirmations ADD CONSTRAINT recipient_confirmations_evidence_fk FOREIGN KEY (evidence_file_id) REFERENCES artifact_files(id) ON DELETE RESTRICT;
ALTER TABLE mustahik_case_assignments ADD CONSTRAINT case_assignments_mustahik_fk FOREIGN KEY (mustahik_id) REFERENCES mustahik(id) ON DELETE RESTRICT;
ALTER TABLE mustahik_case_assignments ADD CONSTRAINT case_assignments_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE assessments ADD CONSTRAINT assessments_supersedes_fk FOREIGN KEY (supersedes_id) REFERENCES assessments(id) ON DELETE RESTRICT;
ALTER TABLE mpzis ADD CONSTRAINT mpzis_supersedes_fk FOREIGN KEY (supersedes_id) REFERENCES mpzis(id) ON DELETE RESTRICT;
ALTER TABLE ppd ADD CONSTRAINT ppd_supersedes_fk FOREIGN KEY (supersedes_id) REFERENCES ppd(id) ON DELETE RESTRICT;
ALTER TABLE ppd ADD CONSTRAINT ppd_mpzis_fk FOREIGN KEY (mpzis_id) REFERENCES mpzis(id) ON DELETE RESTRICT;

-- Normalize legacy actor FKs too. Only artifact rows with required immutable
-- actor snapshots may use SET NULL for account cleanup; approval/activity
-- actors and all actor relations without snapshots remain restrictive.
DO $p0_actor_fk$
DECLARE
  legacy_fk RECORD;
BEGIN
  FOR legacy_fk IN
    SELECT child_ns.nspname AS child_schema,
           child_rel.relname AS child_table,
           con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_attribute child_attr
      ON child_attr.attrelid = con.conrelid
     AND child_attr.attnum = ANY (con.conkey)
    JOIN pg_attribute parent_attr
      ON parent_attr.attrelid = con.confrelid
     AND parent_attr.attnum = ANY (con.confkey)
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND array_length(con.confkey, 1) = 1
      AND child_ns.nspname = current_schema()
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname = 'users'
      AND parent_attr.attname = 'id'
          AND (
                (child_rel.relname = 'approval_decisions' AND child_attr.attname IN ('actor_id', 'prepared_by_id'))
                OR (child_rel.relname = 'activity_logs' AND child_attr.attname = 'actor_id')
                OR (child_rel.relname = 'artifact_approvals' AND child_attr.attname = 'actor_id')
                OR (child_rel.relname = 'artifact_files' AND child_attr.attname = 'uploaded_by_id')
                OR (child_rel.relname = 'artifact_access_events' AND child_attr.attname = 'actor_id')
                OR (child_rel.relname = 'ppd_payments' AND child_attr.attname IN ('recorded_by_id', 'verified_by_id'))
                OR (child_rel.relname = 'recipient_confirmations' AND child_attr.attname = 'recorded_by_id')
                OR (child_rel.relname = 'mustahik' AND child_attr.attname IN ('created_by_id', 'p0_reconciled_by', 'archived_by_id'))
                OR (child_rel.relname = 'assessments' AND child_attr.attname IN ('created_by_id', 'updated_by_id'))
                OR (child_rel.relname = 'mpzis' AND child_attr.attname IN ('created_by_id', 'submitted_by_id'))
                OR (child_rel.relname = 'ppd' AND child_attr.attname = 'created_by_id')
                OR (child_rel.relname = 'p0_idempotency_keys' AND child_attr.attname = 'actor_id')
                OR (child_rel.relname = 'mustahik_case_assignments' AND child_attr.attname = 'assigned_by_id')
          )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', legacy_fk.child_schema, legacy_fk.child_table, legacy_fk.constraint_name);
  END LOOP;
END
$p0_actor_fk$;

ALTER TABLE approval_decisions ADD CONSTRAINT approval_decisions_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE approval_decisions ADD CONSTRAINT approval_decisions_prepared_by_fk FOREIGN KEY (prepared_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assessments_active_revision ON assessments(mustahik_id, application_id) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessments_revision ON assessments(mustahik_id, application_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpzis_active_revision ON mpzis(mustahik_id, application_id) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpzis_revision ON mpzis(mustahik_id, application_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_active_revision ON ppd(mustahik_id, application_id) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_revision ON ppd(mustahik_id, application_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpzis_form_revision ON mpzis(form_number, revision) WHERE source = 'p0';
CREATE UNIQUE INDEX IF NOT EXISTS uq_mpzis_active_form_number ON mpzis(form_number) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_form_revision ON ppd(form_number, revision) WHERE source = 'p0';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_ppd_number_revision ON ppd(ppd_number, revision) WHERE source = 'p0';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_transaction_revision ON ppd(transaction_number, revision) WHERE source = 'p0';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_active_form_number ON ppd(form_number) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_active_ppd_number ON ppd(ppd_number) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppd_active_transaction_number ON ppd(transaction_number) WHERE source = 'p0' AND status <> 'superseded';
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_approval_step ON artifact_approvals(artifact_type, artifact_id, artifact_revision, approval_step) WHERE action = 'approve';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_ppd_payment ON ppd_payments(ppd_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_recipient_confirmation ON recipient_confirmations(ppd_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_case_assignment ON mustahik_case_assignments(mustahik_id, user_id, assignment_role) WHERE ended_at IS NULL;

ALTER TABLE artifact_approvals ADD CONSTRAINT artifact_approvals_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE artifact_files ADD CONSTRAINT artifact_files_uploader_fk FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE artifact_access_events ADD CONSTRAINT artifact_access_events_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payments_recorder_fk FOREIGN KEY (recorded_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ppd_payments ADD CONSTRAINT ppd_payments_verifier_fk FOREIGN KEY (verified_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE recipient_confirmations ADD CONSTRAINT recipient_confirmations_recorder_fk FOREIGN KEY (recorded_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mustahik ADD CONSTRAINT mustahik_creator_fk FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mustahik ADD CONSTRAINT mustahik_reconciler_fk FOREIGN KEY (p0_reconciled_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mustahik ADD CONSTRAINT mustahik_archiver_fk FOREIGN KEY (archived_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE assessments ADD CONSTRAINT assessments_creator_fk FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE assessments ADD CONSTRAINT assessments_updater_fk FOREIGN KEY (updated_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mpzis ADD CONSTRAINT mpzis_creator_fk FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mpzis ADD CONSTRAINT mpzis_submitter_fk FOREIGN KEY (submitted_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ppd ADD CONSTRAINT ppd_creator_fk FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE p0_idempotency_keys ADD CONSTRAINT p0_idempotency_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mustahik_case_assignments ADD CONSTRAINT case_assignments_assigner_fk FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION p0_reject_immutable_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- SET NULL actor FKs are the one controlled mutation permitted for rows
  -- carrying immutable actor snapshots. PostgreSQL executes the referential
  -- action through a nested trigger; user-issued UPDATEs run at depth zero
  -- and remain rejected.
  IF TG_OP = 'UPDATE'
     AND TG_TABLE_NAME IN ('artifact_approvals', 'artifact_access_events')
     AND pg_trigger_depth() > 0
     AND (to_jsonb(OLD)->>'actor_id') IS NOT NULL
     AND (to_jsonb(NEW)->>'actor_id') IS NULL
     AND (to_jsonb(OLD) - 'actor_id') = (to_jsonb(NEW) - 'actor_id')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'P0_IMMUTABLE_RECORD';
END;
$$;

CREATE OR REPLACE FUNCTION p0_reject_payment_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.verification_status = 'pending'
     AND NEW.verification_status = 'verified'
     AND OLD.verified_by_id IS NULL
     AND OLD.verified_at IS NULL
     AND NEW.verified_by_id IS NOT NULL
     AND NEW.verified_at IS NOT NULL
     AND OLD.id IS NOT DISTINCT FROM NEW.id
     AND OLD.ppd_id IS NOT DISTINCT FROM NEW.ppd_id
     AND OLD.transaction_number IS NOT DISTINCT FROM NEW.transaction_number
     AND OLD.paid_amount IS NOT DISTINCT FROM NEW.paid_amount
     AND OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at
     AND OLD.proof_file_id IS NOT DISTINCT FROM NEW.proof_file_id
     AND OLD.recorded_by_id IS NOT DISTINCT FROM NEW.recorded_by_id
    AND OLD.snapshot_json IS NOT DISTINCT FROM NEW.snapshot_json
    AND OLD.snapshot_hash IS NOT DISTINCT FROM NEW.snapshot_hash
     AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'P0_IMMUTABLE_RECORD';
END;
$$;

DROP TRIGGER IF EXISTS artifact_approvals_immutable ON artifact_approvals;
CREATE TRIGGER artifact_approvals_immutable BEFORE UPDATE OR DELETE ON artifact_approvals FOR EACH ROW EXECUTE FUNCTION p0_reject_immutable_mutation();
DROP TRIGGER IF EXISTS artifact_approvals_truncate_immutable ON artifact_approvals;
CREATE TRIGGER artifact_approvals_truncate_immutable BEFORE TRUNCATE ON artifact_approvals FOR EACH STATEMENT EXECUTE FUNCTION p0_reject_immutable_mutation();
ALTER TABLE artifact_approvals ENABLE ALWAYS TRIGGER artifact_approvals_immutable;
ALTER TABLE artifact_approvals ENABLE ALWAYS TRIGGER artifact_approvals_truncate_immutable;

DROP TRIGGER IF EXISTS artifact_access_events_immutable ON artifact_access_events;
CREATE TRIGGER artifact_access_events_immutable BEFORE UPDATE OR DELETE ON artifact_access_events FOR EACH ROW EXECUTE FUNCTION p0_reject_immutable_mutation();
DROP TRIGGER IF EXISTS artifact_access_events_truncate_immutable ON artifact_access_events;
CREATE TRIGGER artifact_access_events_truncate_immutable BEFORE TRUNCATE ON artifact_access_events FOR EACH STATEMENT EXECUTE FUNCTION p0_reject_immutable_mutation();
ALTER TABLE artifact_access_events ENABLE ALWAYS TRIGGER artifact_access_events_immutable;
ALTER TABLE artifact_access_events ENABLE ALWAYS TRIGGER artifact_access_events_truncate_immutable;

DROP TRIGGER IF EXISTS artifact_files_submitted_immutable ON artifact_files;
CREATE TRIGGER artifact_files_submitted_immutable
  BEFORE UPDATE OR DELETE ON artifact_files
  FOR EACH ROW
  WHEN (OLD.kind IN ('supporting_document', 'payment_proof', 'recipient_confirmation', 'system_receipt_pdf'))
  EXECUTE FUNCTION p0_reject_immutable_mutation();
DROP TRIGGER IF EXISTS artifact_files_truncate_immutable ON artifact_files;
CREATE TRIGGER artifact_files_truncate_immutable BEFORE TRUNCATE ON artifact_files FOR EACH STATEMENT EXECUTE FUNCTION p0_reject_immutable_mutation();
ALTER TABLE artifact_files ENABLE ALWAYS TRIGGER artifact_files_submitted_immutable;
ALTER TABLE artifact_files ENABLE ALWAYS TRIGGER artifact_files_truncate_immutable;

DROP TRIGGER IF EXISTS ppd_payments_immutable ON ppd_payments;
CREATE TRIGGER ppd_payments_immutable BEFORE UPDATE OR DELETE ON ppd_payments FOR EACH ROW EXECUTE FUNCTION p0_reject_payment_mutation();
DROP TRIGGER IF EXISTS ppd_payments_truncate_immutable ON ppd_payments;
CREATE TRIGGER ppd_payments_truncate_immutable BEFORE TRUNCATE ON ppd_payments FOR EACH STATEMENT EXECUTE FUNCTION p0_reject_immutable_mutation();
ALTER TABLE ppd_payments ENABLE ALWAYS TRIGGER ppd_payments_immutable;
ALTER TABLE ppd_payments ENABLE ALWAYS TRIGGER ppd_payments_truncate_immutable;

DROP TRIGGER IF EXISTS recipient_confirmations_immutable ON recipient_confirmations;
CREATE TRIGGER recipient_confirmations_immutable BEFORE UPDATE OR DELETE ON recipient_confirmations FOR EACH ROW EXECUTE FUNCTION p0_reject_immutable_mutation();
DROP TRIGGER IF EXISTS recipient_confirmations_truncate_immutable ON recipient_confirmations;
CREATE TRIGGER recipient_confirmations_truncate_immutable BEFORE TRUNCATE ON recipient_confirmations FOR EACH STATEMENT EXECUTE FUNCTION p0_reject_immutable_mutation();
ALTER TABLE recipient_confirmations ENABLE ALWAYS TRIGGER recipient_confirmations_immutable;
ALTER TABLE recipient_confirmations ENABLE ALWAYS TRIGGER recipient_confirmations_truncate_immutable;
