'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Plus,
  Search,
  Sparkles,
  X,
  Loader2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { canAccessActor } from '@/components/auth/access';
import type { ReportItem, ReportKpi, ReportDistributionItem } from '@/lib/api/types';
import {
  ASNAF_DISTRIBUTION,
  PROGRAM_ALLOCATION,
  REPORT_CATEGORIES,
  REPORT_KPIS,
  REPORT_READINESS,
  REPORT_RECORDS,
  type ReportCategory,
  type ReportDistribution,
  type ReportRecord,
} from './laporan-data';

const TONE_CLASSES: Record<string, string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
};

const STATUS_CLASSES: Record<string, string> = {
  'Siap diekspor': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Perlu pembaruan': 'bg-amber-50 text-amber-800 ring-amber-200',
  Arsip: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const READINESS_CLASSES = {
  Selesai: 'bg-emerald-100 text-emerald-700',
  'Perlu ditinjau': 'bg-amber-100 text-amber-700',
  'Menunggu data': 'bg-slate-100 text-slate-500',
} as const;

function normalizeCategory(c: string): ReportCategory {
  const s = String(c || '').toLowerCase();
  if (s.includes('program') || s.includes('pilar')) return 'Per Program';
  if (s.includes('asnaf')) return 'Per Asnaf';
  if (s.includes('kecamatan') || s.includes('wilayah')) return 'Per Kecamatan';
  if (s.includes('audit') || s.includes('lpj') || s.includes('keuangan')) return 'Audit & LPJ';
  return 'Ringkasan';
}

function DistributionList({ items }: { items: Array<{ label: string; value: string; percentage: number; tone: string }> }) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-bold text-zinc-900">{item.label}</span>
            <span className="whitespace-nowrap text-xs font-semibold text-zinc-500">{item.value}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${TONE_CLASSES[item.tone] || 'bg-emerald-500'}`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs font-black tabular-nums text-zinc-800">{item.percentage}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LaporanPenyaluranWorkspace() {
  const { user } = useAuth();
  const canExport = canAccessActor(user, ['admin', 'penyaluran']);
  const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('Ringkasan');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('2026-08');
  const [feedback, setFeedback] = useState('');
  const [reports, setReports] = useState<ReportItem[]>(isDemo ? (REPORT_RECORDS as any) : []);
  const [kpis, setKpis] = useState<ReportKpi[]>(isDemo ? (REPORT_KPIS as any) : []);
  const [progAlloc, setProgAlloc] = useState<ReportDistributionItem[]>(isDemo ? (PROGRAM_ALLOCATION as any) : []);
  const [asnafAlloc, setAsnafAlloc] = useState<ReportDistributionItem[]>(isDemo ? (ASNAF_DISTRIBUTION as any) : []);
  const [dataStatus, setDataStatus] = useState<'ready' | 'empty' | 'demo' | 'loading' | 'error'>(isDemo ? 'demo' : 'loading');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [newReport, setNewReport] = useState({
    title: '',
    category: 'Ringkasan' as ReportCategory,
    scope: '13 Kecamatan Kota Tangerang',
    period: 'Agustus 2026',
    description: '',
  });

  const loadReports = () => {
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (period) params.period = period;
    api.getLaporanList(params).then((res) => {
      if (res) {
        setReports(Array.isArray(res.reports) ? res.reports : []);
        if (Array.isArray(res.kpis) && res.kpis.length > 0) {
          setKpis(res.kpis);
        } else if (!isDemo) {
          setKpis([]);
        }
        if (Array.isArray(res.programAllocation)) {
          setProgAlloc(res.programAllocation);
        } else if (!isDemo) {
          setProgAlloc([]);
        }
        if (Array.isArray(res.asnafDistribution)) {
          setAsnafAlloc(res.asnafDistribution);
        } else if (!isDemo) {
          setAsnafAlloc([]);
        }
        setDataStatus(res.dataStatus || (res.reports && res.reports.length > 0 ? 'ready' : 'empty'));
      }
    }).catch((err) => {
      if (!isDemo) {
        setDataStatus('error');
        setFeedback(err?.message || 'Gagal memuat arsip laporan dari server.');
      }
    });
  };

  useEffect(() => {
    loadReports();
  }, [search, period]);

  useEffect(() => {
    if (!feedback) {
      return undefined;
    }
    const timeoutId = window.setTimeout(() => {
      setFeedback('');
    }, 3500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

  // Live category counts from loaded reports
  const categoryCounts = useMemo(() => {
    const counts: Record<ReportCategory, number> = {
      'Ringkasan': 0,
      'Per Program': 0,
      'Per Asnaf': 0,
      'Per Kecamatan': 0,
      'Audit & LPJ': 0,
    };
    reports.forEach((r) => {
      const norm = normalizeCategory(r.category);
      if (counts[norm] !== undefined) {
        counts[norm]++;
      }
    });
    return counts;
  }, [reports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return reports.filter((report) => {
      const normCat = normalizeCategory(report.category);
      const matchesCat = normCat === activeCategory;
      const matchesSearch = !query || [report.title, report.description, report.scope, report.period, report.category]
        .join(' ')
        .toLocaleLowerCase('id-ID')
        .includes(query);
      return (Boolean(query) || matchesCat) && matchesSearch;
    });
  }, [reports, activeCategory, search]);

  const selectCategory = (category: ReportCategory) => {
    setActiveCategory(category);
    setFeedback(`Menampilkan laporan kategori ${category}.`);
  };

  const handleExport = async (format: 'PDF' | 'Excel', report: ReportItem) => {
    const exportFormat = format === 'Excel' ? 'xlsx' : 'pdf';
    setFeedback(`Menyiapkan unduhan ${format} untuk "${report.title}"...`);
    try {
      const blob = await api.exportLaporan(report.id, exportFormat, {
        title: report.title,
        category: report.category,
        period: report.period,
        scope: report.scope,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      const filename = report.title.replace(/[^\p{L}\p{N} ._-]/gu, '_').trim() || 'Laporan';
      link.download = `${filename}.${exportFormat}`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        // Release after the browser has had a turn to start the download.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      setFeedback(`Memulai unduhan berkas ${format} (.${exportFormat}) untuk "${report.title}".`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFeedback('Sesi Anda berakhir. Silakan masuk kembali untuk mengunduh laporan.');
      } else if (error instanceof ApiError && error.status === 403) {
        setFeedback('Anda tidak memiliki izin untuk mengunduh laporan. Hubungi admin.');
      } else {
        setFeedback('Gagal mengunduh laporan. Periksa koneksi Anda dan coba lagi.');
      }
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title) {
      setFeedback('Judul laporan wajib diisi');
      return;
    }
    setIsSubmitting(true);
    try {
      const targetCat = normalizeCategory(newReport.category);
      const newId = `lap-${Date.now()}`;
      await api.generateLaporan({
        id: newId,
        title: newReport.title,
        category: targetCat,
        scope: newReport.scope,
        period: newReport.period,
        description: newReport.description || 'Laporan ringkasan penyaluran otomatis data center.',
        status: 'Siap diekspor',
      });

      const createdReportItem: ReportItem = {
        id: newId,
        title: newReport.title,
        category: targetCat,
        scope: newReport.scope,
        period: newReport.period,
        description: newReport.description || 'Laporan ringkasan penyaluran otomatis data center.',
        status: 'Siap diekspor',
        file_url: `/api/penyaluran/laporan/export/${newId}`,
        updated_at: 'Baru saja',
      };

      setReports((prev) => [createdReportItem, ...prev]);
      setActiveCategory(targetCat);
      setFeedback(`Laporan "${newReport.title}" berhasil dibuat dan siap diunduh!`);
      setCreateModalOpen(false);
      setNewReport({
        title: '',
        category: 'Ringkasan',
        scope: '13 Kecamatan Kota Tangerang',
        period: 'Agustus 2026',
        description: '',
      });
      loadReports();
    } catch (err: any) {
      setFeedback(`Gagal membuat laporan: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 sm:space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-emerald-50/35 shadow-[0_18px_45px_-36px_rgba(5,150,105,0.55)]">
        <div className="flex flex-col gap-6 px-5 py-6 sm:px-7 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-7">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <FolderArchive className="size-3.5" />
              </span>
              Report library
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
              Laporan Penyaluran
            </h1>
            <p className="mt-2 text-sm font-medium leading-6 text-zinc-600 sm:text-base">
              Temukan rekap periode aktif, tinjau kesiapan dokumen, lalu unduh format Excel / PDF terintegrasi database.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <label className="relative flex min-w-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm">
              <CalendarDays className="size-4 shrink-0 text-emerald-700" />
              <span className="sr-only">Periode laporan</span>
              <input
                aria-label="Periode laporan"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="min-w-0 bg-transparent outline-none cursor-pointer"
              />
            </label>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-800 motion-reduce:transform-none cursor-pointer"
            >
              <Plus className="size-4" />
              Buat laporan
            </button>
          </div>
        </div>
      </section>

      {dataStatus === 'empty' && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-slate-500">
          <CircleAlert className="size-4 shrink-0 text-slate-400" />
          <span>Belum ada transaksi tervalidasi untuk periode ini.</span>
        </div>
      )}

      {dataStatus === 'error' && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <CircleAlert className="size-4 shrink-0 text-rose-500" />
          <span>Gagal memuat arsip laporan dari server. Periksa koneksi atau coba lagi nanti.</span>
        </div>
      )}

      {/* KPI Cards */}
      <section aria-label="Ringkasan periode laporan" className="grid overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {(kpis.length > 0 ? kpis : [
          { label: 'Dana tersalurkan', value: 'Rp 0', detail: 'Realisasi periode ini', trend: '0% dari periode lalu' },
          { label: 'Mustahik terbantu', value: '0 jiwa', detail: 'Penerima manfaat terverifikasi', trend: '0% dari periode lalu' },
          { label: 'Total laporan', value: `${reports.length} laporan`, detail: 'Laporan tercatat', trend: `${reports.filter(r => r.status === 'Siap diekspor').length} siap ekspor` },
          { label: 'Laporan siap ekspor', value: `${reports.filter(r => r.status === 'Siap diekspor').length}`, detail: 'Dokumen final', trend: '0% kesiapan' },
        ]).map((kpi, index) => (
          <article key={kpi.label} className="bg-white p-5 transition-colors hover:bg-emerald-50/40 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-500">{kpi.label}</p>
              <span className={`flex size-8 items-center justify-center rounded-lg ${index === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {index === 0 ? <BarChart3 className="size-4" /> : index === 1 ? <Sparkles className="size-4" /> : index === 2 ? <FileText className="size-4" /> : <CheckCircle2 className="size-4" />}
              </span>
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">{kpi.value}</p>
            <p className="mt-1 text-xs font-medium text-zinc-500">{kpi.detail}</p>
            <p className="mt-3 text-xs font-bold text-emerald-700">{kpi.trend}</p>
          </article>
        ))}
      </section>

      {/* Library Section */}
      <section aria-labelledby="library-heading" className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-100 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Arsip &amp; dokumen</p>
            <h2 id="library-heading" className="mt-1 text-xl font-black tracking-tight text-zinc-950">Library laporan</h2>
            <p className="mt-1 text-sm text-zinc-500">Pilih jenis laporan, cari arsip, lalu unduh format yang diperlukan.</p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-500 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-100 lg:max-w-xs">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              aria-label="Cari arsip laporan"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari judul atau cakupan..."
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-800 outline-none placeholder:text-zinc-400"
            />
          </label>
        </div>
        <div className="grid min-w-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Kategori laporan" className="border-b border-zinc-100 bg-zinc-50/80 p-3 lg:border-b-0 lg:border-r lg:p-4">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {REPORT_CATEGORIES.map((category) => {
                const active = activeCategory === category.name;
                const count = categoryCounts[category.name] ?? 0;
                return (
                  <button
                    key={category.name}
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectCategory(category.name)}
                    className={`min-w-[180px] rounded-xl p-3 text-left transition lg:min-w-0 cursor-pointer ${
                      active ? 'bg-emerald-700 text-white shadow-md shadow-emerald-900/15' : 'bg-transparent text-zinc-700 hover:bg-white hover:shadow-sm'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-bold">
                      <span>{category.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${active ? 'bg-white/15 text-white' : 'bg-zinc-200/70 text-zinc-500'}`}>
                        {count}
                      </span>
                    </span>
                    <span className={`mt-1 block text-xs leading-5 ${active ? 'text-emerald-100' : 'text-zinc-500'}`}>
                      {category.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="min-w-0 p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-base font-black text-zinc-950">{activeCategory}</h3>
              <p className="mt-1 text-xs font-medium text-zinc-500">{filteredReports.length} laporan siap diunduh</p>
            </div>
            {filteredReports.length ? (
              <div className="space-y-3" role="list" aria-label="Daftar laporan">
                {filteredReports.map((report) => {
                  const isExportable = report.status === 'Siap diekspor' || (report.status as string) === 'ready';
                  return (
                    <article
                      key={report.id}
                      role="listitem"
                      className="group rounded-2xl border border-zinc-200 bg-white p-4 transition duration-200 hover:border-emerald-200 hover:shadow-md sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                              {report.period}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${STATUS_CLASSES[report.status] || STATUS_CLASSES['Siap diekspor']}`}>
                              {report.status}
                            </span>
                          </div>
                          <h3 className="mt-3 text-base font-black leading-6 text-zinc-950">{report.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-zinc-600">{report.description}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-zinc-500">
                            <span>{report.scope}</span>
                            <span className="hidden h-1 w-1 rounded-full bg-zinc-300 sm:block" />
                            <span>{report.updated_at}</span>
                          </div>
                        </div>
                        {canExport && <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                          <button
                            type="button"
                            disabled={!isExportable}
                            title={!isExportable ? 'Belum ada data untuk diekspor' : `Cetak Dokumen PDF: ${report.title}`}
                            aria-label={`Cetak Dokumen PDF: ${report.title}`}
                            onClick={() => handleExport('PDF', report)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 hover:border-rose-300 sm:flex-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileText className="size-3.5 text-rose-600" />
                            Cetak PDF
                          </button>
                          <button
                            type="button"
                            disabled={!isExportable}
                            title={!isExportable ? 'Belum ada data untuk diekspor' : `Unduh Dokumen Excel: ${report.title}`}
                            aria-label={`Unduh Dokumen Excel: ${report.title}`}
                            onClick={() => handleExport('Excel', report)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 sm:flex-none shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileSpreadsheet className="size-3.5" />
                            Unduh Excel (.xlsx)
                          </button>
                        </div>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-12 text-center">
                <FileText className="mx-auto size-6 text-zinc-400" />
                <h3 className="mt-3 font-bold text-zinc-900">
                  {dataStatus === 'error' ? 'Gagal memuat laporan' : search ? 'Laporan tidak ditemukan' : 'Belum ada laporan'}
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {dataStatus === 'error' ? 'Terjadi kesalahan saat menghubungi server data center.' : search ? 'Coba kata kunci lain atau hapus pencarian.' : 'Belum ada data untuk diekspor pada periode ini.'}
                </p>
                {search ? (
                  <button type="button" onClick={() => setSearch('')} className="mt-4 text-sm font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer">
                    Hapus pencarian
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Insights Section */}
      <section aria-label="Insight laporan" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Period insights</p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-zinc-950">Alokasi 5 pilar</h2>
            </div>
            <BarChart3 className="size-5 text-emerald-700" />
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Realisasi penyaluran pada periode yang dipilih.</p>
          <div className="mt-6">
            {progAlloc.length > 0 ? (
              <DistributionList items={progAlloc} />
            ) : (
              <p className="text-xs font-semibold text-slate-500 py-6 text-center">Belum ada transaksi tervalidasi untuk periode ini.</p>
            )}
          </div>
          <Link
            href="/penyaluran/program"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 transition hover:gap-2.5 motion-reduce:hover:gap-1.5"
          >
            Lihat rincian program <ChevronRight className="size-4" />
          </Link>
        </section>
        <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight text-zinc-950">Komposisi asnaf</h2>
              <p className="mt-1 text-sm text-zinc-500">Distribusi amanah berdasarkan kelompok penerima.</p>
            </div>
            <Sparkles className="size-5 text-violet-600" />
          </div>
          <div className="mt-6">
            {asnafAlloc.length > 0 ? (
              <DistributionList items={asnafAlloc} />
            ) : (
              <p className="text-xs font-semibold text-slate-500 py-6 text-center">Belum ada transaksi tervalidasi untuk periode ini.</p>
            )}
          </div>
        </section>
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-5 text-amber-700" />
            <h2 className="text-lg font-black tracking-tight text-zinc-950">Kesiapan laporan</h2>
          </div>
          <div className="mt-5 space-y-4">
            {REPORT_READINESS.map((item) => (
              <div key={item.title} className="flex gap-3">
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${READINESS_CLASSES[item.status]}`}>
                  {item.status === 'Selesai' ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-zinc-900">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-600">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      {/* Create Report Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs backdrop-fade" onClick={() => setCreateModalOpen(false)} />
          <div className="modal-pop relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900">Buat Laporan Penyaluran Baru</h2>
              <button type="button" onClick={() => setCreateModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X className="size-5" />
              </button>
            </div>
            <form onSubmit={handleCreateReport} className="mt-4 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-600">Judul Laporan *</label>
                <input
                  required
                  value={newReport.title}
                  onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                  placeholder="e.g. Rekap Penyaluran Z-Auto & UMKM Semester II"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">Kategori</label>
                  <select
                    value={newReport.category}
                    onChange={(e) => setNewReport({ ...newReport, category: e.target.value as ReportCategory })}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Ringkasan">Ringkasan (Eksekutif)</option>
                    <option value="Per Program">Per Program (5 Pilar BAZNAS)</option>
                    <option value="Per Asnaf">Per Asnaf (8 Golongan ZIS)</option>
                    <option value="Per Kecamatan">Per Kecamatan (13 Wilayah)</option>
                    <option value="Audit & LPJ">Audit & LPJ (Kepatuhan & Kas)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Periode</label>
                  <input
                    value={newReport.period}
                    onChange={(e) => setNewReport({ ...newReport, period: e.target.value })}
                    placeholder="Agustus 2026"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">Cakupan Wilayah</label>
                <input
                  value={newReport.scope}
                  onChange={(e) => setNewReport({ ...newReport, scope: e.target.value })}
                  placeholder="13 Kecamatan Kota Tangerang"
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">Deskripsi Ringkas</label>
                <textarea
                  rows={2}
                  value={newReport.description}
                  onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                  placeholder="Catatan ruang lingkup atau evaluasi laporan..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span>Buat Laporan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      <div
        aria-live="polite"
        role="status"
        className={`fixed bottom-5 right-5 z-50 flex max-w-[min(24rem,calc(100vw-2.5rem))] items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-950 px-3.5 py-3 text-sm font-semibold text-white shadow-xl transition duration-200 motion-reduce:transition-none ${
          feedback ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        {feedback ? (
          <>
            <p className="min-w-0 flex-1 leading-5">{feedback}</p>
            <button
              type="button"
              aria-label="Tutup notifikasi"
              onClick={() => setFeedback('')}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
