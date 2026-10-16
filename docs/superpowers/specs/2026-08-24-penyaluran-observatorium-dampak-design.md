# Observatorium Dampak Penyaluran — Design

## Tujuan

Mengubah beranda `/penyaluran` menjadi dashboard operasional yang hidup dan mudah dipindai oleh Kabid Penyaluran. Tampilan tetap menggunakan top navigation dan fondasi Concept 3, namun data menjadi pusat pengalaman.

## Visual yang dipilih

Mengikuti mockup pilihan 1: **Observatorium Dampak**. Permukaan utama putih, aksen emerald BAZNAS, hierarki editorial yang tenang, dan grid data yang kaya tetapi tidak terasa seperti template admin.

## Isi utama

- Satu filter periode global: `7 Hari`, `30 Hari`, `1 Tahun`; seluruh angka, tren, asnaf, program, peta, dan aktivitas mengikuti periode aktif.
- Ringkasan eksekutif: total penyaluran, mustahik terbantu, transaksi/program aktif, rata-rata bantuan, dan perubahan dari periode sebelumnya.
- Tren kumulatif dengan garis periode aktif, pembanding, dan target.
- Distribusi 8 asnaf dengan nominal dan persentase yang berjumlah 100%.
- Kartu dampak 5 Pilar dengan alokasi, jumlah mustahik, capaian target, dan tautan ke workspace program.
- Peta kecamatan tetap interaktif, memakai data dummy per periode sampai API real tersedia.
- Prioritas tindakan dan aktivitas terbaru tetap mudah dijangkau pada sisi kanan.

## Perilaku

Data demo berada dalam satu modul typed dan diekspor lewat `getDashboardData(period)`. Mengganti periode memperbarui seluruh panel tanpa request jaringan. Data API kecamatan bila tersedia tetap dapat mengisi peta; fallback memakai data demo yang sesuai periode.

## Batasan

- Frontend saja; tidak mengubah endpoint, autentikasi, atau data backend.
- Angka dummy yang konsisten secara internal boleh digunakan.
- Tidak mengubah struktur top navigation, nama rute, atau halaman workspace lain.
- Desain desktop-first dan responsif: kolom kanan turun ke bawah pada layar kecil.

## Verifikasi

- Tes unit memastikan data tiap periode berbeda, total asnaf tepat 100%, dan ringkasan periode diterapkan oleh halaman.
- Test, typecheck, dan build Next.js harus lulus.
- Screenshot beranda yang dirender dibandingkan dengan mockup terpilih; P0–P2 diperbaiki sebelum deploy.
