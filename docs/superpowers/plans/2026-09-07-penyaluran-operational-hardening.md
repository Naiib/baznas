# Penyaluran Operational Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Penyaluran workspace safe for Staff and Kepala Bagian Penyaluran to operate with accountable approvals and production-truthful data.

**Architecture:** Retain the current Express/PostgreSQL/Next.js structure, but centralise authorisation in a Penyaluran permission policy. Sensitive decisions use an expected status/version guard, immutable approval rows, and atomic database writes. The frontend consumes real session and API state only; it must show unavailable states rather than silently substituting demo data.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg` adapter), JWT during migration, Next.js 16/React 19/TypeScript, Vitest, GitHub Actions, PM2.

## Global Constraints

- Scope is Divisi Penyaluran only: Staff Penyaluran and Kepala Bagian Penyaluran.
- Admin Sistem remains platform administration and is not the normal operational approval shortcut.
- Production must fail closed when PostgreSQL or required data is unavailable.
- New production behaviour follows test-first development; observe each new test fail before implementation.
- No implicit demo login or demo data fallback may run in production.
- Never delete or alter existing production accounts without a targeted administrator action.

---

## Planned file structure

| File | Responsibility |
| --- | --- |
| `server/penyaluran-permissions.js` | Canonical staff/leader/admin policy and workflow transition authorisation. |
| `server/repository.js` | Atomic, version-safe decisions; scoped report export queries; audit metadata. |
| `server/db.js` | Add user level/session/audit fields and safe migrations. |
| `server/index.js` | Session-aware authentication, rate limits, health readiness, role-specific APIs. |
| `server/penyaluran-permissions.test.js` | Policy and self-approval tests. |
| `server/repository.test.js` | Concurrent/stale decision and export-scope tests. |
| `server/index.test.js` | Auth, rate-limit, health, logout/revocation integration tests. |
| `frontend-next/lib/api/types.ts` | User level, decision version, audit, and availability types. |
| `frontend-next/lib/auth/session.ts` | Remove demo-token branch; client session API migration. |
| `frontend-next/components/auth/AuthProvider.tsx` | Validate a real authenticated session and revoke on logout. |
| `frontend-next/app/login/page.tsx` | Empty login form and visible API errors. |
| `frontend-next/components/penyaluran/mustahik/*` | Staff submission vs leader approval controls, stale-state recovery, readable audit timeline. |
| `frontend-next/components/penyaluran/peta/*` | Explicit unavailable/empty map state; demo data only behind a non-production flag. |
| `frontend-next/components/penyaluran/laporan/*` | Filter-aware export controls and role-aware scope labels. |
| `.github/workflows/deploy.yml` | Run the complete frontend suite again, not a selected test only. |
| `docs/operations/penyaluran-runbook.md` | Account provisioning, role matrix, backup/restore drill, incident path. |

### Task 1: Introduce the Penyaluran authority model

**Files:**
- Create: `server/penyaluran-permissions.js`
- Create: `server/penyaluran-permissions.test.js`
- Modify: `server/db.js`
- Modify: `server/index.js`
- Modify: `frontend-next/lib/api/types.ts`

**Interfaces:**
- Produces `resolvePenyaluranAuthority(user): { division: 'penyaluran' | 'other'; level: 'staff' | 'leader' | 'admin'; canApprove: boolean }`.
- Produces `canTransition({ currentStatus, action, actor, preparedById }): { allowed: boolean; reason?: string }`.

- [ ] **Step 1: Write failing policy tests.**

```js
import { canTransition } from './penyaluran-permissions.js';

test('staff may submit a recommendation but cannot approve MPZIS', () => {
  expect(canTransition({ currentStatus: 'Persetujuan MPZIS', action: 'approve', actor: { division: 'Penyaluran', level: 'staff' } }).allowed).toBe(false);
});

test('leader cannot approve their own prepared recommendation', () => {
  expect(canTransition({ currentStatus: 'Persetujuan MPZIS', action: 'approve', actor: { id: 7, division: 'Penyaluran', level: 'leader' }, preparedById: 7 }).reason).toMatch(/sendiri/i);
});
```

- [ ] **Step 2: Run `npm test -- server/penyaluran-permissions.test.js` and confirm the tests fail because the module does not exist.**
- [ ] **Step 3: Add `users.level` (`staff`/`leader`) with a non-destructive migration; map existing `penyaluran` accounts to `staff` until an administrator explicitly changes them. Implement the resolver and transition table.**
- [ ] **Step 4: Use the resolver at protected Penyaluran routes; return HTTP `403` with an Indonesian reason when a Staff user attempts a leader-only approval.**
- [ ] **Step 5: Run the focused tests, then `npm test`; commit `feat(auth): add penyaluran staff and leader authority`.**

### Task 2: Make decisions atomic, conflict-safe, and auditable

**Files:**
- Modify: `server/db.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/repository.test.js`

**Interfaces:**
- `submitMustahikDecision(id, data, actor)` accepts `data.expected_status` and returns `{ success, old_status, new_status, decision_id, correlation_id }`.
- A stale decision throws `{ code: 'STALE_DECISION', status: 409 }`.

- [ ] **Step 1: Write failing tests for stale updates, mandatory notes, self-approval rejection, and a persisted audit row containing actor level/division and correlation id.**

```js
await expect(submitMustahikDecision(24, { expected_status: 'Survey', action: 'approve', notes: 'Lengkap' }, leader))
  .rejects.toMatchObject({ code: 'STALE_DECISION', status: 409 });
```

- [ ] **Step 2: Run `npm test -- server/repository.test.js` and verify each new assertion fails for missing behaviour.**
- [ ] **Step 3: Add nullable `prepared_by_id`, `prepared_at`, `actor_level`, `actor_division`, `correlation_id`, and `mustahik.workflow_version` migrations. Wrap status update, approval insert, activity log, and notification log in a transaction. Update the row with `WHERE id = $id AND status = $expectedStatus AND workflow_version = $expectedVersion`.**
- [ ] **Step 4: Translate the stale error in the API to HTTP 409 and make the decision endpoint require `expected_status` and `expected_version`.**
- [ ] **Step 5: Run repository and API tests; commit `feat(workflow): protect penyaluran approvals from conflicts`.**

### Task 3: Replace demo authentication with revocable, bounded sessions

**Files:**
- Modify: `server/db.js`
- Modify: `server/index.js`
- Modify: `server/index.test.js`
- Modify: `frontend-next/app/login/page.tsx`
- Modify: `frontend-next/components/auth/AuthProvider.tsx`
- Modify: `frontend-next/lib/auth/session.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/lib/api/client.test.ts`

**Interfaces:**
- `POST /api/auth/login` returns a short-lived signed session token with `jti`.
- `POST /api/auth/logout` revokes the authenticated `jti`.
- `authenticateToken` rejects revoked tokens and disabled users with HTTP 401.

- [ ] **Step 1: Write failing backend tests proving a logout token cannot access `/api/auth/me`, an inactive user cannot log in, and login responses expire within one hour. Write frontend tests proving rejected login displays the backend message and does not redirect.**
- [ ] **Step 2: Run the relevant backend and frontend test files; confirm failures are caused by the current seven-day/non-revocable/demo flow.**
- [ ] **Step 3: Add `auth_sessions` storage keyed by JWT `jti`; issue 60-minute sessions, validate active session plus user state on each protected request, revoke on logout, and rate-limit login attempts by IP/email.**
- [ ] **Step 4: Remove pre-filled credentials and every `demo-token` branch. Login must leave the user on the page with a clear error when the API rejects or is unavailable.**
- [ ] **Step 5: Run auth test suites and the full frontend suite; commit `fix(auth): require revocable real penyaluran sessions`.**

### Task 4: Enforce production-truthful data and health readiness

**Files:**
- Modify: `server/index.js`
- Modify: `server/index.test.js`
- Modify: `frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/map/RealKecamatanMap.tsx`
- Modify: `frontend-next/components/penyaluran/map/map-data.ts`
- Test: existing map/workspace test files

**Interfaces:**
- `GET /api/health` returns `503 { success: false, checks: { database: 'unavailable' } }` when database readiness fails.
- Map workspace accepts `dataState: 'ready' | 'empty' | 'unavailable'`; only non-production explicit demo mode may load fixtures.

- [ ] **Step 1: Write failing health and map tests for database failure and live API failure; assert the UI shows `Data peta tidak tersedia` rather than values/date from fixtures.**
- [ ] **Step 2: Run focused tests and verify the current static health response/fallback fixture behaviour fails them.**
- [ ] **Step 3: Implement a lightweight database ping in health; expose no sensitive diagnostics publicly. Gate fixtures with `NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production'`.**
- [ ] **Step 4: Implement compact retry/unavailable UI and preserve the previous live map only until a successful replacement arrives.**
- [ ] **Step 5: Run backend plus full map/frontend tests; commit `fix(data): fail closed when production data is unavailable`.**

### Task 5: Scope exports and protect public entry points

**Files:**
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/repository.test.js`
- Modify: `server/index.test.js`
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx`
- Modify: `frontend-next/components/public-portal/PublicApplicationForm.tsx`
- Modify: `frontend-next/components/public-portal/PublicApplicationTracking.tsx`

**Interfaces:**
- `exportLaporanData(filters, actor)` requires category, date range, and authorised scope; it never uses unrestricted `SELECT * FROM mustahik`.
- Public endpoints share explicit, bounded rate limit middleware.

- [ ] **Step 1: Write failing tests proving an export excludes unrelated fields/records, honours its requested period/category, and rejects missing scope. Add tests for login, public form, tracking, and upload rate-limit `429` responses.**
- [ ] **Step 2: Run focused suites and observe failures against the broad export/current unbounded endpoints.**
- [ ] **Step 3: Implement an allowlisted export projection, query filters, audit log entry with export scope, and in-memory route limiters suitable for the current single PM2 process. Add generic public tracking copy that avoids confirming a record when no match exists.**
- [ ] **Step 4: Update report UI labels to display active scope/date and public forms to disclose the limited tracking identifier policy.**
- [ ] **Step 5: Run export/public suites; commit `fix(exports): scope penyaluran data and throttle public routes`.**

### Task 6: Deliver team-facing queues, review surface, and tests

**Files:**
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`
- Modify: `frontend-next/components/penyaluran/audit/*` or existing audit workspace
- Modify: `frontend-next/components/penyaluran/PenyaluranTopNav.tsx`

**Interfaces:**
- The decision UI sends `{ expected_status, expected_version, notes, action }`.
- Staff see `Kirim untuk persetujuan`; leaders see `Setujui`/`Tolak` plus preparer identity and audit history.

- [ ] **Step 1: Repair the existing Mustahik workspace test fixture so its mocked API returns the selected record, then add failing role and stale-decision tests.**
- [ ] **Step 2: Run `npx vitest run components/penyaluran/mustahik/MustahikWorkspace.test.tsx --maxWorkers=1` and confirm the new cases fail.**
- [ ] **Step 3: Implement role-specific decision controls, a visible preparer/approver timeline, and conflict recovery that reloads current data after HTTP 409. Use compact responsive cards rather than duplicated desktop/mobile action panels.**
- [ ] **Step 4: Run the mustahik, audit, and full frontend suite; commit `feat(ui): separate staff submission from leader approval`.**

### Task 7: Make production quality gates and operations repeatable

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Create: `docs/operations/penyaluran-runbook.md`
- Modify: `README.md`
- Test: `server/*.test.js`, `frontend-next` Vitest suite, frontend production build

- [ ] **Step 1: Add a CI assertion that executes the complete frontend Vitest suite and fails if any test fails; do not retain selected-test-only validation.**
- [ ] **Step 2: Run the workflow-equivalent commands locally: backend test command, `npm --prefix frontend-next run test`, and `npm --prefix frontend-next run build`. Repair failures rather than excluding tests.**
- [ ] **Step 3: Write the runbook: create Staff/Leader accounts, role change/revocation, default-account review, backup schedule ownership, quarterly restore drill, health/PM2 checks, and incident rollback. Align README with Next.js/PostgreSQL/PM2 production reality.**
- [ ] **Step 4: Commit `ci: require complete penyaluran quality gate` and `docs: add penyaluran operations runbook`.**

### Task 8: Release and verify the production system

**Files:**
- Modify only release metadata created by the prior tasks.

- [ ] **Step 1: Confirm `git status --short` contains only intended files and inspect `git diff --check`.**
- [ ] **Step 2: Run the complete verification matrix from Task 7 and record command output in the release notes.**
- [ ] **Step 3: Commit remaining intended changes, push `main`, and let the hardened GitHub-to-VPS release workflow deploy the exact commit.**
- [ ] **Step 4: Verify the GitHub Actions release result, VPS PM2 process health, `GET /api/health`, unauthenticated protected endpoint `401`, Staff `403` at leader approval, and leader approval success in a controlled staging record.**
- [ ] **Step 5: Record release SHA and any manual account-provisioning action required before inviting the team.**

## Self-review

- **Spec coverage:** Tasks 1–2 cover the Staff/Leader model, self-approval prevention, concurrency and immutable audit. Tasks 3–4 remove login/data demo fallbacks and add session/database health. Task 5 covers rate limiting, safe tracking and scoped exports. Task 6 creates understandable role-specific UX. Task 7–8 cover full CI, runbook, deployment and verification.
- **Deliberate deferment:** Other division workflows and financial approval remain out of scope. Existing accounts are not automatically deleted; the runbook directs an admin-controlled reset/disable review.
- **Placeholder scan:** No `TODO`/`TBD` items; each task declares files, interfaces, a failing test, command, minimal implementation direction, verification, and commit point.
- **Type consistency:** User level is `staff | leader | admin`; decision request uses `expected_status` and `expected_version`; `STALE_DECISION` maps to HTTP 409 across backend and frontend.
