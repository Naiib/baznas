import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Users,
  Search,
  Plus,
  CheckCircle2,
  X,
  Phone,
  Briefcase,
  Calendar,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { PEGAWAI_LIST } from '../data/penerimaanData';

export default function PegawaiPage() {
  const [employees, setEmployees] = useState(PEGAWAI_LIST);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formDivision, setFormDivision] = useState('Penerimaan');
  const [formStatus, setFormStatus] = useState('Tetap');
  const [formContact, setFormContact] = useState('');
  const [formJoin, setFormJoin] = useState(new Date().toISOString().split('T')[0]);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDivision, setFilterDivision] = useState('Semua');
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
    const total = employees.length;
    const permanent = employees.filter(e => e.status === 'Tetap').length;
    const contract = employees.filter(e => e.status === 'Kontrak').length;
    const leaders = employees.filter(e => e.division === 'Pimpinan').length;

    return { total, permanent, contract, leaders };
  }, [employees]);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formName || !formRole || !formContact) {
      showToast('Harap lengkapi field wajib!', 'error');
      return;
    }

    const nextNik = String(367100000 + employees.length + 1);
    const newEmp = {
      nik: nextNik,
      name: formName,
      role: formRole,
      division: formDivision,
      status: formStatus,
      joinDate: formJoin,
      contact: formContact
    };

    setEmployees([...employees, newEmp]);
    setShowAddSheet(false);
    showToast(`Pegawai baru "${formName}" berhasil didaftarkan! NIK: ${nextNik}`);

    // Reset Form
    setFormName('');
    setFormRole('');
    setFormContact('');
    setFormDivision('Penerimaan');
    setFormStatus('Tetap');
  };

  // Filter list
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const matchSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          e.nik.includes(searchTerm) ||
                          e.role.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDivision = filterDivision === 'Semua' || e.division === filterDivision;
      const matchStatus = filterStatus === 'Semua' || e.status === filterStatus;
      return matchSearch && matchDivision && matchStatus;
    });
  }, [employees, searchTerm, filterDivision, filterStatus]);

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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Data Kepegawaian (Amil)</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Kelola profil jabatan, divisi, status kontrak, dan informasi kontak amil BAZNAS Kota Tangerang
          </p>
        </div>
        <div>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Registrasi Pegawai
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up fill-mode-both">
        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Total Amil</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.total}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <UserCheck className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Pegawai Tetap</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.permanent}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Briefcase className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Pegawai Kontrak</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.contract}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase">Pimpinan / Komisioner</p>
              <h3 className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.leaders}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table + Filter Card */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-sm font-semibold">Tabel Database Amil Aktif</CardTitle>
          
          {/* Filters */}
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari pegawai (Nama/NIK/Jabatan)..."
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
              <option value="Pimpinan">Pimpinan</option>
              <option value="Penerimaan">Penerimaan</option>
              <option value="Penyaluran">Penyaluran</option>
              <option value="Keuangan">Keuangan</option>
              <option value="SDM/Umum">SDM & Umum</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 text-[11px] rounded-md border border-border bg-background px-2.5 focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
            >
              <option value="Semua">Semua Status</option>
              <option value="Tetap">Tetap</option>
              <option value="Kontrak">Kontrak</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          {filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-page-enter">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-6 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Tidak Ada Pegawai</h3>
              <p className="text-xs text-muted-foreground max-w-xs mt-1">
                Kata kunci atau filter pencarian Anda tidak mencocokkan record pegawai apa pun.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4 h-8 text-xs font-semibold"
                onClick={() => {
                  setSearchTerm('');
                  setFilterDivision('Semua');
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
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Jabatan</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Divisi</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Kontak</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Tgl Bergabung</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmployees.map((e, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-muted-foreground">{e.nik}</td>
                    <td className="px-4 py-3.5 font-bold text-foreground">{e.name}</td>
                    <td className="px-4 py-3.5 text-foreground font-semibold">{e.role}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{e.division}</td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-1"><Phone className="size-3 text-muted-foreground/60 shrink-0" /> {e.contact}</span>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="size-3 text-muted-foreground/60 shrink-0" /> {e.joinDate}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        e.status === 'Tetap' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Sheet: Tambah Pegawai */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Registrasi Pegawai Baru</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Catat biodata karyawan baru untuk dimasukkan ke sistem absensi dan penilaian KPI
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Lengkap Pegawai</label>
              <Input
                placeholder="Contoh: Muhammad Ilham, S.Kom"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Jabatan</label>
              <Input
                placeholder="Contoh: Staff IT / Verifikator"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Divisi Kerja</label>
              <select
                value={formDivision}
                onChange={(e) => setFormDivision(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Penerimaan">Penerimaan</option>
                <option value="Penyaluran">Penyaluran</option>
                <option value="Keuangan">Keuangan</option>
                <option value="SDM/Umum">SDM & Umum</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Status Kepegawaian</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Tetap">Tetap</option>
                <option value="Kontrak">Kontrak</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nomor Telepon / Kontak</label>
              <Input
                placeholder="Contoh: 0812-xxxx-xxxx"
                value={formContact}
                onChange={(e) => setFormContact(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tanggal Mulai Bekerja</label>
              <Input
                type="date"
                value={formJoin}
                onChange={(e) => setFormJoin(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="pt-4 flex gap-2 border-t border-border mt-6">
              <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={() => setShowAddSheet(false)}>
                Batal
              </Button>
              <Button type="submit" className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                Daftarkan Amil
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
