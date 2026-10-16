# Data & Access Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Penyaluran API safe for operational use and ensure dashboard, map, and reports do not silently present demo values as real data.

**Architecture:** Stage A centralizes API access policy and applies it to every sensitive route, while preserving only the explicitly public application/tracking endpoints. Stage B moves every operational aggregate behind one period-aware repository contract which returns either database-derived values or explicit empty-data metadata; UI adapters will render that state instead of substituting demo numbers.

**Tech Stack:** Node.js, Express 5, PostgreSQL/SQLite repository adapter, JWT, Next.js 16, TypeScript, Vitest, Node built-in test runner.

## Global Constraints

- Do not expose Mustahik PII, documents, exports, or operational mutations without authentication and an allowed role.
- `JWT_SECRET` must be supplied from the environment in production; the server must fail closed when it is absent.
- Public scope is restricted to submission, tracking, and public master-data reads.
- Production API responses must not contain demo/fallback financial values.
- Keep current Amil workflows functional for `admin`, `penyaluran`, and `surveyor` according to the role matrix.
- Preserve append-only approval decisions and add audit entries for sensitive export and mutation events.
- Run targeted tests before each commit; do not stage `frontend-next/tsconfig.tsbuildinfo` or unrelated `docs/research/` files.

---

## Stage A — Access Control and PII Protection

### Task 1: Define a single route-access policy and fail-closed JWT configuration

**Files:**
- Create: `server/access-policy.js`
- Modify: `server/index.js:223-314`
- Modify: `.env.example`
- Test: `server/access-policy.test.js`

**Interfaces:**
- Produces `ROLE = { ADMIN, PENYALURAN, SURVEYOR }`.
- Produces `requireAuth`, `requireAnyRole(...roles)`, and `requireProductionSecret` middleware helpers.
- Consumes Express `req.user` set by JWT verification.

- [ ] **Step 1: Write the failing policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, ROLE } from './access-policy.js';

test('only admin can change master data', () => {
  assert.equal(canAccess(ROLE.ADMIN, 'master-data:write'), true);
  assert.equal(canAccess(ROLE.PENYALURAN, 'master-data:write'), false);
});

test('penyaluran can advance a decision but surveyor cannot disburse PPD', () => {
  assert.equal(canAccess(ROLE.PENYALURAN, 'mustahik:decision'), true);
  assert.equal(canAccess(ROLE.SURVEYOR, 'ppd:write'), false);
});

test('only authenticated operational roles can export PII', () => {
  assert.equal(canAccess(ROLE.ADMIN, 'laporan:export'), true);
  assert.equal(canAccess(undefined, 'laporan:export'), false);
});
```

- [ ] **Step 2: Run the policy test to verify it fails**

Run: `node --test server/access-policy.test.js`

Expected: FAIL because `server/access-policy.js` does not exist.

- [ ] **Step 3: Implement the policy module**

```js
export const ROLE = Object.freeze({ ADMIN: 'admin', PENYALURAN: 'penyaluran', SURVEYOR: 'surveyor' });

const permissions = Object.freeze({
  'master-data:write': [ROLE.ADMIN],
  'mustahik:read': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'mustahik:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'mustahik:decision': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'assessment:write': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'mpzis:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'ppd:write': [ROLE.ADMIN, ROLE.PENYALURAN],
  'document:write': [ROLE.ADMIN, ROLE.PENYALURAN, ROLE.SURVEYOR],
  'laporan:export': [ROLE.ADMIN, ROLE.PENYALURAN],
  'audit:read': [ROLE.ADMIN],
});

export function canAccess(role, permission) {
  return Boolean(role && permissions[permission]?.includes(role));
}
```

Add `JWT_SECRET=change-me-in-production` and `FRONTEND_URL=https://muhammadrofiq.my.id` to `.env.example`, with comments stating that production startup rejects the example secret.

- [ ] **Step 4: Run the policy test to verify it passes**

Run: `node --test server/access-policy.test.js`

Expected: PASS with three tests.

- [ ] **Step 5: Commit**

```bash
git add server/access-policy.js server/access-policy.test.js server/index.js .env.example
git commit -m "feat(auth): define operational access policy"
```

### Task 2: Protect mutation, export, document, and diagnostic endpoints

**Files:**
- Modify: `server/index.js:250-957`
- Test: `server/access-control.integration.test.js`

**Interfaces:**
- Consumes `authenticateToken`, `requireAnyRole`, and `canAccess` from Task 1.
- Produces consistent JSON `401` for missing token and `403` for an authenticated but unauthorized role.
- Keeps `/api/public/pengajuan`, `/api/public/lacak/:query`, and `/api/public/master-data` unauthenticated.

- [ ] **Step 1: Write failing integration tests for protected endpoint groups**

```js
test('rejects an anonymous Mustahik export', async () => {
  const response = await request(app).get('/api/mustahik/export/data');
  assert.equal(response.status, 401);
});

test('rejects surveyor access to a PPD mutation', async () => {
  const response = await request(app)
    .post('/api/mustahik/1/ppd')
    .set('Authorization', surveyorToken)
    .send({ approved_amount: 1500000 });
  assert.equal(response.status, 403);
});

test('allows the public tracking endpoint without a session', async () => {
  const response = await request(app).get('/api/public/lacak/MST-202609-0001');
  assert.notEqual(response.status, 401);
});
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run: `node --test server/access-control.integration.test.js`

Expected: FAIL because anonymous export and mutation routes currently return success.

- [ ] **Step 3: Apply the exact protection matrix**

| Endpoint group | Middleware |
|---|---|
| `/api/cache/stats`, `/api/cache/clear` | `authenticateToken`, admin only |
| `/api/mustahik`, `/api/mustahik/:id`, `/api/mustahik/export/data` | authenticated operational role; writes limited to admin/penyaluran |
| `/api/mustahik/import` | authenticated admin/penyaluran |
| `/api/mustahik/:id/assessment` | authenticated admin/penyaluran/surveyor |
| `/api/mustahik/:id/mpzis`, `/api/mustahik/:id/ppd` | authenticated admin/penyaluran |
| `/api/mustahik/:id/documents`, `/api/upload` | authenticated admin/penyaluran/surveyor |
| `/api/penyaluran/program/initiatives` writes | authenticated admin/penyaluran |
| `/api/penyaluran/laporan/generate`, export routes | authenticated admin/penyaluran |
| `/api/activity-logs`, WhatsApp history | authenticated operational role |

Add an audit activity entry for report exports and every protected mutation using the authenticated actor id/name/role. Keep the two public application routes and public master data outside this middleware.

- [ ] **Step 4: Lock CORS and upload handling**

```js
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').filter(Boolean);
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin tidak diizinkan'));
}}));

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => callback(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
});
```

Return `422` for unsupported file types and retain the 10 MB limit.

- [ ] **Step 5: Run tests and smoke checks**

Run:

```bash
node --test server/access-policy.test.js server/access-control.integration.test.js
node test_backend.js
```

Expected: protected routes return `401`/`403`, public application tracking remains reachable, and existing repository smoke test passes.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/access-control.integration.test.js server/access-policy.js
git commit -m "fix(api): protect operational data and exports"
```

## Stage B — Truthful Operational Metrics

### Task 3: Return explicit data provenance from repository aggregates

**Files:**
- Modify: `server/repository.js:1063-1197`
- Modify: `server/repository.js:1927-2046`
- Test: `server/repository.metrics.test.js`

**Interfaces:**
- Produces `getPenyaluranOverview(period)` with `{ dataStatus: 'ready' | 'empty', period, metrics, monthlyTrend, asnafBreakdown, programImpact }`.
- Produces `getLaporanList(filters)` with database-derived KPI and distributions plus `dataStatus`.
- Consumes only persisted Mustahik, PPD, program, and report data; no hard-coded financial fallback in production paths.

- [ ] **Step 1: Write failing repository tests for empty and populated data**

```js
test('returns empty provenance instead of a fabricated dashboard total', async () => {
  const overview = await getPenyaluranOverview('30d');
  assert.equal(overview.dataStatus, 'empty');
  assert.equal(overview.metrics.totalPenyaluran, 0);
  assert.deepEqual(overview.monthlyTrend, []);
});

test('filters total disbursement to the requested period', async () => {
  await insertMustahik({ approved_amount: 1000000, disbursement_date: today });
  await insertMustahik({ approved_amount: 5000000, disbursement_date: lastYear });
  const overview = await getPenyaluranOverview('7d');
  assert.equal(overview.metrics.totalPenyaluran, 1000000);
});
```

- [ ] **Step 2: Run the repository tests to verify they fail**

Run: `node --test server/repository.metrics.test.js`

Expected: FAIL because `getPenyaluranOverview` falls back to `29_840_000_000` and static monthly rows.

- [ ] **Step 3: Implement a period parser and database-only aggregate queries**

```js
export function getPeriodStart(period, now = new Date()) {
  const days = { '7d': 7, '30d': 30, '1y': 365 }[period];
  if (!days) throw new Error('Periode tidak valid');
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}
```

Use `disbursement_date` for realized distribution, `approved_amount` only where a record is approved, and group monthly trend rows in SQL for the requested range. Return zero/empty arrays plus `dataStatus: 'empty'` when no qualifying record exists; never replace zero with a demo total. Derive program/asnaf/report KPI totals from the same filtered query set.

- [ ] **Step 4: Run repository tests to verify they pass**

Run: `node --test server/repository.metrics.test.js`

Expected: PASS for empty state and period filtering.

- [ ] **Step 5: Commit**

```bash
git add server/repository.js server/repository.metrics.test.js
git commit -m "fix(metrics): derive penyaluran data from period records"
```

### Task 4: Surface data provenance in dashboard, map, and reports

**Files:**
- Modify: `frontend-next/components/penyaluran/dashboard/dashboard-data.ts`
- Modify: `frontend-next/components/penyaluran/dashboard/ConceptThreeDashboard.tsx`
- Modify: `frontend-next/components/penyaluran/map/map-data.ts`
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.tsx`
- Test: `frontend-next/components/penyaluran/dashboard/dashboard-data.test.ts`
- Test: `frontend-next/components/penyaluran/map/map-data.test.ts`

**Interfaces:**
- Consumes backend `dataStatus` from Task 3.
- Produces `source: 'real' | 'empty'` for every UI aggregate.
- Removes production use of `DEMO_KECAMATAN_DATA`, `REPORT_KPIS`, static report distributions, and numeric fallback adapters.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('does not substitute demo totals when the overview is empty', () => {
  const dashboard = adaptBackendOverviewToDashboardData({ dataStatus: 'empty', metrics: { totalPenyaluran: 0 } }, '30d');
  expect(dashboard.summary.totalPenyaluran).toBe(0);
  expect(dashboard.dataStatus).toBe('empty');
});

it('does not use demo kecamatan values when the API has no record', () => {
  expect(getMapMetricValue('Cipondoh', 'funds', [], undefined)).toBe(0);
});
```

- [ ] **Step 2: Run the adapter tests to verify they fail**

Run: `cd frontend-next && node node_modules/vitest/vitest.mjs run components/penyaluran/dashboard/dashboard-data.test.ts components/penyaluran/map/map-data.test.ts`

Expected: FAIL because adapter and map functions currently use demo fallback values.

- [ ] **Step 3: Implement the empty-data UX**

Use neutral, explicit copy in production:

```tsx
{data.dataStatus === 'empty' && (
  <p className="text-xs font-semibold text-slate-500">
    Belum ada transaksi tervalidasi untuk periode ini.
  </p>
)}
```

Keep demo constants available only behind `NEXT_PUBLIC_DEMO_MODE === 'true'`; VPS configuration must omit this variable. Export controls should show a disabled state with `Belum ada data untuk diekspor` when no result exists.

- [ ] **Step 4: Run targeted frontend tests and production build**

Run:

```bash
cd frontend-next
node node_modules/vitest/vitest.mjs run components/penyaluran/dashboard/dashboard-data.test.ts components/penyaluran/map/map-data.test.ts
npm run build
```

Expected: tests PASS and the production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-next/components/penyaluran/dashboard frontend-next/components/penyaluran/map frontend-next/components/penyaluran/laporan
git commit -m "fix(ui): label empty operational data honestly"
```

### Task 5: Verify release behavior and operational safety

**Files:**
- Modify: `README.md`
- Create: `docs/operations/data-access-runbook.md`
- Test: `server/access-control.integration.test.js`

**Interfaces:**
- Consumes all policy and provenance behavior from Tasks 1–4.
- Produces an operator runbook for secret setup, role verification, backup, and rollback.

- [ ] **Step 1: Write a release regression test**

```js
test('denies a report export without a Bearer token and permits an Amil token', async () => {
  assert.equal((await request(app).get('/api/penyaluran/laporan/export/lap-1?format=json')).status, 401);
  assert.equal((await request(app).get('/api/penyaluran/laporan/export/lap-1?format=json').set('Authorization', amilToken)).status, 200);
});
```

- [ ] **Step 2: Run it to verify expected behavior**

Run: `node --test server/access-control.integration.test.js`

Expected: PASS after Tasks 1–4 are complete.

- [ ] **Step 3: Document production operations**

Document these exact checks:

```bash
test -n "$JWT_SECRET" && test "$JWT_SECRET" != "baznas_tangkot_super_secret_jwt_key_2026"
curl -fsS http://127.0.0.1:3001/api/health
pm2 status
pg_dump "$DATABASE_URL" > "baznas-$(date +%F).sql"
```

Include role smoke tests, API rollback via previous Git SHA, and backup retention owner.

- [ ] **Step 4: Run final verification**

Run:

```bash
node --test server/access-policy.test.js server/access-control.integration.test.js server/repository.metrics.test.js
cd frontend-next && npm run build
git diff --check
```

Expected: all targeted tests and production build pass with no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/operations/data-access-runbook.md server/access-control.integration.test.js
git commit -m "docs: add data access operations runbook"
```

## Plan Self-Review

- **Coverage:** Access control, CORS, upload validation, PII exports, real period aggregates, demo fallback removal, UI provenance, report exports, audit entries, and release operations are covered by Tasks 1–5.
- **No placeholders:** Every task includes the route group, interface, test command, expected outcome, and commit scope.
- **Consistency:** `dataStatus` is introduced in Task 3 and consumed in Task 4; role policy is defined in Task 1 and applied in Task 2.
