# Audit Data Mustahik — 26 Agustus 2026

## Lingkup

Audit workspace `Data Mustahik` untuk alur memilih antrean, membaca profil, meninjau kelayakan, dan mengambil keputusan pada desktop, tablet, serta ponsel.

## Bukti yang ditangkap

1. `01-desktop-current.png` — desktop 1440 × 900: fungsi utama sehat, tetapi panel keputusan permanen menyisakan ruang baca sempit saat jendela lebih kecil dari layout tiga kolom ideal.
2. `02-tablet-current.png` — tablet 1024 × 900: detail lebih terbaca karena panel keputusan berubah menjadi drawer, tetapi header dan kartu perlu disederhanakan agar fokus tidak terbagi.
3. `03-mobile-current.png` — ponsel 390 × 844: tidak sehat; halaman berhenti pada runtime error `Invalid LatLng object: (NaN, NaN)` dari `MapViewport.useEffect`.

## Temuan utama

### UX

- Layout tiga kolom pada desktop memaksakan konten identitas dan keputusan ke lebar yang terlalu kecil. Nomor NIK, telepon, alamat, dan deskripsi kelayakan mudah pecah menjadi banyak baris.
- Panel keputusan adalah tindakan penting, tetapi tidak perlu mengambil lebar tetap setiap saat. Pola drawer yang sudah digunakan di tablet lebih sesuai untuk fokus kerja.
- Empat kartu ringkasan memiliki bobot visual serupa. Pengguna harus memindai beberapa kartu untuk memahami orang, bantuan, lokasi, dan tahap proses.
- Tombol tindakan antrean dan badge tahap cukup kecil pada kondisi rapat; keterbacaan berkurang saat daftar memanjang.

### Aksesibilitas dan responsivitas

- Mobile memiliki error pemblokir sehingga alur tidak dapat diaudit lebih lanjut.
- Reflow detail pada lebar menengah harus diuji tanpa overflow horizontal dan tanpa target sentuh yang terlalu kecil.
- Struktur tab dan label kontrol sudah menjadi fondasi yang baik, tetapi perlu diuji ulang dengan keyboard setelah layout diubah.

## Arah perbaikan yang direkomendasikan

Gunakan pola **Focused Review**: dua kolom adaptif (antrean + detail) untuk desktop dan tablet; keputusan hanya tampil sebagai ringkasan pendek di detail dan dibuka penuh melalui drawer. Pada ponsel, antrean dan detail tetap satu per satu dengan CTA keputusan sticky.

## Batas audit

Audit ini menguji state data demo dan interaksi visual dasar. Kontras aktual, screen reader, data API nyata, serta perilaku peta dengan seluruh kecamatan perlu diuji pada implementasi berikutnya.
