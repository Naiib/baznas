import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Landmark,
  Search,
  Plus,
  CheckCircle2,
  X,
  Target,
  Coins,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { RKAT_BUDGETS } from '../data/penerimaanData';
import { formatRupiah } from '../utils/format';

export default function RKATPage() {
  const [budgets, setBudgets] = useState(RKAT_BUDGETS);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formProgram, setFormProgram] = useState('');
  const [formCategory, setFormCategory] = useState('Penyaluran');
  const [formAllocated, setFormAllocated] = useState('');
  const [formSpent, setFormSpent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');

  // Custom Toast State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Recalculate quick stats
  const stats = useMemo(() => {
    const totalAllocated = budgets.reduce((sum, b) => sum + b.allocated, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const absorptionRatio = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
    const remaining = Math.max(0, totalAllocated - totalSpent);

    return { totalAllocated, totalSpent, absorptionRatio, remaining };
  }, [budgets]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formProgram || !formAllocated) {
      showToast('Harap lengkapi kolom wajib!', 'error');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const newBudget = {
        id: `RKAT-${String(budgets.length + 1).padStart(2, '0')}`,
        program: formProgram,
        allocated: parseFloat(formAllocated),
        spent: formSpent ? parseFloat(formSpent) : 0,
        category: formCategory
      };

      setBudgets([...budgets, newBudget]);
      setIsSubmitting(false);
      setShowAddSheet(false);
      showToast(`Program RKAT "${formProgram}" berhasil dialokasikan!`);

      // Reset Form
      setFormProgram('');
      setFormAllocated('');
      setFormSpent('');
      setFormCategory('Penyaluran');
    }, 750);
  };

  // Filter list
  const filteredBudgets = useMemo(() => {
    return budgets.filter(b => {
      const matchSearch = b.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'Semua' || b.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [budgets, searchTerm, filterCategory]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">RKAT (Rencana Kerja & Anggaran Tahunan)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Kelola pagu anggaran operasional amil dan alokasi dana penyaluran pilar BAZNAS Kota Tangerang
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Alokasikan Pagu RKAT
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Landmark className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total Pagu RKAT</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.totalAllocated, true)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Target className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Pagu Terserap</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.totalSpent, true)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Rasio Penyerapan</p>
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
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Sisa Saldo Pagu</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[160px]">{formatRupiah(stats.remaining, true)}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Tabel Anggaran RKAT Komponen Program</CardTitle>
          
          {/* Filters */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari program RKAT (Nama/ID)..."
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
        <CardContent className="p-0 overflow-auto">
          {filteredBudgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Data RKAT</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Kata kunci atau kategori pencarian Anda tidak mencocokkan rekod data apa pun.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 h-8 text-xs font-semibold"
                onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('Semua');
                }}
              >
                Reset Pencarian
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">ID RKAT</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Deskripsi Rencana Program</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Kategori</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Target RKAT</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Realisasi Serapan</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Sisa Anggaran</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredBudgets.map((b, idx) => {
                  const pct = Math.round((b.spent / b.allocated) * 100);
                  const sisa = Math.max(0, b.allocated - b.spent);
                  return (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-muted-foreground">{b.id}</td>
                      <td className="px-4 py-3.5 font-bold text-foreground">{b.program}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium bg-secondary text-foreground`}>
                          {b.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-muted-foreground">
                        {formatRupiah(b.allocated, true)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-foreground">
                        {formatRupiah(b.spent, true)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-muted-foreground">
                        {formatRupiah(sisa, true)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pct >= 90 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30'
                          }`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Tambah RKAT */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Alokasikan Anggaran RKAT</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Catat entri rencana kerja tahunan baru lengkap dengan nilai pagu nominal yang direncanakan
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Rencana Kerja / Program</label>
              <Input
                placeholder="Contoh: Bantuan Beasiswa Pendidikan Luar Negeri"
                value={formProgram}
                onChange={(e) => setFormProgram(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kategori RKAT</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Penyaluran">Penyaluran (Mustahik / Pilar BAZNAS)</option>
                <option value="Penerimaan">Penerimaan (Pengumpulan ZIS)</option>
                <option value="Operasional">Operasional (Gaji / Kantor / Amil)</option>
                <option value="Sarpras">Sarana Prasarana (Investasi / Renovasi)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Pagu RKAT yang Dialokasikan (IDR)</label>
              <Input
                type="number"
                placeholder="Contoh: 500000000"
                value={formAllocated}
                onChange={(e) => setFormAllocated(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
              {formAllocated && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in pl-1">
                  Format: {formatRupiah(parseFloat(formAllocated) || 0)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Serapan Awal Terpakai (IDR - Opsional)</label>
              <Input
                type="number"
                placeholder="Contoh: 10000000"
                value={formSpent}
                onChange={(e) => setFormSpent(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
              />
              {formSpent && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in pl-1">
                  Format: {formatRupiah(parseFloat(formSpent) || 0)}
                </p>
              )}
            </div>

            <div className="pt-4 flex gap-2 border-t border-border mt-6">
              <Button type="button" variant="outline" disabled={isSubmitting} className="flex-1 text-xs h-9" onClick={() => setShowAddSheet(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5">
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  'Alokasikan Dana'
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
