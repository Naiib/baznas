import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  CalendarDays,
  Search,
  Plus,
  CheckCircle2,
  X,
  Clock,
  UserMinus,
  AlertCircle
} from 'lucide-react';
import { ABSENSI_LIST } from '../data/penerimaanData';

export default function AbsensiPage() {
  const [attendance, setAttendance] = useState(ABSENSI_LIST);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Cuti');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');

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

  // Recalculate stats
  const stats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter(a => a.status === 'Hadir').length;
    const late = attendance.filter(a => a.status === 'Terlambat').length;
    const leave = attendance.filter(a => a.status === 'Cuti').length;
    const sick = attendance.filter(a => a.status === 'Sakit' || a.status === 'Izin').length;

    const presenceRatio = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return { presenceRatio, late, leave, sick };
  }, [attendance]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formName || !formStart || !formEnd || !formReason) {
      showToast('Harap lengkapi field wajib!', 'error');
      return;
    }

    // Update local attendance list to reflect the leave for the day
    const matchingAbsence = attendance.find(a => a.name.toLowerCase().includes(formName.toLowerCase()));
    
    const newRecord = {
      date: new Date().toISOString().split('T')[0],
      nik: matchingAbsence ? matchingAbsence.nik : '367100999',
      name: formName,
      timeIn: '-',
      timeOut: '-',
      status: formType
    };

    setAttendance([newRecord, ...attendance]);
    setShowAddSheet(false);
    showToast(`Pengajuan ${formType} untuk "${formName}" berhasil dicatat!`);

    // Reset Form
    setFormName('');
    setFormReason('');
  };

  // Filter list
  const filteredAttendance = useMemo(() => {
    return attendance.filter(a => {
      const matchSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          a.nik.includes(searchTerm);
      const matchStatus = filterStatus === 'Semua' || a.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [attendance, searchTerm, filterStatus]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Absensi & Pengajuan Cuti</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Kelola rekap log kehadiran harian pegawai, data keterlambatan, dan permohonan cuti amil
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Ajukan Cuti / Izin
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Rasio Kehadiran</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.presenceRatio}%</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Terlambat</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.late}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <UserMinus className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Cuti Aktif</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.leave}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Sakit & Izin</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.sick}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Log Absensi Pegawai Hari Ini</CardTitle>
          
          {/* Filters */}
          <div className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari absensi (Nama/NIK)..."
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
              <option value="Hadir">Hadir</option>
              <option value="Terlambat">Terlambat</option>
              <option value="Cuti">Cuti</option>
              <option value="Sakit">Sakit</option>
              <option value="Izin">Izin</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {filteredAttendance.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Absensi</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Kata kunci atau status saringan Anda tidak mencocokkan records kehadiran apa pun.
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">NIK</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Nama Pegawai</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Jam Masuk</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Jam Keluar</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttendance.map((a, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-muted-foreground">{a.nik}</td>
                    <td className="px-4 py-3.5 font-bold text-foreground">{a.name}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-muted-foreground">{a.timeIn}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-muted-foreground">{a.timeOut}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'Hadir' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30' :
                        a.status === 'Terlambat' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30' :
                        a.status === 'Cuti' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30' :
                        'bg-rose-100 text-rose-700 dark:bg-rose-950/30'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Ajukan Cuti/Izin */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Ajukan Izin / Cuti Amil</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Daftarkan form absensi khusus untuk amil yang berhalangan hadir atau sedang mengambil cuti kerja
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Lengkap Pegawai</label>
              <Input
                placeholder="Contoh: Drs. H. M. Asyik Syarif"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Jenis Pengajuan</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Cuti">Cuti Kerja (Tahunan / Bersalin)</option>
                <option value="Sakit">Sakit (Melampirkan Surat Dokter)</option>
                <option value="Izin">Izin Khusus (Keperluan Mendesak)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Mulai Tanggal</label>
              <Input
                type="date"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Sampai Tanggal</label>
              <Input
                type="date"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Alasan Pengajuan / Keterangan</label>
              <Input
                placeholder="Contoh: Keperluan acara pernikahan keluarga kandung"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="pt-4 flex gap-2 border-t border-border mt-6">
              <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={() => setShowAddSheet(false)}>
                Batal
              </Button>
              <Button type="submit" className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                Kirim Pengajuan
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
