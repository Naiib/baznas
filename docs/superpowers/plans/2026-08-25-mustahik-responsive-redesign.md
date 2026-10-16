# Data Mustahik Responsive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun ulang workspace Data Mustahik menjadi master-detail adaptif yang ringkas, modern, aksesibel, dan mudah digunakan pada desktop, tablet, serta mobile.

**Architecture:** `MustahikWorkspace` tetap menjadi pemilik state data, filter, profil terpilih, tab, dan drawer. Presentasi dipecah menjadi komponen lokal terfokus untuk stage rail, queue, profile, dan decision panel agar setiap breakpoint dapat disusun tanpa menggandakan state.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Lucide React, React Leaflet, Vitest, Testing Library.

## Global Constraints

- Pertahankan data API dengan fallback demo yang sudah ada.
- Tidak menambah dependency baru.
- Gunakan Bahasa Indonesia dan sistem visual putih–emerald yang sudah disetujui.
- Konten utama minimal 12px dan target interaksi minimal 40px.
- Hormati `prefers-reduced-motion`.

---

### Task 1: Interaction Contract

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: `MustahikWorkspace`
- Produces: kontrak tab profil, navigasi detail mobile, dan drawer keputusan.

- [ ] **Step 1: Write failing interaction tests**

```tsx
fireEvent.click(screen.getByRole('tab', { name: 'Dokumen' }));
expect(screen.getByRole('region', { name: 'Dokumen Mustahik' })).toBeInTheDocument();

fireEvent.click(screen.getByRole('button', { name: 'Buka panel keputusan' }));
expect(screen.getByRole('dialog', { name: 'Keputusan Mustahik' })).toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: 'Tutup panel keputusan' }));
expect(screen.queryByRole('dialog', { name: 'Keputusan Mustahik' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

Expected: FAIL karena tab dan drawer belum tersedia.

### Task 2: Adaptive Workspace

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Modify: `frontend-next/app/globals.css`

**Interfaces:**
- Consumes: `MustahikView[]`, stage filter, selected Mustahik, `MustahikLocationMap`.
- Produces: stage rail horizontal, queue adaptif, tab profile, decision drawer, sticky mobile actions.

- [ ] **Step 1: Build semantic subcomponents**

Create local components `StageRail`, `MustahikQueue`, `ProfileWorkspace`, and `DecisionContent` receiving typed props and callbacks from `MustahikWorkspace`.

- [ ] **Step 2: Implement profile tabs**

Use state:

```tsx
type ProfileTab = 'summary' | 'documents' | 'history';
const [profileTab, setProfileTab] = useState<ProfileTab>('summary');
```

Render a `role="tablist"` with three buttons and one labelled region per active tab.

- [ ] **Step 3: Implement adaptive layout**

Use `md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(560px,1fr)_340px]`. Keep desktop decision content in the third column. Hide it below `xl` and expose an action button that opens the drawer.

- [ ] **Step 4: Implement mobile flow**

Use `mobileView: 'queue' | 'profile'`. Queue rows set the selected profile and switch to profile. A visible mobile back button restores queue. Keep both surfaces available at `md` and above through responsive classes.

- [ ] **Step 5: Implement decision drawer**

Render the drawer only when open:

```tsx
<section role="dialog" aria-modal="true" aria-label="Keputusan Mustahik">
  <DecisionContent />
</section>
```

Use right-side drawer from `md` and bottom sheet below `md`, with overlay and explicit close control.

- [ ] **Step 6: Add restrained motion**

Add CSS keyframes for profile/tab entrance and drawer movement, then disable them in the existing reduced-motion media query.

- [ ] **Step 7: Verify GREEN**

Run: `npm test -- --run components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

Expected: all Mustahik tests pass.

### Task 3: Quality Gate

**Files:**
- Verify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Verify: `frontend-next/app/globals.css`

**Interfaces:**
- Consumes: complete implementation.
- Produces: build-ready responsive page.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: compiled successfully.

- [ ] **Step 3: Visual breakpoint verification**

Inspect `/penyaluran/mustahik` at 1440×1024, 1024×768, and 390×844. Confirm stage rail remains compact, profile is reachable without traversing the entire queue, and decision actions stay discoverable.
