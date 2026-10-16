# Master Data Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a controlled configuration centre for operational programmes, asnaf, areas, required documents, payment methods, and staff roles.

**Architecture:** Persist category/key/label records in one `master_data` table, seed standard BAZNAS values once, and expose read access to operational roles. Restrict mutations to admins through existing JWT middleware. The Next page has a readable category switcher and shows editor controls only to an admin session.

**Tech Stack:** Express, PostgreSQL/SQLite adapter, Next.js, React, TypeScript, Tailwind, Vitest.

### Task 1: Persistent master-data API

**Files:**
- Modify: `server/db.js`
- Modify: `server/repository.js`
- Modify: `server/index.js`
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/lib/api/client.test.ts`

- [ ] Add a seeded `master_data` table and repository methods to list, create, and update a record.
- [ ] Add `GET /api/penyaluran/master-data` for authenticated penyaluran roles and admin-protected POST/PUT mutation routes.
- [ ] Add typed API client methods with a failing URL/method contract test, then make it pass.

### Task 2: Master Data Operations page

**Files:**
- Create: `frontend-next/components/penyaluran/pengaturan/MasterDataOperations.tsx`
- Create: `frontend-next/components/penyaluran/pengaturan/MasterDataOperations.test.tsx`
- Create: `frontend-next/app/(penyaluran)/penyaluran/pengaturan/page.tsx`
- Modify: `frontend-next/components/penyaluran/penyaluran-nav.ts`

- [ ] Write failing tests for rendering category records and admin-safe editor visibility.
- [ ] Implement category navigation, summary, table/cards, loading/empty/error states, and an admin-only add/edit dialog.
- [ ] Add a `Pengaturan` navigation item.
- [ ] Run focused tests, typecheck, production build, and commit with `feat(pengaturan): add operational master data`.
