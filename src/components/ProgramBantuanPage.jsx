import { useState, useMemo } from 'react';
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
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  GraduationCap,
  HeartPulse,
  HeartHandshake,
  Coins,
  BookOpen,
  Search,
  Download,
  Users,
  Target,
  TrendingUp,
  DollarSign,
  Plus,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  Sparkles,
  Calculator,
  ShieldCheck,
  Building,
  FileSpreadsheet,
  X,
  FileText,
  Clock,
  ExternalLink,
  ChevronRight,
  Percent,
  Check,
  SlidersHorizontal,
  MapPin,
  Activity,
  ArrowRight,
  Printer,
  Compass,
  Award,
} from 'lucide-react';
import { formatRupiah } from '../utils/format';

const PILAR_MASTER = [
  {
    id: 'PRG-CERDAS',
    pilarNum: '1',
    name: 'Tangerang Cerdas',
    category: 'Pendidikan & Beasiswa',
    pct: 73,
    sparkline: [20, 35, 40, 45, 55, 60, 68, 73],
    beneficiaries: 9842,
    brandColor: '#2563eb',
    icon: GraduationCap,
    bgBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    budget: 12_500_000_000,
    realized: 9_125_000_000,
    activities: 48_200,
    programsCount: 14,
    mainServices: '5 Layanan Utama',
    impactStatement: 'Akses pendidikan merata, angka putus sekolah turun drastis, dan generasi mustahik bertransformasi menjadi sarjana mandiri.',
    metrics: {
      primaryLabel: 'Siswa / Mahasiswa Terbantu',
      primaryValue: '9.842',
      primaryGrowth: '+14,2%',
      successRate: '88%',
      successCount: '8.660 Jiwa',
      avgAid: 'Rp 927 rb',
      activeProg: '14 Program',
      servicesCount: '5 Layanan Utama',
      districtsCovered: '13 / 13',
      newMustahik: '2.410 Jiwa',
    },
    monthlyData: [
      { month: 'Jan', realisasi: 650, target: 800 },
      { month: 'Feb', realisasi: 850, target: 900 },
      { month: 'Mar', realisasi: 1100, target: 1000 },
      { month: 'Apr', realisasi: 1250, target: 1100 },
      { month: 'Mei', realisasi: 1400, target: 1200 },
      { month: 'Jun', realisasi: 1350, target: 1200 },
      { month: 'Jul', realisasi: 1250, target: 1100 },
      { month: 'Agu', realisasi: 1275, target: 1100 },
      { month: 'Sep', realisasi: 0, target: 1100 },
      { month: 'Okt', realisasi: 0, target: 1100 },
      { month: 'Nov', realisasi: 0, target: 1100 },
      { month: 'Des', realisasi: 0, target: 1100 },
    ],
    asnafPie: [
      { name: 'Miskin', value: 4250, pct: '43%', color: '#d97706' },
      { name: 'Fakir', value: 3120, pct: '32%', color: '#e11d48' },
      { name: 'Fisabilillah', value: 1450, pct: '15%', color: '#059669' },
      { name: 'Ibnu Sabil', value: 680, pct: '7%', color: '#2563eb' },
      { name: 'Mualaf', value: 342, pct: '3%', color: '#0d9488' },
    ],
    topKecamatan: [
      { name: 'Karawaci', count: 1980, pct: '20%' },
      { name: 'Ciledug', count: 1720, pct: '17%' },
      { name: 'Cipondoh', count: 1540, pct: '16%' },
      { name: 'Batuceper', count: 1380, pct: '14%' },
      { name: 'Periuk', count: 1150, pct: '12%' },
    ],
    subPrograms: [
      { code: 'TC-01', name: 'Beasiswa Satu Keluarga Satu Sarjana (SKSS)', desc: 'Beasiswa penuh kuliah S1/D3 bagi putra-putri keluarga prasejahtera.', budget: 3_500_000_000, realized: 2_950_000_000, mustahik: 1200, status: 'Aktif' },
      { code: 'TC-02', name: 'Penebusan Ijazah & Tunggakan SPP Sekolah', desc: 'Pelunasan tunggakan SPP agar siswa menerima ijazah kelulusan.', budget: 3_200_000_000, realized: 2_650_000_000, mustahik: 4200, status: 'Aktif' },
      { code: 'TC-03', name: 'Insentif Guru Ngaji Tradisional & Honorer', desc: 'Tunjangan kehormatan bulanan bagi para pendidik Al-Qur’an di kelurahan.', budget: 3_000_000_000, realized: 2_150_000_000, mustahik: 3100, status: 'Aktif' },
      { code: 'TC-04', name: 'Digitalisasi Lab Komputer Santri Pesantren', desc: 'Pengadaan PC dan sarana internet cepat bagi santri pondok pesantren.', budget: 2_800_000_000, realized: 1_375_000_000, mustahik: 1342, status: 'Aktif' },
    ],
  },
  {
    id: 'PRG-MAKMUR',
    pilarNum: '2',
    name: 'Tangerang Makmur',
    category: 'Pemberdayaan Ekonomi & UMKM',
    pct: 66,
    sparkline: [15, 25, 38, 42, 50, 56, 62, 66],
    beneficiaries: 8306,
    brandColor: '#d97706',
    icon: Coins,
    bgBadge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    budget: 9_800_000_000,
    realized: 6_468_000_000,
    activities: 36_400,
    programsCount: 12,
    mainServices: '4 Layanan Utama',
    impactStatement: 'Mustahik mandiri menjadi muzakki, usaha mikro naik kelas, dan pendapatan keluarga duafa meningkat berkelanjutan.',
    metrics: {
      primaryLabel: 'Pelaku Usaha Mikro Binaan',
      primaryValue: '8.306',
      primaryGrowth: '+21,4%',
      successRate: '79%',
      successCount: '6.561 Jiwa',
      avgAid: 'Rp 778 rb',
      activeProg: '12 Program',
      servicesCount: '4 Layanan Utama',
      districtsCovered: '13 / 13',
      newMustahik: '1.980 Jiwa',
    },
    monthlyData: [
      { month: 'Jan', realisasi: 420, target: 700 },
      { month: 'Feb', realisasi: 610, target: 750 },
      { month: 'Mar', realisasi: 850, target: 800 },
      { month: 'Apr', realisasi: 980, target: 850 },
      { month: 'Mei', realisasi: 1050, target: 900 },
      { month: 'Jun', realisasi: 990, target: 900 },
      { month: 'Jul', realisasi: 820, target: 850 },
      { month: 'Agu', realisasi: 748, target: 850 },
      { month: 'Sep', realisasi: 0, target: 850 },
      { month: 'Okt', realisasi: 0, target: 850 },
      { month: 'Nov', realisasi: 0, target: 850 },
      { month: 'Des', realisasi: 0, target: 850 },
    ],
    asnafPie: [
      { name: 'Miskin', value: 4980, pct: '60%', color: '#d97706' },
      { name: 'Fakir', value: 2150, pct: '26%', color: '#e11d48' },
      { name: 'Mualaf', value: 650, pct: '8%', color: '#0d9488' },
      { name: 'Gharimin', value: 526, pct: '6%', color: '#7c3aed' },
    ],
    topKecamatan: [
      { name: 'Tangerang', count: 1840, pct: '22%' },
      { name: 'Jatiuwung', count: 1650, pct: '20%' },
      { name: 'Cipondoh', count: 1420, pct: '17%' },
      { name: 'Ciledug', count: 1280, pct: '15%' },
      { name: 'Larangan', count: 1120, pct: '13%' },
    ],
    subPrograms: [
      { code: 'TM-01', name: 'Bantuan Modal Usaha Bergulir Z-Mart', desc: 'Suntikan modal tanpa bunga bagi warung kelontong mustahik.', budget: 3_200_000_000, realized: 2_450_000_000, mustahik: 3400, status: 'Aktif' },
      { code: 'TM-02', name: 'Gerobak Kuliner Berkah & Booth Usaha', desc: 'Bantuan etalase booth modern, kompor, dan alat masak.', budget: 2_600_000_000, realized: 1_850_000_000, mustahik: 2100, status: 'Aktif' },
      { code: 'TM-03', name: 'Pelatihan Vokasi & Bengkel Z-Auto', desc: 'Pelatihan montir bersertifikasi & modal alat bengkel.', budget: 2_200_000_000, realized: 1_350_000_000, mustahik: 1600, status: 'Aktif' },
      { code: 'TM-04', name: 'Binaan Pertanian & Perikanan Perkotaan', desc: 'Inkubasi budidaya lele dan hidroponik kelompok tani.', budget: 1_800_000_000, realized: 818_000_000, mustahik: 1206, status: 'Aktif' },
    ],
  },
  {
    id: 'PRG-SEHAT',
    pilarNum: '3',
    name: 'Tangerang Sehat',
    category: 'Kesehatan & Layanan Medis',
    pct: 82,
    sparkline: [22, 34, 48, 55, 62, 70, 78, 82],
    beneficiaries: 12374,
    brandColor: '#059669',
    icon: HeartPulse,
    bgBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    budget: 11_000_000_000,
    realized: 9_210_000_000,
    activities: 63842,
    programsCount: 18,
    mainServices: '6 Layanan Utama',
    impactStatement: 'Derajat kesehatan kaum duafa meningkat, beban biaya operasi & rawat inap tuntas teratasi, kualitas hidup lebih sejahtera.',
    metrics: {
      primaryLabel: 'Pasien Mustahik Dilayani',
      primaryValue: '12.374',
      primaryGrowth: '+18,6%',
      successRate: '72%',
      successCount: '8.921 Jiwa',
      avgAid: 'Rp 744 rb',
      activeProg: '18 Program',
      servicesCount: '6 Layanan Utama',
      districtsCovered: '13 / 13',
      newMustahik: '3.214 Jiwa',
    },
    monthlyData: [
      { month: 'Jan', realisasi: 520, target: 750 },
      { month: 'Feb', realisasi: 780, target: 800 },
      { month: 'Mar', realisasi: 1050, target: 850 },
      { month: 'Apr', realisasi: 1220, target: 900 },
      { month: 'Mei', realisasi: 1480, target: 950 },
      { month: 'Jun', realisasi: 1510, target: 950 },
      { month: 'Jul', realisasi: 1390, target: 900 },
      { month: 'Agu', realisasi: 1260, target: 900 },
      { month: 'Sep', realisasi: 0, target: 900 },
      { month: 'Okt', realisasi: 0, target: 900 },
      { month: 'Nov', realisasi: 0, target: 900 },
      { month: 'Des', realisasi: 0, target: 900 },
    ],
    asnafPie: [
      { name: 'Fakir', value: 4128, pct: '33%', color: '#e11d48' },
      { name: 'Miskin', value: 4346, pct: '35%', color: '#d97706' },
      { name: 'Amil', value: 1611, pct: '13%', color: '#2563eb' },
      { name: 'Mualaf', value: 1187, pct: '10%', color: '#0d9488' },
      { name: 'Gharimin', value: 769, pct: '6%', color: '#7c3aed' },
      { name: 'Lainnya', value: 755, pct: '6%', color: '#64748b' },
    ],
    topKecamatan: [
      { name: 'Karawaci', count: 2186, pct: '18%' },
      { name: 'Ciledug', count: 1846, pct: '15%' },
      { name: 'Cipondoh', count: 1673, pct: '14%' },
      { name: 'Batuceper', count: 1435, pct: '12%' },
      { name: 'Periuk', count: 1221, pct: '10%' },
    ],
    subPrograms: [
      { code: 'TS-01', name: 'Bantuan Rawat Inap & Operasi Kritis RSU', desc: 'Bantuan biaya tindakan medis, ICU, dan farmasi di RSUD & RS Mitra.', budget: 4_200_000_000, realized: 3_850_000_000, mustahik: 4200, status: 'Aktif' },
      { code: 'TS-02', name: 'Pengadaan Alat Bantu Disabilitas & Lansia', desc: 'Penyaluran kursi roda standar/cerebral palsy, tongkat, dan kaki palsu.', budget: 2_600_000_000, realized: 2_150_000_000, mustahik: 1450, status: 'Aktif' },
      { code: 'TS-03', name: 'Layanan Ambulans Gratis 24 Jam Antar-Jemput', desc: 'Operasional armada ambulans gratis pasien dhuafa dan jenazah.', budget: 2_400_000_000, realized: 1_980_000_000, mustahik: 4800, status: 'Aktif' },
      { code: 'TS-04', name: 'Sanitasi Jamban Sehat & Intervensi Stunting', desc: 'Pembangunan MCK layak keluarga padat dan paket suplemen gizi anak.', budget: 1_800_000_000, realized: 1_230_000_000, mustahik: 1924, status: 'Aktif' },
    ],
  },
  {
    id: 'PRG-PEDULI',
    pilarNum: '4',
    name: 'Tangerang Peduli',
    category: 'Sosial & Tanggap Bencana',
    pct: 61,
    sparkline: [18, 28, 36, 44, 49, 53, 58, 61],
    beneficiaries: 6501,
    brandColor: '#e11d48',
    icon: HeartHandshake,
    bgBadge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    budget: 8_500_000_000,
    realized: 5_185_000_000,
    activities: 29_800,
    programsCount: 10,
    mainServices: '4 Layanan Utama',
    impactStatement: 'Respon cepat bencana banjir/kebakaran, hunian duafa tuntas dibedah layak huni, dan santunan yatim terjamin rutin.',
    metrics: {
      primaryLabel: 'Keluarga Mustahik Tertolong',
      primaryValue: '6.501',
      primaryGrowth: '+9,8%',
      successRate: '91%',
      successCount: '5.915 KK',
      avgAid: 'Rp 798 rb',
      activeProg: '10 Program',
      servicesCount: '4 Layanan Utama',
      districtsCovered: '13 / 13',
      newMustahik: '1.420 Jiwa',
    },
    monthlyData: [
      { month: 'Jan', realisasi: 410, target: 600 },
      { month: 'Feb', realisasi: 550, target: 650 },
      { month: 'Mar', realisasi: 720, target: 700 },
      { month: 'Apr', realisasi: 890, target: 750 },
      { month: 'Mei', realisasi: 950, target: 750 },
      { month: 'Jun', realisasi: 840, target: 750 },
      { month: 'Jul', realisasi: 790, target: 700 },
      { month: 'Agu', realisasi: 635, target: 700 },
      { month: 'Sep', realisasi: 0, target: 700 },
      { month: 'Okt', realisasi: 0, target: 700 },
      { month: 'Nov', realisasi: 0, target: 700 },
      { month: 'Des', realisasi: 0, target: 700 },
    ],
    asnafPie: [
      { name: 'Fakir', value: 3250, pct: '50%', color: '#e11d48' },
      { name: 'Miskin', value: 2450, pct: '38%', color: '#d97706' },
      { name: 'Gharimin', value: 520, pct: '8%', color: '#7c3aed' },
      { name: 'Ibnu Sabil', value: 281, pct: '4%', color: '#2563eb' },
    ],
    topKecamatan: [
      { name: 'Periuk', count: 1450, pct: '22%' },
      { name: 'Jatiuwung', count: 1320, pct: '20%' },
      { name: 'Karawaci', count: 1210, pct: '19%' },
      { name: 'Ciledug', count: 1100, pct: '17%' },
      { name: 'Neglasari', count: 921, pct: '14%' },
    ],
    subPrograms: [
      { code: 'TP-01', name: 'Bedah Rumah Tidak Layak Huni (RTLH)', desc: 'Renovasi total atap, lantai, dinding dan sanitasi hunian duafa.', budget: 3_500_000_000, realized: 2_450_000_000, mustahik: 185, status: 'Aktif' },
      { code: 'TP-02', name: 'Paket Pangan Sembako Duafa & Lansia', desc: 'Bantuan bahan pokok rutin bagi lansia sebatang kara dan prasejahtera.', budget: 2_600_000_000, realized: 1_650_000_000, mustahik: 4200, status: 'Aktif' },
      { code: 'TP-03', name: 'Santunan Rutin Yatim Piatu Dhuafa', desc: 'Uang saku bulanan dan beasiswa pembinaan anak yatim dhuafa.', budget: 1_400_000_000, realized: 750_000_000, mustahik: 1500, status: 'Aktif' },
      { code: 'TP-04', name: 'Dapur Umum & Tanggap Darurat Bencana (BTB)', desc: 'Logistik kedaruratan, evakuasi, dan relawan bencana alam.', budget: 1_000_000_000, realized: 335_000_000, mustahik: 616, status: 'Aktif' },
    ],
  },
  {
    id: 'PRG-TAKWA',
    pilarNum: '5',
    name: 'Tangerang Takwa',
    category: 'Dakwah & Advokasi Keumatan',
    pct: 78,
    sparkline: [20, 30, 42, 50, 60, 68, 74, 78],
    beneficiaries: 5423,
    brandColor: '#7c3aed',
    icon: BookOpen,
    bgBadge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    budget: 6_200_000_000,
    realized: 4_836_000_000,
    activities: 22_500,
    programsCount: 8,
    mainServices: '3 Layanan Utama',
    impactStatement: 'Syiar Islam semakin semarak, sarana ibadah bersih & makmur, bimbingan aqidah mualaf terpantau berkala.',
    metrics: {
      primaryLabel: 'Penerima Manfaat Dakwah',
      primaryValue: '5.423',
      primaryGrowth: '+12,5%',
      successRate: '94%',
      successCount: '5.097 Jiwa',
      avgAid: 'Rp 891 rb',
      activeProg: '8 Program',
      servicesCount: '3 Layanan Utama',
      districtsCovered: '13 / 13',
      newMustahik: '950 Jiwa',
    },
    monthlyData: [
      { month: 'Jan', realisasi: 380, target: 450 },
      { month: 'Feb', realisasi: 490, target: 500 },
      { month: 'Mar', realisasi: 780, target: 600 },
      { month: 'Apr', realisasi: 850, target: 650 },
      { month: 'Mei', realisasi: 820, target: 600 },
      { month: 'Jun', realisasi: 640, target: 550 },
      { month: 'Jul', realisasi: 510, target: 500 },
      { month: 'Agu', realisasi: 466, target: 500 },
      { month: 'Sep', realisasi: 0, target: 500 },
      { month: 'Okt', realisasi: 0, target: 500 },
      { month: 'Nov', realisasi: 0, target: 500 },
      { month: 'Des', realisasi: 0, target: 500 },
    ],
    asnafPie: [
      { name: 'Fisabilillah', value: 3150, pct: '58%', color: '#059669' },
      { name: 'Mualaf', value: 1250, pct: '23%', color: '#0d9488' },
      { name: 'Fakir', value: 680, pct: '13%', color: '#e11d48' },
      { name: 'Ibnu Sabil', value: 343, pct: '6%', color: '#2563eb' },
    ],
    topKecamatan: [
      { name: 'Pinang', count: 1240, pct: '23%' },
      { name: 'Cipondoh', count: 1180, pct: '22%' },
      { name: 'Tangerang', count: 1090, pct: '20%' },
      { name: 'Karawaci', count: 980, pct: '18%' },
      { name: 'Benda', count: 933, pct: '17%' },
    ],
    subPrograms: [
      { code: 'TT-01', name: 'Renovasi Tempat Wudhu & Toilet Musholla', desc: 'Perbaikan sarana sanitasi air bersih tempat ibadah perkampungan.', budget: 2_400_000_000, realized: 2_150_000_000, mustahik: 1200, status: 'Aktif' },
      { code: 'TT-02', name: 'Bimbingan Aqidah & Muamalah Mualaf Center', desc: 'Kelas rutin aqidah, fiqih ibadah, dan bantuan biaya hidup mualaf.', budget: 1_600_000_000, realized: 1_280_000_000, mustahik: 1450, status: 'Aktif' },
      { code: 'TT-03', name: 'Kafalah Guru Ngaji & Marbot Masjid Dhuafa', desc: 'Insentif bulanan bagi para penjaga dan pemakmur masjid dhuafa.', budget: 1_400_000_000, realized: 980_000_000, mustahik: 1800, status: 'Aktif' },
      { code: 'TT-04', name: 'Beasiswa Santri Kader Ulama & Tahfidz', desc: 'Kafalah beasiswa khusus calon huffadz dan kader ulama muda.', budget: 800_000_000, realized: 426_000_000, mustahik: 973, status: 'Aktif' },
    ],
  },
];

export default function ProgramBantuanPage({ onNavigate }) {
  const [selectedPilarId, setSelectedPilarId] = useState('PRG-SEHAT');
  const activePilar = useMemo(
    () => PILAR_MASTER.find((p) => p.id === selectedPilarId) || PILAR_MASTER[2],
    [selectedPilarId]
  );

  const [searchTerm, setSearchTerm] = useState('');
  const [showSimModal, setShowSimModal] = useState(false);

  const filteredSubPrograms = useMemo(() => {
    if (!searchTerm.trim()) return activePilar.subPrograms;
    const q = searchTerm.toLowerCase();
    return activePilar.subPrograms.filter(
      (sub) =>
        sub.name.toLowerCase().includes(q) ||
        sub.code.toLowerCase().includes(q) ||
        sub.desc.toLowerCase().includes(q)
    );
  }, [activePilar, searchTerm]);

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5 sm:space-y-6">
      {/* 1. TOP PILAR SELECTOR HUD CARDS (5 Cards with Sparklines) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {PILAR_MASTER.map((pilar) => {
          const isSelected = selectedPilarId === pilar.id;
          const sparkData = pilar.sparkline.map((val, i) => ({ i, val }));
          const Icon = pilar.icon;

          return (
            <button
              key={pilar.id}
              onClick={() => setSelectedPilarId(pilar.id)}
              className={`p-4 sm:p-5 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between group outline-none focus:outline-none focus-visible:outline-none select-none ${
                isSelected
                  ? 'bg-card border-emerald-600 shadow-md bg-emerald-50/20'
                  : 'bg-card border-border hover:border-zinc-300 hover:shadow-xs'
              }`}
            >
              {isSelected && <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: pilar.brandColor }} />}

              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-emerald-600 font-mono">
                    {pilar.pct}%
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">capaian</span>
                </div>
                <div
                  className="size-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                  style={{ backgroundColor: pilar.brandColor }}
                >
                  <Icon className="size-4" />
                </div>
              </div>

              <p className="text-xs font-semibold text-muted-foreground mb-1">
                {pilar.beneficiaries.toLocaleString('id-ID')} penerima manfaat
              </p>

              {/* Sparkline Graphic */}
              <div className="h-10 w-full my-1.5">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line
                      type="monotone"
                      dataKey="val"
                      stroke={pilar.brandColor}
                      strokeWidth={2.2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-1 pt-2 border-t border-border/70 flex items-center justify-between">
                <span className="text-xs sm:text-sm font-extrabold text-foreground truncate group-hover:text-emerald-700">
                  {pilar.name}
                </span>
                <Badge variant="outline" className={`text-[10px] font-bold py-0.5 px-2 ${pilar.bgBadge}`}>
                  Pilar {pilar.pilarNum}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. VALUE CHAIN SECTION: FULL WIDTH BALANCED 5-STEP SEQUENCE */}
      <Card className="shadow-xs border-border rounded-2xl overflow-hidden">
        <CardHeader className="p-5 pb-3 border-b border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg font-black text-foreground flex items-center gap-2">
              <span>Dari Anggaran ke Dampak Sosial — <span style={{ color: activePilar.brandColor }}>{activePilar.name}</span></span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Rantai transformasi dana zakat menjadi kemaslahatan nyata bagi kaum mustahik Kota Tangerang
            </CardDescription>
          </div>
          <Badge className={`text-xs font-bold px-3 py-1 self-start sm:self-auto ${activePilar.bgBadge}`}>
            Fokus: {activePilar.category}
          </Badge>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4 items-stretch">
            {/* Step 1: Anggaran */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">1. Anggaran RKAT</span>
                <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="size-4" />
                </div>
              </div>
              <div>
                <p className="text-lg sm:text-xl font-black font-mono text-foreground">{formatRupiah(activePilar.realized, true)}</p>
                <p className="text-xs text-emerald-600 font-bold mt-0.5">{activePilar.pct}% dari pagu tahunan</p>
              </div>
            </div>

            {/* Step 2: Intervensi */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">2. Intervensi</span>
                <div className="size-8 rounded-lg bg-blue-500/15 text-blue-600 flex items-center justify-center">
                  <Layers className="size-4" />
                </div>
              </div>
              <div>
                <p className="text-lg sm:text-xl font-black text-foreground">{activePilar.programsCount} Sub-Program</p>
                <p className="text-xs text-muted-foreground mt-0.5">{activePilar.mainServices}</p>
              </div>
            </div>

            {/* Step 3: Aktivitas */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">3. Aktivitas Layanan</span>
                <div className="size-8 rounded-lg bg-purple-500/15 text-purple-600 flex items-center justify-center">
                  <Users className="size-4" />
                </div>
              </div>
              <div>
                <p className="text-lg sm:text-xl font-black text-foreground">{activePilar.activities.toLocaleString('id-ID')} Kegiatan</p>
                <p className="text-xs text-muted-foreground mt-0.5">Periode Jan–Agu 2026</p>
              </div>
            </div>

            {/* Step 4: Output */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">4. Output Penerima</span>
                <div className="size-8 rounded-lg bg-teal-500/15 text-teal-600 flex items-center justify-center">
                  <CheckCircle2 className="size-4" />
                </div>
              </div>
              <div>
                <p className="text-lg sm:text-xl font-black text-foreground">{activePilar.beneficiaries.toLocaleString('id-ID')} Jiwa</p>
                <p className="text-xs text-emerald-600 font-bold mt-0.5">{activePilar.pct}% dari kuota target</p>
              </div>
            </div>

            {/* Step 5: Dampak */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col justify-between space-y-2 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-emerald-800 dark:text-emerald-300 tracking-wider">5. Dampak Nyata</span>
                <div className="size-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <HeartHandshake className="size-4" />
                </div>
              </div>
              <div>
                <p className="text-xs text-foreground font-semibold leading-snug">{activePilar.impactStatement}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. BALANCED 7:5 ROW: CHARTS (LEFT) & 6 KPIS (RIGHT WITH ZERO EMPTY SPACE) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
        {/* Monthly Trend & Projection (7 cols) */}
        <Card className="lg:col-span-7 shadow-xs border-border rounded-2xl flex flex-col justify-between space-y-5">
          <CardHeader className="p-5 pb-2 border-b border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Tren Penyaluran Bulanan
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Realisasi penyaluran vs target bulanan (Rp Juta)
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-emerald-600" /> Realisasi</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-blue-500/50" /> Target</span>
            </div>
          </CardHeader>

          <CardContent className="p-5 pt-0 space-y-4 flex-1 flex flex-col justify-between">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activePilar.monthlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.7} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 600 }} />
                  <Tooltip
                    formatter={(v) => [`Rp ${v} Juta`, '']}
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '0.75rem', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="realisasi" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" fill="#3b82f6" opacity={0.35} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Proyeksi Strip */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Proyeksi Serapan 2026:</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-black font-mono text-foreground">
                    {formatRupiah(activePilar.budget, true)}
                  </span>
                  <Badge variant="outline" className="text-xs font-bold text-emerald-700 bg-emerald-500/10 border-emerald-500/20">
                    102% target
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Pagu: <strong className="text-foreground">{formatRupiah(activePilar.budget, true)}</strong></span>
                <span>Sisa: <strong className="text-amber-600 font-mono">{formatRupiah(activePilar.budget - activePilar.realized, true)}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dampak Utama 6 KPI Matrix (5 cols, 2x3 Grid with NO vertical empty gap) */}
        <Card className="lg:col-span-5 shadow-xs border-border rounded-2xl flex flex-col justify-between space-y-4">
          <CardHeader className="p-5 pb-2 border-b border-border/70">
            <CardTitle className="text-base font-bold text-foreground">
              Dampak Utama — {activePilar.name}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Capaian performa intervensi program bagi mustahik
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-3 flex-1">
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">{activePilar.metrics.primaryLabel}</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.primaryValue}</p>
                  <p className="text-xs text-emerald-600 font-bold">{activePilar.metrics.primaryGrowth} vs lalu</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">Intervensi Sukses</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.successCount}</p>
                  <p className="text-xs text-emerald-600 font-bold">Tingkat {activePilar.metrics.successRate}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">Rata-rata Bantuan</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.avgAid}</p>
                  <p className="text-xs text-muted-foreground">Per mustahik</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">Program Aktif</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.activeProg}</p>
                  <p className="text-xs text-muted-foreground">{activePilar.metrics.servicesCount}</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">Kecamatan</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.districtsCovered}</p>
                  <p className="text-xs text-emerald-600 font-bold">100% tercakup</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/70 flex flex-col justify-between">
                <p className="text-xs font-semibold text-muted-foreground truncate">Mustahik Baru</p>
                <div>
                  <p className="text-xl font-black text-foreground font-mono">{activePilar.metrics.newMustahik}</p>
                  <p className="text-xs text-muted-foreground">Jan–Agu 2026</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. 3-CARD ANALYTICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Funnel */}
        <Card className="shadow-xs border-border rounded-2xl">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-emerald-600" /> Funnel Outcome Program
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Alur konversi proposal ke penyaluran</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-2.5">
            {activePilar.subPrograms.map((item, idx) => (
              <div key={item.code} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-muted-foreground truncate">{item.name}</span>
                  <span className="font-black text-foreground font-mono">{item.mustahik} Jiwa</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2 rounded-full"
                    style={{ width: `${Math.max(20, (item.realized / item.budget) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Card 2: Asnaf Pie */}
        <Card className="shadow-xs border-border rounded-2xl">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <Award className="size-4 text-emerald-600" /> Komposisi 8 Asnaf
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Distribusi hak mustahik</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            <div className="h-32 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={activePilar.asnafPie} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value">
                    {activePilar.asnafPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-xs">
              {activePilar.asnafPie.slice(0, 4).map((item) => (
                <div key={item.name} className="flex items-center justify-between p-1 rounded bg-muted/30">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} /> Asnaf {item.name}
                  </span>
                  <span className="font-mono font-bold text-foreground">{item.pct}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Top Kecamatan */}
        <Card className="shadow-xs border-border rounded-2xl">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <MapPin className="size-4 text-emerald-600" /> Top Kecamatan Penerima
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Peringkat sebaran tertinggi</CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-2">
            {activePilar.topKecamatan.map((kec, i) => (
              <div key={kec.name} className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border/60 text-xs">
                <span className="text-foreground font-semibold">{i + 1}. Kec. {kec.name}</span>
                <span className="font-black font-mono text-foreground">{kec.count.toLocaleString('id-ID')} Jiwa ({kec.pct})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* 5. SUB-PROGRAM TABLE */}
      <Card className="shadow-xs border-border rounded-2xl overflow-hidden">
        <CardHeader className="p-5 border-b border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
          <div>
            <CardTitle className="text-base font-black text-foreground">
              Portofolio Sub-Program — {activePilar.name} ({activePilar.subPrograms.length})
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Rincian alokasi anggaran, serapan kuota, dan status pelaksanaan
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b border-border text-xs uppercase font-bold text-muted-foreground tracking-wider">
                <tr>
                  <th className="px-5 py-3">Kode & Nama Program</th>
                  <th className="px-5 py-3">Pagu RKAT</th>
                  <th className="px-5 py-3">Realisasi Salur</th>
                  <th className="px-5 py-3">Mustahik</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {filteredSubPrograms.map((sub) => {
                  const subPct = Math.round((sub.realized / sub.budget) * 100);
                  return (
                    <tr key={sub.code} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-emerald-700 text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            {sub.code}
                          </span>
                          <span className="font-bold text-foreground">{sub.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-muted-foreground">{formatRupiah(sub.budget, true)}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-emerald-700">
                        {formatRupiah(sub.realized, true)} ({subPct}%)
                      </td>
                      <td className="px-5 py-3.5 text-foreground font-semibold">{sub.mustahik.toLocaleString('id-ID')} Jiwa</td>
                      <td className="px-5 py-3.5 text-center">
                        <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-500/10 font-bold">
                          {sub.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
