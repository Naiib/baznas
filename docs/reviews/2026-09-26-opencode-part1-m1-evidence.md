# BAZNAS Mustahik P0 — Part 1 Evidence Report: Gate 0 and M1

**Date & Time**: 2026-09-26 04:15 UTC  
**Workspace**: `/home/multica-agent/workspaces/baznas-p0-part1/work`  
**Execution Context**: OpenCode CLI session (`ses_f244834a1ffe9vj5WBNSkl9X0M`, `multica-agent`), model `router9/gemini-3.8-flash-medium`.  
**Scope Boundary**: Part 1 complete (Gate 0 read-only observations, M1 code integrity, and live synthetic PostgreSQL 16 readiness/rehearsal verification). No execution of M3–M6, no production deployment, no production DDL, and no mutation of `PENYALURAN_P0_ENABLED`.

---

## 1. Original Checkpoint and Restored-File List

### Checkpoint Provenance
- Initial local M1 branch: `codex/opencode-part1-m1` restored via Git bundle.
- Base commit at pre-flight bundle start: `29a3642aeaf3671511e0844ef1ccf974d286e9ff` (`docs: pin M1 release archive manifest`).
- Local main checkpoint in bundle: `7aa54b7820f0b2c5fa1eb49c20067d65e80c20df`.
- GitHub origin main at preflight: `2bbb1b400772d2466a251c9203b9d22d3b7f8127`.
- Pinned release archive commit: `568f7ea5c0b6f9d7bd100cc9968d383881d9346a`.

### Preserved Restored Files
Five local modified/untracked M1 files were overlaid from the pre-flight environment and preserved without data loss or unreviewed reset:
1. `deploy/runbooks/20260923-m1-hostinger-release.md` (modified: corrected `createdb --maintenance-db=postgres` template option and added synthetic legacy fixture seed instructions).
2. `deploy/runbooks/20260924-m1-disposable-rehearsal-checkpoint.md` (untracked: records 2026-09-24 disposable rehearsal progress and 2026-09-25 pause notes).
3. `docs/handoffs/2026-09-24-m1-pause-checkpoint.md` (untracked: records account switch checkpoint).
4. `server/m1-legacy-fixture-seed.js` (untracked: CRLF-safe synthetic fixture extractor with `--apply` mode and URL safety assertions).
5. `server/m1-legacy-fixture-seed.test.js` (untracked: 3 unit tests covering CRLF normalization, boundary parsing, and test-database URL safety).

Additional historical review documents preserved:
- `docs/reviews/2026-09-20-antigravity-m1-m3-readonly-review.md`
- `docs/reviews/2026-09-21-antigravity-m1-m3-remediation-rereview.md`

---

## 2. Branch, Full Commit SHAs, and Commits

- **Active Branch**: `codex/opencode-part1-m1`
- **Initial HEAD**: `29a3642aeaf3671511e0844ef1ccf974d286e9ff`
- **Committed Changes on Branch**:
  1. `9e596e0add1cf0fdf1d38545009dc27b5e1ece7c`: `feat(m1): persist CRLF-safe legacy fixture seed helper and rehearsal runbook fixes`
  2. `497043f1442c73eb6c9f75b29b2a5d9ff051063b`: `docs(m1): add Part 1 Gate 0 and M1 evidence report and checkpoint`
  3. `7b797280ac797d52362dfafaba5c0042fb3c2e8a`: `test(m1): allow dynamic disposable database names and clean rollback in remediation harness`
  4. `24d9469ea458dac85a5b8f3593a4e5fd0e1d93f8`: `docs(m1): record live PostgreSQL 16 test and rehearsal evidence with M1 GO verdict`
  5. `1192a882eaa572f1ecfcb887221e0296dc5fb2bf`: `fix(m1): tighten fixture target guard and reconcile release runbook and evidence`
  6. `39ece078805bfdd7548632a15fa4647e45a03027`: `fix(m1): tighten fixture loopback guard, automate forced-failure rollback rehearsal, and update evidence ledger`
  7. `635442a98e82647702f928a30cb142b93e433ea1` (and final working HEAD): `docs(m1): resolve review findings with honest conditional verdict, test breakdown, and commit citation`
- **Current Working State**: All tests green (78/78, 0 skipped, 0 failed), fail-closed loopback guards enforced, forced post-commit failure rename rollback proven on PostgreSQL 16, and evidence ledger updated with honest conditional verdict.

---

## 3. Exact Changed Files

Compared against initial bundle HEAD `29a3642aeaf3671511e0844ef1ccf974d286e9ff`:
- `deploy/runbooks/20260923-m1-hostinger-release.md`
- `deploy/runbooks/20260924-m1-disposable-rehearsal-checkpoint.md`
- `docs/handoffs/2026-09-24-m1-pause-checkpoint.md`
- `docs/handoffs/2026-09-26-part1-checkpoint.md`
- `docs/reviews/2026-09-20-antigravity-m1-m3-readonly-review.md`
- `docs/reviews/2026-09-21-antigravity-m1-m3-remediation-rereview.md`
- `docs/reviews/2026-09-26-opencode-part1-m1-evidence.md`
- `server/m1-forced-failure-rollback.test.js`
- `server/m1-legacy-fixture-seed.js`
- `server/m1-legacy-fixture-seed.test.js`
- `server/m1-production-remediation.test.js`

*Note*: No migration files (`server/migrations/*.sql`) or core schema files were altered.

---

## 4. Gate 0 Observations

Observations conducted strictly using non-privileged, read-only queries:
- **Timestamp**: 2026-09-26T03:41:38.692Z
- **Public Port 80 Check**:
  - `curl -sS -I http://127.0.0.1/up` -> `HTTP/1.1 200 OK` (Caddy reverse proxy healthy).
- **Production Public API Health**:
  - `curl -k -sS --resolve baznas.muhammadrofiq.my.id:443:127.0.0.1 https://baznas.muhammadrofiq.my.id/api/health` ->
    `{"status":"ready","checks":{"database":"ready","database_engine":"postgresql"}}`.
- **Live Production Feature Flag**:
  - Production database and configuration maintain `PENYALURAN_P0_ENABLED=false` (absent or false in production container env).
- **Production Checkout SHA**:
  - `/opt/web_baznas/repo` commit: `54bfaeada478e9afc8d1bbb9ebefd88aeb5f7dec`.
- **Gate 0 Disposition**: Gate 0 nonprivileged observation baseline complete; production remains untouched.

---

## 5. Prior M1 Findings and Dispositions

| Finding ID & Title | Historical Description | Current Disposition & Evidence |
| :--- | :--- | :--- |
| **M1-1**: Activity Log NULL Drop vs Rewrite | Review flagged contradiction: Antigravity report claimed rewriting NULL to Mustahik 1 with NOT NULL, while actual migration dropped NOT NULL. | **ADDRESSED / SUPERSEDED**: Confirmed in `20260919_003_p0_contract_parity.sql` and `server/schema.sql` that dropping NOT NULL is intentional to support global activity logs. |
| **M1-2**: Missing Preconditions in Migration 003 | Silent skipping via `IF EXISTS` without failing closed if expected legacy tables were missing. | **ADDRESSED**: `20260919_003_p0_contract_parity.sql` lines 10–38 enforce explicit fail-closed checks (`P0_MIGRATION_PRECONDITION_FAILED:*`). |
| **M1-3**: Legacy Snapshot Nullability Inconsistency | Parity test used an in-memory nullability normalizer for `snapshot_json` without documented justification. | **ADDRESSED**: Documented in `server/migration-parity.test.js` (`normalizeIntentionalLegacySnapshotNullability`) as an intentional legacy upgrade defense. |
| **M1-4**: Trailing Blank Line | Whitespace error at end of `server/migration-parity.test.js`. | **ADDRESSED**: Cleaned; verified with `git diff --check` returning exit code 0. |
| **M1-5**: Overcounted Live PG Tests & Rollback Scope | Prior reviews noted tests were skipped without `P0_TEST_DATABASE_URL` and rollback test used synthetic migrations. | **ADDRESSED**: Live tests executed against PostgreSQL 16 with 0 skips; full P0 migration runner rollback/replay tested against real PostgreSQL. |
| **M1-6**: Migration 003 Checksum Stability | Checksum drifted across earlier remediation revisions. | **RESOLVED & PINNED**: Checksum pinned in runbook to `0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c`. |
| **M1-7**: Fixture Helper URL Pipe Vulnerability | Earlier fixture script piped or passed database URLs via CLI argv or shell pipelines. | **RESOLVED**: `server/m1-legacy-fixture-seed.js` implements `--apply` consuming `P0_TEST_DATABASE_URL` via process environment, enforcing protocol and `_test` suffix before pool creation. Verified by independent review. |

---

## 6. Fresh Test Commands and Results (Live PostgreSQL 16)

Executed against operator-provisioned isolated service `baznas-m1-synthetic-pg16-20260926` on `127.0.0.1:55439` (PostgreSQL 16.15):

1. **`node --test server/m1-legacy-fixture-seed.test.js`**:
   - Exit code: `0`
   - Passed: `4` | Failed: `0` | Skipped: `0`
   - Covers: CRLF/LF normalization, boundary errors, absent/non-test/non-PostgreSQL URL rejection, non-loopback host rejection, connected database safety guards, and unmigrated database assertion.
2. **`node --test server/m1-production-remediation.test.js`** (against `baznas_m1_remediation_test`):
   - Exit code: `0`
   - Passed: `4` | Failed: `0` | Skipped: `0`
   - Covers: Contract validation, harness URL safety, link columns rejection on views/matviews/foreign tables, 28 exact-target row removal, 84 snapshots created in quarantine, and safe rerun idempotency.
3. **`node --test server/migration-parity.test.js`** (against `baznas_m1_legacy_test`):
   - Exit code: `0`
   - Passed: `11` | Failed: `0` | Skipped: `0`
   - Covers: Fresh vs upgraded introspection identity, stable snapshot inventory, preflight fail-closed on dirty data, negative derived income vs disbursement rules, evidence triggers immutability, global null activity logs, migration 003 fail-closed preconditions, runner rollback on 003 reconciliation failure, legacy activity log nullability upgrade, and non-vacuous transaction rollback/replay on live PostgreSQL.
4. **`node --test server/penyaluran-p0-migration-runner.test.js`**:
   - Exit code: `0`
   - Passed: `46` | Failed: `0` | Skipped: `0`
   - Covers: Byte-level portability, lock acquisition/release, error preservation, checksum mismatch fail-closed behavior, dry-run aggregations, schema verifier missing table/column checks, and startup validation.
5. **`node --test server/penyaluran-p0-migration.test.js`** (against `baznas_m1_legacy_test`):
   - Exit code: `0`
   - Passed: `11` | Failed: `0` | Skipped: `0`
   - Covers: Introspection identity between fresh and upgraded schemas, migration retention rules, deterministic revision mapping, and DDL triggers.
6. **`node --test server/migration-checksum-portability.test.js`**:
   - Exit code: `0`
   - Passed: `1` | Failed: `0` | Skipped: `0`
   - Covers: Git archive / checkout CRLF and LF byte preservation.
7. **`node --test server/m1-forced-failure-rollback.test.js`** (against `baznas_m1_legacy_test`):
   - Exit code: `0`
   - Passed: `1` | Failed: `0` | Skipped: `0`
   - Covers: Forced failure after migration 001 commits, halting on migration 002, two-step database rename rollback (`ALTER DATABASE ... RENAME TO ...`), restored baseline aggregate verification (mustahik row count, schema_migrations absence, workflow_mode absence), retained failed database forensics verification (migration 001 preserved), and synthetic old backend reconnect with `PENYALURAN_P0_ENABLED=false`.

**Total M1 Test Suite**: 78 tests passed, 0 failed, **0 skipped** across all 7 test files (4 + 4 + 11 + 46 + 11 + 1 + 1 = 78).

---

## 7. PostgreSQL 16 Synthetic Database Proof and Rehearsal Evidence

### Isolated Infrastructure
- Container: `baznas-m1-synthetic-pg16-20260926`
- PostgreSQL Version: `PostgreSQL 16.15 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit`
- Endpoint: `127.0.0.1:55439` (synthetic trust auth, loopback only, tmpfs storage)
- Target Databases: `baznas_m1_legacy_test`, `baznas_m1_remediation_test`

### Rehearsal Results
1. **Synthetic Legacy Fixture Seed**:
   - `node server/m1-legacy-fixture-seed.js --apply` executed against `baznas_m1_legacy_test`.
   - Result: `M1_LEGACY_FIXTURE_SEEDED` emitted. All 12 legacy tables seeded with `activity_logs.mustahik_id NOT NULL` pre-upgrade shape.
2. **Template Database Cloning**:
   - Executed: `CREATE DATABASE baznas_m1_legacy_clone_test WITH TEMPLATE baznas_m1_legacy_test OWNER postgres`.
   - Result: SUCCESS. All 12 tables and data perfectly cloned without in-place schema mutation.
3. **One-Shot Migration Runner & Verification**:
   - Cloned fresh database `baznas_m1_oneshot_test` from template.
   - Pre-migration check: `schema_migrations` table absent (`has_ledger: false`).
   - `runPendingMigrations({ pool, migrationsDir })` applied:
     - `20260913_001` (`d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`)
     - `20260919_002` (`3db9f368e075ee3f76ae73854d4d4811543263ee71703b9c5e7afb1972a8a4bd`)
     - `20260919_003` (`0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c`)
   - Replay check: Re-running `runPendingMigrations` completed idempotently (applied count: 0, ledger count: 3).
   - Full schema check: `verifyP0Schema(pool)` returned SUCCESS (`ok: true`, all 37 constraints, 20 indexes, 10 triggers, and 45 foreign keys validated).
4. **Forced Post-Commit Failure Two-Step Database Rename Rollback & Synthetic Backend Reconnect Rehearsal**:
   - Automated via: `server/m1-forced-failure-rollback.test.js` executed directly on PostgreSQL 16 (`127.0.0.1:55439`).
   - Setup: Created live test database `baznas_m1_forced_fail_live_test` from template `baznas_m1_legacy_test`.
   - Baseline verification: Verified matching `mustahik` count (2 rows), confirmed `schema_migrations` absent (`has_ledger: false`), and confirmed `workflow_mode` absent.
   - Pre-migration backup clone: Created `baznas_m1_forced_fail_backup_test` via native `CREATE DATABASE ... TEMPLATE`.
   - Forced post-commit failure execution:
     - Migration 001 (`20260913_001_mustahik_p0.sql`) executed and committed successfully into the live database.
     - Migration 002 was forced to fail with a fatal SQL error, aborting the migration runner.
     - Partial migration state in live DB: migration 001 was committed in `schema_migrations` ledger (`checksum: d414bc0e...`), and `mustahik.workflow_mode` existed. Migration 002 rolled back its own transaction.
   - Two-step database rename rollback execution:
     - Terminated active connections to live and backup databases.
     - Step 1: `ALTER DATABASE baznas_m1_forced_fail_live_test RENAME TO baznas_m1_forced_fail_retained_test;`
     - Step 2: `ALTER DATABASE baznas_m1_forced_fail_backup_test RENAME TO baznas_m1_forced_fail_live_test;`
   - Verification of restored live DB:
     - Aggregate state equals pre-change baseline: `mustahik` row count exactly 2.
     - Migration ledger absent: `schema_migrations` table does not exist.
     - P0 schema absent: `mustahik.workflow_mode` column does not exist.
   - Verification of retained failed DB (`baznas_m1_forced_fail_retained_test`):
     - Preserved untouched with committed migration `20260913_001` for post-mortem forensics.
   - Synthetic backend reconnect:
     - Reconnected to restored live database with `PENYALURAN_P0_ENABLED=false`.
     - Successfully queried legacy mustahik record `{ id: 1, name: 'Parity fixture', status: 'Persetujuan MPZIS', file_no: 'P0-PARITY' }`.

---

## 8. Migration Checksum, Rollback, and Restore Evidence

### Checksum Verification
- `server/migrations/20260913_001_mustahik_p0.sql`:
  `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38` (**MATCHES PIN EXACTLY**)
- `server/migrations/20260919_002_p0_receipt.sql`:
  `3db9f368e075ee3f76ae73854d4d4811543263ee71703b9c5e7afb1972a8a4bd` (**MATCHES PIN EXACTLY**)
- `server/migrations/20260919_003_p0_contract_parity.sql`:
  `0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c` (**MATCHES PIN EXACTLY**)

### Rollback & Precondition Semantics Evidence
- Advisory lock `P0_MIGRATION_LOCK_KEY = 20260913001` verified in live tests.
- Single transaction per migration with rollback and client destruction verified.
- Fail-closed preconditions verified on invalid legacy records and missing contract tables.
- Same-cluster logical rollback (`CREATE DATABASE ... TEMPLATE` and two-step database rename swap `ALTER DATABASE ... RENAME TO ...`) proved on PostgreSQL 16 via `server/m1-forced-failure-rollback.test.js` after mid-migration failure (commit 001, abort 002).
- **Runbook Step 5 Status (Custom-format `pg_dump -Fc` / `pg_restore -l`)**:
  - The development/rehearsal environment is non-root and lacks both host `pg_dump`/`pg_restore` client binaries and Docker socket access (`permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`).
  - Therefore, custom dump generation and restoration was **NOT executed** in synthetic development.
  - Step 5 is explicitly classified as an **Operator Pre-Remediation Hold Point on the Hostinger VPS at Gate 1** (executed via `docker exec web_baznas-postgres-1 pg_dump -Fc ...`).
  - Native database-level rollback (Step 4) operates independently of portable dumps and is 100% verified on synthetic PostgreSQL 16.

---

## 9. Reviewer Identities and Findings

1. **Subagent 1 (Session `ses_f243a94e8ffexQabgY7mjTQ7LI`)**:
   - Scope: Gate 0 requirements analysis and prior review dispositions.
2. **Subagent 2 (Session `ses_f2438bcd7ffefg3cKnZzWczHN7`)**:
   - Scope: M1 DDL, migration runner, schema verifier, and trigger immutability.
3. **Subagent 3 (Session `ses_f2435f446ffezYqGFnU0mRTKbd`)**:
   - Scope: M1 test suite, fixture helper, and URL pipe security review.
4. **Subagent 4 (Session `ses_f241327b8ffevgIUeOCuvnk46H`)**:
   - Scope: Independent code and security review of uncommitted M1 changes (**PASS**).
5. **Subagent 5 (Session `ses_f23fbc4d2ffeMhy8bl3xfe9GO6`)**:
   - Scope: Independent review of `server/m1-production-remediation.test.js` dynamic database inspection and `ROLLBACK` in `finally` (**PASS**).

---

## 10. Unresolved Risks

1. **Production Preflight Legacy Data Quality**:
   - Prior to running migration on production, `collectP0MigrationDryRun` must be executed to confirm zero legacy orphan FKs or duplicate IDs on live rows.
2. **Production Flag Invariant**:
   - `PENYALURAN_P0_ENABLED` must remain `false` until M2 verification and deployment criteria are met.

---

## 11. Final M1 Verdict: **CONDITIONAL GO / GATE 1 OPERATOR HOLD POINT**

All synthetic development and code verification criteria for M1 have been satisfied, while production container execution is explicitly gated on operator hold points:

### Component Verdicts
1. **Synthetic PostgreSQL 16 & Code Artifacts: GO**
   - 100% of M1 live PostgreSQL tests passed (78 passed, 0 skipped, 0 failed across all 7 test suites).
   - Full one-shot migration runner, idempotent replay, and schema verifier proved on PostgreSQL 16 (`baznas-m1-synthetic-pg16-20260926`).
   - Forced post-commit failure (`server/m1-forced-failure-rollback.test.js`) proved: migration 001 committed, migration 002 aborted, two-step database rename rollback executed, baseline aggregate row count restored, migration ledger cleared, failed DB retained for post-mortem forensics, and synthetic legacy backend reconnected cleanly with `PENYALURAN_P0_ENABLED=false`.
   - Migration 001 bytes remain untampered and byte-identical to pinned SHA (`d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`).
   - Strict loopback host enforcement (`isLoopbackHost`) proved rejecting all non-loopback hosts.
2. **Production Release (Gate 1): HOLD POINT / CONDITIONAL (NO-GO for Unconditional Production Run)**
   - The non-root development environment lacks host `pg_dump`/`pg_restore` binaries and Docker socket permissions.
   - Runbook Step 5 (`pg_dump -Fc` / `pg_restore -l`) could not be executed in the synthetic development environment.
   - Therefore, Step 5 is classified as a mandatory **Operator Hold Point on the Hostinger VPS** before Gate 2 live execution.
3. **M2 Task 12 Development: GO**
   - Authorized to continue development and verification of M2 legacy freeze and reconciliation in isolated worktrees (`work-m2`).

---

## 12. What M2 Inherits

1. **Base Commit**: `codex/opencode-part1-m1` final reconciled HEAD (`635442a98e82647702f928a30cb142b93e433ea1`).
2. **Isolated PostgreSQL 16 Service**: `127.0.0.1:55439` maintained active for M2 synthetic database testing.
3. **Release Runbook**: `deploy/runbooks/20260923-m1-hostinger-release.md`.
4. **Handoff Artifacts**: `/home/multica-agent/workspaces/baznas-p0-handoff-m2-20260926/`.
