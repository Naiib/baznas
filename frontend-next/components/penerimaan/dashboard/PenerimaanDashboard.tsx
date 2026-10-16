'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  FileCheck,
  Filter,
  Layers,
  PiggyBank,
  RefreshCw,
  Scale,
  ShieldAlert,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanOverviewResponse } from '@/lib/api/types';

function formatRupiah(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const clean = String(amount).trim().replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const negative = clean.startsWith('-');
  const digits = negative ? clean.slice(1) : clean;
  return `${negative ? '-Rp ' : 'Rp '}${BigInt(digits || '0').toLocaleString('id-ID')}`;
}

function formatNumber(num: number): string {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('id-ID');
}

export function PenerimaanDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<PenerimaanOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await penerimaanApi.getOverview('30d');
      if (res.data) {
        setOverview(res.data);
      } else {
        setOverview(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data dashboard penerimaan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const metrics = overview?.metrics;
  const isLeader = user?.level === 'leader';
  const isAdmin = user?.role === 'admin' || user?.level === 'admin';

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-zinc-900 sm:text-2xl">
            Dashboard Penerimaan ZIS
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Monitoring penghimpunan, verifikasi amil, persetujuan pimpinan, dan rekonsiliasi perbankan.
          </p>
        </div>
      </div>

      {/* Loading state skeleton */}
      {loading && !overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-28 animate-pulse rounded-2xl border border-zinc-100 bg-zinc-50 p-4"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center">
          <AlertTriangle className="size-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-bold text-zinc-900">Gagal memuat data dashboard</h3>
          <p className="mt-1 max-w-md text-xs text-zinc-600">{error}</p>
          <button
            type="button"
            onClick={fetchOverview}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700"
          >
            <RefreshCw className="size-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      {/* Empty State when no transactions exist */}
      {!loading && !error && metrics && metrics.total_transactions === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 p-12 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Coins className="size-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-zinc-900">Belum ada transaksi pada periode ini</h3>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            Tidak ditemukan penerimaan dana pada filter waktu yang dipilih. Anda dapat menambahkan setoran kas/jemput zakat manual.
          </p>
          <Link
            href="/penerimaan/transaksi/baru"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
          >
            <Coins className="size-4" />
            Catat Transaksi Manual
          </Link>
        </div>
      )}

      {/* Main Content when data exists */}
      {!error && metrics && metrics.total_transactions > 0 && (
        <>
          {/* 8 KPI Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            {/* 1. Total Penerimaan */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Total Penerimaan</span>
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Coins className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {formatRupiah(metrics.total_collected)}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  {formatNumber(metrics.total_transactions)} transaksi tercatat
                </div>
              </div>
            </div>

            {/* 2. Terverifikasi & Klop */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Terverifikasi</span>
                <span className="grid size-8 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <CheckCircle2 className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {formatNumber(metrics.validated_transaction_count ?? 0)}
                </div>
                <div className="mt-1 text-[11px] font-medium text-emerald-600">
                  Valid & siap posting
                </div>
              </div>
            </div>

            {/* 3. Menunggu Validasi */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Menunggu Validasi</span>
                <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-700">
                  <Clock className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                    {formatNumber(metrics.pending_validation_count)}
                  </span>
                  {metrics.pending_validation_count > 0 && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                      Tugas Staff
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  Transaksi masuk
                </div>
              </div>
            </div>

            {/* 4. Antrean Approval */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Antrean Approval</span>
                <span className="grid size-8 place-items-center rounded-xl bg-purple-50 text-purple-700">
                  <ShieldAlert className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                    {formatNumber(metrics.pending_approval_count)}
                  </span>
                  {metrics.pending_approval_count > 0 && (
                    <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-800">
                      Pimpinan
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  Nominal besar / flag
                </div>
              </div>
            </div>

            {/* 5. Muzakki Aktif */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Muzakki Aktif</span>
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Users className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {formatNumber(metrics.active_muzakki_count ?? 0)}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  Individu & Lembaga
                </div>
              </div>
            </div>

            {/* 6. Rata-rata Transaksi */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Rata-rata Transaksi</span>
                <span className="grid size-8 place-items-center rounded-xl bg-zinc-100 text-zinc-700">
                  <TrendingUp className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {formatRupiah(metrics.average_amount)}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  Per donasi tercatat
                </div>
              </div>
            </div>

            {/* 7. Pencapaian Target */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Pencapaian Target</span>
                <span className="grid size-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Target className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {metrics.target_attainment_pct}%
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.min(100, metrics.target_attainment_pct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 8. Pengecualian & Flag */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">Pengecualian & Flag</span>
                <span className="grid size-8 place-items-center rounded-xl bg-rose-50 text-rose-700">
                  <AlertTriangle className="size-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-black tracking-tight text-zinc-900 sm:text-xl">
                  {formatNumber(metrics.exception_count)}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  Dispute / Duplikat / Kurang
                </div>
              </div>
            </div>
          </div>

          {/* Action Queue Section */}
          {overview.action_queue && overview.action_queue.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 sm:text-base">
                    Antrean Tindakan Cepat (Action Queue)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Arahkan prioritas kerja amil ke transaksi yang memerlukan penanganan langsung.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overview.action_queue.map((item) => (
                  <Link
                    key={item.id}
                    href={item.link}
                    className="flex items-center justify-between rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-3.5 transition hover:border-emerald-300 hover:bg-emerald-50/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`grid size-9 place-items-center rounded-xl font-bold text-xs ${
                        item.type === 'approval'
                          ? 'bg-purple-100 text-purple-700'
                          : item.type === 'reconciliation'
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.count}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-zinc-900">{item.title}</div>
                        <div className="text-[10px] text-zinc-500">
                          {item.count} transaksi perlu aksi
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-zinc-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Charts & Breakdown Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Komposisi Dana ZIS */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-bold text-zinc-900">Komposisi Dana ZIS & CSR</h3>
                <span className="text-xs text-zinc-400">Berdasarkan Akun</span>
              </div>
              <div className="mt-4 space-y-3.5">
                {overview.fund_type_breakdown.map((fund) => (
                  <div key={fund.fund_type} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-800">{fund.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">{formatRupiah(fund.amount)}</span>
                        <span className="font-bold text-zinc-900">{fund.percentage}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                        style={{ width: `${fund.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kanal Pembayaran & Rekonsiliasi */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-bold text-zinc-900">Distribusi Kanal Pembayaran</h3>
                <span className="text-xs text-zinc-400">Metode Transaksi</span>
              </div>
              <div className="mt-4 space-y-3.5">
                {overview.channel_breakdown.map((channel) => (
                  <div key={channel.channel} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-800">{channel.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">{formatRupiah(channel.amount)}</span>
                        <span className="font-bold text-zinc-900">{channel.percentage}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-all duration-500"
                        style={{ width: `${channel.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tren Harian/Bulanan */}
          {overview.trend && overview.trend.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Tren Penghimpunan Dana</h3>
                  <p className="text-xs text-zinc-500">Volume dan nominal harian selama periode aktif</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {overview.trend.map((tr) => (
                  <div
                    key={tr.date}
                    className="flex flex-col justify-between rounded-xl border border-zinc-150 bg-zinc-50/50 p-3.5"
                  >
                    <span className="text-xs font-semibold text-zinc-500">{tr.date}</span>
                    <div className="mt-2">
                      <span className="text-sm font-black text-zinc-900">{formatRupiah(tr.amount)}</span>
                      <p className="text-[10px] text-zinc-500">{tr.count} transaksi</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity Section */}
          {overview.recent_activity && overview.recent_activity.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-bold text-zinc-900">Aktivitas Terkini Amil</h3>
                <Link
                  href="/penerimaan/transaksi"
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                >
                  Lihat Semua Transaksi
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="mt-3 divide-y divide-zinc-100">
                {overview.recent_activity.map((act) => (
                  <div key={act.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                        <FileCheck className="size-4" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-bold text-zinc-900">{act.action}</strong>
                          {act.transaction_number && (
                            <span className="text-[10px] font-semibold text-zinc-500">
                              {act.transaction_number}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600">{act.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-700">
                        {act.actor_name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
