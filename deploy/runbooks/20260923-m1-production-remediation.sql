-- Mustahik P0 M1 production data remediation.
-- Preconditions: a verified full backup and reviewed read-only manifest are mandatory.
-- The snapshot MD5 detects accidental corruption only; the verified backup SHA-256 is the cryptographic anchor.
-- This transaction is intentionally narrow: any unexpected identity/child state aborts it.
-- Stop backend and all database writers before execution; table locks below retain that freeze through COMMIT.
-- Run with psql -v ON_ERROR_STOP=1 -f this-file. Do not enable PENYALURAN_P0_ENABLED here.
-- Before execution, validate the custom-format full backup, SHA-256 sidecar, and pg_restore -l output.
-- Any failure before COMMIT rolls this transaction back. If later migrations fail after commit,
-- restore the verified backup to a replacement DB/volume and perform a controlled swap; the existing
-- in-place db-restore.sh --clean is not a complete rollback for objects created after that backup.
-- Do not run in production until the complete sequence has passed on a production-equivalent clone.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('baznas:m1:synthetic-remediation:20260923:v1', 0));
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

DO $m1_database_gate$
BEGIN
  IF current_database() <> 'baznas_db' OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:wrong_database_or_schema';
  END IF;
END
$m1_database_gate$;

-- Link columns on views, materialized views, or foreign tables cannot be safely locked and audited here.
DO $m1_unsupported_link_relation_gate$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind IN ('v', 'm', 'f')
      AND n.nspname NOT IN ('information_schema', 'pg_catalog')
      AND n.nspname !~ '^pg_'
      AND a.attname IN ('mustahik_id', 'application_id', 'ppd_id')
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:unsupported_link_relation';
  END IF;
END
$m1_unsupported_link_relation_gate$;

-- Lock known and catalog-discovered case/application/PPD relations before any manifest count.
-- SHARE ROW EXCLUSIVE blocks concurrent INSERT/UPDATE/DELETE while preserving read access.
DO $m1_write_lock$
DECLARE
  v_table RECORD;
BEGIN
  FOR v_table IN
    SELECT DISTINCT n.nspname AS table_schema, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'p')
      AND (
        (n.nspname = current_schema()
          AND (c.relname IN ('mustahik', 'users')
            OR a.attname IN ('mustahik_id', 'application_id', 'ppd_id')))
        OR a.attname IN ('mustahik_id', 'application_id', 'ppd_id')
        OR EXISTS (
          SELECT 1
          FROM pg_constraint con
          JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
          JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
          WHERE con.contype = 'f' AND con.conrelid = c.oid
            AND parent_ns.nspname = current_schema()
            AND parent_rel.relname IN ('mustahik', 'applications', 'ppd')
        )
      )
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE', v_table.table_schema, v_table.table_name);
  END LOOP;
END
$m1_write_lock$;

-- Cross-schema children cannot be safely snapshotted by this public-schema-only runbook.
-- Their relations are locked above; reject the catalog shape before quarantine DDL or row writes.
DO $m1_external_schema_fk_gate$
DECLARE
  v_table RECORD;
  v_count BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname IN ('mustahik', 'applications', 'ppd')
      AND child_ns.nspname <> current_schema()
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:external_schema_fk';
  END IF;

  -- Also reject non-public legacy tables that contain target-linked mustahik_id values without an FK.
  FOR v_table IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema NOT IN (current_schema(), 'information_schema', 'pg_catalog')
      AND table_schema NOT LIKE 'pg_toast%'
      AND column_name = 'mustahik_id'
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I WHERE %I::TEXT ~ %L',
      v_table.table_schema, v_table.table_name, 'mustahik_id', '^(22[1-9]|23[0-9]|24[0-8])$'
    ) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:external_schema_target_rows';
    END IF;
  END LOOP;

  -- Un-FK'd application_id/ppd_id columns can still point at rows removed by this run.
  -- Inspect all user schemas (including public) and reject any link into the target set.
  FOR v_table IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      AND table_schema NOT LIKE 'pg_toast%'
      AND column_name IN ('application_id', 'ppd_id')
  LOOP
    IF v_table.column_name = 'application_id' THEN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.%I c JOIN %I.applications p ON p.id::TEXT = c.%I::TEXT WHERE p.mustahik_id BETWEEN 221 AND 248',
        v_table.table_schema, v_table.table_name, current_schema(), v_table.column_name
      ) INTO v_count;
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:external_application_reference';
      END IF;
    ELSE
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.%I c JOIN %I.ppd p ON p.id::TEXT = c.%I::TEXT WHERE p.mustahik_id BETWEEN 221 AND 248',
        v_table.table_schema, v_table.table_name, current_schema(), v_table.column_name
      ) INTO v_count;
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:external_ppd_reference';
      END IF;
    END IF;
  END LOOP;
END
$m1_external_schema_fk_gate$;

DO $m1_quarantine_reuse_gate$
DECLARE
  v_status TEXT;
  v_count BIGINT;
  v_owner NAME;
BEGIN
  IF to_regnamespace('ops_quarantine') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('ops_quarantine.remediation_runs') IS NULL
     OR to_regclass('ops_quarantine.row_snapshots') IS NULL THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:preexisting_quarantine_objects';
  END IF;

  SELECT r.status INTO v_status
  FROM ops_quarantine.remediation_runs r
  WHERE r.run_id = '20260923-m1-synthetic-remediation-v1';
  IF v_status <> 'completed'
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = '20260923-m1-synthetic-remediation-v1') <> 84 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:preexisting_quarantine_manifest';
  END IF;

  SELECT pg_get_userbyid(nspowner) INTO v_owner FROM pg_namespace WHERE nspname = 'ops_quarantine';
  IF v_owner <> current_user
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'ops_quarantine'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
         AND c.relname NOT IN ('remediation_runs', 'row_snapshots')
     )
     OR (SELECT array_agg(attname::TEXT ORDER BY attname) FROM pg_attribute WHERE attrelid = 'ops_quarantine.remediation_runs'::regclass AND attnum > 0 AND NOT attisdropped) <> ARRAY['completed_at','manifest','run_id','snapshot_count','started_at','status']::TEXT[]
     OR (SELECT array_agg(attname::TEXT ORDER BY attname) FROM pg_attribute WHERE attrelid = 'ops_quarantine.row_snapshots'::regclass AND attnum > 0 AND NOT attisdropped) <> ARRAY['before_image','before_image_md5','captured_at','entity_type','row_pk','run_id','source_schema','source_table']::TEXT[]
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
       WHERE n.nspname = 'ops_quarantine' AND c.relname IN ('remediation_runs', 'row_snapshots')
         AND acl.grantee <> c.relowner
     )
     OR EXISTS (
       SELECT 1 FROM pg_namespace n
       CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
       WHERE n.nspname = 'ops_quarantine' AND acl.grantee <> n.nspowner
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:quarantine_owner_acl_or_shape';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM pg_trigger t
  WHERE t.tgrelid IN ('ops_quarantine.remediation_runs'::regclass, 'ops_quarantine.row_snapshots'::regclass)
    AND NOT t.tgisinternal AND t.tgenabled = 'A';
  IF v_count <> 4
     OR to_regprocedure('ops_quarantine.reject_snapshot_mutation()') IS NULL
     OR to_regprocedure('ops_quarantine.guard_run_manifest()') IS NULL
     OR position('M1_QUARANTINE_SNAPSHOT_IMMUTABLE' IN pg_get_functiondef('ops_quarantine.reject_snapshot_mutation()'::regprocedure)) = 0
     OR position('M1_QUARANTINE_RUN_IMMUTABLE' IN pg_get_functiondef('ops_quarantine.guard_run_manifest()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:quarantine_protection';
  END IF;
END
$m1_quarantine_reuse_gate$;

CREATE SCHEMA IF NOT EXISTS ops_quarantine;

CREATE TABLE IF NOT EXISTS ops_quarantine.remediation_runs (
  run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  manifest JSONB NOT NULL,
  snapshot_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ops_quarantine.row_snapshots (
  run_id TEXT NOT NULL REFERENCES ops_quarantine.remediation_runs(run_id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  source_schema TEXT NOT NULL,
  source_table TEXT NOT NULL,
  row_pk JSONB NOT NULL,
  before_image JSONB NOT NULL,
  before_image_md5 TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, entity_type, source_table, row_pk)
);

DO $m1_quarantine_functions$
BEGIN
  IF to_regprocedure('ops_quarantine.reject_snapshot_mutation()') IS NULL THEN
    EXECUTE $ddl$
      CREATE FUNCTION ops_quarantine.reject_snapshot_mutation()
      RETURNS TRIGGER LANGUAGE plpgsql AS $function$
      BEGIN
        RAISE EXCEPTION 'M1_QUARANTINE_SNAPSHOT_IMMUTABLE:%', TG_OP;
      END;
      $function$
    $ddl$;
  END IF;
  IF to_regprocedure('ops_quarantine.guard_run_manifest()') IS NULL THEN
    EXECUTE $ddl$
      CREATE FUNCTION ops_quarantine.guard_run_manifest()
      RETURNS TRIGGER LANGUAGE plpgsql AS $function$
      BEGIN
        IF TG_OP = 'UPDATE'
           AND OLD.status = 'running' AND NEW.status = 'completed'
           AND OLD.run_id = NEW.run_id AND OLD.manifest = NEW.manifest
           AND OLD.started_at = NEW.started_at AND OLD.snapshot_count = 0
           AND NEW.completed_at IS NOT NULL AND NEW.snapshot_count = 84 THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'M1_QUARANTINE_RUN_IMMUTABLE:%', TG_OP;
      END;
      $function$
    $ddl$;
  END IF;
END
$m1_quarantine_functions$;

DO $m1_snapshot_triggers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ops_quarantine.row_snapshots'::regclass
      AND tgname = 'row_snapshots_no_row_mutation'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER row_snapshots_no_row_mutation
      BEFORE UPDATE OR DELETE ON ops_quarantine.row_snapshots
      FOR EACH ROW EXECUTE FUNCTION ops_quarantine.reject_snapshot_mutation();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ops_quarantine.row_snapshots'::regclass
      AND tgname = 'row_snapshots_no_truncate'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER row_snapshots_no_truncate
      BEFORE TRUNCATE ON ops_quarantine.row_snapshots
      FOR EACH STATEMENT EXECUTE FUNCTION ops_quarantine.reject_snapshot_mutation();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ops_quarantine.remediation_runs'::regclass
      AND tgname = 'remediation_runs_no_row_mutation'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER remediation_runs_no_row_mutation
      BEFORE UPDATE OR DELETE ON ops_quarantine.remediation_runs
      FOR EACH ROW EXECUTE FUNCTION ops_quarantine.guard_run_manifest();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'ops_quarantine.remediation_runs'::regclass
      AND tgname = 'remediation_runs_no_truncate'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER remediation_runs_no_truncate
      BEFORE TRUNCATE ON ops_quarantine.remediation_runs
      FOR EACH STATEMENT EXECUTE FUNCTION ops_quarantine.reject_snapshot_mutation();
  END IF;
END
$m1_snapshot_triggers$;

ALTER TABLE ops_quarantine.row_snapshots ENABLE ALWAYS TRIGGER row_snapshots_no_row_mutation;
ALTER TABLE ops_quarantine.row_snapshots ENABLE ALWAYS TRIGGER row_snapshots_no_truncate;
ALTER TABLE ops_quarantine.remediation_runs ENABLE ALWAYS TRIGGER remediation_runs_no_row_mutation;
ALTER TABLE ops_quarantine.remediation_runs ENABLE ALWAYS TRIGGER remediation_runs_no_truncate;
REVOKE ALL ON SCHEMA ops_quarantine FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ops_quarantine FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ops_quarantine FROM PUBLIC;

DO $m1_quarantine_acl_gate$
DECLARE
  v_owner OID;
BEGIN
  SELECT nspowner INTO v_owner FROM pg_namespace WHERE nspname = 'ops_quarantine';
  IF v_owner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'ops_quarantine' AND c.relname IN ('remediation_runs', 'row_snapshots')
         AND c.relowner <> v_owner
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ops_quarantine' AND p.proname IN ('reject_snapshot_mutation', 'guard_run_manifest')
         AND p.proowner <> v_owner
     )
     OR EXISTS (
       SELECT 1 FROM pg_namespace n
       CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
       WHERE n.nspname = 'ops_quarantine' AND acl.grantee <> n.nspowner
     )
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
       WHERE n.nspname = 'ops_quarantine' AND acl.grantee <> c.relowner
     )
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE n.nspname = 'ops_quarantine' AND acl.grantee <> p.proowner
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:quarantine_acl';
  END IF;
END
$m1_quarantine_acl_gate$;

DO $m1_remediation$
DECLARE
  v_run_id CONSTANT TEXT := '20260923-m1-synthetic-remediation-v1';
  v_run_status TEXT;
  v_count BIGINT;
  v_table RECORD;
  v_child_count BIGINT;
  v_snapshot_count BIGINT;
BEGIN
  SELECT status INTO v_run_status FROM ops_quarantine.remediation_runs WHERE run_id = v_run_id;

  IF v_run_status = 'completed' THEN
    IF EXISTS (SELECT 1 FROM mustahik WHERE id BETWEEN 221 AND 248)
       OR EXISTS (SELECT 1 FROM approval_decisions WHERE actor_id = 99)
       OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id) <> 84 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_POSTCONDITION_FAILED:completed_run_drift';
    END IF;
    RAISE NOTICE 'M1_REMEDIATION_ALREADY_COMPLETED:%', v_run_id;
    RETURN;
  ELSIF v_run_status IS NOT NULL THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:nonterminal_run';
  END IF;

  -- Exact, non-PII business identity manifest: ID, group label, status, and file number.
  SELECT COUNT(*) INTO v_count
  FROM generate_series(221, 248) AS expected(id)
  JOIN mustahik m ON m.id = expected.id
  WHERE m.file_no = 'MST-202609-' || lpad((expected.id - 220)::TEXT, 4, '0')
    AND m.name = CASE (expected.id - 221) % 4
      WHEN 0 THEN 'Mustahik Test Surveyor Gate'
      WHEN 1 THEN 'Mustahik Test Jump'
      WHEN 2 THEN 'Mustahik Transisi Valid'
      WHEN 3 THEN 'Mustahik Penolakan Valid'
    END
    AND m.status = CASE (expected.id - 221) % 4
      WHEN 0 THEN 'Diajukan'
      WHEN 1 THEN 'Diajukan'
      WHEN 2 THEN 'Verifikasi Administrasi'
      WHEN 3 THEN 'Ditolak'
    END;
  IF v_count <> 28 OR (SELECT COUNT(*) FROM mustahik WHERE id BETWEEN 221 AND 248) <> 28 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:target_identity';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT (id - 221) % 4 AS duplicate_group
    FROM mustahik
    WHERE id BETWEEN 221 AND 248
    GROUP BY (id - 221) % 4
    HAVING COUNT(*) = 7 AND COUNT(nik) = 7 AND COUNT(DISTINCT nik) = 1
  ) groups_with_one_duplicate_nik;
  IF v_count <> 4
     OR (SELECT COUNT(DISTINCT nik) FROM (
           SELECT MIN(nik) AS nik FROM mustahik WHERE id BETWEEN 221 AND 248 GROUP BY (id - 221) % 4
         ) groups_by_nik) <> 4 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:duplicate_nik_group_shape';
  END IF;
  IF EXISTS (
    SELECT 1 FROM mustahik outside_target
    WHERE outside_target.id NOT BETWEEN 221 AND 248
      AND outside_target.nik IN (SELECT nik FROM mustahik WHERE id BETWEEN 221 AND 248)
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:duplicate_nik_outside_target';
  END IF;

  IF (SELECT COUNT(*) FROM applications WHERE mustahik_id BETWEEN 221 AND 248) <> 28
     OR EXISTS (
       SELECT 1 FROM generate_series(221, 248) expected(id)
       LEFT JOIN applications a ON a.mustahik_id = expected.id
       GROUP BY expected.id
       HAVING COUNT(a.id) <> 1
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:application_counts';
  END IF;

  IF (SELECT COUNT(*) FROM assessments WHERE mustahik_id BETWEEN 221 AND 248) <> 0
     OR (SELECT COUNT(*) FROM mpzis WHERE mustahik_id BETWEEN 221 AND 248) <> 0
     OR (SELECT COUNT(*) FROM ppd WHERE mustahik_id BETWEEN 221 AND 248) <> 0
     OR (SELECT COUNT(*) FROM documents WHERE mustahik_id BETWEEN 221 AND 248) <> 0
     OR (SELECT COUNT(*) FROM wa_logs WHERE mustahik_id BETWEEN 221 AND 248) <> 0 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:unreviewed_legacy_children';
  END IF;

  IF (SELECT COUNT(*) FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248) <> 14
     OR EXISTS (
       SELECT 1 FROM generate_series(221, 248) expected(id)
       LEFT JOIN activity_logs a ON a.mustahik_id = expected.id
       GROUP BY expected.id
       HAVING COUNT(a.id) <> CASE (expected.id - 221) % 4 WHEN 0 THEN 0 WHEN 1 THEN 0 ELSE 1 END
          OR (COUNT(a.id) = 1 AND MIN(a.action_type) <> CASE (expected.id - 221) % 4 WHEN 2 THEN 'APPROVE' ELSE 'REJECT' END)
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:activity_counts';
  END IF;

  -- Any unreviewed direct Mustahik child, including a newly introduced table, blocks the run.
  FOR v_table IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND column_name = 'mustahik_id'
      AND table_name NOT IN ('mustahik', 'applications', 'activity_logs', 'approval_decisions')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I.%I WHERE mustahik_id BETWEEN 221 AND 248', v_table.table_schema, v_table.table_name)
      INTO v_child_count;
    IF v_child_count <> 0 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:unreviewed_child:%', v_table.table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname IN ('mustahik', 'applications')
      AND child_ns.nspname = current_schema()
      AND COALESCE(array_length(con.conkey, 1), 0) <> 1
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:composite_child_fk';
  END IF;

  -- Also catch direct FKs whose legacy column name differs from mustahik_id.
  FOR v_table IN
    SELECT DISTINCT child_ns.nspname AS child_schema, child_rel.relname AS child_table,
           child_att.attname AS child_column
    FROM pg_constraint con
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_attribute child_att ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
    JOIN pg_attribute parent_att ON parent_att.attrelid = con.confrelid AND parent_att.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname = 'mustahik'
      AND parent_att.attname = 'id'
      AND child_ns.nspname = current_schema()
      AND child_rel.relname NOT IN ('mustahik', 'applications', 'activity_logs', 'approval_decisions')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I.%I WHERE %I BETWEEN 221 AND 248', v_table.child_schema, v_table.child_table, v_table.child_column)
      INTO v_child_count;
    IF v_child_count <> 0 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:mustahik_fk_child:%', v_table.child_table;
    END IF;
  END LOOP;

  -- Check immediate foreign-key children of the exact application set; recursive descendants are outside this runbook's reviewed scope.
  FOR v_table IN
    SELECT child_ns.nspname AS child_schema, child_rel.relname AS child_table,
           child_att.attname AS child_column
    FROM pg_constraint con
    JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
    JOIN pg_class child_rel ON child_rel.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
    JOIN pg_attribute child_att ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
    JOIN pg_attribute parent_att ON parent_att.attrelid = con.confrelid AND parent_att.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND parent_ns.nspname = current_schema()
      AND parent_rel.relname = 'applications'
      AND parent_att.attname = 'id'
      AND child_ns.nspname = current_schema()
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I c JOIN %I.applications p ON p.id = c.%I WHERE p.mustahik_id BETWEEN 221 AND 248',
      v_table.child_schema, v_table.child_table, current_schema(), v_table.child_column
    ) INTO v_child_count;
    IF v_child_count <> 0 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:application_descendant:%', v_table.child_table;
    END IF;
  END LOOP;

  -- All 14 actor-99 rows are reviewed target children; quarantine before nulling and deleting those children.
  IF (SELECT COUNT(*) FROM approval_decisions WHERE actor_id = 99) <> 14
     OR (SELECT COUNT(*) FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248) <> 14
     OR EXISTS (
       SELECT 1 FROM generate_series(221, 248) expected(id)
       LEFT JOIN approval_decisions d ON d.mustahik_id = expected.id
       GROUP BY expected.id
       HAVING COUNT(d.id) <> CASE (expected.id - 221) % 4 WHEN 2 THEN 1 WHEN 3 THEN 1 ELSE 0 END
          OR (COUNT(d.id) = 1 AND MIN(d.action) <> CASE (expected.id - 221) % 4 WHEN 2 THEN 'approve' ELSE 'reject' END)
     )
     OR EXISTS (
       SELECT 1 FROM approval_decisions
       WHERE actor_id = 99
         AND (mustahik_id NOT BETWEEN 221 AND 248
           OR actor_name <> 'penyaluran Test User'
           OR actor_role <> 'penyaluran'
           OR stage <> 'Diajukan'
           OR action NOT IN ('approve', 'reject'))
      )
     OR EXISTS (SELECT 1 FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248 AND actor_id IS DISTINCT FROM 99)
     OR (SELECT COUNT(*) FROM approval_decisions WHERE actor_id = 99 AND action NOT IN ('approve', 'reject')) <> 0
     OR EXISTS (SELECT 1 FROM users WHERE id = 99) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:actor_99_manifest';
  END IF;

  IF EXISTS (
    SELECT 1 FROM approval_decisions d
    WHERE d.actor_id <> 99
      AND d.actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.actor_id)
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:other_orphan_actors';
  END IF;

  INSERT INTO ops_quarantine.remediation_runs(run_id, status, manifest)
  VALUES (
    v_run_id,
    'running',
    jsonb_build_object(
      'target_ids', jsonb_build_array(221, 248),
      'expected_parents', 28,
      'expected_applications', 28,
      'expected_activity_logs', 14,
      'expected_actor_99_rows', 14,
      'unreviewed_direct_children', 0,
      'application_descendants', 0
    )
  );

  INSERT INTO ops_quarantine.row_snapshots(run_id, entity_type, source_schema, source_table, row_pk, before_image, before_image_md5)
  SELECT v_run_id, 'mustahik', current_schema(), 'mustahik', jsonb_build_object('id', m.id), to_jsonb(m), md5(to_jsonb(m)::TEXT)
  FROM mustahik m WHERE m.id BETWEEN 221 AND 248;

  INSERT INTO ops_quarantine.row_snapshots(run_id, entity_type, source_schema, source_table, row_pk, before_image, before_image_md5)
  SELECT v_run_id, 'applications', current_schema(), 'applications', jsonb_build_object('id', a.id), to_jsonb(a), md5(to_jsonb(a)::TEXT)
  FROM applications a WHERE a.mustahik_id BETWEEN 221 AND 248;

  INSERT INTO ops_quarantine.row_snapshots(run_id, entity_type, source_schema, source_table, row_pk, before_image, before_image_md5)
  SELECT v_run_id, 'activity_logs', current_schema(), 'activity_logs', jsonb_build_object('id', a.id), to_jsonb(a), md5(to_jsonb(a)::TEXT)
  FROM activity_logs a WHERE a.mustahik_id BETWEEN 221 AND 248;

  INSERT INTO ops_quarantine.row_snapshots(run_id, entity_type, source_schema, source_table, row_pk, before_image, before_image_md5)
  SELECT v_run_id, 'approval_decisions', current_schema(), 'approval_decisions', jsonb_build_object('id', d.id), to_jsonb(d), md5(to_jsonb(d)::TEXT)
  FROM approval_decisions d WHERE d.mustahik_id BETWEEN 221 AND 248;

  SELECT COUNT(*) INTO v_snapshot_count
  FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id;
  IF v_snapshot_count <> 84 OR EXISTS (
    SELECT 1 FROM ops_quarantine.row_snapshots
  WHERE run_id = v_run_id AND md5(before_image::TEXT) <> before_image_md5
  ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_PRECONDITION_FAILED:snapshot_count_or_digest';
  END IF;

  UPDATE approval_decisions SET actor_id = NULL WHERE actor_id = 99 AND mustahik_id BETWEEN 221 AND 248;
  DELETE FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248;
  DELETE FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248;
  DELETE FROM applications WHERE mustahik_id BETWEEN 221 AND 248;
  DELETE FROM mustahik WHERE id BETWEEN 221 AND 248;

  IF EXISTS (SELECT 1 FROM mustahik WHERE id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM applications WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM approval_decisions WHERE actor_id = 99)
     OR EXISTS (
       SELECT 1
       FROM ops_quarantine.row_snapshots s
       WHERE s.run_id = v_run_id
         AND s.entity_type = 'approval_decisions'
         AND ((s.before_image->>'actor_id') <> '99'
           OR s.before_image->>'mustahik_id' NOT BETWEEN '221' AND '248'
           OR s.before_image->>'actor_name' <> 'penyaluran Test User'
           OR s.before_image->>'actor_role' <> 'penyaluran')
     )
     OR EXISTS (SELECT 1 FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (
       SELECT 1 FROM approval_decisions d
       WHERE d.actor_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.actor_id)
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_POSTCONDITION_FAILED:data_or_actor_state';
  END IF;

  UPDATE ops_quarantine.remediation_runs
  SET status = 'completed', completed_at = clock_timestamp(), snapshot_count = v_snapshot_count
  WHERE run_id = v_run_id AND status = 'running';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'M1_REMEDIATION_POSTCONDITION_FAILED:manifest_completion';
  END IF;
END
$m1_remediation$;

COMMIT;
