# BAZNAS Data Center V2 — AI Agent + Telegram Demo

Sistem demo untuk digitalisasi proses pengajuan mustahik di BAZNAS. Fitur utama:

- **Dashboard admin BAZNAS** berbasis React + Vite yang sudah ada.
- **Backend Node.js + Express + SQLite** untuk penyimpanan data lokal.
- **Telegram Bot** untuk input data oleh petugas lapangan.
- **AI Agent** menggunakan Ollama Cloud dengan model `kimi-k2.6` untuk membaca dan mengekstrak data dari teks maupun foto form survey (F-BPP/04).
- **Status pengajuan workflow**: Diajukan → Verifikasi Administrasi → Survey → Persetujuan MPZIS → Pengajuan Dana (FPD) → Penyaluran Selesai.
- Integrasi format dokumen: **F-BPP/04 (Assessment Mustahik)**, **F-BPP/06 (MPZIS)**, dan **F-PKP/03 (PPD)**.

Sistem ini bersifat **demo lokal** dan **menyampingi** sistem Excel yang sudah berjalan, bukan menggantinya.

## Menjalankan Aplikasi

### 1. Persiapan Environment

Salin file `.env.example` menjadi `.env`, lalu isi:

```env
PORT=3001
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OLLAMA_API_KEY=your_ollama_cloud_api_key
OLLAMA_HOST=https://ollama.com
OLLAMA_MODEL=kimi-k2.6
FRONTEND_URL=http://localhost:5173
UPLOAD_DIR=./uploads
NODE_ENV=development
```

> ⚠️ Jangan commit file `.env` ke repository. File ini sudah masuk `.gitignore`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Jalankan Backend

```bash
npm run server
# atau dengan auto-reload saat dev
npm run server:dev
```

Backend akan berjalan di `http://localhost:3001`. Telegram bot akan otomatis mulai polling.

### 4. Jalankan Frontend

Di terminal terpisah:

```bash
npm run dev
```

Buka `http://localhost:5173` di browser. Navigasi ke menu **Data Mustahik**.

## Menggunakan Telegram Bot

Pastikan bot sudah dibuat melalui [@BotFather](https://t.me/BotFather) dan token dimasukkan ke `.env`.

Perintah yang tersedia:

| Perintah | Fungsi |
|---|---|
| `/start` | Menu utama |
| `/help` | Panduan penggunaan |
| `/status <no_berkas>` | Cek status pengajuan |
| `/survey <data>` | Input hasil survey teks |
| `/mpzis <data>` | Input data MPZIS |
| `/ppd <data>` | Input data PPD |

### Contoh Input Survey Teks

```
/survey
no_berkas=MST-002
nama=Keluarga Bpk. Sulaeman
alamat=Jl. Melati No. 8 RT/RW 003/004
kecamatan=Cipondoh
program=Kesehatan
uraian=Bantuan pengobatan dan sembako
asnaf=Fakir
pendapatan=1200000
pengeluaran=2500000
rumah=Kontrak
tanggungan=4
rekomendasi=Layak
prioritas=1
surveyor=Romlih, S.Sos
surveyor_phone=0812345678901
```

### Contoh Input Survey Foto

Kirim foto form F-BPP/04 dengan caption:

```
/survey no_berkas=MST-002
```

Bot akan membaca foto menggunakan AI dan menyimpan hasil ekstraksi ke database.

## Struktur Project

```
D:\AI\DataCenter_BAZNAS V2
├── server/               # Backend Express + SQLite + Telegram Bot + AI
│   ├── index.js          # Entry point Express
│   ├── db.js             # Database schema & seed
│   ├── repository.js     # Data access layer
│   ├── bot.js            # Telegram bot handlers
│   └── ai.js             # Ollama Cloud integration
├── src/                  # Frontend React + Vite
│   ├── components/
│   │   └── MustahikPage.jsx
│   └── services/
│       └── api.js
├── data/                 # Dokumen format BAZNAS (PDF/Excel)
├── uploads/              # Foto dokumen dari Telegram
├── .env                  # Secrets (tidak di-commit)
└── .env.example          # Template environment
```

## Integrasi Ollama Cloud

Base URL resmi Ollama Cloud: `https://ollama.com/api`

Endpoint yang digunakan:
- `POST /api/chat` — untuk ekstraksi teks dan gambar.
- `GET /api/tags` — untuk memverifikasi model tersedia.

Model default yang digunakan: `kimi-k2.6`. Pastikan API key valid dan model tersedia di akun Ollama Cloud Anda.

## Operasional Produksi & Hardening

Untuk panduan lengkap operasional produksi, manajemen rahasia (`JWT_SECRET`, `P0_FIELD_ENCRYPTION_KEY`), verifikasi hak akses per divisi, pencadangan database, migrasi skema PostgreSQL 16, dan prosedur *rollback*, rujuk ke dokumen runbook:
- [Data & Access Foundation Operations Runbook](docs/operations/data-access-runbook.md)
- [BAZNAS Mustahik P0 Deployment Runbook & Operational Procedures](docs/operations/mustahik-p0-runbook.md)
- [BAZNAS Mustahik P0 Verification Matrix & Release Evidence](docs/operations/mustahik-p0-verification.md)

### Pemeriksaan Wajib Pra-Deploy VPS
```bash
test -n "$JWT_SECRET" && test "$JWT_SECRET" != "baznas_tangkot_super_secret_jwt_key_2026"
curl -fsS http://127.0.0.1:3001/api/health
pm2 status
pg_dump "$DATABASE_URL" > "baznas-$(date +%F).sql"
```

### P0 Digital Operations & Migration Runner
Workflow digital P0 dilindungi oleh feature flag `PENYALURAN_P0_ENABLED` (default: `false` fail-closed) dan enkripsi field AES-256-GCM (`P0_FIELD_ENCRYPTION_KEY`).

Perintah operasional migrasi P0:
```bash
# 1. Analisis pra-migrasi (dry-run data legacy & foreign key integrity)
npm run p0:migration:dry-run

# 2. Eksekusi migrasi skema PostgreSQL (advisory locked & transactional)
npm run p0:migration:run

# 3. Rehearsal backup, restore, dan idempotency pada PostgreSQL 16
node scripts/rehearse-m6-migration.js

# 4. Rehearsal UAT end-to-end masked persona & verifikasi bukti kuitansi (SHA-256)
node scripts/m6-uat-verification.js
```

### Verifikasi Matrix Rilis (M5/M6)
```bash
# Suite backend (129 tests)
node --test server/program-overview-stats.test.js server/auth.test.js server/auth-db.test.js server/users.test.js server/mustahik-read-model.test.js server/reports.test.js server/penerimaan-routes.test.js server/rbac-guard.test.js server/mustahik-mutations.test.js server/penyaluran-p0-auth.test.js server/penyaluran-p0-audit.test.js server/penyaluran-p0-artifacts.test.js server/penyaluran-p0-workspace.test.js server/penyaluran-p0-migration-runner.test.js server/penyaluran-p0-receipt-jobs.test.js server/penyaluran-p0-e2e.test.js server/migration-parity.test.js

# Suite Next.js frontend (380 tests)
npm --prefix frontend-next test

# Typecheck & Webpack production build Next.js
npm --prefix frontend-next run typecheck
npm --prefix frontend-next run build
```

## Development Commands

```bash
npm run dev                 # Jalankan frontend Vite dev server
npm run server              # Jalankan backend
npm run server:dev          # Jalankan backend dengan auto-reload
npm run build               # Build frontend Vite untuk production
npm run lint                # Jalankan oxlint
npm run preview             # Preview build production
npm run p0:migration:dry-run # Analisis dry-run migrasi P0
npm run p0:migration:run    # Eksekusi migrasi skema P0
```

## Otomatisasi & Sinkronisasi Workspace (MKA-132)

Repository ini dilengkapi paket sinkronisasi workspace on-demand (fetch-only):
```bash
./scripts/sync_baznas_repo.sh --check-only .
./scripts/sync_baznas_repo.sh --json .
./tests/test_sync_baznas_repo.sh
```
Dokumentasi teknis sinkronisasi dan panduan setup:
- `docs/WORKSPACE_AND_LAPTOP_SETUP.md`: setup, penggunaan, dan batas recovery.
- `docs/DIAGNOSTIC_AND_AUDIT_REPORT.md`: riwayat audit konektivitas.
- `docs/LIVE_INTEGRATION_VERIFICATION.md`: catatan verifikasi live integrasi.

## Lisensi

Proyek internal BAZNAS Data Center V2.
