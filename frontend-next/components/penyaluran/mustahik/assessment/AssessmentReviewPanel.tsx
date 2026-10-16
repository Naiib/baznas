'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Home,
  Loader2,
  ShieldAlert,
  User,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/api/client';
import type {
  AssessmentDraft,
  AssessmentSourceFields,
} from '@/lib/api/penyaluran-p0-types';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';
import { formatRupiah } from '../shared/MoneyInput';

export interface AssessmentReviewPanelProps {
  mustahikId: number | string;
  assessment: AssessmentDraft & { fields?: AssessmentSourceFields };
  currentUserId?: number | string | null;
  onApproved?: (updated: AssessmentDraft) => void;
  onReturned?: (updated: AssessmentDraft) => void;
  onRefresh?: () => Promise<void> | void;
  className?: string;
  readOnly?: boolean;
}

export function AssessmentReviewPanel({
  mustahikId,
  assessment,
  currentUserId: propUserId,
  onApproved,
  onReturned,
  onRefresh,
  className = '',
  readOnly = false,
}: AssessmentReviewPanelProps) {
  const auth = useAuth();
  const effectiveUserId = propUserId !== undefined ? propUserId : auth?.user?.id ?? null;

  const submitterId =
    assessment.created_by_id ?? assessment.updated_by_id ?? null;

  // Strict role segregation: Submitter cannot approve their own submission
  const isSubmitter = Boolean(
    effectiveUserId !== null &&
      effectiveUserId !== undefined &&
      submitterId !== null &&
      submitterId !== undefined &&
      String(effectiveUserId) === String(submitterId)
  );

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    action: 'accept' | 'return';
    note: string;
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    action: 'accept',
    note: '',
    isSubmitting: false,
    error: null,
  });

  const rawFields = (assessment as any)?.fields || assessment.source_fields || {};
  const fields: AssessmentSourceFields = {
    husband_in_household:
      assessment.husband_in_household !== undefined
        ? assessment.husband_in_household
        : rawFields.husband_in_household ?? null,
    husband_name: assessment.husband_name ?? rawFields.husband_name ?? null,
    wife_in_household:
      assessment.wife_in_household !== undefined
        ? assessment.wife_in_household
        : rawFields.wife_in_household ?? null,
    wife_name: assessment.wife_name ?? rawFields.wife_name ?? null,
    child_count:
      assessment.child_count !== undefined
        ? assessment.child_count
        : rawFields.child_count ?? null,

    house_ownership:
      assessment.house_ownership ?? rawFields.house_ownership ?? null,
    home_address: assessment.home_address ?? rawFields.home_address ?? null,
    address_matches_ktp:
      assessment.address_matches_ktp !== undefined
        ? assessment.address_matches_ktp
        : rawFields.address_matches_ktp ?? null,
    monthly_rent_amount:
      assessment.monthly_rent_amount ?? rawFields.monthly_rent_amount ?? null,

    husband_occupation:
      assessment.husband_occupation ?? rawFields.husband_occupation ?? null,
    husband_monthly_income:
      assessment.husband_monthly_income ?? rawFields.husband_monthly_income ?? null,
    wife_occupation:
      assessment.wife_occupation ?? rawFields.wife_occupation ?? null,
    wife_monthly_income:
      assessment.wife_monthly_income ?? rawFields.wife_monthly_income ?? null,
    child_occupation:
      assessment.child_occupation ?? rawFields.child_occupation ?? null,
    child_monthly_support:
      assessment.child_monthly_support ?? rawFields.child_monthly_support ?? null,

    assistance_request:
      assessment.assistance_request ?? rawFields.assistance_request ?? null,
    applied_to_baznas_before:
      assessment.applied_to_baznas_before !== undefined
        ? assessment.applied_to_baznas_before
        : rawFields.applied_to_baznas_before ?? null,
    previous_application_year:
      assessment.previous_application_year !== undefined
        ? assessment.previous_application_year
        : rawFields.previous_application_year ?? null,
  };

  const handleOpenDialog = (action: 'accept' | 'return') => {
    setDialogState({
      isOpen: true,
      action,
      note: '',
      isSubmitting: false,
      error: null,
    });
  };

  const handleCloseDialog = () => {
    if (dialogState.isSubmitting) return;
    setDialogState((prev) => ({ ...prev, isOpen: false, error: null }));
  };

  const handleConfirmReview = async () => {
    if (!assessment.id) {
      setDialogState((prev) => ({
        ...prev,
        error: 'ID Asesmen tidak ditemukan untuk melakukan aksi peninjauan.',
      }));
      return;
    }

    if (dialogState.action === 'return' && !dialogState.note.trim()) {
      setDialogState((prev) => ({
        ...prev,
        error: 'Catatan wajib diisi jika mengembalikan berkas asesmen.',
      }));
      return;
    }

    setDialogState((prev) => ({ ...prev, isSubmitting: true, error: null }));
    try {
      const res = await api.reviewAssessment(mustahikId, assessment.id, {
        action: dialogState.action,
        note: dialogState.note.trim() || undefined,
      });

      setDialogState((prev) => ({ ...prev, isOpen: false, isSubmitting: false }));

      if (dialogState.action === 'accept') {
        if (res.data) onApproved?.(res.data);
      } else {
        if (res.data) onReturned?.(res.data);
      }
      onRefresh?.();
    } catch (err: any) {
      setDialogState((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.message || 'Gagal memproses peninjauan asesmen.',
      }));
    }
  };

  const formatMoneyOrSource = (val: number | string | null | undefined): string => {
    if (val === null || val === undefined || val === '') {
      return displaySourceValue(val);
    }
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/\D/g, ''));
    if (Number.isNaN(num)) {
      return displaySourceValue(val);
    }
    return formatRupiah(num);
  };

  const formatBooleanOrSource = (val: boolean | null | undefined): string => {
    if (val === null || val === undefined) {
      return displaySourceValue(val);
    }
    return val ? 'Ya' : 'Tidak';
  };

  const canReview = !readOnly && assessment.status !== 'accepted';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Cryptographic Snapshot & Status Banner */}
      <ArtifactStatusBanner
        status={assessment.status || 'submitted'}
        revision={assessment.revision ?? 1}
        snapshotHash={assessment.snapshot_hash}
        title="Tinjauan Asesmen Lapangan (P0)"
        message="Verifikasi 18 field sumber faktual survei mustahik sebelum menetapkan keputusan persetujuan."
      />

      {/* Role Segregation Warning Notice */}
      {isSubmitter && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <ShieldAlert className="size-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black text-amber-950">
                Pemisahan Peran: Submitter Tidak Dapat Menyetujui Sendiri
              </h4>
              <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                Anda tercatat sebagai aktor pembuat/pengaju (submitter) pada asesmen ini (User ID:{' '}
                <span className="font-mono font-bold">{String(submitterId)}</span>). Sesuai prinsip pemisahan wewenang
                P0, persetujuan harus didelegasikan kepada verifikator yang berbeda. Tombol persetujuan dinonaktifkan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 18 Source Fields in Official Order */}
      <div className="space-y-6">
        {/* ============================================================== */}
        {/* SEKSI 1: RUMAH TANGGA (5 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="review-seksi-rumah-tangga"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="review-seksi-rumah-tangga"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              1. Rumah Tangga (5 Field)
            </h4>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Field 1: husband_in_household */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Suami Tinggal Serumah
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {formatBooleanOrSource(fields.husband_in_household)}
              </dd>
            </div>

            {/* Field 2: husband_name */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Nama Suami
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.husband_name)}
              </dd>
            </div>

            {/* Field 3: wife_in_household */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Istri Tinggal Serumah
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {formatBooleanOrSource(fields.wife_in_household)}
              </dd>
            </div>

            {/* Field 4: wife_name */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Nama Istri
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.wife_name)}
              </dd>
            </div>

            {/* Field 5: child_count */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Jumlah Anak
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.child_count)}
              </dd>
            </div>
          </dl>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 2: TEMPAT TINGGAL (4 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="review-seksi-tempat-tinggal"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Home className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="review-seksi-tempat-tinggal"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              2. Tempat Tinggal (4 Field)
            </h4>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Field 6: house_ownership */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Status Kepemilikan Rumah
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.house_ownership)}
              </dd>
            </div>

            {/* Field 8: address_matches_ktp */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Alamat Sesuai KTP
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {formatBooleanOrSource(fields.address_matches_ktp)}
              </dd>
            </div>

            {/* Field 7: home_address */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Alamat Domisili Tempat Tinggal
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 leading-relaxed">
                {displaySourceValue(fields.home_address)}
              </dd>
            </div>

            {/* Field 9: monthly_rent_amount */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Biaya Sewa / Kontrak Bulanan
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-slate-900">
                {formatMoneyOrSource(fields.monthly_rent_amount)}
              </dd>
            </div>
          </dl>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 3: PENGHIDUPAN (6 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="review-seksi-penghidupan"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Wallet className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="review-seksi-penghidupan"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              3. Penghidupan (6 Field)
            </h4>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Field 10: husband_occupation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pekerjaan Kepala Keluarga / Suami
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.husband_occupation)}
              </dd>
            </div>

            {/* Field 11: husband_monthly_income */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Penghasilan Bulanan Suami
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-emerald-800">
                {formatMoneyOrSource(fields.husband_monthly_income)}
              </dd>
            </div>

            {/* Field 12: wife_occupation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pekerjaan Istri
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.wife_occupation)}
              </dd>
            </div>

            {/* Field 13: wife_monthly_income */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Penghasilan Bulanan Istri
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-emerald-800">
                {formatMoneyOrSource(fields.wife_monthly_income)}
              </dd>
            </div>

            {/* Field 14: child_occupation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pekerjaan / Aktivitas Anak
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.child_occupation)}
              </dd>
            </div>

            {/* Field 15: child_monthly_support */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Bantuan / Penghasilan Bulanan Anak
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-emerald-800">
                {formatMoneyOrSource(fields.child_monthly_support)}
              </dd>
            </div>
          </dl>
        </section>

        {/* ============================================================== */}
        {/* SEKSI 4: RIWAYAT PERMOHONAN (3 Fields) */}
        {/* ============================================================== */}
        <section
          aria-labelledby="review-seksi-riwayat"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileCheck className="size-4 text-emerald-600" aria-hidden="true" />
            <h4
              id="review-seksi-riwayat"
              className="text-xs font-extrabold uppercase tracking-wider text-slate-700"
            >
              4. Riwayat Permohonan (3 Field)
            </h4>
          </div>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Field 16: assistance_request */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:col-span-2">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Permohonan Bantuan yang Diajukan
              </dt>
              <dd className="mt-1 text-sm font-bold text-slate-900 leading-relaxed">
                {displaySourceValue(fields.assistance_request)}
              </dd>
            </div>

            {/* Field 17: applied_to_baznas_before */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Pernah Mengajukan ke BAZNAS Sebelumnya
              </dt>
              <dd className="mt-1 text-sm font-extrabold text-slate-900">
                {formatBooleanOrSource(fields.applied_to_baznas_before)}
              </dd>
            </div>

            {/* Field 18: previous_application_year */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tahun Pengajuan Sebelumnya
              </dt>
              <dd className="mt-1 font-mono text-sm font-extrabold text-slate-900">
                {displaySourceValue(fields.previous_application_year)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Action Footer */}
      {canReview && (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => handleOpenDialog('return')}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <XCircle className="size-4" aria-hidden="true" />
            <span>Kembalikan / Tolak</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenDialog('accept')}
            disabled={isSubmitter}
            title={
              isSubmitter
                ? 'Submitter tidak dapat menyetujui pengajuannya sendiri (Pemisahan Peran)'
                : 'Setujui hasil asesmen lapangan ini'
            }
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-extrabold text-white shadow focus-visible:outline-none focus-visible:ring-4 ${
              isSubmitter
                ? 'bg-slate-300 cursor-not-allowed opacity-60 text-slate-600'
                : 'bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-200'
            }`}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <span>Setujui Asesmen</span>
          </button>
        </div>
      )}

      {/* Irreversible Action Dialog for Accept or Return */}
      <IrreversibleActionDialog
        isOpen={dialogState.isOpen}
        title={
          dialogState.action === 'accept'
            ? 'Persetujuan Asesmen Lapangan'
            : 'Pengembalian Berkas Asesmen'
        }
        description={
          dialogState.action === 'accept' ? (
            <p>
              Dengan menyetujui asesmen ini, data 18 field akan disahkan dan kasus akan beralih ke tahap persetujuan berjenjang MPZIS.
            </p>
          ) : (
            <p>
              Mengembalikan asesmen akan membekukan revisi saat ini dan mewajibkan amil survei untuk membuat draf koreksi (revisi baru).
            </p>
          )
        }
        actionLabel={
          dialogState.action === 'accept' ? 'Setujui Asesmen' : 'Kembalikan Berkas'
        }
        variant={dialogState.action === 'accept' ? 'primary' : 'danger'}
        snapshotHash={assessment.snapshot_hash}
        noteLabel={
          dialogState.action === 'accept' ? 'Catatan Persetujuan (Opsional)' : 'Catatan Pengembalian'
        }
        noteRequired={dialogState.action === 'return'}
        notePlaceholder={
          dialogState.action === 'accept'
            ? 'Tuliskan catatan kelayakan jika ada...'
            : 'Tuliskan alasan pengembalian atau data yang perlu dikoreksi...'
        }
        noteValue={dialogState.note}
        onNoteChange={(val) => setDialogState((prev) => ({ ...prev, note: val }))}
        isSubmitting={dialogState.isSubmitting}
        errorMessage={dialogState.error}
        onConfirm={handleConfirmReview}
        onClose={handleCloseDialog}
      />
    </div>
  );
}

export default AssessmentReviewPanel;
