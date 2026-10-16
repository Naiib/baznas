import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Search,
  Download,
  Filter,
  CheckCircle2,
  X,
  Calendar,
  Layers,
  FileSpreadsheet,
  Loader2,
  Printer,
  DollarSign,
  Users,
  TrendingUp,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { PENYALURAN_TRANSACTIONS } from '../data/penerimaanData';
import { formatRupiah } from '../utils/format';

const PILAR_OPTIONS = [
  'Semua',
  'Tangerang Cerdas',
  'Tangerang Sehat',
  'Tangerang Peduli',
  'Tangerang Makmur',
  'Tangerang Takwa',
];

const ASNAF_OPTIONS = [
  'Semua',
  'Fakir',
  'Miskin',
  'Fisabilillah',
  'Mualaf',
  'Gharimin',
  'Ibnu Sabil',
  'Amil',
];

export default function LaporanPenyaluranPage() {
  const [transactions] = useState(PENYALURAN_TRANSACTIONS);

  // Filter states
  const [startDate, setStartDate] = useState('2026-07-01');
  const [endDate, setEndDate] = useState('2026-07-31');
  const [filterProgram, setFilterProgram] = useState('Semua');
  const [filterAsnaf, setFilterAsnaf] = useState('Semua');
  const [searchTerm, setSearchTerm] = useState('');

  // Toast notification state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isExporting, setIsExporting] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Preset Date Handlers
  const handleSetPreset = (preset) => {
    if (preset === 'juli') {
      setStartDate('2026-07-01');
      setEndDate('2026-07-31');
    } else if (preset === 'agustus') {
      setStartDate('2026-08-01');
      setEndDate('2026-08-31');
    } else if (preset === 'q2') {
      setStartDate('2026-04-01');
      setEndDate('2026-06-30');
    } else if (preset === 'ytd') {
      setStartDate('2026-01-01');
      setEndDate('2026-08-31');
    }
  };

  // Perform dynamic filtering
  const filteredTransactions = useMemo(() => {
    return transactions.filter((trx) => {
      const trxDate = new Date(trx.date);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      const matchStart = !start || trxDate >= start;
      const matchEnd = !end || trxDate <= end;
      const matchProgram = filterProgram === 'Semua' || trx.program.includes(filterProgram.replace('Tangerang ', ''));
      const matchAsnaf = filterAsnaf === 'Semua' || trx.asnaf === filterAsnaf;
      const matchSearch =
        !searchTerm ||
        trx.mustahik.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.asnaf.toLowerCase().includes(searchTerm.toLowerCase());

      return matchStart && matchEnd && matchProgram && matchAsnaf && matchSearch;
    });
  }, [transactions, startDate, endDate, filterProgram, filterAsnaf, searchTerm]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalAmount = filteredTransactions.reduce((sum, trx) => sum + trx.amount, 0);
    const countMustahik = filteredTransactions.length;
    const avgAid = countMustahik > 0 ? Math.round(totalAmount / countMustahik) : 0;
    return { totalAmount, countMustahik, avgAid };
  }, [filteredTransactions]);

  const handleExport = (format) => {
    setIsExporting(format);
    showToast(`Sedang menyiapkan berkas laporan penyaluran dalam format ${format.toUpperCase()}...`);
    setTimeout(() => {
      showToast(`Berkas Laporan_Penyaluran_${startDate}_to_${endDate}.${format} berhasil diunduh!`, 'success');
      setIsExporting(null);
    }, 1200);
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-4 sm:space-y-5 lg:space-y-6 relative">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 bg-card border border-border shadow-2xl rounded-xl p-3.5 sm:p-4 animate-fade-in pr-10 min-w-[300px] max-w-md">
          <CheckCircle2 className={`size-5 shrink-0 ${toast.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`} />
          <div className="text-xs">
            <p className="font-bold text-foreground">
              {toast.type === 'success' ? 'Berhasil' : 'Pemberitahuan'}
            </p>
            <p className="text-muted-foreground">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast((prev) => ({ ...prev, show: false }))}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              <FileText className="size-6 text-emerald-600 shrink-0" />
              Laporan Penyaluran & Rekapitulasi ZIS
            </h1>
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[11px] font-bold">
              Standar Audit BAZNAS
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Saring rekapitulasi pembagian hak mustahik berdasarkan rentang waktu, 5 pilar program, dan 8 asnaf untuk pelaporan resmi RKAT serta bukti pertanggungjawaban (LPJ).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={isExporting !== null}
            className="h-8.5 text-xs bg-card hover:bg-muted text-foreground gap-1.5 border-border rounded-xl cursor-pointer"
            onClick={() => handleExport('xlsx')}
          >
            {isExporting === 'xlsx' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
            )}
            Ekspor Excel
          </Button>

          <Button
            size="sm"
            disabled={isExporting !== null}
            className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 rounded-xl shadow-2xs cursor-pointer px-3.5"
            onClick={() => handleExport('pdf')}
          >
            {isExporting === 'pdf' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Unduh PDF Resmi
          </Button>
        </div>
      </div>

      {/* 4 Executive Summary HUD Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-2xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <DollarSign className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Penyaluran</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground font-mono truncate">
                {formatRupiah(stats.totalAmount, true)}
              </h3>
              <p className="text-[10px] text-muted-foreground">Sesuai Kriteria Filter</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Mustahik Penerima</p>
              <h3 className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                {stats.countMustahik.toLocaleString('id-ID')} Jiwa
              </h3>
              <p className="text-[10px] text-emerald-600 font-semibold">Tersalurkan Tuntas</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Rata-rata Bantuan</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground font-mono">
                {formatRupiah(stats.avgAid, true)}
              </h3>
              <p className="text-[10px] text-muted-foreground">Per Penerima Manfaat</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Kepatuhan Syariah</p>
              <h3 className="text-lg sm:text-xl font-black text-teal-700 dark:text-teal-400">100%</h3>
              <p className="text-[10px] text-muted-foreground">8 Asnaf Terverifikasi</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Panel */}
      <Card className="shadow-2xs border-border rounded-xl">
        <CardHeader className="p-3.5 sm:p-4 pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
            <Filter className="size-4 text-emerald-600" /> Saring Rekapitulasi Penyaluran
          </CardTitle>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] text-muted-foreground font-medium shrink-0">Preset:</span>
            <Button size="xs" variant="outline" className="h-6.5 text-[10px] px-2 rounded-lg" onClick={() => handleSetPreset('juli')}>
              Juli 2026
            </Button>
            <Button size="xs" variant="outline" className="h-6.5 text-[10px] px-2 rounded-lg" onClick={() => handleSetPreset('agustus')}>
              Agustus 2026
            </Button>
            <Button size="xs" variant="outline" className="h-6.5 text-[10px] px-2 rounded-lg" onClick={() => handleSetPreset('q2')}>
              Triwulan 2
            </Button>
            <Button size="xs" variant="outline" className="h-6.5 text-[10px] px-2 rounded-lg" onClick={() => handleSetPreset('ytd')}>
              Tahun 2026
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tanggal Mulai</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8.5 pl-8 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tanggal Akhir</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8.5 pl-8 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pilar Program</label>
              <select
                value={filterProgram}
                onChange={(e) => setFilterProgram(e.target.value)}
                className="w-full h-8.5 text-xs rounded-lg border border-border bg-background px-3 text-foreground"
              >
                {PILAR_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Golongan Asnaf</label>
              <select
                value={filterAsnaf}
                onChange={(e) => setFilterAsnaf(e.target.value)}
                className="w-full h-8.5 text-xs rounded-lg border border-border bg-background px-3 text-foreground"
              >
                {ASNAF_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border/60">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari penerima manfaat (mustahik), deskripsi bantuan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8.5 pl-8 text-xs rounded-lg"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8.5 text-xs font-semibold px-3 rounded-lg"
              onClick={() => {
                setStartDate('2026-07-01');
                setEndDate('2026-07-31');
                setFilterProgram('Semua');
                setFilterAsnaf('Semua');
                setSearchTerm('');
                showToast('Filter pencarian berhasil direset.');
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Results Table */}
      <Card className="shadow-2xs border-border rounded-xl overflow-hidden">
        <CardHeader className="p-3.5 sm:p-4 pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xs sm:text-sm font-bold text-foreground">
              Rekapitulasi Transaksi Penyaluran
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              Menampilkan {filteredTransactions.length} transaksi ({formatRupiah(stats.totalAmount)})
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-xs space-y-2">
              <Search className="size-8 mx-auto text-muted-foreground/50" />
              <p className="font-bold text-foreground">Tidak Ada Data Penyaluran</p>
              <p>Coba sesuaikan rentang tanggal atau bersihkan saringan filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Penerima (Mustahik)</th>
                    <th className="px-4 py-3">Program Pilar</th>
                    <th className="px-4 py-3">Golongan Asnaf</th>
                    <th className="px-4 py-3 text-right">Nominal Disalurkan</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredTransactions.map((trx, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-muted-foreground text-[11px]">{trx.date}</td>
                      <td className="px-4 py-3 font-bold text-foreground">{trx.mustahik}</td>
                      <td className="px-4 py-3 text-muted-foreground">{trx.program}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {trx.asnaf}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-black font-mono text-foreground text-xs">
                        {formatRupiah(trx.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          {trx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
