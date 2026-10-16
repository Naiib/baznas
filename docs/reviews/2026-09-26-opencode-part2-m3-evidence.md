# BAZNAS Mustahik P0 — Part 2 Evidence Report: M3 Task 13 Case Read Model and Workspace API

**Date & Time**: 2026-09-26 07:35 UTC  
**Workspace**: `/home/multica-agent/workspaces/baznas-p0-part1/work-m3`  
**Branch**: `codex/opencode-m3-task13`  
**Execution Context**: OpenCode CLI session (`ses_f244834a1ffe9vj5WBNSkl9X0M`, `multica-agent`), model `router9/gemini-3.8-flash-medium`.  
**Scope Boundary**: M3 Task 13 Case Progress, Capabilities, Chronological History, and Workspace API verified against isolated synthetic PostgreSQL 16. No production deployment, no production DDL, and no mutation of `PENYALURAN_P0_ENABLED` (remains false).

---

## 1. Core Invariants & Pin Integrity

1. **Migration 001 Bytes Pinned**:
   - File: `server/migrations/20260913_001_mustahik_p0.sql`
   - SHA-256: `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`
   - Verified via: `sha256sum server/migrations/20260913_001_mustahik_p0.sql`
   - Result: Exactly byte-identical.
2. **Production Hold**:
   - Production VPS (`baznas.muhammadrofiq.my.id`), Caddy, Docker Compose, and production databases remain completely untouched.
   - `PENYALURAN_P0_ENABLED` is not toggled; production remains in legacy mode.
   - No push or merge to remote origin.
3. **Database Isolation**:
   - Isolated PostgreSQL 16 service `baznas-m1-synthetic-pg16-20260926` at `127.0.0.1:55439`.
   - Databases used: `baznas_m1_legacy_test`, `baznas_m1_remediation_test`, and `baznas_m2_migrated_test`.

---

## 2. Changes Implemented in Task 13

1. **`server/penyaluran-p0/case-read-model.js`**:
   - Implemented `getP0CaseWorkspace(mustahikId, actor, db)` and `getP0CaseWorkspace({ actor, db }, mustahikId, meta)`.
   - Case-level authorization before projections (`assertCaseScope` enforcing `mustahik_case_assignments` restriction for non-admins).
   - Truthful nulls: completely eliminates fake scores (`overall_score`), guessed SLA (`sla`), and fabricated completeness percentages (`completeness`).
   - Strict privacy masking: NIK masked (`3201************`), phone masked (`0812****7890`), bank account masked (`**** 1234`).
   - One chronological unified timeline: combines artifact approvals, approval decisions, activity logs, access events, payments, recipient confirmations, system receipts, archives, and restores.
   - Fail-closed missing-schema readiness: converts PostgreSQL relation-missing errors into `503 SCHEMA_NOT_READY`.
   - Full support for `legacy_reconciliation` cases: serves reconciliation banners and blocks routine mutations.
2. **`server/penyaluran-p0/routes.js`**:
   - Mounted `GET /api/penyaluran/mustahik/:id/workspace` with `authenticateToken`, routeId validation, and sanitized error mapping.
3. **`server/repository.js`**:
   - Exported `getP0CaseWorkspace` for repository consumers.
4. **`server/penyaluran-p0-test-helpers.js`**:
   - Added `artifact_access_events` table declaration in `createP0TestDatabase`.
5. **Fresh Test Suites Added**:
   - `server/penyaluran-p0-read-model.test.js`: 16 comprehensive unit and integration tests.
   - `server/penyaluran-p0-read-model.challenge.js`: 15 adversarial challenge tests covering input boundary tampering, header tampering, cryptographic signature corruption, and anti-slop audit.
   - `server/penyaluran-p0-segregation.challenge.test.js`: 9 segregation challenge tests covering multi-stage approval separation, creator prohibition, and privilege elevation prevention.
   - `server/m3-workspace-postgres16.test.js`: Live PostgreSQL 16 integration tests verifying real foreign keys, case assignments, privacy masking, and fail-closed schema readiness.

---

## 3. Live PostgreSQL 16 & Backend Test Results

Total tests executed across all 14 test suites: **180 passed, 0 failed, 0 skipped**.

### Detailed Suite Breakdown
1. `server/m1-forced-failure-rollback.test.js`: **1 passed** (Live PostgreSQL 16)
2. `server/m1-legacy-fixture-seed.test.js`: **4 passed**
3. `server/m1-production-remediation.test.js`: **4 passed** (Live PostgreSQL 16)
4. `server/migration-parity.test.js`: **11 passed** (Live PostgreSQL 16)
5. `server/penyaluran-p0-migration-runner.test.js`: **46 passed**
6. `server/penyaluran-p0-migration.test.js`: **11 passed** (Live PostgreSQL 16)
7. `server/migration-checksum-portability.test.js`: **1 passed**
8. `server/penyaluran-p0-legacy.test.js`: **40 passed**
9. `server/penyaluran-p0-adversarial.challenge.js`: **18 passed**
10. `server/m2-legacy-control-field-regression.test.js`: **2 passed** (Live PostgreSQL 16)
11. `server/penyaluran-p0-read-model.test.js`: **16 passed**
12. `server/penyaluran-p0-read-model.challenge.js`: **15 passed**
13. `server/penyaluran-p0-segregation.challenge.test.js`: **9 passed**
14. `server/m3-workspace-postgres16.test.js`: **2 passed** (Live PostgreSQL 16)

---

## 4. Final M3 Verdict: **GO (M3 ACCEPTED — PROCEED TO M4)**

All criteria for Milestone 3 (Task 13) are 100% satisfied:
- Case workspace read model implemented with truthful nulls, anti-slop guarantees, privacy masking, chronological history, and segregation enforcement.
- Live PostgreSQL 16 testing verified against isolated service (`baznas-m1-synthetic-pg16-20260926`).
- Zero test failures, zero test skips.
- Production environment untouched.
