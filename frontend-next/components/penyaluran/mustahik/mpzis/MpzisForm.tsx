'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  FileCheck2,
  FileText,
  Home,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  FundSource,
  MpzisAddressSnapshot,
  MpzisDraft,
  MpzisSourceFields,
  P0MustahikProfile,
  RecipientType,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { FieldErrorSummary } from '../shared/FieldErrorSummary';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';
import { MoneyInput, formatRupiah } from '../shared/MoneyInput';

export interface MpzisFormProps {
  mustahikId: number | string;
  initialDraft?: MpzisDraft | null;
  initialFields?: Partial<MpzisSourceFields> | null;
  mustahikProfile?: P0MustahikProfile | null;
  onSaved?: (draft: MpzisDraft) => void;
  onSubmitted?: (draft: MpzisDraft) => void;
  readOnly?: boolean;
  className?: string;
  isLegacy?: boolean;
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface MpzisFormData {
  form_number: string;
  mpzis_date: string;
  program_classification: string;
  purpose: string;
  asnaf: string;
  fund_source: FundSource | '';
  recipient_name: string;
  recipient_type: RecipientType | '';
  beneficiary_count: number | string;
  total_amount: number | string | null;
  recipient_section_confirmed: boolean;
  fund_source_confirmed: boolean;
  address_snapshot: MpzisAddressSnapshot;
  marital_status_snapshot: string;
  note?: string;
}

export const ASNAF_OPTIONS = [
  'Fakir',
  'Miskin',
  'Amil',
  'Mualaf',
  'Riqab',
  'Gharimin',
  'Fisabilillah',
  'Ibnu Sabil',
] as const;

export const FUND_SOURCE_OPTIONS: FundSource[] = [
  'Zakat',
  'Infaq/Shodaqoh',
  'DSKL',
  'Hibah',
];

export const RECIPIENT_TYPE_OPTIONS: RecipientType[] = [
  'Individu',
  'Keluarga',
  'Kelompok / Yayasan',
];

export function extractInitialMpzisData(
  draft?: MpzisDraft | null,
  fields?: Partial<MpzisSourceFields> | null,
  mustahik?: P0MustahikProfile | null
): MpzisFormData {
  const source = {
    ...draft,
    ...(draft?.source_fields || {}),
    ...(fields || {}),
  };

  const addressSnap: MpzisAddressSnapshot = source.address_snapshot || {
    address: mustahik?.address ?? null,
    rt_rw: mustahik?.rt_rw ?? null,
    kelurahan: mustahik?.kelurahan ?? null,
    kecamatan: mustahik?.kecamatan ?? null,
    kabupaten_kota: mustahik?.kabupaten_kota ?? null,
    province: mustahik?.province ?? null,
  };

  const rawMarital =
    source.marital_status_snapshot ??
    (mustahik as unknown as Record<string, unknown>)?.marital_status ??
    '';

  const defaultDate = new Date().toISOString().split('T')[0]!;

  return {
    form_number: source.form_number ?? '',
    mpzis_date: source.mpzis_date ?? defaultDate,
    program_classification:
      source.program_classification ?? mustahik?.program ?? '',
    purpose: source.purpose ?? '',
    asnaf: source.asnaf ?? mustahik?.asnaf ?? '',
    fund_source: (source.fund_source as FundSource) || 'Zakat',
    recipient_name:
      source.recipient_name ??
      mustahik?.nama ??
      mustahik?.name ??
      '',
    recipient_type: (source.recipient_type as RecipientType) || 'Individu',
    beneficiary_count:
      source.beneficiary_count !== undefined && source.beneficiary_count !== null
        ? source.beneficiary_count
        : 1,
    total_amount:
      source.total_amount !== undefined && source.total_amount !== null
        ? source.total_amount
        : null,
    recipient_section_confirmed: Boolean(source.recipient_section_confirmed),
    fund_source_confirmed: Boolean(source.fund_source_confirmed),
    address_snapshot: addressSnap,
    marital_status_snapshot: String(rawMarital || ''),
    note: source.note ?? '',
  };
}

export function buildMpzisDraftPayload(data: MpzisFormData): Partial<MpzisDraft> {
  return {
    form_number: data.form_number.trim() || null,
    mpzis_date: data.mpzis_date || null,
    program_classification: data.program_classification.trim() || null,
    purpose: data.purpose.trim() || null,
    asnaf: data.asnaf.trim() || null,
    fund_source: (data.fund_source as FundSource) || null,
    recipient_name: data.recipient_name.trim() || null,
    recipient_type: (data.recipient_type as RecipientType) || null,
    beneficiary_count:
      data.beneficiary_count === '' || data.beneficiary_count === null
        ? null
        : Number(data.beneficiary_count),
    total_amount:
      data.total_amount === '' || data.total_amount === null
        ? null
        : Number(data.total_amount),
    address_snapshot: data.address_snapshot,
    marital_status_snapshot: data.marital_status_snapshot.trim() || null,
    recipient_section_confirmed: data.recipient_section_confirmed,
    fund_source_confirmed: data.fund_source_confirmed,
    note: data.note?.trim() || undefined,
  };
}

export function validateMpzisSubmit(data: MpzisFormData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.form_number || !data.form_number.trim()) {
    errors.form_number = 'Nomor formulir MPZIS (F-BPP/06) wajib diisi.';
  }

  if (!data.mpzis_date || !data.mpzis_date.trim()) {
    errors.mpzis_date = 'Tanggal formulir MPZIS wajib diisi.';
  }

  if (!data.program_classification || !data.program_classification.trim()) {
    errors.program_classification = 'Klasifikasi program wajib diisi.';
  }

  if (!data.purpose || !data.purpose.trim()) {
    errors.purpose = 'Tujuan penyaluran / distribusi wajib diisi.';
  }

  if (!data.asnaf || !data.asnaf.trim()) {
    errors.asnaf = 'Kategori asnaf wajib dipilih.';
  }

  if (!data.fund_source) {
    errors.fund_source = 'Sumber dana wajib dipilih.';
  }

  if (!data.fund_source_confirmed) {
    errors.fund_source_confirmed =
      'Konfirmasi kesesuaian alokasi sumber dana syariah wajib dicentang.';
  }

  if (!data.recipient_name || !data.recipient_name.trim()) {
    errors.recipient_name = 'Nama penerima manfaat wajib diisi.';
  }

  if (!data.recipient_type) {
    errors.recipient_type = 'Jenis penerima manfaat wajib dipilih.';
  }

  const benCount = Number(data.beneficiary_count);
  if (
    data.beneficiary_count === '' ||
    Number.isNaN(benCount) ||
    benCount < 1
  ) {
    errors.beneficiary_count = 'Jumlah penerima manfaat minimal 1 jiwa.';
  }

  if (
    data.total_amount === null ||
    data.total_amount === undefined ||
    data.total_amount === '' ||
    Number(data.total_amount) <= 0
  ) {
    errors.total_amount = 'Jumlah dana MPZIS wajib diisi dan harus lebih dari Rp 0.';
  }

  if (!data.recipient_section_confirmed) {
    errors.recipient_section_confirmed =
      'Konfirmasi keabsahan data penerima manfaat wajib dicentang.';
  }

  return errors;
}

export function MpzisForm({
  mustahikId,
  initialDraft,
  initialFields,
  mustahikProfile,
  onSaved,
  onSubmitted,
  readOnly = false,
  className = '',
  isLegacy = false,
}: MpzisFormProps) {
  const [formData, setFormData] = useState<MpzisFormData>(() =>
    extractInitialMpzisData(initialDraft, initialFields, mustahikProfile)
  );

  const [currentMpzisId, setCurrentMpzisId] = useState<number | null>(
    initialDraft?.id ?? null
  );
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);

  // Sync state if initialDraft changes from outside
  useEffect(() => {
    if (initialDraft?.id) {
      setCurrentMpzisId(initialDraft.id);
    }
  }, [initialDraft?.id]);

  const executeAutosave = useCallback(
    async (dataToSave: MpzisFormData) => {
      if (readOnly) return;
      setAutosaveStatus('saving');
      try {
        const payload = buildMpzisDraftPayload(dataToSave);
        let savedDraft: MpzisDraft | undefined;

        if (currentMpzisId) {
          const res = await api.saveMpzisDraft(mustahikId, currentMpzisId, payload);
          savedDraft = res.data;
        } else {
          const res = await api.createMpzisDraft(mustahikId, payload);
          savedDraft = res.data;
          if (savedDraft?.id) {
            setCurrentMpzisId(savedDraft.id);
          }
        }

        setAutosaveStatus('saved');
        setLastSavedAt(new Date());
        if (savedDraft) {
          onSaved?.(savedDraft);
        }
      } catch {
        setAutosaveStatus('error');
      }
    },
    [currentMpzisId, mustahikId, onSaved, readOnly]
  );

  const updateField = <K extends keyof MpzisFormData>(
    field: K,
    value: MpzisFormData[K]
  ) => {
    if (readOnly) return;

    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      // Trigger debounced autosave (800ms)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        executeAutosave(next);
      }, 800);

      return next;
    });

    // Clear field error on edit
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleManualSave = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    await executeAutosave(formData);
  };

  const handleSubmitClick = () => {
    setSubmitError(null);
    const errors = validateMpzisSubmit(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = buildMpzisDraftPayload(formData);
      let targetId = currentMpzisId;

      if (!targetId) {
        const createRes = await api.createMpzisDraft(mustahikId, payload);
        targetId = createRes.data?.id ?? null;
        if (targetId) {
          setCurrentMpzisId(targetId);
        }
      }

      if (!targetId) {
        throw new Error('ID draft MPZIS tidak dapat dibuat.');
      }

      const res = await api.submitMpzis(mustahikId, targetId, payload);
      setIsSubmitDialogOpen(false);
      setIsSubmitting(false);

      if (res.data) {
        onSubmitted?.(res.data);
      }
    } catch (err: unknown) {
      setIsSubmitting(false);
      const message =
        err instanceof Error ? err.message : 'Gagal mengirim formulir MPZIS.';
      setSubmitError(message);

      const fieldErr = (err as { field_errors?: Record<string, string> })?.field_errors;
      if (fieldErr) {
        setFieldErrors(fieldErr);
      }
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-mono text-xs font-black text-emerald-800">
              F-BPP/06
            </span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              v2026-09-13
            </span>
            {initialDraft?.revision !== undefined && (
              <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                Revisi #{initialDraft.revision}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-xl font-black text-slate-900">
            Formulir MPZIS F-BPP/06 (Persetujuan Bantuan)
          </h2>
          <p className="text-xs text-slate-500">
            Penyusunan penetapan mustahik dan alokasi dana sebelum diajukan ke tahap persetujuan berjenjang 5 tingkat.
          </p>
        </div>

        {/* Autosave Status Indicator */}
        <div className="flex items-center gap-3">
          {autosaveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Menyimpan...</span>
            </div>
          )}
          {autosaveStatus === 'saved' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                Tersimpan{' '}
                {lastSavedAt
                  ? `pukul ${lastSavedAt.toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : ''}
              </span>
            </div>
          )}
          {autosaveStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Gagal menyimpan otomatis</span>
            </div>
          )}
        </div>
      </div>

      {/* Field Error Summary (A11y auto-focus) */}
      <FieldErrorSummary errors={fieldErrors} />

      {/* SECTION 1: Data Formulir & Klasifikasi Program */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileText className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            1. Data Formulir & Klasifikasi Program
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* form_number */}
          <div>
            <label
              htmlFor="form_number"
              className="block text-xs font-bold text-slate-700"
            >
              Nomor Formulir (F-BPP/06) <span className="text-rose-500">*</span>
            </label>
            <input
              id="form_number"
              name="form_number"
              type="text"
              disabled={readOnly}
              value={formData.form_number}
              onChange={(e) => updateField('form_number', e.target.value)}
              placeholder="Contoh: BPP-06/2026/09/001"
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.form_number
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.form_number && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.form_number}
              </p>
            )}
          </div>

          {/* mpzis_date */}
          <div>
            <label
              htmlFor="mpzis_date"
              className="block text-xs font-bold text-slate-700"
            >
              Tanggal Formulir MPZIS <span className="text-rose-500">*</span>
            </label>
            <input
              id="mpzis_date"
              name="mpzis_date"
              type="date"
              disabled={readOnly}
              value={formData.mpzis_date}
              onChange={(e) => updateField('mpzis_date', e.target.value)}
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.mpzis_date
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.mpzis_date && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.mpzis_date}
              </p>
            )}
          </div>

          {/* program_classification */}
          <div>
            <label
              htmlFor="program_classification"
              className="block text-xs font-bold text-slate-700"
            >
              Klasifikasi Program <span className="text-rose-500">*</span>
            </label>
            <input
              id="program_classification"
              name="program_classification"
              type="text"
              disabled={readOnly}
              value={formData.program_classification}
              onChange={(e) => updateField('program_classification', e.target.value)}
              placeholder="Contoh: BAZNAS Peduli - Bantuan Modal Usaha"
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.program_classification
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.program_classification && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.program_classification}
              </p>
            )}
          </div>

          {/* asnaf */}
          <div>
            <label
              htmlFor="asnaf"
              className="block text-xs font-bold text-slate-700"
            >
              Kategori Asnaf <span className="text-rose-500">*</span>
            </label>
            <select
              id="asnaf"
              name="asnaf"
              disabled={readOnly}
              value={formData.asnaf}
              onChange={(e) => updateField('asnaf', e.target.value)}
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.asnaf
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            >
              <option value="">-- Pilih Asnaf --</option>
              {ASNAF_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {fieldErrors.asnaf && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.asnaf}
              </p>
            )}
          </div>

          {/* purpose */}
          <div className="sm:col-span-2">
            <label
              htmlFor="purpose"
              className="block text-xs font-bold text-slate-700"
            >
              Tujuan Penyaluran / Distribusi <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="purpose"
              name="purpose"
              rows={2}
              disabled={readOnly}
              value={formData.purpose}
              onChange={(e) => updateField('purpose', e.target.value)}
              placeholder="Uraikan maksud dan peruntukan bantuan MPZIS secara spesifik..."
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.purpose
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.purpose && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.purpose}
              </p>
            )}
          </div>

          {/* fund_source */}
          <div>
            <label
              htmlFor="fund_source"
              className="block text-xs font-bold text-slate-700"
            >
              Sumber Dana <span className="text-rose-500">*</span>
            </label>
            <select
              id="fund_source"
              name="fund_source"
              disabled={readOnly}
              value={formData.fund_source}
              onChange={(e) =>
                updateField('fund_source', e.target.value as FundSource)
              }
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.fund_source
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            >
              <option value="">-- Pilih Sumber Dana --</option>
              {FUND_SOURCE_OPTIONS.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            {fieldErrors.fund_source && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.fund_source}
              </p>
            )}
          </div>

          {/* fund_source_confirmed checkbox */}
          <div className="flex items-center pt-6 sm:col-span-1">
            <label
              htmlFor="fund_source_confirmed"
              className="flex cursor-pointer items-start gap-3 text-xs font-bold text-slate-800"
            >
              <input
                id="fund_source_confirmed"
                name="fund_source_confirmed"
                type="checkbox"
                disabled={readOnly}
                checked={formData.fund_source_confirmed}
                onChange={(e) =>
                  updateField('fund_source_confirmed', e.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Konfirmasi Sumber Dana <span className="text-rose-500">*</span>
                <span className="block font-normal text-slate-500">
                  Saya menyatakan alokasi sumber dana telah sesuai dengan peruntukan syariah dan regulasi BAZNAS.
                </span>
              </span>
            </label>
          </div>
          {fieldErrors.fund_source_confirmed && (
            <p className="text-xs font-medium text-rose-600 sm:col-span-2">
              {fieldErrors.fund_source_confirmed}
            </p>
          )}
        </div>
      </section>

      {/* SECTION 2: Data Penerima Manfaat & Alokasi Dana */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            2. Penerima Manfaat & Alokasi Dana
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* recipient_name */}
          <div>
            <label
              htmlFor="recipient_name"
              className="block text-xs font-bold text-slate-700"
            >
              Nama Penerima Manfaat <span className="text-rose-500">*</span>
            </label>
            <input
              id="recipient_name"
              name="recipient_name"
              type="text"
              disabled={readOnly}
              value={formData.recipient_name}
              onChange={(e) => updateField('recipient_name', e.target.value)}
              placeholder="Nama lengkap penerima"
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.recipient_name
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.recipient_name && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.recipient_name}
              </p>
            )}
          </div>

          {/* recipient_type */}
          <div>
            <label
              htmlFor="recipient_type"
              className="block text-xs font-bold text-slate-700"
            >
              Jenis Penerima <span className="text-rose-500">*</span>
            </label>
            <select
              id="recipient_type"
              name="recipient_type"
              disabled={readOnly}
              value={formData.recipient_type}
              onChange={(e) =>
                updateField('recipient_type', e.target.value as RecipientType)
              }
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.recipient_type
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            >
              <option value="">-- Pilih Jenis Penerima --</option>
              {RECIPIENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {fieldErrors.recipient_type && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.recipient_type}
              </p>
            )}
          </div>

          {/* beneficiary_count */}
          <div>
            <label
              htmlFor="beneficiary_count"
              className="block text-xs font-bold text-slate-700"
            >
              Jumlah Jiwa Penerima <span className="text-rose-500">*</span>
            </label>
            <input
              id="beneficiary_count"
              name="beneficiary_count"
              type="number"
              min={1}
              disabled={readOnly}
              value={formData.beneficiary_count}
              onChange={(e) => updateField('beneficiary_count', e.target.value)}
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                fieldErrors.beneficiary_count
                  ? 'border-rose-400 bg-rose-50/40 text-rose-900 focus:ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-emerald-500 focus:ring-emerald-100'
              }`}
            />
            {fieldErrors.beneficiary_count && (
              <p className="mt-1 text-xs font-medium text-rose-600">
                {fieldErrors.beneficiary_count}
              </p>
            )}
          </div>

          {/* total_amount (MoneyInput) */}
          <div>
            <MoneyInput
              id="total_amount"
              name="total_amount"
              label="Total Jumlah Bantuan MPZIS"
              required
              disabled={readOnly}
              value={formData.total_amount}
              onChange={(rawValue) => updateField('total_amount', rawValue)}
              error={fieldErrors.total_amount}
              hint="Jumlah nominal bantuan yang diusulkan"
            />
          </div>

          {/* recipient_section_confirmed checkbox */}
          <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <label
              htmlFor="recipient_section_confirmed"
              className="flex cursor-pointer items-start gap-3 text-xs font-bold text-slate-800"
            >
              <input
                id="recipient_section_confirmed"
                name="recipient_section_confirmed"
                type="checkbox"
                disabled={readOnly}
                checked={formData.recipient_section_confirmed}
                onChange={(e) =>
                  updateField('recipient_section_confirmed', e.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Konfirmasi Kelayakan Penerima Manfaat <span className="text-rose-500">*</span>
                <span className="mt-0.5 block font-normal text-slate-600">
                  Saya mengonfirmasi bahwa calon penerima manfaat memenuhi kriteria mustahik, data kependudukan telah diverifikasi, dan alokasi dana telah dihitung secara wajar.
                </span>
              </span>
            </label>
            {fieldErrors.recipient_section_confirmed && (
              <p className="mt-2 text-xs font-medium text-rose-600">
                {fieldErrors.recipient_section_confirmed}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 3: Snapshot Data Kependudukan (Read-Only) */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-slate-600" />
            <h3 className="text-base font-extrabold text-slate-900">
              3. Snapshot Kependudukan Mustahik (Terkunci)
            </h3>
          </div>
          <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
            Sumber: Asesmen / Pendaftaran
          </span>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Data kependudukan di bawah ini diambil otomatis dari profil Mustahik dan Asesmen yang disetujui. Data ini terkunci secara permanen pada dokumen MPZIS untuk menjaga audit trail.
        </p>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Alamat Domisili
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {displaySourceValue(formData.address_snapshot?.address)}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              RT / RW
            </dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {displaySourceValue(formData.address_snapshot?.rt_rw)}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Kelurahan
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {displaySourceValue(formData.address_snapshot?.kelurahan)}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Kecamatan
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {displaySourceValue(formData.address_snapshot?.kecamatan)}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Kabupaten / Kota & Provinsi
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {displaySourceValue(
                [
                  formData.address_snapshot?.kabupaten_kota,
                  formData.address_snapshot?.province,
                ]
                  .filter(Boolean)
                  .join(', ') || null
              )}
            </dd>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 sm:col-span-2 lg:col-span-3">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Status Pernikahan Snapshot
            </dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {displaySourceValue(formData.marital_status_snapshot)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Action Buttons Bar */}
      {!readOnly && (
        <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleManualSave}
            disabled={autosaveStatus === 'saving'}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
          >
            {autosaveStatus === 'saving' ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : (
              <Save className="h-4 w-4 text-slate-500" />
            )}
            Simpan Draft
          </button>

          <button
            type="button"
            onClick={handleSubmitClick}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 active:scale-[0.99]"
          >
            <Send className="h-4 w-4" />
            Kirim MPZIS (F-BPP/06)
          </button>
        </div>
      )}

      {/* Confirmation Dialog before Submit */}
      <IrreversibleActionDialog
        isOpen={isSubmitDialogOpen}
        title="Konfirmasi Pengajuan MPZIS (F-BPP/06)"
        description={
          <div className="space-y-3 text-xs text-slate-600">
            <p>
              Anda akan mengirimkan formulir penetapan MPZIS untuk penerima manfaat{' '}
              <strong className="text-slate-900">{formData.recipient_name}</strong> sejumlah{' '}
              <strong className="text-emerald-700">
                {formatRupiah(Number(formData.total_amount) || 0)}
              </strong>
              .
            </p>
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
              Setelah dikirim, data MPZIS akan dikunci dalam snapshot hash dan masuk ke antrean persetujuan berjenjang 5 tingkat (Staff Penyaluran hingga Waka II). Pastikan seluruh data telah akurat.
            </p>
          </div>
        }
        actionLabel="Kirim Formulir MPZIS"
        cancelLabel="Periksa Kembali"
        variant="primary"
        isSubmitting={isSubmitting}
        errorMessage={submitError}
        onConfirm={handleConfirmSubmit}
        onClose={() => {
          if (!isSubmitting) setIsSubmitDialogOpen(false);
        }}
      />
    </div>
  );
}
