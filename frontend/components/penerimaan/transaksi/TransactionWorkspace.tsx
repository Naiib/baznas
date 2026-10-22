'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  RefreshCw,
  CheckSquare,
  Square,
  MinusSquare,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldAlert,
  CreditCard,
  Building,
  User,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Plus,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { useAuth } from '@/components/auth/AuthProvider';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import type {
  PenerimaanTransaction,
  PenerimaanStatus,
  PenerimaanChannel,
  PenerimaanFundType,
} from '@/lib/api/types';

const APPROVAL_THRESHOLD = 10_000_000; // Rp10.000.000

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'Semua Status', value: '' },
  { label: 'Menunggu Validasi', value: 'Menunggu Validasi' },
  { label: 'Menunggu Approval', value: 'Menunggu Approval' },
  { label: 'Tervalidasi', value: 'Tervalidasi' },
  { label: 'Menunggu Rekonsiliasi', value: 'Menunggu Rekonsiliasi' },
  { label: 'Posted', value: 'Posted' },
  { label: 'Ditolak', value: 'Ditolak' },
];

const CHANNELS: { label: string; value: string }[] = [
  { label: 'Semua Kanal', value: '' },
  { label: 'Transfer Bank', value: 'bank_transfer' },
  { label: 'QRIS', value: 'qris' },
  { label: 'Counter Kasir', value: 'counter_kasir' },
  { label: 'Virtual Account', value: 'virtual_account' },
  { label: 'Payment Gateway', value: 'payment_gateway' },
  { label: 'Jemput Zakat', value: 'jemput_zakat' },
];

const FUND_TYPES: { label: string; value: string }[] = [
  { label: 'Semua Jenis Dana', value: '' },
  { label: 'Zakat Maal', value: 'zakat_maal' },
  { label: 'Zakat Fitrah', value: 'zakat_fitrah' },
  { label: 'Zakat Profesi', value: 'zakat_profesi' },
  { label: 'Infak', value: 'infak' },
  { label: 'Sedekah', value: 'sedekah' },
  { label: 'DSKL', value: 'dskl' },
  { label: 'Fidyah & Kafarat', value: 'fidyah' },
];

const DEFAULT_STATUS_BADGE = {
  label: 'Masuk',
  bg: 'bg-zinc-100',
  text: 'text-zinc-700',
  border: 'border-zinc-200',
  icon: Clock,
};

const STATUS_BADGE_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  Masuk: {
    label: 'Masuk',
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    icon: Clock,
  },
  'Menunggu Validasi': {
    label: 'Menunggu Validasi',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: Clock,
  },
  Tervalidasi: {
    label: 'Tervalidasi',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  Terverifikasi: {
    label: 'Terverifikasi',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  'Menunggu Approval': {
    label: 'Menunggu Approval',
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
    icon: AlertTriangle,
  },
  'Menunggu Rekonsiliasi': {
    label: 'Menunggu Rekonsiliasi',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    icon: Clock,
  },
  Terekonsiliasi: {
    label: 'Terekonsiliasi',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    icon: CheckCircle2,
  },
  Posted: {
    label: 'Posted',
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-200',
    icon: CheckCircle2,
  },
  Ditolak: {
    label: 'Ditolak',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    icon: AlertTriangle,
  },
  Dibatalkan: {
    label: 'Dibatalkan',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-300',
    icon: X,
  },
};

function formatRupiah(amount: string | null | undefined): string {
  const normalized = amount && /^-?\d+$/.test(amount) ? BigInt(amount) : 0n;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(normalized);
}

function formatDate(isoString: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function TransactionWorkspace() {
  const { user } = useAuth();

  // Filters State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [fundTypeFilter, setFundTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFlaggedOnly, setIsFlaggedOnly] = useState(false);
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Data & Pagination State
  const [transactions, setTransactions] = useState<PenerimaanTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [currentCursorIndex, setCurrentCursorIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 15;

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Detail Drawer State & Focus Restoration
  const [activeDetailId, setActiveDetailId] = useState<string | number | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Check if a transaction is policy-eligible for bulk validation
  const isEligibleForBulkValidation = useCallback((tx: PenerimaanTransaction): boolean => {
    const isStatusEligible = tx.status === 'Menunggu Validasi' || tx.status === 'Masuk';
    const isAmountBelowThreshold = BigInt(tx.amount || '0') < BigInt(APPROVAL_THRESHOLD);
    const isNotFlagged = !tx.is_flagged && !tx.is_duplicate && !tx.is_incomplete;
    return isStatusEligible && isAmountBelowThreshold && isNotFlagged;
  }, []);

  // Fetch transactions from API
  const fetchTransactions = useCallback(
    async (cursor: string | null = null) => {
      setLoading(true);
      setError(null);
      try {
        const params: any = {
          limit: pageSize,
        };
        if (cursor) params.cursor = cursor;
        if (search.trim()) params.search = search.trim();
        if (statusFilter) params.status = statusFilter;
        if (channelFilter) params.channel = channelFilter;
        if (fundTypeFilter) params.fund_type = fundTypeFilter;
        if (startDate) params.start_date = startDate;
        if (endDate) params.end_date = endDate;
        if (isFlaggedOnly) params.is_flagged = true;
        if (needsActionOnly) params.needs_action = true;
        if (minAmount) params.min_amount = Number(minAmount);
        if (maxAmount) params.max_amount = Number(maxAmount);

        const res = await penerimaanApi.getTransactions(params);
        if (res.success && res.data) {
          setTransactions(res.data.items || []);
          setNextCursor(res.data.next_cursor);
          setHasMore(res.data.has_more);
          setTotalCount(res.data.total_count || 0);
        } else {
          setError(res.message || 'Gagal memuat data transaksi');
        }
      } catch (err: any) {
        setError(err.message || 'Terjadi kesalahan jaringan');
      } finally {
        setLoading(false);
      }
    },
    [
      search,
      statusFilter,
      channelFilter,
      fundTypeFilter,
      startDate,
      endDate,
      isFlaggedOnly,
      needsActionOnly,
      minAmount,
      maxAmount,
    ]
  );

  // Reload data and reset cursor history when filter changes
  useEffect(() => {
    setCursorHistory([null]);
    setCurrentCursorIndex(0);
    setSelectedIds(new Set());
    fetchTransactions(null);
  }, [fetchTransactions]);

  // Pagination Handlers
  const handleNextPage = () => {
    if (!hasMore || !nextCursor) return;
    const nextIdx = currentCursorIndex + 1;
    if (cursorHistory.length <= nextIdx) {
      setCursorHistory((prev) => [...prev, nextCursor]);
    }
    setCurrentCursorIndex(nextIdx);
    fetchTransactions(nextCursor);
  };

  const handlePrevPage = () => {
    if (currentCursorIndex <= 0) return;
    const prevIdx = currentCursorIndex - 1;
    setCurrentCursorIndex(prevIdx);
    const targetCursor = cursorHistory[prevIdx];
    fetchTransactions(targetCursor);
  };

  // Eligible transactions on current page
  const eligibleItems = useMemo(() => {
    return transactions.filter(isEligibleForBulkValidation);
  }, [transactions, isEligibleForBulkValidation]);

  // Master Checkbox State
  const isAllEligibleSelected =
    eligibleItems.length > 0 &&
    eligibleItems.every((tx) => selectedIds.has(tx.id));

  const isSomeEligibleSelected =
    eligibleItems.some((tx) => selectedIds.has(tx.id)) && !isAllEligibleSelected;

  const handleSelectAllEligible = () => {
    if (isAllEligibleSelected) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all eligible on current page
      const newSet = new Set(selectedIds);
      eligibleItems.forEach((tx) => newSet.add(tx.id));
      setSelectedIds(newSet);
    }
  };

  const handleToggleSelect = (id: number | string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Execute Bulk Validation
  const handleBulkValidate = async () => {
    if (selectedIds.size === 0 || bulkActionInProgress) return;
    const count = selectedIds.size;
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin memvalidasi ${count} transaksi terpilih sekaligus?`
    );
    if (!confirmed) return;

    setBulkActionInProgress(true);
    setBulkFeedback(null);
    try {
      const res = await penerimaanApi.bulkValidateTransactions(Array.from(selectedIds));
      if (res.success && res.data) {
        setBulkFeedback(
          `Berhasil memvalidasi ${res.data.validated_count} transaksi.` +
            (res.data.failed_count ? ` (${res.data.failed_count} gagal/memerlukan approval)` : '')
        );
        setSelectedIds(new Set());
        fetchTransactions(cursorHistory[currentCursorIndex]);
      } else {
        setBulkFeedback(res.message || 'Gagal memproses validasi massal');
      }
    } catch (err: any) {
      setBulkFeedback(err.message || 'Terjadi kesalahan sistem saat validasi massal');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Open Detail Drawer
  const openDetail = (id: string | number, triggerElement?: HTMLButtonElement) => {
    if (triggerElement) {
      lastTriggerRef.current = triggerElement;
    }
    setActiveDetailId(id);
  };

  // Close Detail Drawer & Restore Focus
  const closeDetail = () => {
    setActiveDetailId(null);
    if (lastTriggerRef.current) {
      lastTriggerRef.current.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">
            Daftar Transaksi Penerimaan
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Kelola, validasi berkas, dan pantau seluruh transaksi donasi ZIS yang masuk.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/penerimaan/transaksi/baru"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
          >
            <Plus className="size-4" />
            <span>Input Transaksi Manual</span>
          </Link>

          <button
            type="button"
            onClick={() => fetchTransactions(cursorHistory[currentCursorIndex])}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:opacity-50"
            title="Muat ulang data"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Banner */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-5 py-3 shadow-xs transition animate-in fade-in">
          <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-900">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>{selectedIds.size} transaksi dipilih untuk validasi massal</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkActionInProgress}
              onClick={handleBulkValidate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkActionInProgress ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <CheckSquare className="size-3.5" />
              )}
              <span>Validasi Terpilih ({selectedIds.size})</span>
            </button>

            <button
              type="button"
              disabled={bulkActionInProgress}
              onClick={() => setSelectedIds(new Set())}
              className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Feedback Message */}
      {bulkFeedback && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-800">
          <span>{bulkFeedback}</span>
          <button
            type="button"
            onClick={() => setBulkFeedback(null)}
            className="text-emerald-600 hover:text-emerald-900"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs">
        {/* Search & Quick Controls */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari nomor transaksi, muzakki, telepon, referensi bank..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2.5 pl-10 pr-9 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setNeedsActionOnly(!needsActionOnly)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${
                needsActionOnly
                  ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <Clock className="size-3.5" />
              <span>Perlu Tindakan</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFlaggedOnly(!isFlaggedOnly)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${
                isFlaggedOnly
                  ? 'border-rose-300 bg-rose-50 text-rose-900 shadow-2xs'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <ShieldAlert className="size-3.5" />
              <span>Berisiko / Flagged</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${
                showAdvancedFilters || channelFilter || fundTypeFilter || startDate || endDate || minAmount
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>Filter Lengkap</span>
            </button>
          </div>
        </div>

        {/* Status Horizontal Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-zinc-100 no-scrollbar">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-zinc-100/70 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Advanced Filters Expandable Panel */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-2 lg:grid-cols-4 animate-in fade-in">
            {/* Channel Filter */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Kanal Penerimaan
              </label>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              >
                {CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Fund Type Filter */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Jenis Dana
              </label>
              <select
                value={fundTypeFilter}
                onChange={(e) => setFundTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              >
                {FUND_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {ft.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Min Amount */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Min. Nominal (Rp)
              </label>
              <input
                type="number"
                placeholder="0"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Max Amount */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Maks. Nominal (Rp)
              </label>
              <input
                type="number"
                placeholder="100000000"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Clear All Filters */}
            <div className="flex items-end sm:col-span-2 lg:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setChannelFilter('');
                  setFundTypeFilter('');
                  setStartDate('');
                  setEndDate('');
                  setIsFlaggedOnly(false);
                  setNeedsActionOnly(false);
                  setMinAmount('');
                  setMaxAmount('');
                }}
                className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-200"
              >
                Reset Semua Filter
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading && transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white py-16">
          <RefreshCw className="size-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-xs font-semibold text-zinc-500">Memuat transaksi...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="size-8 text-rose-600" />
          <p className="mt-2 text-sm font-bold text-rose-900">{error}</p>
          <button
            type="button"
            onClick={() => fetchTransactions(cursorHistory[currentCursorIndex])}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700"
          >
            Coba Lagi
          </button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white py-16 text-center">
          <Layers className="size-10 text-zinc-300" />
          <h3 className="mt-3 text-sm font-black text-zinc-800">Tidak ada transaksi ditemukan</h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm">
            Coba ubah kata kunci pencarian atau sesuaikan filter status dan tanggal untuk melihat data lainnya.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-zinc-600">
                <tr>
                  <th className="w-10 px-4 py-3.5 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAllEligible}
                      disabled={eligibleItems.length === 0}
                      title={
                        eligibleItems.length === 0
                          ? 'Tidak ada transaksi yang memenuhi syarat validasi massal'
                          : 'Pilih semua transaksi yang memenuhi syarat validasi massal'
                      }
                      className="grid place-items-center text-zinc-400 hover:text-zinc-700 disabled:opacity-40"
                    >
                      {isAllEligibleSelected ? (
                        <CheckSquare className="size-4 text-emerald-600" />
                      ) : isSomeEligibleSelected ? (
                        <MinusSquare className="size-4 text-emerald-600" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500">
                    No Transaksi & Tanggal
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500">
                    Muzakki
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500">
                    Jenis Dana & Kanal
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500">
                    Jumlah Nominal
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500">
                    Status & Risiko
                  </th>
                  <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-2xs text-zinc-500 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {transactions.map((tx) => {
                  const eligible = isEligibleForBulkValidation(tx);
                  const isSelected = selectedIds.has(tx.id);
                  const badge = (tx.status && STATUS_BADGE_CONFIG[tx.status]) || DEFAULT_STATUS_BADGE;
                  const BadgeIcon = badge.icon;

                  return (
                    <tr
                      key={tx.id}
                      className={`transition hover:bg-zinc-50/80 ${
                        isSelected ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      {/* Selection Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={!eligible}
                          onClick={() => handleToggleSelect(tx.id)}
                          title={
                            eligible
                              ? 'Pilih untuk validasi massal'
                              : 'Tidak memenuhi syarat: hanya status Menunggu Validasi < Rp10 jt tanpa risiko'
                          }
                          className="grid place-items-center text-zinc-400 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {isSelected ? (
                            <CheckSquare className="size-4 text-emerald-600" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      </td>

                      {/* Transaction Number & Date */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-zinc-900">{tx.transaction_number}</div>
                        <div className="text-2xs text-zinc-500">{formatDate(tx.created_at)}</div>
                      </td>

                      {/* Muzakki */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-900">{tx.muzakki_name}</div>
                        <div className="text-2xs text-zinc-500">
                          {tx.muzakki_phone || tx.muzakki_email || '-'}
                        </div>
                      </td>

                      {/* Fund Type & Channel */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-800 capitalize">
                          {String(tx.fund_type || '').replace(/_/g, ' ')}
                        </div>
                        <div className="text-2xs text-zinc-500 capitalize">
                          {String(tx.channel || '').replace(/_/g, ' ')}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3">
                        <div className="font-black text-zinc-900">
                          {formatRupiah(tx.amount)}
                        </div>
                        {BigInt(tx.fee_amount || '0') > 0n && (
                          <div className="text-2xs text-zinc-400">
                            Biaya: {formatRupiah(tx.fee_amount)}
                          </div>
                        )}
                      </td>

                      {/* Status & Risk */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-2xs font-bold ${badge.bg} ${badge.text} ${badge.border}`}
                          >
                            <BadgeIcon className="size-3" />
                            {badge.label}
                          </span>

                          {tx.is_flagged && (
                            <span
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-2xs font-bold text-rose-700"
                              title="Transaksi ditandai berisiko tinggi / indikasi anomali"
                            >
                              <ShieldAlert className="size-3" />
                              Risiko
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => openDetail(tx.id, e.currentTarget)}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 hover:text-zinc-900"
                        >
                          <Eye className="size-3.5" />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (< 768px) */}
          <div className="md:hidden space-y-3">
            {transactions.map((tx) => {
              const eligible = isEligibleForBulkValidation(tx);
              const isSelected = selectedIds.has(tx.id);
              const badge = (tx.status && STATUS_BADGE_CONFIG[tx.status]) || DEFAULT_STATUS_BADGE;
              const BadgeIcon = badge.icon;

              return (
                <div
                  key={tx.id}
                  className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs transition ${
                    isSelected ? 'border-emerald-300 bg-emerald-50/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!eligible}
                        onClick={() => handleToggleSelect(tx.id)}
                        className="grid place-items-center text-zinc-400 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-emerald-600" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>
                      <div>
                        <span className="font-bold text-xs text-zinc-900">
                          {tx.transaction_number}
                        </span>
                        <p className="text-2xs text-zinc-500">{formatDate(tx.created_at)}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-2xs font-bold ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      <BadgeIcon className="size-3" />
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Muzakki:</span>
                      <span className="font-bold text-zinc-900">{tx.muzakki_name}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Dana & Kanal:</span>
                      <span className="font-medium text-zinc-700 capitalize">
                        {String(tx.fund_type || '').replace(/_/g, ' ')} &bull;{' '}
                        {String(tx.channel || '').replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-zinc-500">Jumlah:</span>
                      <span className="text-sm font-black text-zinc-900">
                        {formatRupiah(tx.amount)}
                      </span>
                    </div>

                    {tx.is_flagged && (
                      <div className="flex items-center gap-1 text-2xs font-bold text-rose-600 pt-1">
                        <ShieldAlert className="size-3" />
                        <span>Transaksi berisiko tinggi</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-100 pt-3">
                    <button
                      type="button"
                      onClick={(e) => openDetail(tx.id, e.currentTarget)}
                      className="inline-flex items-center gap-1 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-zinc-800"
                    >
                      <Eye className="size-3.5" />
                      <span>Lihat Detail</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-2xs">
            <div className="text-xs text-zinc-500">
              Menampilkan <span className="font-bold text-zinc-900">{transactions.length}</span>{' '}
              transaksi (Halaman {currentCursorIndex + 1})
              {totalCount > 0 && (
                <span> &bull; Total perkiraan: <span className="font-bold text-zinc-900">{totalCount}</span></span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentCursorIndex === 0 || loading}
                onClick={handlePrevPage}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                disabled={!hasMore || loading}
                onClick={handleNextPage}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>Berikutnya</span>
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Detail Drawer */}
      <TransactionDetailDrawer
        transactionId={activeDetailId}
        isOpen={Boolean(activeDetailId)}
        onClose={closeDetail}
        onStatusUpdated={() => {
          fetchTransactions(cursorHistory[currentCursorIndex]);
        }}
      />
    </div>
  );
}
