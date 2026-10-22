'use client';

import React from 'react';
import {
  Stethoscope,
  CheckCircle2,
  Wallet,
  Layers,
  MapPin,
  UserPlus,
  TrendingUp,
} from 'lucide-react';
import type { ImpactMetricItem } from './program-data';

const ICON_MAP = {
  stethoscope: Stethoscope,
  checkCircle: CheckCircle2,
  money: Wallet,
  document: Layers,
  pin: MapPin,
  users: UserPlus,
};

export function PilarImpactMetrics({
  pilarName,
  metrics,
}: {
  pilarName: string;
  metrics: ImpactMetricItem[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-4">
      {/* Title */}
      <h3 className="text-xs font-bold text-zinc-900 flex items-center justify-between">
        <span>Dampak utama — {pilarName}</span>
      </h3>

      {/* 6 Metric Grid (3 cols x 2 rows) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((item) => {
          const Icon = ICON_MAP[item.icon] || CheckCircle2;

          return (
            <div
              key={item.title}
              className="p-3.5 rounded-xl bg-zinc-50/60 border border-zinc-100/90 hover:border-zinc-200 transition-colors flex flex-col justify-between"
            >
              <div className="flex items-center gap-2 mb-1.5 text-zinc-400">
                <Icon className="size-4 text-emerald-600 shrink-0" />
                <span className="text-[11px] font-medium text-zinc-600 truncate">{item.title}</span>
              </div>

              <div>
                <p className="text-base sm:text-lg font-bold font-mono text-zinc-900 leading-tight">
                  {item.value}
                </p>
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                  {item.trend && (
                    <span className="text-emerald-700 font-bold inline-flex items-center gap-0.5">
                      <TrendingUp className="size-2.5" />
                      {item.trend}
                    </span>
                  )}
                  <span className="truncate">{item.subtitle.replace(item.trend || '', '')}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
