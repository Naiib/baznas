import { UsersRound } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

function formatAmount(value: number) {
  return value >= 1_000_000_000 ? `Rp ${(value / 1_000_000_000).toFixed(2)} M` : `Rp ${(value / 1_000_000).toFixed(0)} Jt`;
}

export function AsnafBreakdown({ data }: { data: DashboardData }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
            <UsersRound className="size-4 text-emerald-700" />
            Komposisi 8 Asnaf
          </div>
          <p className="mt-1 text-sm text-zinc-500">Distribusi amanah untuk {data.periodLabel.toLowerCase()}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">100%</span>
      </div>

      {data.asnaf.length === 0 ? (
        <div className="py-8 text-center text-xs font-semibold text-slate-500">
          Belum ada transaksi tervalidasi untuk periode ini.
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {data.asnaf.map((item) => (
            <div key={item.id} className="group grid grid-cols-[minmax(112px,1fr)_minmax(88px,1.6fr)_auto] items-center gap-3">
              <p className="truncate text-sm font-bold text-zinc-800">{item.name} <span className="text-[11px] font-medium text-zinc-400">· {item.beneficiaries.toLocaleString('id-ID')}</span></p>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100" aria-label={`${item.name} ${item.percentage}%`}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
              </div>
              <p className="whitespace-nowrap text-right text-sm font-black tabular-nums text-zinc-900">{item.percentage}% <span className="text-[11px] font-medium text-zinc-500">{formatAmount(item.amount)}</span></p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
