# Penyaluran Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform every authenticated Penyaluran screen into one cohesive, white-first operational workspace while preserving all existing frontend behavior and backend contracts.

**Architecture:** Introduce a Penyaluran-only application shell that replaces the current generic global navigation for users in the `penyaluran` role. Build shared navigation, page framing, status, motion, and workflow primitives, then migrate Beranda, Mustahik, Program 5 Pilar, Peta, and Laporan incrementally without changing API calls, payloads, routes, or role access.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, Radix UI, Lucide React, Recharts.

## Global Constraints

- Frontend only: do not modify `server/`, API URLs, database schema, authentication, roles, or backend response shapes.
- Main content background is `#FFFFFF`; BAZNAS emerald `#008B5A` is the primary action color.
- Penyaluran uses a top navbar; desktop must not render a persistent sidebar.
- Reuse `baznas-logo.png` and Lucide icons; do not add generated logos or decorative image assets.
- Motion provides feedback only and must honor `prefers-reduced-motion`.
- Maintain keyboard access, visible focus, semantic labels, 44px mobile targets, and non-color status labels.
- Preserve the existing page keys: `penyaluran`, `mustahik`, `program_bantuan`, `peta_sebaran`, and `laporan_penyaluran`.

---

## File Structure

- `src/components/penyaluran/PenyaluranShell.jsx` — role-scoped white page shell and contextual subnavigation.
- `src/components/penyaluran/PenyaluranTopNav.jsx` — responsive global top navigation, search trigger, live indicator, and user menu.
- `src/components/penyaluran/PenyaluranPageHeader.jsx` — consistent title, description, date, page actions, and context tabs.
- `src/components/penyaluran/WorkflowRail.jsx` — accessible six-stage process state shared by Beranda and Mustahik detail.
- `src/components/penyaluran/StatusBadge.jsx` — text-first, color-supported status and priority tokens.
- `src/components/penyaluran/ActivityFeed.jsx` — compact timestamped activity list.
- `src/components/penyaluran/penyaluran-ui.js` — navigation definitions, status mappings, and animation-safe class helpers.
- `src/hooks/usePrefersReducedMotion.js` — reactive media-query hook for optional motion.
- `src/App.jsx` — choose the Penyaluran shell only for Penyaluran routes/users; retain generic shell for other divisions.
- `src/index.css` — light tokens and minimal purpose-built motion utilities; remove conflicting glass/gradient/side-bar-only styling from Penyaluran surfaces.
- `src/components/PenyaluranDashboard.jsx` — replace chart-first dashboard with action-first `Denyut Penyaluran`, action queue, activity, and coverage.
- `src/components/MustahikPage.jsx` — retain CRUD/state/API logic but replace card-heavy layout with case-management list and contextual detail panel.
- `src/components/ProgramBantuanPage.jsx` — convert pillar card grid to portfolio rows and actionable matching detail.
- `src/components/PetaSebaranPage.jsx` — restyle controls/list/map insights with the shared framing.
- `src/components/LaporanPenyaluranPage.jsx` — restyle filters, summary, export feedback, and results table with the shared framing.
- `src/components/penyaluran/*.test.jsx` — interaction tests for shared navigation, workflow, status text, and reduced-motion behavior after Vitest setup.

### Task 1: Establish Penyaluran design foundations and verification harness

**Files:**
- Modify: `package.json`
- Modify: `src/index.css`
- Create: `src/hooks/usePrefersReducedMotion.js`
- Create: `src/components/penyaluran/penyaluran-ui.js`
- Create: `src/components/penyaluran/StatusBadge.jsx`
- Create: `src/components/penyaluran/StatusBadge.test.jsx`

**Interfaces:**
- Produces `PENYALURAN_NAV_ITEMS`, `getStatusMeta(status)`, and `<StatusBadge status priority />`.
- `usePrefersReducedMotion()` returns `boolean` and controls all optional animation classes.

- [ ] **Step 1: Add the test runner and test scripts**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as development dependencies; add `vite.config.js` test environment setup rather than creating a second build config.

- [ ] **Step 2: Write failing tests for the status primitive**

```jsx
it('keeps the status readable without its color', () => {
  render(<StatusBadge status="Verifikasi Administrasi" priority="Tinggi" />);
  expect(screen.getByText('Verifikasi Administrasi')).toBeInTheDocument();
  expect(screen.getByText('Prioritas tinggi')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `npm test -- StatusBadge.test.jsx`

Expected: failure because `StatusBadge` does not exist.

- [ ] **Step 4: Implement tokens, hook, and status primitive**

```jsx
export function StatusBadge({ status, priority }) {
  const meta = getStatusMeta(status);
  return <span className={meta.className}>{meta.label}{priority && ` · Prioritas ${priority.toLowerCase()}`}</span>;
}
```

Use white `--background`, emerald focus rings, thin neutral borders, and media-query guarded motion. Do not apply the new tokens globally to Penerimaan or other division surfaces.

- [ ] **Step 5: Run test, lint, and production build**

Run: `npm test -- StatusBadge.test.jsx; npm run lint; npm run build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit the foundation**

```bash
git add package.json package-lock.json vite.config.js src/index.css src/hooks/usePrefersReducedMotion.js src/components/penyaluran
git commit -m "feat: add penyaluran design foundations"
```

### Task 2: Build the responsive top navigation and Penyaluran shell

**Files:**
- Create: `src/components/penyaluran/PenyaluranTopNav.jsx`
- Create: `src/components/penyaluran/PenyaluranShell.jsx`
- Create: `src/components/penyaluran/PenyaluranPageHeader.jsx`
- Create: `src/components/penyaluran/PenyaluranTopNav.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- `<PenyaluranShell activePage currentUser onNavigate onLogout>{children}</PenyaluranShell>` wraps exactly the five Penyaluran routes.
- `PenyaluranTopNav` calls `onNavigate(page)` for `penyaluran`, `mustahik`, `program_bantuan`, `peta_sebaran`, and `laporan_penyaluran`.

- [ ] **Step 1: Write failing navigation tests**

```jsx
it('navigates to Data Mustahik and marks it current', async () => {
  const onNavigate = vi.fn();
  render(<PenyaluranTopNav activePage="penyaluran" onNavigate={onNavigate} currentUser={user} />);
  await userEvent.click(screen.getByRole('button', { name: 'Data Mustahik' }));
  expect(onNavigate).toHaveBeenCalledWith('mustahik');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- PenyaluranTopNav.test.jsx`

Expected: failure because the component is absent.

- [ ] **Step 3: Implement the shell**

Create desktop top navigation with logo at left, centered links, live status/search/notification/profile at right, and an emerald animated active underline. Below 768px, collapse links into an accessible menu button while retaining the current-page name and primary action reachability. Update `App.jsx` so only authenticated Penyaluran users on Penyaluran pages use this shell; other roles keep `<Navbar />` and existing layout untouched.

- [ ] **Step 4: Verify navigation and responsive semantics**

Run: `npm test -- PenyaluranTopNav.test.jsx; npm run lint; npm run build`

Then inspect desktop and 390px viewport: no persistent sidebar, all five links remain reachable, and focus is visible.

- [ ] **Step 5: Commit the shell**

```bash
git add src/App.jsx src/components/penyaluran
git commit -m "feat: add penyaluran top navigation shell"
```

### Task 3: Rebuild Beranda as the action-first Ruang Penyaluran

**Files:**
- Create: `src/components/penyaluran/WorkflowRail.jsx`
- Create: `src/components/penyaluran/ActivityFeed.jsx`
- Create: `src/components/penyaluran/WorkflowRail.test.jsx`
- Modify: `src/components/PenyaluranDashboard.jsx`

**Interfaces:**
- `<WorkflowRail steps activeStep onSelectStep />` renders labeled stages 1–6, with textual state and an optional click handler.
- `<ActivityFeed items />` renders timestamp, action, entity, and context.

- [ ] **Step 1: Write failing workflow accessibility test**

```jsx
it('exposes the active stage in text and respects reduced motion', () => {
  render(<WorkflowRail steps={steps} activeStep="Verifikasi Syarat" />);
  expect(screen.getByText('Verifikasi Syarat')).toHaveAttribute('aria-current', 'step');
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm test -- WorkflowRail.test.jsx`

Expected: failure because `WorkflowRail` does not exist.

- [ ] **Step 3: Implement the dashboard transformation**

Replace five equal KPI boxes and chart-dominant layout with: concise page header; a five-pillar Denyut Penyaluran band; three compact finance/beneficiary summaries; `Tindakan selanjutnya` as the primary interactive ledger; shared workflow rail; activity feed; and kecamatan coverage. Preserve period selection, transaction add sheet, search/filter, and relevant current data. Make the first action reachable before chart/data visualization.

- [ ] **Step 4: Verify behavior and visual state**

Run: `npm test -- WorkflowRail.test.jsx; npm run lint; npm run build`

Manually confirm period controls, “Catat Realisasi”, search, filter, and responsive table still work.

- [ ] **Step 5: Commit the dashboard**

```bash
git add src/components/PenyaluranDashboard.jsx src/components/penyaluran
git commit -m "feat: redesign penyaluran workspace dashboard"
```

### Task 4: Rebuild Data Mustahik as a case-management workspace

**Files:**
- Modify: `src/components/MustahikPage.jsx`
- Create: `src/components/penyaluran/MustahikQueue.test.jsx`

**Interfaces:**
- Existing CRUD callbacks (`loadData`, `openDetail`, `handleOpenAdd`, `handleOpenEdit`, stage actions) stay unchanged.
- The visual list uses `StatusBadge` and `WorkflowRail` metadata but must pass original Mustahik records to existing callbacks.

- [ ] **Step 1: Write a failing behavior-preservation test**

```jsx
it('keeps a filtered case actionable from the redesigned queue', async () => {
  render(<MustahikPage onNavigate={vi.fn()} />);
  await userEvent.type(screen.getByRole('searchbox', { name: /cari mustahik/i }), 'Siti');
  expect(await screen.findByRole('button', { name: /buka profil/i })).toBeEnabled();
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm test -- MustahikQueue.test.jsx`

Expected: failure because the searchable accessible queue contract is not yet implemented.

- [ ] **Step 3: Implement the visual refactor without changing workflow logic**

Make search and stage filters one continuous control area. Replace visual card grid and dense mixed-action rows with one clear table/list: person and case, program/asnaf, locality, stage/progress, amount, and next action. Use active row selection and the existing detail sheet as the contextual profile panel. Restyle modal/sheet interiors with white canvas, light dividers, readable label hierarchy, and retained forms/actions. Keep all existing API calls, dialogs, document actions, notification action, and confirmation behavior.

- [ ] **Step 4: Verify CRUD and stage actions**

Run: `npm test -- MustahikQueue.test.jsx; npm run lint; npm run build`

Manually test search, each pipeline filter, add/edit, detail, survey, MPZIS, PPD, document access, WhatsApp preview, and delete confirmation against the existing API.

- [ ] **Step 5: Commit the Mustahik workspace**

```bash
git add src/components/MustahikPage.jsx src/components/penyaluran/MustahikQueue.test.jsx
git commit -m "feat: redesign mustahik case workspace"
```

### Task 5: Apply the shared portfolio and data language to Program, Map, and Report

**Files:**
- Modify: `src/components/ProgramBantuanPage.jsx`
- Modify: `src/components/PetaSebaranPage.jsx`
- Modify: `src/components/LaporanPenyaluranPage.jsx`
- Create: `src/components/penyaluran/PenyaluranPages.test.jsx`

**Interfaces:**
- Existing `onNavigate` props and stateful filter/export handlers remain unchanged.
- All pages consume `PenyaluranPageHeader`, `StatusBadge`, and shared white-surface utility classes.

- [ ] **Step 1: Write failing cross-page navigation/action tests**

```jsx
it('keeps Program and report actions available in the shared page language', () => {
  render(<ProgramBantuanPage onNavigate={vi.fn()} />);
  expect(screen.getByRole('button', { name: /buka data mustahik/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm test -- PenyaluranPages.test.jsx`

Expected: failure before the shared accessible headings/actions are wired.

- [ ] **Step 3: Implement the three page transformations**

For Program, replace high-density pillar cards with aligned portfolio rows plus selected-program matching details. For Peta, create a white geographic workspace with concise overview, focused filters, selected kecamatan context, and a direct Mustahik action. For Laporan, create a compact date/filter toolbar, textual export feedback, and a single readable results ledger. Retain all existing data calculations, filters, exports, and navigation.

- [ ] **Step 4: Verify the pages and responsive behavior**

Run: `npm test -- PenyaluranPages.test.jsx; npm run lint; npm run build`

Inspect each route at 1440px and 390px: header/navigation remains usable, controls have labels, no clipped content, table overflow is intentional and reachable, and optional motion is disabled for reduced-motion preference.

- [ ] **Step 5: Commit the cross-page redesign**

```bash
git add src/components/ProgramBantuanPage.jsx src/components/PetaSebaranPage.jsx src/components/LaporanPenyaluranPage.jsx src/components/penyaluran
git commit -m "feat: unify penyaluran page experience"
```

### Task 6: Run visual QA and clean delivery artifacts

**Files:**
- Modify: `.gitignore`
- Create: `docs/superpowers/verification/2026-08-24-penyaluran-redesign.md`

**Interfaces:**
- No production interface changes.

- [ ] **Step 1: Add local audit/brainstorm artifact patterns to `.gitignore`**

```gitignore
.audit-penyaluran-*.png
.superpowers/brainstorm/
```

- [ ] **Step 2: Verify full quality gate**

Run: `npm test; npm run lint; npm run build`

Expected: all commands exit 0. Capture and inspect the authenticated Penyaluran desktop and mobile routes in the browser, comparing each with the approved top-navigation visual direction.

- [ ] **Step 3: Record visual verification**

Document routes, viewport sizes, interaction states exercised, console errors checked, and any deliberate deviations in `docs/superpowers/verification/2026-08-24-penyaluran-redesign.md`.

- [ ] **Step 4: Commit the QA record**

```bash
git add .gitignore docs/superpowers/verification/2026-08-24-penyaluran-redesign.md
git commit -m "docs: verify penyaluran frontend redesign"
```

## Self-Review

- **Spec coverage:** Tasks 1–2 implement the shared white system and top navbar; Task 3 covers the operational dashboard and motion; Task 4 covers the full Mustahik workflow and detail; Task 5 covers Program, Peta, and Laporan; Task 6 verifies responsive, accessibility, motion, and frontend-only constraints.
- **Placeholder scan:** No TBD/TODO placeholders or unspecified actions remain.
- **Type consistency:** Navigation uses the existing page keys; components consume callbacks and record shapes already present in the codebase; no backend contract is introduced.
