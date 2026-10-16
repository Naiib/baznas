# Mustahik P0 M2 Remediation Evidence Ledger

- **Evidence date:** 2026-09-22
- **Branch:** `codex/mustahik-p0-m2-integration`
- **Worktree:** `D:\BAZNAS\data-center\.worktrees\mustahik-p0-m2-integration`
- **Base SHA:** `d197daf058eea6989c21a58aca30ef9f3fe4857c`
- **Reviewed Code SHA:** `cbb59269e62419c33c5027a5f85b7d84817b959a`
- **Code commit:** `fix(penyaluran): harden M2 reconciliation evidence`
- **Repository status:** Code verification complete; production hold remains active.

## 1. Code Range and Changed Files

The exact range `d197daf058eea6989c21a58aca30ef9f3fe4857c..cbb59269e62419c33c5027a5f85b7d84817b959a` contains 12 changed files, as reported by `git diff --name-only`:

- `docs/reviews/2026-09-21-antigravity-m2-remediation-evidence.md`
- `server/bot.js`
- `server/index.js`
- `server/penyaluran-p0-adversarial.challenge.js`
- `server/penyaluran-p0-assessment.test.js`
- `server/penyaluran-p0-legacy.test.js`
- `server/penyaluran-p0-mpzis.test.js`
- `server/penyaluran-p0-test-helpers.js`
- `server/penyaluran-p0/completion-service.js`
- `server/penyaluran-p0/legacy-reconciliation.js`
- `server/penyaluran-p0/permissions.js`
- `server/penyaluran-p0/routes.js`

Range summary: 12 files changed, 3,260 insertions, 248 deletions.

## 2. Verification Results

### Local focused M2 suite

- Command: `node --test --test-concurrency=1 server/penyaluran-p0-legacy.test.js server/penyaluran-p0-adversarial.challenge.js`
- Result: exit 0; 57 tests passed, 0 failed, 0 skipped.

### Local broad non-migration P0 suite

- Command: all `server/penyaluran-p0*.test.js` files found by `rg --files server`, excluding migration tests, run with `node --test --test-concurrency=1`.
- Result: exit 0; 181 tests passed, 0 failed, 0 skipped.

### Real tunneled PostgreSQL focused suite

- Environment: disposable PostgreSQL test database reached through the authorized SSH tunnel.
- Result: 57 tests passed, 0 failed, 0 skipped.

### PostgreSQL 16 parity and migration suites

- `node --test server/migration-parity.test.js`: 10/10 passed.
- `node --test server/penyaluran-p0-migration-runner.test.js server/penyaluran-p0-migration.test.js`: 50/50 passed.

### Synthetic migration dry-run

- Command: `node server/penyaluran-p0/migration-runner.js --dry-run`
- Result: exit 0.
- Output:

  ```json
  {
    "statuses": [],
    "orphans": 1,
    "duplicate_identifiers": 0,
    "invalid_amounts": 0,
    "cascading_foreign_keys": 0,
    "in_flight_legacy_cases": 1
  }
  ```

The `orphans: 1` and `in_flight_legacy_cases: 1` values are synthetic fixture facts from this dry-run, not production counts.

### Teardown and hygiene

- Temporary PostgreSQL 16 container teardown: complete.
- SSH tunnel teardown: complete.
- Production was not modified; production health checks reported `web_baznas-proxy-1`, `web_baznas-frontend-1`, `web_baznas-backend-1`, and `web_baznas-postgres-1` Up/healthy.
- `git diff d197daf058eea6989c21a58aca30ef9f3fe4857c..cbb59269e62419c33c5027a5f85b7d84817b959a --check`: exit 0.
- Prior interim ledger counts of 31 and 36 are superseded and must not be used as final M2 evidence; the final local focused result is 57/57.

## 3. Production Hold Conditions

- `PENYALURAN_P0_ENABLED` remains unset/false; no automatic P0 migration or cutover has been activated.
- No production DDL, container restart, image replacement, or cutover flag change was performed.
- Production has four duplicate NIK groups. Migration 001 contains a duplicate-identifier preflight and must not be run against production until that precondition is resolved.
- The production hold remains active pending explicit approval for any production DDL, restart, image replacement, or `PENYALURAN_P0_ENABLED=true` change.
