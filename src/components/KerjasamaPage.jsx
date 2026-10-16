import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Handshake,
  Search,
  Plus,
  CheckCircle2,
  X,
  Calendar,
  Wallet,
  FileText,
  CalendarDays,
  Loader2
} from 'lucide-react';
import { KERJASAMA_LIST } from '../data/penerimaanData';
import { formatRupiah } from '../utils/format';

export default function KerjasamaPage() {
  const [partnerList, setPartnerList] = useState(KERJASAMA_LIST);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formPartner, setFormPartner] = useState('');
  const [formProgram, setFormProgram] = useState('');
  const [formBudget, setFormBudget] = useState('');
  const [formStart, setFormStart] = useState(new Date().toISOString().split('T')[0]);
  const [formEnd, setFormEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
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
    const total = partnerList.length;
    const active = partnerList.filter(p => p.status === 'Aktif').length;
    const totalBudget = partnerList.reduce((sum, p) => sum + p.budget, 0);

    return { total, active, totalBudget };
  }, [partnerList]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formPartner || !formProgram || !formBudget || !formEnd) {
      showToast('Harap lengkapi field wajib!', 'error');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const newPartner = {
        id: `MOU-${String(partnerList.length + 1).padStart(3, '0')}`,
        partner: formPartner,
        program: formProgram,
        budget: parseFloat(formBudget),
        startDate: formStart,
        endDate: formEnd,
        status: 'Aktif'
      };

      setPartnerList([newPartner, ...partnerList]);
      setIsSubmitting(false);
      setShowAddSheet(false);
      showToast(`MoU Kemitraan dengan "${formPartner}" berhasil ditandatangani!`);

      // Reset Form
      setFormPartner('');
      setFormProgram('');
      setFormBudget('');
      setFormEnd('');
    }, 750);
  };

  // Filter list
  const filteredPartners = useMemo(() => {
    return partnerList.filter(p => {
      const matchSearch = p.partner.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = filterStatus === 'Semua' || p.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [partnerList, searchTerm, filterStatus]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Kerja Sama & Kemitraan (MoU)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Kelola berkas kerja sama dengan perbankan syariah, yayasan, korporasi (CSR), dan instansi vertikal
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Buat MoU Baru
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Handshake className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total MoU Terjalin</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Kerja Sama Aktif</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.active}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Wallet className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total Nilai Pagu Mitra</p>
              <h3 className="text-base sm:text-lg font-bold text-foreground mt-0.5 truncate max-w-[190px]" title={formatRupiah(stats.totalBudget)}>
                {formatRupiah(stats.totalBudget, true)}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Daftar Dokumen Kemitraan Aktif</CardTitle>
          
          {/* Filters */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari Mitra (Nama/ID/Program)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs focus-visible:ring-emerald-500 border-border"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Status</option>
              <option value="Aktif">Aktif</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {filteredPartners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Data MoU</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Kata kunci atau kategori pencarian Anda tidak mencocokkan rekod data apa pun.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 h-8 text-xs font-semibold"
                onClick={() => {
                  setSearchTerm('');
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">No. Dokumen</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Mitra / Partner</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Program Kerja Sama</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Pagu Kontribusi</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Masa Berlaku</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPartners.map((p, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-muted-foreground">{p.id}</td>
                    <td className="px-4 py-3.5 font-bold text-foreground">{p.partner}</td>
                    <td className="px-4 py-3.5 text-muted-foreground font-medium flex items-center gap-1">
                      <FileText className="size-3 text-muted-foreground/60" /> {p.program}
                    </td>
                    <td className="px-4 py-3.5 text-right font-black text-foreground">
                      {formatRupiah(p.budget)}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="size-3 text-muted-foreground/60" /> {p.startDate} s/d {p.endDate}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Tambah MoU */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Buat Kerja Sama Baru (MoU)</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Catat kemitraan dan pagu alokasi dana khusus yang disepakati oleh lembaga mitra
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Instansi / Lembaga Mitra</label>
              <Input
                placeholder="Contoh: CSR PT PLN (Persero), Bank Mandiri"
                value={formPartner}
                onChange={(e) => setFormPartner(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Program Kerja Sama</label>
              <Input
                placeholder="Contoh: Pengadaan Ambulans Siaga, Program Bedah Mushola"
                value={formProgram}
                onChange={(e) => setFormProgram(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Pagu Alokasi Dana Mitra (IDR)</label>
              <Input
                type="number"
                placeholder="Contoh: 150000000"
                value={formBudget}
                onChange={(e) => setFormBudget(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
              {formBudget && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in pl-1">
                  Format: {formatRupiah(parseFloat(formBudget) || 0)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tanggal Mulai Kerja Sama</label>
              <Input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tanggal Berakhir MoU</label>
              <Input
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
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
                  'Tanda Tangani MoU'
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
