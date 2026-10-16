# Peta Sebaran Penyaluran — desktop decision workspace

## Tujuan

Mengubah halaman `/penyaluran/peta` dari tampilan GIS ringkas menjadi ruang keputusan desktop yang konsisten dengan Beranda, Data Mustahik, dan Program 5 Pilar. Halaman harus membantu amil membaca tiga hal secara berurutan: besaran penyaluran, jumlah mustahik, dan kebutuhan berdasarkan asnaf.

## Ruang lingkup

Fase ini hanya menyentuh desktop frontend. Peta Leaflet OpenStreetMap dan GeoJSON 13 kecamatan yang sudah ada dipertahankan. Data API yang tersedia digunakan lebih dahulu dan nilai demo tetap menjadi fallback. Tidak ada perubahan backend, skema database, atau menu navigasi.

## Struktur layar

1. **Header halaman** — satu panel putih seperti halaman Program: judul “Peta Sebaran Penyaluran”, deskripsi singkat, dan status data tersinkron. Tombol ekspor GIS tetap tersedia sebagai aksi sekunder.
2. **Toolbar analisis** — kontrol metrik yang eksklusif: `Realisasi dana`, `Jumlah mustahik`, dan `Kebutuhan asnaf`; disertai filter tampilan program. Pada fase dummy, perubahan metrik akan memperbarui warna peta dan copy/detail yang terlihat.
3. **Workspace utama** — grid desktop 8:4 yang rapat dan tinggi peta setara dengan panel detail.
   - Kiri: peta OSM nyata beserta polygon GeoJSON 13 kecamatan, legenda intensitas, dan tooltip.
   - Kanan: satu panel wilayah terpilih; nama kecamatan, nominal metrik aktif, tren, jumlah mustahik, program dominan, asnaf dominan, satu insight tindakan, dan CTA menuju Data Mustahik dengan filter kecamatan.
4. **Insight pendukung** — satu baris di bawah workspace dengan dua panel seimbang: alokasi nominal berdasarkan 5 pilar dan komposisi penerima berdasarkan asnaf. Tidak ada KPI tambahan yang tidak mengubah keputusan pengguna.

## Interaksi dan alur data

- Memilih polygon memperbarui panel detail wilayah dan daftar insight yang bergantung pada wilayah tersebut.
- Mengganti metrik mengubah gaya choropleth serta label/angka utama panel detail; pemilihan kecamatan tetap dipertahankan.
- Data utama memakai `api.getPenyaluranByKecamatan()`. Jika API tidak tersedia, aplikasi memakai `DEMO_KECAMATAN_DATA`.
- Data per program serta asnaf dipisahkan menjadi satu konfigurasi demo bertipe jelas agar dapat diganti API kelak, tanpa mengubah struktur UI.
- CTA membentuk URL `/penyaluran/mustahik?kecamatan={nama}`.

## Desain responsif

- Desktop (`lg` ke atas): peta/panel memakai grid 8:4, insight menggunakan dua kolom.
- Tablet: workspace tetap dua kolom bila ruang mencukupi; toolbar boleh membungkus.
- Mobile: detail bergeser di bawah peta, toolbar menjadi bar horizontal yang membungkus, insight menjadi satu kolom. Tidak ada teks yang dipaksa satu baris atau panel dengan tinggi kosong.

## Bahasa visual dan aksesibilitas

- Memakai container, typography Manrope, warna emerald, radius, border, dan bayangan halus yang sudah dipakai halaman final lain.
- Warna bukan satu-satunya pembeda: metrik aktif memiliki label teks, legenda, dan nilai yang eksplisit.
- Polygon tetap dapat dipilih dengan pointer; kontrol metrik adalah tombol native dengan state `aria-pressed`.
- Transisi warna peta dan panel menggunakan durasi singkat dan dihormati oleh `prefers-reduced-motion`.

## Komponen yang direncanakan

- `PetaSebaranWorkspace`: komposisi layar, state metrik, pemilihan kecamatan, dan fallback data.
- `RealKecamatanMap`: menerima `metric`, data wilayah, dan callback pemilihan; menentukan warna choropleth dari metrik aktif.
- `map-data.ts`: konstanta demo untuk metric/program/asnaf dan helper pemformatan yang dapat diuji tanpa Leaflet.

## Verifikasi

- Tambah unit test untuk default heading, pemilihan metrik, dan detail wilayah terpilih.
- Jalankan test komponen terkait, typecheck, dan production build Next.js.
- Verifikasi manual pada viewport desktop dan mobile bahwa peta, panel detail, toolbar, serta CTA tetap terbaca dan tidak menimbulkan horizontal overflow.

## Keputusan eksplisit

- Tidak menambahkan top-level menu baru.
- Tidak membuat ekspor GIS fungsional pada fase ini; tombol hanya mempertahankan affordance yang telah ada.
- Polygon resmi tetap dapat diganti saat sumber GeoJSON pemerintah tersedia; kontrak komponen tidak mengikat bentuk geometri tertentu.
