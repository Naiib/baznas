# Public Application Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a live Next.js public application and tracking portal that writes to the existing Mustahik workflow.

**Architecture:** Keep the existing Express public API and database contract. Add typed API methods, isolated public components and public Next routes; reuse the Mustahik workspace as the sole amil queue. Follow-up work exposes the existing transaction, notification, and master-data capabilities without duplicating domain records.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8 strict mode, Tailwind CSS 4, Vitest, existing Express API.

## Global Constraints

- Public portal routes must not use `RequireAuth`.
- No applicant data may be hard-coded as a tracking fallback.
- Public submission uses existing `/api/public/pengajuan` and tracking uses existing `/api/public/lacak/:query`.
- Preserve current authenticated `/penyaluran` routes and their data source.
- Use Indonesian public-facing copy, 44px minimum interactive controls, and responsive one-column mobile layouts.

---

### Task 1: Typed public API contract

**Files:**
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/lib/api/client.test.ts`

**Interfaces:**
- Produces: `PublicApplicationPayload`, `PublicApplicationResult`, `PublicTrackingResult`, `api.submitPublicApplication(payload)`, and `api.trackPublicApplication(query)`.

- [ ] **Step 1: Write failing API client tests**

```ts
it('submits the public application as multipart form data', async () => {
  await api.submitPublicApplication(new FormData());
  expect(fetch).toHaveBeenCalledWith('/api/public/pengajuan', expect.objectContaining({ method: 'POST' }));
});

it('encodes a tracking query in the public URL', async () => {
  await api.trackPublicApplication('MST 2026/1');
  expect(fetch).toHaveBeenCalledWith('/api/public/lacak/MST%202026%2F1', expect.anything());
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- lib/api/client.test.ts`

- [ ] **Step 3: Add interfaces and API methods**

```ts
async submitPublicApplication(payload: FormData) {
  return apiFetch<PublicApplicationResult>('/api/public/pengajuan', { method: 'POST', body: payload });
},
async trackPublicApplication(query: string) {
  return apiFetch<PublicTrackingResult>(`/api/public/lacak/${encodeURIComponent(query)}`);
},
```

- [ ] **Step 4: Run focused test and typecheck**

Run: `npm test -- lib/api/client.test.ts && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend-next/lib/api
git commit -m "feat(portal): add public application API client"
```

### Task 2: Public form primitives and guided application

**Files:**
- Create: `frontend-next/components/public-portal/application-data.ts`
- Create: `frontend-next/components/public-portal/PublicApplicationForm.tsx`
- Create: `frontend-next/components/public-portal/PublicApplicationForm.test.tsx`
- Create: `frontend-next/app/pengajuan/page.tsx`

**Interfaces:**
- Consumes: Task 1 `api.submitPublicApplication`.
- Produces: `/pengajuan`, a five-step form, and a success state with file number.

- [ ] **Step 1: Write failing component tests**

```tsx
it('keeps the visitor on identity step when required fields are empty', async () => {
  render(<PublicApplicationForm />);
  await userEvent.click(screen.getByRole('button', { name: /lanjut/i }));
  expect(screen.getByText(/nama lengkap wajib/i)).toBeInTheDocument();
});

it('shows the generated registration number after submission', async () => {
  render(<PublicApplicationForm />);
  // complete valid inputs and submit
  expect(await screen.findByText('MST-202609-0001')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run: `npm test -- components/public-portal/PublicApplicationForm.test.tsx`

- [ ] **Step 3: Implement the form and route**

Use a constrained form state and `FormData`. Show steps: Data pemohon, Domisili & kondisi, Kebutuhan bantuan, Dokumen, Konfirmasi. Require KTP and KK, include file size prevalidation, inline messages, and a copyable registration number on success.

- [ ] **Step 4: Run focused test and typecheck**

Run: `npm test -- components/public-portal/PublicApplicationForm.test.tsx && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend-next/app/pengajuan frontend-next/components/public-portal
git commit -m "feat(portal): add guided public application form"
```

### Task 3: Safe public tracking

**Files:**
- Create: `frontend-next/components/public-portal/PublicApplicationTracking.tsx`
- Create: `frontend-next/components/public-portal/PublicApplicationTracking.test.tsx`
- Create: `frontend-next/app/cek-pengajuan/page.tsx`

**Interfaces:**
- Consumes: Task 1 `api.trackPublicApplication`.
- Produces: `/cek-pengajuan` with a six-stage timeline and safe applicant summary.

- [ ] **Step 1: Write failing tracking tests**

```tsx
it('renders a six-stage status timeline for a found application', async () => {
  render(<PublicApplicationTracking />);
  await userEvent.type(screen.getByLabelText(/nomor berkas/i), 'MST-202609-0001');
  await userEvent.click(screen.getByRole('button', { name: /lacak/i }));
  expect(await screen.findByText(/penyaluran selesai/i)).toBeInTheDocument();
});

it('renders the API not-found message without a fake record', async () => {
  // mock 404 result
  expect(await screen.findByText(/tidak ditemukan/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run: `npm test -- components/public-portal/PublicApplicationTracking.test.tsx`

- [ ] **Step 3: Implement tracking route**

Render public-safe identity (name partially masked, programme, district, date, status), six static process labels, active stage, and next-action guidance. Do not render internal notes, bank fields, or assessment scores.

- [ ] **Step 4: Run focused test and typecheck**

Run: `npm test -- components/public-portal/PublicApplicationTracking.test.tsx && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend-next/app/cek-pengajuan frontend-next/components/public-portal
git commit -m "feat(portal): add public application tracking"
```

### Task 4: Public landing and amil source context

**Files:**
- Modify: `frontend-next/app/page.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 and 3 public routes.
- Produces: public call-to-action cards that navigate to functional routes and a staff-visible public-origin marker.

- [ ] **Step 1: Write failing tests**

```tsx
it('links public landing actions to application and tracking routes', () => {
  render(<PublicPortalPage />);
  expect(screen.getByRole('link', { name: /ajukan bantuan/i })).toHaveAttribute('href', '/pengajuan');
});

it('labels an externally submitted applicant as Portal publik', () => {
  render(<MustahikWorkspace />);
  expect(screen.getByText(/portal publik/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `npm test -- app/page.test.tsx components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

- [ ] **Step 3: Implement landing links and marker**

The landing page gets clear buttons for `/pengajuan` and `/cek-pengajuan`. Add a source chip only when a record contains the existing public-submission note or application metadata.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- app/page.test.tsx components/penyaluran/mustahik/MustahikWorkspace.test.tsx && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add frontend-next/app/page.tsx frontend-next/components/penyaluran/mustahik
git commit -m "feat(portal): connect public entry to amil queue"
```

### Task 5: Complete verification and integration preparation

**Files:**
- Modify: generated build artifacts only if repository policy requires; otherwise leave untracked/generated files unstaged.

- [ ] **Step 1: Run the full frontend suite**

Run: `npm test`

- [ ] **Step 2: Run production checks**

Run: `npm run typecheck && npm run build`

- [ ] **Step 3: Review working tree**

Run: `git status --short && git diff --check`

- [ ] **Step 4: Commit non-generated changes**

```bash
git add frontend-next
git commit -m "feat(portal): connect public applicants to penyaluran workflow"
```

## Later implementation plans

1. **Transaction journal:** a dedicated task plan around `ppd` records, immutable proof and reconciliation status.
2. **Task & notification centre:** assignment, due date, dashboard activity feed, and existing WhatsApp log integration.
3. **Master data:** admin-only CRUD for programmes, asnaf, staff, document requirements, and payment methods.

