'use client';

import React from 'react';
import { Wallet, ClipboardList, Users, CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';
import type { ValueChainStep } from './program-data';

const STEP_ICONS = {
  budget: Wallet,
  program: ClipboardList,
  activity: Users,
  output: CheckCircle2,
  impact: Sparkles,
};

export function PilarValueChain({
  pilarName,
  steps,
}: {
  pilarName: string;
  steps: ValueChainStep[];
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xs space-y-4">
      {/* Title */}
      <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-2">
        <span>Dari anggaran ke dampak — {pilarName}</span>
      </h3>

      {/* 5-Step Chain */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
        {steps.map((step, idx) => {
          const Icon = STEP_ICONS[step.type] || Sparkles;

          return (
            <React.Fragment key={step.label}>
              <div className="flex flex-col p-3 rounded-xl bg-zinc-50/70 border border-zinc-100/90 hover:border-zinc-200 transition-colors h-full justify-between">
                <div className="flex items-center gap-2 text-zinc-400 mb-1.5">
                  <Icon className="size-4 text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-bold text-zinc-600">{step.label}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-900 leading-tight">
                    {step.primaryVal}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
                    {step.subVal}
                  </p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
