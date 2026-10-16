# Peta Sebaran Desktop Decision Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/penyaluran/peta` as a desktop-first workspace for reading penyaluran, mustahik, program, and asnaf by kecamatan.

**Architecture:** Preserve Leaflet, OpenStreetMap, and existing Tangerang GeoJSON polygons. `map-data.ts` becomes the typed source for demo insight data and metric helpers; `PetaSebaranWorkspace` owns selected kecamatan and metric state; `RealKecamatanMap` displays metric-aware choropleth styling.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.8 strict, Tailwind CSS 4, React Leaflet 5, Lucide React, Vitest, Testing Library.

## Global Constraints

- Frontend only: do not change backend, API contracts, database, or top-level navigation.
- Preserve real OSM tiles, the existing 13-kecamatan GeoJSON, and `/penyaluran/mustahik?kecamatan={nama}` drill-down.
- Use API data first and typed demo data as fallback.
- Match the established Manrope, emerald, white-surface desktop language.
- Use a text label and value with every color-based metric; respect reduced motion.

---

## File structure

- Modify `frontend-next/components/penyaluran/map/map-data.ts` — metric type, fallback area insight, normalizers, and formatters.
- Create `frontend-next/components/penyaluran/map/map-data.test.ts` — unit tests for metric fallback/API resolution.
- Modify `frontend-next/components/penyaluran/map/RealKecamatanMap.tsx` — `metric` prop, metric-aware fill/tooltip/legend.
- Modify `frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.tsx` — header, toolbar, map/detail grid, program and asnaf insight panels.
- Create `frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.test.tsx` — interaction tests with a mocked Leaflet map.

### Task 1: Add a typed peta data model

**Files:**
- Modify: `frontend-next/components/penyaluran/map/map-data.ts`
- Create: `frontend-next/components/penyaluran/map/map-data.test.ts`

**Interfaces:**
- Produces `export type MapMetric = 'funds' | 'beneficiaries' | 'asnafNeed'`.
- Produces `getKecamatanMapValue(name, metric, liveData?)` and `getKecamatanInsight(name)`.
- Consumes `DEMO_KECAMATAN_DATA` and `PenyaluranByKecamatan`.

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { getKecamatanInsight, getKecamatanMapValue } from './map-data';

describe('peta metric helpers', () => {
  it('uses API realization for the funds metric', () => {
    expect(getKecamatanMapValue('Cipondoh', 'funds', [{
      name: 'Cipondoh', totalDisalurkan: 2_900_000_000, totalMustahik: 1_500,
    } as never])).toBe(2_900_000_000);
  });

  it('uses fallback beneficiary data when API data is unavailable', () => {
    expect(getKecamatanMapValue('Cipondoh', 'beneficiaries')).toBe(1_480);
  });

  it('returns a known kecamatan insight', () => {
    expect(getKecamatanInsight('Karawaci')).toMatchObject({
      topProgram: 'Tangerang Sehat', dominantAsnaf: 'Miskin',
    });
  });
});
```

- [ ] **Step 2: Run the new test and confirm failure**

Run: `npm test -- map-data.test.ts`

Expected: FAIL because both helper exports are missing.

- [ ] **Step 3: Implement the minimal typed helpers**

```ts
export type MapMetric = 'funds' | 'beneficiaries' | 'asnafNeed';

export function getKecamatanMapValue(name: string, metric: MapMetric, liveData?: PenyaluranByKecamatan[]) {
  const data = liveData?.find((item) => item.name.toLowerCase() === name.toLowerCase())
    ?? DEMO_KECAMATAN_DATA[name];
  if (metric === 'funds') return data?.totalDisalurkan ?? 0;
  if (metric === 'beneficiaries') return data?.totalMustahik ?? 0;
  return data?.desil1Count ?? 0;
}
```

Add `KECAMATAN_INSIGHTS` for all 13 names with `topProgram`, `dominantAsnaf`, `priorityNote`, and `trendPercent`. Keep 5-program totals and asnaf distribution as typed constants here, not inline JSX.

- [ ] **Step 4: Run the test and confirm success**

Run: `npm test -- map-data.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the data model**

```bash
git add frontend-next/components/penyaluran/map/map-data.ts frontend-next/components/penyaluran/map/map-data.test.ts
git commit -m "feat(peta): add metric insight data helpers"
```

### Task 2: Make `RealKecamatanMap` metric-aware

**Files:**
- Modify: `frontend-next/components/penyaluran/map/RealKecamatanMap.tsx`
- Modify: `frontend-next/components/penyaluran/map/map-data.test.ts`

**Interfaces:**
- Consumes `metric?: MapMetric` and `getKecamatanMapValue()`.
- Produces active-metric choropleth, legend, and tooltip while preserving all current consumers.

- [ ] **Step 1: Add the failing asnaf metric test**

```ts
it('uses desil one count for the asnaf-need metric', () => {
  expect(getKecamatanMapValue('Cipondoh', 'asnafNeed')).toBe(560);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- map-data.test.ts`

Expected: FAIL until `asnafNeed` uses the fallback `desil1Count` branch.

- [ ] **Step 3: Implement active metric map props and semantics**

```tsx
export default function RealKecamatanMap({
  metric = 'funds', selectedKecamatan, onSelectKecamatan, liveData, periodData,
}: {
  metric?: MapMetric;
  selectedKecamatan?: string | null;
  onSelectKecamatan?: (name: string) => void;
  liveData?: PenyaluranByKecamatan[];
  periodData?: MapPeriodData;
}) {
  const value = getKecamatanMapValue(name, metric, liveData);
}
```

Normalize each active metric before calling `getChoroplethColor`. Keep polygon click, hover, and mouseout behavior. Replace fixed “Mustahik Terbantu” tooltip/legend wording with metric-specific Indonesian labels.

- [ ] **Step 4: Validate map changes**

Run: `npm test -- map-data.test.ts && npm run typecheck`

Expected: PASS, including existing Dashboard `RealKecamatanMap` call sites without prop changes.

- [ ] **Step 5: Commit the map enhancement**

```bash
git add frontend-next/components/penyaluran/map/RealKecamatanMap.tsx frontend-next/components/penyaluran/map/map-data.test.ts
git commit -m "feat(peta): reflect active metric on real map"
```

### Task 3: Build the approved desktop workspace

**Files:**
- Modify: `frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.tsx`
- Create: `frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.test.tsx`

**Interfaces:**
- Consumes Task 1 helpers and `RealKecamatanMap` from Task 2.
- Produces heading, three `aria-pressed` metric controls, selected-area detail, 5-program allocation, asnaf distribution, and Mustahik drill-down link.

- [ ] **Step 1: Write the failing workspace tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { PetaSebaranWorkspace } from './PetaSebaranWorkspace';

vi.mock('../map/RealKecamatanMap', () => ({
  default: ({ onSelectKecamatan }: { onSelectKecamatan: (name: string) => void }) => (
    <button type="button" onClick={() => onSelectKecamatan('Karawaci')}>Pilih Karawaci</button>
  ),
}));

it('updates selected detail after selecting a map area', async () => {
  render(<PetaSebaranWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pilih Karawaci' }));
  expect(screen.getByRole('heading', { name: 'Karawaci' })).toBeInTheDocument();
  expect(screen.getByText('Tangerang Sehat')).toBeInTheDocument();
});

it('changes metric wording to jumlah mustahik', async () => {
  render(<PetaSebaranWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Jumlah mustahik' }));
  expect(screen.getByText('Mustahik terbantu')).toBeInTheDocument();
});
```

Mock `@/lib/api/client` to reject its request so the test proves fallback UI behavior.

- [ ] **Step 2: Run the component tests and confirm failure**

Run: `npm test -- PetaSebaranWorkspace.test.tsx`

Expected: FAIL because the old workspace has no metric controls and no mock-map selection path.

- [ ] **Step 3: Implement the desktop page composition**

```tsx
const [metric, setMetric] = useState<MapMetric>('funds');

<div role="group" aria-label="Metrik peta" className="flex flex-wrap gap-2">
  {METRIC_OPTIONS.map((option) => (
    <button aria-pressed={metric === option.id} onClick={() => setMetric(option.id)}>
      {option.label}
    </button>
  ))}
</div>

<div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.7fr)]">
  <RealKecamatanMap metric={metric} selectedKecamatan={selectedKecamatan} onSelectKecamatan={setSelectedKecamatan} liveData={kecamatanList} />
  <SelectedKecamatanDetail />
</div>
```

Use a Program-style header panel and a compact desktop toolbar. Make the detail panel `flex flex-col` to fill map height without a bottom void. Under it, render exactly two balanced panels: compact horizontal bars for the five programs and a two-column semantic asnaf list. Keep UI copy Indonesian and use the active metric in detail copy and numbers.

- [ ] **Step 4: Run the workspace test and confirm success**

Run: `npm test -- PetaSebaranWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the workspace**

```bash
git add frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.tsx frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.test.tsx
git commit -m "feat(peta): redesign desktop decision workspace"
```

### Task 4: Verify the full desktop and narrow layout

**Files:**
- Modify only the smallest responsible source file from Tasks 1–3 if a verification defect appears.

**Interfaces:**
- Consumes completed metric data, real map, and workspace.
- Produces tested desktop and narrow rendering without API contract changes.

- [ ] **Step 1: Run all focused tests**

Run: `npm test -- map-data.test.ts PetaSebaranWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run production validation**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0.

- [ ] **Step 3: Verify at 1440px desktop**

Confirm centered navigation, a single calm header panel, working polygon selection, no empty detail-panel space, aligned program/asnaf panels, and visible wording changes across all three metrics.

- [ ] **Step 4: Verify at 390px width**

Confirm wrapping toolbar, map followed by detail, one-column insight panels, no clipped text, and no horizontal overflow.

- [ ] **Step 5: Commit a verification fix only if needed**

```bash
git add frontend-next/components/penyaluran/map/map-data.ts frontend-next/components/penyaluran/map/RealKecamatanMap.tsx frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.tsx frontend-next/components/penyaluran/peta/PetaSebaranWorkspace.test.tsx
git commit -m "fix(peta): polish responsive decision workspace"
```
