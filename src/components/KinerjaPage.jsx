import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Award,
  Search,
  Plus,
  CheckCircle2,
  X,
  Star,
  BarChart3,
  TrendingUp
} from 'lucide-react';
import { KINERJA_LIST } from '../data/penerimaanData';

export default function KinerjaPage() {
  const [performances, setPerformances] = useState(KINERJA_LIST);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formPeriod, setFormPeriod] = useState('Juni 2026');
  const [formScore, setFormScore] = useState('');

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDivision, setFilterDivision] = useState('Semua');
  const [filterGrade, setFilterGrade] = useState('Semua');

  // Custom Toast State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Recalculate stats
  const stats = useMemo(() => {
    const total = performances.length;
    const avgScore = total > 0 ? Math.round(performances.reduce((sum, p) => sum + p.score, 0) / total) : 0;
    
    const sorted = [...performances].sort((a, b) => b.score - a.score);
    const topScore = sorted.length > 0 ? sorted[0].score : 0;
    const topPerformer = sorted.length > 0 ? sorted[0].name : '-';

    return { avgScore, topScore, topPerformer, total };
  }, [performances]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formName || !formScore) {
      showToast('Harap lengkapi field wajib!', 'error');
      return;
    }

    const scoreNum = parseFloat(formScore);
    if (scoreNum < 0 || scoreNum > 100) {
      showToast('Skor harus berada di rentang 0 - 100!', 'error');
      return;
    }

    let grade = 'Kurang';
    if (scoreNum >= 90) grade = 'Sangat Baik';
    else if (scoreNum >= 80) grade = 'Baik';
    else if (scoreNum >= 70) grade = 'Cukup';

    const matchingEmp = performances.find(p => p.name.toLowerCase().includes(formName.toLowerCase()));

    const newPerf = {
      period: formPeriod,
      nik: matchingEmp ? matchingEmp.nik : '367100999',
      name: formName,
      division: matchingEmp ? matchingEmp.division : 'Penerimaan',
      score: scoreNum,
      grade: grade
    };

    setPerformances([newPerf, ...performances]);
    setShowAddSheet(false);
    showToast(`Penilaian kinerja untuk "${formName}" berhasil diinput! Predikat: ${grade}`);

    // Reset Form
    setFormName('');
    setFormScore('');
  };

  // Filter list
  const filteredPerformances = useMemo(() => {
    return performances.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.nik.includes(searchTerm);
      const matchDivision = filterDivision === 'Semua' || p.division === filterDivision;
      const matchGrade = filterGrade === 'Semua' || p.grade === filterGrade;
      return matchSearch && matchDivision && matchGrade;
    });
  }, [performances, searchTerm, filterDivision, filterGrade]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Penilaian Kinerja Amil</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Monitoring evaluasi Key Performance Indicators (KPI) berkala dan predikat kinerja pegawai
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Input Nilai Kinerja
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Rata-rata KPI</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.avgScore} / 100</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Star className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Skor Tertinggi</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.topScore}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Award className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Amil Terbaik</p>
              <h3 className="text-sm sm:text-xs font-bold text-foreground mt-0.5 truncate max-w-[170px]" title={stats.topPerformer}>{stats.topPerformer}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Evaluasi Masuk</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.total} Rapor</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Tabel Penilaian Rapor Bulanan</CardTitle>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari rapor (Nama/NIK)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs focus-visible:ring-emerald-500 border-border"
              />
            </div>

            <select
              value={filterDivision}
              onChange={(e) => setFilterDivision(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Divisi</option>
              <option value="Penerimaan">Penerimaan</option>
              <option value="Penyaluran">Penyaluran</option>
              <option value="Keuangan">Keuangan</option>
              <option value="SDM/Umum">SDM & Umum</option>
            </select>

            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Predikat</option>
              <option value="Sangat Baik">Sangat Baik (90 - 100)</option>
              <option value="Baik">Baik (80 - 89)</option>
              <option value="Cukup">Cukup (70 - 79)</option>
              <option value="Kurang">Kurang (0 - 69)</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {filteredPerformances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Rapor</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Kata kunci atau saringan Anda tidak mencocokkan records rapor apa pun.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 h-8 text-xs font-semibold"
                onClick={() => {
                  setSearchTerm('');
                  setFilterDivision('Semua');
                  setFilterGrade('Semua');
                }}
              >
                Reset Pencarian
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Periode</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">NIK</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Nama Amil</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Divisi</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Skor KPI</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Predikat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPerformances.map((p, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 text-muted-foreground">{p.period}</td>
                    <td className="px-4 py-3.5 font-medium text-muted-foreground">{p.nik}</td>
                    <td className="px-4 py-3.5 font-bold text-foreground">{p.name}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{p.division}</td>
                    <td className="px-4 py-3.5 text-center font-bold text-foreground">{p.score}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.grade === 'Sangat Baik' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30' :
                        p.grade === 'Baik' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30' :
                        p.grade === 'Cukup' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30' :
                        'bg-rose-100 text-rose-700 dark:bg-rose-950/30'
                      }`}>
                        {p.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Input Penilaian Kinerja */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Input Penilaian Kinerja</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Masukkan skor evaluasi KPI untuk amil terdaftar untuk menghitung rapor performa bulanan
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Lengkap Amil</label>
              <Input
                placeholder="Contoh: Siti Rahma, A.Md.Ak"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Periode Penilaian</label>
              <Input
                placeholder="Contoh: Juni 2026"
                value={formPeriod}
                onChange={(e) => setFormPeriod(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Skor KPI (0 - 100)</label>
              <Input
                type="number"
                placeholder="Contoh: 85"
                value={formScore}
                onChange={(e) => setFormScore(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="pt-4 flex gap-2 border-t border-border mt-6">
              <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={() => setShowAddSheet(false)}>
                Batal
              </Button>
              <Button type="submit" className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                Simpan Rapor
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
