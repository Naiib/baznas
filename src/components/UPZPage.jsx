import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Building,
  Search,
  Plus,
  CheckCircle2,
  X,
  User,
  ShieldCheck,
  TrendingUp,
  Award,
  Loader2
} from 'lucide-react';
import { UPZ_LIST } from '../data/penerimaanData';
import { formatRupiah } from '../utils/format';

export default function UPZPage() {
  const [upzList, setUpzList] = useState(UPZ_LIST);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Masjid');
  const [formContact, setFormContact] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formRealized, setFormRealized] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');

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
    const total = upzList.length;
    const active = upzList.filter(u => u.status === 'Aktif').length;
    const totalRealized = upzList.reduce((sum, u) => sum + u.realized, 0);
    const avgAchievement = Math.round(
      (upzList.reduce((sum, u) => sum + (u.realized / u.target), 0) / total) * 100
    );

    return { total, active, totalRealized, avgAchievement };
  }, [upzList]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formName || !formContact || !formTarget) {
      showToast('Harap lengkapi field wajib!', 'error');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const newUpz = {
        id: `UPZ-${String(upzList.length + 1).padStart(3, '0')}`,
        name: formName,
        category: formCategory,
        contact: formContact,
        target: parseFloat(formTarget),
        realized: formRealized ? parseFloat(formRealized) : 0,
        status: 'Aktif'
      };

      setUpzList([newUpz, ...upzList]);
      setIsSubmitting(false);
      setShowAddSheet(false);
      showToast(`UPZ baru "${formName}" berhasil didaftarkan!`);

      // Reset Form
      setFormName('');
      setFormContact('');
      setFormTarget('');
      setFormRealized('');
      setFormCategory('Masjid');
    }, 750);
  };

  // Filter list
  const filteredUpz = useMemo(() => {
    return upzList.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.contact.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = filterCategory === 'Semua' || u.category === filterCategory;
      const matchStatus = filterStatus === 'Semua' || u.status === filterStatus;
      return matchSearch && matchCategory && matchStatus;
    });
  }, [upzList, searchTerm, filterCategory, filterStatus]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Data UPZ (Unit Pengumpul Zakat)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Kelola data jaringan unit kerja pengumpul zakat di dinas, masjid, sekolah, dan swasta se-Kota Tangerang
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Daftar UPZ Baru
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Building className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total UPZ</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">UPZ Aktif</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.active}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total Pengumpulan</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[160px]" title={formatRupiah(stats.totalRealized)}>
                {formatRupiah(stats.totalRealized, true)}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Award className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Rata-rata Target</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.avgAchievement}%</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Daftar Jaringan UPZ</CardTitle>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari UPZ (Nama/Kontak/ID)..."
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
              <option value="Masjid">Masjid</option>
              <option value="Dinas">Dinas Pemerintah</option>
              <option value="BUMD">BUMD</option>
              <option value="Kecamatan">Kecamatan</option>
              <option value="Sekolah">Sekolah / Kampus</option>
              <option value="Swasta">Swasta</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Pasif">Pasif</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {filteredUpz.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Data UPZ</h3>
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
                  setFilterStatus('Semua');
                }}
              >
                Reset Pencarian
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">ID UPZ</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Nama Unit Pengumpul</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Kategori</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Penanggung Jawab</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Target RKAT</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Realisasi</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Persentase</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUpz.map((u, idx) => {
                  const pct = Math.round((u.realized / u.target) * 100);
                  return (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-muted-foreground">{u.id}</td>
                      <td className="px-4 py-3.5 font-bold text-foreground">{u.name}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{u.category}</td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1"><User className="size-3 text-muted-foreground/60 shrink-0" /> {u.contact}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-muted-foreground">
                        {formatRupiah(u.target, true)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-foreground">
                        {formatRupiah(u.realized, true)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={`font-semibold ${pct >= 90 ? 'text-emerald-600' : pct >= 60 ? 'text-blue-600' : 'text-amber-600'}`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                        }`}>
                          {u.status}
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

      {/* Sheet: Tambah UPZ */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Daftarkan UPZ Baru</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Catat data unit baru dalam jaringan kemitraan pengumpul BAZNAS Kota Tangerang
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Unit Pengumpul Zakat (UPZ)</label>
              <Input
                placeholder="Contoh: UPZ Masjid Jami Al-Muhajirin"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kategori UPZ</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Masjid">Masjid</option>
                <option value="Dinas">Dinas Pemerintah</option>
                <option value="BUMD">BUMD</option>
                <option value="Kecamatan">Kecamatan</option>
                <option value="Sekolah">Sekolah / Kampus</option>
                <option value="Swasta">Swasta</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Penanggung Jawab / Kontak</label>
              <Input
                placeholder="Contoh: H. Ahmad Subardjo, S.Pd"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Target RKAT Tahunan (IDR)</label>
              <Input
                type="number"
                placeholder="Contoh: 250000000"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
              {formTarget && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in pl-1">
                  Format: {formatRupiah(parseFloat(formTarget) || 0)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Realisasi Awal (IDR - Opsional)</label>
              <Input
                type="number"
                placeholder="Contoh: 20000000"
                value={formRealized}
                onChange={(e) => setFormRealized(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
              />
              {formRealized && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in pl-1">
                  Format: {formatRupiah(parseFloat(formRealized) || 0)}
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
                  'Daftarkan UPZ'
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
