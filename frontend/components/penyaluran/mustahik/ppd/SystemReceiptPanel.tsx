'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  Hash,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  P0CompletionWorkspacePayload,
  P0PpdWorkspacePayload,
  PpdDraft,
  ReceiptStatus,
} from '@/lib/api/penyaluran-p0-types';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';

export interface SystemReceiptPanelProps {
  mustahikId: number | string;
  ppd: PpdDraft | P0PpdWorkspacePayload;
  completion?: P0CompletionWorkspacePayload | null;
  fileNo?: string | null;
  isCompleted?: boolean;
  onCompleted?: () => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
  className?: string;
}

export function SystemReceiptPanel({
  mustahikId,
  ppd,
  completion,
  fileNo,
  isCompleted = false,
  onCompleted,
  onRefresh,
  readOnly = false,
  className = '',
}: SystemReceiptPanelProps) {
  const ppdId = (ppd as any).id;
  const isPpdCompleted =
    isCompleted ||
    (ppd as any).status === 'completed' ||
    completion?.status === 'completed';

  const receiptStatus: ReceiptStatus =
    (ppd as any).receipt?.status ||
    (ppd as any).receipt_status ||
    completion?.receipt_status ||
    (isPpdCompleted ? 'ready' : 'pending');

  const payloadSha256 =
    (ppd as any).receipt?.receipt_payload_sha256 ||
    (ppd as any).receipt?.payload_sha256 ||
    (ppd as any).payload_sha256 ||
    completion?.payload_sha256 ||
    (ppd as any).snapshot_hash ||
    null;

  const fileSha256 =
    (ppd as any).receipt?.file_sha256 ||
    (ppd as any).file_sha256 ||
    completion?.file_sha256 ||
    null;

  // Local State
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copiedPayloadHash, setCopiedPayloadHash] = useState(false);
  const [copiedFileHash, setCopiedFileHash] = useState(false);

  // Polling when pending
  useEffect(() => {
    if (!isPpdCompleted || receiptStatus !== 'pending') return;

    const interval = setInterval(async () => {
      if (onRefresh) {
        await onRefresh();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isPpdCompleted, receiptStatus, onRefresh]);

  const handleCompleteClick = () => {
    if (readOnly) return;
    setCompleteError(null);
    setIsCompleteDialogOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (!ppdId) return;
    setIsCompleting(true);
    setCompleteError(null);

    try {
      await api.completePpd(mustahikId, ppdId);
      setIsCompleteDialogOpen(false);
      onCompleted?.();
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setCompleteError(err.message || 'Gagal menuntaskan penyaluran.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!ppdId) return;
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const blob = await api.downloadReceipt(mustahikId, ppdId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const refName = (ppd as any).ppd_number || fileNo || `case-${mustahikId}`;
      a.download = `Bukti-Digital-Penyaluran-${refName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err.message || 'Gagal mengunduh berkas Bukti Digital Penyaluran.');
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'payload' | 'file') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'payload') {
        setCopiedPayloadHash(true);
        setTimeout(() => setCopiedPayloadHash(false), 2000);
      } else {
        setCopiedFileHash(true);
        setTimeout(() => setCopiedFileHash(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
              Penuntasan Kasus
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              {isPpdCompleted ? 'Penyaluran Berhasil Tuntas' : 'Bukti Digital Penyaluran & Penutupan Kasus'}
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isPpdCompleted
              ? 'Kasus ini telah melalui seluruh gerbang audit verifikasi, persetujuan MPZIS, pencairan PPD, dan konfirmasi penerima.'
              : 'Penerbitan Bukti Digital Penyaluran terotentikasi dengan verifikasi kriptografis ganda (dual SHA-256).'}
          </p>
        </div>

        {isPpdCompleted && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-xs font-extrabold text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Status: Tuntas
          </span>
        )}
      </div>

      {downloadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span>{downloadError}</span>
          </div>
        </div>
      )}

      {/* STATE 1: Ready to Complete (PPD is recipient_confirmed) */}
      {!isPpdCompleted && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="grid size-11 place-items-center rounded-2xl bg-emerald-600 text-white shrink-0">
              <Sparkles className="size-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-emerald-950">
                Siap Menuntaskan Penyaluran Kasus
              </h4>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Seluruh tahapan (Asesmen, Rekomendasi MPZIS, Verifikasi Keuangan, Pencatatan Pembayaran, dan Konfirmasi Tanda Terima Mustahik) telah lengkap dan tervalidasi.
                Penutupan kasus akan menerbitkan Bukti Digital Penyaluran resmi secara permanen.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleCompleteClick}
              disabled={readOnly}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Tuntaskan Penyaluran & Terbitkan Bukti Digital
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: Case Completed -> Digital Receipt Card */}
      {isPpdCompleted && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          {/* Status lifecycle display */}
          {receiptStatus === 'pending' ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <Loader2 className="size-5 animate-spin text-amber-600 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-extrabold">Bukti Digital Sedang Diproses oleh Sistem</p>
                <p className="mt-0.5 text-amber-800">
                  Dokumen PDF resmi sedang digenerate dan dihitung tanda tangan kriptografisnya. Halaman akan menyegarkan otomatis.
                </p>
              </div>
            </div>
          ) : receiptStatus === 'failed' ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-extrabold text-rose-800">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <span>Pembuatan Bukti Digital Mengalami Kendala</span>
              </div>
              <p className="text-rose-700">
                Penuntasan kasus tetap sah tercatat di buku besar, namun proses rendering dokumen mengalami timeout. Anda dapat mencoba memuat ulang status.
              </p>
              <button
                type="button"
                onClick={() => onRefresh?.()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Muat Ulang Status
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-extrabold text-emerald-950">
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                <span>Bukti Digital Penyaluran Resmi Siap Diunduh</span>
              </div>
              <p className="mt-1 text-emerald-800">
                Dokumen telah tersimpan secara permanen pada repositori berkas privat yang terlindungi dan terverifikasi secara kriptografis.
              </p>
            </div>
          )}

          {/* Dual SHA-256 Hash Transparency Section */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-xs">
            <div className="flex items-center gap-2 text-slate-800 font-extrabold">
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
              <span>Verifikasi Keabsahan Kriptografis (Dual SHA-256)</span>
            </div>

            {/* Payload Hash */}
            <div className="space-y-1">
              <span className="font-semibold text-slate-500">
                1. Hash Data Bukti (Canonical JSON Payload SHA-256):
              </span>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="font-mono text-xs text-slate-800 break-all select-all">
                  {payloadSha256 || 'Menunggu kalkulasi...'}
                </span>
                {payloadSha256 && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(payloadSha256, 'payload')}
                    aria-label="Salin hash data payload"
                    title="Salin Hash"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {copiedPayloadHash ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* File Hash */}
            <div className="space-y-1 pt-1">
              <span className="font-semibold text-slate-500">
                2. Hash Berkas PDF (Digital Artifact File SHA-256):
              </span>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="font-mono text-xs text-slate-800 break-all select-all">
                  {fileSha256 || 'Menunggu kalkulasi...'}
                </span>
                {fileSha256 && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(fileSha256, 'file')}
                    aria-label="Salin hash berkas PDF"
                    title="Salin Hash"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    {copiedFileHash ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Download PDF Action */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-500">
              Format dokumen resmi: PDF (Ukuran standar A4 BAZNAS).
            </span>

            <button
              type="button"
              onClick={handleDownloadReceipt}
              disabled={isDownloading || receiptStatus !== 'ready'}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
            >
              {isDownloading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              Unduh Bukti Digital Penyaluran (PDF)
            </button>
          </div>
        </div>
      )}

      {/* Irreversible Complete Dialog */}
      <IrreversibleActionDialog
        isOpen={isCompleteDialogOpen}
        title="Tuntaskan Penyaluran Kasus & Terbitkan Bukti"
        actionLabel="Tuntaskan Kasus Sekarang"
        variant="primary"
        isSubmitting={isCompleting}
        errorMessage={completeError}
        onConfirm={handleConfirmComplete}
        onClose={() => setIsCompleteDialogOpen(false)}
        description={
          <div className="space-y-3 text-xs text-slate-600">
            <p>
              Tindakan ini akan <strong>menutup kasus penyaluran secara permanen</strong> dan mengunci seluruh riwayat verifikasi.
              Sistem akan memvalidasi kemandirian seluruh aktor yang terlibat dan menerbitkan Bukti Digital Penyaluran resmi.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Status Baru:</span>
                <span className="font-bold text-emerald-700">Penyaluran Selesai (Completed)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Nomor Registrasi:</span>
                <span className="font-mono font-bold text-slate-800">{fileNo || mustahikId}</span>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}

export default SystemReceiptPanel;
