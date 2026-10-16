'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Filter,
  Calendar,
  Search,
  RefreshCw,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  Clock,
  AlertCircle,
  ArrowUpDown,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { useAuth } from '@/components/auth/AuthProvider';
import type {
  PenerimaanReportSummary,
  PenerimaanTransaction,
  PenerimaanChannel,
  PenerimaanFundType,
  PenerimaanReportQueryParams,
  PenerimaanAccount,
  PenerimaanAuditReportRow,
} from '@/lib/api/types';

export function formatRupiahExact(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const str = String(amount).trim();
  const isNegative = str.startsWith('-');
  const clean = (str.replace(/^-/, '').split('.')[0] || '').replace(/[^0-9]/g, '');
  if (!clean) return 'Rp 0';
  const formatted = clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-Rp ' : 'Rp '}${formatted}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const PERIOD_OPTIONS = [
  { label: '7 Hari', value: '7d' },
  { label: '30 Hari', value: '30d' },
  { label: '1 Tahun', value: '1y' },
  { label: 'Kustom', value: 'custom' },
];

const CHANNELS: { label: string; value: string }[] = [
  { label: 'Semua Kanal', value: '' },
  { label: 'Transfer Bank', value: 'bank_transfer' },
  { label: 'QRIS', value: 'qris' },
  { label: 'Counter Kasir', value: 'counter_kasir' },
  { label: 'Jemput Zakat', value: 'jemput_zakat' },
  { label: 'Portal Web', value: 'portal_web' },
];

const FUND_TYPES: { label: string; value: string }[] = [
  { label: 'Semua Jenis Dana', value: '' },
  { label: 'Zakat Maal', value: 'zakat_maal' },
  { label: 'Zakat Fitrah', value: 'zakat_fitrah' },
  { label: 'Zakat Profesi', value: 'zakat_profesi' },
  { label: 'Infak', value: 'infak' },
  { label: 'Sedekah', value: 'sedekah' },
  { label: 'DSKL', value: 'dskl' },
  { label: 'Fidyah', value: 'fidyah' },
];

const VIEW_OPTIONS = [
  { label: 'Normal (Transaksi)', value: 'normal' },
  { label: 'Pengecualian / Anomali', value: 'exceptions' },
  { label: 'Rekonsiliasi', value: 'reconciliation' },
  { label: 'Audit Trail', value: 'audit' },
];

const MODE_OPTIONS = [
  { label: 'Semua Sumber', value: '' },
  { label: 'Manual (Kas/Amil)', value: 'manual' },
  { label: 'Digital (Gateway/QRIS)', value: 'digital' },
];

const FLAGGED_OPTIONS = [
  { label: 'Semua Status Anomali', value: '' },
  { label: 'Normal Saja', value: 'false' },
  { label: 'Anomali / Perhatian', value: 'true' },
];

const RECONCILIATION_OPTIONS = [
  { label: 'Semua Status Rekonsiliasi', value: '' },
  { label: 'Menunggu Rekonsiliasi', value: 'pending' },
  { label: 'Terekonsiliasi', value: 'reconciled' },
  { label: 'Posted', value: 'posted' },
];

const SORT_BY_OPTIONS = [
  { label: 'Tanggal Transaksi', value: 'transaction_date' },
  { label: 'Nominal', value: 'amount' },
  { label: 'Waktu Input', value: 'created_at' },
  { label: 'ID Transaksi', value: 'id' },
  { label: 'Status', value: 'status' },
  { label: 'Kanal', value: 'channel' },
  { label: 'Jenis Dana', value: 'fund_type' },
  { label: 'Nama Muzakki', value: 'muzakki_name' },
];

const SORT_DIR_OPTIONS = [
  { label: 'Menurun (DESC)', value: 'DESC' },
  { label: 'Menaik (ASC)', value: 'ASC' },
];

export function ReportWorkspace() {
  const { user } = useAuth();

  const [period, setPeriod] = useState<string>('30d');
  const [channel, setChannel] = useState<string>('');
  const [fundType, setFundType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [programId, setProgramId] = useState<string>('');
  const [programSearch, setProgramSearch] = useState<string>('');
  const [muzakkiId, setMuzakkiId] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [isFlagged, setIsFlagged] = useState<string>('');
  const [reconciliationStatus, setReconciliationStatus] = useState<string>('');
  const [view, setView] = useState<string>('normal');
  const [sortBy, setSortBy] = useState<string>('transaction_date');
  const [sortDir, setSortDir] = useState<string>('DESC');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [accounts, setAccounts] = useState<PenerimaanAccount[]>([]);
  const [summary, setSummary] = useState<PenerimaanReportSummary | null>(null);
  const [transactions, setTransactions] = useState<Array<PenerimaanTransaction | PenerimaanAuditReportRow>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const activePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (activePollTimerRef.current) {
        clearTimeout(activePollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof penerimaanApi.getAccounts === 'function') {
      penerimaanApi.getAccounts()?.then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setAccounts(res.data);
        }
      })?.catch(() => null);
    }
  }, []);

  const totalRecords = summary?.kpis?.total_count ?? summary?.kpis?.total_transactions ?? transactions.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    setPage(1);
  }, [
    period, channel, fundType, startDate, endDate, search,
    accountId, programId, programSearch, muzakkiId, mode,
    isFlagged, reconciliationStatus, view, sortBy, sortDir, pageSize,
  ]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params: PenerimaanReportQueryParams = {
        period,
        channel: channel || undefined,
        fund_type: fundType || undefined,
        start_date: period === 'custom' ? startDate || undefined : undefined,
        end_date: period === 'custom' ? endDate || undefined : undefined,
        search: search || undefined,
        account_id: accountId ? parseInt(accountId, 10) : undefined,
        program_id: programId ? parseInt(programId, 10) : undefined,
        program_search: programSearch || undefined,
        muzakki_id: muzakkiId ? parseInt(muzakkiId, 10) : undefined,
        mode: mode || undefined,
        is_flagged: isFlagged === 'true' ? true : isFlagged === 'false' ? false : undefined,
        reconciliation_status: reconciliationStatus || undefined,
        view: view || 'normal',
        sort_by: sortBy,
        sort_dir: sortDir,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };

      const summaryRes = await penerimaanApi.getReports(params);

      if (summaryRes.success && summaryRes.data) {
        setSummary(summaryRes.data);
        setTransactions(summaryRes.data.preview_transactions || []);
      }
    } catch (err: any) {
      console.error('Fetch reports error:', err);
      setError(`Gagal memuat laporan: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    period, channel, fundType, startDate, endDate, search,
    accountId, programId, programSearch, muzakkiId, mode,
    isFlagged, reconciliationStatus, view, sortBy, sortDir, page, pageSize,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    if (activePollTimerRef.current) {
      clearTimeout(activePollTimerRef.current);
      activePollTimerRef.current = null;
    }

    if (format === 'pdf') setIsExportingPdf(true);
    else setIsExportingExcel(true);
    setExportStatus('Menyiapkan dokumen...');

    try {
      const payload: any = {
        format,
        ...(summary?.applied_filters || {
          period,
          ...(channel ? { channel } : {}),
          ...(fundType ? { fund_type: fundType } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
          ...(search ? { search } : {}),
        }),
      };

      const genRes = await penerimaanApi.generateReport(payload);
      if (!genRes.success || !genRes.data?.id) {
        throw new Error(genRes.message || 'Gagal membuat job ekspor laporan.');
      }

      const jobId = genRes.data.id;
      setExportStatus('Memproses dokumen...');

      let isTerminal = false;
      let isPolling = false;
      let attempts = 0;
      const maxAttempts = 60;

      await new Promise<void>((resolve, reject) => {
        const scheduleNext = () => {
          if (isTerminal) return;
          activePollTimerRef.current = setTimeout(checkStatus, 1000);
        };

        const checkStatus = async () => {
          if (isTerminal || isPolling) return;
          isPolling = true;
          attempts += 1;
          try {
            const jobRes = await penerimaanApi.getExportJob(jobId);
            const job = jobRes?.data;
            if (!job) {
              if (attempts >= maxAttempts) {
                isTerminal = true;
                reject(new Error('Waktu tunggu proses ekspor melebihi batas.'));
                return;
              }
              isPolling = false;
              scheduleNext();
              return;
            }

            if (job.status === 'completed') {
              isTerminal = true;
              setExportStatus('Mengunduh dokumen...');
              const blob = await penerimaanApi.downloadExportJob(jobId);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = job.file_name || `laporan-penerimaan-${period}-${Date.now()}.${format}`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
              setExportStatus(null);
              resolve();
            } else if (job.status === 'failed') {
              isTerminal = true;
              reject(new Error(job.error_message || 'Job ekspor gagal diproses oleh server.'));
            } else {
              setExportStatus(job.status === 'processing' ? 'Memproses dokumen...' : 'Dalam antrean...');
              if (attempts >= maxAttempts) {
                isTerminal = true;
                reject(new Error('Waktu tunggu proses ekspor melebihi batas.'));
                return;
              }
              isPolling = false;
              scheduleNext();
            }
          } catch (pollErr) {
            isTerminal = true;
            reject(pollErr);
          }
        };

        checkStatus();
      });
    } catch (err: any) {
      console.error('Export report error:', err);
      setExportStatus(null);
      alert(err?.message || `Gagal mengekspor laporan format ${format.toUpperCase()}.`);
    } finally {
      if (activePollTimerRef.current) {
        clearTimeout(activePollTimerRef.current);
        activePollTimerRef.current = null;
      }
      if (format === 'pdf') setIsExportingPdf(false);
      else setIsExportingExcel(false);
    }
  };

  const totalRevenue = summary?.kpis?.total_revenue ?? summary?.kpis?.total_amount ?? '0';
  const totalTransactions = Number(summary?.kpis?.total_transactions ?? summary?.kpis?.total_count ?? 0);
  const reconciledPct = Number(summary?.kpis?.reconciled_pct ?? 0);
  let avgAmount: string = summary?.kpis?.average_amount ?? '0';
  if (!summary?.kpis?.average_amount && totalTransactions > 0) {
    try {
      const revBi = BigInt(String(totalRevenue).replace(/[^0-9-]/g, '') || '0');
      const avgBi = revBi / BigInt(totalTransactions);
      avgAmount = avgBi.toString();
    } catch {
      avgAmount = '0';
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Laporan Penerimaan ZIS</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Rekapitulasi resmi pengumpulan Zakat, Infak, dan Sedekah terpadu BAZNAS.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {exportStatus && (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-medium flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
              {exportStatus}
            </span>
          )}
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={isExportingPdf || isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
          >
            {isExportingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-rose-600" />}
            <span>Unduh PDF</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={isExportingExcel || isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
          >
            {isExportingExcel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>Unduh Excel</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Controls */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-zinc-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period Tabs */}
          <div className="flex items-center gap-1.5 bg-zinc-100/80 p-1 rounded-xl">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  period === opt.value
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-zinc-500 font-medium">
            Kesegaran Data: <span className="text-emerald-700 font-semibold">{summary?.reports?.[0]?.data_freshness || summary?.meta?.data_freshness || 'Belum ada data'}</span>
          </div>
        </div>

        {/* Custom Date Inputs if Custom Selected */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-100">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Mulai:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-emerald-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-emerald-600"
              />
            </div>
          </div>
        )}

        {/* Dropdowns & Canonical Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-zinc-100">
          <div>
            <label htmlFor="channel-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Kanal</label>
            <select
              id="channel-filter"
              aria-label="Kanal"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fund-type-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Jenis Dana</label>
            <select
              id="fund-type-filter"
              aria-label="Jenis Dana"
              value={fundType}
              onChange={(e) => setFundType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {FUND_TYPES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="account-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Pilih Rekening</label>
            <select
              id="account-filter"
              aria-label="Pilih Rekening"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              <option value="">Semua Rekening</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.bank_name} - {a.account_number}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="mode-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Mode Transaksi</label>
            <select
              id="mode-filter"
              aria-label="Mode Transaksi"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {MODE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="flagged-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Status Anomali / Pengecualian</label>
            <select
              id="flagged-filter"
              aria-label="Status Anomali / Pengecualian"
              value={isFlagged}
              onChange={(e) => setIsFlagged(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {FLAGGED_OPTIONS.map((fl) => (
                <option key={fl.value} value={fl.value}>
                  {fl.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reconciliation-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Status Rekonsiliasi</label>
            <select
              id="reconciliation-filter"
              aria-label="Status Rekonsiliasi"
              value={reconciliationStatus}
              onChange={(e) => setReconciliationStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {RECONCILIATION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="view-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Jenis Laporan / Tampilan</label>
            <select
              id="view-filter"
              aria-label="Jenis Laporan / Tampilan"
              value={view}
              onChange={(e) => setView(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {VIEW_OPTIONS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sort-by-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Urutkan Berdasarkan</label>
            <select
              id="sort-by-filter"
              aria-label="Urutkan Berdasarkan"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {SORT_BY_OPTIONS.filter((s) => view !== 'audit' || s.value !== 'amount').map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sort-dir-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Arah Urutan</label>
            <select
              id="sort-dir-filter"
              aria-label="Arah Urutan"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 focus:outline-emerald-600"
            >
              {SORT_DIR_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="program-id-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">ID Program</label>
            <input
              id="program-id-filter"
              aria-label="ID Program"
              type="number"
              min="1"
              placeholder="ID Program..."
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:outline-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="program-search-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">Cari Program</label>
            <input
              id="program-search-filter"
              aria-label="Cari Program"
              type="text"
              placeholder="Cari Program..."
              value={programSearch}
              onChange={(e) => setProgramSearch(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:outline-emerald-600"
            />
          </div>

          <div>
            <label htmlFor="muzakki-id-filter" className="block text-[11px] font-semibold text-zinc-500 mb-1">ID Muzakki</label>
            <input
              id="muzakki-id-filter"
              aria-label="ID Muzakki"
              type="number"
              min="1"
              placeholder="ID Muzakki..."
              value={muzakkiId}
              onChange={(e) => setMuzakkiId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:outline-emerald-600"
            />
          </div>
        </div>

        {/* Free text search bar */}
        <div className="pt-2 border-t border-zinc-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              aria-label="Pencarian Bebas"
              placeholder="Cari Muzakki / No. TRX..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-zinc-200 rounded-xl bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:outline-emerald-600"
            />
          </div>
        </div>
      </div>

      {/* 3. Executive KPI Cards */}
      {view === 'audit' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Log Audit</span>
            <div className="text-xl font-extrabold text-emerald-800 mt-1">
              {totalTransactions} Aktivitas
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Jumlah log aktivitas audit tercatat</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status Jejak Audit</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              Terekam Lengkap
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Integritas log audit tersimpan aman</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Cakupan Audit</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              Penerimaan & Sistem
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Mencakup modul transaksi dan pengaturan</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Kesegaran Data</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              {summary?.meta?.data_freshness ? 'Terkini' : 'Tersedia'}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Waktu aktivitas audit terakhir dicatat</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Penerimaan</span>
            <div className="text-xl font-extrabold text-emerald-800 mt-1">
              {formatRupiahExact(totalRevenue)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Akumulasi penerimaan ZIS terverifikasi</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Transaksi</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              {totalTransactions} Trx
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Jumlah seluruh transaksi dalam periode</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Rata-rata Transaksi</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              {formatRupiahExact(avgAmount)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Rata-rata kontribusi per donasi</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tingkat Rekonsiliasi</span>
            <div className="text-xl font-extrabold text-zinc-900 mt-1">
              {reconciledPct}%
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Transaksi terekonsiliasi mutasi bank</p>
          </div>
        </div>
      )}

      {/* 4. Transactions Preview Table / List */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900">{view === 'audit' ? 'Pratinjau Jejak Audit' : 'Pratinjau Rincian Transaksi'}</h2>
          <span className="text-xs text-zinc-500">{transactions.length} baris ditampilkan</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-zinc-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            <p className="text-xs">Memuat data laporan...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm text-zinc-800 font-semibold">{error}</p>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 space-y-2">
            <FileText className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="text-sm font-semibold">Tidak ada transaksi untuk filter ini</p>
            <p className="text-xs text-zinc-400">Coba ubah rentang tanggal atau kriteria filter di atas.</p>
          </div>
        ) : (
          <div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              {view === 'audit' ? (
                <table className="w-full text-left text-xs text-zinc-700">
                  <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-100">
                    <tr>
                      <th className="px-4 py-3">ID Audit</th>
                      <th className="px-4 py-3">Waktu</th>
                      <th className="px-4 py-3">Entitas</th>
                      <th className="px-4 py-3">Aksi</th>
                      <th className="px-4 py-3">Aktor</th>
                      <th className="px-4 py-3">Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {transactions.map((row) => {
                      const audit = row as PenerimaanAuditReportRow;
                      return (
                        <tr key={audit.id}>
                          <td className="px-4 py-3 font-semibold text-zinc-900">{audit.audit_event_id}</td>
                          <td className="px-4 py-3 text-zinc-500">{formatDate(audit.created_at)}</td>
                          <td className="px-4 py-3">{audit.entity_type}#{audit.entity_id ?? '-'}</td>
                          <td className="px-4 py-3 font-semibold">{audit.action}</td>
                          <td className="px-4 py-3">{audit.actor_name || '-'}</td>
                          <td className="px-4 py-3 max-w-xs truncate">{typeof audit.changes === 'string' ? audit.changes : JSON.stringify(audit.changes || {})}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
              <table className="w-full text-left text-xs text-zinc-700">
                <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-100">
                  <tr>
                    <th className="px-4 py-3">No. Transaksi</th>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Kanal</th>
                    <th className="px-4 py-3">Jenis Dana</th>
                    <th className="px-4 py-3">Muzakki</th>
                    <th className="px-4 py-3 text-right">Nominal</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(transactions as PenerimaanTransaction[]).map((tx) => (
                    <tr key={tx.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-zinc-900">{tx.transaction_number}</td>
                      <td className="px-4 py-3 text-zinc-500">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3 capitalize">{tx.channel ? tx.channel.replace(/_/g, ' ') : '-'}</td>
                      <td className="px-4 py-3 capitalize">{tx.fund_type ? tx.fund_type.replace(/_/g, ' ') : '-'}</td>
                      <td className="px-4 py-3 font-medium text-zinc-800">{tx.muzakki_name || 'Hamba Allah'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-zinc-900">{formatRupiahExact(tx.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-zinc-100">
              {view === 'audit' ? transactions.map((row) => {
                const audit = row as PenerimaanAuditReportRow;
                return (
                <div key={audit.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-900">Audit #{audit.audit_event_id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">{audit.action}</span>
                  </div>
                  <div className="text-xs text-zinc-700 font-medium">{audit.entity_type}#{audit.entity_id ?? '-'}</div>
                  <div className="text-xs text-zinc-500">{audit.actor_name || '-'} • {formatDate(audit.created_at)}</div>
                  <div className="text-xs text-zinc-600 truncate">{typeof audit.changes === 'string' ? audit.changes : JSON.stringify(audit.changes || {})}</div>
                </div>
                );
              }) : (transactions as PenerimaanTransaction[]).map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-900">Ref: {tx.transaction_number}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      {tx.status}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-700 font-medium">{tx.muzakki_name || 'Hamba Allah'}</div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
                    <span>{formatDate(tx.created_at)} • {tx.channel ? tx.channel.replace(/_/g, ' ') : '-'}</span>
                    <span className="font-bold text-zinc-900">{formatRupiahExact(tx.amount)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-600 bg-zinc-50/50 rounded-b-2xl">
              <div className="flex items-center gap-2">
                <span>
                  Halaman <span className="font-semibold text-zinc-900">{page}</span> dari{' '}
                  <span className="font-semibold text-zinc-900">{totalPages}</span> ({totalRecords} data)
                </span>
                <span className="text-zinc-300">|</span>
                <label htmlFor="page-size-select" className="sr-only">Baris per halaman</label>
                <select
                  id="page-size-select"
                  aria-label="Baris per halaman"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 border border-zinc-200 rounded-lg bg-white text-zinc-800 text-xs focus:outline-emerald-600"
                >
                  <option value="25">25 / hal</option>
                  <option value="50">50 / hal</option>
                  <option value="100">100 / hal</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Halaman Sebelumnya"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  aria-label="Halaman Berikutnya"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
