'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CircleDashed, ClipboardCheck, Search, XCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PublicTrackingResult } from '@/lib/api/types';

function maskName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Pemohon';
  return parts.slice(0, 3).map((part) => `${part.slice(0, 1).toUpperCase()}.`).join(' ');
}

function dateLabel(value?: string | null) {
  if (!value) return 'Menunggu pembaruan';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PublicApplicationTracking() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PublicTrackingResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const track = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return setError('Masukkan nomor berkas, NIK, atau nomor WhatsApp terlebih dahulu.');
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await api.trackPublicApplication(value);
      if (!response.data) throw new Error('Pengajuan tidak ditemukan.');
      setResult(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pengajuan tidak ditemukan.');
    } finally {
      setLoading(false);
    }
  };

  const active = result?.timeline?.find((item) => item.status === 'active');
  const nextMessage = result?.is_rejected
    ? 'Pengajuan tidak dapat dilanjutkan. Hubungi layanan BAZNAS untuk informasi lebih lanjut.'
    : active ? `Saat ini: ${active.name || `Tahap ${active.phase}`}. ${active.description || 'Petugas sedang memproses berkas Anda.'}` : 'Berkas sedang diperbarui oleh petugas BAZNAS.';

  return (
    <section className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 transition hover:bg-white hover:text-emerald-800"
      >
        <ArrowLeft className="size-4" />
        Beranda layanan
      </Link>
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <header className="bg-emerald-950 px-6 py-8 text-white sm:px-8 border-b border-emerald-900">
          <div className="flex items-center gap-2 text-emerald-200">
            <ClipboardCheck className="size-4 text-amber-300" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Layanan Pelacakan Status Berkas · BAZNAS Kota Tangerang
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Pantau status bantuan Anda.
          </h1>
          <p className="mt-2 max-w-xl text-xs sm:text-sm leading-relaxed text-emerald-100/90">
            Masukkan nomor berkas, NIK, atau nomor WhatsApp yang dipakai saat mengajukan bantuan.
          </p>
          <form onSubmit={track} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="tracking-query">
              Nomor berkas, NIK, atau nomor WhatsApp
            </label>
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="tracking-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Contoh: MST-202609-0001 atau 367101..."
                className="h-11 w-full rounded-xl bg-white pl-10 pr-4 text-xs sm:text-sm font-semibold text-slate-900 outline-none ring-2 ring-emerald-800 transition focus:ring-amber-300"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 rounded-xl bg-amber-400 px-6 text-xs sm:text-sm font-black text-emerald-950 transition hover:bg-amber-300 shadow-xs disabled:opacity-70"
            >
              {loading ? 'Memeriksa…' : 'Lacak pengajuan'}
            </button>
          </form>
        </header><div className="p-5 sm:p-8">{error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-800"><XCircle className="mr-2 inline size-4" />{error}</div>}{result && <div className="space-y-7"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Ringkasan pengajuan</p><h2 className="mt-2 text-xl font-black text-slate-950">{maskName(result.mustahik.name)}</h2><p className="mt-1 font-mono text-xs font-bold text-emerald-700">{result.mustahik.file_no}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${result.is_rejected ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>{result.status || result.mustahik.status}</span></div><dl className="mt-5 grid gap-4 border-t border-slate-200 pt-4 text-sm sm:grid-cols-3"><div><dt className="text-xs font-bold text-slate-500">Program</dt><dd className="mt-1 font-bold text-slate-900">{result.mustahik.program || '-'}</dd></div><div><dt className="text-xs font-bold text-slate-500">Kecamatan</dt><dd className="mt-1 font-bold text-slate-900">{result.mustahik.kecamatan || '-'}</dd></div><div><dt className="text-xs font-bold text-slate-500">Diterima</dt><dd className="mt-1 font-bold text-slate-900">{dateLabel(result.mustahik.received_date)}</dd></div></dl></div><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Perkembangan berkas</p><ol className="mt-5 space-y-0">{(result.timeline || []).map((item, index) => <li key={item.phase} className="relative flex gap-4 pb-6 last:pb-0"><span className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 ${item.status === 'completed' ? 'border-emerald-600 bg-emerald-600 text-white' : item.status === 'active' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : item.status === 'rejected' ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-400'}`}>{item.status === 'completed' ? <Check className="size-4" /> : <span className="text-xs font-black">{item.phase}</span>}</span>{index < (result.timeline?.length || 0) - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-slate-200" />}<div className="min-w-0 pt-1"><p className="text-sm font-black text-slate-900">{item.name || `Tahap ${item.phase}`}</p><p className="mt-1 text-sm leading-6 text-slate-500">{item.description || 'Menunggu proses pada tahap ini.'}</p><p className="mt-1.5 text-xs font-bold text-slate-400">{dateLabel(item.date)}</p></div></li>)}</ol></div><div className={`rounded-2xl border p-4 text-sm leading-6 ${result.is_rejected ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><CircleDashed className="mr-2 inline size-4" />{result.is_rejected && result.rejection_reason ? result.rejection_reason : nextMessage}</div></div>}{!result && !error && <div className="grid min-h-56 place-items-center text-center"><div><Search className="mx-auto size-7 text-emerald-700" /><h2 className="mt-4 text-base font-black text-slate-900">Cari nomor pengajuan Anda</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Nomor berkas diberikan setelah formulir berhasil dikirim. Data pengajuan hanya dapat ditampilkan jika kata kuncinya sesuai.</p></div></div>}</div></div></section>
  );
}
