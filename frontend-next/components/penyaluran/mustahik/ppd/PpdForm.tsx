'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileText,
  Loader2,
  Lock,
  Save,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  FundSource,
  PaymentType,
  PpdDraft,
  PpdSourceFields,
  RabLine,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { FieldErrorSummary } from '../shared/FieldErrorSummary';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';
import { formatRupiah, numberToTerbilang } from '../shared/MoneyInput';
import { RabLineEditor } from './RabLineEditor';

export interface PpdFormProps {
  mustahikId: number | string;
  initialDraft?: PpdDraft | null;
  initialFields?: Partial<PpdSourceFields> | null;
  mpzisAllocation?: number | null;
  onSaved?: (draft: PpdDraft) => void;
  onSubmitted?: (draft: PpdDraft) => void;
  readOnly?: boolean;
  className?: string;
  isLegacy?: boolean;
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const FUND_SOURCE_OPTIONS: FundSource[] = [
  'Zakat',
  'Infaq/Shodaqoh',
  'DSKL',
  'Hibah',
];

export const PAYMENT_TYPE_OPTIONS: PaymentType[] = [
  'Pembayaran',
  'Uang Muka',
  'Reimbursement',
  'Lain-lain',
];

export interface PpdFormData {
  form_number: string;
  ppd_number: string;
  transaction_number: string;
  purpose: string;
  fund_source: FundSource | '';
  fund_source_confirmed: boolean;
  payment_type: PaymentType | '';
  payment_type_confirmed: boolean;
  payment_type_other: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_account_masked?: string;
  rab_lines: RabLine[];
  note?: string;
}

export function extractInitialPpdData(
  draft?: PpdDraft | null,
  fields?: Partial<PpdSourceFields> | null
): PpdFormData {
  const source = {
    ...draft,
    ...(draft?.source_fields || {}),
    ...(fields || {}),
  };

  const initialRab: RabLine[] =
    Array.isArray(draft?.rab_lines) && draft.rab_lines.length > 0
      ? draft.rab_lines.map((l, i) => {
          const quantity = Number(l.jumlah ?? 1) || 1;
          const unitPrice =
            Number(
              l.harga_satuan ??
                (Number(l.amount ?? l.total ?? 0) / quantity)
            ) || 0;

          return {
            ...l,
            line_no: l.line_no || i + 1,
            register_number: l.register_number || `RAB-0${i + 1}`,
            description: l.description || l.deskripsi || '',
            deskripsi: l.deskripsi || l.description || '',
            jumlah: quantity,
            harga_satuan: unitPrice,
            total: l.total !== undefined && l.total !== null ? Number(l.total) : quantity * unitPrice,
            amount: l.amount !== undefined ? l.amount : quantity * unitPrice,
          };
        })
      : [
          {
            line_no: 1,
            register_number: 'RAB-01',
            description: '',
            deskripsi: '',
            jumlah: 1,
            harga_satuan: 0,
            total: 0,
            amount: 0,
          },
        ];

  return {
    form_number: source.form_number || 'F-PKP/03',
    ppd_number: source.ppd_number || '',
    transaction_number: source.transaction_number || '',
    purpose: source.purpose || '',
    fund_source: (source.fund_source as FundSource) || 'Zakat',
    fund_source_confirmed: Boolean(source.fund_source_confirmed),
    payment_type: (source.payment_type as PaymentType) || 'Pembayaran',
    payment_type_confirmed: Boolean(source.payment_type_confirmed),
    payment_type_other: source.payment_type_other || '',
    bank_name: source.bank_name || '',
    bank_account_name: source.bank_account_name || '',
    bank_account_number: draft?.bank_account_number || '',
    bank_account_masked: source.bank_account_masked || '',
    rab_lines: initialRab,
    note: draft?.note || '',
  };
}

export function PpdForm({
  mustahikId,
  initialDraft,
  initialFields,
  mpzisAllocation,
  onSaved,
  onSubmitted,
  readOnly: propReadOnly = false,
  className = '',
  isLegacy = false,
}: PpdFormProps) {
  const isDraftSubmitted =
    initialDraft?.status &&
    initialDraft.status !== 'draft' &&
    initialDraft.status !== 'returned';

  const readOnly = propReadOnly || Boolean(isDraftSubmitted) || isLegacy;

  const [draftId, setDraftId] = useState<number | undefined>(initialDraft?.id);
  const [formData, setFormData] = useState<PpdFormData>(() =>
    extractInitialPpdData(initialDraft, initialFields)
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(null);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);

  // Sync when initialDraft or initialFields updates externally
  useEffect(() => {
    if (initialDraft?.id) {
      setDraftId(initialDraft.id);
    }
    setFormData(extractInitialPpdData(initialDraft, initialFields));
  }, [initialDraft, initialFields]);

  // Grand Total calculation
  const grandTotal = useMemo(() => {
    return formData.rab_lines.reduce((sum, line) => {
      const vol = Number(line.jumlah ?? 1) || 1;
      const unit = Number(line.harga_satuan ?? 0) || 0;
      const rowTotal = line.total !== undefined ? Number(line.total) : vol * unit;
      return sum + rowTotal;
    }, 0);
  }, [formData.rab_lines]);

  const terbilangText = useMemo(() => {
    return numberToTerbilang(grandTotal);
  }, [grandTotal]);

  const isCeilingExceeded = useMemo(() => {
    if (mpzisAllocation === null || mpzisAllocation === undefined) return false;
    return grandTotal > mpzisAllocation;
  }, [grandTotal, mpzisAllocation]);

  // Validation function
  const validateForm = useCallback((data: PpdFormData): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (!data.purpose || data.purpose.trim().length < 5) {
      errs.purpose = 'Keperluan/tujuan pengajuan wajib diisi minimal 5 karakter.';
    }

    if (!data.fund_source) {
      errs.fund_source = 'Sumber dana wajib dipilih.';
    }

    if (!data.fund_source_confirmed) {
      errs.fund_source_confirmed = 'Konfirmasi kesesuaian sumber dana wajib dicentang.';
    }

    if (!data.payment_type) {
      errs.payment_type = 'Jenis pembayaran wajib dipilih.';
    }

    if (data.payment_type === 'Lain-lain') {
      const other = data.payment_type_other?.trim() || '';
      if (other.length < 3 || other.length > 150) {
        errs.payment_type_other = 'Keterangan jenis pembayaran lain-lain wajib diisi antara 3–150 karakter.';
      }
    }

    if (!data.payment_type_confirmed) {
      errs.payment_type_confirmed = 'Konfirmasi jenis pembayaran wajib dicentang.';
    }

    if (!data.bank_name || !data.bank_name.trim()) {
      errs.bank_name = 'Nama bank penyaluran wajib diisi.';
    }

    if (!data.bank_account_name || !data.bank_account_name.trim()) {
      errs.bank_account_name = 'Nama pemilik rekening wajib diisi.';
    }

    if (!data.bank_account_number && !data.bank_account_masked) {
      errs.bank_account_number = 'Nomor rekening bank wajib diisi.';
    }

    if (!Array.isArray(data.rab_lines) || data.rab_lines.length < 1 || data.rab_lines.length > 3) {
      errs.rab_lines = 'RAB harus memiliki 1 sampai 3 baris.';
    } else {
      data.rab_lines.forEach((line, idx) => {
        if (!line.description && !line.deskripsi) {
          errs[`rab_lines.${idx}.description`] = `Uraian pada baris ke-${idx + 1} wajib diisi.`;
        }
        const unit = Number(line.harga_satuan ?? 0);
        if (unit <= 0) {
          errs[`rab_lines.${idx}.amount`] = `Harga satuan pada baris ke-${idx + 1} harus lebih dari Rp 0.`;
        }
      });
    }

    const currentTotal = data.rab_lines.reduce((acc, line) => {
      return acc + (Number(line.jumlah ?? 1) || 1) * (Number(line.harga_satuan ?? 0) || 0);
    }, 0);

    if (currentTotal <= 0) {
      errs.grandTotal = 'Total RAB harus lebih dari Rp 0.';
    }

    if (mpzisAllocation !== null && mpzisAllocation !== undefined && currentTotal > mpzisAllocation) {
      errs.grandTotal = `Total RAB (${formatRupiah(currentTotal)}) melebihi batas pagu MPZIS yang disetujui (${formatRupiah(mpzisAllocation)}).`;
    }

    return errs;
  }, [mpzisAllocation]);

  // Debounced autosave (800ms)
  const triggerAutosave = useCallback(
    (currentData: PpdFormData) => {
      if (readOnly) return;

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      setAutosaveStatus('saving');

      autosaveTimerRef.current = setTimeout(async () => {
        try {
          const payload: Partial<PpdDraft> = {
            form_number: currentData.form_number || 'F-PKP/03',
            ppd_number: currentData.ppd_number || undefined,
            transaction_number: currentData.transaction_number || undefined,
            purpose: currentData.purpose,
            fund_source: (currentData.fund_source as FundSource) || undefined,
            fund_source_confirmed: currentData.fund_source_confirmed,
            payment_type: (currentData.payment_type as PaymentType) || undefined,
            payment_type_confirmed: currentData.payment_type_confirmed,
            payment_type_other: currentData.payment_type === 'Lain-lain' ? currentData.payment_type_other : null,
            bank_name: currentData.bank_name,
            bank_account_name: currentData.bank_account_name,
            bank_account_number: currentData.bank_account_number || undefined,
            rab_lines: currentData.rab_lines.map((line, idx) => ({
              line_no: idx + 1,
              register_number: line.register_number || `RAB-0${idx + 1}`,
              description: line.description || line.deskripsi || '',
              amount: (Number(line.jumlah ?? 1) || 1) * (Number(line.harga_satuan ?? 0) || 0),
            })),
          };

          let res;
          if (draftId) {
            res = await api.savePpdDraft(mustahikId, draftId, payload);
          } else {
            res = await api.createPpdDraft(mustahikId, payload);
            if (res.data?.id) {
              setDraftId(res.data.id);
            }
          }

          setAutosaveStatus('saved');
          setLastSavedTimestamp(new Date().toLocaleTimeString('id-ID'));
          if (res.data) {
            onSaved?.(res.data);
          }
        } catch (err) {
          setAutosaveStatus('error');
        }
      }, 800);
    },
    [draftId, mustahikId, onSaved, readOnly]
  );

  // Field change handler
  const handleChange = <K extends keyof PpdFormData>(field: K, value: PpdFormData[K]) => {
    if (readOnly) return;

    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'payment_type' && value !== 'Lain-lain') {
        next.payment_type_other = '';
      }
      triggerAutosave(next);
      return next;
    });

    if (errors[field as string]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field as string];
        return next;
      });
    }
  };

  const handleRabChange = (newLines: RabLine[]) => {
    if (readOnly) return;
    handleChange('rab_lines', newLines);
  };

  const handleSubmitClick = () => {
    if (readOnly) return;
    const formErrors = validateForm(formData);
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setErrors({});
    setSubmitError(null);
    setIsSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (readOnly) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload: Partial<PpdDraft> = {
        form_number: formData.form_number || 'F-PKP/03',
        ppd_number: formData.ppd_number || undefined,
        transaction_number: formData.transaction_number || undefined,
        purpose: formData.purpose,
        fund_source: formData.fund_source as FundSource,
        fund_source_confirmed: formData.fund_source_confirmed,
        payment_type: formData.payment_type as PaymentType,
        payment_type_confirmed: formData.payment_type_confirmed,
        payment_type_other: formData.payment_type === 'Lain-lain' ? formData.payment_type_other : null,
        bank_name: formData.bank_name,
        bank_account_name: formData.bank_account_name,
        bank_account_number: formData.bank_account_number || undefined,
        rab_lines: formData.rab_lines.map((line, idx) => ({
          line_no: idx + 1,
          register_number: line.register_number || `RAB-0${idx + 1}`,
          description: line.description || line.deskripsi || '',
          amount: (Number(line.jumlah ?? 1) || 1) * (Number(line.harga_satuan ?? 0) || 0),
        })),
      };

      let activeId = draftId;
      if (!activeId) {
        const created = await api.createPpdDraft(mustahikId, payload);
        activeId = created.data?.id;
        setDraftId(activeId);
      }

      if (!activeId) {
        throw new Error('Gagal menyiapkan draf PPD untuk diajukan.');
      }

      const res = await api.submitPpd(mustahikId, activeId, payload);
      setIsSubmitDialogOpen(false);
      if (res.data) {
        onSubmitted?.(res.data);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal mengirimkan pengajuan PPD.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Form Title & Metadata Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
              {formData.form_number || 'F-PKP/03'}
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">
              Pengajuan Pencairan Dana (PPD)
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Formulir F-PKP/03 permohonan pencairan dana program pendayagunaan dan pendistribusian BAZNAS.
          </p>
        </div>

        {/* Autosave Status Indicator */}
        {!readOnly && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs font-semibold text-slate-600"
          >
            {autosaveStatus === 'saving' && (
              <>
                <Loader2 className="size-4 animate-spin text-emerald-600" aria-hidden="true" />
                <span className="text-emerald-700">Menyimpan...</span>
              </>
            )}
            {autosaveStatus === 'saved' && (
              <>
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                <span className="text-slate-600">
                  Tersimpan {lastSavedTimestamp ? `pukul ${lastSavedTimestamp}` : 'otomatis'}
                </span>
              </>
            )}
            {autosaveStatus === 'error' && (
              <span className="text-rose-600">Gagal disimpan otomatis</span>
            )}
          </div>
        )}
      </div>

      {/* Field Error Summary */}
      <FieldErrorSummary errors={errors} />

      {/* Form Identifiers Header */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3 text-xs">
        <div>
          <label htmlFor="ppd-form-number" className="font-bold text-slate-600">
            Nomor Formulir
          </label>
          <input
            id="ppd-form-number"
            type="text"
            readOnly
            value={formData.form_number}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800"
          />
        </div>
        <div>
          <label htmlFor="ppd-number" className="font-bold text-slate-600">
            Nomor PPD
          </label>
          <input
            id="ppd-number"
            type="text"
            readOnly={readOnly}
            value={formData.ppd_number}
            onChange={(e) => handleChange('ppd_number', e.target.value)}
            placeholder="Otomatis / PPD-2026-..."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label htmlFor="ppd-trx-number" className="font-bold text-slate-600">
            Nomor Transaksi
          </label>
          <input
            id="ppd-trx-number"
            type="text"
            readOnly={readOnly}
            value={formData.transaction_number}
            onChange={(e) => handleChange('transaction_number', e.target.value)}
            placeholder="Otomatis / TRX-..."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>
      </div>

      {/* Section 1: Keperluan & Parameter Pembayaran */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <FileText className="size-4 text-emerald-600" aria-hidden="true" />
          1. Keperluan dan Parameter Pembayaran
        </h4>

        {/* Purpose */}
        <div className="space-y-1">
          <label htmlFor="ppd-purpose" className="text-xs font-bold text-slate-700">
            Tujuan / Keperluan Pencairan <span className="text-rose-600">*</span>
          </label>
          {readOnly ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 font-medium">
              {displaySourceValue(formData.purpose)}
            </div>
          ) : (
            <textarea
              id="ppd-purpose"
              name="purpose"
              rows={3}
              value={formData.purpose}
              onChange={(e) => handleChange('purpose', e.target.value)}
              placeholder="Jelaskan secara spesifik peruntukan dana dan mustahik penerima manfaat..."
              className={`w-full rounded-xl border p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 ${
                errors.purpose
                  ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                  : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
              }`}
            />
          )}
          {errors.purpose && <p className="text-[11px] font-semibold text-rose-600">{errors.purpose}</p>}
        </div>

        {/* Fund Source & Payment Type */}
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          {/* Fund Source */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
            <label htmlFor="ppd-fund-source" className="text-xs font-bold text-slate-800">
              Sumber Dana <span className="text-rose-600">*</span>
            </label>
            {readOnly ? (
              <p className="font-semibold text-slate-900 text-xs">{formData.fund_source}</p>
            ) : (
              <select
                id="ppd-fund-source"
                name="fund_source"
                value={formData.fund_source}
                onChange={(e) => handleChange('fund_source', e.target.value as FundSource)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
              >
                {FUND_SOURCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {/* Fund Source Confirmation Checkbox */}
            <div className="pt-1">
              <label className="flex items-start gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  id="fund_source_confirmed"
                  name="fund_source_confirmed"
                  checked={formData.fund_source_confirmed}
                  disabled={readOnly}
                  onChange={(e) => handleChange('fund_source_confirmed', e.target.checked)}
                  className="size-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Saya mengonfirmasi bahwa sumber dana telah diverifikasi sesuai ketentuan syariah dan asnaf.</span>
              </label>
              {errors.fund_source_confirmed && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{errors.fund_source_confirmed}</p>
              )}
            </div>
          </div>

          {/* Payment Type */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
            <label htmlFor="ppd-payment-type" className="text-xs font-bold text-slate-800">
              Jenis Pembayaran <span className="text-rose-600">*</span>
            </label>
            {readOnly ? (
              <p className="font-semibold text-slate-900 text-xs">
                {formData.payment_type}
                {formData.payment_type === 'Lain-lain' && formData.payment_type_other && (
                  <span className="text-slate-500"> ({formData.payment_type_other})</span>
                )}
              </p>
            ) : (
              <select
                id="ppd-payment-type"
                name="payment_type"
                value={formData.payment_type}
                onChange={(e) => handleChange('payment_type', e.target.value as PaymentType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[44px]"
              >
                {PAYMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {/* Conditional 'Lain-lain' input */}
            {formData.payment_type === 'Lain-lain' && !readOnly && (
              <div className="space-y-1 pt-1">
                <label htmlFor="ppd-payment-type-other" className="text-[11px] font-bold text-slate-700">
                  Rincian Jenis Pembayaran Lain-lain <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  id="ppd-payment-type-other"
                  name="payment_type_other"
                  value={formData.payment_type_other}
                  onChange={(e) => handleChange('payment_type_other', e.target.value)}
                  placeholder="Misal: Pemindahbukuan Antar Kas"
                  className={`w-full rounded-lg border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[40px] ${
                    errors.payment_type_other
                      ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                      : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                  }`}
                />
                {errors.payment_type_other && (
                  <p className="text-[11px] font-semibold text-rose-600">{errors.payment_type_other}</p>
                )}
              </div>
            )}

            {/* Payment Type Confirmation Checkbox */}
            <div className="pt-1">
              <label className="flex items-start gap-2 text-[11px] font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  id="payment_type_confirmed"
                  name="payment_type_confirmed"
                  checked={formData.payment_type_confirmed}
                  disabled={readOnly}
                  onChange={(e) => handleChange('payment_type_confirmed', e.target.checked)}
                  className="size-4 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Saya mengonfirmasi jenis pembayaran ini telah sesuai dengan dokumen pendukung.</span>
              </label>
              {errors.payment_type_confirmed && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600">{errors.payment_type_confirmed}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Rekening Bank Penerima */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <CreditCard className="size-4 text-emerald-600" aria-hidden="true" />
          2. Rekening Bank Penerima Manfaat
        </h4>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Bank Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="ppd-bank-name" className="text-xs font-bold text-slate-700">
                Nama Bank <span className="text-rose-600">*</span>
              </label>
              {formData.bank_name && (
                <span className="text-[11px] font-bold text-emerald-800">{formData.bank_name}</span>
              )}
            </div>
            {readOnly ? (
              <p className="font-semibold text-slate-900 text-xs py-2">
                {displaySourceValue(formData.bank_name)}
              </p>
            ) : (
              <input
                type="text"
                id="ppd-bank-name"
                name="bank_name"
                value={formData.bank_name}
                onChange={(e) => handleChange('bank_name', e.target.value)}
                placeholder="Misal: Bank Syariah Indonesia (BSI)"
                className={`w-full rounded-xl border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  errors.bank_name
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
            )}
            {errors.bank_name && <p className="text-[11px] font-semibold text-rose-600">{errors.bank_name}</p>}
          </div>

          {/* Account Owner Name */}
          <div className="space-y-1">
            <label htmlFor="ppd-bank-account-name" className="text-xs font-bold text-slate-700">
              Nama Pemilik Rekening <span className="text-rose-600">*</span>
            </label>
            {readOnly ? (
              <p className="font-semibold text-slate-900 text-xs py-2">
                {displaySourceValue(formData.bank_account_name)}
              </p>
            ) : (
              <input
                type="text"
                id="ppd-bank-account-name"
                name="bank_account_name"
                value={formData.bank_account_name}
                onChange={(e) => handleChange('bank_account_name', e.target.value)}
                placeholder="Nama sesuai buku rekening"
                className={`w-full rounded-xl border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  errors.bank_account_name
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
            )}
            {errors.bank_account_name && (
              <p className="text-[11px] font-semibold text-rose-600">{errors.bank_account_name}</p>
            )}
          </div>

          {/* Account Number (Masked when submitted/readonly) */}
          <div className="space-y-1">
            <label htmlFor="ppd-bank-account-number" className="text-xs font-bold text-slate-700">
              Nomor Rekening <span className="text-rose-600">*</span>
            </label>
            {readOnly || formData.bank_account_masked ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold text-slate-800 min-h-[44px]">
                <Lock className="size-3.5 text-slate-400" aria-hidden="true" />
                <span>{formData.bank_account_masked || formData.bank_account_number || '************1234'}</span>
              </div>
            ) : (
              <input
                type="text"
                id="ppd-bank-account-number"
                name="bank_account_number"
                value={formData.bank_account_number}
                onChange={(e) => handleChange('bank_account_number', e.target.value)}
                placeholder="Nomor rekening (hanya angka)"
                className={`w-full rounded-xl border px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[44px] ${
                  errors.bank_account_number
                    ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                    : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                }`}
              />
            )}
            {errors.bank_account_number && (
              <p className="text-[11px] font-semibold text-rose-600">{errors.bank_account_number}</p>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Rencana Anggaran Biaya (RAB) */}
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <RabLineEditor
          lines={formData.rab_lines}
          onChange={handleRabChange}
          mpzisCeilingAmount={mpzisAllocation}
          readOnly={readOnly}
          errors={errors}
        />
      </div>

      {/* Submission Actions */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-600">Total Nominal PPD:</span>
            <p className="font-mono text-lg font-black text-emerald-800">
              {formatRupiah(grandTotal)}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={isCeilingExceeded || grandTotal <= 0}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-extrabold text-white shadow transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden="true" />
            Ajukan PPD (F-PKP/03)
          </button>
        </div>
      )}

      {/* Irreversible Submission Dialog */}
      <IrreversibleActionDialog
        isOpen={isSubmitDialogOpen}
        title="Konfirmasi Pengajuan PPD (F-PKP/03)"
        actionLabel="Kirim Pengajuan PPD"
        variant="primary"
        isSubmitting={isSubmitting}
        errorMessage={submitError}
        onConfirm={handleConfirmSubmit}
        onClose={() => setIsSubmitDialogOpen(false)}
        description={
          <div className="space-y-3 text-xs text-slate-600">
            <p>
              Anda akan mengirimkan Formulir Pengajuan Pencairan Dana (F-PKP/03) ke Divisi Keuangan.
              Setelah dikirimkan, rincian RAB dan rekening tujuan akan dibekukan dan tidak dapat diubah kembali secara langsung.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 font-sans">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Nominal Total:</span>
                <span className="font-mono font-bold text-emerald-700">{formatRupiah(grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Terbilang:</span>
                <span className="font-semibold italic text-slate-800">{terbilangText}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Bank Tujuan:</span>
                <span className="font-bold text-slate-800">{formData.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-500">Pemilik Rekening:</span>
                <span className="font-bold text-slate-800">{formData.bank_account_name}</span>
              </div>
              {mpzisAllocation && (
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-semibold text-slate-500">Pagu MPZIS:</span>
                  <span className="font-mono font-semibold text-slate-700">{formatRupiah(mpzisAllocation)}</span>
                </div>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}

export default PpdForm;
