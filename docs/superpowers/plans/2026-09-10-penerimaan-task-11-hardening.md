# Penerimaan Task 11 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup seluruh blocker audit Task 11 pada reporting, export, settings, portal callback, dan integrasi Penyaluran tanpa memulai Task 12.

**Architecture:** Seluruh keluaran laporan memakai satu filter/query specification dan snapshot data yang sama. Kebijakan workflow membaca settings aktif melalui satu jalur, intake memeriksa kanal aktif, export memakai satu job dengan lifecycle nyata, dan setiap mutasi settings beserta audit berjalan dalam satu transaksi database.

**Tech Stack:** Express 5, Node.js test runner, PostgreSQL repository dengan SQLite test adapter, PDFKit, ExcelJS, Next.js 16 App Router, React 19, TypeScript 5.8 strict, Vitest, dan Testing Library.

## Global Constraints

- Repository: `D:\BAZNAS\data-center`.
- Baseline implementasi Task 11: commit `6f6eac7`.
- Kode lokal adalah source of truth; jangan pull, reset, checkout paksa, atau rebase.
- Jangan push, deploy, mengubah VPS, menghapus legacy, atau memulai Task 12.
- Jangan mengubah modul Penyaluran kecuali kontrak pembacaan agregasi Posted dari Penerimaan.
- Production harus fail-closed ketika PostgreSQL atau secret wajib tidak tersedia.
- Jangan menaruh token, secret, ciphertext, atau credential di source, fixture, log, audit, maupun laporan kerja.
- Gunakan TDD: setiap perilaku baru harus terlihat gagal pada baseline sebelum implementation code diubah.
- Seluruh uang memakai integer/BigInt exact; konversi ke `Number` hanya boleh untuk counter, pagination, dan nilai yang sudah dibuktikan bukan uang.
- Navbar Penerimaan tetap maksimal lima menu.
- Semua kelompok perubahan dikumpulkan menjadi satu commit akhir: `fix(penerimaan): harden Task 11 reporting and settings`.
- `frontend-next/tsconfig.tsbuildinfo` harus dikembalikan ke kondisi sebelum Task 11 jika perubahannya hanya artefak build.

---

## Current defects confirmed from the baseline

- `bulkValidatePenerimaanTransactions`, manual intake, webhook ingestion, dan import masih memakai threshold default/hardcoded.
- Portal callback meneruskan semua payload bersignature valid tanpa memeriksa final payment status dan belum memprioritaskan `payment_time`.
- `recordRawWebhookEvent` memakai check-then-insert yang race-prone.
- KPI, preview, dan export belum memakai filter canonical yang lengkap.
- Preview report masih dapat membawa NIK dan telepon mentah.
- Export job langsung dibuat `completed`, sedangkan download membuat job kedua.
- Query export dibatasi oleh limit repository dan PDF memotong row.
- Export mengubah uang melalui `Number`.
- Freshness dan alamat PDF masih hardcoded.
- Agregasi Penyaluran mengabaikan parameter filter.
- Settings UI belum menyediakan create/edit master data dan provider configuration.
- Validasi payload settings belum strict/whitelisted.
- Mutasi settings/channel/account dan audit belum atomik.
- UI meminta audit `penerimaan_settings`, sedangkan backend menulis entity type lain.
- `updated_by` dibaca dari field yang tidak tersedia.

---

### Task 1: Canonical operational policy and active-channel guard

**Files:**
- Modify: `server/penerimaan-permissions.js`
- Modify: `server/penerimaan-service.js`
- Modify: `server/repository.js`
- Modify: `server/penerimaan-permissions.test.js`
- Modify: `server/penerimaan-mutations.integration.test.js`
- Modify: `server/penerimaan-ingestion-reconciliation.integration.test.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`

**Interfaces:**
- Produces: `getPenerimaanOperationalPolicy(db): Promise<{ approval_threshold: number; auto_reconcile_tolerance: number; require_evidence_manual: boolean }>`.
- Produces: `assertActivePenerimaanChannel(db, channelCode): Promise<PenerimaanChannelRow>`.
- Changes: `validatePenerimaanTransition({ currentStatus, action, actor, transaction, settings })` must pass `settings` to `requiresLeaderApproval`.
- Consumes: existing `getPenerimaanSettings`, `requiresLeaderApproval`, and transaction mutation functions.

- [ ] **Step 1: Add failing policy tests**

Add tests using a custom threshold of `2_000_000` and a transaction amount of `3_000_000`:

```js
test('single validation uses the persisted approval threshold', async () => {
  await updatePenerimaanSettings({ approval_threshold: 2_000_000 }, admin, db);
  const tx = await seedPendingTransaction(db, { amount: '3000000', is_manual: false });
  const result = await validatePenerimaanTransactionById({ id: tx.id, actor: staff }, db);
  assert.equal(result.status, 'Menunggu Approval');
});

test('bulk validation does not bypass the persisted approval threshold', async () => {
  await updatePenerimaanSettings({ approval_threshold: 2_000_000 }, admin, db);
  const tx = await seedPendingTransaction(db, { amount: '3000000', is_manual: false });
  const result = await bulkValidatePenerimaanTransactions({ transaction_ids: [tx.id], actor: staff }, db);
  assert.equal(result.validated_count, 0);
  assert.match(result.failed_ids[0].reason, /persetujuan Kepala Bagian/i);
});
```

Add equivalent assertions for webhook, portal, CSV/XLSX import, and manual risk metadata. Add tests proving disabled channels return status 400/422 before any transaction is inserted.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
node --test server/penerimaan-permissions.test.js server/penerimaan-mutations.integration.test.js server/penerimaan-ingestion-reconciliation.integration.test.js server/penerimaan-reporting-settings.integration.test.js
```

Expected: the custom-threshold and inactive-channel cases fail because the baseline uses defaults or does not check channel state.

- [ ] **Step 3: Implement one policy path**

Implement settings retrieval once per mutation boundary and pass it explicitly:

```js
const settings = await getPenerimaanOperationalPolicy(db);
const transition = validatePenerimaanTransition({
  currentStatus: tx.status,
  action: PENERIMAAN_ACTIONS.VALIDATE,
  actor,
  transaction: tx,
  settings,
});
```

Use `assertActivePenerimaanChannel` before inserts in manual intake, import, webhook processing, and portal processing. Do not cache operational settings across requests.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2. Confirm all policy and channel tests pass without changing the expected workflow.

- [ ] **Step 5: Inspect for remaining hardcoded workflow thresholds**

Run:

```powershell
rg -n "10_000_000|10000000|requiresLeaderApproval\(" server
```

Every remaining match must be a documented default, seed, or test fixture—not an operational decision path.

---

### Task 2: Portal status, payment time, and concurrent idempotency

**Files:**
- Modify: `server/webhook-verification.js`
- Modify: `server/index.js`
- Modify: `server/repository.js`
- Modify: `server/webhook-verification.test.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`
- Modify: `server/penerimaan-ingestion-reconciliation.integration.test.js`

**Interfaces:**
- Produces: `classifyProviderPaymentStatus(provider, payload): 'succeeded' | 'pending' | 'failed'`.
- Changes: `normalizeWebhookPayload` must prefer `payment_time` before fallback timestamp fields.
- Changes: `recordRawWebhookEvent` must rely on the unique idempotency constraint using conflict-safe insertion.
- Changes: `processRawWebhookEvent` must serialize processing and recover an existing transaction after a concurrent provider-reference conflict.

- [ ] **Step 1: Add failing status and timestamp tests**

```js
for (const status of ['pending', 'failed', 'expired', 'cancelled', 'canceled', 'denied', 'refund', 'unknown']) {
  test(`portal callback does not ingest ${status} payment`, async () => {
    const response = await postSignedPortalCallback({ payment_status: status });
    assert.notEqual(response.status, 200);
    assert.equal(await countPenerimaanTransactions(db), 0);
  });
}

test('portal callback uses payment_time as transaction_date', async () => {
  const response = await postSignedPortalCallback({
    payment_status: 'paid',
    payment_time: '2026-08-31T23:00:00.000Z',
  });
  assert.equal(response.status, 200);
  const tx = await findTransactionByProviderRef(db, response.body.data.transaction.provider_ref);
  assert.equal(new Date(tx.transaction_date).toISOString(), '2026-08-31T23:00:00.000Z');
});
```

Use an actually valid timestamp in the final fixture and assert its exact ISO value. Add a barrier-based test that starts two identical signed callbacks together and asserts one raw event, one transaction, and no 500 response.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test server/webhook-verification.test.js server/penerimaan-ingestion-reconciliation.integration.test.js server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 3: Implement provider-aware status classification**

Only explicit final-success values such as `paid`, `settlement`, `settled`, or the provider's documented equivalent may return `succeeded`. Missing and unknown values must fail closed. Pending must remain non-ingested and failed terminal statuses must be recorded without creating a transaction.

Use the timestamp precedence:

```js
const rawTransactionDate =
  payload.payment_time ??
  payload.settlement_time ??
  payload.transaction_time ??
  payload.transaction_date ??
  payload.created_at;
```

- [ ] **Step 4: Replace check-then-insert idempotency**

For PostgreSQL, use the equivalent of:

```sql
INSERT INTO penerimaan_raw_events (...)
VALUES (...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *
```

If no row is returned, fetch the existing row and return `duplicate: true`. Preserve SQLite test-adapter compatibility. At transaction insertion, catch only the provider/channel/reference unique conflict, fetch the existing transaction, and return an idempotent result. Re-throw unrelated database errors.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run Step 2 and confirm delayed-payment and concurrent-duplicate assertions pass.

---

### Task 3: Canonical report filters, dataset, freshness, and PII projection

**Files:**
- Create: `server/penerimaan-report-query.js`
- Create: `server/penerimaan-report-query.test.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`

**Interfaces:**
- Produces: `normalizePenerimaanReportFilters(input, now = new Date()): CanonicalReportFilters`.
- Produces: `buildPenerimaanReportWhere(filters, alias = 't'): { sql: string; values: unknown[] }`.
- Produces: `getPenerimaanReportDataset(filters, options, db): Promise<{ rows; next_cursor; snapshot_at }>`.
- Produces: preview projection with no raw NIK, phone, or email.
- Consumes: the same normalized filter object in summary, preview, export, and Penyaluran reporting where applicable.

Canonical fields:

```ts
type CanonicalReportFilters = {
  start_date?: string;
  end_date?: string;
  fund_type?: string;
  channel?: string;
  account_id?: string;
  muzakki_id?: string;
  muzakki_search?: string;
  program_id?: string;
  program_search?: string;
  mode?: 'all' | 'manual' | 'digital';
  view?: 'transactions' | 'exceptions' | 'reconciliation' | 'audit';
  reconciliation_status?: 'pending' | 'reconciled' | 'posted';
};
```

- [ ] **Step 1: Add unit tests for every filter**

Assert normalized dates, strict enums, parameterized SQL, account, Muzakki, program, manual/digital, exception, reconciliation, and audit semantics. Unknown view/mode values must produce status 400 rather than silently widening a report.

- [ ] **Step 2: Add an integration parity test**

Seed rows deliberately separated by account, Muzakki, program, status, manual flag, risk flag, and date. For one combined filter, assert:

```js
assert.equal(summary.kpis.total_count, allExportRows.length);
assert.equal(String(summary.kpis.total_amount), sumMoneyExact(allExportRows));
assert.deepEqual(
  summary.preview_transactions.map((row) => row.id),
  allExportRows.slice(0, summary.preview_transactions.length).map((row) => row.id)
);
```

Serialize the preview response and assert it does not contain seeded raw identity number, phone, or email.

- [ ] **Step 3: Run tests and confirm RED**

```powershell
node --test server/penerimaan-report-query.test.js server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 4: Implement the canonical query specification**

Both aggregate and row queries must consume `buildPenerimaanReportWhere`. Do not duplicate filter condition assembly. Audit view must query `penerimaan_audit_events` scoped to Penerimaan and return an explicit row shape instead of pretending audit rows are transactions.

Compute `snapshot_at` from the query snapshot/max relevant update timestamp. Remove hardcoded `Real-time` labels from backend metadata.

- [ ] **Step 5: Implement safe projections**

Preview must omit raw identity, phone, and email. Export may use internally masked values, but its public job/status response must never include source PII. Never return raw `m.identity_number` or `m.phone` in `/api/penerimaan/laporan`.

- [ ] **Step 6: Run tests and confirm GREEN**

Run Step 3. Verify filter parity and serialized-response PII assertions.

---

### Task 4: Exact money export and complete PDF/XLSX output

**Files:**
- Modify: `server/penerimaan-export.js`
- Modify: `server/penerimaan-export.test.js`
- Modify: `server/repository.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`

**Interfaces:**
- Produces: `parseMoneyInteger(value): bigint`.
- Produces: `formatMoneyInteger(value): string` using grouping without `Number`.
- Changes: PDF and XLSX consume the full canonical export dataset and the same summary snapshot.

- [ ] **Step 1: Add failing exactness and completeness tests**

```js
test('export preserves amounts above Number.MAX_SAFE_INTEGER', async () => {
  const amount = '900719925474099312345';
  const xlsx = await generatePenerimaanExcelReport({
    transactions: [{ id: 1, amount, fee_amount: '0', net_amount: amount }],
    summary: { total_amount: amount, total_count: 1 },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx);
  assert.equal(String(workbook.getWorksheet('Buku Besar Transaksi').getCell('K2').value), amount);
});
```

Add PDF tests with more than 100 rows and XLSX tests with more than 1,000 rows. Extract/read output and assert the last transaction is present. Test that PDF text contains the Kota Tangerang address and does not contain `Matraman` or `Jakarta Timur`.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test server/penerimaan-export.test.js server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 3: Remove unsafe money conversions and row caps**

Replace money reductions with BigInt:

```js
const total = transactions.reduce(
  (sum, tx) => sum + parseMoneyInteger(tx.amount),
  0n
);
const average = count > 0 ? total / BigInt(count) : 0n;
```

For XLSX, write unsafe integer values as text cells. Do not rely on Excel's floating-point numeric storage for values longer than its exact precision.

- [ ] **Step 4: Implement repeating PDF headers**

Extract a `drawTableHeader(doc, y)` helper. Call it on the first page and immediately after every `doc.addPage()`. Print every filtered row; do not use `slice(0, 100)`. Keep sign-off on a separate safe area/page.

Use this header address:

```text
Jl. Nyimas Melati No. 21A, Sukarasa, Kec. Tangerang, Kota Tangerang, Banten 15117
```

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run Step 2 and inspect the row counts and exact digit assertions.

---

### Task 5: Single export-job lifecycle

**Files:**
- Modify: `server/schema.sql`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/penerimaan.ts`
- Modify: `frontend-next/lib/api/penerimaan.test.ts`

**Interfaces:**
- Produces: `createPenerimaanExportJob(...)` with status `queued`.
- Produces: `markPenerimaanExportJobProcessing(jobId, actor, db)`.
- Produces: `completePenerimaanExportJob(jobId, { fileName, fileSize }, db)`.
- Produces: `failPenerimaanExportJob(jobId, safeMessage, db)`.
- Changes: download updates the requested job and never calls create-job again.

- [ ] **Step 1: Add failing lifecycle tests**

Assert:

```js
assert.equal(createdJob.status, 'queued');
assert.equal(createdJob.completed_at, null);

const response = await downloadExport(createdJob.job_uuid);
assert.equal(response.status, 200);

const updatedJob = await getPenerimaanExportJob(createdJob.job_uuid, db);
assert.equal(updatedJob.status, 'completed');
assert.equal(updatedJob.file_size, response.body.length);
assert.ok(updatedJob.completed_at);
assert.equal(await countExportJobs(db), 1);
```

Inject a generator failure and assert the same job becomes `failed`. Add 404, invalid format, cross-user/division, and two-concurrent-download cases.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
node --test server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 3: Implement guarded transitions**

Use conditional updates so only legal state changes succeed:

```sql
UPDATE penerimaan_export_jobs
SET status = 'processing', error_message = NULL
WHERE job_uuid = $1 AND status IN ('queued', 'failed')
```

After generating the buffer, update the same row to `completed`. On catch, sanitize the message, mark the same row `failed`, and then return the appropriate HTTP error. Do not create persistent file storage in this task.

- [ ] **Step 4: Remove the second job creation from download**

Delete both download-path calls that create a new PDF/XLSX job. The URL format must not override a conflicting stored job format.

- [ ] **Step 5: Run tests and confirm GREEN**

Run Step 2 and verify the database contains one job per requested export.

---

### Task 6: Filtered Posted aggregates for Penyaluran

**Files:**
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`

**Interfaces:**
- Changes: `getPenerimaanAggregatesForPenyaluran(filters, db)` supports `period`, `start_date`, `end_date`, `fund_type`, and `channel` while always enforcing `status = 'Posted'`.

- [ ] **Step 1: Add failing aggregate-filter tests**

Seed Posted and non-Posted transactions across dates, fund types, and channels. Assert each individual filter and a combined filter. Include an amount above `Number.MAX_SAFE_INTEGER` and compare its exact string representation.

- [ ] **Step 2: Run test and confirm RED**

```powershell
node --test server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 3: Apply filters in parameterized SQL**

Start every query with `t.status = 'Posted'`; append only validated filters. Do not retrieve all Posted rows and filter them in JavaScript. Aggregate retrieved money through BigInt.

- [ ] **Step 4: Run test and confirm GREEN**

Run Step 2 and confirm pending, rejected, disputed, and out-of-filter rows remain excluded.

---

### Task 7: Complete settings CRUD, provider-secret lifecycle, and atomic audit

**Files:**
- Create: `server/penerimaan-provider-secrets.js`
- Create: `server/penerimaan-provider-secrets.test.js`
- Modify: `server/schema.sql`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `server/penerimaan-schema.test.js`
- Modify: `server/penerimaan-reporting-settings.integration.test.js`
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/penerimaan.ts`
- Modify: `frontend-next/lib/api/penerimaan.test.ts`
- Modify: `frontend-next/components/penerimaan/pengaturan/SettingsWorkspace.tsx`
- Modify: `frontend-next/components/penerimaan/pengaturan/SettingsWorkspace.test.tsx`

**Interfaces:**
- Produces: create/update/list operations for channels, accounts, fund categories, and provider configuration.
- Produces: strict payload parsers that reject unknown properties.
- Produces: write-only secret rotation; responses expose only `has_secret`, `secret_masked`, and `secret_updated_at`.
- Changes: all settings-area audit events use `entity_type = 'penerimaan_settings'`.
- Changes: every mutation and its audit event execute inside the same `withTransaction` callback.

- [ ] **Step 1: Add failing validation and CRUD tests**

Cover:

```js
await assert.rejects(
  updatePenerimaanSettings({ require_evidence_manual: 'false' }, admin, db),
  /boolean/i
);
await assert.rejects(
  updatePenerimaanSettings({ auto_reconcile_tolerance: -1 }, admin, db),
  />= 0|tidak boleh negatif/i
);
await assert.rejects(
  updatePenerimaanSettings({ unexpected_key: true }, admin, db),
  /tidak dikenal|unknown/i
);
```

Add create/edit/enable/disable tests for channels, accounts, and fund categories. Add provider-secret rotation tests proving plaintext, ciphertext, IV, tag, and signature do not appear in API JSON or audit JSON.

- [ ] **Step 2: Add rollback tests**

For settings, channel, account, fund category, and provider config, set `actor.__simulateAuditFailure = true`, attempt the mutation, then read the database and assert no field changed and no partial audit exists.

- [ ] **Step 3: Run backend tests and confirm RED**

```powershell
node --test server/penerimaan-provider-secrets.test.js server/penerimaan-schema.test.js server/penerimaan-reporting-settings.integration.test.js
```

- [ ] **Step 4: Add additive rerunnable schema**

Add a `penerimaan_fund_categories` table and provider configuration fields/table with `CREATE TABLE IF NOT EXISTS` and additive migrations compatible with PostgreSQL and the test adapter. Historical transaction rows must not be deleted when a category is disabled.

- [ ] **Step 5: Implement strict payload parsers**

Use explicit allowed-key sets. Boolean fields must satisfy `typeof value === 'boolean'`. Threshold must be a positive safe integer; tolerance must be an integer `>= 0`. Trim and length-check strings; validate all enums and referenced IDs.

- [ ] **Step 6: Implement secret handling**

Use authenticated encryption with a production-required environment key. Accept a new secret only as a write-only request field. An empty edit field preserves the existing secret. Never return or audit plaintext/ciphertext. The webhook route may read the decrypted secret internally and pass it explicitly to signature verification.

- [ ] **Step 7: Make mutation and audit atomic**

Structure every mutation as:

```js
return withTransaction(dbOverride, async (db) => {
  const previous = await readCurrentRowForUpdate(db, id);
  await applyMutation(db, validatedPayload);
  await recordPenerimaanAuditEvent(db, {
    entity_type: 'penerimaan_settings',
    entity_id: `channel:${id}`,
    action: 'update_channel',
    actor,
    changes: redactSecrets({ old_values: previous, new_values: validatedPayload }),
  });
  return readUpdatedRow(db, id);
});
```

Use analogous entity IDs for `operational_settings`, `account:<id>`, `fund_category:<id>`, and `provider_config:<id>`.

- [ ] **Step 8: Fix updated_by**

Return the stored actor name from validated JSON or add an explicit users join. Do not reference `row.updated_by_name` unless that field is actually selected. Test that the Admin name survives a read-after-update.

- [ ] **Step 9: Implement frontend forms**

SettingsWorkspace must provide accessible create/edit forms for channels, accounts, fund categories, and provider configurations. Provider secret input starts blank and says that blank preserves the current secret. Add loading, validation, success/error, focus restoration, and mobile assertions.

- [ ] **Step 10: Run backend and frontend focused tests**

```powershell
node --test server/penerimaan-provider-secrets.test.js server/penerimaan-schema.test.js server/penerimaan-reporting-settings.integration.test.js
Set-Location frontend-next
npm test -- --run components/penerimaan/pengaturan/SettingsWorkspace.test.tsx lib/api/penerimaan.test.ts
Set-Location ..
```

---

### Task 8: ReportWorkspace canonical filters and job UX

**Files:**
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/penerimaan.ts`
- Modify: `frontend-next/lib/api/penerimaan.test.ts`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.test.tsx`

**Interfaces:**
- Consumes: `CanonicalReportFilters`, report preview response, and export job lifecycle from Tasks 3 and 5.
- Produces: one frontend filter object used unchanged for preview and job creation.

- [ ] **Step 1: Add failing UI/API tests**

Interact with controls for account, Muzakki, program/campaign, manual/digital, exception, reconciliation, and audit. Capture the preview request and generate payload:

```ts
expect(generatePayload.filters).toEqual(previewQuery);
```

Assert preview uses `/api/penerimaan/laporan`, never the generic transaction endpoint. Assert job states queued, processing, completed, and failed render understandable Indonesian status/error copy.

- [ ] **Step 2: Run tests and confirm RED**

```powershell
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx lib/api/penerimaan.test.ts
Set-Location ..
```

- [ ] **Step 3: Implement one filter state**

Store a single typed `CanonicalReportFilters` object. Use it for preview and `generateReport`. Download only through the returned job ID. Do not derive a second reduced metadata object that drops Muzakki/account/program/view filters.

- [ ] **Step 4: Keep the layout responsive and navigation unchanged**

Use existing Penerimaan responsive patterns. Do not add a sixth navbar item. Audit remains a report view and settings remains under the existing profile/settings route.

- [ ] **Step 5: Run tests and confirm GREEN**

Run Step 2, then:

```powershell
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx components/penerimaan/pengaturan/SettingsWorkspace.test.tsx lib/api/penerimaan.test.ts
Set-Location ..
```

---

### Task 9: Full verification, diff audit, and single commit

**Files:**
- Restore if generated-only: `frontend-next/tsconfig.tsbuildinfo`
- Review: every file changed since `6f6eac7`

**Interfaces:**
- Produces: one verified Task 11 hardening commit and an evidence-based handoff report.

- [ ] **Step 1: Run full backend tests**

```powershell
node --test server/*.test.js
```

Record exact pass/fail totals and exit code.

- [ ] **Step 2: Run full frontend tests**

```powershell
Set-Location frontend-next
npm test -- --run
npm run typecheck
npm run build
Set-Location ..
```

Record exact pass/fail totals and every exit code.

- [ ] **Step 3: Restore generated build metadata**

If `frontend-next/tsconfig.tsbuildinfo` differs only because tests/typecheck/build regenerated it, restore its pre-Task-11 content without resetting any other file. Verify it no longer appears as an unintended diff.

- [ ] **Step 4: Search for known regression signatures**

```powershell
rg -n "10_000_000|10000000|Number\(|slice\(0, 100\)|Real-time|Matraman|Jakarta Timur|entity_type: 'settings'|entity_type: 'channel'|entity_type: 'account'" server frontend-next
git diff --check
git status --short
git diff --stat
```

Classify every remaining match. Fix operational hardcoding, unsafe money conversions, stale addresses, mismatched audit entity types, and export caps before continuing.

- [ ] **Step 5: Review acceptance coverage**

Map each requirement to a named test:

- custom threshold across all intake/validation paths;
- inactive-channel rejection;
- portal status and payment time;
- concurrent callback idempotency;
- canonical report parity;
- account/Muzakki/program/manual/exception/reconciliation/audit filters;
- PII omission;
- full PDF/XLSX row coverage;
- BigInt exactness;
- single export-job lifecycle;
- filtered Posted aggregation;
- complete settings CRUD;
- provider-secret masking;
- audit rollback atomicity;
- updated_by correctness;
- responsive frontend behavior.

- [ ] **Step 6: Commit once**

```powershell
git add PENERIMAAN_REBUILD_PLAN.txt server frontend-next docs/superpowers/plans/2026-09-10-penerimaan-task-11-hardening.md
git commit -m "fix(penerimaan): harden Task 11 reporting and settings"
git status --short --branch
```

Do not mark Task 11 accepted in `PENERIMAAN_REBUILD_PLAN.txt` until every full verification command passes. Do not push or deploy.

---

## Required final report

Report:
- commit hash and final working-tree status;
- files created/modified;
- exact backend and frontend test totals;
- typecheck, build, and `git diff --check` exit status;
- requirement-to-test mapping;
- available routes/endpoints after hardening;
- schema changes;
- evidence that export is not truncated;
- evidence Mahl values above `Number.MAX_SAFE_INTEGER` remain exact;
- evidence two concurrent callbacks create one transaction;
- evidence audit failure rolls back each settings mutation;
- remaining blockers or risks based on evidence.
