'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import type {
  FunnelItem,
  AsnafCompositionItem,
  TopKecamatanItem,
  TimelineMilestone,
} from './program-data';

export function PilarAnalyticsRow({
  funnels,
  asnaf,
  topKecamatan,
  targetVsRealization,
  timeline,
}: {
  funnels: FunnelItem[];
  asnaf: AsnafCompositionItem[];
  topKecamatan: TopKecamatanItem[];
  targetVsRealization: {
    distribution: { label: string; currentFormatted: string; targetFormatted: string; percentage: number };
    beneficiaries: { label: string; currentFormatted: string; targetFormatted: string; percentage: number };
    activePrograms: { label: string; currentFormatted: string; percentage: number };
    budgetEfficiency: { distributedPercentage: number; operationalPercentage: number; maxAllowed: number };
  };
  timeline: TimelineMilestone[];
}) {
  const maxFunnel = Math.max(...funnels.map((f) => f.count), 42);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Funnel Outcome Program */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-4 flex flex-col justify-between">
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Funnel outcome program</h4>
          <p className="text-[10px] text-zinc-500 mt-0.5">Konversi tahapan usulan bantuan</p>
        </div>

        <div className="space-y-2.5">
          {funnels.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-600 truncate">{item.label}</span>
                <span className="font-mono font-bold text-zinc-900">{item.count}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(item.count / maxFunnel) * 100}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Komposisi Asnaf Penerima Manfaat */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-3 flex flex-col justify-between">
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Komposisi asnaf penerima manfaat</h4>
          <p className="text-[10px] text-zinc-500 mt-0.5">Distribusi berdasarkan 8 asnaf</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Donut Chart SVG */}
          <div className="size-20 shrink-0 relative">
            <svg viewBox="0 0 36 36" className="size-full -rotate-90">
              {/* Fakir 33% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#047857" strokeWidth="6" strokeDasharray="33 100" strokeDashoffset="0" />
              {/* Miskin 33% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#10b981" strokeWidth="6" strokeDasharray="33 100" strokeDashoffset="-33" />
              {/* Amil 12% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#a7f3d0" strokeWidth="6" strokeDasharray="12 100" strokeDashoffset="-66" />
              {/* Mualaf 10% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#38bdf8" strokeWidth="6" strokeDasharray="10 100" strokeDashoffset="-78" />
              {/* Gharimin 6% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#fbbf24" strokeWidth="6" strokeDasharray="6 100" strokeDashoffset="-88" />
              {/* Lainnya 6% */}
              <circle cx="18" cy="18" r="14" fill="transparent" stroke="#c084fc" strokeWidth="6" strokeDasharray="6 100" strokeDashoffset="-94" />
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-1 text-[10px]">
            {asnaf.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-zinc-600">{item.name}</span>
                </div>
                <span className="font-mono text-zinc-900 font-medium">
                  {item.countFormatted} ({item.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Top Kecamatan Penerima Manfaat */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-3 flex flex-col justify-between">
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Top kecamatan penerima manfaat</h4>
          <p className="text-[10px] text-zinc-500 mt-0.5">5 wilayah serapan tertinggi</p>
        </div>

        <div className="space-y-1.5 text-xs">
          {topKecamatan.map((kec) => (
            <div
              key={kec.name}
              className="flex items-center justify-between py-1 border-b border-zinc-50 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold text-zinc-400 w-3">{kec.rank}</span>
                <span className="font-medium text-zinc-900 text-[11px]">{kec.name}</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-zinc-700">
                {kec.countFormatted} <span className="text-zinc-400 font-normal">({kec.percentage}%)</span>
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/penyaluran/peta"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 pt-1"
        >
          <span>Lihat semua (13 kecamatan)</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* 4. Target vs Realisasi, Efisiensi & Timeline */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-3.5 text-xs">
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Target vs realisasi (Jan–Agu 2026)</h4>
        </div>

        {/* Progress Rows */}
        <div className="space-y-2 text-[11px]">
          <div>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-zinc-600">{targetVsRealization.distribution.label}</span>
              <span className="font-mono font-bold text-zinc-900">
                {targetVsRealization.distribution.currentFormatted} / {targetVsRealization.distribution.targetFormatted} ({targetVsRealization.distribution.percentage}%)
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${targetVsRealization.distribution.percentage}%` }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-zinc-600">{targetVsRealization.beneficiaries.label}</span>
              <span className="font-mono font-bold text-zinc-900">
                {targetVsRealization.beneficiaries.currentFormatted} / {targetVsRealization.beneficiaries.targetFormatted} ({targetVsRealization.beneficiaries.percentage}%)
              </span>
            </div>
            <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${targetVsRealization.beneficiaries.percentage}%` }} />
            </div>
          </div>
        </div>

        {/* Efisiensi Anggaran Badge */}
        <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-zinc-500">Efisiensi anggaran</span>
            <p className="text-xs font-bold font-mono text-zinc-900">
              {targetVsRealization.budgetEfficiency.distributedPercentage}% <span className="text-[10px] text-zinc-500 font-normal">Dana tersalurkan</span>
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            <CheckCircle2 className="size-3" /> Efisien
          </span>
        </div>

        {/* Timeline Tonggak Penting */}
        <div className="pt-2 border-t border-zinc-100">
          <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider mb-2">
            Timeline tonggak penting
          </p>
          <div className="space-y-2 text-[10px]">
            {timeline.slice(0, 3).map((item) => (
              <div key={item.date} className="flex items-start gap-2">
                <span className="font-mono text-zinc-400 shrink-0 w-12">{item.date}</span>
                <span className="text-zinc-700 leading-tight">{item.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
