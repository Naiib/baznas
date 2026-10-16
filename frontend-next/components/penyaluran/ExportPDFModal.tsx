'use client';

import { Download, FileText, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api/client';

type ExportPDFModalProps = {
  currentUser?: { name?: string | null } | null;
  onClose: () => void;
};

export function ExportPDFModal({ currentUser, onClose }: ExportPDFModalProps) {
  const [reportType, setReportType] = useState('penyaluran');
  const [period, setPeriod] = useState('Tahun Berjalan 2026');
  const [signatureRole, setSignatureRole] = useState('Kabid Penyaluran & Pendistribusian');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setError('');
    setSuccess('');
    try {
      const reportId = `lap-ui-${Date.now()}`;
      const title = `Laporan ${reportType}`;
      await api.generateLaporan({
        id: reportId,
        title,
        category: reportType,
        period,
        scope: signatureRole,
        status: 'Siap diekspor',
      });
      const blob = await api.exportLaporan(reportId, 'pdf', { title, period, scope: signatureRole });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `laporan-${reportType}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess('PDF laporan berhasil disiapkan dan diunduh.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh PDF dari backend.');
    } finally {
      setDownloading(false);
    }
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-pdf-title" className="w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><FileText className="size-5" /></span><div><h2 id="export-pdf-title" className="text-base font-bold text-zinc-900">Export Laporan PDF</h2><p className="mt-0.5 text-xs text-zinc-500">BAZNAS Kota Tangerang</p></div></div>
        <button type="button" aria-label="Tutup export PDF" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"><X className="size-4" /></button>
      </header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <label className="text-xs font-semibold text-zinc-700">Jenis laporan<select value={reportType} onChange={(event) => setReportType(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900"><option value="penyaluran">Penyaluran & Distribusi Mustahik</option><option value="mustahik_master">Master Data Mustahik</option><option value="penerimaan">Penerimaan ZIS & UPZ</option><option value="keuangan">Realisasi RKAT & Keuangan</option></select></label>
        <label className="text-xs font-semibold text-zinc-700">Periode laporan<select value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900"><option>Bulan Ini</option><option>Triwulan III</option><option>Semester I</option><option>Tahun Berjalan 2026</option></select></label>
        <label className="text-xs font-semibold text-zinc-700 sm:col-span-2">Jabatan penandatangan<select value={signatureRole} onChange={(event) => setSignatureRole(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900"><option>Kabid Penyaluran & Pendistribusian</option><option>Ketua BAZNAS Kota Tangerang</option><option>Wakil Ketua Bidang Keuangan</option></select></label>
      </div>
      <div className="mx-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Pratinjau dokumen</p>
        <h3 className="mt-2 font-bold text-zinc-900">Laporan {reportType === 'mustahik_master' ? 'Master Data Mustahik' : reportType === 'penerimaan' ? 'Penerimaan ZIS & UPZ' : reportType === 'keuangan' ? 'Realisasi RKAT & Keuangan' : 'Penyaluran & Distribusi Mustahik'}</h3>
        <p className="mt-1">Periode: {period}</p><p>Disiapkan oleh: {currentUser?.name || 'Amil Penyaluran'}</p><p>Penandatangan: {signatureRole}</p>
        {error && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">{error}</p>}
        {success && <p role="status" className="mt-2 text-xs font-bold text-emerald-700">{success}</p>}
      </div>
      <footer className="mt-5 flex flex-col-reverse justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row">
        <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-200">Batal</button>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"><Printer className="size-4" />Pratinjau Cetak</button>
        <button type="button" disabled={downloading} onClick={handleDownloadPdf} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"><Download className="size-4" />{downloading ? 'Mengunduh…' : 'Unduh PDF (Backend)'}</button>
      </footer>
    </section>
  </div>;
}
