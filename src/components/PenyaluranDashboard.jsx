import { useState, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Download,
  CheckCircle2,
  X,
  Users,
  TrendingUp,
  ArrowUpRight,
  Printer,
  Calendar,
  Layers,
  Sparkles,
  DollarSign,
  Compass,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Filter,
  FileText,
  FileSpreadsheet,
  Check,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  Award,
  Activity,
  HeartHandshake,
  BookOpen,
  Briefcase,
  HeartPulse,
  GraduationCap,
  Building2,
  MapPin,
  Clock,
  ArrowDownRight,
  Info,
  CheckCircle,
  FileCheck2,
  QrCode,
  Share2,
} from 'lucide-react';
import {
  PENYALURAN_METRICS,
  ASNAF_DISTRIBUTION,
  PENYALURAN_PROGRAMS,
  PENYALURAN_TRANSACTIONS,
  PENYALURAN_CHART_12M,
  PENERIMAAN_METRICS,
} from '../data/penerimaanData';
import { getGreeting, getFormattedDate, getHijriDate } from '../data/dashboardData';
import { formatRupiah, formatRupiahChart } from '../utils/format';

// 5 Pillar configuration with styling and descriptive metadata
const PILAR_CONFIG = {
  pendidikan: {
    id: 'pendidikan',
    name: 'Tangerang Cerdas',
    sub: 'Pendidikan & Beasiswa',
    color: '#2563eb',
    accentBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    icon: GraduationCap,
    target: 661_500_000_000,
    realized: 570_000_000_000,
    beneficiaries: 18_450,
    desc: 'Beasiswa dhuafa, santri tahfidz, bantuan seragam & perlengkapan sekolah.',
  },
  kesehatan: {
    id: 'kesehatan',
    name: 'Tangerang Sehat',
    sub: 'Layanan Medis & RTLH',
    color: '#059669',
    accentBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    icon: HeartPulse,
    target: 472_500_000_000,
    realized: 410_000_000_000,
    beneficiaries: 9_320,
    desc: 'Bantuan biaya RS, ambulans gratis mustahik, alat bantu disabilitas & sanitasi.',
  },
  sosial: {
    id: 'sosial',
    name: 'Tangerang Peduli',
    sub: 'Kemanusiaan & Bencana',
    color: '#e11d48',
    accentBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    icon: HeartHandshake,
    target: 378_000_000_000,
    realized: 330_000_000_000,
    beneficiaries: 24_600,
    desc: 'Tanggap darurat bencana, sembako lansia/dhuafa, santunan yatim piatu.',
  },
  ekonomi: {
    id: 'ekonomi',
    name: 'Tangerang Makmur',
    sub: 'Pemberdayaan UMKM',
    color: '#d97706',
    accentBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    icon: Briefcase,
    target: 226_800_000_000,
    realized: 180_000_000_000,
    beneficiaries: 4_850,
    desc: 'Modal usaha mikro bergulir, pelatihan vokasi, bantuan gerobak BAZNAS.',
  },
  dakwah: {
    id: 'dakwah',
    name: 'Tangerang Takwa',
    sub: 'Dakwah & Advokasi',
    color: '#7c3aed',
    accentBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    icon: BookOpen,
    target: 151_200_000_000,
    realized: 120_000_000_000,
    beneficiaries: 6_200,
    desc: 'Insentif guru ngaji, renovasi musholla/masjid pelosok, pembinaan mualaf.',
  },
};

// 13 Subdistricts of Kota Tangerang
const KECAMATAN_LIST = [
  'Batuceper',
  'Benda',
  'Cibodas',
  'Ciledug',
  'Cipondoh',
  'Jatiuwung',
  'Karang Tengah',
  'Karawaci',
  'Larangan',
  'Neglasari',
  'Periuk',
  'Pinang',
  'Tangerang',
];

// 5-Stage Pipeline Status Mock
const PIPELINE_SUMMARY = [
  { stage: '1. Pengajuan Masuk', count: 142, amount: 285_000_000, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
  { stage: '2. Verifikasi Adm', count: 98, amount: 210_000_000, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
  { stage: '3. Survey Lapangan', count: 64, amount: 155_000_000, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
  { stage: '4. Sidang MPZIS', count: 42, amount: 118_000_000, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40' },
  { stage: '5. Salur & Tuntas', count: 312, amount: 890_000_000, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
];

const PERIOD_OPTIONS = [
  { label: '12 Bulan', months: 12 },
  { label: '6 Bulan', months: 6 },
  { label: '3 Bulan', months: 3 },
];

// Helper: Convert number to Indonesian words (Terbilang)
function terbilangRupiah(num) {
  if (num === 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  
  function konversi(n) {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + ' Belas';
    if (n < 100) return konversi(Math.floor(n / 10)) + ' Puluh ' + konversi(n % 10);
    if (n < 200) return 'Seratus ' + konversi(n - 100);
    if (n < 1000) return konversi(Math.floor(n / 100)) + ' Ratus ' + konversi(n % 100);
    if (n < 2000) return 'Seribu ' + konversi(n - 1000);
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + ' Ribu ' + konversi(n % 1000);
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + ' Juta ' + konversi(n % 1000000);
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + ' Miliar ' + konversi(n % 1000000000);
    return konversi(Math.floor(n / 1000000000000)) + ' Triliun ' + konversi(n % 1000000000000);
  }
  
  return (konversi(Math.floor(num)) + ' Rupiah').replace(/\s+/g, ' ').trim();
}

export default function PenyaluranDashboard({ currentUser, onNavigate }) {
  let user = currentUser;
  if (!user && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('baznas_auth_user');
      if (stored) user = JSON.parse(stored);
    } catch (e) {}
  }
  const userName = user?.name || 'Amil Penyaluran';
  const userRole = user?.role || 'penyaluran';
  const greeting = getGreeting();
  const date = getFormattedDate();
  const hijri = getHijriDate();

  // Active View Tab
  const [activeTab, setActiveTab] = useState('ringkasan'); // 'ringkasan' | 'pilar' | 'asnaf' | 'buku_kas'

  // Period state
  const [periodIdx, setPeriodIdx] = useState(0);
  const monthsToShow = PERIOD_OPTIONS[periodIdx].months;
  const chartData = useMemo(() => PENYALURAN_CHART_12M.slice(-monthsToShow), [monthsToShow]);

  // Transactions state
  const [transactions, setTransactions] = useState(() => {
    return PENYALURAN_TRANSACTIONS.map((trx, idx) => ({
      id: `BPD-2026-${String(idx + 1).padStart(4, '0')}`,
      kecamatan: KECAMATAN_LIST[idx % KECAMATAN_LIST.length],
      metode: idx % 2 === 0 ? 'Transfer Bank Syariah' : 'Tunai Langsung',
      keterangan: `Realisasi bantuan program ${trx.program} bagi mustahik asnaf ${trx.asnaf}.`,
      ...trx,
    }));
  });

  // Sheets and Modals
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [selectedReceiptTrx, setSelectedReceiptTrx] = useState(null);
  const [isExporting, setIsExporting] = useState(null);

  // Form State
  const [formMustahik, setFormMustahik] = useState('');
  const [formProgram, setFormProgram] = useState('Tangerang Cerdas');
  const [formAsnaf, setFormAsnaf] = useState('Miskin');
  const [formKecamatan, setFormKecamatan] = useState('Tangerang');
  const [formMetode, setFormMetode] = useState('Transfer Bank Syariah');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  // Table Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('Semua');
  const [filterAsnaf, setFilterAsnaf] = useState('Semua');
  const [filterKecamatan, setFilterKecamatan] = useState('Semua');

  // Custom Toast State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Metrics Calculation
  const metrics = useMemo(() => {
    const extraAmount = transactions
      .slice(PENYALURAN_TRANSACTIONS.length)
      .reduce((sum, trx) => sum + trx.amount, 0);
    const totalPenyaluran = PENYALURAN_METRICS.totalPenyaluran + extraAmount;
    const balance = PENERIMAAN_METRICS.totalPenerimaan - totalPenyaluran;
    const target = PENYALURAN_METRICS.targetPenyaluran;
    const targetPct = ((totalPenyaluran / target) * 100).toFixed(1);

    return {
      totalPenyaluran,
      penyaluranBulanIni: PENYALURAN_METRICS.penyaluranBulanIni + extraAmount,
      targetPenyaluran: target,
      targetPct,
      totalMustahik: PENYALURAN_METRICS.totalMustahik + (transactions.length - PENYALURAN_TRANSACTIONS.length),
      efektivitasPenyaluran: PENYALURAN_METRICS.efektivitasPenyaluran,
      balance: balance > 0 ? balance : 0,
      totalTrxCount: transactions.length,
    };
  }, [transactions]);

  // Asnaf Distribution Calculation
  const totalByAsnaf = useMemo(() => {
    const baseObj = {
      Fakir: ASNAF_DISTRIBUTION[0].value,
      Miskin: ASNAF_DISTRIBUTION[1].value,
      Amil: ASNAF_DISTRIBUTION[2].value,
      Mualaf: ASNAF_DISTRIBUTION[3].value,
      Fisabilillah: ASNAF_DISTRIBUTION[4].value,
      'Ibnu Sabil & Lainnya': ASNAF_DISTRIBUTION[5].value,
    };

    transactions.slice(PENYALURAN_TRANSACTIONS.length).forEach((trx) => {
      const category = trx.asnaf === 'Ibnu Sabil' ? 'Ibnu Sabil & Lainnya' : trx.asnaf;
      if (baseObj[category] !== undefined) {
        baseObj[category] += trx.amount;
      } else {
        baseObj['Ibnu Sabil & Lainnya'] += trx.amount;
      }
    });

    return [
      { name: 'Fakir', value: baseObj['Fakir'], color: '#e11d48', pct: '30%' },
      { name: 'Miskin', value: baseObj['Miskin'], color: '#d97706', pct: '40%' },
      { name: 'Amil', value: baseObj['Amil'], color: '#2563eb', pct: '10%' },
      { name: 'Mualaf', value: baseObj['Mualaf'], color: '#0d9488', pct: '5%' },
      { name: 'Fisabilillah', value: baseObj['Fisabilillah'], color: '#059669', pct: '8%' },
      { name: 'Ibnu Sabil & Lainnya', value: baseObj['Ibnu Sabil & Lainnya'], color: '#64748b', pct: '7%' },
    ];
  }, [transactions]);

  const sumAsnafTotal = useMemo(() => {
    return totalByAsnaf.reduce((sum, item) => sum + item.value, 0);
  }, [totalByAsnaf]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((trx) => {
      const matchSearch =
        !searchTerm ||
        trx.mustahik.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.asnaf.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.kecamatan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trx.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchProgram = filterProgram === 'Semua' || trx.program.includes(filterProgram);
      const matchAsnaf = filterAsnaf === 'Semua' || trx.asnaf === filterAsnaf;
      const matchKecamatan = filterKecamatan === 'Semua' || trx.kecamatan === filterKecamatan;

      return matchSearch && matchProgram && matchAsnaf && matchKecamatan;
    });
  }, [transactions, searchTerm, filterProgram, filterAsnaf, filterKecamatan]);

  // Handle Add Transaction Submit
  const handleAddSubmit = (e) => {
    e.preventDefault();
    const numAmount = parseFloat(formAmount);
    if (!formMustahik.trim() || isNaN(numAmount) || numAmount <= 0) {
      showToast('Harap masukkan nama mustahik dan nominal bantuan yang sah!', 'error');
      return;
    }

    const newTrx = {
      id: `BPD-2026-${String(transactions.length + 1).padStart(4, '0')}`,
      date: formDate,
      mustahik: formMustahik.trim(),
      program: formProgram,
      amount: numAmount,
      status: 'Disalurkan',
      asnaf: formAsnaf,
      kecamatan: formKecamatan,
      metode: formMetode,
      keterangan: formNotes.trim() || `Realisasi bantuan ${formProgram} bagi ${formMustahik}.`,
    };

    setTransactions([newTrx, ...transactions]);
    setShowAddSheet(false);
    showToast(`Penyaluran ${formatRupiah(numAmount)} ke ${formMustahik} berhasil dicatat & masuk buku kas!`);

    // Reset
    setFormMustahik('');
    setFormAmount('');
    setFormNotes('');
  };

  // Mock Export Handler
  const handleExport = (format) => {
    setIsExporting(format);
    showToast(`Menyiapkan data Rekap Penyaluran ZIS format ${format.toUpperCase()}...`);
    setTimeout(() => {
      showToast(`Berkas Laporan_Penyaluran_BAZNAS_${date.replace(/\s+/g, '_')}.${format} berhasil diunduh!`);
      setIsExporting(null);
    }, 1200);
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-4 sm:space-y-5 lg:space-y-6">
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 bg-card border border-border shadow-2xl rounded-xl p-3.5 sm:p-4 animate-fade-in pr-10 min-w-[300px] max-w-md">
          <CheckCircle2 className={`size-5 shrink-0 ${toast.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`} />
          <div className="text-xs">
            <p className="font-bold text-foreground">
              {toast.type === 'error' ? 'Perhatian' : 'Pemberitahuan Sistem'}
            </p>
            <p className="text-muted-foreground">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast({ show: false, message: '', type: 'success' })}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 1. Header Command & Greeting Strip (Optimized for Mobile, Tablet, Desktop, 2XL) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-3.5 sm:pb-4 border-b border-border/80">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl md:text-2xl 2xl:text-3xl font-extrabold tracking-tight text-foreground">
              Penyaluran & Asesmen Program
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] sm:text-xs font-semibold py-0.5 px-2 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
            >
              {hijri}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {greeting},{' '}
            <span className="font-semibold text-foreground">{userName}</span> • {date} • Kota Tangerang
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8.5 text-xs font-semibold rounded-lg cursor-pointer bg-card hover:bg-muted border-border flex-1 sm:flex-none"
            onClick={() => onNavigate && onNavigate('peta_sebaran')}
          >
            <Compass className="size-3.5 text-emerald-600 mr-1.5" />
            <span className="hidden xs:inline">Peta Sebaran</span> 13 Kec.
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8.5 text-xs font-semibold rounded-lg cursor-pointer bg-card hover:bg-muted border-border flex-1 sm:flex-none"
            onClick={() => onNavigate && onNavigate('mustahik')}
          >
            <Users className="size-3.5 text-blue-600 mr-1.5" />
            Master Mustahik
          </Button>

          <Button
            size="sm"
            className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer px-3 sm:px-4 w-full sm:w-auto"
            onClick={() => setShowAddSheet(true)}
          >
            <Plus className="size-3.5 mr-1.5" /> Catat Penyaluran Baru
          </Button>
        </div>
      </div>

      {/* 2. Interactive Tab Bar Switcher (Mobile Scrollable -> 2XL Spacious) */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-border/40">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {[
            { id: 'ringkasan', label: 'Ringkasan Eksekutif', icon: Activity },
            { id: 'pilar', label: 'Analisis 5 Pilar', icon: Layers },
            { id: 'asnaf', label: 'Syariat 8 Asnaf', icon: Award },
            { id: 'buku_kas', label: `Buku Kas Realisasi (${transactions.length})`, icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <Icon className="size-3.5 sm:size-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Period Selector on Desktop / 2XL */}
        <div className="hidden md:flex items-center bg-muted/70 p-1 rounded-lg border border-border/60 shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground px-2">Periode:</span>
          {PERIOD_OPTIONS.map((p, idx) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(idx)}
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                periodIdx === idx
                  ? 'bg-card text-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Executive KPI Metrics Grid (1-Col Mobile -> 3-Col Tablet -> 5-Col Desktop -> 6-Col 2XL Ultra-wide) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3 lg:gap-4">
        {/* KPI 1: Total Penyaluran ZIS */}
        <Card className="shadow-2xs border-border/80 rounded-xl bg-card hover:border-emerald-500/40 transition-colors">
          <CardContent className="p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] sm:text-xs font-medium">Total Penyaluran ZIS</span>
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="size-3.5 sm:size-4" />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl font-black font-mono tracking-tight text-foreground">
              {formatRupiah(metrics.totalPenyaluran, true)}
            </p>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-emerald-600 font-semibold">
              <TrendingUp className="size-3" /> +12.4% vs tahun lalu
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Penyaluran Bulan Ini */}
        <Card className="shadow-2xs border-border/80 rounded-xl bg-card hover:border-blue-500/40 transition-colors">
          <CardContent className="p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] sm:text-xs font-medium">Penyaluran Bulan Ini</span>
              <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Calendar className="size-3.5 sm:size-4" />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl font-black font-mono tracking-tight text-foreground">
              {formatRupiah(metrics.penyaluranBulanIni, true)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">87 Berkas Terealisasi</p>
          </CardContent>
        </Card>

        {/* KPI 3: Mustahik Terbantu */}
        <Card className="shadow-2xs border-border/80 rounded-xl bg-card hover:border-purple-500/40 transition-colors">
          <CardContent className="p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] sm:text-xs font-medium">Mustahik Terbantu</span>
              <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Users className="size-3.5 sm:size-4" />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl font-black font-mono tracking-tight text-foreground">
              {metrics.totalMustahik.toLocaleString('id-ID')}
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold">100% Terverifikasi NIK</p>
          </CardContent>
        </Card>

        {/* KPI 4: SROI & Efektivitas Penyaluran */}
        <Card className="shadow-2xs border-border/80 rounded-xl bg-card hover:border-amber-500/40 transition-colors">
          <CardContent className="p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] sm:text-xs font-medium">Efektivitas (SROI)</span>
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="size-3.5 sm:size-4" />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl font-black font-mono tracking-tight text-emerald-600">
              {metrics.efektivitasPenyaluran}%
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">Target Nasional &gt;90%</p>
          </CardContent>
        </Card>

        {/* KPI 5: Sisa Alokasi Siap Salur */}
        <Card className="shadow-2xs border-border/80 rounded-xl bg-card hover:border-rose-500/40 transition-colors col-span-2 md:col-span-1">
          <CardContent className="p-3.5 sm:p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] sm:text-xs font-medium">Sisa Kas Siap Salur</span>
              <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Layers className="size-3.5 sm:size-4" />
              </div>
            </div>
            <p className="text-base sm:text-lg lg:text-xl 2xl:text-2xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
              {formatRupiah(metrics.balance, true)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">Likuiditas Aman (Bank BSI/BJB)</p>
          </CardContent>
        </Card>

        {/* KPI 6: Large Desktop (2XL) Target Realisasi RKAT */}
        <Card className="hidden 2xl:flex shadow-2xs border-border/80 rounded-xl bg-linear-to-br from-emerald-500/5 via-card to-card hover:border-emerald-500/40 transition-colors flex-col justify-between">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Capaian Target RKAT</span>
              <span className="text-xs font-bold text-emerald-600 font-mono">{metrics.targetPct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(parseFloat(metrics.targetPct), 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Target Tahunan: <span className="font-semibold text-foreground font-mono">{formatRupiah(metrics.targetPenyaluran, true)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 4. Tab 1: RINGKASAN EKSEKUTIF (Executive Overview) */}
      {activeTab === 'ringkasan' && (
        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
          {/* Charts Row: 5 Pilar Bar Trend (7-8 cols) & Asnaf Donut (4-5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
            {/* 5 Pilar Trend Chart */}
            <Card className="lg:col-span-7 xl:col-span-8 shadow-2xs border-border rounded-xl">
              <CardHeader className="p-3.5 sm:p-4 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60">
                <div>
                  <CardTitle className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="size-4 text-emerald-600" /> Tren Realisasi Distribusi 5 Pilar
                  </CardTitle>
                  <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                    Komposisi nominal penyaluran per bulan (Rp Miliar)
                  </CardDescription>
                </div>

                {/* Period Selector on Mobile & Tablet */}
                <div className="flex md:hidden items-center bg-muted/60 p-0.5 rounded-lg border border-border/60 self-start">
                  {PERIOD_OPTIONS.map((p, idx) => (
                    <button
                      key={p.label}
                      onClick={() => setPeriodIdx(idx)}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                        periodIdx === idx
                          ? 'bg-card text-foreground shadow-2xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="p-3 sm:p-4 pt-3">
                <div className="h-56 sm:h-64 lg:h-72 2xl:h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                        tickFormatter={(val) => `${(val / 1_000_000_000).toFixed(0)}M`}
                      />
                      <Tooltip
                        formatter={(v) => [formatRupiah(v), '']}
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: '0.5rem',
                          fontSize: '11px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Bar dataKey="pendidikan" name="Tangerang Cerdas" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="kesehatan" name="Tangerang Sehat" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="sosial" name="Tangerang Peduli" stackId="a" fill="#e11d48" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="ekonomi" name="Tangerang Makmur" stackId="a" fill="#d97706" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="dakwah" name="Tangerang Takwa" stackId="a" fill="#7c3aed" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Legends */}
                <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-3 border-t border-border/60 text-[10px] sm:text-xs text-muted-foreground">
                  {Object.entries(PILAR_CONFIG).map(([key, config]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-xs" style={{ backgroundColor: config.color }} />
                      <span className="font-medium">{config.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Asnaf Distribution Donut Chart */}
            <Card className="lg:col-span-5 xl:col-span-4 shadow-2xs border-border rounded-xl flex flex-col justify-between">
              <CardHeader className="p-3.5 sm:p-4 pb-2 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="size-4 text-emerald-600" /> Alokasi 8 Asnaf Syariat
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground">
                    QS. At-Taubah: 60
                  </Badge>
                </div>
                <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                  Distribusi penerima manfaat sesuai syariat Islam
                </CardDescription>
              </CardHeader>

              <CardContent className="p-3 sm:p-4 pt-2 space-y-3 flex-1 flex flex-col justify-between">
                <div className="h-44 sm:h-48 lg:h-52 w-full relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={totalByAsnaf}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={74}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {totalByAsnaf.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="var(--card)" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [formatRupiah(v), '']}
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: '0.5rem',
                          fontSize: '11px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-muted-foreground">Total Realisasi</span>
                    <span className="text-xs sm:text-sm font-bold font-mono text-foreground">
                      {formatRupiah(sumAsnafTotal, true)}
                    </span>
                  </div>
                </div>

                {/* Asnaf Matrix List */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border/60">
                  {totalByAsnaf.map((item) => (
                    <div
                      key={item.name}
                      className="p-1.5 sm:p-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors flex items-center justify-between text-[10px] sm:text-[11px]"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="size-2 rounded-xs shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-foreground font-medium">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-foreground shrink-0">
                        {formatRupiah(item.value, true)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 5-Stage Pipeline Asesmen Monitor Widget */}
          <Card className="shadow-2xs border-border rounded-xl">
            <CardHeader className="p-3.5 sm:p-4 pb-2.5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="size-4 text-emerald-600" /> Pipeline Monitoring Asesmen Mustahik
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                  Status permohonan bantuan dari pengajuan berkas hingga pencairan tuntas
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs font-semibold rounded-lg self-start sm:self-auto cursor-pointer"
                onClick={() => onNavigate && onNavigate('mustahik')}
              >
                Buka Workflow Asesmen <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </CardHeader>

            <CardContent className="p-3.5 sm:p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {PIPELINE_SUMMARY.map((item, idx) => (
                  <div
                    key={item.stage}
                    className={`p-3 rounded-xl border border-border/80 ${item.bg} space-y-1 transition-transform hover:-translate-y-0.5`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground">{item.stage}</span>
                      <Badge variant="outline" className={`text-[10px] font-bold py-0 px-1.5 ${item.color}`}>
                        {item.count} Berkas
                      </Badge>
                    </div>
                    <p className="text-sm sm:text-base font-extrabold font-mono text-foreground">
                      {formatRupiah(item.amount, true)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Ledger Snapshot */}
          <Card className="shadow-2xs border-border rounded-xl overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="size-4 text-emerald-600" /> Buku Kas Realisasi Penyaluran Terkini
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                  Realisasi permohonan bantuan mustahik yang telah divalidasi dan disalurkan
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7.5 text-xs font-semibold rounded-lg cursor-pointer"
                  onClick={() => setShowAddSheet(true)}
                >
                  <Plus className="size-3.5 mr-1 text-emerald-600" /> Catat Realisasi
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                  onClick={() => setActiveTab('buku_kas')}
                >
                  Lihat Semua ({transactions.length}) <ArrowRight className="size-3 ml-1" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Responsive Table for Tablet/Desktop/2XL */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">No. BPD & Tanggal</th>
                      <th className="px-4 py-2.5">Nama Mustahik / Penerima</th>
                      <th className="px-4 py-2.5">Program 5 Pilar</th>
                      <th className="px-4 py-2.5">Golongan Asnaf</th>
                      <th className="px-4 py-2.5">Kecamatan</th>
                      <th className="px-4 py-2.5 text-right">Nominal (Rp)</th>
                      <th className="px-4 py-2.5 text-center">Aksi Kwitansi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transactions.slice(0, 6).map((trx) => (
                      <tr
                        key={trx.id}
                        onClick={() => setSelectedReceiptTrx(trx)}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 block">{trx.id}</span>
                          <span className="text-[10px] text-muted-foreground">{trx.date}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-foreground">{trx.mustahik}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{trx.program}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground">
                            {trx.asnaf}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground flex items-center gap-1">
                          <MapPin className="size-3 text-muted-foreground" /> {trx.kecamatan}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-right text-foreground">
                          {formatRupiah(trx.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReceiptTrx(trx);
                            }}
                          >
                            <FileText className="size-3 mr-1" /> Bukti Salur
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View (< 640px) */}
              <div className="sm:hidden divide-y divide-border/60">
                {transactions.slice(0, 5).map((trx) => (
                  <div
                    key={trx.id}
                    onClick={() => setSelectedReceiptTrx(trx)}
                    className="p-3.5 hover:bg-muted/30 transition-colors cursor-pointer space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono text-emerald-600 font-semibold">{trx.id}</span>
                        <h4 className="text-xs font-bold text-foreground">{trx.mustahik}</h4>
                      </div>
                      <span className="text-xs font-mono font-extrabold text-foreground">
                        {formatRupiah(trx.amount)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-[10px] text-muted-foreground">
                      <span>{trx.program} • {trx.asnaf}</span>
                      <span>{trx.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5. Tab 2: ANALISIS 5 PILAR BAZNAS (Deep Dive) */}
      {activeTab === 'pilar' && (
        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
          {/* Header Banner */}
          <div className="bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-4 sm:p-6 shadow-md">
            <div className="max-w-3xl space-y-2">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-xs">
                Master Plan Program
              </Badge>
              <h2 className="text-lg sm:text-2xl font-black">5 Pilar Utama BAZNAS Kota Tangerang</h2>
              <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
                Pendayagunaan dan pendistribusian dana zakat, infak, dan sedekah disalurkan melalui 5 pilar strategis
                untuk pengentasan kemiskinan, peningkatan mutu pendidikan, jaminan kesehatan mustahik, kemandirian ekonomi,
                dan syiar dakwah Islamiyah.
              </p>
            </div>
          </div>

          {/* 5 Pillars Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {Object.values(PILAR_CONFIG).map((pilar) => {
              const Icon = pilar.icon;
              const pct = ((pilar.realized / pilar.target) * 100).toFixed(1);
              return (
                <Card
                  key={pilar.id}
                  className="shadow-2xs border-border rounded-xl flex flex-col justify-between hover:border-emerald-500/40 transition-all"
                >
                  <CardHeader className="p-4 pb-3 border-b border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="p-2 rounded-lg text-white"
                          style={{ backgroundColor: pilar.color }}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">{pilar.name}</CardTitle>
                          <CardDescription className="text-[11px] text-muted-foreground">{pilar.sub}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-bold ${pilar.accentBg}`}>
                        {pct}%
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                    <p className="text-xs text-muted-foreground leading-relaxed">{pilar.desc}</p>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Realisasi:</span>
                        <span className="font-mono font-bold text-foreground">{formatRupiah(pilar.realized, true)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(parseFloat(pct), 100)}%`, backgroundColor: pilar.color }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Target: {formatRupiah(pilar.target, true)}</span>
                        <span>{pilar.beneficiaries.toLocaleString('id-ID')} Penerima</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 px-2"
                        onClick={() => {
                          setFilterProgram(pilar.name);
                          setActiveTab('buku_kas');
                        }}
                      >
                        Lihat Daftar Transaksi <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Tab 3: ALOKASI SYARIAT 8 ASNAF */}
      {activeTab === 'asnaf' && (
        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
          <Card className="shadow-2xs border-border rounded-xl">
            <CardHeader className="p-4 pb-3 border-b border-border/60">
              <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Award className="size-4.5 text-emerald-600" /> Pedoman Pembagian 8 Golongan Asnaf Zakat (QS. At-Taubah: 60)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Ketetapan syariat memastikan setiap rupiah zakat mustahik disalurkan tepat sasaran dan berkeadilan.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: '1. Fakir', desc: 'Seseorang yang tidak memiliki harta atau mata pencaharian dan tidak dapat memenuhi kebutuhan pokoknya.', pct: '30%', color: '#e11d48', realized: 567_000_000_000 },
                  { name: '2. Miskin', desc: 'Seseorang yang memiliki mata pencaharian tetapi penghasilannya belum mencukupi kebutuhan pokok sehari-hari.', pct: '40%', color: '#d97706', realized: 756_000_000_000 },
                  { name: '3. Amil Zakat', desc: 'Petugas/amil yang ditugaskan secara resmi untuk mengumpulkan, mengelola, dan mendistribusikan zakat.', pct: '10%', color: '#2563eb', realized: 189_000_000_000 },
                  { name: '4. Mualaf', desc: 'Orang yang baru masuk Islam atau yang hatinya perlu dilembutkan untuk memperkuat keimanan.', pct: '5%', color: '#0d9488', realized: 94_500_000_000 },
                  { name: '5. Riqab / Kemerdekaan', desc: 'Pembebasan perbudakan modern, advokasi PMI terlantar, dan penanganan korban perdagangan orang.', pct: '1%', color: '#6366f1', realized: 18_900_000_000 },
                  { name: '6. Gharimin', desc: 'Orang yang terlilit utang demi kemaslahatan hidup, kebutuhan medis darurat, bukan untuk maksiat.', pct: '4%', color: '#ec4899', realized: 75_600_000_000 },
                  { name: '7. Fisabilillah', desc: 'Aktivitas perjuangan di jalan Allah, pembinaan dakwah Islam, pendidikan santri, guru ngaji.', pct: '8%', color: '#059669', realized: 151_200_000_000 },
                  { name: '8. Ibnu Sabil', desc: 'Musafir yang kehabisan bekal dalam perjalanan ketaatan atau mahasiswa perantau dhuafa.', pct: '2%', color: '#64748b', realized: 37_800_000_000 },
                ].map((asnaf) => (
                  <div
                    key={asnaf.name}
                    className="p-4 rounded-xl border border-border/80 bg-card hover:border-emerald-500/40 transition-colors space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs sm:text-sm text-foreground">{asnaf.name}</span>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-muted text-foreground">
                          Porsi {asnaf.pct}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{asnaf.desc}</p>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tersalurkan:</span>
                      <span className="font-mono font-bold text-foreground">{formatRupiah(asnaf.realized, true)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 7. Tab 4: BUKU KAS & RIWAYAT REALISASI LENGKAP */}
      {activeTab === 'buku_kas' && (
        <div className="space-y-4 sm:space-y-5 lg:space-y-6">
          <Card className="shadow-2xs border-border rounded-xl">
            <CardHeader className="p-3.5 sm:p-4 pb-3 border-b border-border/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="size-4 text-emerald-600" /> Buku Kas & Jurnal Realisasi Penyaluran
                </CardTitle>
                <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
                  Menampilkan {filteredTransactions.length} dari {transactions.length} transaksi permohonan bantuan
                </CardDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isExporting !== null}
                  className="h-8 text-xs font-semibold rounded-lg cursor-pointer bg-card hover:bg-muted"
                  onClick={() => handleExport('xlsx')}
                >
                  <FileSpreadsheet className="size-3.5 mr-1.5 text-emerald-600" /> Ekspor Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isExporting !== null}
                  className="h-8 text-xs font-semibold rounded-lg cursor-pointer bg-card hover:bg-muted"
                  onClick={() => handleExport('pdf')}
                >
                  <Download className="size-3.5 mr-1.5 text-rose-600" /> Unduh PDF
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                  onClick={() => setShowAddSheet(true)}
                >
                  <Plus className="size-3.5 mr-1" /> Catat Realisasi Baru
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3.5 sm:p-4 space-y-4">
              {/* Search & Filter Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Search Term */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari mustahik / no BPD / pilar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8.5 pl-8 text-xs focus-visible:ring-emerald-500"
                  />
                </div>

                {/* Filter Program */}
                <select
                  value={filterProgram}
                  onChange={(e) => setFilterProgram(e.target.value)}
                  className="h-8.5 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Semua">Semua Program Pilar</option>
                  <option value="Tangerang Cerdas">Tangerang Cerdas (Pendidikan)</option>
                  <option value="Tangerang Sehat">Tangerang Sehat (Kesehatan)</option>
                  <option value="Tangerang Peduli">Tangerang Peduli (Sosial)</option>
                  <option value="Tangerang Makmur">Tangerang Makmur (Ekonomi)</option>
                  <option value="Tangerang Takwa">Tangerang Takwa (Dakwah)</option>
                </select>

                {/* Filter Asnaf */}
                <select
                  value={filterAsnaf}
                  onChange={(e) => setFilterAsnaf(e.target.value)}
                  className="h-8.5 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Semua">Semua Asnaf</option>
                  <option value="Fakir">Fakir</option>
                  <option value="Miskin">Miskin</option>
                  <option value="Amil">Amil</option>
                  <option value="Mualaf">Mualaf</option>
                  <option value="Gharimin">Gharimin</option>
                  <option value="Fisabilillah">Fisabilillah</option>
                  <option value="Ibnu Sabil">Ibnu Sabil</option>
                </select>

                {/* Filter Kecamatan */}
                <select
                  value={filterKecamatan}
                  onChange={(e) => setFilterKecamatan(e.target.value)}
                  className="h-8.5 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Semua">Semua Kecamatan (13)</option>
                  {KECAMATAN_LIST.map((kec) => (
                    <option key={kec} value={kec}>
                      Kec. {kec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ledger Table */}
              <div className="border border-border/80 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                      <tr>
                        <th className="px-4 py-3">No. BPD & Tanggal</th>
                        <th className="px-4 py-3">Nama Mustahik</th>
                        <th className="px-4 py-3">Program Pilar</th>
                        <th className="px-4 py-3">Golongan Asnaf</th>
                        <th className="px-4 py-3">Wilayah / Kec.</th>
                        <th className="px-4 py-3">Metode Penyaluran</th>
                        <th className="px-4 py-3 text-right">Nominal (Rp)</th>
                        <th className="px-4 py-3 text-center">Status & Kwitansi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                            <div className="max-w-xs mx-auto space-y-2">
                              <Search className="size-8 mx-auto text-muted-foreground/50" />
                              <p className="font-semibold text-foreground">Tidak Ada Transaksi Ditemukan</p>
                              <p className="text-xs">Coba sesuaikan kata kunci pencarian atau reset filter.</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs mt-2"
                                onClick={() => {
                                  setSearchTerm('');
                                  setFilterProgram('Semua');
                                  setFilterAsnaf('Semua');
                                  setFilterKecamatan('Semua');
                                }}
                              >
                                Reset Saringan
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((trx) => (
                          <tr
                            key={trx.id}
                            onClick={() => setSelectedReceiptTrx(trx)}
                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 block">
                                {trx.id}
                              </span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Calendar className="size-2.5" /> {trx.date}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-bold text-foreground">{trx.mustahik}</p>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{trx.keterangan}</p>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground font-medium">{trx.program}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground">
                                {trx.asnaf}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="size-3 text-muted-foreground" /> {trx.kecamatan}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-[11px]">
                              {trx.metode || 'Transfer Bank'}
                            </td>
                            <td className="px-4 py-3 font-mono font-black text-right text-foreground">
                              {formatRupiah(trx.amount)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReceiptTrx(trx);
                                }}
                              >
                                <FileText className="size-3 mr-1" /> Cetak BPD
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 8. SHEET: CATAT PENYALURAN BARU (Interactive Drawer) */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent className="w-full sm:max-w-lg p-5 sm:p-6 overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <Plus className="size-4.5 text-emerald-600" /> Catat Realisasi Penyaluran Dana
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Formulir pencatatan bukti penyaluran dana (BPD) resmi BAZNAS Kota Tangerang.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleAddSubmit} className="space-y-4 pt-4 text-xs">
            {/* Mustahik Name */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">Nama Penerima Manfaat / Mustahik *</label>
              <Input
                required
                placeholder="Contoh: Sdr. Sulaeman / Yayasan Al-Ikhlas"
                value={formMustahik}
                onChange={(e) => setFormMustahik(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500"
              />
            </div>

            {/* Program 5 Pilar & Asnaf */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Program 5 Pilar *</label>
                <select
                  value={formProgram}
                  onChange={(e) => setFormProgram(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Tangerang Cerdas">Tangerang Cerdas (Pendidikan)</option>
                  <option value="Tangerang Sehat">Tangerang Sehat (Kesehatan)</option>
                  <option value="Tangerang Peduli">Tangerang Peduli (Kemanusiaan)</option>
                  <option value="Tangerang Makmur">Tangerang Makmur (Ekonomi)</option>
                  <option value="Tangerang Takwa">Tangerang Takwa (Dakwah)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Golongan Asnaf *</label>
                <select
                  value={formAsnaf}
                  onChange={(e) => setFormAsnaf(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Fakir">Fakir</option>
                  <option value="Miskin">Miskin</option>
                  <option value="Mualaf">Mualaf</option>
                  <option value="Gharimin">Gharimin</option>
                  <option value="Fisabilillah">Fisabilillah</option>
                  <option value="Ibnu Sabil">Ibnu Sabil</option>
                  <option value="Amil">Amil</option>
                </select>
              </div>
            </div>

            {/* Kecamatan & Metode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Wilayah Kecamatan *</label>
                <select
                  value={formKecamatan}
                  onChange={(e) => setFormKecamatan(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  {KECAMATAN_LIST.map((kec) => (
                    <option key={kec} value={kec}>
                      Kecamatan {kec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Metode Penyaluran *</label>
                <select
                  value={formMetode}
                  onChange={(e) => setFormMetode(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-border bg-background px-2.5 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <option value="Transfer Bank Syariah">Transfer Bank Syariah (BSI/BJB)</option>
                  <option value="Tunai Langsung Kantor">Tunai Langsung di Kantor</option>
                  <option value="Penyerahan Lapangan">Penyerahan Langsung Lapangan</option>
                </select>
              </div>
            </div>

            {/* Nominal & Tanggal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Nominal Bantuan (Rp) *</label>
                <Input
                  required
                  type="number"
                  placeholder="5000000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="h-9 text-xs font-mono font-bold focus-visible:ring-emerald-500"
                />
                {formAmount && !isNaN(parseFloat(formAmount)) && (
                  <p className="text-[10px] text-emerald-600 font-semibold mt-0.5 font-mono">
                    {formatRupiah(parseFloat(formAmount))}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Tanggal Penyaluran</label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="h-9 text-xs font-mono focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            {/* Keterangan / Deskripsi */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">Keterangan / Rincian Bantuan</label>
              <Input
                placeholder="Contoh: Bantuan pelunasan SPP 6 bulan santri berprestasi"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => setShowAddSheet(false)}
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4"
              >
                Simpan & Terbitkan BPD
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* 9. MODAL: OFFICIAL DIGITAL RECEIPT / BUKTI PENYALURAN DANA (BPD) */}
      {selectedReceiptTrx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header Bar */}
            <div className="p-4 border-b border-border/80 flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <FileCheck2 className="size-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Bukti Penyaluran Dana (BPD)</h3>
                  <span className="text-[11px] font-mono text-muted-foreground">{selectedReceiptTrx.id}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedReceiptTrx(null)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
              >
                <X className="size-4.5" />
              </button>
            </div>

            {/* Printable Receipt Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Receipt Letterhead */}
              <div className="text-center pb-4 border-b border-border/80 space-y-1">
                <p className="text-[10px] uppercase tracking-widest font-extrabold text-emerald-700 dark:text-emerald-400">
                  BADAN AMIL ZAKAT NASIONAL (BAZNAS) KOTA TANGERANG
                </p>
                <h2 className="text-base sm:text-lg font-black text-foreground">
                  KWITANSI / TANDA TERIMA PENYALURAN
                </h2>
                <p className="text-[10px] text-muted-foreground font-mono">
                  Nomor Registrasi: <span className="font-bold text-foreground">{selectedReceiptTrx.id}</span> • Tanggal:{' '}
                  {selectedReceiptTrx.date}
                </p>
              </div>

              {/* Data Matrix */}
              <div className="space-y-2.5 bg-muted/20 p-3.5 rounded-xl border border-border/60 text-xs">
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Telah Diterima Oleh:</span>
                  <span className="col-span-2 font-bold text-foreground">{selectedReceiptTrx.mustahik}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Golongan Asnaf:</span>
                  <span className="col-span-2 font-semibold text-foreground">{selectedReceiptTrx.asnaf}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Program BAZNAS:</span>
                  <span className="col-span-2 font-semibold text-emerald-700 dark:text-emerald-400">
                    {selectedReceiptTrx.program}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Wilayah Kecamatan:</span>
                  <span className="col-span-2 text-foreground">Kecamatan {selectedReceiptTrx.kecamatan}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Metode Penyaluran:</span>
                  <span className="col-span-2 text-foreground">{selectedReceiptTrx.metode || 'Transfer Bank'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground font-medium">Untuk Keperluan:</span>
                  <span className="col-span-2 text-muted-foreground">{selectedReceiptTrx.keterangan}</span>
                </div>
              </div>

              {/* Amount Highlight */}
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                  Jumlah Nominal Dana Tersalur
                </span>
                <p className="text-xl sm:text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
                  {formatRupiah(selectedReceiptTrx.amount)}
                </p>
                <p className="text-[10px] italic text-muted-foreground font-medium">
                  Terbilang: "{terbilangRupiah(selectedReceiptTrx.amount)}"
                </p>
              </div>

              {/* Digital Signature and QR Code */}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/80 text-center text-[10px]">
                <div className="space-y-10">
                  <p className="text-muted-foreground">Penerima Manfaat / Mustahik,</p>
                  <p className="font-bold underline text-foreground">{selectedReceiptTrx.mustahik}</p>
                </div>
                <div className="space-y-10">
                  <p className="text-muted-foreground">Amil Pelaksana Penyaluran,</p>
                  <p className="font-bold underline text-foreground">{userName}</p>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-3.5 sm:p-4 border-t border-border/80 bg-muted/20 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs cursor-pointer"
                onClick={() => setSelectedReceiptTrx(null)}
              >
                Tutup
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs cursor-pointer"
                  onClick={() => {
                    showToast('Link Bukti Penyaluran Dana telah disalin ke clipboard!');
                  }}
                >
                  <Share2 className="size-3.5 mr-1" /> Bagikan
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  onClick={() => {
                    window.print();
                  }}
                >
                  <Printer className="size-3.5 mr-1.5" /> Cetak Kwitansi
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

