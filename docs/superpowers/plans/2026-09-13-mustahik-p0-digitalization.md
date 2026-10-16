# Mustahik P0 Digitalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authoritative Next.js Mustahik flow that captures, reviews, approves, pays, confirms, and proves Assessment, MPZIS, and PPD records without Excel, synthetic UI truth, or legacy write paths.

**Architecture:** PostgreSQL remains authoritative. Focused services under `server/penyaluran-p0/` own transactions, state machines, canonical snapshots, permissions, immutable evidence, and receipt generation; Express routes only authenticate and map transport errors. `frontend-next` becomes the only operational writer and consumes one typed case-progress API plus artifact-specific commands.

**Tech Stack:** Node.js 26 test runner, Express 5, PostgreSQL/`pg`, `pg-mem` for isolated service tests, PDFKit, Multer, Next.js 16, React 19, TypeScript 5.8, Tailwind CSS 4, Vitest, Testing Library.

## Global Constraints

- The authoritative Assessment source is `Assesnment Langsung Mustahik (1).pdf`; its two identical print blocks are one stored Assessment rendered twice.
- Assessment has no score. P0 rejects score-like input and renders every absent source value as `Belum dicatat`.
- Electronic events bind authenticated actor id, name, role, level, division, server timestamp, and canonical SHA-256 snapshot hash; P0 has no signature images.
- MPZIS has five ordered approvals—`proposed`, `examined`, `ashnaf_verified`, `responsible_acknowledged`, `approved`—by five distinct users, excluding creator and submitter.
- PPD has one to three non-empty RAB lines; its total is calculated on the server and cannot exceed the approved MPZIS amount.
- Finance check and finance approval use different actors; payment recorder and verifier use different actors.
- `Penyaluran Selesai` requires exact amount equality, immutable verified payment proof, recipient confirmation, and full-chain hash revalidation.
- `frontend-next` is canonical. Legacy Vite under `src/` is frozen, not extended.
- P0 cases and provenance are never hard-deleted. Archive/restore is reversible and audited; artifact relations use restrictive foreign keys.
- Tests never mutate production. Service tests use `pg-mem`; migration parity and dry-run tests require a dedicated PostgreSQL database whose name ends in `_test`.
- Production field encryption fails closed when `PENYALURAN_FIELD_ENCRYPTION_KEY` is missing or invalid.
- P0 stays behind `PENYALURAN_P0_ENABLED=false` until masked UAT and an explicit production-cutover approval.

---

## Execution preflight

- [ ] Use `superpowers:using-git-worktrees` from `D:\BAZNAS\data-center` and create an isolated worktree on `codex/mustahik-p0-digitalization` only from the exact dispatch SHA pinned externally in the root/task brief after this plan commit; `HEAD` must equal that dispatch SHA, `git merge-base --is-ancestor f7ccd0a HEAD` must succeed, and `68df0a0` is not a valid base. Before any implementation task starts, verify the plan file exists inside the worktree and do not compare its blob to a hash embedded in this plan (the external dispatch SHA is the authority, so this rule remains valid after plan revisions).
- [ ] Verify the isolated worktree starts clean with `git status --short --branch`; do not copy `frontend-next/tsconfig.tsbuildinfo` into it.
- [ ] Record this safe backend baseline command in the task log; it is an explicit pure/in-memory list and must not be replaced by root `npm test`:

```text
node --test server/access-control.integration.test.js server/access-policy.test.js server/audit-log.test.js server/health.test.js server/penerimaan-export.test.js server/penerimaan-legacy-freeze.test.js server/penerimaan-permissions.test.js server/penerimaan-service.test.js server/penyaluran-permissions.test.js server/penyaluran-transactions.repository.test.js server/penyaluran-workflow.integration.test.js server/public-tracking.repository.test.js server/repository.metrics.test.js server/request-rate-limit.test.js server/runtime-policy.test.js server/webhook-verification.test.js server/workflow-integrity.test.js
```

These 17 tests do not call `initDb()`; `repository.metrics.test.js` uses only `:memory:` SQLite/pg-mem fixtures, and `runtime-policy.test.js` injects its unavailable pool. Also record `npm --prefix frontend-next test`, `npm --prefix frontend-next run typecheck`, and `npm --prefix frontend-next run build`. Root `npm test` is deferred until Task 1 creates a safe unit/integration separation and must never run against implicit `.env`; any prior inconclusive baseline output is not evidence.
- [ ] If a safe baseline command fails, save its exact output and stop before changing product code; the implementation must not absorb an unrelated failure.
- [ ] Set test-only directories with `PENYALURAN_ARTIFACT_DIR` under the OS temporary directory and use a disposable `P0_TEST_DATABASE_URL` ending in `_test`; never point tests or migration dry-runs at the VPS database.

## File and interface map

### Backend modules

- `server/migrations/20260913_001_mustahik_p0.sql` — additive schema, restrictive foreign keys, deterministic legacy backfill, indexes, and checks.
- `server/penyaluran-p0/migration-runner.js` — lexical migration execution, advisory lock, checksum ledger, and read-only dry-run report.
- `server/penyaluran-p0/errors.js` — stable service error codes/statuses and Express error envelopes.
- `server/penyaluran-p0/canonical-snapshot.js` — NFC canonical JSON, decimal/date normalization, and SHA-256.
- `server/penyaluran-p0/validation.js` — pure Assessment, MPZIS, PPD, payment, and confirmation validation.
- `server/penyaluran-p0/permissions.js` — exact role/level/division capabilities and segregation checks.
- `server/penyaluran-p0/field-encryption.js` — AES-256-GCM bank-account encryption and masking.
- `server/penyaluran-p0/money.js` — exact two-decimal arithmetic and Indonesian terbilang.
- `server/penyaluran-p0/repository.js` — row locks, revision reads/writes, projections, idempotency, and append-only events.
- `server/penyaluran-p0/assessment-service.js` — Assessment draft/submit/review/correction state machine.
- `server/penyaluran-p0/mpzis-service.js` — MPZIS draft/submit/five approvals/return state machine.
- `server/penyaluran-p0/ppd-service.js` — PPD draft/RAB/save/submit/finance state machine.
- `server/penyaluran-p0/artifact-files.js` — magic-byte validation, quotas, immutable storage, secure audited streaming.
- `server/penyaluran-p0/payment-service.js` — payment record, proof binding, verification, recipient confirmation.
- `server/penyaluran-p0/completion-service.js` — locked full-chain revalidation, completion, and receipt enqueue.
- `server/penyaluran-p0/receipt-renderer.js` — deterministic Bukti Digital Penyaluran bytes from persisted snapshots.
- `server/penyaluran-p0/receipt-jobs.js` — idempotent persisted receipt generation and failure state.
- `server/penyaluran-p0/case-read-model.js` — masked case progress, capabilities, documents, and chronological history.
- `server/penyaluran-p0/legacy-reconciliation.js` — compatibility classification, audited reconciliation, archive/restore.
- `server/penyaluran-p0/routes.js` — all P0 endpoints and stable HTTP mapping.

### Frontend modules

- `frontend-next/lib/api/penyaluran-p0-types.ts` — exact case/artifact/event/payload types.
- `frontend-next/lib/api/client.ts` — typed P0 methods and authenticated blob retrieval.
- `frontend-next/components/penyaluran/mustahik/case/*` — case orchestration and server-truth progress.
- `frontend-next/components/penyaluran/mustahik/shared/*` — errors, money, status, approvals, irreversible confirmation.
- `frontend-next/components/penyaluran/mustahik/assessment/*` — source-order Assessment draft/review.
- `frontend-next/components/penyaluran/mustahik/mpzis/*` — MPZIS form and five-step approvals.
- `frontend-next/components/penyaluran/mustahik/ppd/*` — PPD/RAB, finance, payment, confirmation, receipt.
- `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx` — queue shell only; no synthetic truth or generic gate-skipping decision.

### Stable service context

All state-changing services consume this context; do not invent per-service actor or concurrency shapes:

```js
/** @typedef {{id:string|number,name:string,role:string,level:string,division:string}} P0Actor */
/** @typedef {{expected_status:string,expected_version:number,expected_revision:number,expected_snapshot_hash:string|null,idempotency_key:string,note:string}} P0CommandMeta */
/** @typedef {{db:object,actor:P0Actor,now:Date,correlationId:string,artifactDir:string,encryptionKey?:Buffer}} P0ServiceContext */
```

All errors use `new P0Error(code, status, message, fieldErrors?)`. All successful commands return `{ data, replayed:boolean, correlation_id:string }`.

## Shared-file expansion boundary

Tasks that modify the shared integration files `server/index.js`, `server/db.js`, `server/schema.sql`, `server/repository.js`, `server/penyaluran-p0/routes.js`, `frontend-next/lib/api/client.ts`, `frontend-next/lib/api/types.ts`, `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`, `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`, or `package.json` execute **serially under one named owner**. These are the high-contention files: later tasks may extend any of them only serially after the prior owner's commit has been accepted. The root coordinator assigns ownership before dispatch, waits for that owner to commit, then releases the file before another task may edit it. Parallel Luna agents may work only on disjoint new files and may not stage, format, or commit a shared file owned by another task. Integration commits are cherry-picked in dependency order; a reviewer never edits implementation files in place.

---

### Task 1: Versioned migration runner and disposable database guard

**Files:**
- Create: `server/penyaluran-p0/migration-runner.js`
- Create: `server/penyaluran-p0-migration-runner.test.js`
- Modify: `server/db.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `runPendingMigrations({pool,migrationsDir})`, `readMigrationFiles(migrationsDir)`, `migrationChecksum(sql)`, `assertDisposableTestDatabaseUrl(url)`, `collectP0MigrationDryRun(db)`.
- Consumes: existing PostgreSQL pool from `getPool()`; no product table changes yet.

- [ ] **Step 1: Write failing checksum, ordering, and URL-guard tests**

```js
test('readMigrationFiles sorts lexical SQL versions and hashes exact bytes', async () => {
  assert.deepEqual(files.map((x) => x.version), ['20260913_001', '20260913_002']);
  assert.equal(files[0].checksum, createHash('sha256').update(files[0].sql).digest('hex'));
});

test('assertDisposableTestDatabaseUrl rejects non-test databases', () => {
  assert.throws(() => assertDisposableTestDatabaseUrl('postgres://u:p@host/baznas_db'), /_test/);
  assert.doesNotThrow(() => assertDisposableTestDatabaseUrl('postgres://u:p@127.0.0.1/baznas_p0_test'));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test server/penyaluran-p0-migration-runner.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `migration-runner.js`.

- [ ] **Step 3: Implement lexical loading, exact-byte SHA-256, advisory lock, and checksum refusal**

```js
export async function runPendingMigrations({ pool, migrationsDir }) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [20260913001]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(40) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    for (const migration of await readMigrationFiles(migrationsDir)) {
      const applied = (await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [migration.version])).rows[0];
      if (applied && applied.checksum !== migration.checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.version}`);
      if (applied) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [migration.version, migration.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [20260913001]).catch(() => {});
    client.release();
  }
}
```

- [ ] **Step 4: Add a PostgreSQL-only runner boundary and a non-mutating dry-run script**

Make `runPendingMigrations` reject adapters where `db.isPg !== true` with `P0_MIGRATIONS_REQUIRE_POSTGRES`; `initDb()` must never execute, emulate, or partially apply a P0 migration on SQLite. Add `"p0:migration:dry-run": "node server/penyaluran-p0/migration-runner.js --dry-run"`; dry-run must require a real PostgreSQL connection, call `assertDisposableTestDatabaseUrl` in test mode, and emit counts for statuses, orphans, duplicate identifiers, invalid amounts, cascading foreign keys, and in-flight legacy cases without executing DDL.

The final `initDb()` order is fixed and covered by a call-order test: (1) connect and identify adapter; (2) if SQLite, run only the existing legacy/local inline bootstrap and return with P0 disabled; (3) if PostgreSQL and no application tables exist, execute `server/schema.sql`; (4) run lexical versioned migrations and checksum verification; (5) verify required P0 schema when the flag is enabled; (6) run existing non-P0 compatibility initialization; (7) seed only after all schema work commits; (8) allow `startServer()` to listen only after `initDb()` resolves. A failed migration/checksum/schema verification rejects startup before seed/listen.

- [ ] **Step 5: Run focused and baseline backend tests**

Run: `node --test server/penyaluran-p0-migration-runner.test.js`

Expected: PASS for ordering, checksum mismatch, transaction rollback, lock release, idempotent replay, and disposable URL guard.

Also assert SQLite receives zero advisory-lock, migration-file, and `schema_migrations` queries, and PostgreSQL startup records `schema.sql → migrations → compatibility → seed → listen` in that order.

Run the exact 17-file safe backend command from the Execution preflight above; do not run root `npm test` against implicit `.env`.

Expected: the pure/in-memory backend baseline PASS before the migration file exists.

- [ ] **Step 6: Commit the runner**

```bash
git add package.json server/db.js server/penyaluran-p0/migration-runner.js server/penyaluran-p0-migration-runner.test.js
git commit -m "feat(penyaluran): add versioned migration runner"
```

---

### Task 2: P0 schema, restrictive retention, and fresh/upgrade parity

**Files:**
- Create: `server/migrations/20260913_001_mustahik_p0.sql`
- Create: `server/migration-parity.test.js`
- Create: `server/penyaluran-p0-migration.test.js`
- Modify: `server/schema.sql`
- Modify: `server/db.js`

**Interfaces:**
- Consumes: `runPendingMigrations`, `assertDisposableTestDatabaseUrl` from Task 1.
- Produces: identical final schemas for a fresh database and upgraded pre-P0 fixture; all tables required by later repositories.

- [ ] **Step 1: Write failing pg-mem legacy-mapping and restrictive-FK assertions**

```js
test('migration preserves legacy status and does not synthesize approvals', async () => {
  const before = await db.one(`SELECT status, approved_amount FROM mustahik WHERE id=1`);
  await applyMigration(db);
  assert.deepEqual(await db.one(`SELECT status, approved_amount, workflow_mode FROM mustahik WHERE id=1`), {...before, workflow_mode:'legacy'});
  assert.equal((await db.one(`SELECT status, source FROM assessments WHERE id=10`)).status, 'legacy_unverified');
  assert.equal((await db.one(`SELECT count(*)::int AS count FROM artifact_approvals`)).count, 0);
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `node --test server/penyaluran-p0-migration.test.js`

Expected: FAIL because migration `20260913_001` and P0 tables do not exist.

- [ ] **Step 3: Add additive columns and checks to the versioned migration**

The migration must create/alter exactly these contracts:

```text
mustahik: workflow_mode, created_by_id, legacy_status_snapshot, p0_reconciled_at,
          p0_reconciled_by, archived_at, archived_by_id, archive_reason;
          retain workflow_version and existing created_at
assessments: template_code, template_version, revision, supersedes_id, status, source,
             created_by_id, updated_by_id, submitted_at, reviewed_at,
             husband_in_household/name, wife_in_household/name, child_count,
             house_ownership, home_address, address_matches_ktp, monthly_rent_amount,
             husband_occupation/monthly_income, wife_occupation/monthly_income,
             child_occupation/monthly_support, assistance_request,
             applied_to_baznas_before, previous_application_year, snapshot_json/hash
mpzis: template_code/version, source, revision, supersedes_id, status, created_by_id,
       submitted_by_id, submitted_at, approved_at, address_snapshot,
       marital_status_snapshot, snapshot_json/hash
ppd: template_code/version, source, revision, supersedes_id, mpzis_id, status,
     created_by_id, submitted_at, finance_checked_at, finance_approved_at,
     bank_name, bank_account_ciphertext, bank_account_last4, bank_account_name,
     payment_type_other, snapshot_json/hash, receipt_status, receipt_error
new: artifact_approvals, artifact_files, artifact_access_events, ppd_rab_lines,
     ppd_payments, recipient_confirmations, p0_idempotency_keys,
     mustahik_case_assignments
approval_decisions: artifact_type, artifact_id, artifact_revision, snapshot_hash,
                    evidence_grade DEFAULT 'legacy_unbound'
activity_logs: actor_id, actor_role, actor_level, actor_division, correlation_id
```

Use `NUMERIC(15,2)`, `TIMESTAMPTZ`, conditional checks scoped to `source='p0'`, unique revision keys, partial unique active-revision/number indexes, and `NO ACTION`/`RESTRICT` for every case/artifact FK. Actor FKs may be `SET NULL` only where actor snapshots coexist. Replace permanent Mustahik cascades on `applications`, `assessments`, `mpzis`, `ppd`, `documents`, `wa_logs`, `activity_logs`, and `approval_decisions`.

Set the migration-safe database default for `mustahik.workflow_mode` to `'legacy'` so old/unversioned writers can never accidentally certify a row as P0. The canonical intake service in Task 5 always writes `'p0'` explicitly; after cutover it is the only enabled creator, which fulfills the new-case P0 default at the application boundary. Add a check constraint allowing only `legacy`, `legacy_reconciliation`, or `p0`.

`mustahik_case_assignments` contains `mustahik_id`, `user_id`, `assignment_role`, `assigned_by_id`, `assigned_at`, `ended_at`, with one active row per case/user/role. Surveyor and operational artifact reads require either an active assignment or an explicitly authorized cross-case audit capability. Add database triggers that reject `UPDATE` and `DELETE` on `artifact_approvals` and `artifact_access_events`, and reject `DELETE` on submitted artifact files, payments, and confirmations.

- [ ] **Step 4: Encode deterministic legacy backfill**

Implement and test this exact table-by-table mapping; before/after fixture hashes exclude only newly added columns:

```text
mustahik: set missing workflow_mode='legacy'; preserve status, workflow_version,
          every business value, created_at, and updated_at byte-for-byte;
          leave reconciliation/archive fields null.
applications: preserve every value/link/status/date; change only the Mustahik FK
              delete rule to RESTRICT; never treat rows as approval evidence.
assessments: source='legacy', status='legacy_unverified'; assign revision with
             ROW_NUMBER ordered by created_at,id per mustahik_id/application_id;
             keep score-era columns; leave new source fields/snapshot/hash null.
mpzis: source='legacy', status='legacy_unverified'; assign the same deterministic
       revision order; preserve legacy signer-name strings; create no approvals;
       leave snapshot/hash null.
ppd: source='legacy', status='legacy_unverified'; deterministic revision;
     preserve old numbers/amount/text; leave mpzis_id and structured/hash fields
     null when absent; never qualify rows for finance/completion.
documents: preserve metadata and bytes; change only Mustahik FK to RESTRICT;
           never relabel a generic document as payment/confirmation evidence.
approval_decisions: preserve every row/actor text; set new linkage/hash null and
                    evidence_grade='legacy_unbound'; manufacture no artifact ids.
activity_logs: preserve every row/value; restrictive Mustahik FK; not approval proof.
wa_logs: preserve every row/value; restrictive Mustahik FK; not confirmation proof.
artifact_approvals, artifact_files, artifact_access_events, ppd_rab_lines,
ppd_payments, recipient_confirmations, p0_idempotency_keys,
mustahik_case_assignments: start empty; synthesize no event, file, payment,
                           confirmation, idempotency, or assignment.
```

Add one assertion per table plus a whole-row canonical before/after hash assertion so an omitted legacy column cannot change silently.

- [ ] **Step 5: Make `server/schema.sql` the identical fresh-state contract**

Replace the matching table definitions and FKs in `server/schema.sql`. `server/schema.sql` owns the complete fresh PostgreSQL shape; `20260913_001_mustahik_p0.sql` owns upgrades of an existing PostgreSQL database; inline DDL in `server/db.js` remains only the pre-existing non-P0/SQLite compatibility bootstrap and must contain no P0 table, column, index, trigger, or backfill. On pristine PostgreSQL, `initDb()` loads `server/schema.sql`, then the idempotent migration runner verifies/applies the ledger entry; on existing PostgreSQL it skips fresh-schema loading and runs the migration. SQLite runs neither file and forces P0 disabled.

- [ ] **Step 6: Add real PostgreSQL introspection parity**

`server/migration-parity.test.js` must skip only when `P0_TEST_DATABASE_URL` is absent. When present, require the database name suffix `_test`, create two random schemas, load `server/schema.sql` into one and a pre-P0 fixture plus the versioned migration into the other, then compare `schema_migrations` itself plus `information_schema.columns`, checks, indexes, unique constraints, FK targets, delete rules, append-only triggers, and schema version/checksum rows. The fresh-schema path records `20260913_001` with the same exact migration-byte checksum as the upgrade path. Drop only those two validated random schemas in teardown.

- [ ] **Step 7: Run migration checks**

Run: `node --test server/penyaluran-p0-migration.test.js`

Expected: PASS in pg-mem for mapping and constraints supported by pg-mem.

Run with a disposable PostgreSQL URL: `node --test server/migration-parity.test.js`

Expected: PASS with fresh and upgraded introspection equal; duplicate/orphan fixtures fail before business data are modified.

- [ ] **Step 8: Commit the schema**

```bash
git add server/migrations/20260913_001_mustahik_p0.sql server/schema.sql server/db.js server/migration-parity.test.js server/penyaluran-p0-migration.test.js
git commit -m "feat(penyaluran): add authoritative P0 schema"
```

---

### Task 3: Pure domain primitives—errors, snapshots, money, encryption, validation, permissions

**Files:**
- Create: `server/penyaluran-p0/errors.js`
- Create: `server/penyaluran-p0/canonical-snapshot.js`
- Create: `server/penyaluran-p0/money.js`
- Create: `server/penyaluran-p0/field-encryption.js`
- Create: `server/penyaluran-p0/validation.js`
- Create: `server/penyaluran-p0/permissions.js`
- Create: `server/penyaluran-p0-domain.test.js`
- Modify: `server/access-policy.js`

**Interfaces:**
- Produces: `P0Error`, `canonicalize`, `createSnapshot`, `parseMoney`, `sumMoney`, `terbilangRupiah`, `encryptBankAccount`, `decryptBankAccount`, `maskBankAccount`, `validateAssessment`, `validateMpzis`, `validatePpd`, `validatePayment`, `validateRecipientConfirmation`, `capabilitiesFor`, `assertAllowed`.
- Consumes: exact enums and role matrix in the approved spec.

- [ ] **Step 1: Write fixture-based failing pure tests**

```js
test('canonical snapshot is stable across key order and Unicode composition', () => {
  const a = createSnapshot('assessment', {name:'A\u0301', amount:'1000.00', rows:[{line_no:1}]});
  const b = createSnapshot('assessment', {rows:[{line_no:1}], amount:'1000.0', name:'Á'});
  assert.equal(a.hash, b.hash);
});

test('each artifact fixture includes business evidence and excludes actor/display state', () => {
  for (const fixture of [assessmentFixture,mpzisFixture,ppdFixture,paymentFixture,confirmationFixture,completionFixture]) {
    const snapshot = createSnapshot(fixture.type, fixture.input);
    assert.deepEqual(Object.keys(snapshot.json), fixture.expectedTopLevelKeys);
    assert.equal(snapshot.canonical, fixture.expectedCanonicalUtf8);
    assert.equal(snapshot.hash, fixture.expectedSha256);
    for (const forbidden of ['actor_name','actor_role','created_at','display_label','live_master']) assert.equal(snapshot.canonical.includes(forbidden),false);
  }
});

test('assessment rejects every score-like property', () => {
  for (const key of ['overall_score','house_index','asset_index','income_index','spiritual_score','priority']) {
    assert.equal(validateAssessment({...validAssessment(), [key]: 80}, {mode:'submit'}).field_errors[key], 'FIELD_FORBIDDEN');
  }
});

test('PPD accepts 1..3 RAB rows and calculates exact cents', () => {
  assert.equal(validatePpd(validPpd([{amount:'0.10'},{amount:'0.20'}]), {mpzisCeiling:'1.00'}).total, '0.30');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-domain.test.js`

Expected: FAIL because the six modules are absent.

- [ ] **Step 3: Implement deterministic canonicalization and exact money**

`canonicalize` must recursively sort object keys lexicographically, preserve semantic array order, NFC-normalize every string and object key, reject duplicate keys after NFC normalization, encode absent declared optional fields as `null`, encode booleans literally, encode integer ids/revisions as base-10 numbers, encode money as fixed two-decimal strings, and encode dates/times as UTC ISO 8601 with millisecond precision. Reject `undefined`, functions, non-finite numbers, local-time strings, unrecognized object prototypes, and undeclared fields. Hash the exact canonical UTF-8 bytes with lower-case SHA-256. `parseMoney` converts `"1234.50"` to integer cents `123450n`; no service may sum money with binary floating point.

Create a schema registry used by every service:

```text
common: schema_version, artifact_type, id, revision, mustahik_id, application_id
assessment: common + all 18 persisted source fields + template_code/version/source
mpzis: common + accepted assessment id/revision/hash + every structured form field,
       copied address/marital snapshot + template metadata
ppd: common + approved MPZIS id/revision/hash + numbers/requester snapshot/enums,
     encrypted-account last4/name/bank snapshot + ordered RAB rows + attachments
payment: ppd id/revision/hash + transaction_number + paid_amount + paid_at +
         payment-proof file id/mime/size/sha256
recipient_confirmation: ppd id/revision/hash + method + recipient-name snapshot +
                        confirmed_at + note + optional evidence metadata
completion: all active artifact ids/revisions/hashes + finance event ids/actors +
            payment/confirmation hashes + completion correlation id
```

Explicitly exclude actor/session claims from artifact snapshots, approval events and database event timestamps, display-only labels, live joins/master rows, plaintext NIK/account, receipt bytes, mutable status projections, and server logging metadata. Actor snapshots belong to append-only events; copied business values belong to artifact snapshots.

- [ ] **Step 4: Implement full source validation**

Assessment validation must cover every conditional in spec section 5.2 and current server year. MPZIS must validate exact source/fund/recipient enums, complete address snapshot, confirmed recipient section, accepted Assessment hash, and amount. PPD must reject browser totals/terbilang/requester/actor fields, validate exact enums, explicit section confirmations, structured bank fields, `Lain-lain`, one-to-three RAB rows, positive amounts, and ceiling. Payment/confirmation validators enforce exact amount, four methods, note length 10–1000, and server-bounded timestamps.

- [ ] **Step 5: Implement authorization and segregation**

Add `ROLE.KEUANGAN='keuangan'` to `access-policy.js`. `capabilitiesFor` returns explicit booleans for every row of the role matrix; `assertAllowed` rejects admin routine actions, wrong division/level, Assessment reviewer equal to submitter, MPZIS creator/submitter/reused actor, finance creator/checker collisions, payment recorder/verifier collision, and non-leader completion.

- [ ] **Step 6: Implement AES-256-GCM account protection**

Accept a 32-byte base64 key, generate a random 12-byte IV, store `v1:<iv>:<tag>:<ciphertext>`, and expose only `last4`. Missing/invalid keys throw `FIELD_ENCRYPTION_UNAVAILABLE` in production; tests may inject a fixed test key. Never log plaintext or ciphertext.

- [ ] **Step 7: Run exhaustive pure tests**

Run: `node --test server/penyaluran-p0-domain.test.js`

Expected: PASS for exact canonical strings/SHA-256 for Assessment, MPZIS, PPD, payment, confirmation, and completion; field inclusions/exclusions; Unicode/key-order/decimal/date/null behavior; every Assessment conditional; exact enums; 0/1/3/4 RAB rows; ceiling; terbilang; key failure; masking; roles; step order; distinct actors; and admin override limits.

- [ ] **Step 8: Commit domain primitives**

```bash
git add server/access-policy.js server/penyaluran-p0 server/penyaluran-p0-domain.test.js
git commit -m "feat(penyaluran): add P0 domain invariants"
```

---

### Task 4: Transactional repository kernel and append-only provenance

**Files:**
- Create: `server/penyaluran-p0/repository.js`
- Create: `server/penyaluran-p0-test-helpers.js`
- Create: `server/penyaluran-p0-repository.test.js`

**Interfaces:**
- Produces: `withP0Command(context,meta,handler)`, `lockCase`, `getActiveAssessment`, `getActiveMpzis`, `getActivePpd`, `insertArtifactApproval`, `insertCompatibilityDecision`, `insertActivity`, `reserveIdempotencyKey`, `completeIdempotencyKey`, `assertExpectedState`, `listArtifactHistory`.
- Consumes: `P0Error`, snapshot functions, existing `withTransaction` from `server/db.js`.

- [ ] **Step 1: Create a pg-mem test helper and failing transaction tests**

```js
test('withP0Command rolls back artifact, approval, activity, and projection together', async () => {
  db.failOn(/INSERT INTO activity_logs/);
  await assert.rejects(command(), /audit/);
  assert.equal(await count(db,'artifact_approvals'), 0);
  assert.equal((await caseRow(db)).workflow_version, 0);
});

test('idempotency replay returns original result and payload mismatch is 409', async () => {
  const first = await command({idempotency_key:KEY, note:'same'});
  assert.deepEqual(await command({idempotency_key:KEY, note:'same'}), {...first,replayed:true});
  await assert.rejects(command({idempotency_key:KEY,note:'different'}), hasCode('IDEMPOTENCY_KEY_REUSED'));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-repository.test.js`

Expected: FAIL because repository and pg-mem helper are absent.

- [ ] **Step 3: Implement locked command orchestration**

`withP0Command` starts one transaction, locks `mustahik FOR UPDATE`, verifies expected status/version, reserves `(actor_id,idempotency_key)` against a canonical request hash, locks the active artifact, checks expected revision/hash, runs the handler, writes artifact approval + compatibility decision + activity before the projection update, persists the response for replay, and rolls back all writes on any failure.

- [ ] **Step 4: Implement actor/event snapshots and immutable history reads**

Every event copies `actor_name`, `actor_role`, `actor_level`, `actor_division`, `correlation_id`, artifact identity/revision/hash, action, step, and note. Repository exports no update/delete function for approvals, files, payments, confirmations, or access events.

- [ ] **Step 5: Prove concurrency and atomicity**

Run: `node --test server/penyaluran-p0-repository.test.js`

Expected: PASS for stale version/hash, duplicate approval under two concurrent commands, idempotent replay, payload mismatch, audit failure rollback, and ordered history.

- [ ] **Step 6: Commit repository kernel**

```bash
git add server/penyaluran-p0/repository.js server/penyaluran-p0-test-helpers.js server/penyaluran-p0-repository.test.js
git commit -m "feat(penyaluran): add transactional P0 provenance"
```

---

### Task 5: Authoritative P0 intake creation

**Files:**
- Create: `server/penyaluran-p0/intake-service.js`
- Create: `server/penyaluran-p0-intake.test.js`
- Create: `server/penyaluran-p0/routes.js`
- Modify: `server/index.js`
- Modify: `server/repository.js`

**Interfaces:**
- Produces: `createP0Mustahik(payload,context,meta)` and `POST /api/penyaluran/mustahik`.
- Consumes: repository transaction/events, `P0CommandMeta`, feature-flag policy, Penyaluran permissions.

- [ ] **Step 1: Write failing intake ownership/flag/audit tests**

```js
test('canonical intake is server-owned P0 data with one immutable create audit', async () => {
  const result = await createP0Mustahik(validPayload(),ctx(penyaluranStaff),meta);
  assert.equal(result.data.workflow_mode,'p0');
  assert.equal(result.data.status,'Diajukan');
  assert.equal(result.data.workflow_version,0);
  assert.equal((await caseRow(db,result.data.id)).created_by_id,penyaluranStaff.id);
  assert.equal(await count(db,'activity_logs',{mustahik_id:result.data.id,action_type:'p0_intake_created'}),1);
});

test('disabled flag, caller workflow claims, wrong role, and replay mismatch create no row', async () => {
  await assert.rejects(createWithFlag(false),hasCode('P0_WORKFLOW_DISABLED'));
  await assert.rejects(createWith({workflow_mode:'legacy'}),hasCode('FIELD_FORBIDDEN'));
  assert.equal(await count(db,'mustahik'),0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-intake.test.js`

Expected: FAIL because intake service/route do not exist.

- [ ] **Step 3: Implement server-owned intake creation**

Only authenticated Penyaluran staff may create normal P0 intake. The service validates the real intake/document fields needed for `Diajukan`, ignores no authoritative value silently, rejects browser `workflow_mode`, status, version, actor, timestamp, score, approval, and projection fields, and writes `workflow_mode='p0'`, `status='Diajukan'`, `workflow_version=0`, `created_by_id`, server `created_at`, one actor-snapshotted `p0_intake_created` activity, and idempotency result in one transaction. A repeated identical key returns the same id; changed payload returns 409.

- [ ] **Step 4: Register a flag-gated canonical route**

`POST /api/penyaluran/mustahik` uses `PENYALURAN_P0_ENABLED`; disabled mode returns `503 P0_WORKFLOW_DISABLED` before validation/SQL. It takes actor only from `req.user`, returns 201 on first creation and 200 with `replayed:true` on an identical replay. Existing `POST /api/mustahik` remains legacy and is frozen at cutover in Task 12.

- [ ] **Step 5: Test transport and zero-side-effect failures**

Cover 401, wrong role/level 403, disabled 503, malformed 400, field 422, duplicate/idempotency 409, success 201, replay 200, and audit/idempotency/projection failure rollback. Assert response never contains unmasked sensitive fields outside the current authorized task.

- [ ] **Step 6: Run intake tests**

Run: `node --test server/penyaluran-p0-intake.test.js`

Expected: PASS with exactly one case, one activity event, one idempotency record, and no legacy writer invocation.

- [ ] **Step 7: Commit P0 intake**

```bash
git add server/index.js server/repository.js server/penyaluran-p0/intake-service.js server/penyaluran-p0/routes.js server/penyaluran-p0-intake.test.js
git commit -m "feat(penyaluran): add authoritative P0 intake"
```

---

### Task 6: Assessment revisions, review, and API routes

**Files:**
- Create: `server/penyaluran-p0/assessment-service.js`
- Modify: `server/penyaluran-p0/routes.js`
- Create: `server/penyaluran-p0-assessment.test.js`
- Create: `server/penyaluran-p0-assessment-routes.test.js`
- Modify: `server/index.js`

**Interfaces:**
- Produces: `getAssessmentCase`, `createAssessmentDraft`, `saveAssessmentDraft`, `submitAssessment`, `reviewAssessment`, and first registrations in `registerPenyaluranP0Routes(app,deps)`.
- Consumes: Tasks 3–4 validation, permission, snapshot, and repository contracts.

- [ ] **Step 1: Write failing revision/state-machine tests**

```js
test('one submitted payload creates one row and one snapshot', async () => {
  const submitted = await submitAssessment(ctx, assessmentId, meta);
  assert.equal(submitted.data.status, 'submitted');
  assert.equal(await count(db,'assessments'), 1);
  assert.match(submitted.data.snapshot_hash, /^[a-f0-9]{64}$/);
});

test('assessment snapshot contains exactly 18 source fields in 5+4+6+3 groups', async () => {
  const submitted = await submitAssessment(ctx, assessmentId, meta);
  assert.deepEqual(Object.keys(submitted.data.snapshot_json.source_fields), [
    'husband_in_household','husband_name','wife_in_household','wife_name','child_count',
    'house_ownership','home_address','address_matches_ktp','monthly_rent_amount',
    'husband_occupation','husband_monthly_income','wife_occupation','wife_monthly_income','child_occupation','child_monthly_support',
    'assistance_request','applied_to_baznas_before','previous_application_year',
  ]);
});

test('return keeps revision immutable and correction creates n+1', async () => {
  await reviewAssessment(reviewerCtx, id, {...meta,action:'return'});
  const next = await createAssessmentDraft(editorCtx,mustahikId,{note:'Koreksi alamat setelah kunjungan ulang.'});
  assert.deepEqual([next.data.revision,next.data.supersedes_id],[2,id]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-assessment.test.js`

Expected: FAIL for missing `assessment-service.js`.

- [ ] **Step 3: Implement draft/save/submit/review transitions**

Only `Survey` P0 cases can create/resume drafts. Save trims fields and may replace a draft snapshot only. Submit validates exactly 18 digital source fields grouped as:

```text
Household (5): husband_in_household, husband_name, wife_in_household,
               wife_name, child_count
Housing (4): house_ownership, home_address, address_matches_ktp,
             monthly_rent_amount
Livelihood (6): husband_occupation, husband_monthly_income, wife_occupation,
                wife_monthly_income, child_occupation, child_monthly_support
Request history (3): assistance_request, applied_to_baznas_before,
                     previous_application_year
```

The two presence booleans are explicit digital answers required to represent whether the source-template spouse fields apply; they do not create extra print copies. Store one canonical snapshot, record submitter, and leave Mustahik at `Survey`. Accept requires a different Penyaluran reviewer and atomically advances to `Persetujuan MPZIS`; return freezes the old revision and requires a successor.

- [ ] **Step 4: Write failing route contract tests**

Test all five Assessment routes for 401, 403, 404, 409, 422, exact error envelope with `field_errors`, 201 draft creation, 200 save/read/review, actor-field rejection, score-field rejection, and idempotent replay.

- [ ] **Step 5: Register thin authenticated routes**

```js
registerPenyaluranP0Routes(app, {
  authenticateToken,
  services: app.locals.penyaluranP0Services,
  uploadMiddleware: p0ArtifactUpload,
});
```

Routes parse ids/body, take actor only from `req.user`, call one service, and pass `P0Error` through `sendP0Error`; they never perform SQL or status logic.

- [ ] **Step 6: Run Assessment tests**

Run: `node --test server/penyaluran-p0-assessment.test.js server/penyaluran-p0-assessment-routes.test.js`

Expected: PASS, including one-row/two-print-copy invariant and rollback on audit failure.

- [ ] **Step 7: Commit Assessment backend**

```bash
git add server/index.js server/penyaluran-p0/assessment-service.js server/penyaluran-p0/routes.js server/penyaluran-p0-assessment.test.js server/penyaluran-p0-assessment-routes.test.js
git commit -m "feat(penyaluran): add authoritative assessment workflow"
```

---

### Task 7: MPZIS revisions and five distinct approvals

**Files:**
- Create: `server/penyaluran-p0/mpzis-service.js`
- Create: `server/penyaluran-p0-mpzis.test.js`
- Create: `server/penyaluran-p0-mpzis-routes.test.js`
- Modify: `server/penyaluran-p0/routes.js`

**Interfaces:**
- Produces: `getMpzisCase`, `createMpzisDraft`, `saveMpzisDraft`, `submitMpzis`, `decideMpzisStep`.
- Consumes: accepted Assessment snapshot, common command metadata, five canonical step keys.

- [ ] **Step 1: Write failing happy-path and segregation tests**

```js
test('five unique approvals bind one unchanged hash in canonical order', async () => {
  for (const [step,actor] of canonicalSteps.map((s,i)=>[s,approvers[i]])) {
    result = await decideMpzisStep(ctx(actor), id, step, {...meta,action:'approve'});
    assert.equal(result.data.snapshot_hash, submittedHash);
  }
  assert.equal(result.data.status,'approved');
  assert.equal((await caseRow(db)).status,'Pengajuan Dana (FPD)');
});

test('creator, submitter, reused actor, wrong level, and skipped step are rejected', async () => {
  await assert.rejects(decideAs(creator,'proposed'), hasStatus(403));
  await assert.rejects(decideAs(staff1,'examined'), hasCode('MPZIS_STEP_ORDER'));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-mpzis.test.js`

Expected: FAIL for missing MPZIS service.

- [ ] **Step 3: Implement draft seeding and immutable submit**

Seed only from the active accepted Assessment and copied Mustahik address/marital values. Require the complete structured source block, explicit recipient/fund confirmations, and `total_amount > 0`. Submit creates a preparation event but no approval slot.

- [ ] **Step 4: Implement the ordered five-step chain and return/new revision**

Use staff for the first three keys and leaders for the final two. Before every approval query creator, submitter, and prior approver ids under lock. Any return terminally marks the revision `returned`; a successor keeps the logical form number, increments revision, and never copies approvals.

- [ ] **Step 5: Add route tests and handlers**

Cover the five MPZIS endpoints, exact step-key allow-list, no actor claims, role/level failures, admin routine denial, valid constrained recovery override, stale hash, amount projection only after the fifth approval, and 409 duplicate concurrent approval.

- [ ] **Step 6: Run MPZIS tests**

Run: `node --test server/penyaluran-p0-mpzis.test.js server/penyaluran-p0-mpzis-routes.test.js`

Expected: PASS with exactly five approval events and five distinct actor ids.

- [ ] **Step 7: Commit MPZIS backend**

```bash
git add server/penyaluran-p0/mpzis-service.js server/penyaluran-p0/routes.js server/penyaluran-p0-mpzis.test.js server/penyaluran-p0-mpzis-routes.test.js
git commit -m "feat(penyaluran): enforce five-step MPZIS approval"
```

---

### Task 8: PPD revisions, RAB total, bank snapshot, and finance gates

**Files:**
- Create: `server/penyaluran-p0/ppd-service.js`
- Create: `server/penyaluran-p0-ppd.test.js`
- Create: `server/penyaluran-p0-ppd-routes.test.js`
- Modify: `server/penyaluran-p0/routes.js`

**Interfaces:**
- Produces: `getPpdCase`, `createPpdDraft`, `savePpdDraft`, `submitPpd`, `financeCheckPpd`, `financeApprovePpd`.
- Consumes: approved active MPZIS snapshot/ceiling, money/encryption/permissions, repository kernel.

- [ ] **Step 1: Write failing RAB and finance tests**

```js
test('server ignores claimed total and persists exact RAB sum and terbilang', async () => {
  const result = await submitPpd(ctx,id,{...meta, amount:'1.00', amount_in_words:'palsu'});
  assert.equal(result.data.amount,'1500000.00');
  assert.equal(result.data.amount_in_words,'Satu Juta Lima Ratus Ribu Rupiah');
});

test('zero/four rows, duplicate numbers, over-ceiling, missing key, and same finance actor fail', async () => {
  await assert.rejects(submitWithFourLines(), hasStatus(422));
  await assert.rejects(financeApproveAs(checker), hasStatus(403));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-ppd.test.js`

Expected: FAIL for missing PPD service.

- [ ] **Step 3: Implement PPD draft/save with ordered RAB replacement**

Seed only from the active approved MPZIS. Copy requester identity from session; encrypt account number and persist last four; never accept requester, total, terbilang, actor, or hash as browser truth. Save 1–3 lines in one transaction, renumbering 1–3 after deletion.

- [ ] **Step 4: Implement submit and two finance transitions**

Submit calculates exact sum/terbilang, enforces MPZIS ceiling and unique form/PPD/transaction numbers, freezes the snapshot, and stays within `Pengajuan Dana (FPD)`. Finance check requires Keuangan; finance approval requires a different Keuangan leader and unchanged hash. Penyaluran/admin routine actions are rejected.

- [ ] **Step 5: Add API contract coverage**

Test PPD GET/draft/save/submit/finance-check/finance-approve routes for 1/2/3 lines, 0/4 rejection, exact enums, `Lain-lain`, explicit confirmations, masked reads, ciphertext absence, duplicate-number privacy, key failure, stale hash, and actor separation.

- [ ] **Step 6: Run PPD tests**

Run: `node --test server/penyaluran-p0-ppd.test.js server/penyaluran-p0-ppd-routes.test.js`

Expected: PASS with no plaintext bank account in responses or logs.

- [ ] **Step 7: Commit PPD backend**

```bash
git add server/penyaluran-p0/ppd-service.js server/penyaluran-p0/routes.js server/penyaluran-p0-ppd.test.js server/penyaluran-p0-ppd-routes.test.js
git commit -m "feat(penyaluran): add PPD and finance workflow"
```

---

### Task 9: Immutable evidence storage and audited secure reads

**Files:**
- Create: `server/penyaluran-p0/artifact-files.js`
- Create: `server/penyaluran-p0-artifact-files.test.js`
- Create: `server/penyaluran-p0-artifact-routes.test.js`
- Modify: `server/penyaluran-p0/routes.js`
- Modify: `server/index.js`

**Interfaces:**
- Produces: `validateArtifactBytes`, `storeArtifactFile`, `openArtifactForActor`, `streamAuditedArtifact`, `createP0ArtifactUpload()`.
- Consumes: `artifact_files`, `artifact_access_events`, P0 permission scope, `PENYALURAN_ARTIFACT_DIR`.

- [ ] **Step 1: Write failing file-policy tests**

```js
test('accepts real PDF/JPEG/PNG signatures and rejects extension-only and polyglot payloads', async () => {
  assert.equal(validateArtifactBytes(pdfFixture()).mimeType,'application/pdf');
  assert.throws(() => validateArtifactBytes(Buffer.from('MZ...%PDF')), hasCode('INVALID_FILE_SIGNATURE'));
});

test('audit insertion failure sends zero bytes', async () => {
  const {statusCode,sentArtifactBytes} = await downloadWithAuditFailure();
  assert.equal(statusCode,503);
  assert.equal(sentArtifactBytes,0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-artifact-files.test.js`

Expected: FAIL because artifact module is absent.

- [ ] **Step 3: Implement immutable ingestion**

Use Multer memory storage for P0 evidence. Verify magic bytes before disk write; permit only PDF/JPEG/PNG; enforce 10 MiB/file and 30 MiB/case; generate a random stored name without the client basename; write temp then atomic rename outside public root; hash bytes; insert metadata only after successful rename; on DB failure remove only the just-created temp/final file.

- [ ] **Step 4: Implement scoped audited streaming**

Authorize case and evidence kind, resolve/realpath containment, open successfully, then insert one access event before headers/body. Set `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, safe `Content-Disposition`, byte ranges, and one new correlation id/event per response. Unauthorized requests create no successful event.

Use `inline_view` when `disposition=inline` and `download` when `disposition=attachment`; the dedicated receipt endpoint always records `download` as required by the receipt contract.

- [ ] **Step 5: Add route tests**

Test `GET /api/penyaluran/mustahik/:id/artifacts/:fileId?disposition=inline|attachment`, full/range events, cross-case denial, evidence-kind scopes, traversal/symlink denial, quota, 413, magic mismatch, randomized name, duplicate immutable hash, and zero-byte-on-audit-failure.

- [ ] **Step 6: Run artifact tests**

Run: `node --test server/penyaluran-p0-artifact-files.test.js server/penyaluran-p0-artifact-routes.test.js`

Expected: PASS; teardown removes only the per-test temporary directory.

- [ ] **Step 7: Commit artifact security**

```bash
git add server/index.js server/penyaluran-p0/artifact-files.js server/penyaluran-p0/routes.js server/penyaluran-p0-artifact-files.test.js server/penyaluran-p0-artifact-routes.test.js
git commit -m "feat(penyaluran): secure immutable artifact evidence"
```

---

### Task 10: Payment, verification, recipient confirmation, and completion

**Files:**
- Create: `server/penyaluran-p0/payment-service.js`
- Create: `server/penyaluran-p0/completion-service.js`
- Create: `server/penyaluran-p0-completion.test.js`
- Create: `server/penyaluran-p0-completion-routes.test.js`
- Modify: `server/penyaluran-p0/routes.js`

**Interfaces:**
- Produces: `recordPayment`, `verifyPayment`, `recordRecipientConfirmation`, `completeDistribution`.
- Consumes: finance-approved PPD, immutable file metadata, full active Assessment→MPZIS→PPD chain.

- [ ] **Step 1: Write failing gate-by-gate tests**

```js
for (const missing of ['finance_approval','matching_amount','proof','proof_verification','recipient_confirmation']) {
  test(`completion rejects missing ${missing}`, async () => {
    await assert.rejects(completeDistribution(ctx,ppdId,meta), hasCode(`COMPLETION_${missing.toUpperCase()}_REQUIRED`));
    assert.notEqual((await caseRow(db)).status,'Penyaluran Selesai');
  });
}
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-completion.test.js`

Expected: FAIL because payment/completion services are absent.

- [ ] **Step 3: Implement payment record and independent verification**

`recordPayment` requires finance approval, exact decimal equality, a stored `payment_proof` file for the same PPD revision, and actor different from PPD creator. `verifyPayment` locks payment/proof, requires a different finance actor, rehashes proof bytes, and changes `pending` to `verified` without accepting a claimed hash.

The payment recorder must have `role='keuangan'` or a division normalized to Keuangan and level `staff|leader`; Penyaluran, Surveyor, Admin routine mode, and unrelated roles are rejected with 403 and create no file/payment/event/projection side effect. The payment verifier has the same Keuangan requirement and must differ from the recorder.

- [ ] **Step 4: Implement explicit recipient confirmation**

Require verified payment, exact method enum, recipient-name snapshot, server-bounded time, 10–1000 character note, and optional same-case `recipient_confirmation` evidence. WhatsApp logs and status dates never infer confirmation.

The recipient confirmer must be an authenticated `penyaluran` staff/leader or `surveyor` assigned to the case. Keuangan, Admin routine mode, Penerimaan, unassigned Surveyor, and unrelated roles receive 403 with no confirmation/event/status side effect.

- [ ] **Step 5: Implement locked full-chain completion**

On a Penyaluran leader request, lock case, active artifacts, payment, confirmation, and proof; recompute all stored snapshots and file hash; recheck actor separation and amount equality; write completion event/activity/projections; set PPD `completed`, Mustahik `Penyaluran Selesai`, increment version, and enqueue receipt status `pending` atomically.

- [ ] **Step 6: Add route and negative-authorization tests**

Cover multipart payment proof, verify, confirmation, and complete paths; wrong order; future timestamps; recorder=verifier; Penyaluran/Surveyor/Admin acting as payment recorder or verifier; Keuangan/Admin/Penerimaan/unassigned Surveyor acting as recipient confirmer; stale hash/version; hash-tampered file; and audit rollback. Every negative test asserts zero new file/payment/confirmation/approval/activity rows and unchanged PPD/Mustahik versions/status.

- [ ] **Step 7: Run completion tests**

Run: `node --test server/penyaluran-p0-completion.test.js server/penyaluran-p0-completion-routes.test.js`

Expected: PASS and every missing gate independently leaves case/status/events unchanged.

- [ ] **Step 8: Commit completion workflow**

```bash
git add server/penyaluran-p0/payment-service.js server/penyaluran-p0/completion-service.js server/penyaluran-p0/routes.js server/penyaluran-p0-completion.test.js server/penyaluran-p0-completion-routes.test.js
git commit -m "feat(penyaluran): gate payment and completion evidence"
```

---

### Task 11: Authoritative Bukti Digital Penyaluran PDF and idempotent job

**Files:**
- Create: `server/penyaluran-p0/receipt-renderer.js`
- Create: `server/penyaluran-p0/receipt-jobs.js`
- Create: `server/penyaluran-p0-receipt.test.js`
- Modify: `server/penyaluran-p0/routes.js`
- Modify: `server/index.js`

**Interfaces:**
- Produces: `renderDistributionReceipt(bundle): Promise<Buffer>`, `processReceiptJob(ppdId,deps)`, `resumePendingReceiptJobs(deps)`.
- Consumes: only persisted immutable bundle from repository; artifact storage/access from Task 9.

- [ ] **Step 1: Write failing parsed-PDF assertions**

```js
test('receipt contains provenance and renders one assessment twice', async () => {
  const bytes = await renderDistributionReceipt(maskedCompleteBundle());
  const text = await extractPdfText(bytes);
  assert.equal((text.match(/Salinan dari satu record digital/g)||[]).length,2);
  for (const marker of ['Bukti Digital Penyaluran','F-BPP/06','F-PKP/03','proposed','approved','SHA-256']) assert.match(text,new RegExp(marker));
  assert.doesNotMatch(text,/001122334455|3671\d{12}/);
});

test('two workers create one ready receipt and clean the losing temporary file', async () => {
  const [a,b] = await Promise.all([processReceiptJob(ppdId,deps),processReceiptJob(ppdId,deps)]);
  assert.equal(a.file_id,b.file_id);
  assert.equal(await count(db,'artifact_files',{kind:'system_receipt_pdf'}),1);
  assert.deepEqual(await listTempReceiptFiles(artifactDir),[]);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-receipt.test.js`

Expected: FAIL for missing renderer/job.

- [ ] **Step 3: Implement deterministic persisted-data rendering**

Render the seven sections in spec section 14, including complete Assessment fields twice from one id/revision/hash, five MPZIS actors, requester/RAB/finance, payment proof id/hash, confirmation, completion correlation id, masked NIK/account, and the no-signature statement. Fail `RECEIPT_DATA_INCOMPLETE` for any required missing persisted value; use no default actor/date/amount/bank/status.

Resolve the self-hash boundary explicitly: compute and print `receipt_payload_sha256` from the canonical immutable receipt JSON and label it `Hash data bukti`; after final PDF rendering, store `artifact_files.sha256` as the exact PDF-byte hash and return it as `file_sha256` in receipt metadata/download UI. Never print a first-pass PDF digest as though it were the final file digest.

- [ ] **Step 4: Implement atomic idempotent receipt generation**

Claim inside a short transaction using `SELECT ... FROM ppd WHERE id=$1 FOR UPDATE`; atomically change `receipt_status` from `pending` to `processing`, write a lease token/time, and commit before rendering. A second worker observing `processing` returns the same in-progress job rather than rendering. The owner renders to a lease-named temp file, hashes it, atomically renames, then in a second locked transaction verifies the lease token, inserts exactly one `system_receipt_pdf` row under a unique `(artifact_type,artifact_id,artifact_revision,kind)` constraint, writes the generation event, and marks `ready`. Replays return the same file id/bytes/hash.

On render/write/DB/lease-loss failure, remove only the current lease's temp file and any unreferenced final file, retain referenced ready files, set sanitized `failed` detail when still lease owner, and preserve completed workflow. Startup first removes stale temp/unreferenced receipt files older than the lease threshold within the validated artifact directory, then reclaims stale `processing` jobs under `FOR UPDATE`; it never overwrites ready receipts.

Write an append-only `artifact_approvals` generation event containing the canonical receipt payload hash and final file id/hash in the same transaction that marks the receipt ready.

- [ ] **Step 5: Route receipt through the audited artifact streamer**

`GET .../receipt` resolves the persisted ready file and records `download` before bytes; pending returns `409 RECEIPT_PENDING`, failed returns `503 RECEIPT_GENERATION_FAILED`, and unauthorized access sends no bytes/event.

- [ ] **Step 6: Run receipt tests**

Run: `node --test server/penyaluran-p0-receipt.test.js`

Expected: PASS for parsed text, two copies/one row, masked values, five+two actors, identical replay bytes/hash, two-worker atomic claim with one row/file, stale-lease recovery, orphan/temp cleanup after each failure boundary, and failure state.

- [ ] **Step 7: Commit receipt**

```bash
git add server/index.js server/penyaluran-p0/receipt-renderer.js server/penyaluran-p0/receipt-jobs.js server/penyaluran-p0/routes.js server/penyaluran-p0-receipt.test.js
git commit -m "feat(penyaluran): generate authoritative digital receipt"
```

---

### Task 12: Legacy freeze, archive/restore, reconciliation, and cutover flag

**Files:**
- Create: `server/penyaluran-p0/legacy-reconciliation.js`
- Create: `server/penyaluran-p0-legacy.test.js`
- Modify: `server/penyaluran-p0/routes.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `.env.example`

**Interfaces:**
- Produces: `assertLegacyWriteAllowed`, `classifyLegacyCase`, `beginLegacyReconciliation`, `completeLegacyReconciliation`, `archiveCase`, `restoreCase`, `isPenyaluranP0Enabled`.
- Consumes: workflow_mode fields, repository provenance, P0 feature flag.

- [ ] **Step 1: Write failing freeze/retention tests**

```js
test('hard delete is permanently disabled and archive preserves every child', async () => {
  const beforeVersion = (await caseRow(db,id)).workflow_version;
  assert.equal((await request('DELETE',`/api/mustahik/${id}`,admin)).status,405);
  await archiveCase(adminCtx,id,{...meta,note:'Arsip duplikat hasil verifikasi administrasi.'});
  assert.equal((await caseRow(db,id)).workflow_version,beforeVersion+1);
  assert.equal(await count(db,'artifact_approvals'),approvalCountBefore+1);
  assert.equal(await count(db,'artifact_files'),fileCountBefore);
});

test('archive/restore audit failure and replay are atomic', async () => {
  db.failOn(/INSERT INTO activity_logs/);
  await assert.rejects(archiveCase(adminCtx,id,meta),/audit/);
  assert.equal((await caseRow(db,id)).archived_at,null);
  assert.equal((await caseRow(db,id)).workflow_version,0);
  db.clearFailure();
  const first=await archiveCase(adminCtx,id,meta);
  assert.deepEqual(await archiveCase(adminCtx,id,meta),{...first,replayed:true});
});

test('legacy write endpoints return 410 for P0 cases', async () => {
  for (const path of ['/assessment','/assessments','/mpzis','/ppd','/decision','/documents','/whatsapp']) assert.equal((await post(`/api/mustahik/${id}${path}`)).status,410);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-legacy.test.js`

Expected: FAIL because hard delete/legacy writers still operate.

- [ ] **Step 3: Permanently disable hard delete and gate all legacy writers**

Return `{success:false,code:'HARD_DELETE_DISABLED'}` with 405 for every Mustahik. Install one `legacyPenyaluranWriteGuard` before request parsing/storage side effects on every legacy writer:

```text
POST /api/mustahik
PUT /api/mustahik/:id
POST /api/mustahik/import
POST /api/mustahik/:id/decision
POST /api/mustahik/:id/assessment
POST /api/mustahik/:id/assessments
POST /api/mustahik/:id/mpzis
POST /api/mustahik/:id/ppd
POST /api/mustahik/:id/documents
POST /api/mustahik/:id/whatsapp
POST /api/upload
```

For an identifiable `workflow_mode='p0'` case, return 410 before repository, file, cache, or notification work. At the recorded cutover, globally return `LEGACY_WORKFLOW_DISABLED` for case-creating/import/general-upload legacy routes and artifact writers; P0 intake/artifact routes remain separate. Before cutover, generic decisions for a P0 case may only perform the explicitly designed early `Diajukan`/`Verifikasi Administrasi` checks and cannot cross artifact gates. Historical GET routes remain.

- [ ] **Step 4: Implement audited archive/restore**

Admin-only endpoints require 20–1000 character reason, expected status/version, and idempotency key. Archive atomically sets `archived_at/by/reason`, increments `workflow_version` exactly once, writes approval/activity/idempotency evidence, and excludes the row from normal queues. Restore atomically clears only the archive projection, increments `workflow_version` exactly once, and appends separate restore approval/activity/idempotency evidence while preserving archive history. Identical replays do not increment again; changed payload reuse returns 409. Any projection, approval, activity, or idempotency failure rolls the whole command back. Audit reads/files remain accessible.

- [ ] **Step 5: Implement explicit legacy reconciliation**

Completed/rejected legacy cases stay read-only. `Diajukan`/`Verifikasi Administrasi` may switch directly to P0 with an event. Other in-flight cases record the exact unchanged `legacy_status_snapshot`, rebuild from the earliest missing artifact, record old row ids/import hash/reason, suppress compatibility transitions until caught up, and never synthesize approval actors.

Register exact admin routes `POST /api/admin/penyaluran/mustahik/:id/reconcile/start` and `POST /api/admin/penyaluran/mustahik/:id/reconcile/complete`. Register recovery as `POST /api/admin/penyaluran/recovery/artifacts/:artifactType/:artifactId/:revision/steps/:step`; it requires the target identity, assumed distinct actor id, expected revision/hash, and 20–1000 character override reason.

- [ ] **Step 6: Add feature flags**

Document `PENYALURAN_P0_ENABLED=false`, `PENYALURAN_P0_CUTOVER_AT`, `PENYALURAN_FIELD_ENCRYPTION_KEY`, and `PENYALURAN_ARTIFACT_DIR`. Disabled mode permits P0 reads/UAT allow-list only and blocks normal P0 intake.

- [ ] **Step 7: Run retention/compatibility tests**

For each listed route, inject spies for repository methods, upload storage, cache invalidation, activity/approval insertion, and WhatsApp generation/sending. Assert status 410, all spy counts zero, no temp/final file, no database row/version/status change, and no notification. Also test one mixed legacy import request fails atomically after cutover instead of partially inserting rows.

Run: `node --test server/penyaluran-p0-legacy.test.js server/access-control.integration.test.js`

Expected: PASS for 405 hard delete; fail-closed 410 on every legacy writer with zero side effects; unchanged legacy statuses; direct early-stage switch; reconciliation catch-up; archive/restore; restrictive FK deletion failure; and provenance persistence.

- [ ] **Step 8: Commit cutover safety**

```bash
git add .env.example server/index.js server/repository.js server/penyaluran-p0/legacy-reconciliation.js server/penyaluran-p0/routes.js server/penyaluran-p0-legacy.test.js
git commit -m "feat(penyaluran): freeze legacy writes and retain provenance"
```

---

### Task 13: Case progress, real documents, capabilities, and chronological history API

**Files:**
- Create: `server/penyaluran-p0/case-read-model.js`
- Create: `server/penyaluran-p0-read-model.test.js`
- Modify: `server/penyaluran-p0/routes.js`
- Modify: `server/repository.js`

**Interfaces:**
- Produces: `getP0CaseWorkspace(mustahikId,actor,db)` returning `{case,case_progress,assessment,mpzis,ppd,documents,history,capabilities}`.
- Consumes: all artifact/event tables and `capabilitiesFor`.

- [ ] **Step 1: Write failing server-truth read-model tests**

```js
test('read model contains no score, guessed SLA, fake completeness, or plaintext secrets', async () => {
  const json = JSON.stringify(await getP0CaseWorkspace(id,actor,db));
  for (const forbidden of ['overall_score','completeness','missingDocument','sla','001122334455']) assert.equal(json.includes(forbidden),false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test server/penyaluran-p0-read-model.test.js`

Expected: FAIL because the read model is absent.

- [ ] **Step 3: Implement masked artifact reads and progress gates**

Return high-level status plus active revision states, current required action, blocking reasons, receipt state, revision summaries, actual artifact files, and capabilities computed for the authenticated actor. Render absent fields as `null`; frontend owns the localized `Belum dicatat` label.

- [ ] **Step 4: Build one real chronological history**

Union artifact approvals, compatibility decisions, activity logs, files, access events, payments, confirmation, receipt, archive/restore, and recovery events into stable `{id,type,title,description,actor,timestamp,artifact,revision,hash_prefix}` items sorted by server timestamp then id. Do not include NIK/account/proof bytes.

- [ ] **Step 5: Add `GET /api/penyaluran/mustahik/:id/workspace` and scope tests**

Test surveyor/Penyaluran/Keuangan task scopes, admin cross-case read-only view, archived audit reads, legacy banner, `null` missing fields, correct current action, and no synthetic/private values.

- [ ] **Step 6: Run read-model tests**

Run: `node --test server/penyaluran-p0-read-model.test.js`

Expected: PASS for all workflow states and actor roles.

- [ ] **Step 7: Commit case read model**

```bash
git add server/repository.js server/penyaluran-p0/case-read-model.js server/penyaluran-p0/routes.js server/penyaluran-p0-read-model.test.js
git commit -m "feat(penyaluran): expose authoritative case progress"
```

---

### Task 14: Typed Next.js P0 API client

**Files:**
- Create: `frontend-next/lib/api/penyaluran-p0-types.ts`
- Create: `frontend-next/lib/api/penyaluran-p0-client.test.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/lib/api/types.ts`

**Interfaces:**
- Produces: `P0IntakePayload`, `P0CaseWorkspace`, `AssessmentDraft`, `MpzisDraft`, `PpdDraft`, `RabLine`, `ArtifactApproval`, `ArtifactFile`, `P0CommandMeta`, `P0FieldErrors`; methods `createP0MustahikIntake`, `getP0CaseWorkspace`, `getAssessment`, `createAssessmentDraft`, `saveAssessmentDraft`, `submitAssessment`, `reviewAssessment`, `getMpzis`, `createMpzisDraft`, `saveMpzisDraft`, `submitMpzis`, `decideMpzisStep`, `getPpd`, `createPpdDraft`, `savePpdDraft`, `submitPpd`, `financeCheckPpd`, `financeApprovePpd`, `recordPaymentProof`, `verifyPayment`, `recordRecipientConfirmation`, `completePpd`, `downloadArtifact`, `downloadReceipt`, `archiveMustahik`, and `restoreMustahik`.
- Consumes: exact server envelopes/status codes from Tasks 5–13.

- [ ] **Step 1: Define failing URL/payload/blob tests**

```ts
it('does not serialize actor, total, terbilang, or snapshot claims in PPD save', async () => {
  await api.savePpdDraft(1,2,validPpdDraft());
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/penyaluran/mustahik/1/ppd/2'), expect.objectContaining({method:'PUT'}));
  expect(JSON.parse(lastBody())).not.toHaveProperty('actor_name');
});

it('creates intake only through the canonical flag-gated P0 route', async () => {
  await api.createP0MustahikIntake(validIntake,meta);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/penyaluran/mustahik'),expect.objectContaining({method:'POST'}));
  expect(JSON.parse(lastBody())).not.toHaveProperty('workflow_mode');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix frontend-next test -- penyaluran-p0-client.test.ts`

Expected: FAIL because the P0 types/methods are absent.

- [ ] **Step 3: Add exact discriminated unions**

Define `P0IntakePayload` as the allow-listed intake fields plus `P0CommandMeta`, with no `workflow_mode`, status, version, actor, timestamp, score, approval, or projection property. Define literal statuses/enums from the spec, decimal money as strings, masked accounts only, nullable missing source values, typed capability booleans, stable errors, and revision summaries. Remove score fields from the P0 workspace shape without deleting legacy `AssessmentRecord` read compatibility.

- [ ] **Step 4: Implement all typed methods**

Add canonical P0 intake, workspace, Assessment five routes, MPZIS five routes, PPD eleven routes, artifacts, receipt, archive/restore. `createP0MustahikIntake` posts only to `/api/penyaluran/mustahik`, forwards idempotency metadata, and maps `P0_WORKFLOW_DISABLED` without falling back to legacy `createMustahik`. State-changing helpers require `P0CommandMeta`; multipart payment uses `FormData`; downloads use authenticated blob fetch and never place tokens in URLs.

- [ ] **Step 5: Preserve stable error fields**

Extend `ApiError` to expose `code` and `field_errors` without losing current behavior. A 409 carries current revision/hash summary so forms can preserve local state and present reload/diff.

- [ ] **Step 6: Run client tests and typecheck**

Run: `npm --prefix frontend-next test -- penyaluran-p0-client.test.ts client.test.ts`

Expected: PASS for P0 intake route/allow-list/flag error/no-legacy-fallback and every exact artifact method/path/body/status/blob behavior.

Run: `npm --prefix frontend-next run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit typed client**

```bash
git add frontend-next/lib/api/client.ts frontend-next/lib/api/types.ts frontend-next/lib/api/penyaluran-p0-types.ts frontend-next/lib/api/penyaluran-p0-client.test.ts
git commit -m "feat(penyaluran): add typed P0 workflow client"
```

---

### Task 15: Canonical case shell and shared accessible workflow controls

**Files:**
- Create: `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/case/CaseProgressSummary.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/shared/ArtifactStatusBanner.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/shared/ApprovalTimeline.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/shared/FieldErrorSummary.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/shared/MoneyInput.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/shared/IrreversibleActionDialog.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.test.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Produces: four tabs `summary|process|documents|history`, authoritative workspace loader, shared error/focus/dialog/money/status primitives.
- Consumes: `P0CaseWorkspace` and API client from Task 14.

- [ ] **Step 1: Replace synthetic fixture expectations with failing server-truth tests**

Assert four tabs, `Proses` routing by `case_progress.current_artifact`, real documents/history, `Belum dicatat`, legacy banner, and absence of score/completeness/SLA/static activity. Assert the “Tambah Mustahik” form calls only `createP0MustahikIntake`, handles disabled-flag messaging, and never calls legacy `createMustahik`. Add a 409 test that preserves typed input and exposes `Muat data terbaru` plus changed fields.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix frontend-next test -- MustahikWorkspace.test.tsx CaseWorkflowPanel.test.tsx`

Expected: FAIL because `Proses` and shared components do not exist and score is still rendered.

- [ ] **Step 3: Reduce `MustahikWorkspace` to queue/selection shell**

Delete `MustahikView` synthetic fields, `adaptApiData` score/completeness/SLA generation, static `DOCUMENTS`, static activity, and generic decisions that cross artifact gates. Route new-case submission exclusively through `createP0MustahikIntake`; surface `P0_WORKFLOW_DISABLED` without fallback. Load list rows for queue and `getP0CaseWorkspace` on selection; exclude archived rows by default.

- [ ] **Step 4: Implement shared accessible controls**

`FieldErrorSummary` is focusable on failure and links to control ids. `MoneyInput` has visible label, `aria-describedby`, `aria-invalid`, tabular numeric display, and Indonesian announced value. `IrreversibleActionDialog` traps focus, Escape closes before submission, restores trigger focus, names hash prefix/effect, and has 44px targets.

- [ ] **Step 5: Implement progress/documents/history views**

Use server gate reasons and capability hints only. Documents open through authenticated artifact blob. History renders real chronological items. Missing values use the single formatter `displaySourceValue(value) => value == null || value === '' ? 'Belum dicatat' : String(value)`.

- [ ] **Step 6: Run component tests and typecheck**

Run: `npm --prefix frontend-next test -- MustahikWorkspace.test.tsx CaseWorkflowPanel.test.tsx`

Expected: PASS, including keyboard tab/dialog/error-summary behavior and no synthetic truth.

Run: `npm --prefix frontend-next run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the case shell**

```bash
git add frontend-next/components/penyaluran/mustahik frontend-next/lib/api
git commit -m "feat(penyaluran): replace synthetic case progress"
```

---

### Task 16: Assessment form and review experience

**Files:**
- Create: `frontend-next/components/penyaluran/mustahik/assessment/AssessmentForm.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/assessment/AssessmentReviewPanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/assessment/AssessmentForm.test.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`

**Interfaces:**
- Produces: source-order draft, autosave state, submit confirmation, accept/return review.
- Consumes: Assessment DTO/methods and shared controls.

- [ ] **Step 1: Write failing field inventory and conditional tests**

Render and query persistent labels for exactly 18 source fields: Household 5 (`husband_in_household`, `husband_name`, `wife_in_household`, `wife_name`, `child_count`), Housing 4 (`house_ownership`, `home_address`, `address_matches_ktp`, `monthly_rent_amount`), Livelihood 6 (`husband_occupation`, `husband_monthly_income`, `wife_occupation`, `wife_monthly_income`, `child_occupation`, `child_monthly_support`), and Request history 3 (`assistance_request`, `applied_to_baznas_before`, `previous_application_year`). Assert the DOM/control inventory is exactly 5+4+6+3; spouse fields clear/hide when absent; rent only for `Kontrak`; child occupation/support rules; prior year conditional; explicit yes/no fieldsets; no score input/text; save→reload equality; submit immutability; return→new revision.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix frontend-next test -- AssessmentForm.test.tsx`

Expected: FAIL because Assessment components are absent.

- [ ] **Step 3: Implement source-order form with local validation**

Use controlled values, radio `fieldset/legend`, persistent help/error ids, money controls, and immediate conditional clearing. Start one logical record only; never display or submit a copy number. Client validation mirrors server but never advances state.

- [ ] **Step 4: Implement debounced draft save and stale recovery**

Autosave only locally valid drafts after 800 ms idle; display `Menyimpan`, `Tersimpan`, or `Gagal disimpan` via polite status. On 409 retain local values, block submission, fetch latest on explicit user action, and show a field-by-field local/server comparison.

- [ ] **Step 5: Implement review with distinct actor guidance**

Read-only submitted fields, exact hash prefix, required note, accept/return dialog, disabled reason when reviewer equals submitter, and revision timeline. Acceptance copy explicitly says it verifies completeness, not a score/eligibility formula.

- [ ] **Step 6: Run Assessment UI tests**

Run: `npm --prefix frontend-next test -- AssessmentForm.test.tsx CaseWorkflowPanel.test.tsx`

Expected: PASS for source coverage, keyboard order, error focus, autosave states, 409 preservation, and review separation.

- [ ] **Step 7: Commit Assessment UI**

```bash
git add frontend-next/components/penyaluran/mustahik/assessment frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx
git commit -m "feat(penyaluran): add household assessment UI"
```

---

### Task 17: MPZIS form and five-step approval experience

**Files:**
- Create: `frontend-next/components/penyaluran/mustahik/mpzis/MpzisForm.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/mpzis/MpzisApprovalStepper.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/mpzis/MpzisWorkflow.test.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`

**Interfaces:**
- Produces: complete F-BPP/06 data form, submit preparation view, five approval cards.
- Consumes: MPZIS DTO/methods, capability reasons, shared approval/dialog controls.

- [ ] **Step 1: Write failing source-field and actor tests**

Assert controls for form/date/classification/purpose/asnaf/fund source/name/type/count/complete address/marital status/amount; explicit recipient/fund confirmations; default values remain visibly unconfirmed; five canonical steps; staff/leader assignments; creator/submitter/reused user disabled explanations; return/new revision.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix frontend-next test -- MpzisWorkflow.test.tsx`

Expected: FAIL because MPZIS components are absent.

- [ ] **Step 3: Implement the MPZIS draft and submit panel**

Keep source order, show the accepted Assessment id/revision/hash being used, require operators to visit and confirm recipient/fund sections, show server validation keys inline/summary, and never accept typed signer names.

- [ ] **Step 4: Implement five approval cards**

Each card shows Indonesian label, required role, actual authenticated actor, server timestamp, state, and hash prefix. Only the current permitted step has an action; used/ineligible actors see the precise segregation reason. Return warns that a successor revision is required and prior approvals remain historical.

- [ ] **Step 5: Run MPZIS UI tests**

Run: `npm --prefix frontend-next test -- MpzisWorkflow.test.tsx CaseWorkflowPanel.test.tsx`

Expected: PASS for all source fields, exact step order, distinct-user messaging, stale behavior, accessibility, and no fake signers.

- [ ] **Step 6: Commit MPZIS UI**

```bash
git add frontend-next/components/penyaluran/mustahik/mpzis frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx
git commit -m "feat(penyaluran): add MPZIS approval UI"
```

---

### Task 18: PPD, finance, payment, confirmation, and receipt experience

**Files:**
- Create: `frontend-next/components/penyaluran/mustahik/ppd/PpdForm.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/RabLineEditor.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/FinanceApprovalPanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/PaymentEvidencePanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/RecipientConfirmationPanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/SystemReceiptPanel.tsx`
- Create: `frontend-next/components/penyaluran/mustahik/ppd/PpdWorkflow.test.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx`

**Interfaces:**
- Produces: complete F-PKP/03 operational flow through receipt download.
- Consumes: PPD/payment/receipt DTOs and commands, shared money/dialog/error controls.

- [ ] **Step 1: Write failing full PPD UI tests**

Assert exact form/PPD/transaction numbers; source/payment options; `Lain-lain`; structured masked bank snapshot; one initial RAB row; add to three/remove/renumber; fourth prevented; calculated visual total/ceiling/difference; server total reconciliation; finance role routing; proof upload constraints; independent verification; confirmation methods/note; completion blockers; receipt pending/ready/failed/download.

- [ ] **Step 2: Run and verify RED**

Run: `npm --prefix frontend-next test -- PpdWorkflow.test.tsx`

Expected: FAIL because PPD components are absent.

- [ ] **Step 3: Implement PPD and RAB draft UX**

Render all fields with persistent labels. Client total is advisory and announced in Indonesian; submission always displays the approved MPZIS ceiling and irreversible hash summary. Keep bank account editable only in draft; after submit expose last four only.

- [ ] **Step 4: Implement role-specific finance panels**

Keuangan lands on assigned check/approve actions. Show exact snapshot hash and disabled separation reason. Penyaluran sees read-only finance state and cannot render impersonation controls.

- [ ] **Step 5: Implement payment and confirmation panels**

Validate PDF/JPEG/PNG and 10 MiB client-side before multipart upload; preserve selection on network failure; show persisted proof id/hash only after server response. Verification is a separate actor action. Confirmation requires method and note and may attach optional evidence.

- [ ] **Step 6: Implement completion and receipt states**

Show every gate separately; enable completion only from server capability. Pending polls only while visible with bounded backoff; failed shows retry guidance without invalidating completion; ready downloads through authenticated blob and displays file id/hash.

- [ ] **Step 7: Run PPD UI tests and typecheck**

Run: `npm --prefix frontend-next test -- PpdWorkflow.test.tsx CaseWorkflowPanel.test.tsx`

Expected: PASS for 1–3 rows, role separations, evidence flow, stale recovery, keyboard/error accessibility, and all receipt states.

Run: `npm --prefix frontend-next run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit PPD UI**

```bash
git add frontend-next/components/penyaluran/mustahik/ppd frontend-next/components/penyaluran/mustahik/case/CaseWorkflowPanel.tsx
git commit -m "feat(penyaluran): add PPD payment completion UI"
```

---

### Task 19: Masked end-to-end contract and regression gate

**Files:**
- Create: `server/penyaluran-p0-e2e.test.js`
- Create: `server/fixtures/penyaluran-p0-masked-case.json`
- Create: `frontend-next/components/penyaluran/mustahik/P0Accessibility.test.tsx`
- Modify: `server/access-control.integration.test.js`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Produces: executable acceptance proof covering the entire P0 chain with masked data.
- Consumes: all prior backend/frontend contracts.

- [ ] **Step 1: Add a masked fixture with distinct actors**

Use one creator/submitter, three different Penyaluran staff approvers, two different Penyaluran leaders, one Keuangan staff, one Keuangan leader, one payment verifier distinct from recorder, and a recipient confirmer. Use clearly synthetic NIK/account/phone values and a tiny valid PDF proof fixture generated in memory.

- [ ] **Step 2: Write the failing API happy path**

Drive intake → early generic checks → Assessment draft/submit/accept → MPZIS draft/submit/five approvals → PPD draft/RAB/submit → finance check/approve → proof/payment → verification → confirmation → completion → receipt retrieval. Assert every read-back equals submitted source data, each event/hash/actor is bound, status advances at exact gates, and no legacy endpoint/Excel is called.

- [ ] **Step 3: Write independent negative E2E cases**

From the last valid checkpoint, separately prove completion is blocked by wrong/missing amount, proof, finance approval, payment verification, confirmation, stale hash, duplicated MPZIS actor, and altered evidence bytes. Assert zero partial state/event changes after each failure.

- [ ] **Step 4: Run backend E2E and verify behavior**

Run: `node --test server/penyaluran-p0-e2e.test.js`

Expected: PASS entirely against pg-mem/test artifact storage with no external database or network.

- [ ] **Step 5: Add full keyboard/accessibility regression tests**

Tab through every form in source order, exercise radio groups and dialogs by keyboard, assert visible labels, fieldset legends, 44px action classes, error-summary focus/link behavior, polite save announcements, alert failures, focus restoration, and no horizontal-hidden approval/error state at mobile markup.

- [ ] **Step 6: Run frontend regression and production build**

Run: `npm --prefix frontend-next test`

Expected: all frontend tests PASS.

Run: `npm --prefix frontend-next run typecheck`

Expected: PASS.

Run: `npm --prefix frontend-next run build`

Expected: Next production build PASS without route/type errors.

- [ ] **Step 7: Run full backend suite**

Run the exact 17-file safe backend command from the Execution preflight above; root `npm test` remains deferred until Task 1 creates safe unit/integration separation and must not read implicit `.env`.

Expected: all backend tests PASS, including migration parity when `P0_TEST_DATABASE_URL` is present.

- [ ] **Step 8: Commit acceptance tests**

```bash
git add server/fixtures/penyaluran-p0-masked-case.json server/penyaluran-p0-e2e.test.js server/access-control.integration.test.js frontend-next/components/penyaluran/mustahik/P0Accessibility.test.tsx frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx
git commit -m "test(penyaluran): prove P0 digital workflow"
```

---

### Task 20: Final review, migration rehearsal, masked UAT, and deployment handoff

**Files:**
- Create: `docs/operations/mustahik-p0-runbook.md`
- Create: `docs/operations/mustahik-p0-verification.md`
- Modify: `README.md`

**Interfaces:**
- Produces: reproducible evidence for acceptance gates, rollback, and an explicit deployment decision.
- Consumes: all implementation tasks; this task does not deploy to production.

- [ ] **Step 1: Run the complete clean verification matrix**

Run from the isolated worktree with disposable environment:

```text
node --test server/access-control.integration.test.js server/access-policy.test.js server/audit-log.test.js server/health.test.js server/penerimaan-export.test.js server/penerimaan-legacy-freeze.test.js server/penerimaan-permissions.test.js server/penerimaan-service.test.js server/penyaluran-permissions.test.js server/penyaluran-transactions.repository.test.js server/penyaluran-workflow.integration.test.js server/public-tracking.repository.test.js server/repository.metrics.test.js server/request-rate-limit.test.js server/runtime-policy.test.js server/webhook-verification.test.js server/workflow-integrity.test.js
npm --prefix frontend-next test
npm --prefix frontend-next run typecheck
npm --prefix frontend-next run build
npm run p0:migration:dry-run
node --test server/migration-parity.test.js
node --test server/penyaluran-p0-e2e.test.js
```

Record command, exit code, test count, duration, and relevant artifact hashes in `docs/operations/mustahik-p0-verification.md`; never claim a skipped parity test as executed.

- [ ] **Step 2: Rehearse migration and restore on a disposable PostgreSQL database**

Take a test backup, restore it into a second `_test` database, run read-only dry-run, apply migration under the runner, restart twice to prove checksum idempotency, run parity, and verify all legacy status/value hashes unchanged. Record database names with credentials removed.

- [ ] **Step 3: Execute masked browser UAT locally**

Use `PENYALURAN_P0_ENABLED=true` only in the isolated UAT environment. Complete the full Next flow using the distinct masked accounts, capture each stage, verify keyboard completion at desktop/tablet/mobile widths, inspect console/network failures, download the receipt, and compare its SHA-256/text against the API record.

- [ ] **Step 4: Request two independent Luna reviews**

One reviewer checks spec/authorization/data-integrity/security; the other checks Next UX/accessibility/source-field parity. Resolve every Critical/Important issue with a new focused failing test and separate fix commit, then rerun the complete matrix.

- [ ] **Step 5: Write exact rollout and rollback commands without executing production writes**

The runbook must require: verified VPS PostgreSQL backup+restore, active-role account count, artifact directory permissions, encryption key presence, deploy with flag false, migration dry-run report approval, migration execution, backend health/read-only smoke, Next deploy, masked allow-list UAT, explicit cutover timestamp approval, legacy write freeze verification, monitoring, and fix-forward rollback. It must state that evidence tables/files are never down-migrated or deleted.

- [ ] **Step 6: Commit operational evidence**

```bash
git add README.md docs/operations/mustahik-p0-runbook.md docs/operations/mustahik-p0-verification.md
git commit -m "docs(penyaluran): add P0 rollout evidence"
```

- [ ] **Step 7: Stop at the deployment approval gate**

Report branch SHA, complete verification evidence, migration dry-run findings, review findings, and masked UAT receipt hash. Do not push, migrate, restart PM2, enable the flag, or deploy until the user explicitly approves production deployment after reviewing this evidence.

---

## Self-review checklist

- [ ] Every approved Assessment field and conditional is implemented/tested in Tasks 2, 3, 6, 14, and 16.
- [ ] Assessment inventory asserts exactly 18 fields as Household 5 + Housing 4 + Livelihood 6 + Request history 3; no test or implementation uses the older 16-label count.
- [ ] Canonical P0 intake is explicit in Tasks 2, 5, 14, and 15: server-owned `workflow_mode='p0'`, flag gate, actor audit, idempotency, typed client, and no legacy fallback.
- [ ] The duplicate Assessment print block is one stored row and two receipt render blocks in Tasks 6 and 11.
- [ ] No score/synthetic completeness/SLA/document truth survives Tasks 3, 13, and 15.
- [ ] Five MPZIS actors, creator/submitter exclusion, role levels, order, return/revision, and immutable hash are covered in Tasks 3, 7, 17, and 19.
- [ ] PPD RAB 1–3, exact total/terbilang, ceiling, enums, bank encryption/masking, and unique numbers are covered in Tasks 3, 8, 14, and 18.
- [ ] Finance, payment proof, recorder/verifier separation, confirmation, and complete-chain locking are covered in Tasks 8–10 and 18–19.
- [ ] Payment recorder/verifier are explicitly Keuangan; recipient confirmer is explicitly assigned Penyaluran or Surveyor; every excluded role has a zero-side-effect negative test in Task 10.
- [ ] Immutable files, per-response access auditing, zero bytes on audit failure, archive/restore, and restrictive FKs are covered in Tasks 2, 9, and 12.
- [ ] Archive/restore each increment `workflow_version` exactly once and prove audit/projection/idempotency rollback and replay atomicity in Task 12.
- [ ] PostgreSQL/SQLite startup separation, exact init order, schema ledger parity, and migration ownership are executable in Tasks 1–2.
- [ ] Every legacy table has an explicit deterministic mapping in Task 2, and every legacy writer has fail-closed/zero-side-effect coverage in Task 12.
- [ ] Canonical snapshots have exact per-artifact component fixtures, field exclusions, canonical bytes, and SHA-256 expectations in Task 3.
- [ ] Receipt jobs use `FOR UPDATE` lease ownership, prove two-worker single output, and clean lease-owned orphan files in Task 11.
- [ ] Fresh/upgrade parity, deterministic legacy mapping, checksum ledger, dry-run, feature flag, cutover, and fix-forward rollback are covered in Tasks 1–2, 12, and 20.
- [ ] Next typed methods, four-tab shell, real documents/history, autosave, stale recovery, accessibility, and masked E2E are covered in Tasks 14–19.
- [ ] Receipt provenance, two copies/one row, masked secrets, idempotent bytes/hash, and audited retrieval are covered in Tasks 9–11 and 19.

### Plan-author self-review completed on 2026-09-13

- **Spec coverage:** Sections 1–5 map to Tasks 2–8 and 12; hashing/roles/transactions/API map to Tasks 3–13; Next experience/validation/accessibility map to Tasks 14–18; security/receipt map to Tasks 9–11; migration/compatibility/tests/acceptance/rollout/rollback map to Tasks 1–2, 12, and 19–20. No approved requirement is left without an implementation and test task.
- **Placeholder scan:** The plan contains no deferred implementation marker or instruction to infer unspecified validation/error behavior. Each code task has an explicit RED command, implementation contract, GREEN command, and commit boundary.
- **Type consistency:** `P0Actor`, `P0CommandMeta`, `P0ServiceContext`, exact decimal-string money, revision/hash fields, service names, route names, and frontend client method names are stable across dependent tasks.
- **Concurrency consistency:** Shared integration files have one serial owner; artifact-specific new files are the only parallel-safe expansion boundary.
- **Necessary hash formalization:** A final PDF cannot truthfully contain its own exact whole-file SHA-256. Task 11 therefore prints the canonical immutable receipt payload hash inside the PDF and stores/returns the exact final PDF byte hash separately. Both are clearly labeled and tested; neither is presented as the other.
- **Deployment boundary:** Task 20 prepares and verifies deployment evidence but stops before push, VPS migration, PM2 restart, or feature-flag cutover. Production requires a separate explicit approval.

## Execution handoff

Use **Subagent-Driven Development**: dispatch a fresh Luna implementer for each numbered task and perform two reviews before accepting it—first spec compliance, then code quality/security. Tasks 1–13 are dependency-ordered backend work; Tasks 14–18 are dependency-ordered frontend work after the server contracts stabilize; Task 19 is integration; Task 20 is verification and a deployment approval gate. The shared-file expansion boundary above overrides parallel dispatch whenever two tasks touch the same integration file.
