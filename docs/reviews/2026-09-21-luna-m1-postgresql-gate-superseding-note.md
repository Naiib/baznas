# Mustahik P0 M1 PostgreSQL Gate — Superseding Evidence Note

Date: 2026-09-21
Branch: `codex/mustahik-p0-digitalization`
Scope: M1 migration-contract and PostgreSQL-gate evidence only.

This note supersedes contradictory M1 wording that described every activity log as Mustahik-bound and claimed a completed live-PostgreSQL gate. The approved contract permits global activity logs: `activity_logs.mustahik_id` is nullable, and `NULL` is valid for system/report events. Migration 003 therefore drops legacy `NOT NULL`; it does not reassign global rows to an arbitrary Mustahik. `ppd_payments.verification_status` is fail-closed: legacy `NULL` rows block migration, while a successful migration enforces `DEFAULT 'pending'` and `NOT NULL`.

The user-owned report `D:\BAZNAS\data-center\.agents\MILESTONE_1_REPORT_FOR_SOL.md` is not edited by this branch. Its old sections 35-55, 70-89, and 101-108 are explicitly **SUPERSEDED** and are not valid M1 acceptance evidence because they contain the Mustahik-1/`NOT NULL` activity-log claims and unsupported 8-of-8-live-PostgreSQL claims.

## M1 implementation evidence

- `server/migrations/20260919_003_p0_contract_parity.sql` now checks all four required objects before any contract DDL and raises explicit `P0_MIGRATION_PRECONDITION_FAILED:<object>` errors. A missing relation or column cannot receive a version-003 ledger row.
- `server/migration-parity.test.js` now exercises the actual migration runner against disposable random PostgreSQL schemas for missing `activity_logs`, missing `activity_logs.mustahik_id`, missing `ppd_payments`, and missing `ppd_payments.verification_status`.
- The real-runner NULL-status test proves that an earlier `activity_logs` nullability change rolls back together with defaults, foreign-key/status-check constraints, the legacy `NULL` row, and the version-003 ledger insert.
- Migration 001 remains byte-identical: Git blob ID (SHA-1) `f6b832af887aa9eff3f3da1c2d5d4976bd96e3ef`.

## Sanitized verification

An isolated PostgreSQL 16 `postgres:16-alpine` container was created on the authorized Hostinger host with a unique name, a database ending `_test`, tmpfs-only storage, and a loopback-only published port. It was not production data and was not a clone. The temporary credential is intentionally omitted.

- Implementer-reported pre-fix RED reproduction used the original HEAD version of migration 003 against a disposable `_test` schema and the actual migration runner: exit 1 with `RED_EXPECTED_OLD_003_FALSE_SUCCESS`, proving that a missing `ppd_payments.verification_status` could be committed as version 003 while the earlier `activity_logs` nullability DDL remained applied.
- Independent PG16 re-run: parity 10/10 passed and focused migration tests 50/50 passed, with zero skipped and no production writes.
- `node --test server/migration-parity.test.js`: exit 0; 10 passed, 0 failed, 0 skipped.
- `node --test server/penyaluran-p0-migration-runner.test.js server/penyaluran-p0-migration.test.js`: exit 0; 50 passed, 0 failed, 0 skipped.
- Implementer-reported `node server/penyaluran-p0/migration-runner.js --dry-run`: exit 0; all six dry-run counts were zero on the empty synthetic database after migrations.
- Implementer-reported safe backend suite: exit 0; 128 passed, 0 failed, 0 skipped.
- Implementer-reported frontend tests/typecheck/build: passed in the same isolated worktree; no frontend files are changed by M1.
- `git diff --check`, JavaScript syntax check, and changed-line high-confidence secret scan: passed.

## Production deployment gate

The production `web_baznas-postgres-1` container was inspected read-only. The independent reviewer queried all schemas in the configured application database `baznas_db` and found no `schema_migrations` relation anywhere in that database. Other databases were not queried, so compatibility elsewhere remains unknown. This is evidence of an unresolved deployment/checksum gate, not evidence that version 003 is safe to deploy. No production migration, restart, compose/flag edit, data read, or deploy was performed.

Production deployment still requires an explicit release/checksum decision; this note does not authorize production migration, restart, flag enablement, or deploy.
