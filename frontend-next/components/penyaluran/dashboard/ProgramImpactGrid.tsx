import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

function formatAmount(value: number) {
  return value >= 1_000_000_000 ? `Rp ${(value / 1_000_000_000).toFixed(2)} M` : `Rp ${(value / 1_000_000).toFixed(0)} Jt`;
}

export function ProgramImpactGrid({ data }: { data: DashboardData }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
            <Sparkles className="size-4 text-emerald-700" />
            Alokasi & Dampak 5 Pilar
          </div>
          <p className="mt-1 text-sm text-zinc-500">Dampak yang terbentuk sepanjang {data.periodLabel.toLowerCase()}</p>
        </div>
        <Link href="/penyaluran/program" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900">
          Lihat semua program <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      {data.programs.length === 0 ? (
        <div className="py-8 text-center text-xs font-semibold text-slate-500">
          Belum ada transaksi tervalidasi untuk periode ini.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {data.programs.map((program) => (
            <Link
              href="/penyaluran/program"
              key={program.id}
              className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: program.accent }} />
              <p className="mt-1 text-sm font-black text-zinc-900 group-hover:text-emerald-800">{program.name}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{program.category}</p>
              <p className="mt-4 text-base font-black tracking-tight text-zinc-950">{formatAmount(program.amount)}</p>
              <p className="mt-1 text-xs font-semibold text-zinc-600">{program.percentage}% · {program.beneficiaries.toLocaleString('id-ID')} jiwa</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full" style={{ width: `${program.progress}%`, backgroundColor: program.accent }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-500">Capaian {program.progress}%</span>
                <span className={program.change >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-rose-600'}>{program.change >= 0 ? '+' : ''}{program.change}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
