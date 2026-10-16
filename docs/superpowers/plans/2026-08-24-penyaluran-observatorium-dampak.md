# Observatorium Dampak Penyaluran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat beranda `/penyaluran` yang menampilkan dampak penyaluran berdasarkan periode dalam visual Concept 1 yang interaktif.

**Architecture:** Satu modul data typed menjadi sumber fallback demo untuk setiap periode. Komponen presentasi kecil membaca state periode dari dashboard induk agar filter memperbarui seluruh visualisasi tanpa mengubah API atau halaman lain.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Vitest, React Leaflet, lucide-react.

## Global Constraints

- Hanya frontend; tidak menambah atau mengubah endpoint backend.
- Pertahankan top navigation dan rute penyaluran yang sudah ada.
- Gunakan data demo yang berbeda untuk `7d`, `30d`, dan `1y` sampai endpoint real tersedia.
- Semua teks penting harus tetap terbaca pada ukuran body minimal 14px untuk panel utama.
- Filter periode mengubah seluruh data ringkasan dan visualisasi.

---

### Task 1: Model Data Dashboard Berperiode

**Files:**
- Create: `frontend-next/components/penyaluran/dashboard/dashboard-data.ts`
- Create: `frontend-next/components/penyaluran/dashboard/dashboard-data.test.ts`

**Interfaces:**
- Produces: `DashboardPeriod`, `DashboardData`, `getDashboardData(period: DashboardPeriod): DashboardData`.

- [ ] **Step 1: Write the failing test**

```ts
expect(getDashboardData('7d').summary.totalDisbursed)
  .not.toBe(getDashboardData('1y').summary.totalDisbursed);
expect(getDashboardData('30d').asnaf.reduce((total, item) => total + item.percentage, 0))
  .toBe(100);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dashboard-data.test.ts`

- [ ] **Step 3: Write minimal implementation**

Define period-specific dummy totals, trends, asnaf, programs, activities, priorities, and map fallback data in one typed module.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dashboard-data.test.ts`

### Task 2: Interactive Insight Components

**Files:**
- Create: `frontend-next/components/penyaluran/dashboard/DashboardPeriodControl.tsx`
- Create: `frontend-next/components/penyaluran/dashboard/TrendPanel.tsx`
- Create: `frontend-next/components/penyaluran/dashboard/AsnafBreakdown.tsx`
- Create: `frontend-next/components/penyaluran/dashboard/ProgramImpactGrid.tsx`

**Interfaces:**
- Consumes: `DashboardData` from `dashboard-data.ts`.
- Produces: components that accept dashboard data and render the selected period without owning the global filter state.

- [ ] **Step 1: Write failing component behaviour tests**

```tsx
render(<DashboardPeriodControl value="30d" onChange={onChange} />);
fireEvent.click(screen.getByRole('button', { name: '7 Hari' }));
expect(onChange).toHaveBeenCalledWith('7d');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DashboardPeriodControl.test.tsx`

- [ ] **Step 3: Implement components**

Use readable charts/bars, semantic labels, and period-aware text. Avoid nested card surfaces and keep detail density controlled.

- [ ] **Step 4: Run relevant tests**

Run: `npm test -- DashboardPeriodControl.test.tsx dashboard-data.test.ts`

### Task 3: Compose Concept 1 Dashboard

**Files:**
- Modify: `frontend-next/components/penyaluran/dashboard/ConceptThreeDashboard.tsx`
- Modify: `frontend-next/components/penyaluran/dashboard/ImpactMetrics.tsx`
- Modify: `frontend-next/components/penyaluran/dashboard/ActionRail.tsx`
- Modify: `frontend-next/components/penyaluran/map/RealKecamatanMap.tsx`
- Modify: `frontend-next/app/(penyaluran)/penyaluran/page.test.tsx`

**Interfaces:**
- Consumes: `DashboardData` and child components from Tasks 1–2.
- Produces: one responsive `/penyaluran` Concept 1 dashboard.

- [ ] **Step 1: Write failing page assertions**

```tsx
expect(screen.getByRole('button', { name: '30 Hari' })).toBeInTheDocument();
expect(screen.getByText('Komposisi 8 Asnaf')).toBeInTheDocument();
expect(screen.getByText('Tren Penyaluran')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- page.test.tsx`

- [ ] **Step 3: Implement composition**

Wire one period state into all child panels, map fallback, action rail, and metric strip. Preserve selected-kecamatan behaviour and existing direct links.

- [ ] **Step 4: Run relevant tests**

Run: `npm test -- page.test.tsx dashboard-data.test.ts DashboardPeriodControl.test.tsx`

### Task 4: Verify, QA, and Deploy

**Files:**
- Create: `frontend-next/design-qa.md`

- [ ] **Step 1: Run automated verification**

Run: `npm test && npm run typecheck && npm run build`

- [ ] **Step 2: Inspect desktop implementation and controls**

Run the app, capture `/penyaluran` at desktop viewport, then test period selection and map selection.

- [ ] **Step 3: Record visual QA**

Compare source mock with same-size implementation screenshot, resolve P0–P2 findings, and set `final result: passed` in `frontend-next/design-qa.md`.

- [ ] **Step 4: Deploy the verified frontend**

Build the app on the VPS, restart the Next.js PM2 app, then check `/penyaluran` and `/api/health` return HTTP 200.
