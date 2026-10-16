'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  Hash,
  Loader2,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import type { ArtifactApproval, P0TimelineEvent } from '@/lib/api/penyaluran-p0-types';

export type TimelineEventItem = (P0TimelineEvent | ArtifactApproval) & {
  actor_name?: string | null;
  actor_role?: string | null;
  actor_division?: string | null;
  created_at?: string | null;
  is_admin_override?: boolean;
  override_reason?: string | null;
  snapshot_hash?: string | null;
};

export interface ApprovalTimelineProps {
  events: TimelineEventItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return 'Waktu tidak tercatat';
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return String(ts);
  }
}

export function getActionStyle(actionStr: string | null | undefined) {
  const action = (actionStr || '').toLowerCase();
  if (
    action.includes('accept') ||
    action.includes('approv') ||
    action.includes('setuju') ||
    action.includes('terima')
  ) {
    return {
      label: 'Disetujui',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: CheckCircle2,
      dotBg: 'bg-emerald-600 ring-emerald-100',
    };
  }
  if (
    action.includes('return') ||
    action.includes('reject') ||
    action.includes('tolak') ||
    action.includes('kembali')
  ) {
    return {
      label: 'Dikembalikan',
      bg: 'bg-rose-100 text-rose-800 border-rose-300',
      icon: XCircle,
      dotBg: 'bg-rose-600 ring-rose-100',
    };
  }
  if (action.includes('submit') || action.includes('diajukan') || action.includes('ajukan')) {
    return {
      label: 'Diajukan',
      bg: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: FileCheck,
      dotBg: 'bg-blue-600 ring-blue-100',
    };
  }
  if (action.includes('record') || action.includes('catat') || action.includes('bayar')) {
    return {
      label: 'Dicatat',
      bg: 'bg-purple-100 text-purple-800 border-purple-300',
      icon: Clock,
      dotBg: 'bg-purple-600 ring-purple-100',
    };
  }
  if (action.includes('confirm') || action.includes('konfirmasi')) {
    return {
      label: 'Dikonfirmasi',
      bg: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: ShieldCheck,
      dotBg: 'bg-amber-600 ring-amber-100',
    };
  }
  if (action.includes('complete') || action.includes('selesai')) {
    return {
      label: 'Selesai',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      icon: CheckCircle2,
      dotBg: 'bg-emerald-600 ring-emerald-100',
    };
  }
  return {
    label: actionStr || 'Aktivitas',
    bg: 'bg-slate-100 text-slate-800 border-slate-300',
    icon: Clock,
    dotBg: 'bg-slate-500 ring-slate-100',
  };
}

export function ApprovalTimeline({
  events = [],
  isLoading = false,
  emptyMessage = 'Belum ada riwayat persetujuan tercatat.',
  className = '',
}: ApprovalTimelineProps) {
  if (isLoading) {
    return (
      <div
        role="status"
        className={`flex min-h-[200px] flex-col items-center justify-center p-8 text-center text-slate-500 ${className}`}
      >
        <Loader2 className="size-6 animate-spin text-emerald-600" aria-hidden="true" />
        <span className="mt-2 text-xs font-semibold">Memuat riwayat persetujuan...</span>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div
        className={`flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500 ${className}`}
      >
        <Clock className="size-8 text-slate-300" aria-hidden="true" />
        <p className="mt-2 text-xs font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`flow-root ${className}`}>
      <ol aria-label="Garis Waktu Persetujuan" className="relative space-y-6 pl-6">
        {/* Continuous timeline vertical line */}
        <div
          aria-hidden="true"
          className="absolute bottom-3 left-[11px] top-3 w-0.5 bg-slate-200"
        />

        {events.map((event, index) => {
          const rawEvent = (event as unknown) as Record<string, unknown>;
          const actorName =
            (rawEvent.actor_name as string) ||
            (rawEvent.actor as string) ||
            'Sistem';
          const actorRole = (rawEvent.actor_role as string) || null;
          const actorDivision = (rawEvent.actor_division as string) || null;
          const timestamp =
            (rawEvent.created_at as string) ||
            (rawEvent.timestamp as string) ||
            null;
          const action = (rawEvent.action as string) || 'Aktivitas';
          const note = (rawEvent.note as string) || null;
          const isAdminOverride = Boolean(rawEvent.is_admin_override);
          const overrideReason = (rawEvent.override_reason as string) || null;
          const snapshotHash = (rawEvent.snapshot_hash as string) || null;

          const actionStyle = getActionStyle(action);
          const ActionIcon = actionStyle.icon;

          return (
            <li key={rawEvent.id ? String(rawEvent.id) : `event-${index}`} className="relative group">
              {/* Event Marker Node */}
              <div
                aria-hidden="true"
                className={`absolute -left-[29px] top-1.5 grid size-6 place-items-center rounded-full ring-4 bg-white ${actionStyle.dotBg}`}
              >
                <div className="size-2 rounded-full bg-current" />
              </div>

              {/* Event Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${actionStyle.bg}`}
                    >
                      <ActionIcon className="size-3.5" aria-hidden="true" />
                      {actionStyle.label}
                    </span>

                    {isAdminOverride && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900">
                        <AlertTriangle className="size-3" aria-hidden="true" />
                        Admin Recovery Override
                      </span>
                    )}

                    {snapshotHash && (
                      <span
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-slate-500"
                        title={snapshotHash}
                        aria-label={`Snapshot Hash: ${snapshotHash}`}
                      >
                        <Hash className="size-3 text-slate-400" aria-hidden="true" />
                        {snapshotHash.slice(0, 8)}...
                      </span>
                    )}
                  </div>

                  <time
                    dateTime={timestamp || undefined}
                    className="text-xs font-semibold text-slate-400"
                  >
                    {formatTimestamp(timestamp)}
                  </time>
                </div>

                {/* Actor Info */}
                <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-700">
                  <User className="size-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="font-bold text-slate-900">{actorName}</span>
                  {(actorRole || actorDivision) && (
                    <span className="text-slate-500">
                      ({[actorRole, actorDivision].filter(Boolean).join(' · ')})
                    </span>
                  )}
                </div>

                {/* Note */}
                {note && (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs font-medium text-slate-700 leading-relaxed border border-slate-100">
                    {note}
                  </p>
                )}

                {/* Override Reason */}
                {isAdminOverride && overrideReason && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-xs font-medium text-amber-900">
                    <span className="font-bold">Alasan Override:</span> {overrideReason}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default ApprovalTimeline;
