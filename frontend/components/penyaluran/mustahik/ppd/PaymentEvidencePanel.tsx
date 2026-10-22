'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type { CurrentUser } from '@/lib/api/types';
import type {
  P0DisbursementWorkspacePayload,
  P0PpdWorkspacePayload,
  PaymentRecordResponse,
  PpdDraft,
  PpdStatus,
} from '@/lib/api/penyaluran-p0-types';
import { formatRupiah } from '../shared/MoneyInput';

export interface PaymentEvidencePanelProps {
  mustahikId: number | string;
  ppd: PpdDraft | P0PpdWorkspacePayload;
  disbursement?: P0DisbursementWorkspacePayload | PaymentRecordResponse | null;
  paymentRecord?: PaymentRecordResponse | null;
  currentUserId?: number | string | null;
  currentUserRole?: string | null;
  currentUserLevel?: string | null;
  currentUserDivision?: string | null;
  currentUser?: CurrentUser | null;
  capabilities?: Record<string, boolean>;
  onPaymentRecorded?: (record: PaymentRecordResponse) => void;
  onPaymentVerified?: (record: PaymentRecordResponse) => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
  className?: string;
}

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function PaymentEvidencePanel({
  mustahikId,
  ppd,
  disbursement,
  paymentRecord,
  currentUserId: propUserId,
  currentUserRole: propUserRole,
  currentUserLevel: propUserLevel,
  currentUserDivision: propUserDivision,
  currentUser: propUser,
  capabilities,
  onPaymentRecorded,
  onPaymentVerified,
  onRefresh,
  readOnly = false,
  className = '',
}: PaymentEvidencePanelProps) {
  const auth = useAuth();
  const user = propUser || auth?.user || null;
  const currentUserId = propUserId !== undefined ? propUserId : user?.id ?? null;
  const role = propUserRole ?? user?.role ?? '';
  const level = propUserLevel ?? user?.level ?? '';
  const division = propUserDivision ?? (user as any)?.division ?? (user as any)?.department ?? '';

  const ppdId = (ppd as any).id;
  const ppdStatus = (ppd.status as PpdStatus) || 'finance_approved';
  const ppdAmount = Number((ppd as any).amount || (ppd as any).total_rab || 0);
  const ppdTrxNo = (ppd as any).transaction_number || '';

  // Merge payment info from either disbursement or paymentRecord props
  const existingPayment = paymentRecord || (disbursement as any);
  const isPaymentRecorded =
    ppdStatus === 'payment_recorded' ||
    ppdStatus === 'payment_verified' ||
    ppdStatus === 'recipient_confirmed' ||
    ppdStatus === 'completed' ||
    existingPayment?.verification_status === 'pending' ||
    existingPayment?.verification_status === 'verified';

  const isPaymentVerified =
    ppdStatus === 'payment_verified' ||
    ppdStatus === 'recipient_confirmed' ||
    ppdStatus === 'completed' ||
    existingPayment?.verification_status === 'verified';

  // Form State for Recording
  const [paidAmount, setPaidAmount] = useState<number>(ppdAmount);
  const [paidAt, setPaidAt] = useState<string>(() => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm
    return now.toISOString().slice(0, 16);
  });
  const [trxNumber, setTrxNumber] = useState<string>(ppdTrxNo);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Status & Errors
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Role checks: Admin is strictly segregated from routine payment actions
  const isAdmin =
    String(role).toLowerCase() === 'admin' ||
    String(level).toLowerCase() === 'admin' ||
    Boolean((user as any)?.isAdmin);

  const isFinanceDivision =
    (String(role).toLowerCase() === 'keuangan' ||
      String(division).toLowerCase() === 'keuangan') &&
    !isAdmin;

  // Segregation check for verification
  const recorderId = existingPayment?.recorded_by_id;
  const isSameAsRecorder =
    currentUserId !== null &&
    recorderId !== null &&
    recorderId !== undefined &&
    String(currentUserId) === String(recorderId);

  const canRecordPayment = useMemo(() => {
    if (readOnly) return false;
    if (isPaymentRecorded) return false;
    if (isAdmin) return false;
    if (capabilities && capabilities.payment_record !== undefined) {
      return Boolean(capabilities.payment_record);
    }
    return isFinanceDivision;
  }, [readOnly, isPaymentRecorded, isAdmin, capabilities, isFinanceDivision]);

  const canVerifyPayment = useMemo(() => {
    if (readOnly) return false;
    if (!isPaymentRecorded || isPaymentVerified) return false;
    if (isAdmin) return false;
    if (isSameAsRecorder) return false;
    if (capabilities && capabilities.payment_verify !== undefined) {
      return Boolean(capabilities.payment_verify) && !isSameAsRecorder;
    }
    return isFinanceDivision;
  }, [readOnly, isPaymentRecorded, isPaymentVerified, isAdmin, isSameAsRecorder, capabilities, isFinanceDivision]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate MIME
    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      setValidationErrors((prev) => ({
        ...prev,
        proof: 'Format berkas tidak didukung. Harap unggah PDF, JPEG, atau PNG.',
      }));
      setFile(null);
      setFilePreview(null);
      return;
    }

    // Validate size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setValidationErrors((prev) => ({
        ...prev,
        proof: 'Ukuran berkas melebihi batas maksimal 10 MB.',
      }));
      setFile(null);
      setFilePreview(null);
      return;
    }

    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next.proof;
      return next;
    });

    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errors: Record<string, string> = {};

    // Exact amount match rule
    if (paidAmount !== ppdAmount) {
      errors.paid_amount = `Nilai pembayaran (${formatRupiah(paidAmount)}) harus sama persis dengan nilai PPD yang disetujui (${formatRupiah(ppdAmount)}).`;
    }

    if (!trxNumber.trim()) {
      errors.transaction_number = 'Nomor transaksi bank wajib diisi.';
    }

    if (!paidAt) {
      errors.paid_at = 'Waktu transfer pembayaran wajib diisi.';
    }

    if (!file) {
      errors.proof = 'Berkas bukti transfer wajib diunggah.';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('proof', file!);
      formData.append('paid_amount', String(paidAmount));
      formData.append('paid_at', new Date(paidAt).toISOString());
      formData.append('transaction_number', trxNumber.trim());

      const res = await api.recordPaymentProof(mustahikId, ppdId, formData);
      if (res.data) onPaymentRecorded?.(res.data);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setServerError(err.message || 'Gagal menyimpan bukti pembayaran.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!ppdId) return;
    setIsVerifying(true);
    setServerError(null);

    try {
      const res = await api.verifyPayment(mustahikId, ppdId);
      if (res.data) onPaymentVerified?.(res.data);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setServerError(err.message || 'Gagal memverifikasi bukti pembayaran.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
              Penyaluran Dana
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              Bukti Transfer & Verifikasi Pencairan
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pencatatan bukti transfer bank dan verifikasi independen penyaluran dana mustahik.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Nominal Disetujui:</span>
          <span className="font-mono text-sm font-black text-emerald-800">
            {formatRupiah(ppdAmount)}
          </span>
        </div>
      </div>

      {serverError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span>{serverError}</span>
          </div>
        </div>
      )}

      {/* STAGE A: Upload / Record Payment Proof (Active when finance_approved) */}
      {!isPaymentRecorded && (
        isAdmin ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 space-y-2 text-xs text-amber-800">
            <div className="flex items-start gap-2 font-bold text-amber-900">
              <ShieldAlert className="size-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Pemisahan Kewenangan (Segregation of Duties)</span>
            </div>
            <p>
              Akun Administrator tidak dapat mencatat bukti transfer pembayaran rutin. Pencatatan pembayaran hanya dapat dilakukan oleh staf Divisi Keuangan.
            </p>
          </div>
        ) : !isFinanceDivision ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs text-slate-600">
            Pencatatan pembayaran hanya dapat dilakukan oleh staf Divisi Keuangan.
          </div>
        ) : (
          <form onSubmit={handleRecordPayment} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Upload className="size-4 text-emerald-600" aria-hidden="true" />
            Catat Pembayaran & Unggah Bukti Transfer
          </h4>

          <div className="grid gap-4 sm:grid-cols-3">
            {/* Paid Amount */}
            <div className="space-y-1">
              <label htmlFor="paid-amount" className="text-xs font-bold text-slate-700">
                Nominal Pembayaran (Rp) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id="paid-amount"
                value={paidAmount ? paidAmount.toLocaleString('id-ID') : ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setPaidAmount(digits ? parseInt(digits, 10) : 0);
                }}
                className={`w-full rounded-xl border px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  validationErrors.paid_amount
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
              {validationErrors.paid_amount && (
                <p className="text-[11px] font-semibold text-rose-600">{validationErrors.paid_amount}</p>
              )}
            </div>

            {/* Transfer Date */}
            <div className="space-y-1">
              <label htmlFor="paid-at" className="text-xs font-bold text-slate-700">
                Waktu Transfer Bank <span className="text-rose-600">*</span>
              </label>
              <input
                type="datetime-local"
                id="paid-at"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className={`w-full rounded-xl border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  validationErrors.paid_at
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
              {validationErrors.paid_at && (
                <p className="text-[11px] font-semibold text-rose-600">{validationErrors.paid_at}</p>
              )}
            </div>

            {/* Bank Transaction Number */}
            <div className="space-y-1">
              <label htmlFor="trx-number" className="text-xs font-bold text-slate-700">
                No. Transaksi Bank / Ref <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                id="trx-number"
                value={trxNumber}
                onChange={(e) => setTrxNumber(e.target.value)}
                placeholder="TRX-..."
                className={`w-full rounded-xl border px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  validationErrors.transaction_number
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
              {validationErrors.transaction_number && (
                <p className="text-[11px] font-semibold text-rose-600">{validationErrors.transaction_number}</p>
              )}
            </div>
          </div>

          {/* File Upload Box */}
          <div className="space-y-2">
            <label htmlFor="proof-file" className="text-xs font-bold text-slate-700">
              Berkas Bukti Transfer (PDF / JPEG / PNG, Maks 10 MB) <span className="text-rose-600">*</span>
            </label>
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-emerald-400 bg-slate-50/50 transition-colors">
              <input
                type="file"
                id="proof-file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handleFileChange}
                className="sr-only"
              />
              <label
                htmlFor="proof-file"
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
              >
                <Upload className="size-4" aria-hidden="true" />
                Pilih Berkas Bukti Transfer
              </label>
              <p className="mt-2 text-xs text-slate-500">
                {file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : 'Belum ada berkas dipilih.'}
              </p>
            </div>
            {validationErrors.proof && (
              <p className="text-[11px] font-semibold text-rose-600">{validationErrors.proof}</p>
            )}

            {/* Thumbnail preview if image */}
            {filePreview && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2 max-w-xs">
                <img
                  src={filePreview}
                  alt="Pratinjau Bukti Transfer"
                  className="max-h-48 rounded-lg object-contain mx-auto"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              Simpan Bukti Pembayaran
            </button>
          </div>
        </form>
        )
      )}

      {/* STAGE B: Payment Evidence Recorded & Verification */}
      {isPaymentRecorded && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <FileCheck2 className="size-4 text-emerald-600" aria-hidden="true" />
              Bukti Transfer Tersimpan
            </h4>
            {isPaymentVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Terverifikasi
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-800">
                Menunggu Verifikasi Independen
              </span>
            )}
          </div>

          {/* Details Card */}
          <div className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500">Nominal Transfer:</span>
              <p className="font-mono text-sm font-bold text-slate-900">
                {formatRupiah(existingPayment?.paid_amount || ppdAmount)}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">No. Transaksi Bank:</span>
              <p className="font-mono text-sm font-bold text-slate-900">
                {existingPayment?.transaction_number || ppdTrxNo || '-'}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Waktu Transfer:</span>
              <p className="font-bold text-slate-900">
                {existingPayment?.paid_at ? new Date(existingPayment.paid_at).toLocaleString('id-ID') : '-'}
              </p>
            </div>
          </div>

          {/* Proof Hash and Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Hash className="size-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span className="font-semibold">Integritas Berkas (SHA-256):</span>
              <span className="font-mono font-bold text-slate-900" title={existingPayment?.snapshot_hash || existingPayment?.proof_sha256}>
                {existingPayment?.snapshot_hash
                  ? `${existingPayment.snapshot_hash.slice(0, 16)}...`
                  : existingPayment?.proof_sha256
                  ? `${existingPayment.proof_sha256.slice(0, 16)}...`
                  : 'Tersedia di server'}
              </span>
            </div>
          </div>

          {/* Verification Actions */}
          {!isPaymentVerified && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              {isSameAsRecorder ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Pemisahan Peran: Petugas yang mencatat pembayaran tidak dapat memverifikasi pembayarannya sendiri. Diperlukan petugas keuangan independen.
                    </span>
                  </div>
                </div>
              ) : isAdmin ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Akun Administrator tidak dapat memverifikasi pembayaran rutin (pemisahan kewenangan). Diperlukan petugas Divisi Keuangan.
                    </span>
                  </div>
                </div>
              ) : !isFinanceDivision ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Verifikasi pembayaran hanya dapat dilakukan oleh Divisi Keuangan.
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleVerifyPayment}
                    disabled={isVerifying || !canVerifyPayment}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    )}
                    Verifikasi Bukti & Transaksi Transfer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PaymentEvidencePanel;
