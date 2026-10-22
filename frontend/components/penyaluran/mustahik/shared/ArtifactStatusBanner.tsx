'use client';

import React, { type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Hash, Info, XCircle } from 'lucide-react';

export type BannerVariant = 'info' | 'success' | 'warning' | 'error' | 'legacy';

export interface ArtifactStatusBannerProps {
  status?: string | null;
  revision?: number | null;
  snapshotHash?: string | null;
  isLegacy?: boolean;
  variant?: BannerVariant;
  title?: string;
  message?: string;
  blockingReasons?: string[];
  children?: ReactNode;
  className?: string;
}

/**
 * Canonical P0 source value formatter.
 * Returns 'Belum dicatat' if value is null, undefined, or an empty string.
 * Preserves numeric 0 and boolean false.
 */
export function displaySourceValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Belum dicatat';
  }
  if (typeof value === 'string' && value.trim() === '') {
    return 'Belum dicatat';
  }
  return String(value);
}

export function ArtifactStatusBanner({
  status,
  revision,
  snapshotHash,
  isLegacy = false,
  variant,
  title,
  message,
  blockingReasons = [],
  children,
  className = '',
}: ArtifactStatusBannerProps) {
  // Determine effective variant
  let effectiveVariant: BannerVariant = variant || 'info';
  if (isLegacy) {
    effectiveVariant = 'legacy';
  } else if (!variant && status) {
    const s = status.toLowerCase();
    if (s.includes('return') || s.includes('reject') || s.includes('tolak') || s.includes('kembali')) {
      effectiveVariant = 'error';
    } else if (
      s.includes('accept') ||
      s.includes('approv') ||
      s.includes('setuju') ||
      s.includes('selesai') ||
      s.includes('complete')
    ) {
      effectiveVariant = 'success';
    } else if (s.includes('draft') || s.includes('submit') || s.includes('pending')) {
      effectiveVariant = 'info';
    }
  }

  const config = {
    legacy: {
      role: 'alert',
      border: 'border-amber-400',
      bg: 'bg-amber-50',
      text: 'text-amber-950',
      iconColor: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
      defaultTitle: 'Peringatan: Berkas Kasus Legacy',
      defaultMessage:
        'Perhatian: Data ini merupakan arsip legacy sebelum migrasi P0. Dokumen dan kelayakan belum diverifikasi secara digital melalui standar P0.',
      Icon: AlertTriangle,
    },
    error: {
      role: 'alert',
      border: 'border-rose-300',
      bg: 'bg-rose-50',
      text: 'text-rose-950',
      iconColor: 'text-rose-700',
      badgeBg: 'bg-rose-100 text-rose-900 border-rose-300',
      defaultTitle: 'Pengembalian / Penolakan Artefak',
      defaultMessage: 'Artefak ini telah dikembalikan untuk revisi atau ditolak.',
      Icon: XCircle,
    },
    warning: {
      role: 'alert',
      border: 'border-amber-300',
      bg: 'bg-amber-50',
      text: 'text-amber-950',
      iconColor: 'text-amber-700',
      badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
      defaultTitle: 'Peringatan Validasi',
      defaultMessage: 'Terdapat kendala atau catatan penting pada tahapan ini.',
      Icon: AlertTriangle,
    },
    success: {
      role: 'status',
      border: 'border-emerald-300',
      bg: 'bg-emerald-50',
      text: 'text-emerald-950',
      iconColor: 'text-emerald-700',
      badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      defaultTitle: 'Tahapan Disetujui',
      defaultMessage: 'Artefak telah divalidasi dan disetujui sesuai regulasi P0.',
      Icon: CheckCircle2,
    },
    info: {
      role: 'status',
      border: 'border-slate-200',
      bg: 'bg-slate-50',
      text: 'text-slate-900',
      iconColor: 'text-slate-600',
      badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
      defaultTitle: 'Status Artefak',
      defaultMessage: 'Artefak sedang dalam proses aktif.',
      Icon: Clock,
    },
  }[effectiveVariant];

  const { Icon } = config;
  const bannerTitle = title || config.defaultTitle;
  const bannerMessage = message || (isLegacy ? config.defaultMessage : undefined);

  return (
    <div
      role={config.role}
      className={`rounded-2xl border ${config.border} ${config.bg} p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 shrink-0">
          <Icon className={`size-5 ${config.iconColor}`} aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`text-sm font-extrabold ${config.text}`}>{bannerTitle}</h3>

            {status && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${config.badgeBg}`}
              >
                {status}
              </span>
            )}

            {revision !== null && revision !== undefined && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-mono font-bold text-slate-700">
                Revisi {revision}
              </span>
            )}

            {snapshotHash && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700"
                title={snapshotHash}
                aria-label={`Snapshot SHA-256: ${snapshotHash}`}
              >
                <Hash className="size-3 text-slate-400" aria-hidden="true" />
                sha256:{snapshotHash.slice(0, 8)}...
              </span>
            )}
          </div>

          {bannerMessage && (
            <p className={`mt-1.5 text-xs font-medium leading-relaxed ${config.text}`}>
              {bannerMessage}
            </p>
          )}

          {blockingReasons.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3">
              <p className="text-xs font-bold text-amber-900">Alasan Pemblokiran:</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs font-medium text-amber-800">
                {blockingReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export default ArtifactStatusBanner;
