'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { InitiativeItem, RecommendationItem } from './program-data';

export function PilarInitiativesTable({
  pilarName,
  initiatives,
  recommendations,
}: {
  pilarName: string;
  initiatives: InitiativeItem[];
  recommendations: RecommendationItem[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* 1. Inisiatif Aktif Table (8 cols) */}
      <div className="lg:col-span-8 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div>
          <h3 className="text-xs font-bold text-zinc-900">
            Inisiatif aktif — {pilarName}
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Daftar program layanan, penanggung jawab, progress serapan, dan target milestone
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="pb-2.5 font-medium">Program / Layanan</th>
                <th className="pb-2.5 font-medium">Penanggung Jawab</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium">Tonggak Berikutnya</th>
                <th className="pb-2.5 font-medium text-right">Penerima</th>
                <th className="pb-2.5 font-medium text-right">Penyerapan</th>
                <th className="pb-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {initiatives.map((item) => (
                <tr key={item.programName} className="hover:bg-zinc-50/60 transition-colors group">
                  <td className="py-3 pr-2">
                    <p className="font-bold text-zinc-900">{item.programName}</p>
                    {item.subName && (
                      <p className="text-[10px] text-zinc-500">{item.subName}</p>
                    )}
                  </td>
                  <td className="py-3 pr-2 text-zinc-600 text-[11px]">
                    {item.pic}
                  </td>
                  <td className="py-3 pr-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.status === 'Berjalan'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 pr-2">
                    <p className="font-mono text-[10px] font-bold text-zinc-700">{item.nextMilestoneDate}</p>
                    <p className="text-[10px] text-zinc-400 leading-tight truncate max-w-[140px]">{item.nextMilestoneTitle}</p>
                  </td>
                  <td className="py-3 pr-2 text-right font-mono font-bold text-zinc-900">
                    {item.beneficiaries}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono font-bold text-zinc-900 text-[11px] whitespace-nowrap">
                        {item.absorbedAmount}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-emerald-700">
                        {item.percentage}%
                      </span>
                    </div>
                    <div className="w-16 h-1 bg-zinc-100 rounded-full overflow-hidden ml-auto mt-1">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 pl-1 text-right">
                    <ChevronRight className="size-3.5 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Rekomendasi Prioritas (4 cols) */}
      <div className="lg:col-span-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-4">
        <div>
          <h3 className="text-xs font-bold text-zinc-900">Rekomendasi prioritas</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">Saran optimasi penyaluran pilar</p>
        </div>

        <div className="space-y-3">
          {recommendations.map((rec) => (
            <div
              key={rec.num}
              className="p-3.5 rounded-xl border border-zinc-100 bg-zinc-50/50 hover:bg-white hover:border-zinc-200 transition-all space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${rec.colorBg} ${rec.colorText}`}>
                  {rec.num}
                </span>
                <p className="text-[11px] text-zinc-800 leading-relaxed font-medium">
                  {rec.text}
                </p>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  <span>Lihat detail</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-zinc-100">
          <Link
            href="/penyaluran/laporan"
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800"
          >
            <span>Lihat semua rekomendasi</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
