# BAZNAS Mustahik P0 — Part 1 Evidence Report: M2 Task 12 Legacy Freeze, Retention, and Reconciliation

**Date & Time**: 2026-09-26 05:25 UTC  
**Workspace**: `/home/multica-agent/workspaces/baznas-p0-part1/work-m2`  
**Branch**: `codex/opencode-m2-task12`  
**Base Commit**: `24d9469ea458dac85a5b8f3593a4e5fd0e1d93f8` (`docs(m1): record live PostgreSQL 16 test and rehearsal evidence with M1 GO verdict`)  
**Execution Context**: OpenCode CLI session (`ses_f244834a1ffe9vj5WBNSkl9X0M`, `multica-agent`), model `router9/gemini-3.8-flash-medium`.  
**Scope Boundary**: M2 Task 12 legacy freeze, retention, and reconciliation on top of accepted M1, verified on isolated synthetic PostgreSQL 16. No entry into M3–M6, no production deployment, no production DDL, and no mutation of `PENYALURAN_P0_ENABLED` (remains false).

---

## 1. Scope, Invariants, and Pinned Provenance

### Core Invariants
1. **Migration 001 Bytes Pinned**:
   - File: `server/migrations/20260913_001_mustahik_p0.sql`
   - SHA-256: `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`
   - Verified via: `sha256sum server/migrations/20260913_001_mustahik_p0.sql`
2. **Production Hold**:
   - Production VPS (`baznas.muhammadrofiq.my.id`), Caddy, Compose, and live databases remain completely untouched.
   - `PENYALURAN_P0_ENABLED` is not toggled; production remains in legacy mode.
   - No push or merge to remote origin.
3. **Database Isolation**:
   - Isolated PostgreSQL 16 service `baznas-m1-synthetic-pg16-20260926` at `127.0.0.1:55439`.
   - Dedicated database `baznas_m2_legacy_test` used exclusively for M2 legacy migration and reconciliation tests.

---

## 2. Remediation and Defect Resolutions

During M2 Task 12 regression verification on top of accepted M1, the following issues were investigated, remediated, and verified:

| Item | Component | Issue Description | Resolution & Verification |
| :--- | :--- | :--- | :--- |
| **R1** | `frontend-next/test/setup.ts` | Node 22 jsdom runtime incompatibility causing `localStorage is not available for this origin` error during Vitest execution. | Added standard in-memory storage polyfill to `setup.ts`. Vitest suite now passes 35/35 test files (219 tests). |
| **R2** | `server/db.js` | Missing P0 workflow and archival columns in SQLite adapter `MUSTAHIK_COLUMNS` (`workflow_mode`, `workflow_version`, `legacy_status_snapshot`, `p0_reconciled_at`, `p0_reconciled_by`, `archived_at`, `archived_by_id`, `archive_reason`). | Added columns from historical commit `d8914a0` to `MUSTAHIK_COLUMNS`. Unblocked `server/uploads.integration.test.js`. |
| **R3** | `server/penyaluran-p0-completion-routes.test.js` | POSIX vs Windows path separator assumption in temporary artifact root test fixture causing test failure on Linux. | Replaced string split with `path.join(os.tmpdir(), ...)` and proper cross-platform path handling. |
| **R4** | `server/access-control.integration.test.js` | Test set `process.env.DATABASE_URL` to an unreachable address without cleanup, polluting subsequent test executions in shared processes. | Added `before` hook `await initDb()` and `after` hook restoration of `originalDatabaseUrl`. |
| **R5** | `server/repository.js` | Concurrent webhook callback race condition in `findOrCreateMuzakkiForTransaction` when two requests simultaneously attempt to insert a new Muzakki. | Added catch-and-retry logic on unique constraint violation (`23505`/`SQLITE_CONSTRAINT`), querying existing record before retrying. |
| **R6** | `server/penerimaan-task11-hardening.regression.test.js` | Residual fixture from concurrent order test with date `2026-08-25` was not cleaned up, skewing date-bounded report freshness assertions in subsequent tests. | Added explicit fixture cleanup in `after` block of concurrent callback test. |
| **R7** | `server/penerimaan-hardening-regression.test.js` | Gap 3 test asserted audit view returns audit events, but on a fresh database no audit events were seeded prior to the assertion. | Seeded initial audit event in Gap 3 test to guarantee deterministic self-containment. |
| **R8** | `server/db.js`, `server/repository.js`, `server/index.js` | Legacy intake `POST /api/mustahik` and `PUT /api/mustahik/:id` previously allowed arbitrary caller payloads to set/mutate P0 control columns (`workflow_mode`, `workflow_version`, `archived_at`, `p0_reconciled_at`, etc.). | Exported `P0_CONTROL_COLUMNS` and `LEGACY_MUSTAHIK_WRITABLE_COLUMNS`; strictly allow-listed legacy writable columns in `createMustahik`, `updateMustahik`, and Express handlers; added unit & live PostgreSQL 16 regression suites. |

---

## 3. Fresh Verification Evidence Ledger

### A. Pinned Migration Checksum
```bash
sha256sum server/migrations/20260913_001_mustahik_p0.sql
```
- **Output**: `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38  server/migrations/20260913_001_mustahik_p0.sql`
- **Result**: Match exact pinned hash.

### B. Isolated PostgreSQL 16 Migration Parity
```bash
P0_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55439/baznas_m2_legacy_test" node --test server/migration-parity.test.js server/penyaluran-p0-migration.test.js
```
- **Results**:
  - `server/migration-parity.test.js`: 11 passed, 0 failed, 0 skipped.
  - `server/penyaluran-p0-migration.test.js`: 11 passed, 0 failed, 0 skipped.
  - **Total**: 22 passed, 0 failed, 0 skipped.

### C. Isolated PostgreSQL 16 M1 Production Remediation
```bash
P0_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55439/baznas_m1_remediation_test" node --test server/m1-production-remediation.test.js
```
- **Results**: 4 passed, 0 failed, 0 skipped.

### D. Penyaluran P0 Legacy Freeze, Retain, and Adversarial Suites
```bash
node --test server/penyaluran-p0-legacy.test.js server/penyaluran-p0-adversarial.challenge.js
```
- **Results**:
  - `server/penyaluran-p0-adversarial.challenge.js`: 18 tests passed, 0 failed, 0 skipped.
  - `server/penyaluran-p0-legacy.test.js`: 40 tests passed, 0 failed, 0 skipped.
  - **Total**: 58 tests passed, 0 failed, 0 skipped.

### D.1 Isolated PostgreSQL 16 Legacy Control Column Integrity Regression
```bash
M2_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55439/baznas_m2_migrated_test" node --test server/m2-legacy-control-field-regression.test.js
```
- **Results**:
  - `server/m2-legacy-control-field-regression.test.js`: 2 tests passed, 0 failed, 0 skipped.
  - Verifies both direct repository `createMustahik`/`updateMustahik` and HTTP `POST`/`PUT /api/mustahik` strictly allow-list legacy business columns, strip/ignore P0 control columns (`workflow_mode`, `workflow_version`, `archived_at`, `p0_reconciled_at`, etc.), and preserve schema defaults on live PostgreSQL 16.

### E. Penyaluran P0 Domain Suites (Full P0 Suite)
All 18 Penyaluran P0 domain and adversarial suites executed:
- `penyaluran-p0-adversarial.challenge.js`
- `penyaluran-p0-assessment.test.js`
- `penyaluran-p0-completion-routes.test.js`
- `penyaluran-p0-completion.test.js`
- `penyaluran-p0-crypto.test.js`
- `penyaluran-p0-draft.test.js`
- `penyaluran-p0-errors.test.js`
- `penyaluran-p0-guards.test.js`
- `penyaluran-p0-history.test.js`
- `penyaluran-p0-idempotency.test.js`
- `penyaluran-p0-legacy.test.js`
- `penyaluran-p0-mpzis-routes.test.js`
- `penyaluran-p0-mpzis.test.js`
- `penyaluran-p0-permissions.test.js`
- `penyaluran-p0-ppd-receipt.test.js`
- `penyaluran-p0-ppd-routes.test.js`
- `penyaluran-p0-ppd.test.js`
- `penyaluran-p0-state-guards.test.js`
- **Total**: 168 tests passed, 0 failed, 0 skipped.

### F. Penerimaan Hardening & Integration Suites
```bash
node --test server/penerimaan-*.test.js server/uploads.integration.test.js
```
- `server/penerimaan-export.test.js`: 4 passed, 0 failed, 0 skipped.
- `server/penerimaan-hardening-regression.test.js`: 17 passed, 0 failed, 0 skipped.
- `server/penerimaan-provider-secrets.test.js`: 6 passed, 0 failed, 0 skipped.
- `server/penerimaan-report-access.test.js`: 17 passed, 0 failed, 0 skipped.
- `server/penerimaan-task11-hardening.regression.test.js`: 14 passed, 0 failed, 0 skipped.
- `server/uploads.integration.test.js`: 12 passed, 0 failed, 0 skipped.
- **Total**: 70 tests passed, 0 failed, 0 skipped.

### G. Frontend Suite
```bash
cd frontend-next && npm test && npm run typecheck && npm run build
```
- **Vitest Unit & Component Tests**: 35 test files passed, 219 tests passed, 0 failed.
- **TypeScript Typecheck**: Exit code 0 (zero errors).
- **Next.js Production Build**: Compiled successfully in 3.1s; 14 static/dynamic routes generated.

---

## 4. Dual Subagent Independent Reviews

### Spec & Flow Review
- **Session ID**: `ses_f23dffa45ffeV8l8QzonjxQ0ZO`
- **Reviewed**: `server/penyaluran-p0/legacy-reconciliation.js`, `server/penyaluran-p0-legacy.test.js`, `server/penyaluran-p0-adversarial.challenge.js`, `server/penyaluran-p0/routes.js`, `server/db.js`.
- **Verifications**:
  - Legacy write freeze contract (`assertLegacyWriteAllowed`, `classifyLegacyCase`, `isPenyaluranP0Enabled`): PASS
  - Hard delete disabled (HTTP 405 `HARD_DELETE_DISABLED`): PASS
  - Legacy write endpoints return 410 for P0 cases and post-cutover: PASS
  - Archive/restore commands require reason (20-1000 chars), expected_status, expected_version, idempotency_key: PASS
  - Reconciliation lifecycle (classification, stage-by-stage evidence validation, semantic checks, actor separation): PASS
- **Overall Determination**: **PASS**

### Security & Integrity Review
- **Session ID**: `ses_f23ddfe6affewOXs5HisjzyhNw`
- **Reviewed**: Schema triggers, append-only constraints, concurrency guards, actor separation, PostgreSQL 16 migration tests.
- **Verifications**:
  - Migration 001 bytes checksum matches `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`: PASS
  - Isolated PostgreSQL 16 migration parity tests (22/22 passed, 0 skipped, 0 failed): PASS
  - Immutability & Append-only contracts (`p0_reject_immutable_mutation`, `p0_reject_payment_mutation`, activity log append-only): PASS
  - Hard delete permanently disabled on mustahik cases (405): PASS
  - Foreign keys restrictive retention on mustahik cases: PASS
  - Idempotency key replay vs tampering detection: PASS
  - Optimistic concurrency version checks (`expected_version`): PASS
  - Fail-closed behavior on missing permissions, invalid roles, cross-division boundaries: PASS
- **Overall Determination**: **PASS**

---

## 5. Final Disposition

- **Gate 0 Observation**: Verified untouched production baseline.
- **M1 Parity & Migration**: Accepted and intact.
- **M2 Task 12 Contract**: Verified complete with zero skips on isolated PostgreSQL 16.
- **Frontend & Backend Test Status**: 100% passing across all suites.
- **Final Verdict**: **M2 TASK 12 VERIFIED & READY (GO)**.
