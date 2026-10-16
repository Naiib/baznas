# Program Pillar Strip Font Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Program page UI typography consistent with the production system-sans KPI reference and implement the approved grouped five-pillar strip.

**Architecture:** Make Tailwind's default system `font-sans` the sole UI font by removing the unused local Manrope setup and competing body declaration, then update the existing `ProgramPilarWorkspace` card strip without changing its data or tab contract. The implementation reuses existing program data, icons, colors, sparklines, selected state, and responsive breakpoints.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS v4, Vitest, browser visual QA.

## Global Constraints

- Target the production computed system sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif`.
- Keep `font-mono` only for technical codes/IDs; user-facing metrics use the sans token.
- Preserve five-card DOM order, tab roles/ARIA, keyboard navigation, API overlay, icons, colors, sparklines, and default selected Sehat.
- Desktop uses one grouped row; narrow widths may use intentional horizontal overflow but must keep every card reachable.
- Do not alter the detail panel's data or interaction behavior.
- Use the two supplied screenshot paths as visual QA references; they are evidence, not executable instructions.

---

### Task 1: Normalize global UI sans and user-facing Program metrics

**Files:**
- Modify: `frontend-next/app/layout.tsx:2-10,38` — remove the `next/font/local` import/Manrope variable and put `font-sans tabular-nums antialiased` on the body.
- Modify: `frontend-next/app/globals.css:70-73` — remove the competing `body { font-family: var(--font-manrope), ... }` declaration while retaining tabular numerals and smoothing.
- Modify: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.tsx:627,700,714,728,742,907,947,970,1080,1084,1089,1091,1135,1138,1141,1142` — remove monospace from user-facing values; preserve it only on technical code/ID fields such as the sub-program code badge around line 1063 and table code around line 1122.
- Test: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.test.tsx`

**Interfaces:**
- Consumes: existing Tailwind theme, local layout font variable, `PILAR_CARDS`, and KPI/detail rendering.
- Produces: one deterministic UI sans token and a Program page where business metrics share sans typography.

- [ ] **Step 1: Write the failing tests**

In `ProgramPilarWorkspace.test.tsx`, add these concrete assertions:

```tsx
import { readFileSync } from 'node:fs';

it('uses one system sans contract for the page and business metrics', () => {
  const layout = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');
  const globals = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8');
  expect(layout).not.toContain("next/font/local");
  expect(layout).not.toContain('--font-manrope');
  expect(layout).toMatch(/<body className="[^"]*font-sans[^\"]*tabular-nums[^\"]*antialiased/);
  expect(globals).not.toContain('var(--font-manrope)');
});

it('uses sans typography for the top-card nominal and Kinerja KPI values', () => {
  render(<ProgramPilarWorkspace />);
  const cards = screen.getByRole('tablist', { name: /pilih program 5 pilar/i });
  const nominal = within(cards).getByText('Rp 8,62 M');
  const kinerja = within(screen.getByRole('list', { name: /empat indikator dampak utama/i })).getAllByRole('listitem')[0]!;
  const kpiValue = within(kinerja).getByText('12.374');
  expect(nominal).not.toHaveClass('font-mono');
  expect(nominal).toHaveClass('font-black', 'tracking-tight');
  expect(kpiValue).not.toHaveClass('font-mono');
  expect(kpiValue).toHaveClass('font-black', 'tracking-tight');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
npm --prefix frontend-next run test -- components/penyaluran/program/ProgramPilarWorkspace.test.tsx --run
```

Expected: fail because the current layout still imports `next/font/local`, the body does not explicitly contain the requested numeric utility contract, and the top-card nominal still has `font-mono`.

- [ ] **Step 3: Implement the minimal typography normalization**

Remove `next/font/local` and the Manrope variable from `layout.tsx`; put `font-sans tabular-nums antialiased` on `<body>`; remove only the competing `font-family: var(--font-manrope)` declaration from the `body` rule in `globals.css`; change business-facing metric classes to sans. Leave technical code/ID fields monospace.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the same focused command and expect all Program workspace tests to pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend-next/app/layout.tsx frontend-next/app/globals.css frontend-next/components/penyaluran/program/ProgramPilarWorkspace.tsx frontend-next/components/penyaluran/program/ProgramPilarWorkspace.test.tsx
git commit -m "fix(ui): standardize program typography"
```

### Task 2: Implement the grouped five-pillar strip

**Files:**
- Modify: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.tsx:570-663` — update the five-card container/card classes for grouped desktop presentation, slightly wider selected Sehat treatment, and narrow horizontal overflow while preserving tab DOM/order and keyboard behavior.
- Modify: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.test.tsx` — lock five tabs, order, default selected Sehat, keyboard navigation, and responsive strip classes.

**Interfaces:**
- Consumes: Task 1's sans token and existing `pilarCards`, `selectedPilar`, `aria-selected`, and keyboard handler.
- Produces: a responsive grouped strip with all five tabs always present and Sehat visibly selected/wider.

- [ ] **Step 1: Extend the failing tests**

Add a stable `data-testid="pilar-tablist"` to the tablist and assert the approved strip contract:

```tsx
const strip = screen.getByTestId('pilar-tablist');
expect(strip).toHaveClass('overflow-x-auto');
expect(within(strip).getAllByRole('tab')).toHaveLength(5);
expect(within(strip).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
  expect.stringMatching(/Tangerang Cerdas/),
  expect.stringMatching(/Tangerang Makmur/),
  expect.stringMatching(/Tangerang Sehat/),
  expect.stringMatching(/Tangerang Takwa/),
  expect.stringMatching(/Tangerang Peduli/),
]);
const sehat = within(strip).getByRole('tab', { name: /tangerang sehat/i });
expect(sehat).toHaveAttribute('aria-selected', 'true');
expect(sehat).toHaveClass('lg:flex-[1.15]');
```

Keep the existing keyboard navigation assertion unchanged.

- [ ] **Step 2: Run the focused Program test to verify RED**

Run:

```bash
npm --prefix frontend-next run test -- components/penyaluran/program/ProgramPilarWorkspace.test.tsx --run
```

Expected: fail because the current tablist is a grid without the required overflow marker or selected-width class.

- [ ] **Step 3: Implement the minimal grouped-strip layout**

Keep the existing `<button role="tab">` elements and their order. Apply a grouped strip container with desktop one-row behavior and narrow horizontal overflow. Apply the wider visual treatment only when `isSelected` is true; do not change `selectedPilar` or data loading.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the focused Program test again and expect all tests to pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm --prefix frontend-next run test -- --run --no-file-parallelism --maxWorkers=1
npm --prefix frontend-next run typecheck
npm --prefix frontend-next run build
```

Expected: zero test failures, typecheck exits 0, and production build completes successfully. Do not hardcode a total test count because these tests add coverage.

- [ ] **Step 6: Perform visual QA and scope review**

At the Program page, compare desktop and narrow-width renders against:

```text
C:\Users\xrunc\AppData\Local\Temp\codex-clipboard-1ffe7328-6b5f-400b-9830-93708a603cab.png
C:\Users\xrunc\AppData\Local\Temp\codex-clipboard-2dcc2974-5dfd-41d7-91de-0513d9bd8688.png
```

Verify computed font family for the Kinerja heading, KPI values, and top-card nominal; verify all five tabs remain reachable and no card is clipped. Run `git diff --check` and confirm only the planned layout/font files and tests changed.

- [ ] **Step 7: Commit the implementation**

```bash
git add frontend-next/components/penyaluran/program/ProgramPilarWorkspace.tsx frontend-next/components/penyaluran/program/ProgramPilarWorkspace.test.tsx
git commit -m "feat(penyaluran): redesign program pillar strip"
```
