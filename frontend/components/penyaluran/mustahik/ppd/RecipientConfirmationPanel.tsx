'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Loader2,
  Phone,
  Send,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  ConfirmationMethod,
  P0CompletionWorkspacePayload,
  P0PpdWorkspacePayload,
  PpdDraft,
  RecipientConfirmationPayload,
  RecipientConfirmationResponse,
} from '@/lib/api/penyaluran-p0-types';

export interface RecipientConfirmationPanelProps {
  mustahikId: number | string;
  ppd: PpdDraft | P0PpdWorkspacePayload;
  recipientNameSnapshot?: string | null;
  mustahikName?: string | null;
  completion?: P0CompletionWorkspacePayload | RecipientConfirmationResponse | null;
  confirmationRecord?: RecipientConfirmationResponse | null;
  onConfirmed?: (record: RecipientConfirmationResponse) => void;
  onRefresh?: () => Promise<void> | void;
  readOnly?: boolean;
  className?: string;
}

export const CONFIRMATION_METHODS: Array<{ id: ConfirmationMethod; label: string; icon: typeof Users }> = [
  { id: 'Tatap Muka', label: 'Tatap Muka Langsung', icon: Users },
  { id: 'Tanda Terima', label: 'Tanda Terima / Slip Tertulis', icon: FileCheck2 },
  { id: 'WhatsApp', label: 'WhatsApp Messenger', icon: Phone },
  { id: 'Telepon', label: 'Panggilan Telepon', icon: Phone },
];

export function RecipientConfirmationPanel({
  mustahikId,
  ppd,
  recipientNameSnapshot,
  mustahikName,
  completion,
  confirmationRecord,
  onConfirmed,
  onRefresh,
  readOnly: propReadOnly = false,
  className = '',
}: RecipientConfirmationPanelProps) {
  const ppdId = (ppd as any).id;
  const existingConfirmation = confirmationRecord || (completion as any);
  const isConfirmed =
    (ppd as any).status === 'recipient_confirmed' ||
    (ppd as any).status === 'completed' ||
    existingConfirmation?.status === 'confirmed' ||
    existingConfirmation?.status === 'completed' ||
    Boolean(existingConfirmation?.confirmed_at);

  const authoritativeRecipientName =
    recipientNameSnapshot ||
    mustahikName ||
    (ppd as any).bank_account_name ||
    'Mustahik Penerima';

  // Form State
  const [method, setMethod] = useState<ConfirmationMethod>('Tatap Muka');
  const [confirmedAt, setConfirmedAt] = useState<string>(() => {
    return new Date().toISOString().slice(0, 16);
  });
  const [note, setNote] = useState<string>('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const trimmedNoteLength = note.trim().length;
  const isNoteValid = trimmedNoteLength >= 10 && trimmedNoteLength <= 1000;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        file: 'Format bukti tidak didukung. Harap gunakan PDF, JPEG, atau PNG.',
      }));
      setEvidenceFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFieldErrors((prev) => ({
        ...prev,
        file: 'Ukuran berkas maksimal 10 MB.',
      }));
      setEvidenceFile(null);
      return;
    }

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.file;
      return next;
    });
    setEvidenceFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errs: Record<string, string> = {};

    if (!method) {
      errs.method = 'Metode konfirmasi penerima wajib dipilih.';
    }

    if (!confirmedAt) {
      errs.confirmed_at = 'Waktu konfirmasi wajib diisi.';
    }

    if (!isNoteValid) {
      errs.note = 'Catatan konfirmasi wajib diisi antara 10 hingga 1000 karakter.';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const payload: RecipientConfirmationPayload = {
        method,
        recipient_name_snapshot: authoritativeRecipientName,
        confirmed_at: new Date(confirmedAt).toISOString(),
        note: note.trim(),
        evidence_file: evidenceFile || undefined,
      };

      const res = await api.recordRecipientConfirmation(mustahikId, ppdId, payload);
      if (res.data) onConfirmed?.(res.data);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan konfirmasi penerima.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
              Verifikasi Lapangan
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              Konfirmasi Tanda Terima Mustahik
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pencatatan konfirmasi bahwa dana atau manfaat bantuan telah benar-benar diterima oleh mustahik.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Penerima Manfaat:</span>
          <span className="text-xs font-extrabold text-slate-900">
            {authoritativeRecipientName}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* If already confirmed, render summary card */}
      {isConfirmed ? (
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            <h4 className="text-sm font-extrabold">Tanda Terima Berhasil Dikonfirmasi</h4>
          </div>

          <div className="grid gap-3 rounded-xl border border-emerald-100 bg-white p-4 sm:grid-cols-3 text-xs">
            <div>
              <span className="font-semibold text-slate-500">Nama Penerima (Snapshot):</span>
              <p className="font-bold text-slate-900">
                {existingConfirmation?.recipient_name_snapshot || existingConfirmation?.recipient_name || authoritativeRecipientName}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Metode Konfirmasi:</span>
              <p className="font-bold text-slate-900">{existingConfirmation?.method || 'Tatap Muka'}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Waktu Konfirmasi:</span>
              <p className="font-bold text-slate-900">
                {existingConfirmation?.confirmed_at
                  ? new Date(existingConfirmation.confirmed_at).toLocaleString('id-ID')
                  : '-'}
              </p>
            </div>
          </div>

          {existingConfirmation?.note && (
            <div className="rounded-xl border border-emerald-100 bg-white p-3 text-xs text-slate-800">
              <span className="font-bold text-slate-600">Catatan Lapangan: </span>
              <span>{existingConfirmation.note}</span>
            </div>
          )}
        </div>
      ) : (
        /* Form for entering confirmation */
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
          {/* Recipient Name Snapshot */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Nama Penerima Manfaat (Terkunci Sesuai Berkas)
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-extrabold text-slate-900">
              <User className="size-4 text-slate-500 shrink-0" aria-hidden="true" />
              <span>{authoritativeRecipientName}</span>
            </div>
          </div>

          {/* Confirmation Method & Date */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Method */}
            <div className="space-y-2">
              <label htmlFor="confirm-method" className="text-xs font-bold text-slate-700">
                Metode Konfirmasi Penerimaan <span className="text-rose-600">*</span>
              </label>
              <select
                id="confirm-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as ConfirmationMethod)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
              >
                {CONFIRMATION_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {fieldErrors.method && (
                <p className="text-[11px] font-semibold text-rose-600">{fieldErrors.method}</p>
              )}
            </div>

            {/* Confirmed At */}
            <div className="space-y-2">
              <label htmlFor="confirmed-at" className="text-xs font-bold text-slate-700">
                Waktu Konfirmasi Lapangan <span className="text-rose-600">*</span>
              </label>
              <input
                type="datetime-local"
                id="confirmed-at"
                value={confirmedAt}
                onChange={(e) => setConfirmedAt(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
              />
              {fieldErrors.confirmed_at && (
                <p className="text-[11px] font-semibold text-rose-600">{fieldErrors.confirmed_at}</p>
              )}
            </div>
          </div>

          {/* Field Note (10 to 1000 chars) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="confirm-note" className="text-xs font-bold text-slate-700">
                Catatan Konfirmasi Operasional <span className="text-rose-600">*</span>
              </label>
              <span className={`text-[11px] font-mono font-semibold ${isNoteValid ? 'text-slate-500' : 'text-rose-600'}`}>
                {trimmedNoteLength} / 1000 karakter {trimmedNoteLength < 10 && `(kurang ${10 - trimmedNoteLength})`}
              </span>
            </div>
            <textarea
              id="confirm-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Jelaskan proses serah terima dana/bantuan kepada mustahik, kondisi penerima, atau keterangan dokumen tanda terima..."
              className={`w-full rounded-xl border p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 ${
                fieldErrors.note || (note.length > 0 && !isNoteValid)
                  ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
              }`}
            />
            {fieldErrors.note && (
              <p className="text-[11px] font-semibold text-rose-600">{fieldErrors.note}</p>
            )}
          </div>

          {/* Optional Evidence File */}
          <div className="space-y-2">
            <label htmlFor="evidence-file" className="text-xs font-bold text-slate-700">
              Lampiran Bukti Fisik / Dokumentasi Penyerahan (Opsional, PDF/JPEG/PNG &le; 10 MB)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                id="evidence-file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              />
            </div>
            {evidenceFile && (
              <p className="text-xs text-slate-600">
                Terpilih: <strong>{evidenceFile.name}</strong> ({(evidenceFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
            {fieldErrors.file && (
              <p className="text-[11px] font-semibold text-rose-600">{fieldErrors.file}</p>
            )}
          </div>

          {/* Submit Action */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !isNoteValid}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              Catat Konfirmasi Penerimaan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default RecipientConfirmationPanel;
