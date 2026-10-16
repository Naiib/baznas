import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Download,
  Filter,
  CheckCircle2,
  X,
  FileSpreadsheet,
  BookOpen,
  Loader2
} from 'lucide-react';
import { formatRupiah } from '../utils/format';

export default function LaporanKeuanganPage() {
  const [reportType, setReportType] = useState('Neraca'); // Neraca vs Aktivitas
  const [reportYear, setReportYear] = useState('2026');
  const [isExporting, setIsExporting] = useState(null);

  // Toast notification state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  const handleExport = (format) => {
    setIsExporting(format);
    showToast(`Sedang menyiapkan dokumen ${reportType} tahun ${reportYear} dalam format ${format.toUpperCase()}...`);
    setTimeout(() => {
      showToast(`Dokumen Laporan_${reportType}_${reportYear}.${format} berhasil diunduh!`, 'success');
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
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Laporan Akuntansi Keuangan</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Tarik dan cetak laporan posisi neraca keuangan serta surplus-defisit aktivitas yayasan
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
            Cetak Laporan
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="shadow-card animate-fade-in-up fill-mode-both">
        <CardHeader className="pb-2.5 border-b border-border/60">
          <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Filter className="size-4 text-emerald-600" /> Saring Model Laporan
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3">
          
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="h-8 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground flex-1"
            >
              <option value="Neraca">Laporan Neraca (Posisi Keuangan)</option>
              <option value="Aktivitas">Laporan Aktivitas (Surplus / Defisit)</option>
            </select>

            <select
              value={reportYear}
              onChange={(e) => setReportYear(e.target.value)}
              className="h-8 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground sm:w-36"
            >
              <option value="2026">Tahun Buku 2026</option>
              <option value="2025">Tahun Buku 2025</option>
              <option value="2024">Tahun Buku 2024</option>
            </select>
          </div>
          
        </CardContent>
      </Card>

      {/* Financial Statement Body Card */}
      <Card className="shadow-card border-border animate-fade-in-up fill-mode-both delay-100">
        <CardHeader className="pb-4 border-b border-border flex flex-row items-center gap-2.5">
          <BookOpen className="size-4 text-emerald-600" />
          <CardTitle className="text-sm sm:text-base font-bold text-foreground">
            {reportType === 'Neraca' ? 'Laporan Posisi Neraca Keuangan' : 'Laporan Aktivitas Yayasan'} ({reportYear})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
          
          {reportType === 'Neraca' ? (
            /* BALANCE SHEET TABLE */
            <div className="space-y-6 text-xs sm:text-sm">
              
              {/* ASSETS */}
              <div className="space-y-2">
                <h3 className="font-extrabold text-foreground border-b border-border pb-1 text-sm text-emerald-800 dark:text-emerald-400">1. ASET KELOLAAN</h3>
                <div className="space-y-1.5 pl-2">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Kas dan Setara Kas</span>
                    <span className="font-semibold text-foreground">{formatRupiah(560_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Piutang Penyaluran Bantuan</span>
                    <span className="font-semibold text-foreground">{formatRupiah(85_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Aset Tetap (Amortisasi Bersih)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(45_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-foreground border-t border-emerald-600/30 mt-2 bg-secondary/20 px-2 rounded">
                    <span>TOTAL ASET</span>
                    <span>{formatRupiah(690_000_000_000)}</span>
                  </div>
                </div>
              </div>

              {/* LIABILITIES & FUND BALANCE */}
              <div className="space-y-2 pt-2">
                <h3 className="font-extrabold text-foreground border-b border-border pb-1 text-sm text-emerald-800 dark:text-emerald-400">2. LIABILITAS & SALDO DANA</h3>
                
                {/* LIABILITIES */}
                <div className="space-y-1.5 pl-2">
                  <span className="font-bold text-foreground/80 block text-xs">Liabilitas Jangka Pendek:</span>
                  <div className="flex justify-between py-1 border-b border-border/40 pl-2">
                    <span className="text-muted-foreground">Bagian Dana Hak Amil</span>
                    <span className="font-semibold text-foreground">{formatRupiah(25_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40 pl-2">
                    <span className="text-muted-foreground">Titipan Dana Mitra / Syariah</span>
                    <span className="font-semibold text-foreground">{formatRupiah(15_000_000_000)}</span>
                  </div>
                </div>

                {/* FUND BALANCES */}
                <div className="space-y-1.5 pl-2 pt-2">
                  <span className="font-bold text-foreground/80 block text-xs">Saldo Dana:</span>
                  <div className="flex justify-between py-1 border-b border-border/40 pl-2">
                    <span className="text-muted-foreground">Dana Zakat (Terikat & Tidak Terikat)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(380_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40 pl-2">
                    <span className="text-muted-foreground">Dana Infak</span>
                    <span className="font-semibold text-foreground">{formatRupiah(180_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40 pl-2">
                    <span className="text-muted-foreground">Dana Sedekah & DSKL</span>
                    <span className="font-semibold text-foreground">{formatRupiah(90_000_000_000)}</span>
                  </div>
                  
                  <div className="flex justify-between py-1.5 font-bold text-foreground border-t border-emerald-600/30 mt-2 bg-secondary/20 px-2 rounded">
                    <span>TOTAL LIABILITAS & SALDO DANA</span>
                    <span>{formatRupiah(690_000_000_000)}</span>
                  </div>
                </div>

              </div>

            </div>
          ) : (
            /* INCOME STATEMENT (AKTIVITAS) */
            <div className="space-y-6 text-xs sm:text-sm">
              
              {/* INCOMING REVENUE */}
              <div className="space-y-2">
                <h3 className="font-extrabold text-foreground border-b border-border pb-1 text-sm text-emerald-800 dark:text-emerald-400">1. PENERIMAAN (REVENUE)</h3>
                <div className="space-y-1.5 pl-2">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Zakat Maal</span>
                    <span className="font-semibold text-foreground">{formatRupiah(1_470_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Zakat Fitrah</span>
                    <span className="font-semibold text-foreground">{formatRupiah(612_500_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Infak</span>
                    <span className="font-semibold text-foreground">{formatRupiah(245_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Sedekah</span>
                    <span className="font-semibold text-foreground">{formatRupiah(122_500_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-foreground border-t border-emerald-600/30 mt-2 bg-emerald-500/10 px-2 rounded text-emerald-800 dark:text-emerald-400">
                    <span>TOTAL PENERIMAAN</span>
                    <span>{formatRupiah(2_450_000_000_000)}</span>
                  </div>
                </div>
              </div>

              {/* OUTGOING DISTRIBUTIONS */}
              <div className="space-y-2">
                <h3 className="font-extrabold text-foreground border-b border-border pb-1 text-sm text-rose-800 dark:text-rose-400">2. PENYALURAN (EXPENDITURE)</h3>
                <div className="space-y-1.5 pl-2">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Program Tangerang Cerdas (Pendidikan)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(570_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Program Tangerang Sehat (Kesehatan)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(410_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Program Tangerang Peduli (Sosial)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(330_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Program Tangerang Makmur (Ekonomi)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(180_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground pl-2">Program Tangerang Takwa (Dakwah)</span>
                    <span className="font-semibold text-foreground">{formatRupiah(120_000_000_000)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-foreground border-t border-rose-600/30 mt-2 bg-rose-500/10 px-2 rounded text-rose-800 dark:text-rose-400">
                    <span>TOTAL PENYALURAN</span>
                    <span>{formatRupiah(1_610_000_000_000)}</span>
                  </div>
                </div>
              </div>

              {/* SURPLUS & OPERATIONAL RATIOS */}
              <div className="space-y-2 pt-2 border-t border-border mt-4">
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground">Surplus Sebelum Beban Amil</span>
                  <span className="font-semibold text-foreground">{formatRupiah(840_000_000_000)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Beban Amil (Biaya Operasional)</span>
                  <span className="font-semibold text-foreground">{formatRupiah(245_000_000_000)}</span>
                </div>
                <div className="flex justify-between py-2 font-black text-foreground bg-emerald-600/20 px-2.5 rounded mt-2">
                  <span>SURPLUS BERSIH TAHUN BERJALAN</span>
                  <span>{formatRupiah(595_000_000_000)}</span>
                </div>
              </div>

            </div>
          )}

        </CardContent>
      </Card>
      
    </div>
  );
}
