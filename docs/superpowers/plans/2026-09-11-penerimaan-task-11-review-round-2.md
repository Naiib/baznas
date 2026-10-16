# Penerimaan Task 11 Review Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining acceptance failures in commit `89886b6ba0d35bae66a8b9c16b39123337c64e2c` without reopening Task 11 work that is already correct.

**Architecture:** Preserve the new webhook validation, AES-GCM helper, canonical report module, and settings transactions, but close the data-boundary and workflow gaps around them. Export generation becomes a real persisted job whose worker creates one private artifact; preview, audit KPIs, and export all consume the same validated filter contract.

**Tech Stack:** Node.js ESM, Express, PostgreSQL/SQLite test adapter, `node:test`, Next.js/React/TypeScript, Vitest, ExcelJS, PDFKit.

## Global Constraints

- Baseline is commit `89886b6ba0d35bae66a8b9c16b39123337c64e2c`.
- Do not start Task 12, deploy, push, amend prior commits, or rewrite unrelated modules.
- Add regression tests before each production change and demonstrate the expected red result.
- Do not use JavaScript `Number` for rupiah values anywhere in the Task 11 ingestion/report/export path.
- Never expose provider plaintext, ciphertext, encryption keys, nonces, or authentication tags through APIs, logs, fixtures, or audit metadata.
- Finish with one focused commit: `fix(penerimaan): finish Task 11 acceptance gaps`.

---

### Task 1: Preserve exact money across repository boundaries

**Files:**
- Modify: `server/repository.js:2936-2959`
- Modify: `server/repository.js:3367-3441`
- Modify: `server/repository.js:4731-4786`
- Test: `server/penerimaan-hardening-regression.test.js`

**Interfaces:**
- Consumes: `parseCanonicalIntegerMoney(value, fieldName, allowZero)` and `requiresLeaderApproval(transaction, settings)`.
- Produces: transaction DTO money fields as canonical decimal strings, with exact comparisons based on `BigInt`.

- [ ] **Step 1: Add failing boundary tests**

Add assertions equivalent to:

```js
const exact = '9007199254740995';
assert.equal(String(formatPenerimaanTransactionRow({ amount: exact }).amount), exact);
assert.equal(String((await getPenerimaanReportTransactions({ search: uniqueRef }))[0].amount), exact);
```

Also create a webhook transaction where amount is `9007199254740995` and threshold is `9007199254740996`; assert it is not flagged. Repeat with threshold `9007199254740994`; assert it is flagged.

- [ ] **Step 2: Verify red**

```powershell
node --test --test-concurrency=1 --test-name-pattern="repository money|webhook threshold" server/penerimaan-hardening-regression.test.js
```

Expected current failure: `9007199254740995` is returned as `9007199254740996`, or the webhook threshold comparison is lossy.

- [ ] **Step 3: Remove the lossy conversions**

Use canonical integer strings in `formatPenerimaanTransactionRow`. In manual and webhook intake, parse amounts with `parseCanonicalIntegerMoney` and call `requiresLeaderApproval`; remove `Math.floor(Number(...))`, direct string/number relational comparison, and numeric policy coercion from these paths.

- [ ] **Step 4: Run the focused test and commit checkpoint**

```powershell
node --test --test-concurrency=1 --test-name-pattern="repository money|webhook threshold" server/penerimaan-hardening-regression.test.js
git add server/repository.js server/penerimaan-hardening-regression.test.js
git commit -m "fix(penerimaan): preserve exact money at repository boundaries"
```

### Task 2: Make audit report summary and freshness use the audit dataset

**Files:**
- Modify: `server/repository.js:6315-6412`
- Modify: `server/repository.js:6418-6462`
- Modify: `server/penerimaan-report-query.js:224-260`
- Test: `server/penerimaan-hardening-regression.test.js`

**Interfaces:**
- Consumes: `normalizeReportFilters` and `buildAuditReportQuery`.
- Produces: one report response whose KPIs, freshness, preview rows, and applied filters all describe the same dataset.

- [ ] **Step 1: Add a failing audit consistency test**

Seed a known number of audit events and transactions with distinct timestamps. Assert:

```js
const report = await getPenerimaanReportSummary(db, { view: 'audit', period: 'custom', start_date, end_date });
assert.equal(report.kpis.total_count, expectedAuditCount);
assert.equal(report.meta.data_freshness, expectedLatestAuditTimestamp);
assert.ok(report.preview_transactions.every((row) => row.audit_event_id));
```

Do not assert only that one audit row exists. The current implementation incorrectly returns transaction count/freshness while previewing audit events.

- [ ] **Step 2: Verify red**

```powershell
node --test --test-concurrency=1 --test-name-pattern="audit report summary" server/penerimaan-hardening-regression.test.js
```

- [ ] **Step 3: Implement a dataset-aware summary**

When `view === 'audit'`, compute count and `MAX(created_at)` from `penerimaan_audit_events` using `buildAuditReportQuery`. Do not query transaction amount/status columns for audit KPIs. Return an explicit audit KPI shape; transaction-only totals must be `null` or omitted rather than misleading zeroes.

For normal views, if the filtered result is empty, return `data_freshness: null`. Do not fall back to the latest unrelated transaction.

- [ ] **Step 4: Run the focused test and commit checkpoint**

```powershell
node --test --test-concurrency=1 --test-name-pattern="audit report summary" server/penerimaan-hardening-regression.test.js
git add server/repository.js server/penerimaan-report-query.js server/penerimaan-hardening-regression.test.js
git commit -m "fix(penerimaan): align audit report summary with audit data"
```

### Task 3: Replace the direct export façade with a real export-job workflow

**Files:**
- Create: `server/penerimaan-export-jobs.js`
- Modify: `server/schema.sql:489-504`
- Modify: `server/index.js:1375-1628`
- Modify: `server/repository.js:6494-6611`
- Modify: `frontend-next/lib/api/penerimaan.ts:303-357`
- Modify: `frontend-next/lib/api/types.ts:803-845`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx:80-216`
- Test: `server/penerimaan-hardening-regression.test.js`
- Test: `frontend-next/components/penerimaan/laporan/ReportWorkspace.test.tsx`

**Interfaces:**
- Produces: `processPenerimaanExportJob(jobUuid): Promise<Job>` and a completed job with a private immutable artifact reference.
- Consumes: `POST /api/penerimaan/laporan/generate`, `GET /api/penerimaan/laporan/jobs/:id`, and `GET /api/penerimaan/laporan/export/:id`.

- [ ] **Step 1: Add failing server lifecycle tests**

Assert the following complete state machine:

```text
POST generate -> 202 queued
worker claim -> processing using one conditional UPDATE
worker success -> completed with one persisted artifact
GET export while queued/processing -> 409
GET export when completed -> reads the persisted artifact without regenerating
worker failure -> failed with a stable public error code
```

Also assert `complete` and `fail` require `rowCount === 1`, completed downloads are repeatable without calling PDF/XLSX generation again, and jobs with a missing creator are denied to non-admin users.

- [ ] **Step 2: Add failing frontend lifecycle tests**

Replace expectations that call `exportReport(reportId, format, filters)` directly. Assert `generateReport({ format, ...appliedFilters })` is called first, queued/processing/completed/failed states are rendered, `getExportJob(jobId)` is polled with bounded cleanup, and download occurs only for the returned job ID after completion.

- [ ] **Step 3: Verify red**

```powershell
node --test --test-concurrency=1 --test-name-pattern="persisted export|completed export" server/penerimaan-hardening-regression.test.js
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx
```

- [ ] **Step 4: Implement one-generation persisted artifacts**

Move generation out of the download GET handler into `processPenerimaanExportJob`. Store artifacts in a private configured export directory using server-generated UUID filenames and atomic temporary-file rename; add a non-public `artifact_path` column or equivalent durable reference. Never accept a client path. The download route authorizes ownership and streams only a completed stored artifact.

`POST generate` must enqueue/schedule processing after persisting the job and respond with `202`. The worker must atomically claim `queued -> processing`; multiple app processes may race, but only one may observe `rowCount === 1` and generate. Remove the direct `/laporan/export?format=...` route or make it return a documented deprecation error; it must not create and process an implicit job.

- [ ] **Step 5: Implement the frontend state machine**

Use `summary.applied_filters` unchanged as job filters. Show a compact status message for queued, processing, completed, and failed; stop timers on completion, failure, unmount, or replacement. Download the completed job artifact and preserve authenticated `fetch` behavior.

- [ ] **Step 6: Run focused tests and commit checkpoint**

```powershell
node --test --test-concurrency=1 --test-name-pattern="export" server/penerimaan-hardening-regression.test.js server/penerimaan-reporting-settings.integration.test.js
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx lib/api/penerimaan.test.ts
git add ../server/penerimaan-export-jobs.js ../server/schema.sql ../server/index.js ../server/repository.js lib/api/penerimaan.ts lib/api/types.ts components/penerimaan/laporan/ReportWorkspace.tsx components/penerimaan/laporan/ReportWorkspace.test.tsx
git commit -m "fix(penerimaan): implement persisted report export jobs"
```

### Task 4: Expose the full canonical report filter contract in the UI

**Files:**
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx:80-306`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.test.tsx`
- Modify: `frontend-next/lib/api/types.ts:733-760`
- Test: `server/penerimaan-hardening-regression.test.js`

**Interfaces:**
- Consumes/produces: the exact `PenerimaanReportQueryParams` keys supported by `normalizeReportFilters`.

- [ ] **Step 1: Add failing UI contract tests**

Assert accessible controls and requests for `account_id`, `program_id`, `program_search`, `muzakki_id`, manual/digital mode, exception flag, reconciliation status, normal/audit view, search, date range, deterministic sort, and pagination. Assert preview still makes only one `getReports` request and export uses its returned `applied_filters` verbatim.

- [ ] **Step 2: Add strict server normalizer tests**

Assert malformed values are rejected, not silently coerced:

```js
assert.throws(() => normalizeReportFilters({ account_id: '12abc' }), /account_id/i);
assert.throws(() => normalizeReportFilters({ is_manual: 'banana' }), /is_manual/i);
assert.throws(() => normalizeReportFilters({ sort_by: 'amount; DROP TABLE' }), /sort_by/i);
```

- [ ] **Step 3: Implement controls and strict normalization**

Populate account options from `getAccounts`; use validated text/numeric inputs for program and Muzakki identifiers; add mode, exception, reconciliation, and view selects. Do not accept arbitrary `sort_by`; map a small allowlist to SQL expressions and actually apply it to both transaction and audit queries.

Replace the UI freshness fallback `'Real-time'` with a truthful empty-state label such as `'Belum ada data'`. Remove wall-clock freshness fallbacks from PDF, XLSX, and export metadata.

- [ ] **Step 4: Run focused tests and commit checkpoint**

```powershell
node --test --test-concurrency=1 --test-name-pattern="report filter|freshness" server/penerimaan-hardening-regression.test.js
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx
git add ../server/penerimaan-report-query.js ../server/repository.js ../server/index.js ../server/penerimaan-export.js components/penerimaan/laporan/ReportWorkspace.tsx components/penerimaan/laporan/ReportWorkspace.test.tsx lib/api/types.ts
git commit -m "fix(penerimaan): complete canonical report filters"
```

### Task 5: Make provider configuration fail closed in deployed environments

**Files:**
- Modify: `server/penerimaan-provider-secrets.js`
- Modify: `server/index.js:1029-1058`
- Modify: `server/repository.js:7350-7466`
- Modify: `.env.example` or the repository's canonical environment template
- Test: `server/penerimaan-provider-secrets.test.js`
- Test: `server/penerimaan-hardening-regression.test.js`

**Interfaces:**
- Produces: `resolveConfiguredProviderSecret(providerName, db): Promise<string>` with an exact provider allowlist and active-state enforcement.

- [ ] **Step 1: Add failing provider-runtime tests**

Cover inactive provider rejection, unknown provider rejection, malformed/tampered envelope rejection, missing encryption key outside tests, and database-secret precedence. Assert the runtime never uses a secret from an inactive row. Assert `listPenerimaanProviderConfigs` has no `secret_key` property.

- [ ] **Step 2: Verify red**

```powershell
node --test --test-concurrency=1 server/penerimaan-provider-secrets.test.js --test-name-pattern="inactive|unknown|encryption key|response shape"
```

- [ ] **Step 3: Implement a single provider resolver**

Query `provider_name`, `is_active`, and `webhook_secret_encrypted` together. Require an exact supported provider name; do not use `startsWith`/`includes` fuzzy matching. Reject inactive providers before signature verification. Define and test the exact success statuses for every seeded supported provider (`portal`, `bsi`, `qris_national`, `bni_syariah`, and `generic`) plus any deliberately supported external provider.

Remove the embedded default encryption key. Allow a deterministic key only when `NODE_ENV === 'test'` and the test explicitly sets it. Document key format and generation in the environment template. Keep any legacy environment-secret fallback explicit per provider and disabled once an encrypted database secret exists.

Use a seeded-provider-only contract for this task: keep provider names immutable and reject unknown rows/routes. Do not add a provider-create endpoint until a safe status/signature adapter contract exists.

- [ ] **Step 4: Handle legacy plaintext safely**

Do not silently treat legacy plaintext as valid encrypted data. Add a one-time migration/rotation path that requires the encryption key and rewrites known legacy values into versioned envelopes, or fail startup with an actionable rotation error. Tests must not seed plaintext into `webhook_secret_encrypted` except inside a migration-specific test.

- [ ] **Step 5: Run focused tests and commit checkpoint**

```powershell
node --test --test-concurrency=1 server/penerimaan-provider-secrets.test.js server/penerimaan-hardening-regression.test.js
git add server/penerimaan-provider-secrets.js server/index.js server/repository.js server/penerimaan-provider-secrets.test.js server/penerimaan-hardening-regression.test.js .env.example
git commit -m "fix(penerimaan): enforce active encrypted webhook providers"
```

### Task 6: Final acceptance and one squashed delivery commit

**Files:**
- Verify all files changed by Tasks 1-5
- Do not include: `frontend-next/tsconfig.tsbuildinfo`, `.next`, coverage, logs, generated exports, or local databases

**Interfaces:**
- Produces: one clean final commit based on `89886b6`.

- [ ] **Step 1: Run full verification from repository root**

```powershell
node --test --test-concurrency=1 server/*.test.js
Set-Location frontend-next
npm test -- --run
npm run typecheck
npm run build
Set-Location ..
git diff --check
git status --short
```

- [ ] **Step 2: Inspect requirements, not only test totals**

Manually verify that `ReportWorkspace.tsx` calls `generateReport` and `getExportJob`, every canonical filter has a UI control, `formatPenerimaanTransactionRow` contains no money `Number(...)`, audit summary queries audit events, download GET contains no PDF/XLSX generation call, and webhook provider lookup requires `is_active`.

- [ ] **Step 3: Squash the task checkpoints into the required delivery commit**

```powershell
git reset --soft 89886b6ba0d35bae66a8b9c16b39123337c64e2c
git commit -m "fix(penerimaan): finish Task 11 acceptance gaps"
git status --short
git rev-parse HEAD
```

Do not run the squash command if unrelated commits appeared after the baseline. Stop and report that conflict instead. The final report must include fresh command counts, the final hash, and a clean worktree; do not claim Task 11 accepted if any manual requirement check fails.
