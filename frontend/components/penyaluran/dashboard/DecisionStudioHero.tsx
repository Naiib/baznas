'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CalendarDays, CircleCheckBig, Layers3, UsersRound } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

type DecisionStudioHeroProps = { data: DashboardData };

function formatRupiah(value: number) {
  if (!value || value === 0) return 'Rp 0';
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)} M`;
  return `Rp ${Math.round(value / 1_000_000)} Jt`;
}

export function DecisionStudioHero({ data }: DecisionStudioHeroProps) {
  const completion = data.summary.target > 0
    ? Math.floor((data.summary.totalDisbursed / data.summary.target) * 100)
    : 0;
  const activeActions = data.actions.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-emerald-950/10 bg-[#f9fcfa] shadow-[0_20px_55px_rgba(4,78,58,0.07)]">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(5,86,63,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(5,86,63,0.045)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative flex flex-col gap-6 border-b border-emerald-950/10 px-6 py-7 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.17em] text-emerald-800"><span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.13)]" />Operasional penyaluran</div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.045em] text-zinc-950 sm:text-[2.7rem]">Ruang kendali penyaluran</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Satu tampilan untuk membaca capaian, cakupan wilayah, dan keputusan yang perlu diselesaikan hari ini.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500"><CalendarDays className="size-4 text-emerald-700" />Selasa, 25 Agustus 2026</span>
          <Link href="/penyaluran/mustahik?tab=diajukan" className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-xs font-bold text-white shadow-[0_10px_24px_rgba(6,95,70,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-900">Tinjau prioritas <ArrowRight className="size-4" /></Link>
        </div>
      </div>

      <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:p-8">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-[0_12px_32px_rgba(6,95,70,0.05)] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-500">Capaian periode aktif</p>
              <div className="mt-2 flex items-end gap-3">
                <p className="text-6xl font-extrabold leading-none tracking-[-0.07em] text-emerald-900">{completion}%</p>
                <span className={`mb-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${data.dataStatus === 'empty' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-800'}`}>
                  {data.dataStatus === 'empty' ? 'BELUM ADA DATA' : 'ON TRACK'}
                </span>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="text-xl font-black text-zinc-950">{formatRupiah(data.summary.totalDisbursed)}</p>
              <p className="mt-1 text-xs font-semibold text-zinc-500">
                {data.summary.target > 0 ? `Target ${formatRupiah(data.summary.target)}` : 'Target belum ditentukan'}
              </p>
            </div>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-[linear-gradient(90deg,#047857,#10b981)] transition-all duration-700" style={{ width: `${completion}%` }} /></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl bg-zinc-50/80 p-3.5"><Building2 className="size-5 text-emerald-700" /><div><p className="text-lg font-black text-zinc-950">13</p><p className="text-[11px] font-semibold text-zinc-500">kecamatan terjangkau</p></div></div>
            <div className="flex items-center gap-3 rounded-xl bg-zinc-50/80 p-3.5"><UsersRound className="size-5 text-emerald-700" /><div><p className="text-lg font-black text-zinc-950">{data.summary.beneficiaries.toLocaleString('id-ID')}</p><p className="text-[11px] font-semibold text-zinc-500">mustahik terbantu</p></div></div>
            <div className="flex items-center gap-3 rounded-xl bg-zinc-50/80 p-3.5"><Layers3 className="size-5 text-emerald-700" /><div><p className="text-lg font-black text-zinc-950">{data.summary.activePrograms}</p><p className="text-[11px] font-semibold text-zinc-500">program aktif</p></div></div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-emerald-800">
            <CircleCheckBig className="size-4" />
            {data.dataStatus === 'empty' ? 'Belum ada transaksi tervalidasi untuk periode ini.' : 'Data capaian tersinkron dengan penyaluran aktif'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.045)] sm:p-6">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">Prioritas hari ini</p><p className="mt-1 text-xs text-zinc-500">{activeActions} tindakan aktif</p></div><Link href="/penyaluran/mustahik" className="text-xs font-bold text-emerald-800 hover:text-emerald-950">Lihat semua</Link></div>
          <div className="mt-4 divide-y divide-zinc-100">
            {data.actions.map((action, index) => <Link key={action.title} href={action.href} className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className={`size-2.5 shrink-0 rounded-full ${index === 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-zinc-900">{action.title}</span><span className="mt-0.5 block truncate text-[11px] text-zinc-500">{action.description}</span></span><span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-50 text-xs font-black text-emerald-800 transition group-hover:bg-emerald-50">{action.count}</span></Link>)}
          </div>
        </div>
      </div>
    </section>
  );
}
