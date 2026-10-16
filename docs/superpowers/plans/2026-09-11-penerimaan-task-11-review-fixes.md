# Penerimaan Task 11 Review Fixes Implementation Plan

> **For agentic workers:** Execute this plan task by task. Use test-driven development, keep changes scoped to Task 11, and do not claim completion until every acceptance command below has fresh passing output.

**Goal:** Close the remaining correctness, security, and workflow gaps found while reviewing commit `1e264acf00ca0ab028232022b51f4f109442092d` so Task 11 can be accepted honestly.

**Architecture:** Keep the existing Express/PostgreSQL backend and Next.js frontend. Establish one canonical report-filter contract shared by preview and export-job creation. Persist immutable export-job inputs, use atomic state transitions, keep money as exact integer text/`BigInt` until presentation, and encrypt provider secrets with authenticated encryption before persistence.

**Tech stack:** Node.js ESM, Express, PostgreSQL, `node:test`, Next.js/React/TypeScript, Vitest, ExcelJS, PDFKit.

---

## Review verdict and scope

Task 11 is **not accepted yet** even though the current test suites pass. The green tests do not cover several requirements, and direct inspection found implementation defects.

Work from the current branch/commit. Do not start Task 12, deploy, push, rewrite unrelated code, or amend historical commits. Produce one focused follow-up commit after all checks pass:

```text
fix(penerimaan): close remaining Task 11 review gaps
```

Preserve existing behavior unless this plan explicitly corrects it. Never log, return, or place provider secrets in audit metadata. Do not weaken an assertion merely to make a test pass.

## Task 1: Add failing regression tests for every confirmed gap

**Files:**

- Modify: `server/penerimaan-hardening-regression.test.js`
- Modify/add focused repository or route tests where isolation is clearer
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.test.tsx`

Add tests first and demonstrate that the new assertions fail for the expected reason. Cover at least:

1. Webhook normalization rejects missing, empty, unknown, cancelled, expired, denied, and failed payment statuses. Test each supported provider's documented success values separately; a success value for one provider must not be accepted accidentally for another.
2. An amount beyond `Number.MAX_SAFE_INTEGER` remains exact through webhook normalization, approval-threshold comparison, report summary, XLSX, PDF formatting helpers, and frontend rendering.
3. Report filters use exact `account_id`, exact numeric `program_id`, separate free-text program search, and have explicit behavior for audit view.
4. Report preview data comes from the report endpoint only. Rendering/refetching a report must not call the generic transactions endpoint.
5. The exact same normalized filter object is used for preview and export-job creation.
6. Export creation rejects an unsupported format. Missing job IDs return `404`; they must never create a replacement job.
7. A job cannot be downloaded by an unrelated non-admin user. Query parameters cannot replace the stored format or stored filters.
8. Two concurrent download attempts cannot both transition/generate the same job. Exercise both success and injected generation failure.
9. Provider secret ciphertext differs from plaintext, can be decrypted only by the server helper, and is absent from API responses, logs, and audit metadata.
10. Channel/account/fund/provider writes reject unknown keys, malformed identifiers, invalid booleans such as string `"false"`, invalid references, and unsafe threshold integers.
11. A forced audit-write failure rolls back each settings resource mutation, not only operational settings.
12. Report freshness is derived from stored data, not the current wall-clock time.

Suggested first red runs:

```powershell
node --test --test-concurrency=1 server/penerimaan-hardening-regression.test.js
```

```powershell
Set-Location frontend-next
npm test -- --run components/penerimaan/laporan/ReportWorkspace.test.tsx
```

Do not proceed until the tests fail on the current defects rather than from broken fixtures or syntax errors.

## Task 2: Make webhook verification fail closed and money exact

**Files:**

- Modify: `server/webhook-verification.js`
- Modify: `server/penerimaan-permissions.js`
- Modify provider webhook fixtures/tests

Required changes:

1. Replace the global success-status shortcut with an explicit provider-aware status mapping.
2. Require a non-empty status. Missing or unrecognized status must return a rejected normalization result and must not enqueue/process a transaction.
3. Parse monetary input as canonical non-negative integer text. Reject decimals, exponent notation, signs, `NaN`, infinity, unsafe coercions, and values outside the supported database range.
4. Compare amounts and approval thresholds with `BigInt` or an equivalent exact-integer representation. Do not use `Number` for authorization decisions.
5. Define timestamp precedence explicitly and test it. Use `payment_time`, then `settlement_time`, then transaction time/date, then created time unless a provider contract requires a documented override.
6. A duplicate webhook may return the existing idempotent response only after a confirmed duplicate/unique-conflict condition. Do not swallow an unrelated processing error merely because a prior event exists.

## Task 3: Establish one canonical report query and preview contract

**Files:**

- Create: `server/penerimaan-report-query.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `frontend-next/lib/penerimaan-api.ts`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx`

Implement one normalizer/query builder used by report preview and export-job creation.

The normalized contract must explicitly include:

- period start/end;
- channel;
- fund type;
- `account_id` matched against `t.account_id`, never against a bank-account-number field;
- exact numeric `program_id` plus a distinct free-text `program_search` when needed;
- Muzakki identifier;
- manual/digital source;
- exception flag;
- reconciliation state;
- normal/audit view;
- free-text search;
- deterministic sort and pagination for preview.

For audit view, query a real audit/history source with a documented row shape. Merely skipping the transaction-status predicate is not an audit implementation. If the current schema cannot support the intended audit report, add the smallest migration/repository query required and test it.

Return summary, preview rows, applied normalized filters, and data freshness from the report endpoint. Freshness must be computed from the relevant stored records, for example `MAX(updated_at)`/audit timestamp. It must not be `new Date()` or a hard-coded `Real-time` fallback.

Update the UI so all supported filters are visible and it renders the report endpoint's preview. Remove the report page's call to generic `getTransactions`. Use the server-returned normalized filters as the source of truth.

## Task 4: Implement a real export-job lifecycle

**Files:**

- Modify: `server/index.js`
- Modify: `server/repository.js`
- Modify: `server/penerimaan-export.js`
- Modify: `frontend-next/lib/penerimaan-api.ts`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx`

Required behavior:

1. `POST` job creation accepts only whitelisted formats (`xlsx`, `pdf`) and the canonical normalized report filters. Persist creator identity, format, filters, timestamps, and queued state.
2. Stored format and filters are immutable job inputs. Download/status query parameters must not override them.
3. Status and download routes return `404` for a missing job. Never fabricate a new job during download.
4. A non-admin user may access only jobs they created. Define and test the admin override deliberately.
5. Transition `queued -> processing` with one conditional database update and require `rowCount === 1`. A second worker/download must receive a stable conflict/in-progress response and must not generate another file.
6. Transition `processing -> completed|failed` conditionally. Store a sanitized public error code/message; never persist raw stack traces, SQL errors, paths, or secrets for client display.
7. The UI must create a job, poll/render `queued`, `processing`, `completed`, or `failed`, and enable download only when valid for the implemented lifecycle. It must send exactly the canonical filters shown in preview.
8. Remove or explicitly preserve any legacy direct-export route behind a tested compatibility boundary. It must not bypass authorization, canonical filters, or job-state guarantees.

## Task 5: Encrypt and wire provider secrets correctly

**Files:**

- Create: `server/penerimaan-provider-secrets.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify/add migrations only if the existing column format is insufficient

Current code writes `newSecret.trim()` directly into `webhook_secret_encrypted`; this is plaintext and must be replaced.

Implement authenticated encryption using Node's crypto primitives, preferably AES-256-GCM with a fresh random nonce for every write. Use a dedicated environment key such as `PENERIMAAN_PROVIDER_SECRET_ENCRYPTION_KEY` with a strict documented encoding and exact key length.

Requirements:

1. Production startup/use fails closed when encrypted provider secrets are required but the key is missing or malformed. Tests use an explicit deterministic test key; never add a real key to the repository.
2. Store a versioned envelope containing nonce, ciphertext, and authentication tag. Ciphertext must differ for repeated encryption of the same secret.
3. Decrypt only inside the webhook verification path. API list/detail responses expose only `has_secret`/masked metadata, not a secret-like value.
4. Wire webhook processing to the active provider configuration in the database. The settings screen must not edit a secret that runtime verification ignores. Any temporary environment fallback must be explicit, tested, and limited to legacy unconfigured providers.
5. Support the required provider create/update workflow with strict validation, or document and enforce a seeded-provider-only contract in both API and UI. Do not leave an accidental half-supported state.
6. Audit only that a secret was rotated, plus safe actor/provider metadata. Never audit plaintext, ciphertext, nonce, tag, or key material.

## Task 6: Harden settings validation and audit atomicity

**Files:**

- Modify: `server/index.js`
- Modify: `server/repository.js`
- Modify/create focused validation helpers and tests

For channel, account, fund type, provider, and operational settings:

1. Whitelist allowed request keys and reject unknown keys.
2. Parse booleans strictly; only actual JSON booleans are accepted. `Boolean(payload.is_active)` is not validation.
3. Validate identifier/code format and length, display-name length, enums, and required references.
4. Validate thresholds as non-negative safe integers at the HTTP boundary, then store/compare them exactly. Reject rounded unsafe JSON numbers; allow a documented digit-string form if large values are supported.
5. Enforce code immutability where codes are identifiers.
6. Prevent activating invalid account/channel/provider configurations.
7. Wrap the domain mutation and audit insertion in the same database transaction. Add forced audit-failure rollback tests for every resource type.

## Task 7: Remove remaining lossy money conversions

**Files:**

- Modify: `server/penerimaan-export.js`
- Modify: `server/repository.js`
- Modify: `frontend-next/components/penerimaan/laporan/ReportWorkspace.tsx`
- Modify shared money utilities/types as needed

Audit the Task 11 path for `Number(...)`, unary `+`, numeric `reduce`, division, and locale formatting applied to money.

Keep rupiah values as canonical integer strings/`BigInt` for totals and authorization. Create presentation helpers that format digit strings without first converting to `Number`. For percentages/averages, define an explicit precision and rounding rule using integer arithmetic or a decimal library already present in the project.

XLSX and PDF must display exact rupiah values above `Number.MAX_SAFE_INTEGER`. The frontend must do the same. Do not solve display correctness by changing the stored/exported value to scientific notation or a rounded float.

## Task 8: Final verification and evidence

Run all commands from a clean baseline after implementation:

```powershell
node --test --test-concurrency=1 server/*.test.js
```

```powershell
Set-Location frontend-next
npm test -- --run
npm run typecheck
npm run build
```

Then return to the repository root and run:

```powershell
git diff --check
git status --short
git diff --stat
```

Acceptance requires:

- every new regression test passes;
- the full backend and frontend suites pass;
- typecheck and production build pass;
- no generated cache/build artifact is included in the commit;
- no plaintext/ciphertext secret or real key appears in tracked files, logs, API fixtures, or audit fixtures;
- the final report lists exact commands and fresh counts, plus the commit hash;
- `git status --short` is clean after the focused commit.

Do not mark Task 11 accepted merely because the pre-existing 169 backend and 174 frontend tests remain green. Acceptance depends on the additional cases in this plan.
