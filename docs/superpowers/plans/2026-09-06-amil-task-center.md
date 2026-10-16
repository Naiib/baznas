# Amil Task Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give amil a focused daily task centre generated from the existing Mustahik workflow.

**Architecture:** Read Mustahik records and convert their active statuses into action cards in the browser. Each card deep-links to the existing decision workspace, keeping workflow mutations centralized there.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Vitest, existing Mustahik API.

### Task 1: Task centre UI

**Files:**
- Create: `frontend-next/components/penyaluran/tugas/AmilTaskCenter.tsx`
- Create: `frontend-next/components/penyaluran/tugas/AmilTaskCenter.test.tsx`
- Create: `frontend-next/app/(penyaluran)/penyaluran/tugas/page.tsx`
- Modify: `frontend-next/components/penyaluran/penyaluran-nav.ts`

- [ ] Write failing tests for status-based task rendering and direct links to Mustahik records.
- [ ] Map Diajukan/Verifikasi to administrative review, Survey to field follow-up, Persetujuan MPZIS to decision review, and PPD/FPD to disbursement processing.
- [ ] Render a responsive priority summary, filters, empty/loading/error states, and action cards.
- [ ] Run focused tests, typecheck, and production build.
- [ ] Commit with `feat(tugas): add amil task centre`.
