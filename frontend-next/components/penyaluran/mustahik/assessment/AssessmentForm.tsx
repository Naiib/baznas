'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Home,
  Loader2,
  Save,
  Send,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type {
  AssessmentDraft,
  AssessmentSourceFields,
  HouseOwnership,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { FieldErrorSummary } from '../shared/FieldErrorSummary';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';
import { MoneyInput } from '../shared/MoneyInput';

export interface AssessmentFormProps {
  mustahikId: number | string;
  initialDraft?: AssessmentDraft | null;
  initialFields?: Partial<AssessmentSourceFields> | null;
  onSaved?: (draft: AssessmentDraft) => void;
  onSubmitted?: (draft: AssessmentDraft) => void;
  readOnly?: boolean;
  className?: string;
  isLegacy?: boolean;
}

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AssessmentFormData {
  // Household (5)
  husband_in_household: boolean | null;
  husband_name: string;
  wife_in_household: boolean | null;
  wife_name: string;
  child_count: number | string;
  // Housing (4)
  house_ownership: HouseOwnership | '';
  home_address: string;
  address_matches_ktp: boolean | null;
  monthly_rent_amount: number | string | null;
  // Livelihood (6)
  husband_occupation: string;
  husband_monthly_income: number | string | null;
  wife_occupation: string;
  wife_monthly_income: number | string | null;
  child_occupation: string;
  child_monthly_support: number | string | null;
  // Request History (3)
  assistance_request: string;
  applied_to_baznas_before: boolean | null;
  previous_application_year: number | string | null;
}

export function extractInitialFormData(
  draft?: (AssessmentDraft & { fields?: AssessmentSourceFields }) | null,
  fields?: Partial<AssessmentSourceFields> | null
): AssessmentFormData {
  const source = {
    ...draft,
    ...(draft?.source_fields || {}),
    ...(draft?.fields || {}),
    ...(fields || {}),
  };

  return {
    // Household (5)
    husband_in_household:
      source.husband_in_household !== undefined ? source.husband_in_household : null,
    husband_name: source.husband_name ?? '',
    wife_in_household:
      source.wife_in_household !== undefined ? source.wife_in_household : null,
    wife_name: source.wife_name ?? '',
    child_count:
      source.child_count !== undefined && source.child_count !== null
        ? source.child_count
        : '',

    // Housing (4)
    house_ownership: (source.house_ownership as HouseOwnership) || '',
    home_address: source.home_address ?? '',
    address_matches_ktp:
      source.address_matches_ktp !== undefined ? source.address_matches_ktp : null,
    monthly_rent_amount: source.monthly_rent_amount ?? null,

    // Livelihood (6)
    husband_occupation: source.husband_occupation ?? '',
    husband_monthly_income: source.husband_monthly_income ?? null,
    wife_occupation: source.wife_occupation ?? '',
    wife_monthly_income: source.wife_monthly_income ?? null,
    child_occupation: source.child_occupation ?? '',
    child_monthly_support: source.child_monthly_support ?? null,

    // Request History (3)
    assistance_request: source.assistance_request ?? '',
    applied_to_baznas_before:
      source.applied_to_baznas_before !== undefined ? source.applied_to_baznas_before : null,
    previous_application_year:
      source.previous_application_year !== undefined &&
      source.previous_application_year !== null
        ? source.previous_application_year
        : '',
  };
}

export function buildAssessmentDraftPayload(
  data: AssessmentFormData
): Partial<AssessmentDraft> {
  const isContract = data.house_ownership === 'Kontrak';
  const hasAppliedBefore = data.applied_to_baznas_before === true;

  return {
    // Household (5)
    husband_in_household: data.husband_in_household,
    husband_name: data.husband_name.trim() || null,
    wife_in_household: data.wife_in_household,
    wife_name: data.wife_name.trim() || null,
    child_count:
      data.child_count === '' || data.child_count === null
        ? null
        : Number(data.child_count),

    // Housing (4)
    house_ownership: (data.house_ownership as HouseOwnership) || null,
    home_address: data.home_address.trim() || null,
    address_matches_ktp: data.address_matches_ktp,
    monthly_rent_amount: isContract ? data.monthly_rent_amount : null,

    // Livelihood (6)
    husband_occupation: data.husband_occupation.trim() || null,
    husband_monthly_income: data.husband_monthly_income ?? null,
    wife_occupation: data.wife_occupation.trim() || null,
    wife_monthly_income: data.wife_monthly_income ?? null,
    child_occupation: data.child_occupation.trim() || null,
    child_monthly_support: data.child_monthly_support ?? null,

    // Request History (3)
    assistance_request: data.assistance_request.trim() || null,
    applied_to_baznas_before: data.applied_to_baznas_before,
    previous_application_year: hasAppliedBefore
      ? data.previous_application_year === '' || data.previous_application_year === null
        ? null
        : Number(data.previous_application_year)
      : null,
  };
}

export function AssessmentForm({
  mustahikId,
  initialDraft,
  initialFields,
  onSaved,
  onSubmitted,
  readOnly = false,
  className = '',
  isLegacy = false,
}: AssessmentFormProps) {
  const [formData, setFormData] = useState<AssessmentFormData>(() =>
    extractInitialFormData(initialDraft, initialFields)
  );

  const [currentAssessmentId, setCurrentAssessmentId] = useState<number | null>(
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
  const latestDataRef = useRef(formData);
  latestDataRef.current = formData;

  // Sync state if initialDraft changes from outside
  useEffect(() => {
    if (initialDraft?.id) {
      setCurrentAssessmentId(initialDraft.id);
    }
  }, [initialDraft?.id]);

  const executeAutosave = useCallback(
    async (dataToSave: AssessmentFormData) => {
      if (readOnly) return;
      setAutosaveStatus('saving');
      try {
        const payload = buildAssessmentDraftPayload(dataToSave);
        let savedDraft: AssessmentDraft | undefined;

        if (currentAssessmentId) {
          const res = await api.saveAssessmentDraft(
            mustahikId,
            currentAssessmentId,
            payload
          );
          savedDraft = res.data;
        } else {
          const res = await api.createAssessmentDraft(mustahikId, payload);
          savedDraft = res.data;
          if (savedDraft?.id) {
            setCurrentAssessmentId(savedDraft.id);
          }
        }

        setAutosaveStatus('saved');
        setLastSavedAt(new Date());
        if (savedDraft) {
          onSaved?.(savedDraft);
        }
      } catch (err: any) {
        setAutosaveStatus('error');
      }
    },
    [currentAssessmentId, mustahikId, onSaved, readOnly]
  );

  const updateField = <K extends keyof AssessmentFormData>(
    field: K,
    value: AssessmentFormData[K]
  ) => {
    if (readOnly) return;

    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      // Dynamic conditional cleanup:
      if (field === 'house_ownership' && value !== 'Kontrak') {
        next.monthly_rent_amount = null;
      }
      if (field === 'applied_to_baznas_before' && value !== true) {
        next.previous_application_year = '';
      }

      // Trigger 800ms debounced autosave
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        executeAutosave(next);
      }, 800);

      return next;
    });

    // Clear individual field error if resolved
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

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!formData.assistance_request || !formData.assistance_request.trim()) {
      errors.assistance_request = 'Permohonan bantuan wajib diisi.';
    }

    if (!formData.house_ownership) {
      errors.house_ownership = 'Status kepemilikan rumah wajib dipilih.';
    } else if (formData.house_ownership === 'Kontrak') {
      if (
        formData.monthly_rent_amount === null ||
        formData.monthly_rent_amount === undefined ||
        formData.monthly_rent_amount === '' ||
        Number(formData.monthly_rent_amount) <= 0
      ) {
        errors.monthly_rent_amount =
          'Biaya sewa bulanan wajib diisi untuk status kepemilikan Kontrak.';
      }
    }

    if (formData.applied_to_baznas_before === true) {
      if (
        formData.previous_application_year === null ||
        formData.previous_application_year === undefined ||
        formData.previous_application_year === ''
      ) {
        errors.previous_application_year =
          'Tahun pengajuan sebelumnya wajib diisi jika pernah mengajukan ke BAZNAS.';
      } else {
        const year = Number(formData.previous_application_year);
        if (Number.isNaN(year) || year < 1990 || year > 2099) {
          errors.previous_application_year =
            'Tahun pengajuan sebelumnya harus berupa tahun yang valid (contoh: 2024).';
        }
      }
    }

    if (formData.husband_in_household === true && !formData.husband_name.trim()) {
      errors.husband_name = 'Nama suami wajib diisi jika suami tinggal serumah.';
    }

    if (formData.wife_in_household === true && !formData.wife_name.trim()) {
      errors.wife_name = 'Nama istri wajib diisi jika istri tinggal serumah.';
    }

    if (
      formData.child_count !== null &&
      formData.child_count !== undefined &&
      formData.child_count !== '' &&
      Number(formData.child_count) < 0
    ) {
      errors.child_count = 'Jumlah anak tidak boleh bernilai negatif.';
    }

    return errors;
  };

  const handleOpenSubmit = () => {
    const errors = validateForm();
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
      const payload = buildAssessmentDraftPayload(formData);
      let targetId = currentAssessmentId;

      if (!targetId) {
        const createRes = await api.createAssessmentDraft(mustahikId, payload);
        targetId = createRes.data?.id ?? null;
        if (targetId) {
          setCurrentAssessmentId(targetId);
        }
      }

      if (!targetId) {
        throw new Error('Gagal menginisialisasi ID draf asesmen sebelum pengajuan.');
      }

      const res = await api.submitAssessment(mustahikId, targetId, payload);
      setIsSubmitDialogOpen(false);
      if (res.data) {
        onSubmitted?.(res.data);
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Gagal mengajukan formulir asesmen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSave = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    executeAutosave(formData);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header & Autosave Status Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            Formulir Asesmen Lapangan (P0)
          </h3>
          <p className="text-xs text-slate-500">
            Pencatatan 18 field sumber faktual hasil survei mustahik secara digital.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Autosave status indicator */}
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {autosaveStatus === 'saving' && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 text-amber-600"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Menyimpan</span>
              </span>
            )}
            {autosaveStatus === 'saved' && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 text-emerald-600"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>Tersimpan</span>
              </span>
            )}
            {autosaveStatus === 'error' && (
              <span
                role="alert"
                aria-live="polite"
                className="inline-flex items-center gap-1 text-rose-600"
              >
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                <span>Gagal disimpan</span>
              </span>
            )}
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={handleManualSave}
              disabled={autosaveStatus === 'saving'}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              <Save className="size-3.5" aria-hidden="true" />
              <span>Simpan Draf</span>
            </button>
          )}
        </div>
      </div>

      {/* Field Error Summary Banner */}
      <FieldErrorSummary errors={fieldErrors} />

      {/* Submission Error Banner */}
      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-900"
        >
          {submitError}
        </div>
      )}

      {/* FORM SECTIONS (Exact 18 fields in official order) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleOpenSubmit();
        }}
        noValidate
        className="space-y-8"
      >
        {/* ============================================================== */}
        {/* SEKSI 1: RUMAH TANGGA (5 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="section-rumah-tangga"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="section-rumah-tangga"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              1. Rumah Tangga (5 Field)
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Field 1: husband_in_household */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Suami Tinggal Serumah
              </label>
              <div className="flex items-center gap-4 pt-1">
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="husband_in_household"
                    id="husband_in_household-yes"
                    checked={formData.husband_in_household === true}
                    onChange={() => updateField('husband_in_household', true)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Ya</span>
                </label>
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="husband_in_household"
                    id="husband_in_household-no"
                    checked={formData.husband_in_household === false}
                    onChange={() => updateField('husband_in_household', false)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tidak</span>
                </label>
              </div>
            </div>

            {/* Field 2: husband_name */}
            <div className="space-y-1.5">
              <label
                htmlFor="husband_name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Nama Suami
                {formData.husband_in_household === true && (
                  <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
                )}
              </label>
              <input
                id="husband_name"
                name="husband_name"
                type="text"
                value={formData.husband_name}
                onChange={(e) => updateField('husband_name', e.target.value)}
                disabled={readOnly}
                placeholder="Nama lengkap suami..."
                aria-invalid={Boolean(fieldErrors.husband_name)}
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                  fieldErrors.husband_name ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {fieldErrors.husband_name && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {fieldErrors.husband_name}
                </p>
              )}
            </div>

            {/* Field 3: wife_in_household */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Istri Tinggal Serumah
              </label>
              <div className="flex items-center gap-4 pt-1">
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="wife_in_household"
                    id="wife_in_household-yes"
                    checked={formData.wife_in_household === true}
                    onChange={() => updateField('wife_in_household', true)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Ya</span>
                </label>
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="wife_in_household"
                    id="wife_in_household-no"
                    checked={formData.wife_in_household === false}
                    onChange={() => updateField('wife_in_household', false)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tidak</span>
                </label>
              </div>
            </div>

            {/* Field 4: wife_name */}
            <div className="space-y-1.5">
              <label
                htmlFor="wife_name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Nama Istri
                {formData.wife_in_household === true && (
                  <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
                )}
              </label>
              <input
                id="wife_name"
                name="wife_name"
                type="text"
                value={formData.wife_name}
                onChange={(e) => updateField('wife_name', e.target.value)}
                disabled={readOnly}
                placeholder="Nama lengkap istri..."
                aria-invalid={Boolean(fieldErrors.wife_name)}
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                  fieldErrors.wife_name ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {fieldErrors.wife_name && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {fieldErrors.wife_name}
                </p>
              )}
            </div>

            {/* Field 5: child_count */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="child_count"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Jumlah Anak
              </label>
              <input
                id="child_count"
                name="child_count"
                type="number"
                min={0}
                value={formData.child_count}
                onChange={(e) => updateField('child_count', e.target.value)}
                disabled={readOnly}
                placeholder="Contoh: 2"
                aria-invalid={Boolean(fieldErrors.child_count)}
                className={`w-full max-w-xs min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                  fieldErrors.child_count ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {fieldErrors.child_count && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {fieldErrors.child_count}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 2: TEMPAT TINGGAL (4 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="section-tempat-tinggal"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Home className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="section-tempat-tinggal"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              2. Tempat Tinggal (4 Field)
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Field 6: house_ownership */}
            <div className="space-y-1.5">
              <label
                htmlFor="house_ownership"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Status Kepemilikan Rumah
                <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
              </label>
              <select
                id="house_ownership"
                name="house_ownership"
                value={formData.house_ownership}
                onChange={(e) =>
                  updateField('house_ownership', e.target.value as HouseOwnership)
                }
                disabled={readOnly}
                aria-invalid={Boolean(fieldErrors.house_ownership)}
                className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                  fieldErrors.house_ownership ? 'border-rose-400' : 'border-slate-300'
                }`}
              >
                <option value="">-- Pilih Status Kepemilikan --</option>
                <option value="Kontrak">Kontrak</option>
                <option value="Milik Sendiri">Milik Sendiri</option>
                <option value="Orang Tua (Menumpang)">Orang Tua (Menumpang)</option>
              </select>
              {fieldErrors.house_ownership && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {fieldErrors.house_ownership}
                </p>
              )}
            </div>

            {/* Field 8: address_matches_ktp */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Alamat Sesuai KTP
              </label>
              <div className="flex items-center gap-4 pt-1">
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="address_matches_ktp"
                    id="address_matches_ktp-yes"
                    checked={formData.address_matches_ktp === true}
                    onChange={() => updateField('address_matches_ktp', true)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Ya</span>
                </label>
                <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="address_matches_ktp"
                    id="address_matches_ktp-no"
                    checked={formData.address_matches_ktp === false}
                    onChange={() => updateField('address_matches_ktp', false)}
                    disabled={readOnly}
                    className="size-4 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tidak</span>
                </label>
              </div>
            </div>

            {/* Field 7: home_address */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="home_address"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Alamat Domisili Tempat Tinggal
              </label>
              <textarea
                id="home_address"
                name="home_address"
                rows={3}
                value={formData.home_address}
                onChange={(e) => updateField('home_address', e.target.value)}
                disabled={readOnly}
                placeholder="Alamat lengkap tempat tinggal saat ini..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100"
              />
            </div>

            {/* Field 9: monthly_rent_amount (CONDITIONAL: only if house_ownership === 'Kontrak') */}
            {formData.house_ownership === 'Kontrak' && (
              <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <MoneyInput
                  id="monthly_rent_amount"
                  name="monthly_rent_amount"
                  label="Biaya Sewa / Kontrak Bulanan"
                  required={true}
                  value={formData.monthly_rent_amount}
                  onChange={(val) => updateField('monthly_rent_amount', val)}
                  disabled={readOnly}
                  error={fieldErrors.monthly_rent_amount}
                  hint="Wajib diisi karena status kepemilikan rumah adalah Kontrak."
                />
              </div>
            )}
          </div>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 3: PENGHIDUPAN (6 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="section-penghidupan"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Wallet className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="section-penghidupan"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              3. Penghidupan (6 Field)
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Field 10: husband_occupation */}
            <div className="space-y-1.5">
              <label
                htmlFor="husband_occupation"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Pekerjaan Kepala Keluarga / Suami
              </label>
              <input
                id="husband_occupation"
                name="husband_occupation"
                type="text"
                value={formData.husband_occupation}
                onChange={(e) => updateField('husband_occupation', e.target.value)}
                disabled={readOnly}
                placeholder="Contoh: Buruh Harian, Pedagang..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100"
              />
              {formData.husband_occupation && (
                <p className="text-xs text-slate-500 font-medium">
                  Tercatat: <span className="font-semibold text-slate-800">{formData.husband_occupation}</span>
                </p>
              )}
            </div>

            {/* Field 11: husband_monthly_income */}
            <div className="space-y-1.5">
              <MoneyInput
                id="husband_monthly_income"
                name="husband_monthly_income"
                label="Penghasilan Bulanan Suami"
                value={formData.husband_monthly_income}
                onChange={(val) => updateField('husband_monthly_income', val)}
                disabled={readOnly}
                placeholder="Rp 0"
              />
            </div>

            {/* Field 12: wife_occupation */}
            <div className="space-y-1.5">
              <label
                htmlFor="wife_occupation"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Pekerjaan Istri
              </label>
              <input
                id="wife_occupation"
                name="wife_occupation"
                type="text"
                value={formData.wife_occupation}
                onChange={(e) => updateField('wife_occupation', e.target.value)}
                disabled={readOnly}
                placeholder="Contoh: Ibu Rumah Tangga, Asisten RT..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100"
              />
            </div>

            {/* Field 13: wife_monthly_income */}
            <div className="space-y-1.5">
              <MoneyInput
                id="wife_monthly_income"
                name="wife_monthly_income"
                label="Penghasilan Bulanan Istri"
                value={formData.wife_monthly_income}
                onChange={(val) => updateField('wife_monthly_income', val)}
                disabled={readOnly}
                placeholder="Rp 0"
              />
            </div>

            {/* Field 14: child_occupation */}
            <div className="space-y-1.5">
              <label
                htmlFor="child_occupation"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Pekerjaan / Aktivitas Anak
              </label>
              <input
                id="child_occupation"
                name="child_occupation"
                type="text"
                value={formData.child_occupation}
                onChange={(e) => updateField('child_occupation', e.target.value)}
                disabled={readOnly}
                placeholder="Contoh: Pelajar, Mahasiswa, Buruh..."
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100"
              />
            </div>

            {/* Field 15: child_monthly_support */}
            <div className="space-y-1.5">
              <MoneyInput
                id="child_monthly_support"
                name="child_monthly_support"
                label="Bantuan / Penghasilan Bulanan Anak"
                value={formData.child_monthly_support}
                onChange={(val) => updateField('child_monthly_support', val)}
                disabled={readOnly}
                placeholder="Rp 0"
              />
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 4: RIWAYAT PERMOHONAN (3 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="section-riwayat"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileCheck className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="section-riwayat"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              4. Riwayat Permohonan (3 Field)
            </h4>
          </div>

          <div className="space-y-4">
            {/* Field 16: assistance_request */}
            <div className="space-y-1.5">
              <label
                htmlFor="assistance_request"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Permohonan Bantuan yang Diajukan
                <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
              </label>
              <textarea
                id="assistance_request"
                name="assistance_request"
                rows={3}
                value={formData.assistance_request}
                onChange={(e) => updateField('assistance_request', e.target.value)}
                disabled={readOnly}
                placeholder="Deskripsikan bentuk bantuan yang diajukan..."
                aria-invalid={Boolean(fieldErrors.assistance_request)}
                className={`w-full rounded-xl border bg-white p-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                  fieldErrors.assistance_request ? 'border-rose-400' : 'border-slate-300'
                }`}
              />
              {fieldErrors.assistance_request && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {fieldErrors.assistance_request}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Field 17: applied_to_baznas_before */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Pernah Mengajukan ke BAZNAS Sebelumnya
                </label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="applied_to_baznas_before"
                      id="applied_to_baznas_before-yes"
                      checked={formData.applied_to_baznas_before === true}
                      onChange={() => updateField('applied_to_baznas_before', true)}
                      disabled={readOnly}
                      className="size-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Ya</span>
                  </label>
                  <label className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="applied_to_baznas_before"
                      id="applied_to_baznas_before-no"
                      checked={formData.applied_to_baznas_before === false}
                      onChange={() => updateField('applied_to_baznas_before', false)}
                      disabled={readOnly}
                      className="size-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tidak</span>
                  </label>
                </div>
              </div>

              {/* Field 18: previous_application_year (CONDITIONAL: only if applied_to_baznas_before === true) */}
              {formData.applied_to_baznas_before === true && (
                <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <label
                    htmlFor="previous_application_year"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Tahun Pengajuan Sebelumnya
                    <span className="ml-1 text-rose-600" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="previous_application_year"
                    name="previous_application_year"
                    type="number"
                    min={1990}
                    max={2099}
                    value={formData.previous_application_year ?? ''}
                    onChange={(e) =>
                      updateField('previous_application_year', e.target.value)
                    }
                    disabled={readOnly}
                    placeholder="Contoh: 2024"
                    aria-invalid={Boolean(fieldErrors.previous_application_year)}
                    className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100 ${
                      fieldErrors.previous_application_year
                        ? 'border-rose-400'
                        : 'border-slate-300'
                    }`}
                  />
                  {fieldErrors.previous_application_year && (
                    <p role="alert" className="text-xs font-semibold text-rose-600">
                      {fieldErrors.previous_application_year}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        {!readOnly && (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={autosaveStatus === 'saving'}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              <Save className="size-4" aria-hidden="true" />
              <span>Simpan Draf</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-extrabold text-white shadow hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden="true" />
              <span>Ajukan Asesmen</span>
            </button>
          </div>
        )}
      </form>

      {/* Irreversible Submission Confirmation Dialog */}
      <IrreversibleActionDialog
        isOpen={isSubmitDialogOpen}
        title="Konfirmasi Pengajuan Asesmen Lapangan"
        description={
          <div className="space-y-2 text-slate-600 text-sm">
            <p>
              Apakah Anda yakin ingin mengajukan formulir asesmen ini?
            </p>
            <p className="text-xs text-slate-500">
              Setelah diajukan, seluruh 18 field sumber akan dikunci dan dibuatkan hash snapshot kriptografis untuk proses peninjauan (review) oleh verifikator berwenang.
            </p>
          </div>
        }
        actionLabel="Ya, Ajukan Asesmen"
        cancelLabel="Periksa Kembali"
        variant="primary"
        isSubmitting={isSubmitting}
        errorMessage={submitError}
        onConfirm={handleConfirmSubmit}
        onClose={() => setIsSubmitDialogOpen(false)}
      />
    </div>
  );
}

export default AssessmentForm;
