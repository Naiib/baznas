import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Coins,
  Search,
  Download,
  CheckCircle2,
  X,
  Target,
  Percent,
  ArrowUpRight
} from 'lucide-react';
import { RKAT_BUDGETS } from '../data/penerimaanData';
import { formatRupiah } from '../utils/format';

export default function RealisasiAnggaranPage() {
  const [budgets] = useState(RKAT_BUDGETS);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');

  // Toast notification state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Recalculate stats
  const stats = useMemo(() => {
    const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const absorptionRatio = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
    const remaining = Math.max(0, totalAllocated - totalSpent);

    return { totalAllocated, totalSpent, absorptionRatio, remaining };
  }, [budgets]);

  // Filter list
  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => {
      const matchSearch = b.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'Semua' || b.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [budgets, searchTerm, filterCategory]);

  const handleExport = () => {
    showToast('Mengekspor laporan realisasi penyerapan anggaran ke Excel...');
    setTimeout(() => {
      showToast('Laporan Realisasi_Anggaran.xlsx berhasil diunduh!', 'success');
    }, 2000);
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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Realisasi & Serapan Anggaran</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Pantau tingkat persentase penyerapan anggaran operasional dan penyaluran program BAZNAS
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleExport}>
            <Download className="size-3.5" /> Ekspor Realisasi
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Target className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Target RKAT</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.totalAllocated, true)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ArrowUpRight className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Realisasi Terserap</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.totalSpent, true)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Percent className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Rasio Serapan</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.absorptionRatio}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Coins className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Sisa Anggaran</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.remaining, true)}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Realization Progress Cards */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Tingkat Penyerapan Anggaran per Rencana Kerja</CardTitle>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari program..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs focus-visible:ring-emerald-500 border-border"
              />
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Kategori</option>
              <option value="Penyaluran">Penyaluran</option>
              <option value="Penerimaan">Penerimaan</option>
              <option value="Operasional">Operasional</option>
              <option value="Sarpras">Sarana Prasarana</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {filteredBudgets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              Tidak ada rencana anggaran RKAT yang sesuai.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredBudgets.map((b) => {
                const pct = Math.round((b.spent / b.allocated) * 100);
                const sisa = Math.max(0, b.allocated - b.spent);
                
                // Color mapping for progress bars
                const progressColorClass = 
                  pct >= 90 ? 'bg-amber-500' :
                  pct >= 75 ? 'bg-emerald-500' :
                  pct >= 50 ? 'bg-blue-500' :
                  'bg-rose-500';

                return (
                  <div key={b.id} className="p-4 bg-secondary/30 border border-border/50 rounded-xl space-y-3 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{b.category} • {b.id}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          pct >= 90 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30' :
                          pct >= 75 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30' :
                          pct >= 50 ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30' :
                          'bg-rose-100 text-rose-700 dark:bg-rose-950/30'
                        }`}>
                          {pct >= 90 ? 'Hampir Habis' : pct >= 75 ? 'Optimal' : pct >= 50 ? 'Moderat' : 'Rendah'}
                        </span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-foreground leading-snug">{b.program}</h3>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs font-semibold text-foreground">
                        <span>Serapan: {pct}%</span>
                        <span>Sisa: {formatRupiah(sisa, true)}</span>
                      </div>
                      <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${progressColorClass}`} 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                        <span>Realisasi: {formatRupiah(b.spent, true)}</span>
                        <span>Alokasi Pagu: {formatRupiah(b.allocated, true)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      
    </div>
  );
}
