# Penyaluran Map Callout Drag Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected kecamatan callout connector attached to its card while the Mapbox map is panned.

**Architecture:** Extend the existing callout positioning event list with Mapbox's continuous `move` event. Reuse the current native GeoJSON connector and DOM callout; do not change marker selection, camera, or layout behavior.

**Tech Stack:** Next.js, React, TypeScript, Mapbox GL JS, Vitest.

## Global Constraints

- Change only callout positioning behavior; preserve marker, selection, camera, and data behavior.
- Do not deploy.
- Follow TDD: observe RED before production code, then GREEN.

---

### Task 1: Keep the connector attached during map drag

**Files:**
- Modify: `frontend-next/components/penyaluran/map/RealKecamatanMap.test.ts:90-94`
- Modify: `frontend-next/components/penyaluran/map/RealKecamatanMap.tsx:43-46,140-146`
- Create: `docs/superpowers/plans/2026-09-13-penyaluran-map-callout-drag.md`

**Interfaces:**
- Consumes: `getCalloutPositionEvents()` and the existing `updateCallout()` Mapbox lifecycle.
- Produces: `getCalloutPositionEvents(): readonly ['resize', 'move']`, used to refresh the connector during pan.

- [ ] **Step 1: Write the failing test**

Change the existing positioning-event assertion to:

```ts
it('recalculates the callout and connector while the map moves or resizes', () => {
  expect(getCalloutPositionEvents()).toEqual(['resize', 'move']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend-next run test -- components/penyaluran/map/RealKecamatanMap.test.ts --run`

Expected: FAIL because the current helper returns only `['resize']`.

- [ ] **Step 3: Write minimal implementation**

Change only the helper return value:

```ts
export function getCalloutPositionEvents(): readonly ['resize', 'move'] {
  return ['resize', 'move'];
}
```

The existing effect already registers every returned event with `map.on` and cleans it up with `map.off`, so no other behavior changes are needed.

- [ ] **Step 4: Run focused test to verify it passes**

Run: `npm --prefix frontend-next run test -- components/penyaluran/map/RealKecamatanMap.test.ts --run`

Expected: 1 test file and all 19 tests pass.

- [ ] **Step 5: Run broader verification**

Run the frontend test suite, TypeScript check, and production build using the scripts declared in `frontend-next/package.json`. If browser tooling is available, click a kecamatan, drag the map horizontally and vertically, and verify the connector remains attached throughout the drag.

- [ ] **Step 6: Inspect scope and commit**

Run `git diff --check` and `git status --short`; confirm only the plan, map component, and map test are changed. Commit with:

```bash
git add docs/superpowers/plans/2026-09-13-penyaluran-map-callout-drag.md frontend-next/components/penyaluran/map/RealKecamatanMap.tsx frontend-next/components/penyaluran/map/RealKecamatanMap.test.ts
git commit -m "fix(penyaluran): keep map callout connected while dragging"
```
