'use client';

import React, { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FileText,
  Building,
  User,
  CreditCard,
  Layers,
  Sparkles,
  RotateCcw,
  Check,
  Calendar,
  Phone,
  Mail,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  Plus,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type {
  CreateManualTransactionPayload,
  PenerimaanChannel,
  PenerimaanFundType,
  PenerimaanTransaction,
} from '@/lib/api/types';

const STORAGE_KEY = 'baznas_penerimaan_manual_intake_draft';
const APPROVAL_THRESHOLD = 10_000_000; // Rp10.000.000

interface FormState {
  // Step 1: Channel & Source
  channel: PenerimaanChannel;
  bank_name: string;
  bank_account_number: string;
  transaction_date: string;

  // Step 2: Muzakki
  muzakki_type: 'individu' | 'lembaga';
  muzakki_name: string;
  muzakki_phone: string;
  muzakki_email: string;
  muzakki_identifier: string; // NIK / NPWP
  muzakki_address: string;

  // Step 3: Fund & Program
  fund_type: PenerimaanFundType;
  program_name: string;
  sub_program: string;
  amount: string; // formatted string e.g. "2.500.000"

  // Step 4: Evidence & Notes
  evidence_url: string;
  evidence_name: string;
  provider_ref: string;
  notes: string;
}

const INITIAL_FORM_STATE: FormState = {
  channel: 'counter_kasir',
  bank_name: 'Kas Kantor BAZNAS',
  bank_account_number: '',
  transaction_date: new Date().toISOString().split('T')[0] ?? '',

  muzakki_type: 'individu',
  muzakki_name: '',
  muzakki_phone: '',
  muzakki_email: '',
  muzakki_identifier: '',
  muzakki_address: '',

  fund_type: 'zakat_maal',
  program_name: 'Tangerang Peduli',
  sub_program: '',
  amount: '',

  evidence_url: '',
  evidence_name: '',
  provider_ref: '',
  notes: '',
};

const CHANNELS: { value: PenerimaanChannel; label: string; description: string; icon: any }[] = [
  {
    value: 'counter_kasir',
    label: 'Counter Kasir',
    description: 'Penerimaan langsung di loket / kasir kantor BAZNAS',
    icon: Building,
  },
  {
    value: 'jemput_zakat',
    label: 'Jemput Zakat',
    description: 'Layanan petugas amil jemput donasi ke rumah/kantor muzakki',
    icon: User,
  },
  {
    value: 'bank_transfer',
    label: 'Transfer Bank Manual',
    description: 'Pencatatan manual mutasi rekening giro/tabungan BAZNAS',
    icon: CreditCard,
  },
];

const FUND_TYPES: { value: PenerimaanFundType; label: string; desc: string }[] = [
  { value: 'zakat_maal', label: 'Zakat Maal', desc: 'Zakat harta, tabungan, perdagangan, atau emas' },
  { value: 'zakat_penghasilan', label: 'Zakat Penghasilan', desc: 'Zakat profesi bulanan atau honorarium' },
  { value: 'zakat_fitrah', label: 'Zakat Fitrah', desc: 'Zakat jiwa saat bulan Ramadan' },
  { value: 'infak', label: 'Infak / Sedekah Umum', desc: 'Dana infak umum tidak terikat' },
  { value: 'infak_terikat', label: 'Infak Terikat', desc: 'Infak khusus untuk program atau peruntukan tertentu' },
  { value: 'fidyah', label: 'Fidyah & Kafarat', desc: 'Pengganti puasa dan tebusan syariat' },
  { value: 'csr', label: 'CSR & Kemitraan', desc: 'Dana hibah sosial korporat atau lembaga' },
];

const PROGRAMS: string[] = [
  'Tangerang Peduli (Kemanusiaan & Bencana)',
  'Tangerang Sehat (Bantuan Medis & Sanitasi)',
  'Tangerang Cerdas (Pendidikan & Beasiswa)',
  'Tangerang Makmur (Pemberdayaan Ekonomi Mustahik)',
  'Tangerang Takwa (Dakwah & Advokasi Keagamaan)',
  'Program Non-Pilar / Operasional',
];

const BANK_OPTIONS: { name: string; account: string }[] = [
  { name: 'Kas Kantor BAZNAS', account: 'LOKET-KASIR' },
  { name: 'Bank Syariah Indonesia (BSI)', account: '7001-2345-67' },
  { name: 'Bank Muamalat', account: '3410-0987-12' },
  { name: 'Bank BJB Syariah', account: '5220-4411-99' },
  { name: 'Bank DKI Syariah', account: '7110-8822-33' },
];

function formatRupiahDisplay(num: number | string | bigint | null | undefined): string {
  if (num === null || num === undefined || num === '') return 'Rp 0';
  const clean = String(num).trim().replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const isNegative = clean.startsWith('-');
  const digits = isNegative ? clean.slice(1) : clean;
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return `${isNegative ? '-Rp ' : 'Rp '}${parts.join('.')}`;
}

function parseNominal(str: string): number {
  const clean = str.replace(/[^\d]/g, '');
  return parseInt(clean, 10) || 0;
}

export function TransactionForm() {
  const router = useRouter();
  const formId = useId();

  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM_STATE);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<PenerimaanTransaction | null>(null);

  // Check saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.muzakki_name) {
          setHasDraft(true);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Save draft on change
  const saveDraft = (nextData: FormState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
      setHasDraft(true);
    } catch {
      // ignore
    }
  };

  const handleRestoreDraft = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setFormData(JSON.parse(saved));
        setHasDraft(false);
      }
    } catch {
      // ignore
    }
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setHasDraft(false);
    } catch {
      // ignore
    }
  };

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      saveDraft(next);
      return next;
    });
    setErrorMessage(null);
  };

  const handleAmountChange = (raw: string) => {
    const digitsOnly = raw.replace(/[^\d]/g, '');
    if (!digitsOnly) {
      updateField('amount', '');
      return;
    }
    const num = parseInt(digitsOnly, 10);
    updateField('amount', num.toLocaleString('id-ID'));
  };

  // Upload Evidence File
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setErrorMessage(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await penerimaanApi.uploadEvidence(fd);
      if (res?.data?.file_url) {
        updateField('evidence_url', res.data.file_url);
        updateField('evidence_name', file.name);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengunggah berkas bukti';
      setErrorMessage(message);
    } finally {
      setUploading(false);
    }
  };

  // Step Validation
  const validateStep = (currentStep: number): boolean => {
    setErrorMessage(null);

    if (currentStep === 1) {
      if (!formData.channel) {
        setErrorMessage('Kanal penerimaan wajib dipilih.');
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!formData.muzakki_name.trim()) {
        setErrorMessage('Nama lengkap muzakki atau lembaga wajib diisi.');
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      const nominal = parseNominal(formData.amount);
      if (isNaN(nominal) || nominal <= 0) {
        setErrorMessage('Nominal transaksi harus lebih besar dari Rp 0.');
        return false;
      }
      if (!formData.fund_type) {
        setErrorMessage('Jenis dana ZIS wajib dipilih.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  // Final Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) {
      setStep(3);
      return;
    }

    const nominal = parseNominal(formData.amount);
    setSubmitting(true);
    setErrorMessage(null);

    const payload: CreateManualTransactionPayload = {
      channel: formData.channel,
      fund_type: formData.fund_type,
      amount: nominal,
      muzakki_name: formData.muzakki_name.trim(),
      muzakki_phone: formData.muzakki_phone.trim() || undefined,
      muzakki_email: formData.muzakki_email.trim() || undefined,
      bank_name: formData.bank_name || undefined,
      bank_account_number: formData.bank_account_number || undefined,
      program_name: formData.program_name || undefined,
      sub_program: formData.sub_program.trim() || undefined,
      evidence_url: formData.evidence_url || undefined,
      notes: formData.notes.trim() || undefined,
      payment_method: formData.channel === 'counter_kasir' ? 'cash' : 'transfer',
    };

    try {
      const res = await penerimaanApi.createManualTransaction(payload);
      if (res?.data) {
        setSuccessResult(res.data);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kegagalan saat menyimpan transaksi.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  const numericAmount = parseNominal(formData.amount);
  const requiresApproval = numericAmount >= APPROVAL_THRESHOLD;

  // Render Success Screen
  if (successResult) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-lg sm:p-12">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-9" />
          </div>

          <h2 className="mt-6 text-2xl font-black text-zinc-900">
            Transaksi Berhasil Dicatat!
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Bukti Setor Zakat (BSZ) telah dibuat secara otomatis dan siap untuk proses validasi.
          </p>

          <div className="mt-8 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 text-left text-xs">
            <div className="flex justify-between py-2">
              <span className="font-medium text-zinc-500">Nomor Transaksi:</span>
              <span className="font-mono font-bold text-zinc-900">{successResult.transaction_number}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-medium text-zinc-500">Nomor BSZ (Kuitansi):</span>
              <span className="font-mono font-bold text-emerald-700">{successResult.receipt_number || '-'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-medium text-zinc-500">Nama Muzakki:</span>
              <span className="font-bold text-zinc-900">{successResult.muzakki_name}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-medium text-zinc-500">Nominal ZIS:</span>
              <span className="font-bold text-emerald-700">{formatRupiahDisplay(successResult.amount)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="font-medium text-zinc-500">Status Awal:</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">
                {successResult.status}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/penerimaan/transaksi"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
            >
              <FileText className="size-4" />
              <span>Lihat Daftar Transaksi</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setFormData(INITIAL_FORM_STATE);
                setStep(1);
                setSuccessResult(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-3 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-50"
            >
              <Plus className="size-4" />
              <span>Input Transaksi Baru Lagi</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/penerimaan/transaksi"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 transition hover:text-zinc-900"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke Transaksi</span>
          </Link>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-900">
            Input Transaksi Penerimaan Manual
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pencatatan langsung setoran donatur melalui kasir kantor, layanan jemput zakat, atau transfer giro.
          </p>
        </div>
      </div>

      {/* Resume Draft Banner */}
      {hasDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-3 text-xs shadow-2xs">
          <div className="flex items-center gap-2 font-medium text-amber-900">
            <RotateCcw className="size-4 text-amber-600" />
            <span>Ada draf formulir yang belum disimpan sebelumnya.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white shadow-2xs transition hover:bg-amber-700"
            >
              Lanjutkan Draf
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded-lg border border-amber-300 px-3 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100"
            >
              Hapus
            </button>
          </div>
        </div>
      )}

      {/* 4-Step Indicator */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { num: 1, title: 'Sumber & Kanal' },
            { num: 2, title: 'Identitas Muzakki' },
            { num: 3, title: 'Nilai & Program' },
            { num: 4, title: 'Bukti & Simpan' },
          ].map((s) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div key={s.num} className="flex flex-col items-center">
                <div
                  className={`flex size-8 items-center justify-center rounded-full text-xs font-black transition ${
                    isActive
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-100 text-zinc-400'
                  }`}
                >
                  {isCompleted ? <Check className="size-4" /> : s.num}
                </div>
                <span
                  className={`mt-2 hidden text-xs font-bold sm:inline-block ${
                    isActive ? 'text-zinc-900' : isCompleted ? 'text-emerald-700' : 'text-zinc-400'
                  }`}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs font-medium text-rose-800 shadow-2xs">
          <AlertCircle className="size-4 shrink-0 text-rose-600" />
          <div className="flex-1 leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xs">
        {/* STEP 1: Sumber & Kanal */}
        {step === 1 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-lg font-black text-zinc-900">1. Pilih Sumber & Kanal Penerimaan</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Tentukan jalur transaksi donasi yang diterima.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CHANNELS.map((ch) => {
                const isSelected = formData.channel === ch.value;
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => updateField('channel', ch.value)}
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div
                      className={`flex size-10 items-center justify-center rounded-xl ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="mt-3 font-bold text-zinc-900 text-sm">{ch.label}</div>
                    <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{ch.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-100">
              <div>
                <label htmlFor={`${formId}-bank`} className="block text-xs font-bold text-zinc-700">
                  Bank / Kasir Penerima
                </label>
                <select
                  id={`${formId}-bank`}
                  value={formData.bank_name}
                  onChange={(e) => {
                    const opt = BANK_OPTIONS.find((b) => b.name === e.target.value);
                    updateField('bank_name', e.target.value);
                    if (opt) updateField('bank_account_number', opt.account);
                  }}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {BANK_OPTIONS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.account})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${formId}-date`} className="block text-xs font-bold text-zinc-700">
                  Tanggal Setoran
                </label>
                <div className="relative mt-1.5">
                  <input
                    id={`${formId}-date`}
                    type="date"
                    value={formData.transaction_date}
                    onChange={(e) => updateField('transaction_date', e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-3.5 size-4 text-zinc-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Identitas Muzakki */}
        {step === 2 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-lg font-black text-zinc-900">2. Identitas Donatur / Muzakki</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Lengkapi identitas muzakki untuk penerbitan Bukti Setor Zakat (BSZ) resmi.
              </p>
            </div>

            {/* Tipe Donatur */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-800">
                <input
                  type="radio"
                  name="muzakki_type"
                  checked={formData.muzakki_type === 'individu'}
                  onChange={() => updateField('muzakki_type', 'individu')}
                  className="size-4 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Individu / Perorangan</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-800">
                <input
                  type="radio"
                  name="muzakki_type"
                  checked={formData.muzakki_type === 'lembaga'}
                  onChange={() => updateField('muzakki_type', 'lembaga')}
                  className="size-4 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Lembaga / Perusahaan / Yayasan</span>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor={`${formId}-name`} className="block text-xs font-bold text-zinc-700">
                  Nama Lengkap Muzakki / Entitas <span className="text-rose-500">*</span>
                </label>
                <input
                  id={`${formId}-name`}
                  type="text"
                  placeholder={formData.muzakki_type === 'individu' ? 'contoh: H. Achmad Dahlan' : 'contoh: PT Mandiri Abadi'}
                  value={formData.muzakki_name}
                  onChange={(e) => updateField('muzakki_name', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${formId}-phone`} className="block text-xs font-bold text-zinc-700">
                    Nomor WhatsApp / HP
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id={`${formId}-phone`}
                      type="tel"
                      placeholder="08123456789"
                      value={formData.muzakki_phone}
                      onChange={(e) => updateField('muzakki_phone', e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <Phone className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
                  </div>
                </div>

                <div>
                  <label htmlFor={`${formId}-email`} className="block text-xs font-bold text-zinc-700">
                    Alamat Email (Opsional)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id={`${formId}-email`}
                      type="email"
                      placeholder="muzakki@example.com"
                      value={formData.muzakki_email}
                      onChange={(e) => updateField('muzakki_email', e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <Mail className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-400" />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor={`${formId}-id`} className="block text-xs font-bold text-zinc-700">
                  Nomor NIK / NPWP / NPWZ (Opsional)
                </label>
                <input
                  id={`${formId}-id`}
                  type="text"
                  placeholder="36710..."
                  value={formData.muzakki_identifier}
                  onChange={(e) => updateField('muzakki_identifier', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-address`} className="block text-xs font-bold text-zinc-700">
                  Alamat Singkat
                </label>
                <textarea
                  id={`${formId}-address`}
                  rows={2}
                  placeholder="Kelurahan / Kecamatan di Kota Tangerang"
                  value={formData.muzakki_address}
                  onChange={(e) => updateField('muzakki_address', e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Nilai & Alokasi Dana */}
        {step === 3 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-lg font-black text-zinc-900">3. Nilai & Alokasi Dana ZIS</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Tentukan akad donasi, peruntukan program BAZNAS, dan nominal yang disetorkan.
              </p>
            </div>

            {/* Nominal input with prominent display */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
              <label htmlFor={`${formId}-nominal`} className="block text-xs font-bold text-emerald-950">
                Nominal Donasi (Rupiah) <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-4 top-3 text-lg font-black text-zinc-400">
                  Rp
                </span>
                <input
                  id={`${formId}-nominal`}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formData.amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="h-14 w-full rounded-xl border border-zinc-300 bg-white pl-12 pr-4 text-xl font-black text-zinc-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              {numericAmount > 0 && (
                <div className="mt-2 text-xs font-semibold text-emerald-800">
                  Terbilang: {formatRupiahDisplay(numericAmount)}
                </div>
              )}

              {/* Threshold Warning */}
              {requiresApproval && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs font-medium text-purple-900">
                  <ShieldCheck className="size-4 shrink-0 text-purple-600" />
                  <span>
                    Transaksi nominal di atas Rp 10.000.000 otomatis dialihkan ke antrean persetujuan Kepala Bagian Penerimaan.
                  </span>
                </div>
              )}
            </div>

            {/* Jenis Dana Grid */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-2">
                Jenis Dana ZIS <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {FUND_TYPES.map((f) => {
                  const isSelected = formData.fund_type === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => updateField('fund_type', f.value)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/70 font-bold text-emerald-950 ring-1 ring-emerald-500'
                          : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <span className="text-xs font-bold">{f.label}</span>
                      <span className="text-[11px] text-zinc-500 font-normal">{f.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Program & Subprogram */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-4 border-t border-zinc-100">
              <div>
                <label htmlFor={`${formId}-prog`} className="block text-xs font-bold text-zinc-700">
                  Pilar Program BAZNAS
                </label>
                <select
                  id={`${formId}-prog`}
                  value={formData.program_name}
                  onChange={(e) => updateField('program_name', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {PROGRAMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${formId}-subprog`} className="block text-xs font-bold text-zinc-700">
                  Sub-program / Catatan Khusus
                </label>
                <input
                  id={`${formId}-subprog`}
                  type="text"
                  placeholder="contoh: Beasiswa SKSS 2026"
                  value={formData.sub_program}
                  onChange={(e) => updateField('sub_program', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Bukti & Konfirmasi */}
        {step === 4 && (
          <div className="p-6 sm:p-8 space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-lg font-black text-zinc-900">4. Bukti Setor & Konfirmasi Final</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Unggah salinan kuitansi/bukti setor fisik dan periksa rangkuman transaksi sebelum disimpan.
              </p>
            </div>

            {/* File Upload Section */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-2">
                Unggah Bukti Setor / Kuitansi (PDF / Gambar)
              </label>
              <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 p-6 text-center transition hover:border-emerald-500 hover:bg-emerald-50/20">
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-zinc-600 shadow-2xs">
                  <UploadCloud className="size-6 text-emerald-600" />
                </div>
                <div className="mt-3 text-xs font-bold text-zinc-800">
                  {uploading ? (
                    <span className="text-emerald-700">Mengunggah berkas...</span>
                  ) : formData.evidence_name ? (
                    <span className="text-emerald-700">Berkas terpilih: {formData.evidence_name}</span>
                  ) : (
                    <span>Tarik file ke sini atau klik untuk memilih</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">Mendukung PDF, JPEG, atau PNG hingga 10MB</p>
              </div>

              {formData.evidence_url && (
                <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  <span>Bukti setor telah terunggah secara aman</span>
                </div>
              )}
            </div>

            {/* Nomor Slip / Referensi & Catatan */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${formId}-ref`} className="block text-xs font-bold text-zinc-700">
                  Nomor Slip / Referensi Kasir (Opsional)
                </label>
                <input
                  id={`${formId}-ref`}
                  type="text"
                  placeholder="contoh: SLIP-2026-001"
                  value={formData.provider_ref}
                  onChange={(e) => updateField('provider_ref', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor={`${formId}-notes`} className="block text-xs font-bold text-zinc-700">
                  Catatan Transaksi (Opsional)
                </label>
                <input
                  id={`${formId}-notes`}
                  type="text"
                  placeholder="contoh: Zakat atas nama keluarga almarhum"
                  value={formData.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>

            {/* Summary Card */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Rangkuman Transaksi
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500">Kanal:</span>
                  <p className="font-bold text-zinc-800 capitalize">{formData.channel.replace('_', ' ')}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Muzakki:</span>
                  <p className="font-bold text-zinc-800">{formData.muzakki_name || '-'}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Jenis Dana:</span>
                  <p className="font-bold text-zinc-800 capitalize">{formData.fund_type.replace('_', ' ')}</p>
                </div>
                <div>
                  <span className="text-zinc-500">Nominal:</span>
                  <p className="text-sm font-black text-emerald-700">{formatRupiahDisplay(numericAmount)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-6 py-4">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-100"
              >
                <ArrowLeft className="size-3.5" />
                <span>Sebelumnya</span>
              </button>
            ) : (
              <Link
                href="/penerimaan/transaksi"
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-2xs transition hover:bg-zinc-100"
              >
                Batal
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-800"
              >
                <span>Lanjutkan</span>
                <ArrowRight className="size-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting || uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="size-4" />
                <span>{submitting ? 'Menyimpan...' : 'Simpan Transaksi'}</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
