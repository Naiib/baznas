# Desain Panel Kinerja Program Terpadu

## Tujuan

Menghilangkan ruang kosong besar pada pasangan panel tren bulanan dan dampak utama tanpa menambah konten dekoratif yang tidak membantu pengambilan keputusan.

## Struktur final

- Satu region bernama **Kinerja Program Terpadu** menggantikan dua kartu yang saling dipaksa memiliki tinggi sama.
- Area atas memakai grid `7:5`: grafik tren natural-height di kiri dan empat KPI terpenting dalam grid `2x2` di kanan.
- Area bawah menjadi insight strip selebar region yang memuat proyeksi serapan, pagu, sisa anggaran, cakupan kecamatan, dan penerima baru.
- Tidak ada `items-stretch`, `justify-between`, atau `flex-1` yang memaksa kartu tumbuh mengikuti kolom tetangga.
- Desktop memakai dua kolom; tablet dan mobile ditumpuk dalam urutan grafik, KPI, lalu insight strip.

## Konten

- Empat KPI utama: penerima utama, keberhasilan, rata-rata bantuan, dan program aktif.
- Dua KPI sekunder, cakupan kecamatan dan penerima baru, dipindahkan ke insight strip.
- Data tetap memakai data dummy yang sudah tersedia untuk setiap pilar.

## Aksesibilitas dan responsivitas

- Region memiliki heading yang jelas.
- Grafik memiliki ringkasan screen-reader per bulan.
- Tidak ada overflow horizontal pada viewport 390px, 768px, dan desktop.
- Ukuran sentuh, teks, dan kontras mengikuti design system Penyaluran.

## Verifikasi

- Test komponen memastikan region terpadu, empat KPI, dan insight strip tampil.
- Visual QA dilakukan pada desktop, tablet, dan mobile.
- Suite test, typecheck, dan production build harus lulus.
