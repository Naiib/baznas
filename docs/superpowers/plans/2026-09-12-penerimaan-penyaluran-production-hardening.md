# Penerimaan & Penyaluran Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an evidence-backed frontend and backend hardening pass for the Penerimaan and Penyaluran modules.

**Architecture:** Keep the current Next.js and Express/PostgreSQL architecture. Add narrow helpers and DTO/policy boundaries where server correctness needs centralized enforcement, then adapt existing components to truthful API states.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Express 5, Node test runner, PostgreSQL/pg-mem.

## Global Constraints

- Preserve current visual design and public route ownership.
- Use test-first red-green-refactor for every behavior change.
- Do not alter `.env`, production data, migrations with destructive behavior, or deployment state during implementation.
- Do not push or deploy until final review and all verification gates pass.
- AGY is the implementation executor; Codex reviews every diff and owns integration/release.

---

### Task 1: Audit and stabilize both frontends

**Files:**
- Inspect: `frontend-next/app/penerimaan/**`, `frontend-next/components/penerimaan/**`
- Inspect: `frontend-next/app/penyaluran/**`, `frontend-next/components/penyaluran/**`
- Modify/Test: only evidence-backed affected components and their colocated `*.test.tsx` files

**Interfaces:**
- Consumes: existing API clients in `frontend-next/lib/api/`
- Produces: truthful loading/empty/error/success behavior with accessible controls and no console/runtime errors

- [x] Inventory every Penerimaan and Penyaluran route and identify static/demo values, broken actions, inconsistent access checks, missing states, overflow, and accessibility failures.
- [x] For each confirmed defect, write the smallest Vitest regression and run it to confirm the expected failure.
- [x] Implement the minimal component/API-client fix and rerun the focused test to green.
- [x] Run `npm test -- --run` and `npm run typecheck` from `frontend-next`.
- [x] Run `npm run build` from `frontend-next` and record any warning or route failure.

### Task 2: Protect uploaded evidence and document downloads

**Files:**
- Modify: `server/index.js`
- Modify/Create as needed: a focused server download-policy helper
- Test: existing Penerimaan upload/integration suites or a focused `server/*uploads*.test.js`

**Interfaces:**
- Consumes: authenticated user claims, stored upload metadata, existing evidence URLs
- Produces: authenticated download route returning 401/403 for unauthorized access and the file for allowed access

- [x] Add integration tests proving the current public static URL leaks a known upload and that authorized access is allowed.
- [x] Run focused tests and confirm the unauthenticated case fails for the expected reason.
- [x] Replace public static exposure with an authenticated, path-safe download route and policy check.
- [x] Update API URL generation/consumers only where required for compatibility.
- [x] Rerun focused tests and confirm both denial and authorized download cases pass.

### Task 3: Enforce Penyaluran workflow state transitions

**Files:**
- Modify: `server/repository.js`
- Reuse/Modify: `server/workflow-integrity.js`
- Test: existing workflow/integration suites or a focused `server/*workflow*.test.js`

**Interfaces:**
- Consumes: current status, requested action/target status, actor role, optimistic version
- Produces: explicit allowed next status or a 409/422 domain error

- [x] Write tests for at least one forbidden leap and every valid transition currently used by the UI.
- [x] Run tests red against arbitrary `target_status` acceptance.
- [x] Centralize the allowed transition map and validate action/status combinations before persistence.
- [x] Confirm valid transitions still update audit/version data and forbidden transitions do not mutate rows.
- [x] Run focused workflow tests green.

### Task 4: Remove synthetic operational dashboard data

**Files:**
- Modify: `server/repository.js`
- Modify if required: `frontend-next/components/penyaluran/dashboard/**`, `frontend-next/components/penyaluran/peta/**`
- Test: repository and relevant frontend dashboard/map tests

**Interfaces:**
- Consumes: aggregate database rows that may be absent or zero
- Produces: zero/empty values and explicit frontend empty states

- [x] Add repository tests for a database with no Penyaluran rows and assert zero/empty output.
- [x] Run red and identify every synthetic fallback that makes the test fail.
- [x] Remove synthetic numbers and labels; retain only deterministic presentation metadata.
- [x] Add or update frontend tests proving zero/empty data is rendered clearly.
- [x] Run focused backend and frontend tests green.

### Task 5: Make Penyaluran report exports honor report definitions

**Files:**
- Modify: `server/index.js`
- Modify: `server/repository.js`
- Test: existing report suites or a focused `server/*report-export*.test.js`

**Interfaces:**
- Consumes: report ID, persisted definition, period, filters, scope, requested format
- Produces: deterministic CSV/JSON/PDF/XLSX rows that match the selected report

- [x] Write integration tests with records inside/outside the chosen period/filter/scope.
- [x] Run red and confirm the current generic mustahik export includes incorrect rows.
- [x] Resolve the report definition by ID, validate allowed filter fields, and parameterize the export query.
- [x] Apply deterministic ordering and explicit safe export limits/pagination.
- [x] Run focused export tests green for CSV and JSON plus any existing document formats.

### Task 6: Complete Penerimaan privacy, validation, and authorization hardening

**Files:**
- Modify: `server/index.js`, `server/repository.js`, `server/access-policy.js`
- Modify: `frontend-next/components/auth/RequireAuth.tsx` and affected route tests
- Test: Penerimaan route/hardening tests and frontend auth tests

**Interfaces:**
- Consumes: actor role/division, Penerimaan row, custom period input, thrown internal errors
- Produces: allowlisted/masked DTOs, 422 invalid-period responses, generic correlated 5xx responses, consistent UI access

- [x] Write regression tests for PII masking, invalid/reversed custom periods, generic 5xx bodies, and frontend/backend access parity.
- [x] Run the focused tests red for each confirmed gap.
- [x] Implement narrow DTO, validation, error-mapping, and policy-alignment changes.
- [x] Rerun all focused tests green and confirm administrator workflows remain available.

### Task 7: Full quality gate, review, integration, and release

**Files:**
- Review: all changed files and this plan
- Update: release/runbook documentation only if commands or operational behavior changed

**Interfaces:**
- Consumes: completed Tasks 1-6
- Produces: reviewed main commit and verified production deployment

- [x] Run root `npm test`, `npm run lint`, and `npm run build`.
- [x] Run frontend `npm test -- --run`, `npm run typecheck`, and `npm run build`.
- [x] Review the complete diff against every approved requirement and resolve all critical/important findings with tests.
- [x] Merge to `main`, commit coherent changes, and push only after the workspace is clean and verification is fresh.
- [x] Deploy the exact full SHA using `deploy/release-vps.sh` and verify PM2 processes, backend health, public login, Penerimaan, and Penyaluran routes.
- [x] Perform final desktop/mobile visual smoke checks when browser capture is available; document any tooling limitation without claiming visual coverage that was not captured.

Release note (2026-09-13): application SHA `61ddbbfa45fdd82c0ffd8b4de5bc9e0a48723110` was deployed to the VPS and matched the server checkout. The backend health endpoint reported `ready` with PostgreSQL, and `/login`, `/penerimaan`, and `/penyaluran` returned HTTP 200. Authenticated browser smoke covered role-aware login redirects, session persistence after refresh, every primary Penerimaan workspace, and the Penyaluran dashboard, Mustahik, transaction journal, program, map, report, task, audit, and master-data routes. The smoke found a PostgreSQL type mismatch in the Penyaluran transaction journal; it was fixed with PostgreSQL/SQLite regression coverage and verified in production with 146 transactions and Rp436,000,000 loaded. Desktop and 390x844 mobile captures showed no page-level horizontal overflow, alerts, or browser console errors. The headless Mapbox canvas initialized without console errors, although its basemap was not visually rendered by the capture environment.
