# BAZNAS Mustahik P0 — Verification Matrix, Rehearsal, and Release Evidence

**Date & Time**: 2026-09-26 08:35 UTC  
**Environment**: Isolated Non-Root Container (`multica-agent`)  
**Target Milestone**: Part 4: M5 (Task 19) & M6 (Task 20)  
**Branch**: `codex/opencode-m5-task19`  
**Evidence status**: Historical matrix from 2026-09-26; current scoped evidence and candidate revision are in the 2026-09-27 review report.

---

## 1. Clean Verification Matrix (Task 20 Step 1)

Every command from the approved verification matrix was executed against disposable local environments and the real synthetic PostgreSQL 16 container (`127.0.0.1:55439`).

| Command | Exit Code | Tests | Pass | Fail | Skip | Duration | Status |
|---|---|---|---|---|---|---|---|
| `node --test [17 safe backend files]` | 0 | 129 | 129 | 0 | 0 | 4.51s | **PASS** |
| `npm --prefix frontend-next test` | 0 | 380 | 380 | 0 | 0 | 66.79s | **PASS** |
| `npm --prefix frontend-next run typecheck` | 0 | - | - | 0 | 0 | 3.12s | **PASS** |
| `npm --prefix frontend-next run build` | 0 | 22 routes | 22 | 0 | 0 | 7.30s | **PASS** |
| `p0:migration:dry-run` | 0 | - | - | 0 | 0 | 0.82s | **PASS** |
| `node --test server/migration-parity.test.js` | 0 | 11 | 11 | 0 | 0 | 11.52s | **PASS** |
| `node --test server/penyaluran-p0-e2e.test.js` | 0 | 2 | 2 | 0 | 0 | 4.58s | **PASS** |

### Verification Artifact Hashes & Integrity
- `server/migrations/20260913_001_mustahik_p0.sql`: `d414bc0e6431fe295c22d4f43838815163e673d902d09698cbc4d20090cc4d38`
- `server/migrations/20260919_002_p0_receipt.sql`: `3db9f368e075ee3f76ae73854d4d4811543263ee71703b9c5e7afb1972a8a4bd`
- `server/migrations/20260919_003_p0_contract_parity.sql`: `0e00e69279cd8c60a26825a6c8650ea6b6e8194df21a154c1464552b8bc0414c`
- `server/fixtures/penyaluran-p0-masked-case.json`: `a4fcf85a3c9be0a5a22bb0b5f88494b79c3a30daee85e197e4113e64259e88bf`

---

## 2. PostgreSQL 16 Logical Restore Evidence Correction

The earlier rehearsal used `CREATE DATABASE ... TEMPLATE`; it did not exercise `pg_dump` or `pg_restore`. Its Mustahik/PPD-only hashes also did not establish preservation for the other collected legacy tables. That evidence is superseded.

A fresh synthetic-only rehearsal is recorded in [the 2026-09-27 M6 logical restore review](../reviews/2026-09-27-m6-logical-restore-fix.md). It used the named PostgreSQL 16 container, a custom-format `pg_dump -Fc`, `pg_restore -l`, and `pg_restore --exit-on-error` into a separate unique database. Independent source/restored connections matched row counts and SHA-256 hashes for all 11 legacy preservation tables, before and after migrations. The temporary databases and archive were cleaned.
Production/staging logical backup and restore remain pending operator execution. Synthetic restore evidence does not satisfy the production backup gate.

The historical synthetic dry-run reported `orphans: 1`, but that was a false positive: the runner treated an allowed global `activity_logs.mustahik_id=NULL` row as an orphan. The regression fix excludes NULL foreign keys while continuing to count unmatched non-NULL IDs.
The 2026-09-27 pg-mem behavioral test shows that one global NULL log plus one dangling non-NULL ID yields `orphans: 1`. This synthetic test is not production data or a production GO; any real non-NULL orphan still requires STOP and reconciliation.

---

## 3. Masked API UAT Harness (Browser UAT Pending)

server/penyaluran-p0-e2e.test.js and `scripts/m6-uat-verification.js` exercise an isolated Express app through Node fetch and a masked fixture. This is API-only evidence. The M6 verifier asserts HTTP 200, database receipt status `ready`, a PDF header and EOF marker, and an exact SHA-256 match to `ppd.receipt_file_sha256`; a failed check exits nonzero.
No browser was driven. Browser UAT, rendered-screen accessibility, and operator workflow checks remain separate pending gates.

- **Stage 1: Case Intake**: Amil intake persona submitted masked Mustahik application. Case initialized in `Diajukan` status (`workflow_mode: 'p0'`).
- **Stage 2: Early Verification**: Status progressed to `Verifikasi Administrasi` and `Survey` through auditable decision kernel.
- **Stage 3: Assessment (F-BPP/02)**: 18 canonical survey fields recorded, submitted by intake surveyor, and approved by independent assessment reviewer (`status: 'accepted'`).
- **Stage 4: MPZIS Approval Stepper (F-BPP/06)**: Form generated and sequentially approved across all 5 distinct approvers (`proposed`, `examined`, `ashnaf_verified`, `responsible_acknowledged`, `approved`).
- **Stage 5: PPD Disbursement (F-PKP/03)**: Ordered RAB lines and supporting document attached. Finance staff completed validation check, and Finance leader granted disbursement approval.
- **Stage 6: Payment Recording & Verification**: Bank transfer transaction number and PDF payment proof uploaded. Distinct finance verifier verified payment.
- **Stage 7: Recipient Confirmation**: Penyaluran field staff recorded on-site recipient confirmation with signed confirmation PDF.
- **Stage 8: Final Completion & System Receipt**: Penyaluran leader executed final case completion (`status: 'Penyaluran Selesai'`). Official system receipt generated asynchronously.
- **Fresh 2026-09-27 API receipt verification**: HTTP `200`; database `receipt_status='ready'`; downloaded bytes passed PDF header/EOF checks; SHA-256 `66e62113a4c8b74da1578abb1b6d215f6c5cd00e786e1448c58ad5390c6e84c7` exactly matched `ppd.receipt_file_sha256`. The API process now exits nonzero for failed status, malformed PDF, unready receipt, or hash mismatch.

---

## 4. Independent Review Findings (Task 20 Step 4)

### Review 1: Specification Compliance, Data Integrity, and Security
- **Assessment**: Pending genuinely independent review. No separate independent review artifact is present for this candidate; internal tests and implementation notes do not constitute independent clearance.

### Review 2: Source-Field and Accessibility Review
- **Assessment**: Pending genuinely independent review and browser verification.
- `P0Accessibility.test.tsx` checks Escape dismissal, focus restoration, and 44px target classes; it does not assert Tab cycling. `IntegrationChallenger.test.tsx` separately tests Tab/Shift+Tab wrapping at component level. Neither establishes rendered/browser UAT, and no independent review artifact is available.

---

## 5. Deployment Boundary & Operator Hold Points (Task 20 Step 7)

### Production Docker Staging Gate: **NO-GO (PENDING OPERATOR ACCESS)**
- **Reason**: The agent runs under the unprivileged `multica-agent` user account without access to the Docker daemon socket (`/var/run/docker.sock`).
- **Required Operator Action**:
  - The operator must run the Docker compose staging rehearsal on the Hostinger VPS or an authorized Docker staging host using the steps outlined in `docs/operations/mustahik-p0-runbook.md`.
  - This review wave passed local synthetic tests and the M6 API receipt harness; operator staging acceptance, browser UAT, independent reviews, and production/staging backup-and-restore remain pending.

### Production Deployment Approval Gate: **HOLD (AWAITING HUMAN APPROVAL)**
- Tested candidate code commit: `8a9ef8a645404551b7267f9289fde867ee05ee19` (the documentation-only review report follows in a separate commit).
- Status: **HOLD / NO-GO for automated deployment**. Browser UAT, operator Docker staging, independent reviews, and production/staging logical backup-and-restore remain pending.
- **NO PRODUCTION WRITES, PUSHES, MIGRATIONS, OR FEATURE-FLAG ENABLINGS HAVE BEEN EXECUTED**.
