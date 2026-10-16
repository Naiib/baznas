import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Printer,
  FileText,
  CheckCircle2,
  Download,
  X,
  Building2,
  Calendar,
  User,
  ShieldCheck,
  CreditCard,
  Layers,
  ChevronRight
} from 'lucide-react';
import { formatRupiah } from '../utils/format';

/**
 * Konversi angka ke kalimat terbilang Rupiah Bahasa Indonesia
 */
function angkaKeTerbilang(nilai) {
  const angka = Math.floor(Math.abs(Number(nilai) || 0));
  if (angka === 0) return 'Nol Rupiah';

  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function terbilang(n) {
    if (n < 12) return bilangan[n];
    if (n < 20) return terbilang(n - 10) + ' Belas';
    if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh ' + terbilang(n % 10);
    if (n < 200) return 'Seratus ' + terbilang(n - 100);
    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus ' + terbilang(n % 100);
    if (n < 2000) return 'Seribu ' + terbilang(n - 1000);
    if (n < 1000000) return terbilang(Math.floor(n / 1000)) + ' Ribu ' + terbilang(n % 1000);
    if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + ' Juta ' + terbilang(n % 1000000);
    if (n < 1000000000000) return terbilang(Math.floor(n / 1000000000)) + ' Miliar ' + terbilang(n % 1000000000);
    return terbilang(Math.floor(n / 1000000000000)) + ' Triliun ' + terbilang(n % 1000000000000);
  }

  return (terbilang(angka).trim().replace(/\s+/g, ' ') + ' Rupiah');
}

export default function OfficialDocumentsModal({
  isOpen,
  onClose,
  mustahik = {},
  defaultDoc = 'fbpp04',
  defaultDocType,
}) {
  const initialType = (defaultDocType || defaultDoc || 'fbpp04').toLowerCase().replace(/[-_/]/g, '');
  const [activeDoc, setActiveDoc] = useState(
    initialType.includes('06') || initialType.includes('mpzis')
      ? 'fbpp06'
      : initialType.includes('pkp') || initialType.includes('ppd') || initialType.includes('03')
      ? 'fpkp03'
      : 'fbpp04'
  );
  const printAreaRef = useRef(null);

  // Sync when prop changes
  useEffect(() => {
    const nextType = (defaultDocType || defaultDoc || 'fbpp04').toLowerCase().replace(/[-_/]/g, '');
    if (nextType.includes('06') || nextType.includes('mpzis')) {
      setActiveDoc('fbpp06');
    } else if (nextType.includes('pkp') || nextType.includes('ppd') || nextType.includes('03')) {
      setActiveDoc('fpkp03');
    } else {
      setActiveDoc('fbpp04');
    }
  }, [defaultDocType, defaultDoc, isOpen]);

  if (!isOpen || !mustahik) return null;

  const handlePrint = () => {
    window.print();
  };

  // Safe data extraction
  const fileNo = mustahik.file_no || 'MST-2026-001';
  const name = mustahik.name || 'Nama Mustahik';
  const nik = mustahik.nik || '3671010101900001';
  const kk = mustahik.kk_number || '3671010101900002';
  const address = mustahik.address || 'Jl. Satria No. 10';
  const kelurahan = mustahik.kelurahan || 'Sukarasa';
  const kecamatan = mustahik.kecamatan || 'Tangerang';
  const phone = mustahik.phone || '081234567890';
  const program = mustahik.program || 'Pendidikan';
  const asnaf = mustahik.asnaf || 'Miskin';
  const nominal = mustahik.approved_amount || mustahik.recommended_amount || mustahik.totalAid || 2500000;
  const requestTitle = mustahik.request_title || 'Bantuan Biaya Pendidikan dan Kebutuhan Pokok';
  const dateStr = mustahik.received_date || new Date().toISOString().slice(0, 10);
  const bankName = mustahik.bank_name || 'Bank BJB Syariah';
  const bankAccount = mustahik.bank_account || '512010203040';
  const bankAccountName = mustahik.bank_account_name || mustahik.name || 'Nama Penerima';

  // Sub program mapping
  const subProgramMap = {
    'Pendidikan': 'Tangerang Cerdas (Beasiswa/Bantuan Sekolah)',
    'Kesehatan': 'Tangerang Sehat (Bantuan Berobat & Alkes)',
    'Ekonomi': 'Tangerang Makmur (Modal Usaha Z-Mart)',
    'Kemanusiaan': 'Tangerang Peduli (Bencana & Tanggap Darurat)',
    'Dakwah Advokasi': 'Tangerang Taqwa (Syiar & Bantuan Da\'i)',
  };
  const subProgram = subProgramMap[program] || `Program ${program}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-fade-in print:p-0 print:bg-white print:static">
      {/* Modal Container */}
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col bg-card border border-border shadow-2xl rounded-2xl overflow-hidden print:max-w-none print:border-none print:shadow-none print:rounded-none print:overflow-visible print:max-h-none">
        
        {/* Header Modal - Hidden when Printing */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <FileText className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Dokumen Resmi BAZNAS</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold tracking-wide uppercase">
                  Format Standar
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                No. Berkas: <strong className="text-foreground">{fileNo}</strong> &bull; Mustahik: <strong className="text-foreground">{name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 px-4 font-semibold gap-1.5 shadow-sm"
            >
              <Printer className="size-4" /> Cetak / Simpan PDF
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Tab Navigation - Hidden when Printing */}
        <div className="flex border-b border-border bg-background px-6 pt-2 gap-2 print:hidden shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveDoc('fbpp04')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeDoc === 'fbpp04'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="size-3.5" />
            <span>F-BPP/04 (Assessment Mustahik)</span>
          </button>

          <button
            onClick={() => setActiveDoc('fbpp06')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeDoc === 'fbpp06'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="size-3.5" />
            <span>F-BPP/06 (MPZIS - Memorandum Penyaluran)</span>
          </button>

          <button
            onClick={() => setActiveDoc('fpkp03')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeDoc === 'fpkp03'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-t-lg'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <CreditCard className="size-3.5" />
            <span>F-PKP/03 (PPD - Pencairan Dana & RAB)</span>
          </button>
        </div>

        {/* Document Preview & Printable Area */}
        <div
          ref={printAreaRef}
          className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-900/50 print:p-0 print:bg-white print:overflow-visible"
        >
          <div className="max-w-[820px] mx-auto bg-white text-black p-8 sm:p-10 shadow-lg border border-slate-300 print:shadow-none print:border-none print:p-0 print:m-0 font-serif leading-relaxed text-xs sm:text-sm">
            
            {/* ========================================================= */}
            {/* DOKUMEN 1: FORMULIR F-BPP/04 (ASSESSMENT MUSTAHIK)        */}
            {/* ========================================================= */}
            {activeDoc === 'fbpp04' && (
              <div className="space-y-4">
                {/* Kop Surat BAZNAS */}
                <div className="flex items-center justify-between border-b-2 border-emerald-900 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-700 flex items-center justify-center font-bold text-emerald-800 text-lg bg-emerald-50">
                      BAZNAS
                    </div>
                    <div>
                      <h1 className="text-base sm:text-lg font-bold tracking-tight text-emerald-900 leading-tight">
                        BADAN AMIL ZAKAT NASIONAL (BAZNAS)
                      </h1>
                      <h2 className="text-sm sm:text-base font-bold text-slate-800">
                        KOTA TANGERANG
                      </h2>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-tight font-sans">
                        Gedung MUI Lt. 2, Jl. Satria Sudirman No. 1, Sukaasih, Kec. Tangerang, Kota Tangerang, Banten 15111<br />
                        Hotline: (021) 5573-2020 | Website: baznas.tangerangkota.go.id | Email: baznaskota.tangerang@baznas.go.id
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 border border-slate-400 p-1.5 rounded text-[10px] font-sans bg-slate-50">
                    <span className="font-bold text-slate-800 block">Kode Form:</span>
                    <span className="font-extrabold text-emerald-800 text-xs">F-BPP/04</span>
                  </div>
                </div>

                {/* Judul Dokumen */}
                <div className="text-center pt-2 pb-1">
                  <h3 className="text-sm sm:text-base font-extrabold underline tracking-wide uppercase text-slate-900">
                    FORMULIR ASSESSMENT MUSTAHIK PERORANGAN
                  </h3>
                  <p className="text-[11px] font-sans text-slate-600 mt-0.5">
                    Nomor Registrasi Berkas: <strong className="text-black">{fileNo}</strong>
                  </p>
                </div>

                {/* Bagian I: Data Identitas Pemohon */}
                <div className="space-y-1 font-sans">
                  <div className="bg-emerald-800 text-white text-xs font-bold px-2 py-1 rounded-xs uppercase tracking-wider">
                    I. IDENTITAS PEMOHON & PENERIMA MANFAAT
                  </div>
                  <table className="w-full text-[11px] border-collapse mt-1">
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="w-44 py-1 font-semibold text-slate-700">1. Nama Lengkap</td>
                        <td className="w-4 py-1 text-center">:</td>
                        <td className="py-1 font-bold text-slate-900">{name}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">2. NIK / No. KK</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1">{nik} / {kk}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">3. Tempat, Tgl Lahir / Usia</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1">{mustahik.pob || 'Kota Tangerang'}, {mustahik.dob || '12-06-1985'} ({mustahik.age || 41} Tahun)</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">4. Alamat Domisili</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1">{address}, RT/RW: {mustahik.rt_rw || '002/003'}, Kel. {kelurahan}, Kec. {kecamatan}, Kota Tangerang</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">5. No. Telepon / WhatsApp</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1 font-medium">{phone}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">6. Pekerjaan / Pendidikan</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1">{mustahik.occupation || 'Buruh Harian Lepas'} / {mustahik.education_level || 'SMA/Sederajat'}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1 font-semibold text-slate-700">7. Jumlah Tanggungan</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1">{mustahik.family_dependents || 3} Orang (Termasuk Istri/Anak)</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-semibold text-slate-700">8. Program & Asnaf Diajukan</td>
                        <td className="py-1 text-center">:</td>
                        <td className="py-1 font-bold text-emerald-800">{program} ({subProgram}) &bull; Asnaf: {asnaf}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bagian II: Tabel Indeks Penilaian (5 Indeks) */}
                <div className="space-y-1 font-sans pt-1">
                  <div className="bg-emerald-800 text-white text-xs font-bold px-2 py-1 rounded-xs uppercase tracking-wider">
                    II. HASIL PENILAIAN INDEKS & SKORING KELAYAKAN
                  </div>
                  <table className="w-full text-[10.5px] border border-slate-400 border-collapse mt-1 text-center">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-400">
                        <th className="border-r border-slate-400 py-1 px-2">No</th>
                        <th className="border-r border-slate-400 py-1 px-3 text-left">Komponen Penilaian Mustahik</th>
                        <th className="border-r border-slate-400 py-1 px-2">Bobot</th>
                        <th className="border-r border-slate-400 py-1 px-2">Kondisi / Skor</th>
                        <th className="py-1 px-2">Hasil Evaluasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      <tr>
                        <td className="border-r border-slate-300 py-1">1</td>
                        <td className="border-r border-slate-300 py-1 px-3 text-left font-semibold">Indeks Kondisi Rumah</td>
                        <td className="border-r border-slate-300 py-1">20%</td>
                        <td className="border-r border-slate-300 py-1">{mustahik.house_ownership || 'Kontrak'} (Skor: 3/5)</td>
                        <td className="py-1 text-emerald-800 font-medium">Sederhana / Layak Dibantu</td>
                      </tr>
                      <tr>
                        <td className="border-r border-slate-300 py-1">2</td>
                        <td className="border-r border-slate-300 py-1 px-3 text-left font-semibold">Indeks Kepemilikan Aset</td>
                        <td className="border-r border-slate-300 py-1">15%</td>
                        <td className="border-r border-slate-300 py-1">Minim Aset Produktif (Skor: 2/5)</td>
                        <td className="py-1 text-emerald-800 font-medium">Memenuhi Kriteria Asnaf</td>
                      </tr>
                      <tr>
                        <td className="border-r border-slate-300 py-1">3</td>
                        <td className="border-r border-slate-300 py-1 px-3 text-left font-semibold">Indeks Pendapatan vs Pengeluaran</td>
                        <td className="border-r border-slate-300 py-1">30%</td>
                        <td className="border-r border-slate-300 py-1">{formatRupiah(mustahik.monthly_income || 1200000)} / bln</td>
                        <td className="py-1 text-rose-700 font-medium">Defisit Pengeluaran Pokok</td>
                      </tr>
                      <tr>
                        <td className="border-r border-slate-300 py-1">4</td>
                        <td className="border-r border-slate-300 py-1 px-3 text-left font-semibold">Indeks Tanggungan Keluarga</td>
                        <td className="border-r border-slate-300 py-1">15%</td>
                        <td className="border-r border-slate-300 py-1">{mustahik.family_dependents || 3} Orang Tanggungan</td>
                        <td className="py-1 text-emerald-800 font-medium">Beban Biaya Tinggi</td>
                      </tr>
                      <tr>
                        <td className="border-r border-slate-300 py-1">5</td>
                        <td className="border-r border-slate-300 py-1 px-3 text-left font-semibold">Indeks Ibadah & Sosial (Spiritual)</td>
                        <td className="border-r border-slate-300 py-1">20%</td>
                        <td className="border-r border-slate-300 py-1">Skor: 85 (Baik)</td>
                        <td className="py-1 text-emerald-800 font-medium">Taat Beribadah & Aktif Pengajian</td>
                      </tr>
                      <tr className="bg-emerald-50/50 font-bold border-t border-slate-400">
                        <td colSpan={3} className="border-r border-slate-300 py-1 px-3 text-right">TOTAL SKOR KELAYAKAN & STATUS HAD KIFAYAH :</td>
                        <td className="border-r border-slate-300 py-1 text-emerald-900">78.5 / 100</td>
                        <td className="py-1 text-emerald-900">DI BAWAH HAD KIFAYAH (LAYAK)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Bagian III: Narasi Hasil Survey & Kunjungan Lapangan */}
                <div className="space-y-1 font-sans pt-1">
                  <div className="bg-emerald-800 text-white text-xs font-bold px-2 py-1 rounded-xs uppercase tracking-wider">
                    III. NARASI HASIL SURVEY & REKOMENDASI PETUGAS
                  </div>
                  <div className="border border-slate-300 p-2.5 rounded text-[11px] space-y-1.5 bg-slate-50/50">
                    <p>
                      <strong>1. Kondisi Fisik & Lingkungan:</strong> Pemohon tinggal di rumah kontrakan berukuran &plusmn; 36m&sup2; bersama {mustahik.family_dependents || 3} orang anggota keluarga. Kondisi bangunan sederhana dan cukup bersih.
                    </p>
                    <p>
                      <strong>2. Kondisi Ekonomi:</strong> Kepala keluarga berpenghasilan tidak tetap ({formatRupiah(mustahik.monthly_income || 1200000)}/bulan), sementara biaya hidup dan kebutuhan mendesak mencapai {formatRupiah(mustahik.monthly_expense || 1800000)}/bulan.
                    </p>
                    <p>
                      <strong>3. Kesimpulan & Rekomendasi:</strong> Pemohon <strong>MEMENUHI SYARAT ASNAF ({asnaf.toUpperCase()})</strong> dan direkomendasikan untuk menerima bantuan program <strong>{program}</strong> sebesar <strong>{formatRupiah(nominal)}</strong> ({angkaKeTerbilang(nominal)}).
                    </p>
                  </div>
                </div>

                {/* Bagian IV: Lembar Tanda Tangan */}
                <div className="pt-4 font-sans">
                  <div className="flex justify-between text-center text-[11px]">
                    <div className="w-56">
                      <p className="text-slate-600">Kota Tangerang, {dateStr}</p>
                      <p className="font-semibold text-slate-800 mt-0.5">Petugas Surveyor / Assessment,</p>
                      <div className="h-16 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 italic">[Tanda Tangan & Nama]</span>
                      </div>
                      <p className="font-bold text-slate-900 underline">Ahmad Fauzi, S.Sos</p>
                      <p className="text-[10px] text-slate-600">NIP. BAZ-TNG-202401</p>
                    </div>

                    <div className="w-56">
                      <p className="text-slate-600">Mengetahui & Menyetujui,</p>
                      <p className="font-semibold text-slate-800 mt-0.5">Wakil Ketua II (Pendistribusian),</p>
                      <div className="h-16 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 italic">[Stempel & Tanda Tangan]</span>
                      </div>
                      <p className="font-bold text-slate-900 underline">Drs. H. Ahmad Subhan, M.Si</p>
                      <p className="text-[10px] text-slate-600">BAZNAS Kota Tangerang</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* DOKUMEN 2: FORMULIR F-BPP/06 (MPZIS - MEMORANDUM)         */}
            {/* ========================================================= */}
            {activeDoc === 'fbpp06' && (
              <div className="space-y-4">
                {/* Kop Surat BAZNAS */}
                <div className="flex items-center justify-between border-b-2 border-emerald-900 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-700 flex items-center justify-center font-bold text-emerald-800 text-lg bg-emerald-50">
                      BAZNAS
                    </div>
                    <div>
                      <h1 className="text-base sm:text-lg font-bold tracking-tight text-emerald-900 leading-tight">
                        BADAN AMIL ZAKAT NASIONAL (BAZNAS)
                      </h1>
                      <h2 className="text-sm sm:text-base font-bold text-slate-800">
                        KOTA TANGERANG
                      </h2>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-tight font-sans">
                        Gedung MUI Lt. 2, Jl. Satria Sudirman No. 1, Kota Tangerang &bull; Telp. (021) 5573-2020
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 border border-slate-400 p-1.5 rounded text-[10px] font-sans bg-slate-50">
                    <span className="font-bold text-slate-800 block">Kode Form:</span>
                    <span className="font-extrabold text-emerald-800 text-xs">F-BPP/06</span>
                  </div>
                </div>

                {/* Judul Memorandum */}
                <div className="text-center pt-2 pb-1">
                  <h3 className="text-sm sm:text-base font-extrabold underline tracking-wide uppercase text-slate-900">
                    MEMORANDUM PENYALURAN ZIS (MPZIS)
                  </h3>
                  <p className="text-[11px] font-sans text-slate-600 mt-0.5">
                    Nomor Memorandum: <strong className="text-black">MPZIS/BT/2026/{fileNo.replace(/\D/g, '') || '042'}</strong>
                  </p>
                </div>

                {/* Rincian Memorandum */}
                <div className="font-sans text-[11px] space-y-2 border border-slate-300 p-3 rounded bg-white">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="w-48 py-1.5 font-semibold text-slate-700">1. Tanggal Memorandum</td>
                        <td className="w-4 py-1.5 text-center">:</td>
                        <td className="py-1.5 font-medium">{dateStr}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">2. Klasifikasi Program BAZNAS</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5 font-bold text-emerald-900">{program} &mdash; {subProgram}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">3. Golongan Asnaf / Kategori</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5 font-semibold">{asnaf} (Delapan Asnaf QS. At-Taubah: 60)</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">4. Sumber Alokasi Dana</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5">{mustahik.fund_source || 'Dana Zakat Maal / Zakat Profesi ASN Kota Tangerang'}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">5. Nama Penerima Manfaat</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5 font-bold text-slate-900">{name} (NIK: {nik})</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">6. Alamat Penerima</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5">{address}, Kel. {kelurahan}, Kec. {kecamatan}, Kota Tangerang</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">7. Maksud & Tujuan Penyaluran</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5">{requestTitle}</td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-emerald-50/60">
                        <td className="py-2 font-bold text-emerald-950">8. Jumlah Nominal Bantuan</td>
                        <td className="py-2 text-center font-bold">:</td>
                        <td className="py-2 font-extrabold text-emerald-900 text-sm">{formatRupiah(nominal)}</td>
                      </tr>
                      <tr className="bg-emerald-50/60">
                        <td className="py-1.5 font-bold text-emerald-950">9. Terbilang</td>
                        <td className="py-1.5 text-center font-bold">:</td>
                        <td className="py-1.5 italic font-bold text-emerald-900">"{angkaKeTerbilang(nominal)}"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Lembar Pengesahan Komite Pendayagunaan */}
                <div className="font-sans pt-2">
                  <p className="text-[11px] font-bold text-slate-800 uppercase mb-2 text-center tracking-wider">
                    LEMBAR PENGESAHAN KOMITE PENDISTRIBUSIAN & PENDAYAGUNAAN
                  </p>
                  
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] border border-slate-400 p-2 rounded bg-slate-50">
                    <div className="border-r border-slate-300 pr-1">
                      <p className="font-semibold text-slate-700">Diusulkan Oleh:</p>
                      <p className="text-[9px] text-slate-500">Staf Pendistribusian</p>
                      <div className="h-12 flex items-center justify-center text-slate-400 italic">[TTD]</div>
                      <p className="font-bold underline text-slate-900">Rizki Ramadhan</p>
                    </div>

                    <div className="border-r border-slate-300 pr-1">
                      <p className="font-semibold text-slate-700">Diteliti Oleh:</p>
                      <p className="text-[9px] text-slate-500">Kabag Pendistribusian</p>
                      <div className="h-12 flex items-center justify-center text-slate-400 italic">[TTD]</div>
                      <p className="font-bold underline text-slate-900">H. Maulana Hasan, S.Pd</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-700">Verifikator Asnaf:</p>
                      <p className="text-[9px] text-slate-500">Komisi Syariah BAZNAS</p>
                      <div className="h-12 flex items-center justify-center text-slate-400 italic">[TTD]</div>
                      <p className="font-bold underline text-slate-900">K.H. Baihaqi Ridwan, Lc</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-center text-[10.5px] mt-3">
                    <div>
                      <p className="font-semibold text-slate-700">Penanggung Jawab (Waka II),</p>
                      <div className="h-14 flex items-center justify-center text-slate-400 italic">[TTD & Cap]</div>
                      <p className="font-bold underline text-slate-900">Drs. H. Ahmad Subhan, M.Si</p>
                      <p className="text-[9.5px] text-slate-500">Wakil Ketua II BAZNAS Kota Tangerang</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-700">Disetujui Oleh (Ketua),</p>
                      <div className="h-14 flex items-center justify-center text-slate-400 italic">[TTD & Cap Resmi]</div>
                      <p className="font-bold underline text-slate-900">K.H. M. Aslie Elhusyairy, S.Ag</p>
                      <p className="text-[9.5px] text-slate-500">Ketua BAZNAS Kota Tangerang</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* DOKUMEN 3: FORMULIR F-PKP/03 (PPD - PENCAIRAN DANA & RAB) */}
            {/* ========================================================= */}
            {activeDoc === 'fpkp03' && (
              <div className="space-y-4">
                {/* Kop Surat BAZNAS */}
                <div className="flex items-center justify-between border-b-2 border-emerald-900 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-full border-2 border-emerald-700 flex items-center justify-center font-bold text-emerald-800 text-lg bg-emerald-50">
                      BAZNAS
                    </div>
                    <div>
                      <h1 className="text-base sm:text-lg font-bold tracking-tight text-emerald-900 leading-tight">
                        BADAN AMIL ZAKAT NASIONAL (BAZNAS)
                      </h1>
                      <h2 className="text-sm sm:text-base font-bold text-slate-800">
                        KOTA TANGERANG
                      </h2>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-tight font-sans">
                        Bidang Perencanaan, Keuangan, dan Pelaporan &bull; Telp. (021) 5573-2020
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 border border-slate-400 p-1.5 rounded text-[10px] font-sans bg-slate-50">
                    <span className="font-bold text-slate-800 block">Kode Form:</span>
                    <span className="font-extrabold text-emerald-800 text-xs">F-PKP/03</span>
                  </div>
                </div>

                {/* Judul PPD */}
                <div className="text-center pt-2 pb-1">
                  <h3 className="text-sm sm:text-base font-extrabold underline tracking-wide uppercase text-slate-900">
                    PERMOHONAN PENCAIRAN DANA (PPD)
                  </h3>
                  <p className="text-[11px] font-sans text-slate-600 mt-0.5">
                    Nomor PPD: <strong className="text-black">045.2/B-KT/VIII/2026</strong>
                  </p>
                </div>

                {/* Data Form PPD */}
                <div className="font-sans text-[11px] space-y-2 border border-slate-300 p-3 rounded bg-white">
                  <table className="w-full border-collapse">
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="w-48 py-1.5 font-semibold text-slate-700">1. Bidang / Divisi Pemohon</td>
                        <td className="w-4 py-1.5 text-center">:</td>
                        <td className="py-1.5 font-medium">Bidang Pendistribusian dan Pendayagunaan ZIS</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">2. Dasar Pengajuan (MPZIS)</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5">Memorandum Penyaluran No. MPZIS/BT/2026/{fileNo.replace(/\D/g, '') || '042'}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">3. Keperluan / Rincian Program</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5 font-medium">Penyaluran Bantuan {program} ({subProgram}) an. {name}</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-1.5 font-semibold text-slate-700">4. Metode Pembayaran</td>
                        <td className="py-1.5 text-center">:</td>
                        <td className="py-1.5 font-bold text-slate-900">
                          {mustahik.payment_method || 'Transfer Bank'} &mdash; {bankName} (Rek. {bankAccount} a.n {bankAccountName})
                        </td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-emerald-50/60">
                        <td className="py-2 font-bold text-emerald-950">5. Total Dana Dimohon</td>
                        <td className="py-2 text-center font-bold">:</td>
                        <td className="py-2 font-extrabold text-emerald-900 text-sm">{formatRupiah(nominal)}</td>
                      </tr>
                      <tr className="bg-emerald-50/60">
                        <td className="py-1.5 font-bold text-emerald-950">6. Terbilang</td>
                        <td className="py-1.5 text-center font-bold">:</td>
                        <td className="py-1.5 italic font-bold text-emerald-900">"{angkaKeTerbilang(nominal)}"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Tabel Lampiran RAB */}
                <div className="space-y-1 font-sans pt-1">
                  <div className="bg-emerald-800 text-white text-xs font-bold px-2 py-1 rounded-xs uppercase tracking-wider">
                    LAMPIRAN RENCANA ANGGARAN BIAYA (RAB) PENYALURAN
                  </div>
                  <table className="w-full text-[10.5px] border border-slate-400 border-collapse mt-1 text-center">
                    <thead>
                      <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-400">
                        <th className="border-r border-slate-400 py-1.5 px-2">No</th>
                        <th className="border-r border-slate-400 py-1.5 px-3 text-left">Komponen / Item Penyaluran BAZNAS</th>
                        <th className="border-r border-slate-400 py-1.5 px-2">Vol</th>
                        <th className="border-r border-slate-400 py-1.5 px-2">Satuan</th>
                        <th className="border-r border-slate-400 py-1.5 px-3 text-right">Biaya Satuan (Rp)</th>
                        <th className="py-1.5 px-3 text-right">Total Jumlah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      <tr>
                        <td className="border-r border-slate-300 py-1.5">1</td>
                        <td className="border-r border-slate-300 py-1.5 px-3 text-left font-semibold">
                          Bantuan Langsung Program {program} ({subProgram})
                        </td>
                        <td className="border-r border-slate-300 py-1.5">1</td>
                        <td className="border-r border-slate-300 py-1.5">Paket</td>
                        <td className="border-r border-slate-300 py-1.5 px-3 text-right">{formatRupiah(nominal)}</td>
                        <td className="py-1.5 px-3 text-right font-bold">{formatRupiah(nominal)}</td>
                      </tr>
                      <tr className="bg-emerald-50/50 font-bold border-t border-slate-400">
                        <td colSpan={5} className="border-r border-slate-300 py-1.5 px-3 text-right">TOTAL PENCAIRAN DANA PPD :</td>
                        <td className="py-1.5 px-3 text-right text-emerald-900 text-xs">{formatRupiah(nominal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Lembar Tanda Tangan PPD */}
                <div className="grid grid-cols-3 gap-2 text-center text-[10.5px] font-sans pt-3">
                  <div>
                    <p className="font-semibold text-slate-700">Diajukan Oleh,</p>
                    <p className="text-[9.5px] text-slate-500">Kabag Pendistribusian</p>
                    <div className="h-14 flex items-center justify-center text-slate-400 italic">[TTD]</div>
                    <p className="font-bold underline text-slate-900">H. Maulana Hasan, S.Pd</p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700">Diverifikasi Oleh,</p>
                    <p className="text-[9.5px] text-slate-500">Kabag Keuangan BAZNAS</p>
                    <div className="h-14 flex items-center justify-center text-slate-400 italic">[TTD]</div>
                    <p className="font-bold underline text-slate-900">Hj. Siti Rohmah, S.E</p>
                  </div>

                  <div>
                    <p className="font-semibold text-slate-700">Disetujui Oleh,</p>
                    <p className="text-[9.5px] text-slate-500">Ketua BAZNAS Kota Tangerang</p>
                    <div className="h-14 flex items-center justify-center text-slate-400 italic">[TTD & Cap Resmi]</div>
                    <p className="font-bold underline text-slate-900">K.H. M. Aslie Elhusyairy, S.Ag</p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer Info - Hidden when Printing */}
        <div className="px-6 py-3 bg-muted/40 border-t border-border flex items-center justify-between text-xs text-muted-foreground print:hidden shrink-0">
          <span>&bull; Dokumen ini dibuat otomatis sesuai SOP Standar BAZNAS Kota Tangerang</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs font-semibold">
            Tutup Preview
          </Button>
        </div>

      </div>
    </div>
  );
}
