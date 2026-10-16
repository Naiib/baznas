# Data Mustahik Responsive Redesign

## Tujuan

Menyederhanakan ruang kerja Data Mustahik agar mudah dipahami pengguna lintas usia, tetap cepat untuk amil berpengalaman, dan konsisten pada desktop, tablet, serta mobile.

## Keputusan Desain

- Desktop (>=1280px): antrean, profil, dan keputusan tampil bersamaan dalam tiga kolom dengan panel keputusan sticky.
- Tablet (768–1279px): antrean dan profil tampil berdampingan; keputusan dibuka lewat drawer.
- Mobile (<768px): tahap menjadi tab horizontal; pengguna berpindah dari antrean ke detail; aksi keputusan sticky di bawah.
- Informasi keluarga digabung ke identitas agar tidak menjadi kartu terpisah.
- Profil memakai tab `Ringkasan`, `Dokumen`, dan `Riwayat` untuk mengurangi panjang halaman.
- Peta alamat tetap real, tetapi tampil ringkas dan dapat diperbesar saat dibutuhkan.
- Ringkasan keputusan menampilkan skor, validasi, risiko/dokumen kurang, catatan, serta tiga aksi: minta kelengkapan, kembalikan, dan setujui.
- Ukuran teks minimum konten 12px, kontrol sentuh minimum 40px, fokus keyboard terlihat, dan animasi menghormati `prefers-reduced-motion`.

## Struktur Informasi

1. Header ringkas: judul, sinkronisasi, impor, tambah Mustahik.
2. Tahapan horizontal: Semua, Diajukan, Verifikasi, Survey, MPZIS, PPD, Selesai.
3. Antrean: pencarian, filter prioritas, daftar ringkas dengan SLA dan status.
4. Profil:
   - Ringkasan: identitas, kontak, keluarga, alamat, asnaf, program, nominal, progres.
   - Dokumen: kelengkapan dokumen dan masalah yang perlu ditindaklanjuti.
   - Riwayat: timeline pengajuan dan aktivitas verifikasi.
5. Keputusan: skor kelayakan, hasil validasi, hambatan, catatan asesor, aksi final.

## Perilaku Responsif

- Tahap tidak pernah berubah menjadi daftar vertikal panjang.
- Antrean memiliki tinggi terbatas dan scroll internal pada desktop/tablet.
- Memilih Mustahik di mobile membuka detail; tombol kembali mengembalikan user ke posisi antrean.
- Drawer keputusan dapat ditutup dengan tombol eksplisit dan overlay.
- Aksi utama tetap terlihat tanpa harus menggulir ke akhir halaman.

## Animasi

- Pergantian profil: fade + translate singkat 180–240ms.
- Drawer: slide dari kanan pada tablet dan bottom sheet pada mobile.
- Tab dan progress: transisi warna/lebar 200–400ms.
- Tidak ada motion dekoratif yang menghambat pembacaan.

## Kriteria Selesai

- Tidak ada layout vertikal tahap yang memakan satu layar penuh di mobile.
- Tablet menampilkan antrean dan profil dalam satu viewport kerja.
- Panel keputusan dapat dibuka di tablet/mobile dan aksi final mudah ditemukan.
- Semua fungsi lama: pencarian, filter tahap, pemilihan Mustahik, peta, catatan, dan keputusan tetap bekerja.
- Test komponen, typecheck, dan production build lulus.
