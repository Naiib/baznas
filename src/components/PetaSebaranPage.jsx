import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  MapPin,
  Users,
  HeartHandshake,
  TrendingUp,
  DollarSign,
  Search,
  Filter,
  Layers,
  GraduationCap,
  HeartPulse,
  AlertTriangle,
  Coins,
  BookOpen,
  ArrowUpRight,
  Compass,
  CheckCircle2,
  Building2
} from 'lucide-react';
import { formatRupiah } from '../utils/format';

// 13 Kecamatan di Kota Tangerang dengan data sebaran realistis BAZNAS
const KECAMATAN_DATA = [
  {
    id: 'ciledug',
    name: 'Ciledug',
    totalMustahik: 540,
    totalDisalurkan: 185_000_000,
    desil1Count: 120,
    topProgram: 'Kemanusiaan (Sembako & RTLH)',
    pilarBreakdown: { pendidikan: 45_000_000, kesehatan: 35_000_000, kemanusiaan: 65_000_000, ekonomi: 25_000_000, dakwah: 15_000_000 },
    kelurahanList: ['Paninggilan', 'Paninggilan Utara', 'Parung Serab', 'Sudimara Barat', 'Sudimara Jaya', 'Sudimara Selatan', 'Sudimara Timur', 'Tajur'],
    urgencyLevel: 'Tinggi',
  },
  {
    id: 'cipondoh',
    name: 'Cipondoh',
    totalMustahik: 620,
    totalDisalurkan: 210_000_000,
    desil1Count: 150,
    topProgram: 'Pendidikan (Beasiswa Duafa)',
    pilarBreakdown: { pendidikan: 75_000_000, kesehatan: 40_000_000, kemanusiaan: 50_000_000, ekonomi: 30_000_000, dakwah: 15_000_000 },
    kelurahanList: ['Cipondoh', 'Cipondoh Indah', 'Cipondoh Makmur', 'Gondrong', 'Kenanga', 'Petir', 'Poris Plawad', 'Poris Plawad Indah', 'Poris Plawad Utara', 'Ketapang'],
    urgencyLevel: 'Tinggi',
  },
  {
    id: 'tangerang',
    name: 'Tangerang (Kota)',
    totalMustahik: 480,
    totalDisalurkan: 165_000_000,
    desil1Count: 95,
    topProgram: 'Ekonomi (Modal Usaha UMKM)',
    pilarBreakdown: { pendidikan: 40_000_000, kesehatan: 30_000_000, kemanusiaan: 45_000_000, ekonomi: 40_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Babakan', 'Buaran Indah', 'Cikokol', 'Kelapa Indah', 'Sukarasa', 'Sukasari', 'Tanah Tinggi'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'karawaci',
    name: 'Karawaci',
    totalMustahik: 590,
    totalDisalurkan: 198_000_000,
    desil1Count: 140,
    topProgram: 'Kesehatan (Bantuan Medis RSU)',
    pilarBreakdown: { pendidikan: 45_000_000, kesehatan: 65_000_000, kemanusiaan: 48_000_000, ekonomi: 25_000_000, dakwah: 15_000_000 },
    kelurahanList: ['Bojong Jaya', 'Bugel', 'Cimone', 'Cimone Jaya', 'Gerendeng', 'Karawaci', 'Karawaci Baru', 'Koang Jaya', 'Margasari', 'Nambo Jaya', 'Nusa Jaya', 'Pabuaran', 'Pabuaran Tumpeng', 'Pasar Baru', 'Sukajadi', 'Sumur Pacing'],
    urgencyLevel: 'Tinggi',
  },
  {
    id: 'batuceper',
    name: 'Batuceper',
    totalMustahik: 410,
    totalDisalurkan: 140_000_000,
    desil1Count: 88,
    topProgram: 'Kemanusiaan (Santunan Yatim)',
    pilarBreakdown: { pendidikan: 35_000_000, kesehatan: 25_000_000, kemanusiaan: 50_000_000, ekonomi: 20_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Batuceper', 'Batujaya', 'Batusari', 'Kebon Besar', 'Poris Gaga', 'Poris Gaga Baru', 'Poris Jaya'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'benda',
    name: 'Benda',
    totalMustahik: 380,
    totalDisalurkan: 130_000_000,
    desil1Count: 90,
    topProgram: 'Pendidikan (Alat Sekolah)',
    pilarBreakdown: { pendidikan: 45_000_000, kesehatan: 20_000_000, kemanusiaan: 40_000_000, ekonomi: 15_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Belendung', 'Benda', 'Jurumudi', 'Jurumudi Baru', 'Pajang'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'cibodas',
    name: 'Cibodas',
    totalMustahik: 490,
    totalDisalurkan: 168_000_000,
    desil1Count: 105,
    topProgram: 'Ekonomi (Z-Chicken & Z-Mart)',
    pilarBreakdown: { pendidikan: 40_000_000, kesehatan: 30_000_000, kemanusiaan: 48_000_000, ekonomi: 38_000_000, dakwah: 12_000_000 },
    kelurahanList: ['Cibodas', 'Cibodasari', 'Cibodas Baru', 'Jatiuwung', 'Panunggangan Barat', 'Uwung Jaya'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'jatiuwung',
    name: 'Jatiuwung',
    totalMustahik: 460,
    totalDisalurkan: 155_000_000,
    desil1Count: 110,
    topProgram: 'Kemanusiaan (Sembako Duafa)',
    pilarBreakdown: { pendidikan: 38_000_000, kesehatan: 27_000_000, kemanusiaan: 55_000_000, ekonomi: 23_000_000, dakwah: 12_000_000 },
    kelurahanList: ['Alam Jaya', 'Gandasari', 'Jatake', 'Keroncong', 'Manis Jaya', 'Pasir Jaya'],
    urgencyLevel: 'Tinggi',
  },
  {
    id: 'larangan',
    name: 'Larangan',
    totalMustahik: 430,
    totalDisalurkan: 148_000_000,
    desil1Count: 75,
    topProgram: 'Pendidikan (Santri Ponpes)',
    pilarBreakdown: { pendidikan: 50_000_000, kesehatan: 28_000_000, kemanusiaan: 40_000_000, ekonomi: 20_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Cipadu', 'Cipadu Jaya', 'Gaga', 'Kreo', 'Kreo Selatan', 'Larangan Indah', 'Larangan Selatan', 'Larangan Utara'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'neglasari',
    name: 'Neglasari',
    totalMustahik: 510,
    totalDisalurkan: 176_000_000,
    desil1Count: 135,
    topProgram: 'Kemanusiaan (Bedah Rumah)',
    pilarBreakdown: { pendidikan: 42_000_000, kesehatan: 32_000_000, kemanusiaan: 62_000_000, ekonomi: 25_000_000, dakwah: 15_000_000 },
    kelurahanList: ['Karang Anyar', 'Karangsari', 'Kedaung Baru', 'Kedaung Wetan', 'Mekar Sari', 'Neglasari', 'Selapajang Jaya'],
    urgencyLevel: 'Tinggi',
  },
  {
    id: 'periuk',
    name: 'Periuk',
    totalMustahik: 470,
    totalDisalurkan: 160_000_000,
    desil1Count: 115,
    topProgram: 'Kesehatan & Sanitasi',
    pilarBreakdown: { pendidikan: 38_000_000, kesehatan: 45_000_000, kemanusiaan: 47_000_000, ekonomi: 20_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Gebang Raya', 'Gembor', 'Periuk', 'Periuk Jaya', 'Sangiang Jaya'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'pinang',
    name: 'Pinang',
    totalMustahik: 440,
    totalDisalurkan: 152_000_000,
    desil1Count: 85,
    topProgram: 'Ekonomi (Bina Mandiri)',
    pilarBreakdown: { pendidikan: 42_000_000, kesehatan: 28_000_000, kemanusiaan: 42_000_000, ekonomi: 30_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Cipete', 'Kunciran', 'Kunciran Indah', 'Kunciran Jaya', 'Nerogtog', 'Pakojan', 'Panunggangan', 'Panunggangan Timur', 'Panunggangan Utara', 'Pinang', 'Sudimara Pinang'],
    urgencyLevel: 'Sedang',
  },
  {
    id: 'karang_tengah',
    name: 'Karang Tengah',
    totalMustahik: 420,
    totalDisalurkan: 145_000_000,
    desil1Count: 80,
    topProgram: 'Pendidikan (Beasiswa D3/S1)',
    pilarBreakdown: { pendidikan: 48_000_000, kesehatan: 27_000_000, kemanusiaan: 40_000_000, ekonomi: 20_000_000, dakwah: 10_000_000 },
    kelurahanList: ['Karang Mulya', 'Karang Tengah', 'Karang Timur', 'Parung Jaya', 'Pedurenan', 'Pondok Bahar', 'Pondok Pucung'],
    urgencyLevel: 'Sedang',
  },
];

export default function PetaSebaranPage({ onNavigate }) {
  const [selectedKecamatan, setSelectedKecamatan] = useState(KECAMATAN_DATA[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState('Semua');

  // Aggregates
  const totals = useMemo(() => {
    const totalMustahik = KECAMATAN_DATA.reduce((sum, k) => sum + k.totalMustahik, 0);
    const totalDana = KECAMATAN_DATA.reduce((sum, k) => sum + k.totalDisalurkan, 0);
    const totalDesil1 = KECAMATAN_DATA.reduce((sum, k) => sum + k.desil1Count, 0);
    const totalKecamatan = KECAMATAN_DATA.length;
    return { totalMustahik, totalDana, totalDesil1, totalKecamatan };
  }, []);

  const filteredList = useMemo(() => {
    return KECAMATAN_DATA.filter((k) => {
      const matchSearch = k.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchUrgency = filterUrgency === 'Semua' || k.urgencyLevel === filterUrgency;
      return matchSearch && matchUrgency;
    });
  }, [searchTerm, filterUrgency]);

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5 sm:space-y-6">
      {/* Header Banner */}
      <div className="bg-card p-5 sm:p-6 rounded-2xl border border-border shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Compass className="size-6 text-emerald-600 shrink-0" />
              Peta Sebaran & GIS Penyaluran Wilayah
            </h1>
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[11px] font-bold">
              13 Kecamatan Kota Tangerang
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Sistem pemantauan geospasial penyaluran dana ZIS BAZNAS untuk menjamin pemerataan bantuan, mendeteksi kantong kemiskinan ekstrem (Desil 1), dan mencegah tumpang tindih distribusi.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer px-3.5"
            onClick={() => onNavigate && onNavigate('mustahik')}
          >
            <Users className="size-3.5" /> Buka Data Mustahik
          </Button>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="shadow-xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Cakupan Wilayah</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground">13 Kecamatan</h3>
              <p className="text-[10px] text-muted-foreground">104 Kelurahan Aktif</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Mustahik</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground">{totals.totalMustahik.toLocaleString('id-ID')}</h3>
              <p className="text-[10px] text-emerald-600 font-semibold">Terdistribusi Merata</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <DollarSign className="size-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Dana Disalurkan</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground">{formatRupiah(totals.totalDana, true)}</h3>
              <p className="text-[10px] text-muted-foreground">Realisasi Tahun Berjalan</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Kantong Desil 1 BPS</p>
              <h3 className="text-lg sm:text-xl font-black text-foreground">{totals.totalDesil1.toLocaleString('id-ID')} KK</h3>
              <p className="text-[10px] text-rose-600 font-semibold">Prioritas Asesmen</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Interactive GIS Map & Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left (8 Cols): Interactive Kecamatan Matrix & Heatmap Grid */}
        <Card className="lg:col-span-7 xl:col-span-8 shadow-xs border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 border-b border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <MapPin className="size-4 text-emerald-600" />
                Daftar & Kepadatan Penyaluran per Kecamatan
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Klik salah satu kecamatan untuk melihat rincian 5 pilar program & kelurahan
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input
                  placeholder="Cari Kecamatan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-7.5 pl-7 text-[11px] rounded-lg"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {filteredList.map((k) => {
                const isSelected = selectedKecamatan.id === k.id;
                const percentShare = Math.round((k.totalMustahik / totals.totalMustahik) * 100);

                return (
                  <button
                    key={k.id}
                    onClick={() => setSelectedKecamatan(k)}
                    className={`p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 shadow-sm ring-2 ring-emerald-500/20'
                        : 'bg-card border-border hover:border-emerald-300 dark:hover:border-emerald-800 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-bold text-foreground text-xs group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                        {k.name}
                      </span>
                      <Badge
                        className={`text-[9px] px-1.5 py-0 font-bold ${
                          k.urgencyLevel === 'Tinggi'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200'
                            : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-200'
                        }`}
                      >
                        {k.urgencyLevel}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Mustahik:</span>
                        <span className="font-bold text-foreground">{k.totalMustahik} Jiwa</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Dana:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatRupiah(k.totalDisalurkan, true)}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${percentShare * 3}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right (5 Cols): Selected Kecamatan Detail Dossier */}
        <Card className="lg:col-span-5 xl:col-span-4 shadow-xs border-border rounded-2xl overflow-hidden flex flex-col">
          <CardHeader className="p-4 sm:p-5 border-b border-border bg-emerald-950 text-white relative">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-emerald-300/80 tracking-widest">Detail Wilayah</p>
                <CardTitle className="text-lg font-black text-white mt-0.5">
                  Kecamatan {selectedKecamatan.name}
                </CardTitle>
              </div>
              <Badge className="bg-emerald-600 text-white font-bold text-xs">
                {selectedKecamatan.kelurahanList.length} Kelurahan
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto text-xs">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground font-medium">Mustahik Terdata</p>
                <p className="text-base font-black text-foreground mt-0.5">{selectedKecamatan.totalMustahik} Orang</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground font-medium">Kantong Desil 1</p>
                <p className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">{selectedKecamatan.desil1Count} KK</p>
              </div>
            </div>

            {/* Total Penyaluran in Kecamatan */}
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1">
              <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Total Penyaluran Dana ZIS</p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                {formatRupiah(selectedKecamatan.totalDisalurkan)}
              </p>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 font-medium">
                Program Dominan: <span className="font-bold">{selectedKecamatan.topProgram}</span>
              </p>
            </div>

            {/* Alokasi 5 Pilar di Kecamatan Ini */}
            <div className="space-y-2">
              <p className="font-bold text-foreground text-xs flex items-center justify-between">
                <span>Alokasi 5 Pilar di {selectedKecamatan.name}</span>
              </p>
              <div className="space-y-1.5">
                {[
                  { label: 'Tangerang Cerdas (Pendidikan)', amount: selectedKecamatan.pilarBreakdown.pendidikan, color: '#2563eb' },
                  { label: 'Tangerang Sehat (Kesehatan)', amount: selectedKecamatan.pilarBreakdown.kesehatan, color: '#059669' },
                  { label: 'Tangerang Peduli (Sosial)', amount: selectedKecamatan.pilarBreakdown.kemanusiaan, color: '#e11d48' },
                  { label: 'Tangerang Makmur (Ekonomi)', amount: selectedKecamatan.pilarBreakdown.ekonomi, color: '#d97706' },
                  { label: 'Tangerang Takwa (Dakwah)', amount: selectedKecamatan.pilarBreakdown.dakwah, color: '#7c3aed' },
                ].map((item) => (
                  <div key={item.label} className="p-2 rounded-lg bg-muted/30 border border-border/60 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-foreground font-medium">{item.label}</span>
                    </div>
                    <span className="font-bold text-foreground shrink-0">{formatRupiah(item.amount, true)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Kelurahan List in Selected Kecamatan */}
            <div className="space-y-1.5">
              <p className="font-bold text-foreground text-xs">Kelurahan Terdaftar ({selectedKecamatan.kelurahanList.length}):</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedKecamatan.kelurahanList.map((kel) => (
                  <Badge key={kel} variant="secondary" className="text-[10px] font-medium">
                    {kel}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
