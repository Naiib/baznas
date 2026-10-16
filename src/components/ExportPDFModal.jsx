import { useState, useRef } from 'react';
import {
  Printer,
  FileText,
  Download,
  X,
  Building2,
  Calendar,
  Filter,
  CheckCircle2,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatRupiah } from '../utils/format';
import baznasLogo from '@/assets/baznas-logo.png';
import { getFormattedDate, getHijriDate } from '../data/dashboardData';

export default function ExportPDFModal({ isOpen, onClose, currentUser = null }) {
  const [reportType, setReportType] = useState('penyaluran'); // 'penyaluran' | 'penerimaan' | 'keuangan' | 'mustahik_master'
  const [period, setPeriod] = useState('Bulan Ini (Agustus 2026)');
  const [format, setFormat] = useState('a4'); // 'a4' | 'folio'
  const [signatureRole, setSignatureRole] = useState('Kabid Penyaluran & Pendistribusian');
  const printRef = useRef(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const currentDate = getFormattedDate();
  const currentHijri = getHijriDate();
  const signatoryName = currentUser?.name || 'H. Rahmat Hidayat, S.Sos.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden print:border-none print:shadow-none print:max-h-none print:w-full">
        
        {/* Modal Header (Hidden when printing) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Pusat Cetak & Export Laporan PDF Resmi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                BAZNAS Kota Tangerang - Standar Format Akuntabilitas & Audit
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-8.5 px-3.5 rounded-xl shadow-xs cursor-pointer"
            >
              <Printer className="size-4" />
              <span>Cetak / Simpan PDF</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8.5 w-8.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Configuration Bar (Hidden when printing) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 print:hidden text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              Jenis Laporan:
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full h-8 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
            >
              <option value="penyaluran">Laporan Penyaluran & Distribusi Mustahik</option>
              <option value="mustahik_master">Rekapitulasi Master Data Mustahik (60 Kolom)</option>
              <option value="penerimaan">Laporan Penerimaan ZIS & UPZ</option>
              <option value="keuangan">Laporan Realisasi RKAT & Keuangan PSAK 109</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              Periode Laporan:
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full h-8 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
            >
              <option value="Bulan Ini (Agustus 2026)">Bulan Ini (Agustus 2026)</option>
              <option value="Triwulan III (Jul - Sep 2026)">Triwulan III (Jul - Sep 2026)</option>
              <option value="Semester I (Jan - Jun 2026)">Semester I (Jan - Jun 2026)</option>
              <option value="Tahun Berjalan 2026">Tahun Berjalan 2026</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
              Pejabat Pengesah / TTD:
            </label>
            <select
              value={signatureRole}
              onChange={(e) => setSignatureRole(e.target.value)}
              className="w-full h-8 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-semibold"
            >
              <option value="Kabid Penyaluran & Pendistribusian">Kabid Penyaluran & Pendistribusian</option>
              <option value="Ketua BAZNAS Kota Tangerang">Ketua BAZNAS Kota Tangerang</option>
              <option value="Wakil Ketua II (Bidang Pendistribusian)">Wakil Ketua II (Bidang Pendistribusian)</option>
              <option value="Bendahara BAZNAS">Bendahara BAZNAS</option>
            </select>
          </div>
        </div>

        {/* Printable Document Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-950/80 print:p-0 print:bg-white print:overflow-visible">
          <div
            ref={printRef}
            className="w-full max-w-[210mm] mx-auto bg-white text-slate-900 p-8 sm:p-12 shadow-lg rounded-xl print:shadow-none print:rounded-none print:p-0 border border-slate-200 print:border-none min-h-[297mm] flex flex-col justify-between"
          >
            
            {/* Header Kop Surat Resmi BAZNAS */}
            <div>
              <div className="flex items-center justify-between border-b-2 border-emerald-800 pb-3 mb-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={baznasLogo}
                    alt="BAZNAS Logo"
                    className="h-16 w-auto object-contain"
                  />
                  <div>
                    <h1 className="text-lg font-black tracking-tight text-emerald-950 uppercase leading-none">
                      BADAN AMIL ZAKAT NASIONAL
                    </h1>
                    <h2 className="text-sm font-extrabold text-emerald-800 uppercase tracking-wide leading-tight">
                      KOTA TANGERANG
                    </h2>
                    <p className="text-[10px] text-slate-600 leading-tight mt-0.5">
                      Gedung MUI Kota Tangerang Lt. 2, Jl. Satria Sudirman No. 1, Kota Tangerang 15111
                    </p>
                    <p className="text-[9.5px] text-slate-500 leading-tight">
                      Telp: (021) 5576-8899 | Email: baznaskota.tangerang@baznas.go.id | Web: baznas.tangerangkota.go.id
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 text-[9px] font-black tracking-wider uppercase bg-emerald-100 text-emerald-900 border border-emerald-300 rounded">
                    DOKUMEN RESMI
                  </span>
                  <p className="text-[10px] text-slate-500 mt-1">No: BAZNAS-TNG/LPJ/2026/08</p>
                </div>
              </div>

              {/* Document Title */}
              <div className="text-center my-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  {reportType === 'penyaluran' && 'LAPORAN REKAPITULASI PENYALURAN DANA ZIS & PROGRAM BANTUAN'}
                  {reportType === 'mustahik_master' && 'REKAPITULASI MASTER DATABASE MUSTAHIK & PENERIMA MANFAAT'}
                  {reportType === 'penerimaan' && 'LAPORAN REKAPITULASI PENERIMAAN ZAKAT, INFAQ & SEDEKAH (ZIS)'}
                  {reportType === 'keuangan' && 'LAPORAN POSISI KEUANGAN & REALISASI ANGGARAN (RKAT 2026)'}
                </h3>
                <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                  Periode: {period}
                </p>
              </div>

              {/* Dynamic Content Tables */}
              {reportType === 'penyaluran' && (
                <div className="space-y-4 my-4">
                  {/* Summary Metric Box */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Total Tersalurkan</p>
                      <p className="text-xs font-black text-emerald-700">{formatRupiah(1890000000)}</p>
                    </div>
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Total Penerima</p>
                      <p className="text-xs font-black text-slate-800">5.678 Mustahik</p>
                    </div>
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Program Aktif</p>
                      <p className="text-xs font-black text-slate-800">5 Pilar Program</p>
                    </div>
                    <div className="p-2 border border-slate-200 rounded-lg bg-slate-50">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Tingkat Realisasi</p>
                      <p className="text-xs font-black text-blue-700">92,4%</p>
                    </div>
                  </div>

                  {/* 5 Pilar Breakdown Table */}
                  <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-emerald-800 text-white font-bold text-center">
                        <th className="border border-slate-300 p-1.5 w-8">No</th>
                        <th className="border border-slate-300 p-1.5 text-left">Pilar Program BAZNAS</th>
                        <th className="border border-slate-300 p-1.5">Pagu RKAT</th>
                        <th className="border border-slate-300 p-1.5">Realisasi</th>
                        <th className="border border-slate-300 p-1.5">Penerima</th>
                        <th className="border border-slate-300 p-1.5 w-16">Capaian</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">1</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Tangerang Cerdas (Pendidikan)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(600000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(560000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">1.450 Jiwa</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">93.3%</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">2</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Tangerang Sehat (Kesehatan)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(450000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(425000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">980 Jiwa</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">94.4%</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">3</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Tangerang Peduli (Kemanusiaan)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(400000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(380000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">1.820 Jiwa</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">95.0%</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">4</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Tangerang Makmur (Ekonomi/UMKM)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(350000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(310000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">640 Jiwa</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">88.6%</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">5</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Tangerang Takwa (Dakwah & Advokasi)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(250000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(215000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">788 Jiwa</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">86.0%</td>
                      </tr>
                      <tr className="bg-emerald-50 font-black">
                        <td colSpan={2} className="border border-slate-300 p-2 text-center uppercase">TOTAL REALISASI</td>
                        <td className="border border-slate-300 p-2 text-right">{formatRupiah(2050000000)}</td>
                        <td className="border border-slate-300 p-2 text-right text-emerald-800">{formatRupiah(1890000000)}</td>
                        <td className="border border-slate-300 p-2 text-center">5.678 Mustahik</td>
                        <td className="border border-slate-300 p-2 text-center text-emerald-800">92.2%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {reportType === 'mustahik_master' && (
                <div className="space-y-3 my-4">
                  <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-emerald-800 text-white font-bold text-center">
                        <th className="border border-slate-300 p-1 w-7">No</th>
                        <th className="border border-slate-300 p-1 text-left">Nama Lengkap & NIK</th>
                        <th className="border border-slate-300 p-1">Asnaf</th>
                        <th className="border border-slate-300 p-1">Kecamatan</th>
                        <th className="border border-slate-300 p-1">Program</th>
                        <th className="border border-slate-300 p-1">Bantuan Disetujui</th>
                        <th className="border border-slate-300 p-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-1 text-center">1</td>
                        <td className="border border-slate-300 p-1"><span className="font-bold">Ahmad Fauzi</span><br/><span className="text-[8.5px] text-slate-500">NIK: 3671012304890001</span></td>
                        <td className="border border-slate-300 p-1 text-center">Fakir</td>
                        <td className="border border-slate-300 p-1">Tangerang</td>
                        <td className="border border-slate-300 p-1">Pendidikan</td>
                        <td className="border border-slate-300 p-1 text-right font-bold text-emerald-700">{formatRupiah(1500000)}</td>
                        <td className="border border-slate-300 p-1 text-center font-semibold text-emerald-700">Penyaluran Selesai</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1 text-center">2</td>
                        <td className="border border-slate-300 p-1"><span className="font-bold">Siti Aminah</span><br/><span className="text-[8.5px] text-slate-500">NIK: 3671025508910003</span></td>
                        <td className="border border-slate-300 p-1 text-center">Miskin</td>
                        <td className="border border-slate-300 p-1">Cipondoh</td>
                        <td className="border border-slate-300 p-1">Kesehatan</td>
                        <td className="border border-slate-300 p-1 text-right font-bold text-emerald-700">{formatRupiah(2000000)}</td>
                        <td className="border border-slate-300 p-1 text-center font-semibold text-emerald-700">Penyaluran Selesai</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1 text-center">3</td>
                        <td className="border border-slate-300 p-1"><span className="font-bold">Bambang Sugiarto</span><br/><span className="text-[8.5px] text-slate-500">NIK: 3671031102850002</span></td>
                        <td className="border border-slate-300 p-1 text-center">Miskin</td>
                        <td className="border border-slate-300 p-1">Karawaci</td>
                        <td className="border border-slate-300 p-1">Ekonomi UMKM</td>
                        <td className="border border-slate-300 p-1 text-right font-bold text-emerald-700">{formatRupiah(3000000)}</td>
                        <td className="border border-slate-300 p-1 text-center font-semibold text-amber-700">Tahap MPZIS</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1 text-center">4</td>
                        <td className="border border-slate-300 p-1"><span className="font-bold">Nurhayati</span><br/><span className="text-[8.5px] text-slate-500">NIK: 3671044406930004</span></td>
                        <td className="border border-slate-300 p-1 text-center">Gharimin</td>
                        <td className="border border-slate-300 p-1">Pinang</td>
                        <td className="border border-slate-300 p-1">Kemanusiaan</td>
                        <td className="border border-slate-300 p-1 text-right font-bold text-emerald-700">{formatRupiah(1800000)}</td>
                        <td className="border border-slate-300 p-1 text-center font-semibold text-blue-700">Verifikasi Berkas</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[9px] text-slate-500 italic text-right">
                    * Menampilkan cuplikan data terdaftar pada sistem SIMBA BAZNAS Kota Tangerang
                  </p>
                </div>
              )}

              {reportType === 'penerimaan' && (
                <div className="space-y-4 my-4">
                  <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-emerald-800 text-white font-bold text-center">
                        <th className="border border-slate-300 p-1.5 w-8">No</th>
                        <th className="border border-slate-300 p-1.5 text-left">Sumber Penerimaan</th>
                        <th className="border border-slate-300 p-1.5">Target RKAT</th>
                        <th className="border border-slate-300 p-1.5">Realisasi Masuk</th>
                        <th className="border border-slate-300 p-1.5">Muzakki/UPZ</th>
                        <th className="border border-slate-300 p-1.5 w-16">Capaian</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">1</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Zakat Maal (Individu & Badan)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(1400000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(1520000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">1.240 Muzakki</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">108.5%</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">2</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Zakat Fitrah</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(500000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(530000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">14.500 Muzakki</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">106.0%</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">3</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Infaq, Sedekah & DSKL</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(350000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-semibold text-emerald-700">{formatRupiah(400000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-center">3.120 Donatur</td>
                        <td className="border border-slate-300 p-1.5 text-center font-bold">114.2%</td>
                      </tr>
                      <tr className="bg-emerald-50 font-black">
                        <td colSpan={2} className="border border-slate-300 p-2 text-center uppercase">TOTAL PENERIMAAN</td>
                        <td className="border border-slate-300 p-2 text-right">{formatRupiah(2250000000)}</td>
                        <td className="border border-slate-300 p-2 text-right text-emerald-800">{formatRupiah(2450000000)}</td>
                        <td className="border border-slate-300 p-2 text-center">18.860 Transaksi</td>
                        <td className="border border-slate-300 p-2 text-center text-emerald-800">108.8%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {reportType === 'keuangan' && (
                <div className="space-y-4 my-4">
                  <table className="w-full text-left text-[11px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-emerald-800 text-white font-bold text-center">
                        <th className="border border-slate-300 p-1.5 w-8">No</th>
                        <th className="border border-slate-300 p-1.5 text-left">Komponen Keuangan PSAK 109</th>
                        <th className="border border-slate-300 p-1.5">Saldo Awal</th>
                        <th className="border border-slate-300 p-1.5">Penerimaan</th>
                        <th className="border border-slate-300 p-1.5">Penyaluran</th>
                        <th className="border border-slate-300 p-1.5">Saldo Akhir</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-300 p-1.5 text-center">1</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Dana Zakat (Zakat Maal & Fitrah)</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(450000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right text-emerald-700">{formatRupiah(2050000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right text-rose-700">{formatRupiah(1650000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-black">{formatRupiah(850000000)}</td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">2</td>
                        <td className="border border-slate-300 p-1.5 font-bold">Dana Infaq & Sedekah Terikat / Tidak Terikat</td>
                        <td className="border border-slate-300 p-1.5 text-right">{formatRupiah(180000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right text-emerald-700">{formatRupiah(400000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right text-rose-700">{formatRupiah(240000000)}</td>
                        <td className="border border-slate-300 p-1.5 text-right font-black">{formatRupiah(340000000)}</td>
                      </tr>
                      <tr className="bg-emerald-50 font-black">
                        <td colSpan={2} className="border border-slate-300 p-2 text-center uppercase">TOTAL POSISI KEUANGAN</td>
                        <td className="border border-slate-300 p-2 text-right">{formatRupiah(630000000)}</td>
                        <td className="border border-slate-300 p-2 text-right text-emerald-800">{formatRupiah(2450000000)}</td>
                        <td className="border border-slate-300 p-2 text-right text-rose-800">{formatRupiah(1890000000)}</td>
                        <td className="border border-slate-300 p-2 text-right text-emerald-900">{formatRupiah(1190000000)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Signature Area (KOP Resmi Tanda Tangan) */}
            <div className="mt-8 pt-4 border-t border-slate-200">
              <div className="flex justify-between items-end text-xs">
                <div className="text-center w-56">
                  <p className="text-[10px] text-slate-500">Mengetahui,</p>
                  <p className="font-bold text-slate-800">Ketua BAZNAS Kota Tangerang</p>
                  <div className="h-16 flex items-center justify-center">
                    <span className="text-[9px] text-slate-400 italic">[ Tanda Tangan Resmi & Stempel ]</span>
                  </div>
                  <p className="font-bold underline text-slate-900">Drs. H. M. Aslie Elhusyairy, M.Ag.</p>
                  <p className="text-[9.5px] text-slate-500">NIK Amil: 3671.01.2019.001</p>
                </div>

                <div className="text-center w-56">
                  <p className="text-[10px] text-slate-600">Kota Tangerang, {currentDate}</p>
                  <p className="text-[9.5px] text-emerald-800 font-semibold">{currentHijri}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{signatureRole}</p>
                  <div className="h-14 flex items-center justify-center">
                    <span className="text-[9px] text-slate-400 italic">[ Tanda Tangan Pengesah ]</span>
                  </div>
                  <p className="font-bold underline text-slate-900">{signatoryName}</p>
                  <p className="text-[9.5px] text-slate-500">NIK Amil: 3671.04.2021.014</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
