# Audit UI/UX Program 5 Pilar — 26 Agustus 2026

## Ruang lingkup

Audit gabungan UX dan aksesibilitas pada halaman `/penyaluran/program`, dengan fokus pada hierarki informasi, kepadatan layout, pemilihan pilar, panel kinerja, analitik, portofolio program, dan reflow responsif.

## Tujuan pengguna

Amil dapat memilih satu pilar, memahami hubungan anggaran sampai dampak, membaca indikator utama, dan memindai portofolio program tanpa ruang kosong yang membingungkan atau data yang terpotong.

## Langkah dan kondisi akhir

1. **Desktop — sehat.** Hero, selector lima pilar, rantai dampak, dan panel kinerja terbaca dalam urutan yang jelas. Tidak ada overflow horizontal.
   - Bukti: [tampilan atas desktop](16-final-desktop-top.png)
   - Bukti: [panel kinerja dan data dinamis desktop](18-final-review-fixes.png)
2. **Tablet — sehat.** Pilar kelima mengisi lebar baris, strip proyeksi tidak menyisakan sel kosong, dan analitik memakai komposisi dua kolom lalu satu kartu penuh.
   - Bukti: [selector pilar tablet](10-tablet-fixed-top.png)
   - Bukti: [ringkasan dan analitik tablet](11-tablet-fixed-analytics.png)
3. **Mobile — sehat.** KPI disusun dua kolom, analitik ditumpuk alami, dan portofolio menggunakan kartu ringkas sehingga tidak perlu menggeser tabel horizontal.
   - Bukti: [KPI mobile](12-mobile-fixed-kinerja.png)
   - Bukti: [portofolio mobile](15-mobile-fixed-portfolio.png)
4. **Interaksi pilar — sehat.** Klik pilar memperbarui seluruh data terpadu; tombol panah, Home, dan End dapat memindahkan fokus dan pilihan tab.

## Perbaikan berdampak tinggi

- Grafik dan empat KPI digabung dalam satu panel dengan tinggi natural.
- Proyeksi, pagu, sisa kuota, jangkauan, dan penerima baru disatukan dalam insight strip tanpa sel kosong.
- Angka proyeksi, pagu, dan sisa kuota ikut berubah saat pilar aktif diganti.
- Tiga analitik lanjutan tidak lagi memakai pemaksaan tinggi dan jarak internal yang berlebihan.
- Tabel portofolio dipertahankan untuk desktop, sedangkan mobile dan tablet mendapat kartu ringkas.
- Fokus keyboard terlihat dan pola tab mendukung navigasi panah.

## Batas pemeriksaan

Audit visual tidak membuktikan kepatuhan WCAG penuh. Pembaca layar lintas perangkat, kontras terukur, pembesaran 200–400%, dan preferensi gerak masih memerlukan pengujian aksesibilitas khusus.
