'use client';

import React from 'react';
import Link from 'next/link';
import { UserCheck, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import type { DashboardData } from './dashboard-data';

const ACTION_CONFIG = [
  {
    icon: AlertCircle,
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/60',
    dotBg: 'bg-rose-500',
    accentBorder: 'hover:border-rose-300',
    sla: 'SLA < 24 Jam',
  },
  {
    icon: UserCheck,
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200/60',
    dotBg: 'bg-amber-500',
    accentBorder: 'hover:border-amber-300',
    sla: 'Jadwal Hari Ini',
  },
  {
    icon: CheckCircle2,
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    dotBg: 'bg-emerald-500',
    accentBorder: 'hover:border-emerald-300',
    sla: 'Siap Transfer',
  },
];

export function ActionRail({ data }: { data: DashboardData }) {
  const totalCount = data.actions.reduce((total, item) => total + item.count, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
            Prioritas Tindakan
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">Keputusan amil yang perlu diproses hari ini</p>
        </div>
        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-800 border border-zinc-200/60">
          {totalCount} aktif
        </span>
      </div>

      {/* Action Cards Queue */}
      <div className="space-y-2.5">
        {data.actions.map((item, index) => {
          const config = ACTION_CONFIG[index] ?? ACTION_CONFIG[0]!;
          const Icon = config.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className={`group block p-3.5 rounded-xl border border-zinc-200/90 bg-white transition-all duration-150 hover:shadow-sm hover:border-zinc-300 ${config.accentBorder} relative overflow-hidden`}
            >
              {/* Top Sub-Header: SLA & Count */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${config.badgeBg}`}>
                  <span className={`size-1.5 rounded-full ${config.dotBg}`} />
                  {config.sla}
                </span>

                <div className="flex items-center gap-1">
                  <span className="font-mono font-black text-xs text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md">
                    {item.count} berkas
                  </span>
                  <ChevronRight className="size-3.5 text-zinc-400 group-hover:text-zinc-900 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              {/* Title & Description */}
              <div className="flex items-start gap-2.5 mt-2">
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-zinc-900 group-hover:text-emerald-800 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mt-0.5 line-clamp-1">
                    {item.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Live Activity Feed */}
      <div className="border-t border-zinc-100 pt-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
            <span>Aktivitas Berkas Terbaru</span>
          </h3>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            Realtime
          </span>
        </div>

        <div className="space-y-2.5">
          {data.activities.map((activity) => (
            <div
              key={activity.title}
              className="flex gap-2.5 p-2 rounded-lg hover:bg-zinc-50/80 transition-colors"
            >
              <span
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  activity.tone === 'emerald'
                    ? 'bg-emerald-500'
                    : activity.tone === 'violet'
                    ? 'bg-violet-500'
                    : 'bg-amber-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[11px] font-bold text-zinc-800">
                    {activity.title}
                  </p>
                  <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                    {activity.time}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
                  {activity.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
