# Approval & Audit Trail Keputusan Penyaluran — Design

## Tujuan

Membuat keputusan penyaluran dapat dipertanggungjawabkan: siapa mengambil keputusan, kapan dilakukan, status apa yang berubah, alasan keputusan, dan nilai bantuan yang ditetapkan.

## Ruang Lingkup

Fitur ini memperluas alur Mustahik yang sudah ada. Tidak membuat sistem pengajuan atau status workflow baru.

1. Keputusan tahap kerja dicatat sebagai approval terstruktur.
2. Riwayat tidak dapat diubah dari antarmuka operasional.
3. Admin dapat menelusuri seluruh keputusan pada halaman audit.
4. Pengguna hanya dapat mengambil aksi sesuai peran dan tahap kerja.

## Peran dan Aksi

| Tahap | Peran yang diizinkan | Aksi | Data wajib |
| --- | --- | --- | --- |
| Verifikasi administrasi | Penyaluran, Admin | Lanjutkan, kembalikan, tolak | Catatan keputusan |
| Survey lapangan | Surveyor, Admin | Nyatakan layak, perlu perbaikan, tolak | Catatan dan skor bila tersedia |
| Persetujuan MPZIS | Penyaluran, Admin | Setujui, revisi, tolak | Catatan dan nominal disetujui untuk setuju |
| Pengajuan/pencairan dana | Penyaluran, Admin | Siapkan pencairan, tunda, selesaikan | Catatan keputusan |

Penolakan atau permintaan perbaikan tidak menghapus data Mustahik. Sistem menyimpan status asal, status tujuan, alasan, aktor, dan waktu pada rekam audit baru.

## Model Data

Tambahkan tabel `approval_decisions`:

- `id`, `mustahik_id`, `stage`, `action`, `previous_status`, `next_status`
- `note`, `approved_amount`, `actor_id`, `actor_name`, `actor_role`
- `created_at`

Tabel bersifat append-only untuk API operasional: hanya `INSERT` dan `SELECT`; tidak ada endpoint edit atau hapus.

`activity_logs` tetap dipertahankan untuk aktivitas umum. Setiap approval baru juga menulis satu `activity_logs` ringkas agar timeline lama dan notifikasi tetap konsisten.

## API

| Endpoint | Akses | Fungsi |
| --- | --- | --- |
| `POST /api/mustahik/:id/decision` | Terautentikasi, validasi peran | Menyimpan keputusan dan memperbarui status secara atomik |
| `GET /api/mustahik/:id/approvals` | Penyaluran, Surveyor, Admin | Riwayat keputusan untuk satu Mustahik |
| `GET /api/penyaluran/audit-decisions` | Admin | Daftar audit lintas Mustahik dengan filter tanggal, aktor, aksi, dan tahap |

Server mengambil identitas aktor dari token, bukan dari nama yang dikirim browser. Parameter `actor_name` lama tidak lagi menjadi sumber audit otoritatif.

## Pengalaman Antarmuka

### Detail Mustahik

Panel keputusan yang ada menjadi formulir terarah:

- status/tahap saat ini yang jelas;
- aksi yang valid untuk peran pengguna;
- catatan wajib;
- input nominal hanya ketika persetujuan MPZIS;
- ringkasan dampak sebelum konfirmasi.

Tab **Riwayat** menampilkan timeline keputusan: aksi, aktor/peran, timestamp, transisi status, nominal bila ada, dan catatan. Tidak ada tombol edit atau hapus.

### Audit Keputusan

Halaman baru `/penyaluran/audit` khusus admin, dengan filter periode, tahap, aksi, dan aktor. Tabel desktop menampilkan waktu, Mustahik, keputusan, transisi, nominal, serta pengambil keputusan. Pada layar kecil, baris menjadi kartu ringkas.

## Validasi dan Kegagalan

- Catatan wajib untuk seluruh aksi.
- Nominal positif wajib untuk persetujuan MPZIS.
- Aksi yang tidak sesuai status saat ini atau peran pengguna ditolak `403`/`422`.
- Kegagalan menyimpan audit membatalkan perubahan status agar tidak ada keputusan tanpa jejak.
- Tampilan menunjukkan pesan yang dapat dipahami dan mempertahankan isian formulir saat respons gagal.

## Pengujian

1. Repository: keputusan tersimpan bersama transisi status dan record audit.
2. API: peran tidak sah dan keputusan tanpa catatan ditolak.
3. Antarmuka keputusan: field nominal muncul pada MPZIS dan validasi tampil.
4. Timeline: menampilkan aktor, status lama/baru, dan catatan.
5. Audit admin: filter dan pembatasan akses berfungsi.

## Keputusan Desain

Menggunakan audit append-only yang terpisah dari activity log membuat riwayat keputusan terstruktur untuk pemeriksaan, tanpa merusak timeline operasional atau pengiriman notifikasi yang telah ada.
