# Laporan Library & Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the frontend-ready Report Library & Insights workspace for `/penyaluran/laporan`.

**Architecture:** Store typed demo reporting data separately from the client UI. The workspace consumes that data and owns category, search, and feedback state, leaving a clear replacement point for later export APIs.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Lucide React, Vitest and Testing Library.

## Global Constraints

- Local dummy data only; do not add export libraries, backend routes, or persistence.
- Match the existing light BAZNAS Penyaluran design system.
- Preserve one-column readability below desktop.
- Never commit `tsconfig.tsbuildinfo`.

---

### Task 1: Reporting data contract

**Files:**
- Create: `frontend-next/components/penyaluran/laporan/laporan-data.ts`
- Create: `frontend-next/components/penyaluran/laporan/laporan-data.test.ts`

- [ ] Write a failing data test asserting five monthly records and four KPI values.
- [ ] Run `npm test -- laporan-data.test.ts` and confirm it fails because the module is absent.
- [ ] Add `ReportCategory`, `ReportRecord`, categories, records, KPIs, program, asnaf, and readiness exports.
- [ ] Re-run the test and commit with `feat(laporan): add report library demo data`.

### Task 2: Workspace and interactions

**Files:**
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.tsx`
- Create: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx`

- [ ] Write failing component tests for selecting Per Asnaf, searching archive reports, and activating PDF/Excel feedback.
- [ ] Run `npm test -- LaporanPenyaluranWorkspace.test.tsx` and confirm expected failures.
- [ ] Implement the header, KPI strip, report categories/table, insight rail, and accessible feedback state.
- [ ] Re-run the component tests and commit with `feat(laporan): build report library workspace`.

### Task 3: Production gate

**Files:**
- Modify the Task 2 files only if verification identifies an issue.

- [ ] Run `npx vitest run --no-file-parallelism --maxWorkers=1`, `npm run typecheck`, and `npm run build`.
- [ ] Capture a desktop rendering and compare it with the selected Report Library & Insights mockup.
- [ ] Commit verified visual or accessibility corrections separately.
