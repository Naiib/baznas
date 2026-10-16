'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileUp,
  HeartHandshake,
  ShieldCheck,
  Building,
  User,
  Info,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';

const STEPS = [
  'Data pemohon',
  'Domisili & kondisi',
  'Kebutuhan bantuan',
  'Dokumen',
  'Konfirmasi',
];

const PROGRAMS = [
  'Tangerang Cerdas',
  'Tangerang Sehat',
  'Tangerang Makmur',
  'Tangerang Peduli',
  'Tangerang Taqwa',
];

const KECAMATAN = [
  'Batuceper',
  'Benda',
  'Cibodas',
  'Ciledug',
  'Cipondoh',
  'Jatiuwung',
  'Karangtengah',
  'Karawaci',
  'Larangan',
  'Neglasari',
  'Periuk',
  'Pinang',
  'Tangerang',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

type ApplicantType = 'Perorangan' | 'Lembaga';
type DocumentKey =
  | 'ktp'
  | 'kk'
  | 'rekomendasi'
  | 'keterangan_kelurahan'
  | 'surat_permohonan';

type FormValues = {
  applicantType: ApplicantType;
  name: string;
  nik: string;
  kkNumber: string;
  phone: string;
  organizationName: string;
  picName: string;
  picNik: string;
  picPhone: string;
  address: string;
  rtRw: string;
  kelurahan: string;
  kecamatan: string;
  monthlyIncome: string;
  familyDependents: string;
  program: string;
  requestTitle: string;
  proposedAmount: string;
  notes: string;
  agreed: boolean;
};

const initialValues: FormValues = {
  applicantType: 'Perorangan',
  name: '',
  nik: '',
  kkNumber: '',
  phone: '',
  organizationName: '',
  picName: '',
  picNik: '',
  picPhone: '',
  address: '',
  rtRw: '',
  kelurahan: '',
  kecamatan: 'Tangerang',
  monthlyIncome: '',
  familyDependents: '1',
  program: PROGRAMS[0]!,
  requestTitle: '',
  proposedAmount: '',
  notes: '',
  agreed: false,
};

const initialFiles: Record<DocumentKey, File | null> = {
  ktp: null,
  kk: null,
  rekomendasi: null,
  keterangan_kelurahan: null,
  surat_permohonan: null,
};

function Input({
  label,
  value,
  onChange,
  required,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-bold text-slate-700">
      <span>{label}</span>
      {required && <span className="ml-1 text-rose-600">*</span>}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
      />
      {hint && <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export function PublicApplicationForm() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [files, setFiles] = useState(initialFiles);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fileNumber, setFileNumber] = useState('');
  const [programs, setPrograms] = useState(PROGRAMS);

  useEffect(() => {
    api
      .getPublicMasterData('program')
      .then((result) => {
        const options = result.data?.map((item) => item.label).filter(Boolean) ?? [];
        if (options.length) setPrograms(options);
      })
      .catch(() => undefined);
  }, []);

  const setValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const switchType = (applicantType: ApplicantType) => {
    setValues((current) => ({
      ...current,
      applicantType,
      name: '',
      nik: '',
      kkNumber: '',
      phone: '',
      organizationName: '',
      picName: '',
      picNik: '',
      picPhone: '',
      monthlyIncome: '',
      familyDependents: '1',
      agreed: false,
    }));
    setFiles(initialFiles);
    setError('');
  };

  const validate = () => {
    if (step === 0) {
      if (values.applicantType === 'Perorangan' && !values.name.trim())
        return 'Nama lengkap wajib diisi.';
      if (values.applicantType === 'Lembaga' && !values.organizationName.trim())
        return 'Nama lembaga wajib diisi.';
      if (values.applicantType === 'Lembaga' && !values.picName.trim())
        return 'Nama penanggung jawab wajib diisi.';
      if (
        !/^\d{16}$/.test(
          values.applicantType === 'Perorangan' ? values.nik : values.picNik
        )
      )
        return 'NIK harus terdiri dari 16 digit angka.';
      if (
        values.applicantType === 'Perorangan' &&
        !/^\d{16}$/.test(values.kkNumber)
      )
        return 'Nomor Kartu Keluarga harus terdiri dari 16 digit angka.';
      const phone =
        values.applicantType === 'Perorangan' ? values.phone : values.picPhone;
      if (phone.replace(/\D/g, '').length < 10) return 'Nomor WhatsApp belum valid.';
    }
    if (step === 1 && !values.address.trim())
      return 'Alamat domisili wajib diisi.';
    if (step === 2 && !values.requestTitle.trim())
      return 'Uraian kebutuhan wajib diisi.';
    if (
      step === 3 &&
      (!files.ktp || (values.applicantType === 'Perorangan' && !files.kk))
    )
      return values.applicantType === 'Perorangan'
        ? 'Unggah KTP dan Kartu Keluarga sebelum melanjutkan.'
        : 'Unggah KTP penanggung jawab sebelum melanjutkan.';
    if (step === 4 && !values.agreed)
      return 'Centang pernyataan kebenaran data sebelum mengirim pengajuan.';
    return '';
  };

  const next = () => {
    const message = validate();
    if (message) return setError(message);
    setError('');
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const selectFile = (key: DocumentKey, file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(`${file.name}: format harus JPG, PNG, atau PDF.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`${file.name}: Ukuran berkas melebihi batas 5 MB.`);
      return;
    }
    setFiles((current) => ({ ...current, [key]: file }));
    setError('');
  };

  const letterPayload = () => ({
    applicant_status: values.applicantType,
    name:
      values.applicantType === 'Perorangan'
        ? values.name
        : values.organizationName,
    ...(values.applicantType === 'Perorangan'
      ? { nik: values.nik, kk_number: values.kkNumber, phone: values.phone }
      : {
          pic_name: values.picName,
          pic_nik: values.picNik,
          pic_phone: values.picPhone,
        }),
    address: values.address,
    rt_rw: values.rtRw,
    kelurahan: values.kelurahan,
    kecamatan: values.kecamatan,
    program: values.program,
    request_title: values.requestTitle,
    proposed_amount: values.proposedAmount,
    notes: values.notes,
  });

  const downloadLetter = async () => {
    setDownloading(true);
    setError('');
    try {
      const blob = await api.downloadSuratPermohonan(letterPayload());
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'surat-permohonan.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Surat permohonan gagal diunduh.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const submit = async () => {
    const message = validate();
    if (message) return setError(message);
    setSubmitting(true);
    setError('');
    const payload = new FormData();
    payload.set('applicant_status', values.applicantType);
    payload.set(
      'name',
      values.applicantType === 'Perorangan'
        ? values.name
        : values.organizationName
    );
    payload.set(
      'nik',
      values.applicantType === 'Perorangan' ? values.nik : values.picNik
    );
    payload.set(
      'phone',
      values.applicantType === 'Perorangan' ? values.phone : values.picPhone
    );
    if (values.applicantType === 'Perorangan') {
      payload.set('kk_number', values.kkNumber);
    } else {
      payload.set('pic_name', values.picName);
      payload.set('pic_phone', values.picPhone);
      payload.set('beneficiary_name', values.organizationName);
    }
    payload.set('address', values.address);
    payload.set('rt_rw', values.rtRw);
    payload.set('kelurahan', values.kelurahan);
    payload.set('kecamatan', values.kecamatan);
    if (values.applicantType === 'Perorangan') {
      payload.set('monthly_income', values.monthlyIncome || '0');
      payload.set('family_dependents', values.familyDependents);
    }
    payload.set('program', values.program);
    payload.set('request_title', values.requestTitle);
    payload.set('proposed_amount', values.proposedAmount || '0');
    payload.set('notes', values.notes);
    (Object.keys(files) as DocumentKey[]).forEach((key) => {
      if (files[key]) payload.set(key, files[key]!);
    });
    try {
      const result = await api.submitPublicApplication(payload);
      if (!result.data?.file_no)
        throw new Error('Nomor berkas tidak diterima dari server.');
      setFileNumber(result.data.file_no);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Pengajuan belum terkirim. Periksa koneksi lalu coba lagi.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (fileNumber)
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto size-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
          <CheckCircle2 className="size-10" />
        </div>
        <h1 className="mt-4 text-2xl font-black text-slate-900">
          Permohonan Berhasil Dikirim
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-600">
          Simpan nomor registrasi berkas berikut untuk memantau proses verifikasi administrasi dan survei lapangan.
        </p>
        <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50/70 py-4 px-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Nomor Registrasi Berkas
          </p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-extrabold text-emerald-950">
            {fileNumber}
          </p>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 shadow-xs transition"
            href={`/cek-pengajuan?q=${encodeURIComponent(fileNumber)}`}
          >
            <ClipboardCheck className="size-4" />
            Lacak Status Pengajuan
          </Link>
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 transition"
            href="/"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </section>
    );

  const uploadSlot = (key: DocumentKey, label: string, required = false) => (
    <label
      key={key}
      className={`flex cursor-pointer flex-col rounded-xl border-2 border-dashed p-4 text-xs font-bold transition ${
        files[key]
          ? 'border-emerald-400 bg-emerald-50/50 text-emerald-950'
          : 'border-slate-300 bg-slate-50/70 text-slate-800 hover:border-emerald-400 hover:bg-white'
      }`}
    >
      <span className="flex items-center gap-2">
        <FileUp className="size-4 text-emerald-700 shrink-0" />
        <span>{label}</span>
        {required && <span className="text-rose-600">*</span>}
      </span>
      <input
        aria-label={label}
        className="mt-3 block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200"
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(event) => selectFile(key, event.target.files?.[0])}
      />
      <span className="mt-2 block text-[11px] font-normal text-slate-500">
        JPG, PNG, atau PDF · maks. 5 MB
        {files[key] ? ` · Terpilih: ${files[key]!.name}` : ''}
      </span>
    </label>
  );

  const field = (
    label: string,
    value: string,
    key: keyof FormValues,
    required = false,
    type = 'text',
    hint?: string
  ) => (
    <Input
      key={key}
      label={label}
      value={value}
      required={required}
      type={type}
      hint={hint}
      onChange={(nextValue) => setValue(key, nextValue as never)}
    />
  );

  return (
    <section className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      {/* Official Form Header */}
      <header className="bg-emerald-900 px-6 py-6 text-white border-b border-emerald-800">
        <div className="flex items-center justify-between gap-2 text-emerald-200">
          <div className="flex items-center gap-2">
            <HeartHandshake className="size-4 text-amber-300" />
            <span className="text-xs font-bold uppercase tracking-wider">
              BAZNAS Kota Tangerang
            </span>
          </div>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-800 text-emerald-100">
            Langkah {step + 1} dari {STEPS.length}
          </span>
        </div>

        <h1 className="mt-3 text-xl sm:text-2xl font-black text-white">
          Pendaftaran Permohonan Bantuan Mustahik
        </h1>

        {/* Stepper progress */}
        <ol className="mt-5 grid grid-cols-5 gap-2 border-t border-emerald-800/80 pt-4">
          {STEPS.map((title, index) => {
            const isActive = index === step;
            const isCompleted = index < step;
            return (
              <li
                key={title}
                className={`flex items-center gap-1.5 text-[11px] font-bold ${
                  isActive
                    ? 'text-amber-300'
                    : isCompleted
                    ? 'text-emerald-200'
                    : 'text-emerald-500'
                }`}
              >
                <span
                  className={`size-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-extrabold ${
                    isActive
                      ? 'bg-amber-400 text-emerald-950 ring-2 ring-amber-300'
                      : isCompleted
                      ? 'bg-emerald-700 text-emerald-100'
                      : 'bg-emerald-800/60 text-emerald-400'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="hidden sm:inline truncate">{title}</span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-lg font-black text-slate-900">{STEPS[step]}</h2>
          <span className="text-xs text-slate-400">
            Bidang Pendistribusian & Pendayagunaan
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-bold text-rose-800 flex items-start gap-2"
          >
            <Info className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {step === 0 && (
            <>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-xs font-bold text-slate-700">
                  Jenis pemohon
                </legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 text-xs font-bold text-slate-800">
                    <input
                      type="radio"
                      name="applicant-type"
                      checked={values.applicantType === 'Perorangan'}
                      onChange={() => switchType('Perorangan')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <User className="size-4 text-emerald-700" />
                    Perorangan
                  </label>
                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 text-xs font-bold text-slate-800">
                    <input
                      type="radio"
                      name="applicant-type"
                      checked={values.applicantType === 'Lembaga'}
                      onChange={() => switchType('Lembaga')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <Building className="size-4 text-emerald-700" />
                    Lembaga
                  </label>
                </div>
              </fieldset>

              {values.applicantType === 'Perorangan' ? (
                <>
                  {field('Nama lengkap', values.name, 'name', true)}
                  {field(
                    'NIK',
                    values.nik,
                    'nik',
                    true,
                    'text',
                    '16 digit sesuai KTP'
                  )}
                  {field(
                    'Nomor Kartu Keluarga',
                    values.kkNumber,
                    'kkNumber',
                    true,
                    'text',
                    '16 digit sesuai KK'
                  )}
                  {field('Nomor WhatsApp', values.phone, 'phone', true)}
                </>
              ) : (
                <>
                  {field(
                    'Nama lembaga',
                    values.organizationName,
                    'organizationName',
                    true
                  )}
                  {field(
                    'Nama penanggung jawab',
                    values.picName,
                    'picName',
                    true
                  )}
                  {field(
                    'NIK penanggung jawab',
                    values.picNik,
                    'picNik',
                    true,
                    'text',
                    '16 digit angka'
                  )}
                  {field(
                    'Nomor WhatsApp penanggung jawab',
                    values.picPhone,
                    'picPhone',
                    true
                  )}
                </>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <label className="sm:col-span-2 block text-xs font-bold text-slate-700">
                <span>
                  {values.applicantType === 'Lembaga'
                    ? 'Alamat Sekretariat / Kantor Lembaga'
                    : 'Alamat domisili'}
                </span>
                <span className="text-rose-600 ml-1">*</span>
                <textarea
                  value={values.address}
                  onChange={(event) => setValue('address', event.target.value)}
                  rows={3}
                  placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                />
              </label>
              {field('RT / RW', values.rtRw, 'rtRw')}
              {field('Kelurahan', values.kelurahan, 'kelurahan')}
              <label className="block text-xs font-bold text-slate-700">
                <span>Kecamatan</span>
                <select
                  value={values.kecamatan}
                  onChange={(event) => setValue('kecamatan', event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                >
                  {KECAMATAN.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              {values.applicantType === 'Perorangan' && (
                <>
                  {field(
                    'Jumlah tanggungan',
                    values.familyDependents,
                    'familyDependents',
                    false,
                    'number'
                  )}
                  {field(
                    'Perkiraan penghasilan per bulan',
                    values.monthlyIncome,
                    'monthlyIncome',
                    false,
                    'number',
                    'Nominal rupiah (tanpa titik)'
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label className="block text-xs font-bold text-slate-700">
                <span>Program bantuan</span>
                <select
                  value={values.program}
                  onChange={(event) => setValue('program', event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                >
                  {programs.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              {field(
                'Usulan anggaran',
                values.proposedAmount,
                'proposedAmount',
                false,
                'number',
                'Masukkan perkiraan anggaran yang dibutuhkan.'
              )}
              <label className="sm:col-span-2 block text-xs font-bold text-slate-700">
                <span>Uraian kebutuhan</span>
                <span className="text-rose-600 ml-1">*</span>
                <textarea
                  value={values.requestTitle}
                  onChange={(event) => setValue('requestTitle', event.target.value)}
                  rows={4}
                  placeholder="Jelaskan kebutuhan bantuan Anda (contoh: Tunggakan biaya SPP sekolah semester ganjil)"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                />
              </label>
              <label className="sm:col-span-2 block text-xs font-bold text-slate-700">
                <span>Deskripsi kondisi ekonomi</span>
                <textarea
                  value={values.notes}
                  onChange={(event) => setValue('notes', event.target.value)}
                  rows={3}
                  placeholder="Ceritakan kondisi ekonomi sebagai konteks pengajuan"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-3 focus:ring-emerald-100"
                />
              </label>
              <button
                type="button"
                disabled={
                  downloading ||
                  !values.address.trim() ||
                  !values.requestTitle.trim() ||
                  !(values.applicantType === 'Perorangan'
                    ? values.name
                    : values.organizationName
                  ).trim()
                }
                onClick={downloadLetter}
                className="sm:col-span-2 justify-self-start inline-flex items-center gap-2 rounded-xl border border-emerald-700 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition"
              >
                {downloading ? 'Menyiapkan PDF…' : 'Unduh Surat Permohonan'}
              </button>
            </>
          )}

          {step === 3 && (
            <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
              {uploadSlot(
                'ktp',
                values.applicantType === 'Lembaga'
                  ? 'Unggah KTP Penanggung Jawab'
                  : 'Unggah KTP',
                true
              )}
              {uploadSlot(
                'kk',
                values.applicantType === 'Lembaga'
                  ? 'Unggah Kartu Keluarga Penanggung Jawab (opsional)'
                  : 'Unggah Kartu Keluarga',
                values.applicantType === 'Perorangan'
              )}
              {uploadSlot(
                'rekomendasi',
                values.applicantType === 'Lembaga'
                  ? 'Rekomendasi UPZ/Masjid / Surat Pengantar Lembaga'
                  : 'Surat rekomendasi UPZ kecamatan atau masjid'
              )}
              {uploadSlot(
                'keterangan_kelurahan',
                'Surat keterangan kelurahan'
              )}
              {uploadSlot(
                'surat_permohonan',
                'Surat Permohonan Bertanda Tangan'
              )}
            </div>
          )}

          {step === 4 && (
            <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 border-b border-slate-200 pb-2">
                Ringkasan pengajuan
              </h3>
              <dl className="grid gap-3 sm:grid-cols-2 text-xs">
                <div>
                  <dt className="text-slate-500 font-medium">Jenis pemohon</dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.applicantType}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Pemohon</dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.applicantType === 'Perorangan'
                      ? values.name
                      : values.organizationName}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Wilayah</dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.kecamatan}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Program</dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.program}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Usulan anggaran</dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.proposedAmount || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">
                    Deskripsi kondisi ekonomi
                  </dt>
                  <dd className="font-bold text-slate-800 mt-0.5">
                    {values.notes || '—'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {step === 4 && (
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-700 cursor-pointer hover:border-emerald-300">
              <input
                aria-label="Saya menyatakan data yang diisi benar"
                type="checkbox"
                checked={values.agreed}
                onChange={(event) => setValue('agreed', event.target.checked)}
                className="mt-0.5 size-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
              <span>
                Saya menyatakan data yang saya isi benar dan bersedia diverifikasi oleh petugas BAZNAS Kota Tangerang.
              </span>
            </label>
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
              <ShieldCheck className="size-4 shrink-0 text-emerald-700" />
              <span>Data Anda diproses untuk layanan bantuan dan verifikasi.</span>
            </div>
          </div>
        )}

        {/* Footer Navigation Buttons */}
        <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep((value) => value - 1);
              }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <ArrowLeft className="size-4" />
              Kembali
            </button>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              <ArrowLeft className="size-4" />
              Beranda
            </Link>
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 shadow-xs transition"
            >
              Lanjut
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 shadow-xs disabled:opacity-60 transition"
            >
              {submitting ? 'Mengirim…' : 'Kirim pengajuan'}
              <ArrowRight className="size-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}