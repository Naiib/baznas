'use client';

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  HandCoins,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { P0CaseHeader, P0CaseProgress } from '@/lib/api/penyaluran-p0-types';

export interface CaseProgressSummaryProps {
  progress: P0CaseProgress;
  caseHeader?: P0CaseHeader;
  onStageClick?: (stageKey: string) => void;
  className?: string;
}

interface StageDefinition {
  key: string;
  label: string;
  shortLabel: string;
  icon: typeof FileText;
}

const STAGES: StageDefinition[] = [
  { key: 'intake', label: 'Intake Berkas', shortLabel: 'Intake', icon: FileText },
  { key: 'assessment', label: 'Asesmen Lapangan', shortLabel: 'Asesmen', icon: Users },
  { key: 'mpzis', label: 'Formulir MPZIS F-BPP/06', shortLabel: 'MPZIS', icon: ShieldCheck },
  { key: 'ppd', label: 'Pengajuan Dana (PPD)', shortLabel: 'PPD', icon: FileSpreadsheet },
  { key: 'payment', label: 'Penyaluran Dana', shortLabel: 'Penyaluran', icon: HandCoins },
  { key: 'confirmation', label: 'Konfirmasi Penerima', shortLabel: 'Konfirmasi', icon: CheckCircle2 },
  { key: 'completion', label: 'Penyaluran Selesai', shortLabel: 'Selesai', icon: ShieldAlert },
];

function getStageIndex(stage: string | null | undefined): number {
  if (!stage) return 0;
  const s = stage.toLowerCase();
  if (s === 'intake' || s === 'diajukan') return 0;
  if (s === 'assessment' || s === 'verifikasi administrasi' || s === 'survey') return 1;
  if (s === 'mpzis' || s === 'persetujuan mpzis') return 2;
  if (s === 'ppd' || s === 'pengajuan dana (fpd)' || s === 'pengajuan dana (ppd)') return 3;
  if (s === 'payment' || s === 'penyaluran') return 4;
  if (s === 'confirmation' || s === 'konfirmasi') return 5;
  if (s === 'completion' || s === 'completed' || s === 'penyaluran selesai') return 6;
  return 0;
}

export function CaseProgressSummary({
  progress,
  caseHeader,
  onStageClick,
  className = '',
}: CaseProgressSummaryProps) {
  const currentStageKey = progress?.current_stage || caseHeader?.status || 'intake';
  const isCompleted = currentStageKey === 'completed' || currentStageKey === 'completion' || caseHeader?.status === 'Penyaluran Selesai';
  const activeIndex = isCompleted ? 7 : getStageIndex(currentStageKey);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 7-Stage Visual Stepper */}
      <nav aria-label="Tahapan Progres Kasus" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <ol role="list" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {STAGES.map((stage, idx) => {
            const isStageCompleted = idx < activeIndex;
            const isStageCurrent = idx === activeIndex;
            const isStagePending = idx > activeIndex;

            const Icon = stage.icon;

            return (
              <li
                key={stage.key}
                aria-current={isStageCurrent ? 'step' : undefined}
                className="relative"
              >
                <button
                  type="button"
                  disabled={!onStageClick}
                  onClick={() => onStageClick?.(stage.key)}
                  className={`group flex w-full flex-col items-center justify-center rounded-xl p-2.5 text-center transition-all ${
                    onStageClick ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                  } ${
                    isStageCurrent
                      ? 'bg-emerald-50 border border-emerald-300 ring-2 ring-emerald-200'
                      : isStageCompleted
                      ? 'bg-slate-50/80 border border-slate-200'
                      : 'border border-transparent opacity-60'
                  }`}
                >
                  <div
                    className={`grid size-7 place-items-center rounded-full text-xs font-bold ${
                      isStageCurrent
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isStageCompleted
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isStageCompleted ? (
                      <Check className="size-4 stroke-[3]" aria-hidden="true" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>

                  <span
                    className={`mt-1.5 block text-xs font-bold truncate max-w-full ${
                      isStageCurrent
                        ? 'text-emerald-900 font-extrabold'
                        : isStageCompleted
                        ? 'text-slate-800'
                        : 'text-slate-500'
                    }`}
                  >
                    {stage.shortLabel}
                  </span>

                  <span className="text-[10px] text-slate-400 font-medium hidden sm:block">
                    {isStageCompleted
                      ? 'Tuntas'
                      : isStageCurrent
                      ? 'Aktif'
                      : 'Menunggu'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Required Action Callout */}
      {progress?.required_action && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-emerald-900"
        >
          <Clock className="size-5 shrink-0 text-emerald-700 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Tindakan Diperlukan:
            </span>
            <p className="mt-0.5 text-sm font-semibold">{progress.required_action}</p>
          </div>
        </div>
      )}

      {/* Blocking Reasons Alert */}
      {progress?.blocking_reasons && progress.blocking_reasons.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950"
        >
          <AlertCircle className="size-5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Kendala / Pemblokiran Tahapan:
            </span>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs font-semibold">
              {progress.blocking_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default CaseProgressSummary;
