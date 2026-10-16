# Panduan Setup Workspace, Laptop, & Prosedur Sinkronisasi BAZNAS V1

Dokumen ini menyajikan panduan setup lingkungan, pengoperasian sinkronisasi on-demand (fetch-only), batasan tindakan pemulihan, dan kebutuhan verifikasi akses eksternal untuk repositori GitHub `Naiib/baznas`.

---

## 1. Panduan Setup Lingkungan

### A. Lingkungan Laptop Pengembang
- **Kondisi Eksisting:** Folder lokal `C:\Users\naqib\source\baznas-mka123` berisi file kode proyek, tetapi tidak memiliki repositori Git lokal (non-Git folder).
- **Prinsip Keselamatan (No Overwrite):**
  - **Dilarang keras** menjalankan clone langsung yang menimpa folder tersebut.
  - **Saran Standar (Clone Terpisah):**
    Lakukan clone ke folder terpisah baru:
    ```powershell
    git clone git@github.com:Naiib/baznas.git C:\Users\naqib\source\baznas-v1
    ```
  - **Opsi Inisialisasi Lokal (Jika ingin menghubungkan folder lama):**
    ```powershell
    cd C:\Users\naqib\source\baznas-mka123
    git init
    git branch -M main
    git remote add origin git@github.com:Naiib/baznas.git
    # Fetch metadata remote saja tanpa menyentuh file lokal:
    git fetch origin main
    git status
    ```

### B. Lingkungan Workspace Multica / VPS
- Skrip sinkronisasi aman tersedia di `scripts/sync_baznas_repo.sh`.
- Pengujian dan eksekusi dilakukan dalam worktree/direktori terisolasi tanpa menyentuh checkout produksi bersama.

---

## 2. Mekanisme Otomatisasi Sinkronisasi (Fetch-Only On-Demand)

### A. Kontrak Keamanan Fetch-Only
Skrip `scripts/sync_baznas_repo.sh` menjamin:
- **Refspec Netral:** Memaksa parameter `--refmap=''` dan refspec eksplisit `+refs/heads/*:refs/remotes/<remote>/*` sehingga konfigurasi kustom `remote.<remote>.fetch` yang mengarah ke branch lokal nonaktif dinetralkan sepenuhnya.
- **Pencegahan Mutasi Tag Lokal:** Mengaktifkan flag `--no-tags` dan `-c fetch.pruneTags=false` sehingga tag remote tidak diturunkan ke `refs/tags/*` lokal.
- **Host-Bound Allowlist:** Secara ketat hanya mengizinkan URL resmi GitHub (`https://github.com/Naiib/baznas[.git]` dan `git@github.com:Naiib/baznas.git`). Path filesystem atau host lain ditolak kecuali `--allow-any-remote` dipassing eksplisit untuk fixture test. Multi-URL remote ditolak secara eksplisit.
- **Zero Index Writes & Raw Index Hash Preservation:** Pemeriksaan pra-fetch dan pasca-fetch sepenuhnya read-only dengan `GIT_OPTIONAL_LOCKS=0`. Hash SHA-256 file `.git/index` mentah diukur langsung sebelum perintah apa pun dijalankan dan diverifikasi 100% tidak berubah (byte-for-byte identical). Tidak menggunakan `write-tree` atau status write.
- **Deteksi Perubahan Konten Dirty/Untracked Komprehensif:**
  - Menggunakan `--untracked-files=all` untuk mengenumerasi seluruh untracked files secara individual (termasuk nested directory `scratch/nested.txt`).
  - Menangani format porcelain v1 `-z` pada operasi rename (`git mv`) secara akurat dengan menghash file destination yang berada di disk dan membingkai identitas source/destination tanpa ambigu.
  - Membaca dan menghash byte konten file secara streaming untuk seluruh file dirty dan untracked.
  - **Fail-Closed:** Setiap kegagalan pembacaan atau inspeksi Git langsung membatalkan eksekusi dengan exit code 10 tanpa menghasilkan klaim `integrity_verified=true` palsu dan tanpa membocorkan isi file/secret.
- **Disclaimer Integritas Pasca-Fetch:** Pemeriksaan integritas pasca-fetch hanya berfungsi untuk **mendeteksi** bila terjadi mutasi/perubahan selama proses fetch; skrip **BUKAN** pencegah mutasi eksternal secara aktif dan **TIDAK** membatalkan, merollback, atau menimpa perubahan pengguna secara otomatis.
- **Fail-Closed Timeout:** Menolak timeout non-positif/unbounded (hanya menerima 1..3600 detik). Gagal aman (exit 11) jika utilitas `timeout` tidak ditemukan. Menggunakan opsi `--kill-after=5s` untuk menghentikan proses yang mengabaikan SIGTERM.
- **Validitas JSON:** Output JSON dihasilkan menggunakan encoder `python3 json.dumps` sehingga karakter khusus (kutip ganda, backslash aktual, newline aktual) ter-escape sempurna dan valid.
- **Hermetic Validation:** Opsi `--check-only` memungkinkan verifikasi konfigurasi dan allowlist tanpa melakukan pemanggilan jaringan.

### B. Status Pengujian Mekanisme Otomatisasi
- Yang diimplementasikan dan diverifikasi dalam scope ini adalah **CLI on-demand execution**.
- Tidak ada pre-build hook, watcher, atau persistent daemon scheduler yang diklaim aktif karena mekanisme tersebut belum diuji atau dipasang pada lingkungan ini.

### C. Penggunaan CLI
```bash
# Sinkronisasi aman on-demand
./scripts/sync_baznas_repo.sh /path/to/repo

# Validasi hermetic tanpa fetch jaringan
./scripts/sync_baznas_repo.sh --check-only /path/to/repo

# Format JSON terstruktur
./scripts/sync_baznas_repo.sh --json /path/to/repo

# Parameter timeout (1..3600 detik)
./scripts/sync_baznas_repo.sh -t 15 /path/to/repo
```

---

## 3. Penanganan Konflik & Prosedur Pemulihan (Manual Recovery Only)

> **PENTING: Status Otorisasi:**  
> Tindakan pemulihan (seperti merge, rebase, push, stash) **BUKAN** tindakan yang saat ini diotorisasi untuk dijalankan secara otomatis oleh skrip maupun agent. Langkah-langkah di bawah ini hanya merupakan panduan prosedur manual bagi pengembang setelah memperoleh persetujuan terpisah dari Manager/Owner:

1. **Ketika Upstream Status = `behind`:**
   - Evaluasi apakah perubahan remote siap diintegrasikan.
   - Tindakan manual terpisah (dengan otorisasi): `git merge --ff-only origin/main`.
2. **Ketika Upstream Status = `ahead`:**
   - Verifikasi commit lokal dengan `git log origin/main..HEAD`.
   - Tindakan push ke remote hanya boleh dilakukan setelah review dan izin eksplisit.
3. **Ketika Upstream Status = `diverged`:**
   - Buat backup branch lokal sebelum rekonsiliasi: `git branch backup-local-$(date +%s)`.
   - Lakukan merge atau rebase manual di branch terisolasi.
4. **Ketika Status Working Tree = `DIRTY`:**
   - Simpan pekerjaan uncommitted sebelum sinkronisasi: `git stash push -m "WIP" -u`.
   - Jangan menjalankan reset atau checkout paksa.

---

## 4. Rincian Kebutuhan Akses Eksternal

1. **GitHub Access / Collaborator:**
   - Memerlukan verifikasi pemilik repo `Naiib` untuk memberikan hak akses **Read** (least privilege) kepada akun `agentivesolution` pada repositori privat `Naiib/baznas`.
2. **SSH / Deploy Key:**
   - Verifikasi apakah deploy key atau public key SSH workspace telah didaftarkan pada repo atau akun terkait.
3. **Multica Platform Sync:**
   - Memerlukan sinkronisasi GitHub resource oleh admin platform Multica pada resource `72589709-7c77-4598-bbd3-a20eff0a0a99`.
