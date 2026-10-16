import { ChartNoAxesCombined, TrendingUp } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

function formatCompactRupiah(value: number) {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)} M`;
  return `Rp ${(value / 1_000_000).toFixed(0)} Jt`;
}

export function TrendPanel({ data }: { data: DashboardData }) {
  const maximum = Math.max(1, ...data.trend.flatMap((point) => [point.current, point.previous, point.target]));

  return (
    <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
            <ChartNoAxesCombined className="size-4 text-emerald-700" />
            Tren Penyaluran
          </div>
          <p className="mt-3 text-2xl font-black tracking-tight text-zinc-950">{formatCompactRupiah(data.summary.totalDisbursed)}</p>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-emerald-700">
            <TrendingUp className="size-3.5" />
            +{data.summary.change}% <span className="font-normal text-zinc-500">dari {data.comparisonLabel}</span>
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
          <p className="text-[11px] font-semibold text-emerald-800">Proyeksi target</p>
          <p className="mt-0.5 text-sm font-black text-emerald-900">{formatCompactRupiah(data.summary.target)}</p>
        </div>
      </div>

      {data.trend.length === 0 ? (
        <div className="flex h-44 items-center justify-center border-b border-zinc-100 text-xs font-semibold text-slate-500">
          Belum ada transaksi tervalidasi untuk periode ini.
        </div>
      ) : (
        <div className="mt-6 grid h-44 grid-cols-[repeat(6,minmax(0,1fr))] items-end gap-2 border-b border-zinc-100 px-1 pt-4 sm:gap-3" aria-label={`Grafik tren ${data.periodLabel}`}>
          {data.trend.map((point) => {
            const currentHeight = Math.max(8, Math.round((point.current / maximum) * 100));
            const previousHeight = Math.max(5, Math.round((point.previous / maximum) * 100));
            const targetHeight = Math.max(8, Math.round((point.target / maximum) * 100));
            return (
              <div key={point.label} className="flex h-full min-w-0 flex-col justify-end gap-1">
                <div className="relative flex flex-1 items-end justify-center gap-1">
                  <span className="w-1.5 rounded-t-full bg-zinc-200" style={{ height: `${previousHeight}%` }} title={`Periode sebelumnya ${formatCompactRupiah(point.previous * 1_000_000)}`} />
                  <span className="w-2 rounded-t-full bg-emerald-600 shadow-[0_0_14px_rgba(5,150,105,0.28)] transition-all duration-500" style={{ height: `${currentHeight}%` }} title={`Realisasi ${formatCompactRupiah(point.current * 1_000_000)}`} />
                  <span className="w-1 rounded-t-full bg-amber-300" style={{ height: `${targetHeight}%` }} title={`Target ${formatCompactRupiah(point.target * 1_000_000)}`} />
                </div>
                <span className="truncate text-center text-[10px] font-medium text-zinc-500">{point.label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-600" />Periode ini</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-zinc-300" />Periode sebelumnya</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-300" />Target periode</span>
      </div>
    </section>
  );
}
