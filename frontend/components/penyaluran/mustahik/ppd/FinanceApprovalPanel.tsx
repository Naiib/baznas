'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  Hash,
  Info,
  Loader2,
  Lock,
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
  P0PpdWorkspacePayload,
  PpdDraft,
  PpdStatus,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { formatRupiah } from '../shared/MoneyInput';

export interface FinanceApprovalPanelProps {
  mustahikId: number | string;
  ppd: PpdDraft | P0PpdWorkspacePayload;
  currentUserId?: number | string | null;
  currentUserRole?: string | null;
  currentUserLevel?: string | null;
  currentUserDivision?: string | null;
  currentUser?: CurrentUser | null;
  approvalEvents?: ArtifactApproval[];
  capabilities?: Record<string, boolean>;
  onDecided?: (updatedDraft: PpdDraft) => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
  className?: string;
}

export function FinanceApprovalPanel({
  mustahikId,
  ppd,
  currentUserId: propUserId,
  currentUserRole: propUserRole,
  currentUserLevel: propUserLevel,
  currentUserDivision: propUserDivision,
  currentUser: propUser,
  approvalEvents = [],
  capabilities,
  onDecided,
  onRefresh,
  readOnly: propReadOnly = false,
  className = '',
}: FinanceApprovalPanelProps) {
  const auth = useAuth();
  const user = propUser || auth?.user || null;
  const currentUserId = propUserId !== undefined ? propUserId : user?.id ?? null;
  const role = propUserRole ?? user?.role ?? '';
  const level = propUserLevel ?? user?.level ?? '';
  const division = propUserDivision ?? (user as any)?.division ?? (user as any)?.department ?? '';

  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const status: PpdStatus = (ppd.status as PpdStatus) || 'submitted';
  const ppdId = (ppd as any).id;
  const ppdAmount = (ppd as any).amount || (ppd as any).total_rab || 0;
  const creatorId = (ppd as any).created_by_id;

  // Identify Checker event
  const checkerEvent = useMemo(() => {
    return approvalEvents.find(
      (ev) => (ev.action as string) === 'finance_check' || ev.approval_step === 'finance_check' || (ev.approval_step === 'checker' && ev.action === 'approve')
    );
  }, [approvalEvents]);

  // Identify Approver event
  const approverEvent = useMemo(() => {
    return approvalEvents.find(
      (ev) => (ev.action as string) === 'finance_approve' || ev.approval_step === 'finance_approve' || (ev.approval_step === 'approver' && ev.action === 'approve')
    );
  }, [approvalEvents]);

  const checkerActorId = checkerEvent?.actor_id ?? (ppd as any).finance_checker_id ?? null;

  // Role checks: Admin is strictly segregated from routine finance actions (audit/recovery only)
  const isAdmin =
    String(role).toLowerCase() === 'admin' ||
    String(level).toLowerCase() === 'admin' ||
    Boolean((user as any)?.isAdmin);

  const isFinanceDivision =
    (String(role).toLowerCase() === 'keuangan' ||
      String(division).toLowerCase() === 'keuangan') &&
    !isAdmin;

  const isLeader =
    (String(level).toLowerCase() === 'leader' ||
      String(level).toLowerCase() === 'kepala') &&
    !isAdmin;

  // Segregation checks
  const isCreator =
    currentUserId !== null &&
    creatorId !== null &&
    creatorId !== undefined &&
    String(currentUserId) === String(creatorId);

  const isSameAsChecker =
    currentUserId !== null &&
    checkerActorId !== null &&
    checkerActorId !== undefined &&
    String(currentUserId) === String(checkerActorId);

  // Checker stage capability: server capabilities take precedence if provided
  const canPerformCheck = useMemo(() => {
    if (propReadOnly) return false;
    if (status !== 'submitted') return false;
    if (isAdmin) return false;
    if (capabilities && capabilities.finance_check !== undefined) {
      return Boolean(capabilities.finance_check) && !isCreator;
    }
    if (!isFinanceDivision) return false;
    if (isCreator) return false;
    return true;
  }, [propReadOnly, status, isAdmin, capabilities, isFinanceDivision, isCreator]);

  // Approver stage capability: server capabilities take precedence if provided
  const canPerformApprove = useMemo(() => {
    if (propReadOnly) return false;
    if (status !== 'finance_checked') return false;
    if (isAdmin) return false;
    if (capabilities && capabilities.finance_approve !== undefined) {
      return Boolean(capabilities.finance_approve) && !isCreator && !isSameAsChecker;
    }
    if (!isFinanceDivision) return false;
    if (!isLeader) return false;
    if (isCreator) return false;
    if (isSameAsChecker) return false;
    return true;
  }, [propReadOnly, status, isAdmin, capabilities, isFinanceDivision, isLeader, isCreator, isSameAsChecker]);

  // Reason message if blocked
  const getCheckerBlockingReason = () => {
    if (status !== 'submitted') return null;
    if (isAdmin) {
      return 'Akun Administrator tidak dapat memproses pemeriksaan keuangan rutin (pemisahan kewenangan). Harap gunakan akun staf Divisi Keuangan.';
    }
    if (!isFinanceDivision) {
      return 'Tinjauan Keuangan hanya dapat diproses oleh staf/pimpinan Divisi Keuangan.';
    }
    if (isCreator) {
      return 'Pemisahan Peran: Pembuat PPD di Penyaluran dilarang memeriksa keuangan.';
    }
    return null;
  };

  const getApproverBlockingReason = () => {
    if (status !== 'finance_checked') return null;
    if (isAdmin) {
      return 'Akun Administrator tidak dapat memproses persetujuan keuangan rutin (pemisahan kewenangan). Harap gunakan akun pimpinan Divisi Keuangan.';
    }
    if (!isFinanceDivision) {
      return 'Persetujuan Keuangan hanya dapat diproses oleh Divisi Keuangan.';
    }
    if (!isLeader) {
      return 'Persetujuan Keuangan memerlukan level pimpinan (Leader).';
    }
    if (isCreator) {
      return 'Pemisahan Peran: Pembuat PPD dilarang menyetujui pencairan keuangan.';
    }
    if (isSameAsChecker) {
      return 'Pemisahan Peran: Pemeriksa PPD (Checker) tidak dapat merangkap sebagai Penyetuju PPD (Approver). Diperlukan pimpinan keuangan independen.';
    }
    return null;
  };

  const handleExecuteCheck = async () => {
    if (!canPerformCheck || !ppdId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await api.financeCheckPpd(mustahikId, ppdId, { note: note.trim() || undefined });
      setNote('');
      if (res.data) onDecided?.(res.data);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Gagal memproses pemeriksaan keuangan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteApprove = async () => {
    if (!canPerformApprove || !ppdId) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await api.financeApprovePpd(mustahikId, ppdId, { note: note.trim() || undefined });
      setNote('');
      if (res.data) onDecided?.(res.data);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Gagal memproses persetujuan keuangan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Overview */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
              F-PKP/03
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              Tinjauan & Persetujuan Keuangan (Dual-Actor)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pemeriksaan administratif dan persetujuan pencairan dana oleh dua aktor independen Divisi Keuangan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Nominal:</span>
          <span className="font-mono text-sm font-black text-emerald-800">
            {formatRupiah(ppdAmount)}
          </span>
        </div>
      </div>

      {/* Snapshot Hash Banner */}
      {(ppd as any).snapshot_hash && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-600">
          <Hash className="size-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold">Snapshot Hash PPD:</span>
          <span className="font-mono font-bold text-slate-900">
            {String((ppd as any).snapshot_hash).slice(0, 16)}...
          </span>
        </div>
      )}

      {/* Division/Role Notice if Non-Finance or Admin Segregation */}
      {isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="size-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Pemisahan Kewenangan (Segregation of Duties)</p>
              <p className="mt-0.5 text-amber-800">
                Akun Administrator tidak dapat melakukan pemeriksaan atau persetujuan keuangan rutin. Tindakan operasional pemeriksaan & persetujuan keuangan dibatasi hanya untuk staf dan pimpinan Divisi Keuangan.
              </p>
            </div>
          </div>
        </div>
      ) : !isFinanceDivision ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-xs text-slate-700">
          <div className="flex items-start gap-2.5">
            <Info className="size-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold">Mode Pratinjau Audit (Read-Only)</p>
              <p className="mt-0.5 text-slate-600">
                Tinjauan Keuangan hanya dapat diproses oleh Divisi Keuangan. Anda saat ini melihat dalam mode baca.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Error Alert */}
      {actionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {/* Dual Step Cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* CARD 1: CHECKER STAGE */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            status === 'submitted'
              ? 'border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-400'
              : status === 'finance_checked' ||
                status === 'finance_approved' ||
                status === 'payment_recorded' ||
                status === 'payment_verified' ||
                status === 'recipient_confirmed' ||
                status === 'completed'
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                1
              </span>
              <h4 className="text-sm font-extrabold text-slate-900">
                Pemeriksaan Keuangan (Checker)
              </h4>
            </div>
            {status !== 'draft' && status !== 'submitted' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Selesai Diperiksa
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800">
                Menunggu Pemeriksaan
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Staf Keuangan memverifikasi kesesuaian nomor registrasi, alokasi RAB, dan dokumen pendukung permohonan.
          </p>

          {/* Audit Details if Checked */}
          {checkerEvent && (
            <div className="mt-3 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Pemeriksa:</span>
                <span className="font-bold text-slate-900">{checkerEvent.actor_name || `Staff #${checkerEvent.actor_id}`}</span>
              </div>
              {checkerEvent.note && (
                <div className="pt-1 text-slate-700 italic border-t border-emerald-100">
                  &ldquo;{checkerEvent.note}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Action area when active */}
          {status === 'submitted' && (
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-100">
              {getCheckerBlockingReason() ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{getCheckerBlockingReason()}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="checker-note" className="text-xs font-bold text-slate-700">
                      Catatan Pemeriksaan (Opsional)
                    </label>
                    <input
                      type="text"
                      id="checker-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Misal: Berkas dan RAB telah diverifikasi lengkap"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteCheck}
                    disabled={isSubmitting}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileCheck2 className="size-4" aria-hidden="true" />
                    )}
                    Konfirmasi Pemeriksaan Keuangan
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* CARD 2: APPROVER STAGE */}
        <div
          className={`rounded-2xl border p-5 transition-all ${
            status === 'finance_checked'
              ? 'border-emerald-500 bg-white shadow-sm ring-1 ring-emerald-400'
              : status === 'finance_approved' ||
                status === 'payment_recorded' ||
                status === 'payment_verified' ||
                status === 'recipient_confirmed' ||
                status === 'completed'
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-slate-200 bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-800">
                2
              </span>
              <h4 className="text-sm font-extrabold text-slate-900">
                Persetujuan Keuangan (Approver)
              </h4>
            </div>
            {status === 'finance_approved' ||
            status === 'payment_recorded' ||
            status === 'payment_verified' ||
            status === 'recipient_confirmed' ||
            status === 'completed' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Disetujui
              </span>
            ) : status === 'finance_checked' ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800">
                Menunggu Persetujuan
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                Tahap Berikutnya
              </span>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-600">
            Pejabat / Leader Keuangan menyetujui pencairan dana setelah memeriksa hasil verifikasi staf pemeriksa.
          </p>

          {/* Audit Details if Approved */}
          {approverEvent && (
            <div className="mt-3 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Penyetuju:</span>
                <span className="font-bold text-slate-900">{approverEvent.actor_name || `Leader #${approverEvent.actor_id}`}</span>
              </div>
              {approverEvent.note && (
                <div className="pt-1 text-slate-700 italic border-t border-emerald-100">
                  &ldquo;{approverEvent.note}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Action area when active */}
          {status === 'finance_checked' && (
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-100">
              {getApproverBlockingReason() ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{getApproverBlockingReason()}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label htmlFor="approver-note" className="text-xs font-bold text-slate-700">
                      Catatan Persetujuan (Opsional)
                    </label>
                    <input
                      type="text"
                      id="approver-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Misal: Disetujui untuk diproses transfer bank"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteApprove}
                    disabled={isSubmitting}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    )}
                    Setujui Pencairan Keuangan
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FinanceApprovalPanel;
