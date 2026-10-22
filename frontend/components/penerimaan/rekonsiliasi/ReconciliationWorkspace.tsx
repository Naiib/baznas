'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  UploadCloud,
  Layers,
  ArrowRight,
  ShieldCheck,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  Split,
  FileText,
  DollarSign,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';
import type {
  ReconciliationBatch,
  ReconciliationBatchDetail,
  ReconciliationStatementLine,
  PenerimaanTransaction,
  PenerimaanChannel,
} from '@/lib/api/types';

function formatRupiah(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const clean = String(amount).trim().replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const isNegative = clean.startsWith('-');
  const digits = isNegative ? clean.slice(1) : clean;
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return `${isNegative ? '-Rp ' : 'Rp '}${parts.join('.')}`;
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

interface StatusConfigItem {
  label: string;
  bg: string;
  text: string;
  border: string;
  icon: React.ReactNode;
}

const DEFAULT_STATUS_CONFIG: StatusConfigItem = {
  label: 'Draft',
  bg: 'bg-stone-50',
  text: 'text-stone-600',
  border: 'border-stone-200',
  icon: <Clock className="w-3.5 h-3.5" />,
};

const BATCH_STATUS_CONFIG: Record<string, StatusConfigItem> = {
  draft: DEFAULT_STATUS_CONFIG,
  in_progress: {
    label: 'Proses Pencocokan',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
  },
  matched: {
    label: 'Terekonsiliasi Penuh',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  discrepancy: {
    label: 'Ada Selisih',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  closed: {
    label: 'Ditutup (Final)',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    icon: <Lock className="w-3.5 h-3.5" />,
  },
};

export function ReconciliationWorkspace() {
  const { user } = useAuth();

  // Role resolution
  const actor = normalizeAccessActor(user);
  const canCloseBatch = actor.isAdmin || actor.level === 'leader';

  // Workspace state
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Selected batch for detail view
  const [selectedBatchId, setSelectedBatchId] = useState<number | string | null>(null);
  const [batchDetail, setBatchDetail] = useState<ReconciliationBatchDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isManualMatchOpen, setIsManualMatchOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Forms state
  const [createForm, setCreateForm] = useState({
    channel: 'bank_transfer' as PenerimaanChannel,
    account_name: 'Bank Syariah Indonesia (BSI)',
    account_number: '7001122334',
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    period_end: new Date().toISOString().slice(0, 10),
    notes: '',
    physical_cash_count: '',
  });

  const [importFile, setImportFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Manual matching state
  const [selectedStatementLine, setSelectedStatementLine] = useState<ReconciliationStatementLine | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | string | null>(null);
  const [manualMatchNotes, setManualMatchNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  // 1. Fetch batches list
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await penerimaanApi.getReconciliationBatches({
        channel: (channelFilter as any) || undefined,
        status: (statusFilter as any) || undefined,
        limit: 50,
      });

      if (res.success && res.data) {
        setBatches(res.data.items || []);
        // If currently selected batch is in list, auto refresh detail
        if (selectedBatchId) {
          fetchBatchDetail(selectedBatchId);
        }
      } else {
        setError(res.message || 'Gagal memuat daftar batch rekonsiliasi.');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, statusFilter, selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // 2. Fetch single batch detail
  const fetchBatchDetail = useCallback(async (id: number | string) => {
    setLoadingDetail(true);
    try {
      const res = await penerimaanApi.getReconciliationBatchById(id);
      if (res.success && res.data) {
        setBatchDetail(res.data);
      }
    } catch (err: any) {
      console.error('Fetch batch detail error:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelectBatch = (id: number | string) => {
    setSelectedBatchId(id);
    fetchBatchDetail(id);
  };

  // 3. Create Batch
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      let notes = createForm.notes;
      if (createForm.physical_cash_count) {
        notes = `${notes} [Fisik Kas: Rp ${Number(createForm.physical_cash_count).toLocaleString('id-ID')}]`;
      }

      const res = await penerimaanApi.createReconciliationBatch({
        channel: createForm.channel,
        account_name: createForm.account_name,
        account_number: createForm.account_number,
        period_start: `${createForm.period_start}T00:00:00.000Z`,
        period_end: `${createForm.period_end}T23:59:59.999Z`,
        notes: notes || null,
      });

      if (res.success && res.data) {
        setIsCreateOpen(false);
        setActionSuccess(`Batch ${res.data.batch_number} berhasil dibuat.`);
        fetchBatches();
        handleSelectBatch(res.data.id);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal membuat batch rekonsiliasi.');
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Import Bank Statement into Selected Batch
  const handleImportStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId || !importFile) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await penerimaanApi.importBankStatements(selectedBatchId, importFile);
      if (res.success && res.data) {
        setIsImportOpen(false);
        setImportFile(null);
        setActionSuccess(
          `Impor berhasil: ${res.data.imported_count} mutasi diimpor, ${res.data.matched_count} terekonsiliasi otomatis.`
        );
        fetchBatches();
        fetchBatchDetail(selectedBatchId);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal mengimpor rekening koran bank.');
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Trigger Auto-Match
  const handleAutoMatch = async () => {
    if (!selectedBatchId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await penerimaanApi.autoMatchBatch(selectedBatchId);
      if (res.success) {
        setActionSuccess(`Auto-match selesai: ${res.data?.new_matches || 0} kecocokan baru ditemukan.`);
        fetchBatches();
        fetchBatchDetail(selectedBatchId);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menjalankan auto-match.');
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Manual Match
  const handleManualMatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId || !selectedStatementLine || !selectedTransactionId) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await penerimaanApi.matchTransaction(selectedBatchId, {
        statement_line_id: selectedStatementLine.id,
        transaction_id: selectedTransactionId,
        notes: manualMatchNotes || undefined,
      });

      if (res.success) {
        setIsManualMatchOpen(false);
        setSelectedStatementLine(null);
        setSelectedTransactionId(null);
        setManualMatchNotes('');
        setActionSuccess('Transaksi berhasil dicocokkan secara manual.');
        fetchBatches();
        fetchBatchDetail(selectedBatchId);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal mencocokkan transaksi manual.');
    } finally {
      setSubmitting(false);
    }
  };

  // 7. Unmatch
  const handleUnmatch = async (lineId: number | string) => {
    if (!selectedBatchId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await penerimaanApi.unmatchTransaction(selectedBatchId, lineId);
      if (res.success) {
        setActionSuccess('Pencocokan mutasi berhasil dibatalkan.');
        fetchBatches();
        fetchBatchDetail(selectedBatchId);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal membatalkan pencocokan.');
    } finally {
      setSubmitting(false);
    }
  };

  // 8. Close Batch (Leader / Admin only)
  const handleCloseBatch = async () => {
    if (!selectedBatchId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await penerimaanApi.closeReconciliationBatch(selectedBatchId, {
        notes: closeNotes || undefined,
      });

      if (res.success) {
        setIsCloseModalOpen(false);
        setCloseNotes('');
        setActionSuccess('Batch rekonsiliasi telah berhasil ditutup dan difinalisasi.');
        fetchBatches();
        fetchBatchDetail(selectedBatchId);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menutup batch rekonsiliasi.');
    } finally {
      setSubmitting(false);
    }
  };

  // Summary KPIs calculation
  const totalBatches = batches.length;
  const totalExpectedSum = useMemo(() => batches.reduce((acc, b) => acc + BigInt(b.total_expected_amount || '0'), 0n), [batches]);
  const totalMatchedSum = useMemo(() => batches.reduce((acc, b) => acc + BigInt(b.total_matched_amount || '0'), 0n), [batches]);
  const totalDiscrepancySum = useMemo(() => batches.reduce((acc, b) => acc + BigInt(b.discrepancy_amount || '0'), 0n), [batches]);
  const isCurrentBatchClosed = batchDetail?.status === 'closed';

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {actionSuccess && (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 shadow-sm animate-fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-medium">{actionSuccess}</p>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-lg hover:bg-emerald-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 shadow-sm">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 p-1 rounded-lg hover:bg-rose-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Rekonsiliasi & Settlement Bank</h1>
          <p className="text-sm text-stone-500 mt-1">
            Pencocokan mutasi rekening koran bank, QRIS, dan serah-terima fisik kas dengan transaksi penerimaan ZIS.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchBatches}
            className="inline-flex items-center justify-center p-2 text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Batch Rekonsiliasi</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Batch</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totalBatches}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Mutasi Rekening</p>
            <p className="text-xl font-bold text-stone-900 mt-1">{formatRupiah(totalExpectedSum.toString())}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Terekonsiliasi</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{formatRupiah(totalMatchedSum.toString())}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Selisih (Variance)</p>
            <p className="text-xl font-bold text-rose-700 mt-1">{formatRupiah(totalDiscrepancySum.toString())}</p>
          </div>
        </div>
      </div>

      {/* Main Workspace Split: Left = Batches list, Right = Detail view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Batch list & filters (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Filter className="w-4 h-4 text-stone-500" />
                <span>Filter Batch</span>
              </h2>
              <span className="text-xs text-stone-500 font-medium">{batches.length} batch</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Kanal</label>
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Semua Kanal</option>
                  <option value="bank_transfer">Transfer Bank</option>
                  <option value="qris">QRIS</option>
                  <option value="counter_kasir">Counter Kasir</option>
                  <option value="jemput_zakat">Jemput Zakat</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full text-xs font-medium bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Semua Status</option>
                  <option value="draft">Draft</option>
                  <option value="in_progress">Proses Pencocokan</option>
                  <option value="matched">Terekonsiliasi</option>
                  <option value="discrepancy">Ada Selisih</option>
                  <option value="closed">Ditutup</option>
                </select>
              </div>
            </div>
          </div>

          {/* Batches Cards */}
          <div className="space-y-3">
            {loading && batches.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center text-stone-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-stone-400" />
                <p className="text-xs">Memuat batch rekonsiliasi...</p>
              </div>
            ) : batches.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-stone-200 text-center">
                <FileSpreadsheet className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-700">Belum ada batch rekonsiliasi</p>
                <p className="text-xs text-stone-500 mt-1">Buat batch baru untuk memulai proses pencocokan mutasi bank.</p>
              </div>
            ) : (
              batches.map((batch) => {
                const isSelected = selectedBatchId === batch.id;
                const statusCfg: StatusConfigItem = (batch.status && BATCH_STATUS_CONFIG[batch.status]) ?? DEFAULT_STATUS_CONFIG;
                return (
                  <div
                    key={batch.id}
                    onClick={() => handleSelectBatch(batch.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-100 shadow-md'
                        : 'border-stone-200 hover:border-stone-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-stone-900">{batch.batch_number}</span>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {batch.account_name ? `${batch.account_name} (${batch.account_number})` : batch.channel}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.icon}
                        <span>{statusCfg.label}</span>
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-stone-100 pt-2">
                      <div>
                        <span className="text-stone-400">Periode:</span>
                        <p className="font-medium text-stone-700">
                          {formatDate(batch.period_start)} - {formatDate(batch.period_end)}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-stone-400">Kecocokan:</span>
                        <p className="font-semibold text-emerald-700">
                          {formatRupiah(batch.total_matched_amount)} / {formatRupiah(batch.total_expected_amount)}
                        </p>
                      </div>
                    </div>

                    {batch.discrepancy_amount !== '0' && (
                      <div className="mt-2 text-xs text-rose-600 bg-rose-50 px-2 py-1 rounded-lg font-medium flex items-center justify-between">
                        <span>Selisih mutasi:</span>
                        <span>{formatRupiah(batch.discrepancy_amount)}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Batch Workspace Detail (7 cols on lg) */}
        <div className="lg:col-span-7">
          {!selectedBatchId ? (
            <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center shadow-sm">
              <Layers className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-stone-800">Pilih Batch Rekonsiliasi</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
                Pilih salah satu batch di sebelah kiri untuk melihat mutasi rekening koran, menjalankan auto-match,
                atau melakukan pencocokan manual.
              </p>
            </div>
          ) : loadingDetail ? (
            <div className="bg-white p-12 rounded-2xl border border-stone-200 text-center shadow-sm">
              <RefreshCw className="w-8 h-8 animate-spin text-stone-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-stone-600">Memuat detail rekonsiliasi...</p>
            </div>
          ) : batchDetail ? (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              {/* Batch Detail Top Header */}
              <div className="p-6 border-b border-stone-200 bg-stone-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-stone-900 font-mono tracking-tight">
                        {batchDetail.batch_number}
                      </h2>
                      {isCurrentBatchClosed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-200 text-stone-700">
                          <Lock className="w-3 h-3" /> Ditutup & Final
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                          Aktif (Dapat Diedit)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-1">
                      Kanal: <strong className="text-stone-700 uppercase">{batchDetail.channel}</strong> &bull; Akun:{' '}
                      <strong className="text-stone-700">
                        {batchDetail.account_name} ({batchDetail.account_number})
                      </strong>
                    </p>
                    {batchDetail.notes && (
                      <p className="text-xs text-stone-600 bg-white border border-stone-200 rounded-lg p-2 mt-2">
                        {batchDetail.notes}
                      </p>
                    )}
                  </div>

                  {/* Operational Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!isCurrentBatchClosed && (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsImportOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 shadow-sm"
                        >
                          <UploadCloud className="w-4 h-4 text-stone-500" />
                          <span>Import Mutasi Bank</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoMatch}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Auto Match</span>
                        </button>
                      </>
                    )}

                    {canCloseBatch && !isCurrentBatchClosed && (
                      <button
                        type="button"
                        onClick={() => setIsCloseModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 shadow-sm"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Tutup Batch</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded-xl border border-stone-200">
                    <span className="text-stone-400">Total Baris</span>
                    <p className="text-sm font-bold text-stone-800 mt-0.5">
                      {batchDetail.total_matched_count} / {batchDetail.total_expected_count} Cocok
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-stone-200">
                    <span className="text-stone-400">Nominal Cocok</span>
                    <p className="text-sm font-bold text-emerald-700 mt-0.5">
                      {formatRupiah(batchDetail.total_matched_amount)}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-stone-200">
                    <span className="text-stone-400">Sisa Selisih</span>
                    <p
                      className={`text-sm font-bold mt-0.5 ${
                        batchDetail.discrepancy_amount === '0' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatRupiah(batchDetail.discrepancy_amount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Statement Lines Table */}
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span>Daftar Mutasi Rekening Koran ({batchDetail.statement_lines?.length || 0})</span>
                  </h3>
                </div>

                {(!batchDetail.statement_lines || batchDetail.statement_lines.length === 0) ? (
                  <div className="p-8 text-center border-2 border-dashed border-stone-200 rounded-xl">
                    <UploadCloud className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-stone-600">Belum ada mutasi rekening koran</p>
                    <p className="text-xs text-stone-400 mt-1">
                      Klik tombol &ldquo;Import Mutasi Bank&rdquo; untuk mengunggah file CSV atau XLSX dari internet banking.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-stone-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Tanggal</th>
                          <th className="py-2.5 px-3">Referensi</th>
                          <th className="py-2.5 px-3">Uraian Mutasi</th>
                          <th className="py-2.5 px-3 text-right">Nominal</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {batchDetail.statement_lines.map((line) => {
                          const isMatched = line.status === 'matched';
                          return (
                            <tr key={line.id} className="hover:bg-stone-50/50 transition-colors">
                              <td className="py-3 px-3 font-mono text-stone-400">{line.line_number}</td>
                              <td className="py-3 px-3 text-stone-600">{formatDate(line.transaction_date)}</td>
                              <td className="py-3 px-3 font-mono font-medium text-stone-800">
                                {line.reference_number || '-'}
                              </td>
                              <td className="py-3 px-3 text-stone-700 max-w-xs truncate" title={line.description}>
                                {line.description}
                              </td>
                              <td className="py-3 px-3 text-right font-semibold text-stone-900">
                                {formatRupiah(line.amount)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                {isMatched ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3" /> Cocok
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                    Belum Cocok
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                {!isCurrentBatchClosed && (
                                  <>
                                    {isMatched ? (
                                      <button
                                        type="button"
                                        onClick={() => handleUnmatch(line.id)}
                                        className="text-xs text-rose-600 hover:text-rose-800 font-medium underline"
                                      >
                                        Batal Cocok
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedStatementLine(line);
                                          setIsManualMatchOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg border border-emerald-200 transition-colors"
                                      >
                                        <Split className="w-3 h-3" />
                                        <span>Cocokkan</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* MODAL 1: Create Batch Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-stone-900">Buat Batch Rekonsiliasi Baru</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Kanal Penerimaan</label>
                <select
                  value={createForm.channel}
                  onChange={(e) => setCreateForm({ ...createForm, channel: e.target.value as PenerimaanChannel })}
                  className="w-full text-xs font-medium bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="bank_transfer">Transfer Bank (BSI / Muamalat / Lainnya)</option>
                  <option value="qris">QRIS Nasional</option>
                  <option value="counter_kasir">Counter Kasir (Fisik Tunai Kantor)</option>
                  <option value="jemput_zakat">Layanan Jemput Zakat</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Bank / Nama Rekening</label>
                  <input
                    type="text"
                    required
                    value={createForm.account_name}
                    onChange={(e) => setCreateForm({ ...createForm, account_name: e.target.value })}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Bank Syariah Indonesia"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Nomor Rekening</label>
                  <input
                    type="text"
                    required
                    value={createForm.account_number}
                    onChange={(e) => setCreateForm({ ...createForm, account_number: e.target.value })}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="7001122334"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Periode Mulai</label>
                  <input
                    type="date"
                    required
                    value={createForm.period_start}
                    onChange={(e) => setCreateForm({ ...createForm, period_start: e.target.value })}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">Periode Selesai</label>
                  <input
                    type="date"
                    required
                    value={createForm.period_end}
                    onChange={(e) => setCreateForm({ ...createForm, period_end: e.target.value })}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {(createForm.channel === 'counter_kasir' || createForm.channel === 'jemput_zakat') && (
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Fisik Kas Dihitung (Physical Count Rp)
                  </label>
                  <input
                    type="number"
                    value={createForm.physical_cash_count}
                    onChange={(e) => setCreateForm({ ...createForm, physical_cash_count: e.target.value })}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Nominal fisik kas di brankas/kantong setoran"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Catatan Operasional</label>
                <textarea
                  rows={2}
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Keterangan tambahan mutasi bank..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Import Statement Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-stone-900">Import Rekening Koran (Mutasi Bank)</h3>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportStatement} className="space-y-4 mt-4">
              <div className="p-4 border-2 border-dashed border-stone-300 rounded-xl text-center bg-stone-50/50 hover:bg-stone-50 transition-colors">
                <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <label className="block text-xs font-semibold text-stone-800 cursor-pointer">
                  <span>Pilih file CSV atau XLSX rekening koran</span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    required
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>
                <p className="text-[11px] text-stone-500 mt-1">Format: CSV atau Excel (kolom: tanggal, referensi, keterangan, nominal)</p>
                {importFile && (
                  <div className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 py-1 px-2 rounded-lg inline-block">
                    {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsImportOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !importFile}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? 'Mengimpor...' : 'Mulai Impor & Cocokkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Manual Match Modal */}
      {isManualMatchOpen && selectedStatementLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-lg w-full p-6 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-stone-900">Pencocokan Manual Amil</h3>
              <button
                type="button"
                onClick={() => setIsManualMatchOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-stone-800">Mutasi Rekening Koran yang Dipilih:</p>
              <div className="flex justify-between text-stone-600">
                <span>Uraian: {selectedStatementLine.description}</span>
                <span className="font-bold text-emerald-700">{formatRupiah(selectedStatementLine.amount)}</span>
              </div>
              <p className="text-stone-500">Referensi: {selectedStatementLine.reference_number || '-'}</p>
            </div>

            <form onSubmit={handleManualMatchSubmit} className="space-y-4 mt-4">
              <div>
                <label htmlFor="candidate-tx-select" className="block text-xs font-medium text-stone-700 mb-1">
                  Pilih Transaksi Penerimaan Kandidat ({batchDetail?.unmatched_transactions?.length || 0} tersedia)
                </label>
                <select
                  id="candidate-tx-select"
                  required
                  value={selectedTransactionId || ''}
                  onChange={(e) => setSelectedTransactionId(e.target.value)}
                  className="w-full text-xs font-medium bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- Pilih Transaksi yang Cocok --</option>
                  {batchDetail?.unmatched_transactions?.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {tx.transaction_number} - {tx.muzakki_name} ({formatRupiah(tx.amount)}) - {formatDate(tx.created_at)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">Catatan Pencocokan (Alasan Amil)</label>
                <input
                  type="text"
                  value={manualMatchNotes}
                  onChange={(e) => setManualMatchNotes(e.target.value)}
                  placeholder="Misal: Nomor referensi berbeda tipis atau mutasi gabungan"
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsManualMatchOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedTransactionId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Tautkan Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Close Batch Confirmation Modal */}
      {isCloseModalOpen && batchDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-md w-full p-6 animate-scale-in">
            <div className="flex items-center space-x-3 text-rose-600 pb-3 border-b border-stone-100">
              <Lock className="w-6 h-6 flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-stone-900">Konfirmasi Penutupan Batch</h3>
                <p className="text-xs text-stone-500">Tindakan ini bersifat permanen dan tidak dapat diulang.</p>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1.5 text-amber-900">
              <p className="font-semibold">Ringkasan Penutupan:</p>
              <div className="flex justify-between">
                <span>Mutasi Diharapkan:</span>
                <span className="font-bold">{formatRupiah(batchDetail.total_expected_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Mutasi Terekonsiliasi:</span>
                <span className="font-bold text-emerald-700">{formatRupiah(batchDetail.total_matched_amount)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-1">
                <span>Selisih Akhir (Variance):</span>
                <span className="font-bold text-rose-700">{formatRupiah(batchDetail.discrepancy_amount)}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Catatan Persetujuan Penutupan (Wajib Diisi oleh Kepala Bagian)
              </label>
              <textarea
                rows={2}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Penutupan batch diverifikasi oleh Kepala Bagian..."
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsCloseModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCloseBatch}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
              >
                {submitting ? 'Menutup Batch...' : 'Tutup Batch Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
