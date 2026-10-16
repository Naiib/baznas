# Data Mustahik Focused Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat workspace Data Mustahik lebih lapang, mudah dipindai, dan stabil di desktop, tablet, serta ponsel.

**Architecture:** Pertahankan pola master-detail dan data demo/API. Ubah shell desktop menjadi dua kolom adaptif, pindahkan detail keputusan ke drawer yang dipanggil dari ringkasan singkat, dan rapikan summary menjadi blok informasi berurutan. Perbaiki lifecycle peta Leaflet agar tidak memanggil `flyTo` sebelum ukuran peta valid.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, React Leaflet, Vitest, Testing Library.

## Global Constraints

- Tidak mengubah kontrak API Mustahik atau route `/penyaluran/mustahik`.
- Tetap gunakan light theme, Manrope, token hijau BAZNAS, dan komponen Lucide yang sudah ada.
- Tidak ada panel keputusan permanen pada desktop; tindakan dibuka melalui drawer terfokus.
- Tidak ada overflow horizontal pada 390 px, 768 px, 1024 px, dan 1440 px.
- Peta tidak boleh memicu runtime error pada viewport apa pun.

---

### Task 1: Definisikan regresi layout dan peta

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikLocationMap.tsx`

**Interfaces:**
- Consumes: `MustahikWorkspace`, `MustahikLocationMap`.
- Produces: tes yang membuktikan drawer keputusan dapat dibuka dan peta menerima koordinat valid.

- [ ] **Step 1: Write failing tests**

```tsx
expect(screen.queryByText('Panel keputusan')).not.toBeInTheDocument();
fireEvent.click(screen.getByRole('button', { name: 'Buka panel keputusan' }));
expect(screen.getByRole('dialog', { name: 'Keputusan Mustahik' })).toBeInTheDocument();
expect(resolveMustahikCenter('Kecamatan Tidak Ada')).toEqual(TANGERANG_CENTER);
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- MustahikWorkspace.test.tsx`

### Task 2: Reflow desktop dan tablet menjadi focused review

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Test: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: `Queue`, `Profile`, `Decision`, state `decisionOpen`.
- Produces: shell dua kolom; drawer keputusan untuk seluruh breakpoint.

- [ ] **Step 1: Replace the three-column shell**

Ganti grid menjadi `md:grid-cols-[280px_minmax(0,1fr)]` tanpa kolom `xl` ketiga.

- [ ] **Step 2: Add a compact decision brief**

Tampilkan status `Layak`, skor, dokumen tertunda, dan tombol `Buka panel keputusan` di header detail; textarea dan CTA final hanya tampil di drawer.

- [ ] **Step 3: Run focused unit tests**

Run: `npm test -- MustahikWorkspace.test.tsx`

### Task 3: Rapikan hierarchy profil dan kartu ringkasan

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Test: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: `Summary`, data `MustahikView`.
- Produces: ringkasan dengan urutan identitas → kelayakan/bantuan → alamat/peta → proses.

- [ ] **Step 1: Write failing decision-summary test**

```tsx
expect(screen.getByText('Keputusan siap ditinjau')).toBeInTheDocument();
```

- [ ] **Step 2: Simplify definition-list layout**

Gunakan satu kolom label-nilai sampai ruang detail mencukupi. Nilai panjang membungkus alami; tidak ada tinggi tetap atau kolom yang memaksa angka terpecah.

- [ ] **Step 3: Make address and process full width**

Letakkan alamat/peta dan timeline proses pada baris penuh. Timeline turun aman pada layar kecil tanpa label saling bertabrakan.

- [ ] **Step 4: Run focused unit tests**

Run: `npm test -- MustahikWorkspace.test.tsx`

### Task 4: Stabilkan peta dan pengalaman ponsel

**Files:**
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikLocationMap.tsx`
- Modify: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.tsx`
- Test: `frontend-next/components/penyaluran/mustahik/MustahikWorkspace.test.tsx`

**Interfaces:**
- Consumes: `SUBDISTRICT_COORDINATES`, `MapViewport`, `mobileView`.
- Produces: peta yang tidak crash dan alur mobile antrean → detail → drawer keputusan.

- [ ] **Step 1: Extract and validate location resolution**

Ekstrak `resolveMustahikCenter`. `MapViewport` hanya memanggil `flyTo` setelah `map.whenReady` dan `map.getSize()` menghasilkan lebar/tinggi positif.

- [ ] **Step 2: Add safe map fallback**

Tampilkan label kecamatan bila peta belum siap tanpa memblokir halaman atau memunculkan error overlay.

- [ ] **Step 3: Verify mobile flow**

Uji memilih antrean, kembali ke daftar, membuka drawer keputusan, serta menutupnya pada viewport 390 × 844.

- [ ] **Step 4: Run focused unit tests**

Run: `npm test -- MustahikWorkspace.test.tsx`

### Task 5: Validate and hand off

**Files:**
- Modify: `docs/audits/mustahik-2026-08-26/README.md`

- [ ] **Step 1: Run full checks**

Run: `npm test`; `npm run typecheck`; `npm run build`.

- [ ] **Step 2: Audit browser viewports**

Periksa 390 × 844, 768 × 900, 1024 × 900, dan 1440 × 900. Pastikan tidak ada error console, overflow horizontal, teks terpotong, atau kartu dengan tinggi dipaksakan.

- [ ] **Step 3: Update audit evidence and commit**

Commit target: `fix(mustahik): reflow focused review workspace`.

## Review Plan

- Cakupan mencakup reflow desktop, tablet, mobile, decision drawer, hierarchy kartu, dan runtime error peta.
- Tidak ada placeholder atau tugas tanpa file/hasil yang jelas.
- Eksekusi dimulai hanya setelah approval pengguna.
