# Program Kinerja Terpadu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti pasangan panel tren/KPI yang menyisakan ruang kosong dengan satu panel kinerja terpadu yang padat, responsif, dan mudah dipahami.

**Architecture:** Halaman tetap memakai data `PILAR_CARDS`. Satu komponen workspace aktif menyusun chart, empat KPI utama, dan insight strip di dalam satu region dengan tinggi natural; breakpoint hanya mengubah jumlah kolom, bukan memaksa tinggi.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.8, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Tidak menambah dependency baru.
- Data tetap dummy dan berubah mengikuti pilar terpilih.
- Tidak boleh ada forced equal-height yang menghasilkan ruang kosong.
- Harus responsif pada 390px, 768px, dan desktop.

---

### Task 1: Kontrak UX panel terpadu

**Files:**
- Modify: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.test.tsx`

**Interfaces:**
- Consumes: `ProgramPilarWorkspace`.
- Produces: kontrak aksesibel untuk region `Kinerja Program Terpadu`.

- [x] **Step 1: Tulis test gagal**

Tambahkan test yang merender workspace, memilih Tangerang Makmur, lalu memastikan region terpadu menampilkan grafik, empat artikel KPI utama, dan insight strip proyeksi tanpa section `Dampak Utama` terpisah.

- [x] **Step 2: Verifikasi RED**

Run: `npm test -- ProgramPilarWorkspace.test.tsx --reporter=dot`

Expected: FAIL karena region `Kinerja Program Terpadu` belum ada.

### Task 2: Implementasi layout natural-height

**Files:**
- Modify: `frontend-next/components/penyaluran/program/ProgramPilarWorkspace.tsx`

**Interfaces:**
- Consumes: `PILAR_CARDS`, `selectedPilar`, dan metrik pilar aktif.
- Produces: region chart/KPI/insight strip terpadu.

- [x] **Step 1: Aktifkan workspace yang sesuai tampilan pengguna**

Jadikan implementasi yang memuat tren bulanan dan data pilar sebagai export `ProgramPilarWorkspace`.

- [x] **Step 2: Ganti split card dengan region terpadu**

Gunakan grid desktop `lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]`, empat KPI `2x2`, dan insight strip full-width. Hindari `items-stretch`, `flex-1`, dan `justify-between` pada wrapper tinggi.

- [x] **Step 3: Verifikasi GREEN**

Run: `npm test -- ProgramPilarWorkspace.test.tsx --reporter=dot`

Expected: PASS.

- [x] **Step 4: Verifikasi responsif dan produksi**

Run: `npm test -- --reporter=dot`, `npm run typecheck`, dan `npm run build`. Lakukan visual QA browser pada 390px, 768px, dan desktop serta pastikan `scrollWidth <= innerWidth`.
