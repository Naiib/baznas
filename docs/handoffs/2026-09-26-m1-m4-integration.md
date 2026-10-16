# M1-M4 Integration Checkpoint

Date: 2026-09-26
Branch: `codex/mustahik-p0-m1-m4-integrated`
Tested code HEAD: `ee09d36426c6f0de8dbd43db72805fcc2933cd93`
Base: M4 `7beb6783263973e183697318582694b890c01705`

## Source and merge record

- Clean source heads before integration: M1 `6351d9c2e2b79442cbc8204d8bc3f5f212429b74`, M2 `157f258cb7c5b2a4a06685ee27ba86e726f3bacd`, M3 `8ba6a9fd285934c1dbf4831f2234bea20f533e01`, M4 `7beb6783263973e183697318582694b890c01705`.
- Merge order and commits: M1 `e452597`, M2 `581b3dd`, M3 `5075473`; no merge conflicts.
- M1 source follow-up commits are present in ancestry. Their changes were already equivalent in M4, so they add no net files against the M4 tree.
- M2 public intake and legacy cutover changes and M3 evidence-backed case read-model changes are included. M4 PPD RAB amount fix `7ef5777` remains in history.
- Full tree delta from M4 before the compatibility fix: 10 files; `git diff --check` passed.

## Files changed from M4

- `docs/superpowers/plans/2026-09-26-public-p0-intake-bridge.md`
- `docs/superpowers/specs/2026-09-26-public-p0-intake-bridge-design.md`
- `server/index.js`
- `server/m3-workspace-postgres16.test.js`
- `server/penyaluran-p0-legacy.test.js`
- `server/penyaluran-p0-public-intake.test.js`
- `server/penyaluran-p0-read-model.test.js`
- `server/penyaluran-p0/case-read-model.js`
- `server/penyaluran-p0/intake-service.js`
- `server/penyaluran-p0/legacy-reconciliation.js`

`server/index.js` also contains the tested compatibility fix in `ee09d36`: legacy upload MIME validation keeps its existing response shape; P0 parser failures remain generic.

## Verification

- Full backend: `node --test --test-concurrency=1 --test-reporter=tap server/*.test.js` with the two test URLs below, `P0_LEGACY_TEMPLATE_DB` set to the synthetic fixture DB, and `PENYALURAN_P0_CUTOVER_AT=2099-01-01T00:00:00Z`: 581 passed, 0 failed, 0 skipped.
- M1 forced PostgreSQL 16 rollback rehearsal: `server/m1-forced-failure-rollback.test.js`: 1 passed, 0 failed, 0 skipped.
- Frontend: `npm test -- --reporter=dot`: 42 files, 374 passed.
- Frontend typecheck: `npm run typecheck -- --incremental false --pretty false`: passed.
- Next production build: `npm run build -- --webpack`: passed.
- Root Vite production build: `npm run build`: passed.
- Default Next build `npm run build` (Turbopack) failed because `frontend-next/node_modules` is a symlink outside the worktree filesystem root. The Webpack build succeeds with the same dependency link.

Backend coverage includes anonymous public P0 intake, idempotent replay, upload validation and audit, legacy write freeze, migration parity/rollback, M3 PostgreSQL 16 workspace and role safety, artifact/receipt workflows, and M4 API client tests. Public intake/tracking, PostgreSQL workspace, and frontend client contracts pass in their respective suites; no single test drives all three layers in one real-PostgreSQL HTTP flow.

## Disposable database identity

- Container: `baznas-m1-synthetic-pg16-20260926`, ID `df83c9a1f876a0bc0b7f130bcece3902b4ce6afc19d432c27b7337c6b9ddd41e`, image `postgres:16-alpine`, loopback port `127.0.0.1:55439`.
- New legacy fixture DB: `baznas_m3_m1_m4_integrated_20260926_test`; seeded only with the repository synthetic fixture.
- New M3 workspace DB: `baznas_m3_m1_m4_workspace_20260926_test`; initialized from `server/schema.sql` for the workspace test.
- Existing databases were not reused or dropped. M1 rollback test's temporary DB names were checked absent before execution and cleaned by the test.

## Verdict

Integration: GO for isolated review. Release/deployment: HOLD until the default Turbopack symlink limitation is resolved or explicitly accepted, and the separate combined real-PostgreSQL public-intake-to-workspace-to-client flow is exercised. No push, merge to main, production DDL, flag change, or deployment was performed.
