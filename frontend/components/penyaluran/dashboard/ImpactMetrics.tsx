import React from 'react';
import { TrendingUp, Users, Layers3, WalletCards } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

export function ImpactMetrics({ data }: { data: DashboardData }) {
  const formatRupiah = (num: number) => {
    if (!num || num === 0) return 'Rp 0';
    if (num >= 1000000000) {
      return `Rp ${(num / 1000000000).toFixed(2)} M`;
    }
    if (num < 1_000_000) {
      return `Rp ${Math.round(num / 1_000)} Rb`;
    }
    return `Rp ${(num / 1000000).toFixed(0)} Jt`;
  };
  const targetProgress = data.summary.target > 0
    ? Math.min(100, Math.round((data.summary.totalDisbursed / data.summary.target) * 100))
    : 0;

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 shadow-[0_10px_30px_rgba(15,23,42,0.04)] lg:grid-cols-4">
      <div className="bg-white p-4 sm:p-5">
        <p className="text-xs font-semibold text-zinc-500">Realisasi ZIS · {data.periodLabel}</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950">
          {formatRupiah(data.summary.totalDisbursed)}
        </p>
        <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-zinc-500"><span>Capaian target RKAT</span><span>{data.summary.target > 0 ? `${targetProgress}%` : 'Belum tersedia'}</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${targetProgress}%` }} /></div>
        <p className="mt-1 text-[10px] text-zinc-500">{formatRupiah(data.summary.target)}</p>
      </div>

      <div className="border-l border-zinc-200 bg-white p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Users className="size-3.5 text-emerald-700" /> Mustahik Terbantu</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950">
          {data.summary.beneficiaries.toLocaleString('id-ID')} <span className="text-base">jiwa</span>
        </p>
        <p className="mt-2 text-xs font-semibold text-emerald-700">Terverifikasi pada periode aktif</p>
      </div>

      <div className="border-t border-zinc-200 bg-white p-4 sm:border-l sm:border-t-0 sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><Layers3 className="size-3.5 text-emerald-700" /> Program Aktif</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950">
          {data.summary.activePrograms} <span className="text-base">program</span>
        </p>
        <p className="mt-2 text-xs font-medium text-zinc-500">{data.summary.transactions.toLocaleString('id-ID')} transaksi penyaluran</p>
      </div>

      <div className="border-l border-t border-zinc-200 bg-white p-4 sm:border-t-0 sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500"><WalletCards className="size-3.5 text-amber-600" /> Efisiensi Rasio</p>
        <p className="mt-2 text-2xl font-black tracking-tight text-zinc-950">
          {data.summary.effectiveness === undefined ? '—' : `${data.summary.effectiveness}%`}
        </p>
        <p className="mt-2 text-xs font-medium text-zinc-500">Rasio efektivitas penyaluran</p>
      </div>
    </div>
  );
}
