'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  Hash,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type { CurrentUser } from '@/lib/api/types';
import type {
  ArtifactApproval,
  MpzisApprovalStepItem,
  MpzisDraft,
  MpzisStepKey,
  P0MpzisApprovalCard,
  P0MpzisWorkspacePayload,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';
import { formatRupiah } from '../shared/MoneyInput';
import { formatTimestamp } from '../shared/ApprovalTimeline';

export interface MpzisApprovalStepperProps {
  mustahikId: number | string;
  mpzis: MpzisDraft | P0MpzisWorkspacePayload;
  approvalSteps?: MpzisApprovalStepItem[] | P0MpzisApprovalCard[];
  currentUserId?: number | string | null;
  currentUserRole?: string | null;
  currentUserLevel?: string | null;
  currentUserDivision?: string | null;
  currentUser?: CurrentUser | null;
  onStepDecided?: (updatedDraft: MpzisDraft) => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
  className?: string;
}

export interface MpzisStepDefinition {
  step: MpzisStepKey;
  order: number;
  label: string;
  stageName: string;
  roleDescription: string;
  requiredRole: string;
  requiredLevel: 'staff' | 'leader';
  levelLabel: string;
}

export const MPZIS_STEP_DEFINITIONS: MpzisStepDefinition[] = [
  {
    step: 'proposed',
    order: 1,
    label: 'Diajukan',
    stageName: '1. Diajukan (Staff Penyaluran)',
    roleDescription: 'Staf Penyaluran mengusulkan rekomendasi MPZIS',
    requiredRole: 'penyaluran',
    requiredLevel: 'staff',
    levelLabel: 'Staff Penyaluran',
  },
  {
    step: 'examined',
    order: 2,
    label: 'Diperiksa',
    stageName: '2. Diperiksa (Kasie / Staff Penyaluran)',
    roleDescription: 'Kasie / Staf Penyaluran memeriksa keabsahan berkas dan perhitungan',
    requiredRole: 'penyaluran',
    requiredLevel: 'staff',
    levelLabel: 'Kasie / Staff Penyaluran',
  },
  {
    step: 'ashnaf_verified',
    order: 3,
    label: 'Verifikator Ashnaf',
    stageName: '3. Verifikator Ashnaf (Staff Penyaluran)',
    roleDescription: 'Verifikator Ashnaf memastikan kesesuaian kategori syariah asnaf',
    requiredRole: 'penyaluran',
    requiredLevel: 'staff',
    levelLabel: 'Verifikator Ashnaf (Staff Penyaluran)',
  },
  {
    step: 'responsible_acknowledged',
    order: 4,
    label: 'Penanggungjawab Penyaluran',
    stageName: '4. Penanggungjawab Penyaluran (Kabid / Leader)',
    roleDescription: 'Kepala Bidang Penyaluran memvalidasi dan bertanggung jawab atas rekomendasi',
    requiredRole: 'penyaluran',
    requiredLevel: 'leader',
    levelLabel: 'Kabid / Leader',
  },
  {
    step: 'approved',
    order: 5,
    label: 'Disetujui',
    stageName: '5. Disetujui (Waka II / Leader)',
    roleDescription: 'Wakil Ketua II menetapkan persetujuan final bantuan',
    requiredRole: 'penyaluran',
    requiredLevel: 'leader',
    levelLabel: 'Waka II / Leader',
  },
];

export interface NormalizedStepData {
  step: MpzisStepKey;
  definition: MpzisStepDefinition;
  isApproved: boolean;
  isPending: boolean;
  isActive: boolean;
  isReturned: boolean;
  approverName: string | null;
  approverRole: string | null;
  approverLevel: string | null;
  actorId: number | string | null;
  timestamp: string | null;
  snapshotHash: string | null;
  note: string | null;
}

export function normalizeMpzisSteps(
  mpzis: MpzisDraft | P0MpzisWorkspacePayload,
  approvalSteps?: MpzisApprovalStepItem[] | P0MpzisApprovalCard[]
): {
  steps: NormalizedStepData[];
  activeStepIndex: number;
  allCompleted: boolean;
  isReturned: boolean;
} {
  const status = mpzis.status || '';
  const isReturned = status === 'returned';
  const allCompleted = status === 'approved';

  // Find approval record for a step key
  const getApprovalForStep = (stepKey: MpzisStepKey) => {
    // 1. Check approvalSteps array if provided
    if (Array.isArray(approvalSteps)) {
      for (const item of approvalSteps) {
        if ('step' in item && item.step === stepKey) {
          return item.approval;
        }
        if ('step_key' in item && item.step_key === stepKey) {
          return {
            actor_name: item.user_nama,
            actor_id: item.user_id,
            actor_role: item.role,
            actor_level: null,
            created_at:
              item.timestamp ||
              ((item as unknown) as Record<string, unknown>).decided_at,
            snapshot_hash: item.snapshot_hash,
            note: item.note,
            action: item.status === 'APPROVED' ? 'approve' : 'pending',
          };
        }
      }
    }

    // 2. Check mpzis.approvals
    const approvalsList = (mpzis as { approvals?: ArtifactApproval[] }).approvals;
    if (Array.isArray(approvalsList)) {
      const match = approvalsList.find(
        (a) => a.approval_step === stepKey && a.action === 'approve'
      );
      if (match) return match;
    }

    return null;
  };

  // Determine active step index:
  // Step sequence: proposed (0) -> examined (1) -> ashnaf_verified (2) -> responsible_acknowledged (3) -> approved (4)
  let activeIndex = 0;
  if (allCompleted) {
    activeIndex = 5;
  } else if (status === 'responsible_acknowledged') {
    activeIndex = 4;
  } else if (status === 'ashnaf_verified') {
    activeIndex = 3;
  } else if (status === 'examined') {
    activeIndex = 2;
  } else if (status === 'proposed') {
    activeIndex = 1;
  } else if (status === 'submitted') {
    activeIndex = 0;
  } else {
    // Fallback: search for first step that lacks approval
    activeIndex = 0;
    for (let i = 0; i < MPZIS_STEP_DEFINITIONS.length; i++) {
      const stepDef = MPZIS_STEP_DEFINITIONS[i]!;
      const record = getApprovalForStep(stepDef.step);
      const isCardApproved =
        record &&
        ('action' in record
          ? record.action === 'approve' || record.action === 'APPROVED'
          : false);
      if (isCardApproved) {
        activeIndex = i + 1;
      } else {
        break;
      }
    }
  }

  const steps: NormalizedStepData[] = MPZIS_STEP_DEFINITIONS.map((def, idx) => {
    const record = getApprovalForStep(def.step);
    const isApproved = Boolean(
      record &&
        ('action' in record
          ? record.action === 'approve' || record.action === 'APPROVED'
          : false)
    );

    const isActive = !allCompleted && !isReturned && idx === activeIndex;
    const isPending = !isApproved && !isActive;

    return {
      step: def.step,
      definition: def,
      isApproved,
      isPending,
      isActive,
      isReturned: isReturned && idx === activeIndex,
      approverName: record ? String(record.actor_name || '') || null : null,
      approverRole: record ? String(record.actor_role || '') || null : null,
      approverLevel: record ? String(record.actor_level || '') || null : null,
      actorId: record ? record.actor_id ?? null : null,
      timestamp: record ? (record.created_at as string) || null : null,
      snapshotHash: record ? record.snapshot_hash || null : null,
      note: record ? record.note || null : null,
    };
  });

  return {
    steps,
    activeStepIndex: activeIndex,
    allCompleted,
    isReturned,
  };
}

export function checkRoleSegregation(
  stepDef: MpzisStepDefinition,
  mpzis: MpzisDraft | P0MpzisWorkspacePayload,
  normalizedSteps: NormalizedStepData[],
  actor: {
    id: number | string | null;
    role?: string | null;
    level?: string | null;
    division?: string | null;
  }
): { authorized: boolean; reason: string | null } {
  const userId = actor.id !== null && actor.id !== undefined ? String(actor.id) : null;
  if (!userId) {
    return {
      authorized: false,
      reason: 'Sesi pengguna tidak teridentifikasi. Silakan masuk kembali.',
    };
  }

  const role = (actor.role || '').toLowerCase().trim();
  const level = (actor.level || 'staff').toLowerCase().trim();
  const division = (actor.division || '').toLowerCase().trim();

  // 1. Admin Segregation: Admin cannot approve routine steps without separate recovery
  if (role === 'admin' || level === 'admin') {
    return {
      authorized: false,
      reason: 'Akun Administrator tidak dapat melakukan persetujuan rutin MPZIS (pemisahan kewenangan).',
    };
  }

  // 2. Division / Role check: Only Penyaluran division can approve MPZIS
  const isPenyaluran = role === 'penyaluran' || division.includes('penyaluran') || division.includes('pendistribusian');
  if (!isPenyaluran) {
    return {
      authorized: false,
      reason: 'Hanya divisi Penyaluran yang berwenang menyetujui tahapan MPZIS.',
    };
  }

  // 3. Creator & Submitter Segregation:
  const creatorId =
    (mpzis as MpzisDraft).created_by_id !== undefined &&
    (mpzis as MpzisDraft).created_by_id !== null
      ? String((mpzis as MpzisDraft).created_by_id)
      : null;

  const submitterId =
    (mpzis as MpzisDraft).submitted_by_id !== undefined &&
    (mpzis as MpzisDraft).submitted_by_id !== null
      ? String((mpzis as MpzisDraft).submitted_by_id)
      : null;

  if (creatorId && creatorId === userId) {
    return {
      authorized: false,
      reason: 'Pembuat draft MPZIS tidak dapat menyetujui tahapan persetujuan (pemisahan peran aktor).',
    };
  }

  if (submitterId && submitterId === userId) {
    return {
      authorized: false,
      reason: 'Submitter MPZIS tidak dapat menyetujui tahapan persetujuan (pemisahan peran aktor).',
    };
  }

  // 4. Sequential Actor Segregation: User cannot approve multiple sequential steps
  // (A user who already approved ANY prior step cannot approve subsequent steps)
  const priorApproverIds = normalizedSteps
    .filter((s) => s.isApproved && s.actorId !== null && s.actorId !== undefined)
    .map((s) => String(s.actorId));

  if (priorApproverIds.includes(userId)) {
    return {
      authorized: false,
      reason: 'User yang sama tidak dapat menyetujui tahap berikutnya (pemisahan peran aktor).',
    };
  }

  // 5. Level requirement for the step:
  // - proposed, examined, ashnaf_verified require 'staff'
  // - responsible_acknowledged, approved require 'leader'
  if (stepDef.requiredLevel === 'leader') {
    const isLeader = ['leader', 'kepala', 'manager', 'chief', 'pimpinan'].includes(level);
    if (!isLeader) {
      return {
        authorized: false,
        reason: `Tahap ini (${stepDef.levelLabel}) membutuhkan peran Pimpinan / Kabid Penyaluran.`,
      };
    }
  } else {
    // Requires staff
    const isStaff = ['staff', 'officer', 'operator'].includes(level) || !level;
    if (!isStaff) {
      return {
        authorized: false,
        reason: `Tahap ini (${stepDef.levelLabel}) membutuhkan peran Staf Penyaluran.`,
      };
    }
  }

  return { authorized: true, reason: null };
}

export function MpzisApprovalStepper({
  mustahikId,
  mpzis,
  approvalSteps,
  currentUserId: propUserId,
  currentUserRole,
  currentUserLevel,
  currentUserDivision,
  currentUser: propUser,
  onStepDecided,
  onRefresh,
  readOnly = false,
  className = '',
}: MpzisApprovalStepperProps) {
  const auth = useAuth();
  const effectiveUser = propUser || auth?.user;
  const effectiveUserId =
    propUserId !== undefined ? propUserId : effectiveUser?.id ?? null;
  const effectiveRole = currentUserRole || effectiveUser?.role || null;
  const effectiveLevel = currentUserLevel || effectiveUser?.level || null;
  const effectiveDivision = currentUserDivision || effectiveUser?.division || null;

  const actorContext = {
    id: effectiveUserId,
    role: effectiveRole,
    level: effectiveLevel,
    division: effectiveDivision,
  };

  const { steps, activeStepIndex, allCompleted, isReturned } = normalizeMpzisSteps(
    mpzis,
    approvalSteps
  );

  const activeStepData =
    activeStepIndex >= 0 && activeStepIndex < steps.length
      ? steps[activeStepIndex]!
      : null;

  const activeStepDef = activeStepData ? activeStepData.definition : null;

  const roleSegregationCheck = activeStepDef
    ? checkRoleSegregation(activeStepDef, mpzis, steps, actorContext)
    : { authorized: false, reason: 'Tidak ada tahap aktif yang memerlukan keputusan.' };

  // Dialog State
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    action: 'approve' | 'return';
    note: string;
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    action: 'approve',
    note: '',
    isSubmitting: false,
    error: null,
  });

  const mpzisId = mpzis.id;

  const handleOpenDialog = (action: 'approve' | 'return') => {
    setDialogState({
      isOpen: true,
      action,
      note: '',
      isSubmitting: false,
      error: null,
    });
  };

  const handleConfirmDecision = async () => {
    if (!mpzisId) {
      setDialogState((prev) => ({
        ...prev,
        error: 'ID MPZIS tidak ditemukan untuk memproses keputusan.',
      }));
      return;
    }

    if (!activeStepDef) {
      setDialogState((prev) => ({
        ...prev,
        error: 'Tidak ada tahapan aktif yang dapat diproses.',
      }));
      return;
    }

    if (dialogState.action === 'return' && !dialogState.note.trim()) {
      setDialogState((prev) => ({
        ...prev,
        error: 'Catatan pengembalian berkas MPZIS wajib diisi.',
      }));
      return;
    }

    setDialogState((prev) => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const res = await api.decideMpzisStep(mustahikId, mpzisId, activeStepDef.step, {
        action: dialogState.action,
        note: dialogState.note.trim() || undefined,
      });

      setDialogState((prev) => ({
        ...prev,
        isOpen: false,
        isSubmitting: false,
      }));

      if (res.data) {
        onStepDecided?.(res.data);
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gagal memproses persetujuan MPZIS.';
      setDialogState((prev) => ({
        ...prev,
        isSubmitting: false,
        error: msg,
      }));
    }
  };

  const mpzisAmount =
    (mpzis as MpzisDraft).total_amount !== undefined &&
    (mpzis as MpzisDraft).total_amount !== null
      ? Number((mpzis as MpzisDraft).total_amount)
      : (mpzis as P0MpzisWorkspacePayload).total_amount ?? 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Info Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-mono text-xs font-black text-emerald-800">
                F-BPP/06
              </span>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                5 Tahapan Berjenjang
              </span>
              {mpzis.revision !== undefined && (
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                  Revisi #{mpzis.revision}
                </span>
              )}
            </div>
            <h3 className="mt-2 text-lg font-black text-slate-900">
              Persetujuan Berjenjang MPZIS (5 Tingkat)
            </h3>
            <p className="text-xs text-slate-500">
              Alur persetujuan digital berurutan dengan penegakan pemisahan peran aktor (actor segregation).
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Nominal Bantuan
            </span>
            <span className="font-mono text-xl font-black text-emerald-700">
              {formatRupiah(mpzisAmount)}
            </span>
          </div>
        </div>

        {/* MPZIS Summary Attributes */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="block font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Nomor Formulir
            </span>
            <span className="mt-0.5 block font-mono font-bold text-slate-900">
              {displaySourceValue(mpzis.form_number)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="block font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Penerima Manfaat
            </span>
            <span className="mt-0.5 block font-bold text-slate-900 truncate">
              {displaySourceValue((mpzis as MpzisDraft).recipient_name)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="block font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Sumber Dana & Asnaf
            </span>
            <span className="mt-0.5 block font-bold text-slate-900">
              {displaySourceValue((mpzis as MpzisDraft).fund_source)} •{' '}
              {displaySourceValue((mpzis as MpzisDraft).asnaf)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <span className="block font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              Status Persetujuan
            </span>
            <span className="mt-0.5 inline-block rounded font-black text-[11px] uppercase tracking-wide">
              {allCompleted ? (
                <span className="text-emerald-700 font-extrabold">✓ Selesai Disetujui</span>
              ) : isReturned ? (
                <span className="text-rose-600 font-extrabold">✕ Dikembalikan</span>
              ) : (
                <span className="text-indigo-600 font-extrabold">
                  {activeStepDef ? `Menunggu: ${activeStepDef.label}` : 'Sedang Diproses'}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Global Returned Alert Banner */}
      {isReturned && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 text-rose-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-extrabold text-rose-950">
                Berkas MPZIS Dikembalikan untuk Koreksi
              </h4>
              <p className="mt-1 text-xs text-rose-800">
                Persetujuan MPZIS telah dikembalikan. Silakan periksa catatan pengembalian dari peninjau untuk melakukan perbaikan formulir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* All Completed Banner */}
      {allCompleted && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-extrabold text-emerald-950">
                Persetujuan Berjenjang MPZIS Lengkap (5/5 Tingkat Disetujui)
              </h4>
              <p className="mt-1 text-xs text-emerald-800">
                Seluruh 5 tahap persetujuan telah tuntas diverifikasi dan ditandatangani. Kasus siap melanjutkan ke tahap Pengajuan Pencairan Dana (PPD).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5 Sequential Approval Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((stepItem, index) => {
          const { definition, isApproved, isActive, isPending } = stepItem;

          // Card visual styling based on state
          let cardBorderBg = 'border-slate-200 bg-slate-50/70 text-slate-500';
          if (isApproved) {
            cardBorderBg = 'border-emerald-200 bg-emerald-50/50 text-slate-900 shadow-sm';
          } else if (isActive) {
            cardBorderBg =
              'border-indigo-300 bg-white text-slate-900 ring-2 ring-indigo-500/20 shadow-md';
          } else if (isReturned && stepItem.isReturned) {
            cardBorderBg = 'border-rose-300 bg-rose-50/50 text-rose-950';
          }

          return (
            <div
              key={definition.step}
              className={`flex flex-col justify-between rounded-2xl border p-4 transition duration-150 ${cardBorderBg}`}
            >
              <div>
                {/* Step Order & Status Header */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Tahap {definition.order}
                  </span>

                  {isApproved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      Disetujui
                    </span>
                  )}

                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 animate-pulse">
                      <Clock className="h-3 w-3" />
                      Aktif
                    </span>
                  )}

                  {isPending && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      <Lock className="h-2.5 w-2.5" />
                      Menunggu
                    </span>
                  )}

                  {isReturned && stepItem.isReturned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                      <XCircle className="h-3 w-3" />
                      Dikembalikan
                    </span>
                  )}
                </div>

                {/* Stage Label */}
                <h4 className="mt-2 text-sm font-black text-slate-900">
                  {definition.label}
                </h4>

                {/* Required Role Title */}
                <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                  {definition.levelLabel}
                </p>

                {/* Step Body Content */}
                <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
                  {isApproved ? (
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Disetujui Oleh:
                        </span>
                        <p className="font-bold text-slate-900 truncate">
                          {displaySourceValue(stepItem.approverName)}
                        </p>
                      </div>

                      {stepItem.timestamp && (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Waktu:
                          </span>
                          <p className="text-[11px] font-medium text-slate-600">
                            {formatTimestamp(stepItem.timestamp)}
                          </p>
                        </div>
                      )}

                      {stepItem.snapshotHash && (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Hash Snapshot:
                          </span>
                          <p
                            className="font-mono text-[10px] text-slate-500 truncate"
                            title={stepItem.snapshotHash}
                          >
                            #{stepItem.snapshotHash.slice(0, 8)}
                          </p>
                        </div>
                      )}

                      {stepItem.note && (
                        <div className="rounded-lg bg-emerald-100/60 p-2 text-[11px] text-emerald-900">
                          <span className="font-bold">Catatan:</span> {stepItem.note}
                        </div>
                      )}
                    </div>
                  ) : isActive ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-600">
                        {definition.roleDescription}
                      </p>

                      {/* Role Segregation Notice */}
                      {!roleSegregationCheck.authorized ? (
                        <div
                          role="alert"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-900"
                        >
                          <div className="flex items-start gap-1.5">
                            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                            <div>
                              <p className="text-[11px] font-extrabold text-amber-950">
                                Tidak Berwenang
                              </p>
                              <p className="mt-0.5 text-[10px] font-medium text-amber-800">
                                {roleSegregationCheck.reason}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Wewenang Terverifikasi</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3 text-slate-400">
                      <Lock className="h-4 w-4" />
                      <span className="text-[11px] font-medium">
                        Menunggu persetujuan tahap {index}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons for Active Step */}
              {isActive && !readOnly && (
                <div className="mt-4 flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={!roleSegregationCheck.authorized}
                    onClick={() => handleOpenDialog('approve')}
                    title={
                      !roleSegregationCheck.authorized
                        ? roleSegregationCheck.reason || 'Tidak berwenang'
                        : `Setujui Tahap ${definition.label}`
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Setujui
                  </button>

                  <button
                    type="button"
                    disabled={!roleSegregationCheck.authorized}
                    onClick={() => handleOpenDialog('return')}
                    title={
                      !roleSegregationCheck.authorized
                        ? roleSegregationCheck.reason || 'Tidak berwenang'
                        : `Kembalikan Berkas pada Tahap ${definition.label}`
                    }
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Kembalikan
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Decision Dialog (Approve / Return) */}
      <IrreversibleActionDialog
        isOpen={dialogState.isOpen}
        title={
          dialogState.action === 'approve'
            ? `Persetujuan MPZIS: ${activeStepDef?.stageName || ''}`
            : `Kembalikan Berkas MPZIS: ${activeStepDef?.label || ''}`
        }
        description={
          dialogState.action === 'approve' ? (
            <div className="space-y-2 text-xs text-slate-600">
              <p>
                Anda akan menyetujui tahap{' '}
                <strong className="text-slate-900">{activeStepDef?.stageName}</strong>{' '}
                untuk permohonan bantuan MPZIS sebesar{' '}
                <strong className="text-emerald-700">{formatRupiah(mpzisAmount)}</strong>.
              </p>
              <p className="rounded-lg bg-emerald-50 p-2.5 text-emerald-800">
                Persetujuan Anda akan dicatat ke dalam audit trail dengan identitas pengguna dan stempel waktu digital.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              <p className="rounded-lg bg-rose-50 p-2.5 text-rose-800">
                Berkas MPZIS akan dikembalikan ke status draft untuk diperbaiki oleh tim pengusul. Harap tuliskan catatan alasan pengembalian secara jelas.
              </p>
            </div>
          )
        }
        actionLabel={
          dialogState.action === 'approve' ? 'Konfirmasi Setujui' : 'Kembalikan Berkas'
        }
        cancelLabel="Batal"
        variant={dialogState.action === 'approve' ? 'primary' : 'danger'}
        noteLabel={
          dialogState.action === 'approve'
            ? 'Catatan Persetujuan (Opsional)'
            : 'Alasan Pengembalian (Wajib)'
        }
        notePlaceholder={
          dialogState.action === 'approve'
            ? 'Tuliskan catatan persetujuan jika ada...'
            : 'Jelaskan poin-poin yang perlu diperbaiki...'
        }
        noteRequired={dialogState.action === 'return'}
        noteValue={dialogState.note}
        onNoteChange={(val) => setDialogState((prev) => ({ ...prev, note: val }))}
        isSubmitting={dialogState.isSubmitting}
        errorMessage={dialogState.error}
        onConfirm={handleConfirmDecision}
        onClose={() => {
          if (!dialogState.isSubmitting) {
            setDialogState((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      />
    </div>
  );
}
