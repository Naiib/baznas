# Redesign Akun Penyaluran

## Tujuan

Merombak seluruh frontend akun Penyaluran BAZNAS Kota Tangerang menjadi workspace operasional yang mudah dipindai, cepat dipahami, dan terasa premium. Desain harus mendukung amil menuntaskan pekerjaan berikutnya—bukan sekadar melihat metrik.

## Cakupan

Satu bahasa desain diterapkan konsisten pada Beranda Penyaluran, Data Mustahik, Program 5 Pilar, Peta Sebaran, Laporan/ekspor, serta panel/detail yang dipicu dari halaman-halaman tersebut. Logika API, data, dan otorisasi yang sudah ada tetap dipertahankan; pekerjaan ini berfokus pada frontend dan interaksinya.

## Arah Visual

- **Kanvas:** putih dominan (`#FFFFFF`) dengan pemisah tipis dan permukaan mint yang sangat terbatas untuk fokus aktif. Tidak ada latar gelap, gradien, glassmorphism, maupun kumpulan kartu generik.
- **Identitas:** hijau BAZNAS (`#008B5A`) sebagai warna tindakan dan status positif; tinta gelap untuk teks; aksen status digunakan hemat serta selalu disertai label.
- **Navigasi:** top navbar global untuk Beranda, Data Mustahik, Program 5 Pilar, Peta Sebaran, dan Laporan. Item aktif memakai garis bawah hijau yang bergerak halus. Subnav tipis hanya dipakai jika halaman memiliki konteks internal seperti Ringkasan, Prioritas, Alur, atau Aktivitas.
- **Komposisi:** layout editorial dengan whitespace lega, garis pemisah 1px, kolom yang selaras, dan hierarki tipografi yang kuat. Daftar data tetap berupa satu permukaan koheren dengan row state, bukan kartu berulang.
- **Aset:** logo BAZNAS yang ada dan ikon Lucide yang sudah dipakai proyek; tidak menambah logo atau ilustrasi buatan.

## Pengalaman Utama

### Beranda / Ruang Penyaluran

Beranda menjadi halaman keputusan kerja. Bagian utama menampilkan **Denyut Penyaluran** untuk lima pilar, dilanjutkan tabel **Tindakan selanjutnya** yang mengutamakan kasus, tahap, nilai, dan satu aksi yang jelas. Kolom kanan menyajikan aktivitas terbaru dan cakupan kecamatan secara ringkas.

### Data Mustahik

Halaman ini menjadi case-management workspace. Pencarian, filter tahap, dan daftar mustahik berada dalam satu alur yang mudah dipindai. Memilih baris membuka detail/profil di drawer atau panel konteks, dengan checklist dokumen, progres tahapan, catatan, serta CTA untuk memajukan kasus. Prioritas ditampilkan lewat label dan urutan, bukan warna semata.

### Program 5 Pilar

Program ditampilkan sebagai portofolio berbaris (bukan grid kartu): nama pilar, kebutuhan utama, serapan, target penerima, dan aksi menghubungkan mustahik. Detail program memberi insight dampak dan daftar rekomendasi mustahik yang dapat ditindaklanjuti.

### Peta Sebaran dan Laporan

Keduanya memakai header, navigasi, filter, table/list, dan komponen status yang sama. Peta menempatkan kontrol/filter dekat konteks data; laporan menempatkan rentang waktu dan ekspor sebagai aksi sekunder yang jelas.

## Interaksi dan Animasi

- Transisi halaman singkat dan tidak menggeser konten secara mengejutkan.
- Garis bawah nav bergerak saat pindah modul; focus ring hijau jelas untuk keyboard.
- Titik live dan jalur alur memakai pulse/motion kecil, dihormati oleh `prefers-reduced-motion`.
- Row daftar memiliki hover lift maksimal 1px, state selected mint lembut, dan tombol memiliki press feedback.
- Progress bar dan counter masuk secara bertahap saat halaman dimuat; animasi tidak menghambat tindakan atau menyembunyikan status penting.

## Responsif dan Aksesibilitas

- Desktop mengutamakan top navbar; pada tablet/mobile menu berubah menjadi navigasi ringkas tanpa kehilangan aksi utama.
- Target sentuh minimum 44px, body text minimum 14px, rasio kontras memadai, dan status tidak bergantung pada warna saja.
- Tabel menyajikan alternatif scroll horizontal atau tampilan ringkas pada viewport kecil.
- Semua kontrol dapat diakses keyboard serta memiliki label yang dapat dibaca pembaca layar.

## Penerimaan

1. Semua halaman akun Penyaluran memakai top navbar dan token visual yang konsisten.
2. Beranda mengutamakan tindakan kerja, bukan dashboard metrik padat.
3. Data Mustahik mendukung pencarian, filter, detail, dan CTA kasus yang jelas.
4. Program 5 Pilar menautkan monitoring program dengan aksi penghubungan mustahik.
5. Animasi terasa halus, berfungsi sebagai feedback, dan aman untuk reduced motion.
6. Tampilan diverifikasi di desktop dan breakpoint kecil tanpa overflow atau teks terpotong.
