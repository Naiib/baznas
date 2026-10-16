# M6 Logical Restore Rehearsal Fix

**Date:** 2026-09-27 (Asia/Jakarta)
**Branch:** `codex/opencode-m5-task19`
**Starting revision:** `deffaba`
**Scope:** Synthetic PostgreSQL 16 rehearsal and evidence corrections only.

## Root cause

The previous script cloned databases with `CREATE DATABASE ... TEMPLATE`, so it did not exercise a logical backup archive or restore. It used fixed database names and dropped them before setup, had no explicit synthetic-container identity guard or cleanup path, and only compared Mustahik and PPD hashes. The runbook's row-count query selected `mustahik` twice from the same database. The dated verification report also described an Express `fetch` API test as browser UAT and named a stale candidate SHA.

## Changes

- The M6 entrypoint now invokes a dedicated logical restore runner. It requires `P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16=1`, checks the exact container name, image, running state, loopback port mapping, and PostgreSQL 16 server version before creating databases.
- Each run creates uniquely named source/restored databases and an archive file derived from the generated run token. The script uses `pg_dump -Fc`, checks the archive TOC with `pg_restore -l`, and restores with `pg_restore --exit-on-error`. Cleanup drops only databases created by that run and removes its exact temporary archive.
- Preservation checks capture every pre-migration source column and compare row counts/SHA-256 hashes across independent source and restored connections for all 11 legacy tables, then repeat after migrations.
- Added behavioral guard/name/manifest tests. Corrected the runbook restore instructions and the dated verification report's restore, browser-UAT, and readiness/SHA claims.

## TDD evidence

- **RED:** copied the new test file into a temporary directory without its implementation and ran `node --test-isolation=none --test /tmp/m6-tdd-red-20260927/server/m6-rehearsal.test.js`. Exit 1, `ERR_MODULE_NOT_FOUND` for `scripts/m6-rehearsal-core.js` (the expected missing implementation). The temporary copy was removed.
- **GREEN:** `node --test-isolation=none --test server/m6-rehearsal.test.js` — 3 tests, 3 passed, 0 failed.

## Synthetic logical restore evidence

Executed the final entrypoint with `P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16=1` against container `baznas-m1-synthetic-pg16-20260926` (`postgres:16-alpine`, PostgreSQL `160015`, container ID prefix `df83c9a1f876`). Docker access was unavailable to `multica-agent`, so the guarded command ran as the authorized SSH root account; Git operations remained under `multica-agent`. The runner verified the synthetic container before any database creation.

- Source database: `m6_rehearsal_20260926_b329d58c_source`
- Restored database: `m6_rehearsal_20260926_b329d58c_restored`
- Archive: `/tmp/m6_rehearsal_20260926_b329d58c_source.dump` inside the synthetic container
- `pg_dump -Fc` succeeded; `pg_restore -l` listed 12 `TABLE DATA` entries; `pg_restore --exit-on-error` completed into the separate restored database.
- Independent source/restored hashes matched before migration. After migrations, all 11 source-column projections matched the source connection. Both disposable databases and the archive were cleaned.

| Legacy table | Rows | SHA-256 |
|---|---:|---|
| `mustahik` | 1 | `b60cce004d17d4c5821021375bd8453e691232205f043af840e519beb134522b` |
| `applications` | 1 | `7e6caa3784b504a4f4774fbc44b289e31331a44b9413282946d675d6f032ffd5` |
| `assessments` | 2 | `674bc999b6a37d0611bbd69b221e8d8af37471606946ad5d9aebe6d46f05f60c` |
| `mpzis` | 1 | `1de14431e9cfa7af305ec3f757547d55ad133cfc4e08a04888bca6703046fe48` |
| `ppd` | 1 | `1623b4d9ed99a2d24dfa274a7ac993aec17f03062cd4f3101cfe3c38823500b0` |
| `documents` | 1 | `3db7f73c309f24ab054e8b0baa3541b99a31f3651892745902507c7674175c5d` |
| `approval_decisions` | 1 | `f002047762927e1afffa8c95b2bb053bfbd68590588504de5d2d1b290acd97e6` |
| `activity_logs` | 2 | `be31e03d73877695abe24f892201b8804fbfac8673610b55d8d573874ef922af` |
| `wa_logs` | 1 | `9e561c5e9c4621c567569fe3588f5759c6d77f6187137933c4ab251d4faa168e` |
| `ppd_payments` | 1 | `fc8f278d076af995588c2855eb931d6e847ee7800cf8021752c1a01226ef06cc` |
| `recipient_confirmations` | 1 | `dc8109cbd718ec40e6a3b2e652fa7eb216a588d424283919b2d7e0b15641ad57` |

Dry-run output was `orphans: 1`, `duplicate_identifiers: 0`, and `invalid_amounts: 0`. The fixture includes one global `System Export` activity-log row with `mustahik_id=NULL`, which contributes the orphan count; it is synthetic evidence, not a production result. `in_flight_legacy_cases` was 1 for the active fixture case. Migrations `20260913_001`, `20260919_002`, and `20260919_003` applied; the ledger checksums matched the migration files. The runner's final success marker was emitted after all table comparisons.

## Test results

- `node --check scripts/rehearse-m6-migration.js` and `node --check scripts/rehearse-m6-logical-restore.js` — passed.
- `node --test-isolation=none --test server/m6-rehearsal.test.js` — 3 passed.
- `node --test-isolation=none --test server/penyaluran-p0-e2e.test.js` — 2 passed. This is the HTTP API harness, not browser UAT.
- `node --test-isolation=none --test server/migration-parity.test.js` — 1 passed, 10 skipped because `P0_TEST_DATABASE_URL` was not set. The standalone logical rehearsal above independently ran against synthetic PostgreSQL 16.

## Changed files

- `scripts/m6-rehearsal-core.js`
- `scripts/rehearse-m6-logical-restore.js`
- `scripts/rehearse-m6-migration.js`
- `server/m6-rehearsal.test.js`
- `docs/operations/mustahik-p0-runbook.md`
- `docs/operations/mustahik-p0-verification.md`
- This review report.

## Remaining gates

Browser UAT, production Docker staging, and the requested independent review remain separate gates and are not claimed as passed. No production DB, Compose file, feature flag, deployment, push, or merge was touched.


## Review follow-up: cleanup and identifier hardening

**Review baseline / tested commit:** `cf1c293cb9e77d9cd5be3a6e4436a046ebe7e1de`. The changes in this follow-up were tested as a working-tree diff on that baseline. Because this report is committed with the changes, it does not claim a self-referential final SHA; resolve the committed candidate with `git rev-parse HEAD` in this worktree.

The review findings were confirmed. Cleanup used sequential awaits in `finally`, so a pool/client close, terminate, or drop error could skip subsequent DB and archive cleanup. Hash queries quoted catalog column names by concatenation without escaping embedded double quotes. The manifest test only checked a subset and a minimum count.

The fix adds independent best-effort attempts for each client close, backend termination, database drop, archive removal, and admin close. Each failure is retained with its operation label; failures are surfaced as an `AggregateError` (alongside the original rehearsal error when present), never silently swallowed. Database identifiers remain constrained by the generated-name allowlist. Catalog identifiers use PostgreSQL double-quote escaping; the hash-query builder restricts table names to the exact preservation manifest and requires the `id` column. Tests now assert the exact 11-table set, escaping/rejection behavior, deterministic/change-sensitive hashes, and that all cleanup actions run despite several injected failures.

### RED/GREEN and verification

- **RED:** `node --test-isolation=none --test server/m6-rehearsal.test.js` failed before implementation because `m6-rehearsal-core.js` did not yet export `buildLegacyHashQuery` (`SyntaxError: The requested module ... does not provide an export named 'buildLegacyHashQuery'`).
- **GREEN:** the same command passed all 6 tests (0 failed).
- **Syntax:** `node --check scripts/m6-rehearsal-core.js`, `node --check scripts/rehearse-m6-logical-restore.js`, and `node --check server/m6-rehearsal.test.js` passed.
- **HTTP API E2E:** `node --test-isolation=none --test server/penyaluran-p0-e2e.test.js` — 2 passed, 0 failed. This remains an API harness, not browser UAT.
- **Migration parity:** `node --test-isolation=none --test server/migration-parity.test.js` — 1 passed, 10 skipped because `P0_TEST_DATABASE_URL` was unset.

### Fresh synthetic rehearsal

Re-ran the guarded entrypoint with `P0_M6_REHEARSAL_ALLOW_SYNTHETIC_PG16=1` against only `baznas-m1-synthetic-pg16-20260926` (`postgres:16-alpine`, PostgreSQL `160015`, container ID prefix `df83c9a1f876`). The generated databases were `m6_rehearsal_20260926_a9f60154_source` and `m6_rehearsal_20260926_a9f60154_restored`; the generated in-container archive was `/tmp/m6_rehearsal_20260926_a9f60154_source.dump`.

`pg_dump -Fc` succeeded; `pg_restore -l` found 12 `TABLE DATA` entries; `pg_restore --exit-on-error` restored into the separate target. Independent source/restored projections matched all 11 tables before migration and after the three migrations; source hashes remained unchanged. The run reported dry-run counts `orphans: 1`, `duplicate_identifiers: 0`, `invalid_amounts: 0`, and `in_flight_legacy_cases: 1`. Cleanup logs confirmed both databases were dropped; archive removal was attempted by the runner. The runner emitted its success marker only after the comparisons and before cleanup.

### Remaining gates

No browser UAT, production Docker staging, or independent review is claimed. The migration-parity tests requiring `P0_TEST_DATABASE_URL` remain skipped. No production DB, Compose file, feature flag, deployment, push, or merge was touched.
