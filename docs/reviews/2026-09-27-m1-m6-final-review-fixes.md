# M1-M6 integrated candidate: final review fixes

Date: 2026-09-27
Implementation commit: 8a9ef8a645404551b7267f9289fde867ee05ee19
Scope: isolated candidate worktree only; no production checkout, Docker, database, domain, feature flag, push, deploy, or branch integration.

## Findings and changes

- Migration dry-run orphan accounting treated every unmatched nullable foreign key as dangling. The schema permits global activity logs with a null mustahik_id; the orphan predicate now counts only unmatched non-null references. The reconciliation runbook explicitly excludes valid global rows and still stops on any non-null orphan; this is not a production GO.
- The M6 API receipt harness previously logged receipt evidence and could report success without enforcing it. A fail-closed verifier now requires HTTP 200, a ready receipt status, structurally plausible PDF bytes, a SHA-256 stored hash, and equality between the computed and stored hashes. Failure flows to the existing nonzero process exit. Output remains API-only; no browser-UAT claim is made.
- The accessibility test title was narrowed from Focus Trap to Escape Handling & Focus Restoration; the existing integration challenger Tab/Shift+Tab checks remain separate and are not claimed by this unit test.
- Operations docs now identify the actual work-m1-m6 path, the global server-side boolean (not an IP allow-list canary), and that the flag-off mutation routes return 503 while the authenticated workspace GET is not flag-gated.
- Verification docs mark independent reviews, browser UAT, operator staging, and staging/production logical backup-and-restore as pending. The historical synthetic orphan count is explained as a valid NULL global event, not a production anomaly clearance.

## TDD and focused verification

Orphan-accounting RED: the focused migration-runner selection had 8 passing and 1 failing test; the new case observed 2 orphan rows instead of the expected 1 when a valid NULL global event and a dangling non-null reference were both present.

Orphan-accounting GREEN:

```sh
node --test --test-isolation=none --test-name-pattern=collectP0MigrationDryRun server/penyaluran-p0-migration-runner.test.js
```

Result: 9 passed, 0 failed, 0 skipped.

Receipt-verifier RED: six new case tests initially failed because the verifier was absent; cases cover HTTP failure, non-PDF bytes, malformed PDF, not-ready status, hash mismatch, and a valid ready PDF/hash pair.

Receipt-verifier GREEN:

```sh
node --test --test-isolation=none server/penyaluran-p0-receipt-evidence.test.js
```

Result: 6 passed, 0 failed, 0 skipped. `node --check scripts/m6-uat-verification.js` passed. An in-memory API/PDF/hash exercise passed with HTTP 200 and ready status. A controlled HTTP 503 run emitted `M6_UAT_RECEIPT_HTTP_STATUS_INVALID` and exited 1.

## Broader checks and residual gates

- Full backend command attempted: `node --test --test-isolation=none --test-concurrency=1 server/*.test.js`. It did not complete successfully: PostgreSQL at the configured test endpoint `127.0.0.1:1` was unavailable, tests fell back to SQLite, and the shared single-process run encountered `SQLITE_BUSY: database is locked`. This is recorded as an environment/test-runner failure, not a passing regression suite or evidence of a product defect.
- Frontend suite, typecheck, and build were not run in this bounded checkpoint. PostgreSQL 16 parity/rehearsal was not run; the predicate change was covered by the SQL-backed pg-mem behavioral test.
- `git diff --check` passed before this documentation report was added; it will be rerun before the documentation checkpoint commit.
- Browser UAT, staging operator Docker rehearsal, independent reviews, and staging/production logical backup-and-restore remain pending. Do not enable production flag or infer a production GO from synthetic results.
- A remote full-source-diff retrieval attempt was rejected by the environment review gate and was not retried. Scoped status/stat and behavioral checks were used for this checkpoint.
