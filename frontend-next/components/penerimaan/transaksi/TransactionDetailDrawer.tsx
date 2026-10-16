'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  X,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  FileText,
  ExternalLink,
  User,
  Phone,
  Mail,
  Building,
  CreditCard,
  RotateCcw,
  Coins,
  Receipt,
  Calendar,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { fetchAuthenticatedBlob } from '@/lib/api/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';
import type {
  PenerimaanTransactionDetail,
  PenerimaanStatus,
} from '@/lib/api/types';

interface TransactionDetailDrawerProps {
  transactionId: string | number | null;
  isOpen: boolean;
  onClose?: () => void;
  onStatusUpdated?: () => void;
  isMobilePage?: boolean;
}

const DEFAULT_STATUS_BADGE = {
  label: 'Masuk',
  bg: 'bg-zinc-50',
  text: 'text-zinc-700',
  border: 'border-zinc-200',
  icon: Clock,
};

const STATUS_BADGES: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: any }
> = {
  Masuk: {
    label: 'Masuk',
    bg: 'bg-zinc-50',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
    icon: Clock,
  },
  'Menunggu Validasi': {
    label: 'Menunggu Validasi',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: Clock,
  },
  Tervalidasi: {
    label: 'Tervalidasi',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  Terverifikasi: {
    label: 'Terverifikasi',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: CheckCircle2,
  },
  'Menunggu Approval': {
    label: 'Menunggu Approval',
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    icon: ShieldAlert,
  },
  Disetujui: {
    label: 'Disetujui',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    icon: ShieldCheck,
  },
  'Rekonsiliasi Selesai': {
    label: 'Terekonsiliasi',
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    icon: CheckCircle2,
  },
  Posted: {
    label: 'Posted',
    bg: 'bg-sky-50',
    text: 'text-sky-800',
    border: 'border-sky-200',
    icon: CheckCircle2,
  },
  Ditolak: {
    label: 'Ditolak',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    icon: AlertTriangle,
  },
  Dibatalkan: {
    label: 'Dibatalkan',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-300',
    icon: X,
  },
};

const CHANNEL_DISPLAY: Record<string, string> = {
  bank_transfer: 'Transfer Bank',
  qris: 'QRIS BAZNAS',
  counter_kasir: 'Counter Kasir',
  virtual_account: 'Virtual Account',
  payment_gateway: 'Payment Gateway',
  jemput_zakat: 'Layanan Jemput Zakat',
};

const FUND_TYPE_DISPLAY: Record<string, string> = {
  zakat_maal: 'Zakat Maal',
  zakat_fitrah: 'Zakat Fitrah',
  zakat_profesi: 'Zakat Penghasilan / Profesi',
  infak: 'Infak',
  sedekah: 'Sedekah',
  dskl: 'DSKL',
  fidyah: 'Fidyah & Kafarat',
};

function formatRupiah(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const clean = String(amount).trim().replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const isNegative = clean.startsWith('-');
  const digits = isNegative ? clean.slice(1) : clean;
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return `${isNegative ? '-Rp ' : 'Rp '}${parts.join('.')}`;
}

function formatDate(isoDate?: string | null): string {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return isoDate;
  }
}

export function TransactionDetailDrawer({
  transactionId,
  isOpen,
  onClose = () => {},
  onStatusUpdated,
  isMobilePage = false,
}: TransactionDetailDrawerProps) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PenerimaanTransactionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [openingEvidence, setOpeningEvidence] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleEvidenceOpen = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!detail?.evidence_url?.startsWith('/uploads/')) return;
    event.preventDefault();
    const previewWindow = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!previewWindow) {
      setActionFeedback('Izinkan pop-up untuk membuka bukti transaksi.');
      return;
    }
    setOpeningEvidence(true);
    try {
      const blob = await fetchAuthenticatedBlob(detail.evidence_url);
      const blobUrl = URL.createObjectURL(blob);
      previewWindow.location.href = blobUrl;
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (openError) {
      previewWindow.close();
      setActionFeedback(openError instanceof Error ? openError.message : 'Gagal membuka bukti transaksi.');
    } finally {
      setOpeningEvidence(false);
    }
  };

  // Store active element for focus restoration
  useEffect(() => {
    if (isOpen && typeof document !== 'undefined') {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
        if (triggerRef.current) {
          triggerRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch transaction details
  useEffect(() => {
    if (!transactionId || !isOpen) return;
    let isMounted = true;

    async function loadDetail() {
      setLoading(true);
      setError(null);
      try {
        const res = await penerimaanApi.getTransactionById(transactionId!);
        if (isMounted) {
          if (res.success && res.data) {
            setDetail(res.data);
          } else {
            setError(res.message || 'Gagal memuat detail transaksi');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Terjadi kesalahan jaringan');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [transactionId, isOpen]);

  if (!isOpen && !isMobilePage) return null;

  const actor = normalizeAccessActor(user);
  const isLeader = actor.isPenerimaan && actor.level === 'leader';
  const isAdmin = actor.isAdmin;
  const isStaff = actor.isPenerimaan && !isLeader && !isAdmin;

  const statusConfig = (detail?.status && STATUS_BADGES[detail.status]) || DEFAULT_STATUS_BADGE;
  const StatusIcon = statusConfig.icon;

  const content = (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className={`flex h-full flex-col bg-white ${
        isMobilePage
          ? 'min-h-screen w-full p-4 sm:p-6'
          : 'w-full max-w-xl border-l border-zinc-200 shadow-2xl animate-in slide-in-from-right duration-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Receipt className="size-5" />
          </div>
          <div>
            <h2 id="drawer-title" className="text-base font-black tracking-tight text-zinc-900">
              {detail?.transaction_number || 'Detail Transaksi'}
            </h2>
            <p className="text-xs text-zinc-500">
              {detail?.receipt_number ? `Kuitansi: ${detail.receipt_number}` : 'Belum cetak kuitansi'}
            </p>
          </div>
        </div>

        {isMobilePage ? (
          <Link
            href="/penerimaan/transaksi"
            aria-label="Kembali ke daftar transaksi"
            className="grid size-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ArrowLeft className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail transaksi"
            className="grid size-9 place-items-center rounded-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {loading && (
          <div className="space-y-4 py-8">
            <div className="h-6 w-1/3 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-24 w-full animate-pulse rounded-2xl bg-zinc-50" />
            <div className="h-32 w-full animate-pulse rounded-2xl bg-zinc-50" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
            <AlertCircle className="size-8 text-rose-600" />
            <p className="mt-2 text-sm font-bold text-zinc-900">Gagal Memuat Transaksi</p>
            <p className="mt-1 text-xs text-zinc-600">{error}</p>
          </div>
        )}

        {detail && !loading && (
          <>
            {/* Status & Alerts Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4">
              <div>
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Status Saat Ini
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                  >
                    <StatusIcon className="size-3.5" />
                    {statusConfig.label}
                  </span>
                  {detail.is_flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                      <AlertTriangle className="size-3" />
                      Bendera Risiko
                    </span>
                  )}
                  {detail.is_manual && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                      Entri Manual
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Nominal Donasi
                </span>
                <p className="text-xl font-black text-zinc-900 tracking-tight">
                  {formatRupiah(detail.amount)}
                </p>
              </div>
            </div>

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 animate-in fade-in">
                {actionFeedback}
              </div>
            )}

            {/* Section 1: Muzakki / Donatur Info */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <User className="size-4 text-emerald-600" />
                Informasi Muzakki / Donatur
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-zinc-500">Nama Lengkap</span>
                  <p className="font-bold text-zinc-900">{detail.muzakki_name || 'Anonim / Hamba Allah'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Nomor Telepon / WA</span>
                  <p className="font-semibold text-zinc-800">{detail.muzakki_phone || '-'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Email</span>
                  <p className="font-semibold text-zinc-800">{detail.muzakki_email || '-'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Akun Petugas Pencatat</span>
                  <p className="font-semibold text-zinc-800">{detail.created_by_name || 'Sistem / Gateway'}</p>
                </div>
              </div>
            </div>

            {/* Section 2: Alokasi & Kanal */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <Coins className="size-4 text-emerald-600" />
                Kanal & Alokasi Dana
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <span className="text-zinc-500">Jenis Dana ZIS</span>
                  <p className="font-bold text-zinc-900">
                    {FUND_TYPE_DISPLAY[detail.fund_type] || detail.fund_type}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Kanal Penerimaan</span>
                  <p className="font-bold text-zinc-900">
                    {CHANNEL_DISPLAY[detail.channel] || detail.channel}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500">Metode Pembayaran</span>
                  <p className="font-semibold text-zinc-800">{detail.payment_method || detail.channel}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Referensi Provider / Mutasi</span>
                  <p className="font-mono text-zinc-800">{detail.provider_ref || '-'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Waktu Transaksi</span>
                  <p className="font-semibold text-zinc-800">{formatDate(detail.created_at)}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Net Penerimaan</span>
                  <p className="font-bold text-emerald-700">{formatRupiah(detail.net_amount || detail.amount)}</p>
                </div>
              </div>
            </div>

            {/* Section 3: Bukti Transaksi */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <FileText className="size-4 text-emerald-600" />
                Bukti Transfer & Verifikasi
              </h3>

              {detail.evidence_url ? (
                <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                      <FileText className="size-5" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900">Bukti_Transfer_{detail.transaction_number}.jpg</p>
                      <p className="text-[11px] text-zinc-500">Tersimpan di penyimpanan dokumen</p>
                    </div>
                  </div>
                  <a
                    href={detail.evidence_url}
                    onClick={handleEvidenceOpen}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-bold text-emerald-700 border border-zinc-200 shadow-2xs hover:bg-zinc-50"
                  >
                    <ExternalLink className="size-3.5" />
                    {openingEvidence ? 'Membuka…' : 'Lihat Bukti'}
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-4 text-center">
                  <p className="text-xs font-medium text-amber-800">
                    {detail.is_manual
                      ? 'Belum ada bukti transfer yang diunggah untuk transaksi kasir/jemput ini.'
                      : 'Transaksi digital otomatis tercatat tanpa lampiran file manual.'}
                  </p>
                </div>
              )}
            </div>

            {/* Section 4: Canonical Status Timeline */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <Layers className="size-4 text-emerald-600" />
                Linimasa Siklus Transaksi
              </h3>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
                {detail.timeline?.map((item, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-6 top-0.5 grid size-4 place-items-center rounded-full bg-emerald-600 ring-4 ring-white">
                      <span className="size-1.5 rounded-full bg-white" />
                    </span>
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-zinc-900">{item.status}</span>
                        <span className="text-[11px] text-zinc-400">{formatDate(item.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 mt-0.5">{item.notes}</p>
                      {item.actor_name && (
                        <p className="text-[10px] text-zinc-400 mt-0.5">Oleh: {item.actor_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Role-Aware Action Bar */}
      {detail && !loading && (
        <div className="border-t border-zinc-200 bg-zinc-50/70 p-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {/* Download BSZ PDF Receipt */}
            <button
              type="button"
              disabled={actionInProgress}
              onClick={async () => {
                setActionInProgress(true);
                try {
                  const blob = await penerimaanApi.downloadBszPdf(detail.id);
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `BSZ-${detail.transaction_number || detail.id}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  setActionFeedback('Bukti Setor Zakat (BSZ) PDF berhasil diunduh.');
                } catch (err: any) {
                  setError(err.message || 'Gagal mengunduh BSZ PDF');
                } finally {
                  setActionInProgress(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              <FileText className="size-4" />
              Unduh BSZ (PDF)
            </button>
            {/* Staff: Validate button when waiting validation */}
            {(isStaff || isAdmin) && detail.status === 'Menunggu Validasi' && (
              <button
                type="button"
                disabled={actionInProgress}
                onClick={async () => {
                  setActionInProgress(true);
                  try {
                    await penerimaanApi.validateTransaction(detail.id);
                    setActionFeedback('Transaksi berhasil diverifikasi.');
                    if (onStatusUpdated) onStatusUpdated();
                  } catch (err: any) {
                    setError(err.message || 'Gagal memvalidasi transaksi');
                  } finally {
                    setActionInProgress(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="size-4" />
                Validasi Transaksi
              </button>
            )}

            {/* Leader / Admin: Approve or Reject when waiting approval */}
            {(isLeader || isAdmin) && detail.status === 'Menunggu Approval' && (
              <>
                <button
                  type="button"
                  disabled={actionInProgress}
                  onClick={async () => {
                    setActionInProgress(true);
                    try {
                      await penerimaanApi.approveTransaction(detail.id);
                      setActionFeedback('Transaksi telah disetujui Kepala Bagian.');
                      if (onStatusUpdated) onStatusUpdated();
                    } catch (err: any) {
                      setError(err.message || 'Gagal menyetujui transaksi');
                    } finally {
                      setActionInProgress(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-purple-700 disabled:opacity-50"
                >
                  <ShieldCheck className="size-4" />
                  Setujui Transaksi
                </button>

                <button
                  type="button"
                  disabled={actionInProgress}
                  onClick={async () => {
                    const reason = prompt('Masukkan alasan penolakan transaksi:');
                    if (!reason) return;
                    setActionInProgress(true);
                    try {
                      await penerimaanApi.rejectTransaction(detail.id, { reason });
                      setActionFeedback('Transaksi berhasil ditolak.');
                      if (onStatusUpdated) onStatusUpdated();
                    } catch (err: any) {
                      setError(err.message || 'Gagal menolak transaksi');
                    } finally {
                      setActionInProgress(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <AlertTriangle className="size-4" />
                  Tolak Transaksi
                </button>
              </>
            )}

            {/* Leader / Admin: Reverse transaction when Posted */}
            {(isLeader || isAdmin) && detail.status === 'Posted' && (
              <button
                type="button"
                disabled={actionInProgress}
                onClick={async () => {
                  const reason = prompt('Masukkan alasan koreksi / reversal transaksi posted:');
                  if (!reason) return;
                  setActionInProgress(true);
                  try {
                    await penerimaanApi.reverseTransaction(detail.id, { reason });
                    setActionFeedback('Koreksi reversal transaksi berhasil diajukan.');
                    if (onStatusUpdated) onStatusUpdated();
                  } catch (err: any) {
                    setError(err.message || 'Gagal melakukan reversal');
                  } finally {
                    setActionInProgress(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
              >
                <RotateCcw className="size-4" />
                Koreksi / Reversal
              </button>
            )}

            {!isMobilePage && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isMobilePage) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 h-full">{content}</div>
    </div>
  );
}
