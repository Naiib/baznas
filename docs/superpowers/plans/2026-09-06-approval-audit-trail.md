# Approval & Audit Trail Keputusan Penyaluran Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyediakan keputusan penyaluran berbasis peran dengan jejak audit append-only dan tampilan audit admin.

**Architecture:** Keputusan tetap memakai endpoint keputusan Mustahik, namun server mengambil aktor dari JWT dan menulis perubahan status, `approval_decisions`, dan `activity_logs` dalam satu transaksi database. Next.js menampilkan timeline keputusan pada detail Mustahik dan halaman audit lintas Mustahik yang hanya dapat dibuka admin.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Express, SQLite/PostgreSQL adapter, Vitest.

## Global Constraints

- Audit keputusan bersifat append-only: tidak ada endpoint edit atau hapus.
- Catatan wajib pada setiap keputusan; nominal positif wajib saat persetujuan MPZIS.
- Aktor audit berasal dari JWT, bukan nilai browser.
- Perubahan status tidak boleh tersimpan jika penulisan audit gagal.
- Tidak menampilkan data rekening pada audit atau timeline.

---

### Task 1: Skema dan repository audit append-only

**Files:**
- Modify: `server/db.js`
- Modify: `server/schema.sql`
- Modify: `server/repository.js`
- Test: `server/repository.approval.test.js`

**Interfaces:**
- Produces: `submitMustahikDecision(id, data, actor)` dan `getApprovalDecisions(filters)`.
- Consumes: `getDb()`, `updateMustahik()`, dan tabel `activity_logs` yang sudah ada.

- [ ] **Step 1: Write the failing repository test**

```js
it('stores the status transition and append-only approval record together', async () => {
  const result = await submitMustahikDecision(12, { action: 'approve', notes: 'Berkas valid.' }, { id: 9, name: 'Amil Test', role: 'penyaluran' });
  expect(result.new_status).toBe('Survey');
  expect((await getApprovalDecisions({ mustahik_id: 12 })).data[0]).toMatchObject({ actor_name: 'Amil Test', previous_status: 'Verifikasi Administrasi', next_status: 'Survey' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/repository.approval.test.js`

Expected: FAIL because `getApprovalDecisions` or structured approval storage does not exist.

- [ ] **Step 3: Implement schema and minimal repository support**

```js
await db.exec(`CREATE TABLE IF NOT EXISTS approval_decisions (... UNIQUE append-only identifiers ...)`);
await db.run('INSERT INTO approval_decisions (...) VALUES (...)', values);
```

Wrap Mustahik update, approval insert, and activity log insert in the adapter transaction helper; roll back on any write failure.

- [ ] **Step 4: Run repository test to verify it passes**

Run: `node --test server/repository.approval.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/schema.sql server/repository.js server/repository.approval.test.js
git commit -m "feat(audit): persist approval decisions"
```

### Task 2: Authorization and audit API

**Files:**
- Modify: `server/index.js`
- Modify: `server/repository.js`
- Test: `server/index.approval.test.js`

**Interfaces:**
- Consumes: `submitMustahikDecision(id, data, actor)` and `getApprovalDecisions(filters)`.
- Produces: `GET /api/mustahik/:id/approvals` and `GET /api/penyaluran/audit-decisions`.

- [ ] **Step 1: Write failing API tests**

```js
it('uses the JWT actor and rejects a survey decision from a penyaluran user', async () => {
  const response = await request(app).post('/api/mustahik/12/decision').set(authFor('penyaluran')).send({ action: 'approve', notes: 'Valid', target_status: 'Persetujuan MPZIS' });
  expect(response.status).toBe(403);
});

it('allows only admin to list cross-mustahik audit decisions', async () => {
  expect((await request(app).get('/api/penyaluran/audit-decisions').set(authFor('penyaluran'))).status).toBe(403);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/index.approval.test.js`

Expected: FAIL because role/stage authorization and endpoints do not exist.

- [ ] **Step 3: Implement authorization and routes**

Create a stage/action policy helper. Pass `req.user` to the repository; reject malformed or unauthorized decisions with `422`/`403`. Add authenticated history route and admin-only audit route with date, actor, action, and stage query filters.

- [ ] **Step 4: Run API tests to verify they pass**

Run: `node --test server/index.approval.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/repository.js server/index.approval.test.js
git commit -m "feat(audit): enforce approval policy and API"
```

### Task 3: Client contracts and decision timeline

**Files:**
- Modify: `frontend-next/lib/api/types.ts`
- Modify: `frontend-next/lib/api/client.ts`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Test: `frontend-next/lib/api/client.test.ts`
- Test: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: audit API endpoints.
- Produces: `ApprovalDecision` types, `api.getApprovalDecisions`, and timeline UI in the existing Riwayat tab.

- [ ] **Step 1: Write failing client/UI tests**

```tsx
it('loads and displays the actor, status transition, and note in decision history', async () => {
  render(<MustahikWorkspace />);
  await user.click(screen.getByRole('tab', { name: /riwayat/i }));
  expect(await screen.findByText('Amil Penyaluran')).toBeInTheDocument();
  expect(screen.getByText(/Verifikasi Administrasi.*Survey/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/api/client.test.ts components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

Expected: FAIL because the approval history client/UI does not exist.

- [ ] **Step 3: Implement client and focused UI**

Add types and client method. Replace the generic decision part of Riwayat with readable cards that show timestamp, actor, role, action, previous/next status, nominal only when present, and note. Preserve existing activity timeline beneath it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/api/client.test.ts components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-next/lib/api/types.ts frontend-next/lib/api/client.ts frontend-next/lib/api/client.test.ts frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx
git commit -m "feat(audit): show approval history on mustahik"
```

### Task 4: Audit admin workspace

**Files:**
- Create: `frontend-next/app/(penyaluran)/penyaluran/audit/page.tsx`
- Create: `frontend-next/components/penyaluran/audit/ApprovalAuditWorkspace.tsx`
- Create: `frontend-next/components/penyaluran/audit/ApprovalAuditWorkspace.test.tsx`
- Modify: `frontend-next/components/penyaluran/penyaluran-nav.ts`

**Interfaces:**
- Consumes: `api.getApprovalDecisions(filters)` and current auth user.
- Produces: admin-only audit workspace at `/penyaluran/audit`.

- [ ] **Step 1: Write a failing workspace test**

```tsx
it('filters audit decisions by action and renders a compact decision row', async () => {
  render(<ApprovalAuditWorkspace />);
  await user.selectOptions(screen.getByLabelText(/aksi/i), 'reject');
  expect(await screen.findByText('Pengajuan ditolak')).toBeInTheDocument();
  expect(screen.getByText('Siti Maryam')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/penyaluran/audit/ApprovalAuditWorkspace.test.tsx`

Expected: FAIL because the page and workspace do not exist.

- [ ] **Step 3: Implement the workspace**

Add filters, responsive audit table/cards, empty and error states. Non-admins receive a clear access-limited state; the navigation item is shown only to admin users where supported by the existing nav context.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/penyaluran/audit/ApprovalAuditWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-next/app/(penyaluran)/penyaluran/audit/page.tsx frontend-next/components/penyaluran/audit frontend-next/components/penyaluran/penyaluran-nav.ts
git commit -m "feat(audit): add admin decision audit workspace"
```

### Task 5: Full verification and release

**Files:**
- Modify only generated files if tooling requires; do not commit `next-env.d.ts` or `tsconfig.tsbuildinfo`.

- [ ] **Step 1: Run backend checks**

Run: `node --check server/db.js && node --check server/repository.js && node --check server/index.js`

Expected: exit 0.

- [ ] **Step 2: Run focused frontend tests**

Run: `npm test -- lib/api/client.test.ts components/penyaluran/mustahik/MustahikWorkspace.test.tsx components/penyaluran/audit/ApprovalAuditWorkspace.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 3: Build the production frontend**

Run: `npm run build`

Expected: exit 0 and audit route listed.

- [ ] **Step 4: Merge, push, and deploy**

Merge the verified branch into `main`, push `origin main`, SSH to VPS, pull `main`, rebuild frontend, restart backend/frontend PM2 services, and verify both the public page and authenticated audit route return successful HTTP responses.
