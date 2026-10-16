'use client';

import React from 'react';
import { TrendingUp, Target, Wallet } from 'lucide-react';
import type { MonthlyTrendItem } from './program-data';

export function PilarTrendProjection({
  trends,
  projection,
}: {
  trends: MonthlyTrendItem[];
  projection: {
    realizationEst: string;
    percentage: number;
    targetYear: string;
    remainingBudget: string;
  };
}) {
  const maxVal = 2000;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* 1. Monthly Chart (8 cols) */}
      <div className="lg:col-span-8 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-900">Tren penyaluran bulanan</h4>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-xs bg-emerald-600" /> Realisasi (Rp)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 border-t border-dashed border-zinc-400" /> Target (Rp)
              </span>
            </div>
          </div>
        </div>

        {/* Custom Clean Bar + Line Chart */}
        <div className="pt-4 h-48 flex flex-col justify-between">
          <div className="relative flex-1 flex items-end justify-between gap-1.5 sm:gap-2 px-2 border-b border-zinc-200 pb-1">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
              <div className="border-b border-dashed border-zinc-200 w-full" />
              <div className="border-b border-dashed border-zinc-200 w-full" />
              <div className="border-b border-dashed border-zinc-200 w-full" />
            </div>

            {trends.map((item) => {
              const heightPercent = item.realization > 0 ? (item.realization / maxVal) * 100 : 0;
              const targetPercent = (item.target / maxVal) * 100;

              return (
                <div key={item.month} className="relative flex-1 flex flex-col items-center h-full justify-end group">
                  {/* Target point indicator */}
                  <div
                    className="absolute size-1.5 rounded-full bg-zinc-400 border border-white z-10"
                    style={{ bottom: `${Math.min(targetPercent, 95)}%` }}
                    title={`Target: Rp ${(item.target / 1000).toFixed(2)} M`}
                  />

                  {/* Realization Bar */}
                  {heightPercent > 0 ? (
                    <div
                      className="w-full max-w-[20px] bg-emerald-600 rounded-t-xs transition-all group-hover:bg-emerald-700"
                      style={{ height: `${heightPercent}%` }}
                      title={`${item.month}: Rp ${(item.realization / 1000).toFixed(2)} M`}
                    />
                  ) : (
                    <div className="w-full max-w-[20px] h-1 bg-zinc-100 rounded-t-xs" />
                  )}

                  {/* Month Label */}
                  <span className="text-[10px] text-zinc-400 font-medium mt-2">
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Projection & Target Card (4 cols) */}
      <div className="lg:col-span-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between space-y-4">
        <div>
          <h4 className="text-xs font-bold text-zinc-900">Proyeksi & target 2026</h4>
          <p className="text-[11px] text-zinc-500 mt-0.5">Proyeksi realisasi</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold font-mono text-zinc-900">
              {projection.realizationEst}
            </span>
            <span className="text-xs font-bold font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {projection.percentage}% dari target
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-100">
          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
            <p className="text-[10px] text-zinc-500">Target tahun 2026</p>
            <p className="text-xs font-bold font-mono text-zinc-900 mt-0.5">
              {projection.targetYear}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
            <p className="text-[10px] text-zinc-500">Sisa anggaran</p>
            <p className="text-xs font-bold font-mono text-amber-700 mt-0.5">
              {projection.remainingBudget}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
