-- Read-only M1 manifest preflight before remediation, or integrity check after commit.
-- It emits aggregate state only; target names, file numbers, and NIK values are never selected.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15000';

DO $m1_verify$
DECLARE
  v_run_id CONSTANT TEXT := '20260923-m1-synthetic-remediation-v1';
  v_status TEXT;
  v_table RECORD;
  v_count BIGINT;
BEGIN
  IF current_database() <> 'baznas_db' OR current_schema() <> 'public' THEN
    RAISE EXCEPTION 'M1_REMEDIATION_VERIFY_FAILED:wrong_database_or_schema';
  END IF;

  IF to_regclass('ops_quarantine.remediation_runs') IS NOT NULL THEN
    EXECUTE 'SELECT status FROM ops_quarantine.remediation_runs WHERE run_id = $1' INTO v_status USING v_run_id;
  END IF;

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
    IF v_status = 'completed' THEN
      RAISE EXCEPTION 'M1_REMEDIATION_VERIFY_FAILED:unsupported_link_relation';
    END IF;
    RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:unsupported_link_relation';
  END IF;

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
    RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:external_schema_fk';
  END IF;

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
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:external_schema_target_rows';
    END IF;
  END LOOP;

  -- Include un-FK'd references in every user schema; application IDs are joined to
  -- the exact target applications and PPD IDs to any target PPD rows.
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
        RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:external_application_reference';
      END IF;
    ELSE
      EXECUTE format(
        'SELECT COUNT(*) FROM %I.%I c JOIN %I.ppd p ON p.id::TEXT = c.%I::TEXT WHERE p.mustahik_id BETWEEN 221 AND 248',
        v_table.table_schema, v_table.table_name, current_schema(), v_table.column_name
      ) INTO v_count;
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:external_ppd_reference';
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('ops_quarantine.remediation_runs') IS NULL THEN
    IF to_regnamespace('ops_quarantine') IS NOT NULL THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:preexisting_quarantine';
    END IF;
    v_status := NULL;
  ELSE
    EXECUTE 'SELECT status FROM ops_quarantine.remediation_runs WHERE run_id = $1' INTO v_status USING v_run_id;
  END IF;

  IF v_status IS NULL THEN
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
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:target_identity';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM (
      SELECT (id - 221) % 4 AS duplicate_group
      FROM mustahik WHERE id BETWEEN 221 AND 248
      GROUP BY (id - 221) % 4
      HAVING COUNT(*) = 7 AND COUNT(nik) = 7 AND COUNT(DISTINCT nik) = 1
    ) groups_with_one_duplicate_nik;
    IF v_count <> 4
       OR (SELECT COUNT(DISTINCT nik) FROM (
             SELECT MIN(nik) AS nik FROM mustahik WHERE id BETWEEN 221 AND 248 GROUP BY (id - 221) % 4
           ) groups_by_nik) <> 4
       OR EXISTS (
         SELECT 1 FROM mustahik outside_target
         WHERE outside_target.id NOT BETWEEN 221 AND 248
           AND outside_target.nik IN (SELECT nik FROM mustahik WHERE id BETWEEN 221 AND 248)
       ) THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:duplicate_nik_group_shape';
    END IF;

    IF (SELECT COUNT(*) FROM applications WHERE mustahik_id BETWEEN 221 AND 248) <> 28
       OR EXISTS (
         SELECT 1 FROM generate_series(221, 248) expected(id)
         LEFT JOIN applications a ON a.mustahik_id = expected.id
         GROUP BY expected.id HAVING COUNT(a.id) <> 1
       ) THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:application_counts';
    END IF;

    IF (SELECT COUNT(*) FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248) <> 14
       OR EXISTS (
         SELECT 1 FROM generate_series(221, 248) expected(id)
         LEFT JOIN activity_logs a ON a.mustahik_id = expected.id
         GROUP BY expected.id
         HAVING COUNT(a.id) <> CASE (expected.id - 221) % 4 WHEN 0 THEN 0 WHEN 1 THEN 0 ELSE 1 END
            OR (COUNT(a.id) = 1 AND MIN(a.action_type) <> CASE (expected.id - 221) % 4 WHEN 2 THEN 'APPROVE' ELSE 'REJECT' END)
       ) THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:activity_counts';
    END IF;

    FOR v_table IN
      SELECT table_schema, table_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'mustahik_id'
        AND table_name NOT IN ('mustahik', 'applications', 'activity_logs', 'approval_decisions')
    LOOP
      EXECUTE format('SELECT COUNT(*) FROM %I.%I WHERE mustahik_id BETWEEN 221 AND 248', v_table.table_schema, v_table.table_name)
        INTO v_count;
      IF v_count <> 0 THEN
        RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:unreviewed_child:%', v_table.table_name;
      END IF;
    END LOOP;

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
       OR EXISTS (SELECT 1 FROM users WHERE id = 99)
       OR EXISTS (
         SELECT 1 FROM approval_decisions d
         WHERE d.actor_id IS NOT NULL AND d.actor_id <> 99
           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.actor_id)
       ) THEN
      RAISE EXCEPTION 'M1_REMEDIATION_PREFLIGHT_FAILED:actor_manifest';
    END IF;

    RAISE NOTICE 'M1_REMEDIATION_PREFLIGHT_READY:parents=28,applications=28,activity_logs=14,approval_decisions=14,unreviewed_children=0';
    RETURN;
  END IF;

  IF v_status <> 'completed'
     OR (SELECT snapshot_count FROM ops_quarantine.remediation_runs WHERE run_id = v_run_id) <> 84
     OR EXISTS (SELECT 1 FROM mustahik WHERE id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM applications WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM activity_logs WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (SELECT 1 FROM approval_decisions WHERE actor_id = 99)
     OR EXISTS (SELECT 1 FROM approval_decisions WHERE mustahik_id BETWEEN 221 AND 248)
     OR EXISTS (
       SELECT 1 FROM approval_decisions d
       WHERE d.actor_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.actor_id)
     ) THEN
    RAISE EXCEPTION 'M1_REMEDIATION_VERIFY_FAILED:business_rows_or_manifest';
  END IF;

  -- Live applications are gone after remediation; compare references with their immutable snapshot IDs.
  FOR v_table IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      AND table_schema NOT LIKE 'pg_toast%'
      AND column_name = 'application_id'
  LOOP
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I c WHERE c.%I::TEXT IN (SELECT s.before_image->>''id'' FROM ops_quarantine.row_snapshots s WHERE s.run_id = %L AND s.entity_type = ''applications'')',
      v_table.table_schema, v_table.table_name, v_table.column_name, v_run_id
    ) INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'M1_REMEDIATION_VERIFY_FAILED:remaining_application_reference';
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_count FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id;
  IF v_count <> 84
     OR EXISTS (
       SELECT 1 FROM ops_quarantine.row_snapshots
       WHERE run_id = v_run_id AND md5(before_image::TEXT) <> before_image_md5
     )
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id AND entity_type = 'mustahik') <> 28
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id AND entity_type = 'applications') <> 28
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id AND entity_type = 'activity_logs') <> 14
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots WHERE run_id = v_run_id AND entity_type = 'approval_decisions') <> 14
     OR (SELECT COUNT(*) FROM ops_quarantine.row_snapshots s
         WHERE s.run_id = v_run_id AND s.entity_type = 'approval_decisions'
           AND s.before_image->>'actor_id' = '99'
           AND (s.before_image->>'mustahik_id')::INTEGER BETWEEN 221 AND 248
           AND s.before_image->>'actor_name' = 'penyaluran Test User'
           AND s.before_image->>'actor_role' = 'penyaluran'
           AND s.before_image->>'stage' = 'Diajukan'
           AND s.before_image->>'action' IN ('approve', 'reject')) <> 14 THEN
    RAISE EXCEPTION 'M1_REMEDIATION_VERIFY_FAILED:snapshot_integrity';
  END IF;

  RAISE NOTICE 'M1_REMEDIATION_VERIFY_OK:snapshots=84,approval_snapshots=14';
END
$m1_verify$;

COMMIT;
