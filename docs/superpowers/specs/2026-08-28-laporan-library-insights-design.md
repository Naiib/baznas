# Laporan Penyaluran — Report Library & Insights

## Goal

Redesign `/penyaluran/laporan` as a desktop-first report library that helps an Amil find, understand, and prepare Penyaluran reports before export generation is connected to a future backend.

## Selected direction

Use the approved third Product Design concept: a browse-first **Report Library & Insights** layout. The left side is a practical report library and the right side summarizes the active period. It follows the existing BAZNAS light visual language: white canvas, emerald actions, thin slate dividers, Plus Jakarta Sans, and readable tables.

## Scope

- Replace the single export card with a complete reporting workspace.
- Provide active month, archive search, category selection, report rows, period KPIs, program bars, asnaf composition, and readiness items.
- Use local typed dummy data. PDF/Excel buttons show frontend-ready feedback only: no files, backend API, or new dependencies.
- Keep desktop as the primary composition; tablet and mobile collapse to a readable single column.

## Content architecture

1. Header: title, month selector, archive search, and `Buat laporan`.
2. Four-value insight strip: total disbursed, beneficiaries, active programs, and covered kecamatan.
3. Library: five categories, one expanded category at a time, with report title, date, scope, status, and PDF/Excel affordances.
4. Insight panel: program allocation bars, asnaf distribution, and a four-item readiness checklist.
5. Accessible feedback for category, export, and create-report interactions.

## Data and validation

`laporan-data.ts` will contain report/category/KPI/insight data. `LaporanPenyaluranWorkspace` owns active category, search, and feedback state. Tests cover category selection, archive search, and export feedback. Typecheck and production build must pass.
