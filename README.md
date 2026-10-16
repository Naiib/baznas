# BAZNAS V1

Repository resmi BAZNAS V1. Checkout ini berisi paket sinkronisasi workspace
fetch-only yang telah diuji; kode aplikasi dari folder laptop non-Git tidak
diimpor atau ditimpa secara otomatis.

## Sinkronisasi aman

Jalankan dari root repository pada Bash/Linux dengan Git, Python 3, GNU timeout,
dan utilitas shell standar:

```bash
./scripts/sync_baznas_repo.sh --check-only .
./scripts/sync_baznas_repo.sh --json .
./tests/test_sync_baznas_repo.sh
```

Sinkronisasi bersifat on-demand: hanya mengambil branch remote ke namespace
remote-tracking, tanpa pull, merge, rebase, push, atau perubahan branch lokal.
Tidak ada scheduler/hook persisten yang dipasang. Akses Read cukup untuk fetch;
publikasi dokumentasi melalui commit/PR memerlukan akses Write dan workflow
terpisah yang diotorisasi.

## Dokumentasi

- `docs/WORKSPACE_AND_LAPTOP_SETUP.md`: setup, penggunaan, dan batas recovery.
- `docs/DIAGNOSTIC_AND_AUDIT_REPORT.md`: riwayat audit sebelum akses tersedia.
- `docs/LIVE_INTEGRATION_VERIFICATION.md`: hasil verifikasi live setelah keputusan pemilik.

Pemeriksaan integritas mendeteksi perubahan, bukan mencegah semua mutasi
eksternal atau menjalankan rollback. Isi ignored files dan isi internal submodule
tidak dijamin fingerprint. Gunakan checkout terisolasi dan satu implementer.
Native PowerShell tidak diuji; folder laptop non-Git harus tetap dipertahankan.
