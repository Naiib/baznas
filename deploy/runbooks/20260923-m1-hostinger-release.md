# Mustahik P0 M1 Hostinger Production Gate

This procedure covers the approved synthetic-record remediation and PostgreSQL migrations 001–003 on Hostinger. It keeps `PENYALURAN_P0_ENABLED=false` throughout. It does not deploy the P0 application or enable P0 routes.

The data-changing SQL is [20260923-m1-production-remediation.sql](20260923-m1-production-remediation.sql). Run its read-only aggregate preflight and post-commit verifier from [20260923-m1-production-remediation.verify.sql](20260923-m1-production-remediation.verify.sql). The test coverage is in `server/m1-production-remediation.test.js`; run it against a disposable PostgreSQL database before accepting the runbook. Never copy production row contents into the report or terminal transcript.

## Production facts and hold points

- Current Hostinger app release: `b7e2f451363f559aa37386d461884d70197214e4`. Its backend, frontend, and proxy are in Compose project `web_baznas`; PostgreSQL is `web_baznas-postgres-1`.
- At the read-only audit snapshot (2026-09-22 22:25:49 UTC), all four services were healthy, the canonical `/login` returned HTTP 200 with verified TLS, and the backend flag was false. `/readyz` returned 404; do not use it as a health endpoint. The backend remained live and capable of legacy writes, so the snapshot did not establish a write freeze.
- Sanitized DB manifest: 28 target parents; 28 applications; 14 activity logs; 14 approval decisions. All 14 `actor_id=99` decisions are attached to the target range; user 99 is absent. All four duplicate NIK groups consist of seven target rows each, with no group extending beyond the target set. No other current public table with `mustahik_id` had matching rows. These counts are starting assertions, not permission to proceed if the live preflight differs.
- A separate read-only cross-schema audit at the same snapshot found zero non-public foreign keys referencing `public.mustahik`, `public.applications`, or `public.ppd`, and zero matching target-range rows in non-public relations with a `mustahik_id` column. The remediation SQL's dynamic catalog checks are scoped to `current_schema()` (`public`), so Gate 2 repeats this check independently.
- The current `public.schema_migrations` table is absent. Do not assume any M1 migration has already run.
- The app DB role was observed to be database owner and superuser and to own all nine extant required legacy tables. Verify the effective role and privileges again before the change.
- Preserve production checkout state. Its active release contains ` M deploy/docker/Caddyfile` and `?? deploy/docker/Caddyfile.pre_m3.bak`. Do not reset, clean, overwrite, or recreate the proxy to remove this drift.
- Compose configuration is split: app services use the active release directory, while PostgreSQL was created from `/opt/web_baznas/repo/compose.production.yml`. Do not run `down`, recreate PostgreSQL, change its volume, or assume the two Compose files are interchangeable. Use the named PostgreSQL container for database commands.
- PostgreSQL data is on named volume `web_baznas_postgres_data`. Backend and PostgreSQL share `web_baznas_data`; the database alias is `postgres`. The backend is also on `web_baznas_web` at `172.20.0.2`, which is the current dirty Caddyfile's upstream. The backend's PostgreSQL password is mounted read-only at `/run/secrets/postgres_password` from `/opt/web_baznas/secrets/postgres_password.txt`.
- The production database does not have `public.digest(bytea,text)`. The remediation SQL uses PostgreSQL's built-in `md5(text)` only as an accidental-corruption check; the backup SHA-256 remains the cryptographic anchor. Do not add a pgcrypto dependency for this procedure.

## Gate 0: pin and stage reviewed inputs

1. On the reviewed source checkout, verify `git rev-parse HEAD` equals `568f7ea5c0b6f9d7bd100cc9968d383881d9346a`. Create the transfer archive from that immutable commit with only the approved backend paths; this keeps `.git`, unrelated files, and workspace data out of the VPS transfer:

   ```bash
   set -Eeuo pipefail
   m1_commit=568f7ea5c0b6f9d7bd100cc9968d383881d9346a
   [[ "$(git rev-parse HEAD)" == "$m1_commit" ]]
   archive="/tmp/m1-${m1_commit}.tar"
   git archive --format=tar "$m1_commit" -- Dockerfile.backend .dockerignore package.json package-lock.json server > "$archive"
   tar -tf "$archive" | awk -F/ '($1 != "Dockerfile.backend" && $1 != ".dockerignore" && $1 != "package.json" && $1 != "package-lock.json" && $1 != "server") { exit 1 }'
   sha256sum "$archive"
   ```

   Record the archive SHA-256 locally, transfer this archive, and require the VPS copy to have the same SHA-256 before extraction. Create and verify a new empty directory, then extract and compare both the path manifest and file bytes:

   ```bash
   set -Eeuo pipefail
   m1_commit=568f7ea5c0b6f9d7bd100cc9968d383881d9346a
   archive="/tmp/m1-${m1_commit}.tar"
   m1_release_dir="/opt/web_baznas/releases/$m1_commit"
   mkdir -m 0755 -- "$m1_release_dir"
   [[ -d "$m1_release_dir" && -z "$(find "$m1_release_dir" -mindepth 1 -print -quit)" ]] || { echo "M1 extraction directory is not empty" >&2; exit 1; }
   tar -xf "$archive" -C "$m1_release_dir"
   diff -u \
     <(tar -tf "$archive" | sed 's#/$##' | LC_ALL=C sort) \
     <(find "$m1_release_dir" -mindepth 1 -printf '%P\n' | LC_ALL=C sort)
   tar -df "$archive" -C "$m1_release_dir"
   ```

   The normalized manifest comparison reports both missing archive paths and extra destination paths; `tar -df` checks the archived file contents. Quoting keeps the directory handling safe if its path contains spaces. Also run `sha256sum` on the three extracted migration files and require the pinned values shown in Gate 3. Treat the archive as immutable; stop on any path difference, byte mismatch, or non-empty destination.
2. Stage the two remediation SQL files and this procedure as read-only operational artifacts outside both `/opt/web_baznas/repo` and the active release tree, for example under `/opt/web_baznas/ops/m1-568f7ea/`. Record SHA-256 for each staged artifact and compare them with the reviewed local files. The standalone remediation test is in the pinned commit's `server/` tree; stage its reviewed copy separately under the ops directory only when needed for a disposable rehearsal, and verify its SHA-256. Do not put production row snapshots in these files.
3. Check free space for a full database copy plus the custom-format dump. Abort if there is not enough space. The rollback copy below is a second database in the same PostgreSQL cluster; the dump file is an independent recovery artifact.
4. Record `docker compose ps`, all service health states, the app release SHA, current `PENYALURAN_P0_ENABLED`, the backend network address, the PostgreSQL volume, and the two dirty Caddy paths. No DNS, Caddy, Compose, or feature-flag changes belong to M1.

## Gate 1: freeze writes, back up, and prove the rollback copy

1. Stop only the active backend container and keep it stopped through remediation, migrations, and verification:

   ```bash
   docker stop web_baznas-backend-1
   ```

   Leave PostgreSQL, frontend, and proxy running. Do not recreate the backend container. Confirm there are no remaining application writers, no sessions with assigned transaction IDs, and no idle-in-transaction sessions. Stop if any unexpected database client remains. Repeat this check immediately before each data-changing step.

2. Create and verify a custom-format dump using the named production PostgreSQL container. This direct command avoids the old-host branch in `deploy/docker/db-backup.sh` and avoids selecting a different Compose file:

   ```bash
   set -Eeuo pipefail
   stamp=$(date -u +%Y%m%d_%H%M%S)
   backup_dir=/opt/web_baznas/backups
   install -d -m 700 "$backup_dir"
   umask 077
   dump="$backup_dir/baznas_db_pre_m1_${stamp}.dump"
   docker exec web_baznas-postgres-1 pg_dump \
     -U baznas_user -d baznas_db -Fc --no-owner --no-acl > "$dump"
   chmod 600 "$dump"
   sha256sum "$dump" > "$dump.sha256"
   sha256sum -c "$dump.sha256"
   docker exec -i web_baznas-postgres-1 pg_restore -l < "$dump" >/dev/null
   ```

   Preserve the exact dump path and SHA-256 in the release evidence. Do not print database rows.

3. Create a fresh logical rollback database by cloning the quiesced original. Using the existing database as the template preserves its database settings, extensions, schema, data, and object ownership without relying on in-place `pg_restore --clean` semantics:

   ```bash
   restore_db="baznas_pre_m1_${stamp}"
   [[ "$restore_db" =~ ^[a-z0-9_]+$ ]]
   docker exec web_baznas-postgres-1 createdb \
     -U baznas_user --maintenance-db=postgres --template=baznas_db \
     --owner=baznas_user "$restore_db"
   ```

   `CREATE DATABASE ... TEMPLATE` requires no remaining connections to `baznas_db`; verify this before the command. Compare aggregate pre-change counts, database settings, critical table ownership, and absence of the P0 migration ledger between `baznas_db` and `restore_db`. Keep `restore_db` untouched until the release is accepted. If template cloning fails, abort; do not substitute the current in-place restore script as an equivalent rollback.

## Gate 2: run read-only manifest, then remediation

First run this cross-schema aggregate with the backend stopped. It emits only counts; all counts must be zero. The identifier loop inspects relation names internally but does not print them or any row values. It checks legacy `mustahik_id` values plus un-FK'd `application_id` references to the 28 target applications and `ppd_id` references to any PPD rows attached to the target cases (the expected target PPD count remains zero):

```bash
docker exec -i web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d baznas_db <<'SQL'
SELECT count(*)::int AS nonpublic_fk_count
FROM pg_constraint con
JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
JOIN pg_class child_rel ON child_rel.oid = con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
WHERE con.contype = 'f'
  AND (parent_ns.nspname, parent_rel.relname) IN
      (('public','mustahik'),('public','applications'),('public','ppd'))
  AND child_ns.nspname <> 'public';

DO $m1$
DECLARE
  r record;
  n bigint;
  total_rows bigint := 0;
  matching_tables integer := 0;
  link_rows bigint := 0;
  matching_link_columns integer := 0;
  parent_table text;
BEGIN
  FOR r IN
    SELECT ns.nspname, cl.relname
    FROM pg_class cl
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = cl.oid
    WHERE cl.relkind IN ('r','p','f')
      AND ns.nspname <> 'public'
      AND ns.nspname <> 'information_schema'
      AND ns.nspname !~ '^pg_'
      AND a.attname = 'mustahik_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE mustahik_id BETWEEN 221 AND 248', r.nspname, r.relname) INTO n;
    IF n > 0 THEN
      matching_tables := matching_tables + 1;
      total_rows := total_rows + n;
    END IF;
  END LOOP;

  FOR r IN
    SELECT ns.nspname, cl.relname, a.attname
    FROM pg_class cl
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = cl.oid
    WHERE cl.relkind IN ('r','p','f')
      AND ns.nspname <> 'public'
      AND ns.nspname <> 'information_schema'
      AND ns.nspname !~ '^pg_'
      AND a.attname IN ('application_id','ppd_id')
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    parent_table := CASE r.attname WHEN 'application_id' THEN 'applications' ELSE 'ppd' END;
    EXECUTE format(
      'SELECT count(*) FROM %I.%I c JOIN public.%I p ON p.id::TEXT = c.%I::TEXT WHERE p.mustahik_id BETWEEN 221 AND 248',
      r.nspname, r.relname, parent_table, r.attname
    ) INTO n;
    IF n > 0 THEN
      matching_link_columns := matching_link_columns + 1;
      link_rows := link_rows + n;
    END IF;
  END LOOP;

  RAISE NOTICE 'NONPUBLIC_MATCHING_TABLES=%, NONPUBLIC_MATCHING_ROWS=%, NONPUBLIC_MATCHING_LINK_COLUMNS=%, NONPUBLIC_MATCHING_LINK_ROWS=%', matching_tables, total_rows, matching_link_columns, link_rows;
END
$m1$;
SQL
```

Require `nonpublic_fk_count=0`, `NONPUBLIC_MATCHING_TABLES=0`, `NONPUBLIC_MATCHING_ROWS=0`, `NONPUBLIC_MATCHING_LINK_COLUMNS=0`, and `NONPUBLIC_MATCHING_LINK_ROWS=0`. The link audit covers `application_id` and `ppd_id` even when no foreign key exists. If any count is nonzero, stop and expand the approved remediation/quarantine scope; do not continue based on the earlier audit snapshot.

Run the read-only aggregate preflight using the pinned PostgreSQL container and staged file:

```bash
docker exec -i web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d baznas_db < /opt/web_baznas/ops/m1-568f7ea/20260923-m1-production-remediation.verify.sql
```

It must emit `M1_REMEDIATION_PREFLIGHT_READY` and match the expected aggregate parent/child, duplicate-group, actor, and direct application-reference state. It intentionally emits no names, NIKs, file numbers, or actor snapshots. Views, materialized views, or foreign tables exposing `mustahik_id`, `application_id`, or `ppd_id` fail closed. The read-only verifier does not inspect arbitrary same-schema foreign-key children of applications; the transactional remediation SQL checks those under locks and aborts on an unexpected child before any DML. Recursive descendants are outside this runbook's reviewed scope. Any precondition failure, unexpected additional child, mismatch, lock timeout, or new write is a hard stop. Do not adjust the SQL to make a failed manifest pass.

Only after the preflight passes and the backend remains stopped, execute the single-transaction remediation:

```bash
docker exec -i web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d baznas_db < /opt/web_baznas/ops/m1-568f7ea/20260923-m1-production-remediation.sql
```

The SQL takes transaction-scoped advisory and relation locks, rechecks the manifest under those locks, snapshots the approved parent and child rows into owner-only `ops_quarantine` tables, nulls the 14 invalid actor references, and deletes only the checked target parents and their reviewed children. Any SQL error before commit rolls the entire remediation transaction back. Quarantine snapshots contain sensitive source values; keep access restricted to the database owner and never export them into logs or reports.

Then run the same read-only verifier again. Require `M1_REMEDIATION_VERIFY_OK` and a completed manifest with the expected snapshot count. Stop on any discrepancy.

## Gate 3: apply migrations with the flag still false

The production Compose service hardcodes `PENYALURAN_P0_ENABLED=false`. Normal application startup only invokes the migration runner when the flag is exactly true, and true would expose P0 routes. The runner CLI supports `--dry-run` only, not applying migrations. Therefore keep the backend stopped and invoke the reviewed runner from an isolated one-shot container. Do not change the Compose environment or start the app with the flag enabled.

Build a uniquely tagged image from the immutable M1 source directory so the current `web_baznas-backend` image tag is not replaced. Set `m1_commit` to the reviewed full SHA pinned in Gate 0; stop if it differs from that exact SHA:

```bash
: "${m1_commit:=568f7ea5c0b6f9d7bd100cc9968d383881d9346a}"
[[ "$m1_commit" == 568f7ea5c0b6f9d7bd100cc9968d383881d9346a ]] || { echo "M1 commit differs from reviewed source SHA" >&2; exit 1; }
m1_src="/opt/web_baznas/releases/$m1_commit"
m1_image="web_baznas-m1-runner:$m1_commit"
docker build -t "$m1_image" -f "$m1_src/Dockerfile.backend" "$m1_src"
```

Before connecting to PostgreSQL, verify that the built image contains exactly the three reviewed migration files with the pinned SHA-256 checksums. The root `.dockerignore` has a broad `*.sql` pattern and an explicit `server/migrations/*.sql` exception to state the intended packaging scope. Treat the names and checksums observed inside the image as authoritative proof that the expected migration bytes were packaged:

```bash
docker run --rm --entrypoint node "$m1_image" --input-type=module -e '
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = "/app/server/migrations";
const expected = new Map([
  ["20260913_001_mustahik_p0.sql", "d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38"],
  ["20260919_002_p0_receipt.sql", "3db9f368e075ee3f76ae73854d4d4811543263ee71703b9c5e7afb1972a8a4bd"],
  ["20260919_003_p0_contract_parity.sql", "0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c"],
]);
const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
if (JSON.stringify(names) !== JSON.stringify([...expected.keys()].sort())) {
  throw new Error(`Unexpected migration files in image: ${names.join(", ")}`);
}
for (const [name, checksum] of expected) {
  const bytes = await readFile(path.join(dir, name));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== checksum) throw new Error(`Migration checksum mismatch: ${name}`);
  console.log(`${name} ${actual}`);
}
console.log("M1_IMAGE_MIGRATIONS_VERIFIED");
'
```

Require exit code 0 and `M1_IMAGE_MIGRATIONS_VERIFIED` before proceeding. Any missing, additional, or changed migration is a hard stop; do not run the one-shot migration container.

Run only `runPendingMigrations()` and the schema verifier. The one-shot mounts only the database password read-only, joins only the data network, and starts no API listener:

```bash
db_secret=/opt/web_baznas/secrets/postgres_password.txt
db_secret_uid=$(stat -c '%u' "$db_secret")
db_secret_gid=$(stat -c '%g' "$db_secret")
docker run --rm --network web_baznas_data \
  --user "$db_secret_uid:$db_secret_gid" \
  --mount "type=bind,src=$db_secret,dst=/run/secrets/postgres_password,readonly" \
  -e NODE_ENV=production \
  -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME=baznas_db -e DB_USER=baznas_user \
  -e DB_PASSWORD_FILE=/run/secrets/postgres_password \
  -e PENYALURAN_P0_ENABLED=false \
  "$m1_image" node --input-type=module -e '
import { bootstrapSecrets } from "./server/secrets.js";
bootstrapSecrets();
const { getPool } = await import("./server/db.js");
const { runPendingMigrations, verifyP0Schema } = await import("./server/penyaluran-p0/migration-runner.js");
const pool = getPool();
try {
  await runPendingMigrations({ pool, migrationsDir: "/app/server/migrations" });
  await verifyP0Schema({ isPg: true, query: (sql, params = []) => pool.query(sql, params) });
  console.log("M1 migrations and schema verification complete");
} finally {
  await pool.end();
}
'
```

`getPool()` marks the PostgreSQL pool with `isPg=true`; `bootstrapSecrets()` loads the password from the mounted file before pool creation. The runner applies each migration in its own transaction and validates checksums. A failing migration rolls back that migration only; earlier versions may already be committed. The post-run verifier must confirm the full expected ledger and critical schema contract. Leave `PENYALURAN_P0_ENABLED=false`.

## Gate 4: verify, resume the existing backend, and monitor

Before starting the backend, require all of the following:

- remediation post-commit verifier passes and the quarantine manifest is complete;
- `schema_migrations` contains exactly versions 001, 002, and 003 with the pinned checksums from `server/penyaluran-p0/migration-runner.js`, no extras;
- the full `verifyP0Schema()` contract passes, including required constraints, indexes, triggers, and foreign keys;
- P0 remains disabled and the pre-M1 rollback database remains unchanged;
- no unexpected database writers/sessions exist.

Resume the same stopped container; do not recreate the service or proxy:

```bash
docker start web_baznas-backend-1
```

Verify Docker health, the backend `/api/health`, canonical `/login` HTTP 200 with valid TLS, flag false, and backend web-network address still `172.20.0.2` so the preserved Caddy upstream remains valid. Keep the rollback DB and dump until separate release acceptance.

Use the existing container's built-in health probe and filter only the feature-flag value from container metadata (do not print the full environment):

```bash
docker inspect -f '{{.State.Health.Status}}' web_baznas-backend-1
docker exec web_baznas-backend-1 wget -qO- http://127.0.0.1:3001/api/health >/dev/null
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' web_baznas-backend-1 | grep -Fx 'PENYALURAN_P0_ENABLED=false'
curl -fsS --output /dev/null --write-out '%{http_code}\n' https://baznas.muhammadrofiq.my.id/login
```

The final command uses curl's normal certificate verification; require output `200`. The internal health request must exit zero, the first command must say `healthy`, and the filtered flag check must match exactly.

## Rollback triggers and database-name swap

Trigger rollback on a remediation postcondition failure, any checksum/migration error, incomplete or unexpected ledger, failed full schema verifier, or failed backend health after resume. Keep the backend stopped. A transaction failure in an individual migration rolls back that migration; it does **not** undo prior committed migration versions or the already committed remediation. The standard `deploy/docker/db-restore.sh` is not a schema rollback: `pg_restore --clean --if-exists` only cleans objects present in the archive and leaves new post-dump objects that were absent from the archive.

Use the untouched same-cluster rollback DB created in Gate 1. First confirm the backend is stopped, the clone still has baseline aggregate state and no migration ledger, and all sessions to both `baznas_db` and the clone have ended. From a maintenance connection to `postgres`, terminate any remaining target DB connections only after confirming the writer freeze, then recheck that there are zero sessions to either database. Rename databases with separate `psql -c` calls (do not run `ALTER DATABASE` inside a transaction or combine the two statements):

```bash
failed_db="baznas_failed_${stamp}"
[[ "$restore_db" =~ ^[a-z0-9_]+$ && "$failed_db" =~ ^[a-z0-9_]+$ ]]
docker exec web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='baznas_db' AND pid <> pg_backend_pid();"
docker exec web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d postgres -c \
  "ALTER DATABASE baznas_db RENAME TO ${failed_db};"
docker exec web_baznas-postgres-1 psql -X -v ON_ERROR_STOP=1 \
  -U baznas_user -d postgres -c \
  "ALTER DATABASE ${restore_db} RENAME TO baznas_db;"
```

Database identifiers above must be generated solely from the UTC timestamp shown in Gate 1 and validated against `^[a-z0-9_]+$`; never interpolate arbitrary input. The first rename preserves the failed database for diagnosis. The second makes the verified pre-M1 database available under the original configured name without editing `.env` or recreating the backend. If the second rename fails, leave the backend stopped, confirm which database names exist, and retry only the missing rename; if necessary, rename `failed_db` back to `baznas_db` after verifying that name is free. Do not drop either database or restore over one in place.

After a successful swap, verify `baznas_db` still has the baseline aggregate counts and no `schema_migrations` ledger. Start the existing backend container, verify it reconnects to `baznas_db` with the flag false, confirm its web-network address remains `172.20.0.2`, and recheck backend health and canonical TLS. Keep the failed database, backup dump, and logs for review; do not clean them up as part of rollback.

If the PostgreSQL container or its data volume is unavailable/corrupt, this same-volume clone is not sufficient. Preserve the custom-format dump and restore it to a separately provisioned PostgreSQL 16 instance/volume; do not remove or recreate `web_baznas_postgres_data` as an improvised recovery step.

## Disposable rehearsal evidence required

Before production execution, rehearse on isolated PostgreSQL 16 with synthetic rows only. Run the standalone SQL test against a dedicated disposable database (not production and not a shared development database), with `P0_TEST_DATABASE_URL` set so the test is not skipped:

```bash
P0_TEST_DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:5432/<disposable_test_db>' \
  node --test server/m1-production-remediation.test.js
```

For the legacy upgrade case, create a new empty disposable PostgreSQL database named `m1_legacy_upgrade_test`. Set `P0_TEST_DATABASE_URL` through the approved local secret or environment mechanism to that database; the helper rejects missing URLs, non-PostgreSQL URLs, and database names that do not end in `_test` before connecting. From the repository root, apply the parity test's existing synthetic fixture:

```bash
: "${P0_TEST_DATABASE_URL:?Set P0_TEST_DATABASE_URL to the disposable _test database}"
node server/m1-legacy-fixture-seed.js --apply
```

The helper reads only the bounded `legacyFixtureSql` literal, normalizes LF/CRLF source endings, refuses unexpected markers, removes the fixture's NULL activity-log row, and sets `activity_logs.mustahik_id NOT NULL`. It emits only a success marker and never prints SQL or the connection URL. Keep this synthetic seed database separate from the database used by the remediation SQL test. It contains only the parity fixture data and is not a copy of production rows.

Then exercise the deployment and rollback sequence:

1. Verify the M1 remediation preflight passes for the intended shape, fails closed on identity/count drift, and proves the transaction leaves no partial quarantine/data changes on failure.
2. Verify successful remediation snapshots every approved parent/child row and leaves the expected postconditions; rerun behavior must match the runbook's completed-manifest policy.
3. Apply migrations through the same one-shot runner with the P0 flag false; prove exact checksum ledger, full schema verifier, and no API listener.
4. Force a failure after at least one earlier migration commits; execute the same two-step DB rename rollback; prove restored aggregate state equals the pre-change baseline, no migration ledger remains, failed database is retained, and the old backend reconnects successfully with the flag false.
5. Verify the custom dump checksum/listing and test its restore into a fresh isolated DB. This validates the portable dump independently of the same-cluster template clone. (Note: Custom-format `pg_dump -Fc` and `pg_restore -l` execution uses the production PostgreSQL container via `docker exec web_baznas-postgres-1` as defined in Gate 1. In non-root development/rehearsal environments without Docker socket access or host PostgreSQL client binaries, database-level rollback is validated via Step 4 using native PostgreSQL `CREATE DATABASE ... TEMPLATE` and `ALTER DATABASE ... RENAME TO ...`, while Step 5 remains a mandatory operator hold point on the Hostinger VPS before Gate 2 remediation).

Record test commands, PostgreSQL version, exit codes, aggregate assertions, SQL artifact hashes, and rollback outcome. Do not include row values, NIKs, names, file numbers, actor snapshots, passwords, or secret contents.
