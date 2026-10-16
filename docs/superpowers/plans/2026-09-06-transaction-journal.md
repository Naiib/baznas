# Transaction Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn existing PPD disbursement records into a searchable, auditable Penyaluran transaction journal.

**Architecture:** Add one read-only API join between `ppd` and `mustahik`; expose it through the typed Next API client and a new authenticated route. The page is a responsive, filterable journal that deep-links to the existing Mustahik detail workspace.

**Tech Stack:** Express, PostgreSQL/SQLite repository abstraction, Next.js 16, React 19, TypeScript, Tailwind, Vitest.

## Global Constraints

- Read existing PPD rows only; do not create or mutate financial records from the journal.
- Expose no bank-account details in list responses.
- Reuse Mustahik and PPD identifiers to preserve audit traceability.

### Task 1: Transaction list API and client contract

**Files:**
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/lib/api/client.test.ts`

- [ ] Write a failing client test for `api.getPenyaluranTransactions({ status: 'Selesai' })` and verify it calls `/api/penyaluran/transaksi?status=Selesai`.
- [ ] Add `listPenyaluranTransactions(filters)` joining `ppd` to `mustahik`, returning only transaction number, PPD number, recipient, programme, asnaf, district, amount, payment type, disbursement date, and status.
- [ ] Add `GET /api/penyaluran/transaksi` with search, programme, district, and status filters.
- [ ] Add typed `PenyaluranTransaction` and client method, then run focused tests and typecheck.
- [ ] Commit with `feat(transaksi): add transaction journal API`.

### Task 2: Authenticated transaction journal page

**Files:**
- Create: `frontend-next/components/penyaluran/transaksi/TransactionJournal.tsx`
- Create: `frontend-next/components/penyaluran/transaksi/TransactionJournal.test.tsx`
- Create: `frontend-next/app/(penyaluran)/penyaluran/transaksi/page.tsx`
- Modify: `frontend-next/components/penyaluran/penyaluran-nav.ts`

- [ ] Write a failing component test for loading rows, search/filter behavior, and the Mustahik deep link.
- [ ] Implement page header, concise KPI strip, filter controls, responsive list/table, receipt identifiers, amount, status, and empty/loading/error states.
- [ ] Add `Transaksi` navigation item after Data Mustahik.
- [ ] Run focused tests, typecheck, full frontend tests, and production build.
- [ ] Commit with `feat(transaksi): add penyaluran transaction journal`.
