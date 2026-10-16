# Laporan Penyaluran Balanced Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the report page so its library fills the primary workspace and its insights form a balanced responsive grid below it.

**Architecture:** Keep `LaporanPenyaluranWorkspace` as the single presentation component. Replace the outer library-plus-aside grid with sequential full-width sections: the library first, then a three-card insight grid. Keep the existing data module and interactions intact, while adding a short-lived dismissible toast state for action feedback.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library, Lucide.

## Global Constraints

- Preserve existing demo report data, category filtering, search, PDF, Excel, period, and create-report behavior.
- Desktop uses three insight columns; medium widths use two and small widths use one.
- Do not add dependencies or image assets.
- Toast must be compact, auto-dismissed, dismissible, and respect reduced-motion preferences.

---

### Task 1: Recompose report workspace and feedback toast

**Files:**
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx`
- Test: `frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx`

**Interfaces:**
- Consumes: `REPORT_CATEGORIES`, `REPORT_KPIS`, `REPORT_RECORDS`, `PROGRAM_ALLOCATION`, `ASNAF_DISTRIBUTION`, `REPORT_READINESS` from `laporan-data.ts`.
- Produces: Full-width `library-heading` section, sibling insight regions named `Alokasi 5 pilar`, `Komposisi asnaf`, and `Kesiapan laporan`, plus compact feedback status.

- [ ] **Step 1: Write the failing regression test**

```tsx
it('renders the library before a balanced insight grid', () => {
  render(<LaporanPenyaluranWorkspace />);

  expect(screen.getByRole('heading', { name: 'Library laporan' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Alokasi 5 pilar' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Komposisi asnaf' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Kesiapan laporan' })).toBeInTheDocument();
  expect(screen.getByLabelText('Insight laporan')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx --no-file-parallelism --maxWorkers=1`

Expected: FAIL because the existing workspace has no `Insight laporan` grid marker.

- [ ] **Step 3: Implement the balanced layout and compact feedback**

Move the report-library section out of the outer desktop two-column grid. Add a following section with `aria-label="Insight laporan"` and `grid gap-5 md:grid-cols-2 xl:grid-cols-3`. Move the existing program, asnaf, and readiness cards into this section. Replace the fixed 560px feedback bar with a small `bottom-5 right-5` status toast, a close button, and a `useEffect` timeout that clears feedback after 3200ms.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npx vitest run components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx --no-file-parallelism --maxWorkers=1`

Expected: PASS with the existing behavior tests and the new insight-grid regression test.

- [ ] **Step 5: Run the complete verification suite**

Run: `npx vitest run --no-file-parallelism --maxWorkers=1 && npm run build`

Expected: all test files pass and Next.js lists `/penyaluran/laporan` as a static route.

- [ ] **Step 6: Commit the completed task**

Run:

```bash
git add frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.tsx frontend-next/components/penyaluran/laporan/LaporanPenyaluranWorkspace.test.tsx docs/superpowers/plans/2026-08-29-laporan-layout-balance.md
git commit -m "fix(laporan): balance report workspace layout"
```
