'use client';

import React, { useCallback, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Hash,
  History,
  Home,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/components/auth/AuthProvider';
import type {
  ArtifactFile,
  P0CaseWorkspace,
  P0MpzisApprovalCard,
} from '@/lib/api/penyaluran-p0-types';
import { ApprovalTimeline } from '../shared/ApprovalTimeline';
import { ArtifactStatusBanner, displaySourceValue } from '../shared/ArtifactStatusBanner';
import { formatRupiah } from '../shared/MoneyInput';
import { AssessmentForm } from '../assessment/AssessmentForm';
import { AssessmentReviewPanel } from '../assessment/AssessmentReviewPanel';
import { MpzisForm } from '../mpzis/MpzisForm';
import { MpzisApprovalStepper } from '../mpzis/MpzisApprovalStepper';
import { PpdForm } from '../ppd/PpdForm';
import { FinanceApprovalPanel } from '../ppd/FinanceApprovalPanel';
import { PaymentEvidencePanel } from '../ppd/PaymentEvidencePanel';
import { RecipientConfirmationPanel } from '../ppd/RecipientConfirmationPanel';
import { SystemReceiptPanel } from '../ppd/SystemReceiptPanel';
import { CaseProgressSummary } from './CaseProgressSummary';

export { displaySourceValue };

export type CaseWorkflowTab = 'summary' | 'process' | 'documents' | 'history';

export interface CaseWorkflowPanelProps {
  workspace: P0CaseWorkspace;
  activeTab?: CaseWorkflowTab;
  onTabChange?: (tab: CaseWorkflowTab) => void;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  className?: string;
  currentUserId?: number | string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Belum dicatat';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return String(dateStr);
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function CaseWorkflowPanel({
  workspace,
  activeTab: controlledTab,
  onTabChange,
  onRefresh,
  isRefreshing = false,
  className = '',
  currentUserId: propUserId,
}: CaseWorkflowPanelProps) {
  const auth = useAuth();
  const currentUserId = propUserId !== undefined ? propUserId : auth?.user?.id ?? null;
  const [internalTab, setInternalTab] = useState<CaseWorkflowTab>('summary');
  const activeTab = controlledTab ?? internalTab;
  const handleTabSelect = (tab: CaseWorkflowTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const [downloadingFileId, setDownloadingFileId] = useState<number | string | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [reconcileNote, setReconcileNote] = useState('');
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const [startReconcileModalOpen, setStartReconcileModalOpen] = useState(false);
  const [startReconcileNote, setStartReconcileNote] = useState('');
  const [isSubmittingStartReconcile, setIsSubmittingStartReconcile] = useState(false);
  const [startReconcileError, setStartReconcileError] = useState<string | null>(null);

  const tabsList: Array<{ id: CaseWorkflowTab; label: string; icon: typeof FileText }> = [
    { id: 'summary', label: 'Ringkasan', icon: User },
    { id: 'process', label: 'Proses', icon: FileCheck2 },
    { id: 'documents', label: 'Dokumen', icon: FileText },
    { id: 'history', label: 'Riwayat', icon: History },
  ];

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabsList.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabsList.length) % tabsList.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabsList.length - 1;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      const nextTab = tabsList[nextIndex]!.id;
      handleTabSelect(nextTab);
      const tabBtn = document.getElementById(`case-tab-${nextTab}`);
      tabBtn?.focus();
    }
  };

  const handleDownloadFile = async (file: ArtifactFile) => {
    setDownloadingFileId(file.id);
    setDownloadError(null);
    try {
      const blob = typeof file.id === 'string'
        ? await api.downloadCaseDocument(file.download_url || '')
        : await api.downloadArtifact(workspace.case.id, file.id, 'attachment');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name || file.filename || `dokumen-${file.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(`Gagal mengunduh berkas ${file.original_name || file.id}: ${err.message}`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDownloadReceipt = async () => {
    setDownloadingReceipt(true);
    setDownloadError(null);
    try {
      const ppdId = workspace.ppd?.id || 1;
      const blob = await api.downloadReceipt(workspace.case.id, ppdId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bukti-penyaluran-${workspace.case.file_no.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(`Gagal mengunduh bukti digital penyaluran: ${err.message}`);
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const user = auth?.user;
  const role = user?.role ?? '';
  const level = user?.level ?? '';
  const isAdmin =
    String(role).toLowerCase() === 'admin' ||
    String(level).toLowerCase() === 'admin' ||
    Boolean((user as any)?.isAdmin);

  const isReconciliation =
    workspace.case?.workflow_mode === 'legacy_reconciliation' ||
    Boolean(workspace.case?.is_reconciliation) ||
    Boolean(workspace.case?.reconciliation_banner);
  const isLegacy = Boolean(workspace.case?.is_legacy || workspace.case?.legacy_banner);
  const canReconcile = Boolean(isAdmin || workspace.capabilities?.admin_recovery || workspace.permissions?.can_archive);
  // Controlled artifact rebuilding during reconciliation:
  // Routine operational mutations remain blocked, but authorized reconciliation actors can rebuild missing artifacts
  const isReadOnly = isLegacy || (isReconciliation && !canReconcile);

  const handleStartReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = startReconcileNote.trim();
    if (!trimmed) {
      setStartReconcileError('Catatan rekonsiliasi wajib diisi.');
      return;
    }
    if (trimmed.length < 20 || trimmed.length > 1000) {
      setStartReconcileError('Catatan rekonsiliasi wajib antara 20 dan 1000 karakter.');
      return;
    }
    setIsSubmittingStartReconcile(true);
    setStartReconcileError(null);
    try {
      await api.startLegacyReconciliation(workspace.case.id, {
        note: trimmed,
      });
      setStartReconcileModalOpen(false);
      setStartReconcileNote('');
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setStartReconcileError(err.message || 'Gagal memulai rekonsiliasi');
    } finally {
      setIsSubmittingStartReconcile(false);
    }
  };

  const handleCompleteReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reconcileNote.trim();
    if (!trimmed) {
      setReconcileError('Catatan rekonsiliasi wajib diisi.');
      return;
    }
    if (trimmed.length < 20 || trimmed.length > 1000) {
      setReconcileError('Catatan rekonsiliasi wajib antara 20 dan 1000 karakter.');
      return;
    }
    setIsSubmittingReconcile(true);
    setReconcileError(null);
    try {
      await api.completeLegacyReconciliation(workspace.case.id, {
        note: trimmed,
      });
      setReconcileModalOpen(false);
      setReconcileNote('');
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setReconcileError(err.message || 'Gagal menyelesaikan rekonsiliasi');
    } finally {
      setIsSubmittingReconcile(false);
    }
  };

  const isCaseCompleted =
    workspace.case?.status === 'Penyaluran Selesai' ||
    workspace.case_progress?.current_stage === 'completed';

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {/* Header Section */}
      <div className="border-b border-slate-200 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900">
                {displaySourceValue(workspace.mustahik?.nama || workspace.mustahik?.name)}
              </h2>
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                {displaySourceValue(workspace.case?.status)}
              </span>
              {workspace.case?.workflow_mode && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                  mode:{workspace.case.workflow_mode}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>No. Pengajuan: <strong className="font-mono text-slate-800">{displaySourceValue(workspace.case?.file_no)}</strong></span>
              {workspace.case?.nomor_registrasi && (
                <span>Reg: <strong className="font-mono text-slate-800">{workspace.case.nomor_registrasi}</strong></span>
              )}
              <span>Tanggal: <strong className="text-slate-800">{formatDate(workspace.case?.created_at)}</strong></span>
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={isRefreshing}
              aria-label="Segarkan data kasus"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} aria-hidden="true" />
              Segarkan
            </button>
          )}
        </div>
      </div>

      {/* Legacy Warning Banner */}
      {isLegacy && !isReconciliation && (
        <div className="border-b border-amber-200 bg-amber-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ArtifactStatusBanner
              isLegacy={true}
              title="Arsip Berkas Kasus Legacy"
              message="Perhatian: Data ini merupakan arsip legacy sebelum migrasi P0. Dokumen dan kelayakan belum diverifikasi secara digital melalui standar P0."
            />
            {canReconcile && (
              <button
                type="button"
                onClick={() => setStartReconcileModalOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 shrink-0"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Mulai Rekonsiliasi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Reconciliation In-Progress Banner */}
      {isReconciliation && (
        <div className="border-b border-sky-200 bg-sky-50/80 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Clock className="size-5 text-sky-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold text-sky-950">
                  Rekonsiliasi Berkas Legacy Sedang Berlangsung
                </h3>
                <p className="mt-1 text-xs text-sky-800">
                  Kasus dalam mode rekonsiliasi data legacy ke standar P0. Tindakan operasional rutin P0 ditangguhkan hingga proses rekonsiliasi selesai.
                </p>
                {canReconcile && (
                  <p className="mt-1 text-[11px] font-semibold text-sky-900">
                    Mode Rekonstruksi Berkas: Anda memiliki wewenang administrator untuk merekonstruksi artefak digital P0 yang dibutuhkan.
                  </p>
                )}
              </div>
            </div>
            {canReconcile && (
              <button
                type="button"
                onClick={() => setReconcileModalOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 shrink-0"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Selesaikan Rekonsiliasi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {downloadError && (
        <div role="alert" className="border-b border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          {downloadError}
        </div>
      )}

      {/* Tabs Navigation (WAI-ARIA Pattern) */}
      <div className="border-b border-slate-200 px-4 md:px-6">
        <div
          role="tablist"
          aria-label="Navigasi Alur Kasus Mustahik"
          className="flex space-x-1 sm:space-x-4 overflow-x-auto"
        >
          {tabsList.map((tab, idx) => {
            const isSelected = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                type="button"
                role="tab"
                key={tab.id}
                id={`case-tab-${tab.id}`}
                aria-controls={`case-panel-${tab.id}`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => handleTabSelect(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isSelected
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="p-4 md:p-6">
        {/* ============================================================== */}
        {/* TAB 1: RINGKASAN (SUMMARY) */}
        {/* ============================================================== */}
        {activeTab === 'summary' && (
          <div
            role="tabpanel"
            id="case-panel-summary"
            aria-labelledby="case-tab-summary"
            tabIndex={0}
            className="space-y-6 focus:outline-none"
          >
            {/* Stage Progress Summary */}
            <CaseProgressSummary
              progress={workspace.case_progress}
              caseHeader={workspace.case}
            />

            {/* Profile Information Grid (Clean Server-Truth) */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Box 1: Identitas Kependudukan */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <User className="size-4 text-emerald-600" aria-hidden="true" />
                  Identitas Kependudukan
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      NIK Kependudukan
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-extrabold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.nik_masked)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kontak WhatsApp / Telp
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-extrabold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.phone_masked)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Status Pemohon
                    </dt>
                    <dd className="mt-1 text-sm font-extrabold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.applicant_status)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kategori / Asnaf
                    </dt>
                    <dd className="mt-1 text-sm font-extrabold text-emerald-800">
                      {displaySourceValue(workspace.mustahik?.asnaf || workspace.mustahik?.kategori)}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Box 2: Alamat Domisili & Program */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <MapPin className="size-4 text-emerald-600" aria-hidden="true" />
                  Domisili &amp; Program BAZNAS
                </div>

                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Alamat Lengkap
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-slate-900">
                      {displaySourceValue(workspace.mustahik?.address)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      RT / RW
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-bold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.rt_rw)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kelurahan
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.kelurahan)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kecamatan
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.kecamatan)}
                    </dd>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Kabupaten / Kota
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-slate-900">
                      {displaySourceValue(workspace.mustahik?.kabupaten_kota || workspace.mustahik?.province)}
                    </dd>
                  </div>

                  <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Program BAZNAS
                    </dt>
                    <dd className="mt-1 text-sm font-black text-emerald-950">
                      {displaySourceValue(workspace.mustahik?.program)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: PROSES (PROCESS & ACTIVE ARTIFACT) */}
        {/* ============================================================== */}
        {activeTab === 'process' && (
          <div
            role="tabpanel"
            id="case-panel-process"
            aria-labelledby="case-tab-process"
            tabIndex={0}
            className="space-y-6 focus:outline-none"
          >
            {/* Active Artifact Status Header */}
            <ArtifactStatusBanner
              status={
                workspace.case_progress?.active_artifact ||
                workspace.case_progress?.current_stage
              }
              revision={
                workspace.assessment?.revision ||
                workspace.mpzis?.revision ||
                workspace.ppd?.revision ||
                null
              }
              snapshotHash={
                workspace.assessment?.snapshot_hash ||
                workspace.mpzis?.snapshot_hash ||
                workspace.ppd?.snapshot_hash ||
                null
              }
              title={`Tahapan Aktif: ${workspace.case_progress?.current_stage.toUpperCase()}`}
              blockingReasons={workspace.case_progress?.blocking_reasons}
            />

            {/* Stage-Specific Dispatcher */}
            {workspace.case_progress?.current_stage === 'intake' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-base font-extrabold text-slate-900">Intake Berkas Terdaftar</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Pendaftaran kasus telah diterima. Silakan verifikasi data kependudukan sebelum beralih ke Asesmen Lapangan.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700">
                    File No: {workspace.case.file_no}
                  </span>
                  {workspace.permissions?.can_assess && (
                    <span className="text-xs font-semibold text-emerald-700">
                      ✓ Memiliki wewenang mengisi asesmen lapangan
                    </span>
                  )}
                </div>
              </div>
            )}

            {(workspace.case_progress?.current_stage === 'assessment' ||
              workspace.case_progress?.active_artifact === 'assessment') && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {workspace.assessment?.status === 'submitted' ||
                workspace.assessment?.status === 'accepted' ? (
                  <AssessmentReviewPanel
                    mustahikId={workspace.case.id}
                    assessment={workspace.assessment as any}
                    currentUserId={currentUserId}
                    onRefresh={onRefresh}
                  />
                ) : (
                  <AssessmentForm
                    mustahikId={workspace.case.id}
                    initialDraft={workspace.assessment as any}
                    initialFields={workspace.assessment?.fields}
                    onSaved={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onSubmitted={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    readOnly={isReadOnly}
                    isLegacy={isLegacy}
                  />
                )}
              </div>
            )}

            {(workspace.case_progress?.current_stage === 'mpzis' ||
              workspace.case_progress?.active_artifact === 'mpzis') && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {!workspace.mpzis || workspace.mpzis.status === 'draft' ? (
                  <MpzisForm
                    mustahikId={workspace.case.id}
                    initialDraft={workspace.mpzis as any}
                    initialFields={workspace.mpzis ? (workspace.mpzis as any).source_fields : null}
                    mustahikProfile={workspace.mustahik}
                    onSaved={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onSubmitted={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    readOnly={isReadOnly}
                    isLegacy={isLegacy}
                  />
                ) : (
                  <MpzisApprovalStepper
                    mustahikId={workspace.case.id}
                    mpzis={workspace.mpzis as any}
                    approvalSteps={workspace.mpzis_approvals || (workspace.mpzis as any)?.approvals || []}
                    currentUserId={currentUserId}
                    onStepDecided={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onRefresh={onRefresh}
                    readOnly={isReadOnly}
                  />
                )}
              </div>
            )}


            {/* PPD & Finance Disbursement & Confirmation & Completion Stages */}
            {(workspace.case_progress?.current_stage === 'ppd' ||
              workspace.case_progress?.active_artifact === 'ppd' ||
              workspace.case_progress?.current_stage === 'payment' ||
              workspace.case_progress?.current_stage === 'confirmation') && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                {/* 1. If PPD is draft or returned: Render PpdForm */}
                {(!workspace.ppd ||
                  workspace.ppd.status === 'draft' ||
                  workspace.ppd.status === 'returned') && (
                  <PpdForm
                    mustahikId={workspace.case.id}
                    initialDraft={workspace.ppd as any}
                    initialFields={workspace.ppd ? (workspace.ppd as any).source_fields : null}
                    mpzisAllocation={workspace.mpzis?.total_amount}
                    onSaved={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onSubmitted={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    readOnly={isReadOnly}
                    isLegacy={isLegacy}
                  />
                )}

                {/* 2. If PPD is submitted or finance_checked: Render FinanceApprovalPanel */}
                {(workspace.ppd?.status === 'submitted' ||
                  workspace.ppd?.status === 'finance_checked') && (
                  <FinanceApprovalPanel
                    mustahikId={workspace.case.id}
                    ppd={workspace.ppd as any}
                    currentUserId={currentUserId}
                    onDecided={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onRefresh={onRefresh}
                    readOnly={isReadOnly}
                    capabilities={workspace.capabilities}
                  />
                )}

                {/* 3. If PPD is finance_approved or payment_recorded: Render PaymentEvidencePanel */}
                {(workspace.ppd?.status === 'finance_approved' ||
                  workspace.ppd?.status === 'payment_recorded') && (
                  <PaymentEvidencePanel
                    mustahikId={workspace.case.id}
                    ppd={workspace.ppd as any}
                    disbursement={workspace.disbursement}
                    currentUserId={currentUserId}
                    onPaymentRecorded={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onPaymentVerified={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onRefresh={onRefresh}
                    readOnly={isReadOnly}
                    capabilities={workspace.capabilities}
                  />
                )}

                {/* 4. If PPD is payment_verified: Render RecipientConfirmationPanel */}
                {workspace.ppd?.status === 'payment_verified' && (
                  <RecipientConfirmationPanel
                    mustahikId={workspace.case.id}
                    ppd={workspace.ppd as any}
                    recipientNameSnapshot={workspace.mustahik?.nama || workspace.mustahik?.name}
                    completion={workspace.completion}
                    onConfirmed={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onRefresh={onRefresh}
                    readOnly={isReadOnly}
                  />
                )}

                {/* 5. If PPD is recipient_confirmed: Render SystemReceiptPanel */}
                {workspace.ppd?.status === 'recipient_confirmed' && (
                  <SystemReceiptPanel
                    mustahikId={workspace.case.id}
                    ppd={workspace.ppd as any}
                    completion={workspace.completion}
                    fileNo={workspace.case.file_no}
                    isCompleted={isCaseCompleted}
                    onCompleted={async () => {
                      if (onRefresh) await onRefresh();
                    }}
                    onRefresh={onRefresh}
                    readOnly={isReadOnly}
                  />
                )}
              </div>
            )}

            {(workspace.case_progress?.current_stage === 'completion' ||
              workspace.case_progress?.current_stage === 'completed' ||
              workspace.case?.status === 'Penyaluran Selesai' ||
              workspace.ppd?.status === 'completed') &&
              workspace.case_progress?.current_stage !== 'ppd' &&
              workspace.case_progress?.current_stage !== 'payment' &&
              workspace.case_progress?.current_stage !== 'confirmation' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <SystemReceiptPanel
                  mustahikId={workspace.case.id}
                  ppd={workspace.ppd as any}
                  completion={workspace.completion}
                  fileNo={workspace.case.file_no}
                  isCompleted={isCaseCompleted}
                  onCompleted={async () => {
                    if (onRefresh) await onRefresh();
                  }}
                  onRefresh={onRefresh}
                  readOnly={isReadOnly}
                />
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: DOKUMEN (DOCUMENTS) */}
        {/* ============================================================== */}
        {activeTab === 'documents' && (
          <div
            role="tabpanel"
            id="case-panel-documents"
            aria-labelledby="case-tab-documents"
            tabIndex={0}
            className="space-y-4 focus:outline-none"
          >
            {workspace.documents && workspace.documents.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider">Nama Dokumen</th>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider">Jenis</th>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider">Ukuran</th>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider">SHA-256</th>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider">Tanggal</th>
                      <th className="p-3.5 font-extrabold uppercase tracking-wider text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspace.documents.map((file) => {
                      const isDownloading = downloadingFileId === file.id;
                      return (
                        <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              <FileText className="size-4 text-emerald-600 shrink-0" aria-hidden="true" />
                              <span className="font-bold text-slate-900">
                                {file.original_name || file.filename || 'Dokumen Tanpa Judul'}
                              </span>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-600 font-medium">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {file.kind}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-slate-500">
                            {formatBytes(file.byte_size)}
                          </td>
                          <td className="p-3.5 font-mono text-slate-400" title={file.sha256 || undefined}>
                            {file.sha256 ? `${file.sha256.slice(0, 8)}...` : '-'}
                          </td>
                          <td className="p-3.5 text-slate-500">
                            {formatDate(file.created_at)}
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleDownloadFile(file)}
                              disabled={isDownloading}
                              aria-label={`Unduh berkas ${file.original_name || file.id}`}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                            >
                              {isDownloading ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Download className="size-3.5" aria-hidden="true" />
                              )}
                              Unduh
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                <FileText className="size-10 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Belum ada dokumen digital yang tersimpan pada pengajuan ini.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Dokumen pendukung akan tercantum setelah diunggah melalui formulir asesmen atau intake.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: RIWAYAT (HISTORY & APPROVAL TIMELINE) */}
        {/* ============================================================== */}
        {activeTab === 'history' && (
          <div
            role="tabpanel"
            id="case-panel-history"
            aria-labelledby="case-tab-history"
            tabIndex={0}
            className="space-y-4 focus:outline-none"
          >
            <ApprovalTimeline
              events={workspace.timeline || workspace.history || []}
              emptyMessage="Belum ada riwayat aktivitas atau persetujuan digital tercatat."
            />
          </div>
        )}
      </div>

      {/* Start Reconcile Modal */}
      {startReconcileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-reconcile-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-900/10">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                  <RefreshCw className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="start-reconcile-modal-title" className="text-base font-bold text-slate-900">
                    Mulai Rekonsiliasi Berkas Legacy
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kasus: {displaySourceValue(workspace.case?.file_no)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartReconcileModalOpen(false);
                  setStartReconcileError(null);
                }}
                aria-label="Tutup dialog mulai rekonsiliasi"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleStartReconcile} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tindakan ini akan memindahkan kasus legacy ke mode rekonsiliasi P0 (workflow_mode: legacy_reconciliation), mencatat snapshot status legacy, dan memungkinkan rekonstruksi artefak verifikasi digital berjenjang.
              </p>

              {startReconcileError && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {startReconcileError}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="start-reconcile-note"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Alasan Rekonsiliasi <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {startReconcileNote.trim().length}/1000 (min. 20)
                  </span>
                </div>
                <textarea
                  id="start-reconcile-note"
                  required
                  rows={3}
                  value={startReconcileNote}
                  onChange={(e) => setStartReconcileNote(e.target.value)}
                  placeholder="Penjelasan kebutuhan rekonsiliasi berkas legacy ke standar P0 (minimal 20 karakter)..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStartReconcileModalOpen(false);
                    setStartReconcileError(null);
                  }}
                  disabled={isSubmittingStartReconcile}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStartReconcile}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
                >
                  {isSubmittingStartReconcile && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  Konfirmasi Mulai Rekonsiliasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reconcile Completion Modal */}
      {reconcileModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reconcile-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-900/10">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-100 p-2 text-sky-700">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="reconcile-modal-title" className="text-base font-bold text-slate-900">
                    Selesaikan Rekonsiliasi Berkas
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kasus: {displaySourceValue(workspace.case?.file_no)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReconcileModalOpen(false);
                  setReconcileError(null);
                }}
                aria-label="Tutup dialog rekonsiliasi"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCompleteReconcile} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tindakan ini akan menyelesaikan masa penangguhan rekonsiliasi legacy untuk berkas ini, mencatat audit trail rekonsiliasi, dan mengembalikan status ke alur operasional standar P0.
              </p>

              {reconcileError && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                  {reconcileError}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="reconcile-note"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Catatan Rekonsiliasi <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {reconcileNote.trim().length}/1000 (min. 20)
                  </span>
                </div>
                <textarea
                  id="reconcile-note"
                  required
                  rows={3}
                  value={reconcileNote}
                  onChange={(e) => setReconcileNote(e.target.value)}
                  placeholder="Ringkasan verifikasi atau alasan penyelesaian rekonsiliasi (minimal 20 karakter)..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReconcileModalOpen(false);
                    setReconcileError(null);
                  }}
                  disabled={isSubmittingReconcile}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReconcile}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-sky-700 px-5 py-2 text-xs font-bold text-white shadow hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50"
                >
                  {isSubmittingReconcile && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  Konfirmasi Selesai Rekonsiliasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CaseWorkflowPanel;
