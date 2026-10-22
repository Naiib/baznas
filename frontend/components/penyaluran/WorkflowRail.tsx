'use client';

import React from 'react';
import { Check } from 'lucide-react';

const WORKFLOW_STAGES = [
  { id: 'diajukan', stepNum: 1, label: 'Pengajuan' },
  { id: 'verifikasi', stepNum: 2, label: 'Verifikasi' },
  { id: 'survey', stepNum: 3, label: 'Survey' },
  { id: 'mpzis', stepNum: 4, label: 'Sidang MPZIS' },
  { id: 'pencairan', stepNum: 5, label: 'Pencairan PPD' },
  { id: 'selesai', stepNum: 6, label: 'Selesai' },
];

export function getStageNumber(status: string): number {
  switch (status) {
    case 'Diajukan':
      return 1;
    case 'Verifikasi Administrasi':
      return 2;
    case 'Survey':
      return 3;
    case 'Persetujuan MPZIS':
      return 4;
    case 'Pengajuan Dana (FPD)':
    case 'Pengajuan Dana (PPD)':
      return 5;
    case 'Penyaluran Selesai':
      return 6;
    default:
      return 1;
  }
}

export function WorkflowRail({
  currentStatus,
  onSelectStage,
}: {
  currentStatus: string;
  onSelectStage?: (stageId: string) => void;
}) {
  const activeStage = getStageNumber(currentStatus);

  return (
    <div className="flex items-center justify-between w-full py-2">
      {WORKFLOW_STAGES.map((stage, idx) => {
        const isCompleted = activeStage > stage.stepNum;
        const isCurrent = activeStage === stage.stepNum;

        return (
          <React.Fragment key={stage.id}>
            <button
              type="button"
              onClick={() => onSelectStage && onSelectStage(stage.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer ${
                isCurrent
                  ? 'text-emerald-700 font-bold'
                  : isCompleted
                  ? 'text-zinc-900'
                  : 'text-zinc-400'
              }`}
            >
              <div
                className={`flex size-5 items-center justify-center rounded-full text-[10px] ${
                  isCompleted
                    ? 'bg-emerald-600 text-white'
                    : isCurrent
                    ? 'border-2 border-emerald-600 text-emerald-700 bg-emerald-50'
                    : 'border border-zinc-300 text-zinc-400 bg-white'
                }`}
              >
                {isCompleted ? <Check className="size-3" /> : stage.stepNum}
              </div>
              <span className="hidden sm:inline">{stage.label}</span>
            </button>
            {idx < WORKFLOW_STAGES.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  activeStage > stage.stepNum ? 'bg-emerald-600' : 'bg-zinc-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
