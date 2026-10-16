import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Download,
  Filter,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Award,
  Loader2
} from 'lucide-react';
import { UPZ_LIST } from '../data/penerimaanData';
import { formatRupiah, formatRupiahChart } from '../utils/format';

const chartConfig = {
  realized: { label: 'Realisasi (Rp)', color: 'var(--chart-1)' }
};

export default function LaporanUPZPage() {
  const [upzList] = useState(UPZ_LIST);

  // Filter states
  const [filterCategory, setFilterCategory] = useState('Semua');
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

  // Perform dynamic filtering on memo
  const filteredUpz = useMemo(() => {
    return upzList.filter(u => {
      // Category filter
      const matchCategory = filterCategory === 'Semua' || u.category === filterCategory;
      
      // Search term
      const matchSearch = !searchTerm || 
                          u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.contact.toLowerCase().includes(searchTerm.toLowerCase());
                          
      return matchCategory && matchSearch;
    });
  }, [upzList, filterCategory, searchTerm]);

  // Totals calculations
  const summary = useMemo(() => {
    const totalTarget = filteredUpz.reduce((sum, u) => sum + u.target, 0);
    const totalRealized = filteredUpz.reduce((sum, u) => sum + u.realized, 0);
    const difference = Math.max(0, totalTarget - totalRealized);
    const percentage = totalTarget > 0 ? Math.round((totalRealized / totalTarget) * 100) : 0;

    return { totalTarget, totalRealized, difference, percentage };
  }, [filteredUpz]);

  // Top 5 UPZ for Chart
  const chartData = useMemo(() => {
    return [...filteredUpz]
      .sort((a, b) => b.realized - a.realized)
      .slice(0, 5)
      .map(u => ({
        name: u.name.replace('UPZ ', '').replace('Dinas ', 'Dis').substring(0, 15),
        realized: u.realized,
      }));
  }, [filteredUpz]);

  const handleExport = (format) => {
    setIsExporting(format);
    showToast(`Sedang menyiapkan laporan audit UPZ dalam format ${format.toUpperCase()}...`);
    setTimeout(() => {
      showToast(`Berkas Rekap_Pengumpulan_UPZ.${format} berhasil diunduh!`, 'success');
      setIsExporting(null);
    }, 1500);
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-3 sm:space-y-4 md:space-y-5 relative">
      
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border shadow-2xl rounded-xl p-4 animate-fade-in pr-10 min-w-[300px]">
          <CheckCircle2 className={`size-5 shrink-0 ${toast.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`} />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              {toast.type === 'success' ? 'Berhasil' : 'Pemberitahuan'}
            </span>
            <span className="text-[11px] text-muted-foreground">{toast.message}</span>
          </div>
          <button 
            onClick={() => setToast(prev => ({ ...prev, show: false }))}
            className="absolute top-2 right-2 text-muted-foreground/60 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Laporan Audit UPZ</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Unduh rekapitulasi data setoran pengumpulan zakat infak dari unit-unit UPZ aktif
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={isExporting !== null}
            className="h-8 text-xs bg-card hover:bg-muted text-foreground gap-1.5 border-border" 
            onClick={() => handleExport('xlsx')}
          >
            {isExporting === 'xlsx' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            Ekspor Excel
          </Button>
          <Button 
            size="sm" 
            disabled={isExporting !== null}
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" 
            onClick={() => handleExport('pdf')}
          >
            {isExporting === 'pdf' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Unduh PDF
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both">
        <CardHeader className="pb-2.5 border-b border-border/60">
          <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Filter className="size-4 text-emerald-600" /> Filter Kategori Setoran
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari nama UPZ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs focus-visible:ring-emerald-500 border-border"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-8 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground shrink-0 sm:w-48"
          >
            <option value="Semua">Semua Kategori</option>
            <option value="Masjid">Masjid</option>
            <option value="Dinas">Dinas Pemerintah</option>
            <option value="BUMD">BUMD</option>
            <option value="Kecamatan">Kecamatan</option>
            <option value="Sekolah">Sekolah / Kampus</option>
            <option value="Swasta">Swasta</option>
          </select>
        </CardContent>
      </Card>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both delay-100">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Total Target Anggaran UPZ</span>
            <h3 className="text-lg sm:text-xl font-bold mt-1 text-foreground">
              {formatRupiah(summary.totalTarget)}
            </h3>
          </CardContent>
        </Card>
        <Card className="shadow-card bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30">
          <CardContent className="p-4">
            <span className="text-[10px] text-emerald-800 dark:text-emerald-400 uppercase block font-semibold">Realisasi Penerimaan UPZ</span>
            <h3 className="text-lg sm:text-xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {formatRupiah(summary.totalRealized)} ({summary.percentage}%)
            </h3>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Kekurangan Target (Sisa Pagu)</span>
            <h3 className="text-lg sm:text-xl font-bold mt-1 text-muted-foreground">
              {formatRupiah(summary.difference)}
            </h3>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Table Section */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_2fr] gap-3 sm:gap-4 animate-fade-in-up fill-mode-both delay-200">
        
        {/* Top 5 UPZ chart */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
              <Award className="size-4 text-emerald-600" /> Top 5 UPZ Teraktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
                Tidak ada data grafik.
              </div>
            ) : (
              <div className="h-[220px] w-full">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeOpacity={0.4} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
                      tickFormatter={formatRupiahChart}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatRupiah(v)} />} />
                    <Bar dataKey="realized" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit list table */}
        <Card className="shadow-card flex flex-col">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-xs sm:text-sm font-semibold">Tabel Hasil Audit Pengumpulan UPZ</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-auto flex-1">
            {filteredUpz.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center animate-page-enter">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-2">
                  <Search className="size-5 text-muted-foreground/60" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Tidak Ada Hasil Audit</h4>
                <p className="text-[10px] text-muted-foreground max-w-xs mt-0.5">
                  Kata kunci penyaringan Anda tidak mencocokkan records audit apa pun.
                </p>
                <Button 
                  variant="outline" 
                  size="xs" 
                  className="mt-3 h-7 text-[10px] font-semibold px-2.5"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterCategory('Semua');
                  }}
                >
                  Reset Saringan
                </Button>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-muted/40">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground">ID UPZ</th>
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground">Nama Unit Pengumpul</th>
                    <th className="px-3 py-2.5 font-semibold text-muted-foreground">Kategori</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Target</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Setoran</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">% Capaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUpz.map((u, idx) => {
                    const pct = Math.round((u.realized / u.target) * 100);
                    return (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 text-muted-foreground font-medium">{u.id}</td>
                        <td className="px-3 py-2.5 font-bold text-foreground">{u.name}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{u.category}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-muted-foreground">{formatRupiah(u.target, true)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-foreground">{formatRupiah(u.realized, true)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pct >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30'
                          }`}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
