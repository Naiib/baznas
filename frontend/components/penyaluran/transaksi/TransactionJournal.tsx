'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleDollarSign, FileText, Search, WalletCards } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PenyaluranTransaction } from '@/lib/api/types';

const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
const date = (value?: string) => value ? new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export function TransactionJournal() {
  const [items, setItems] = useState<PenyaluranTransaction[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Semua');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getPenyaluranTransactions().then((response) => {
      if (active) setItems(response.data || []);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : 'Transaksi belum dapat dimuat.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = status === 'Semua' || item.status === status;
      const searchable = [item.transaction_number, item.ppd_number, item.recipient_name, item.program, item.kecamatan].filter(Boolean).join(' ').toLowerCase();
      return matchesStatus && (!keyword || searchable.includes(keyword));
    });
  }, [items, query, status]);
  const total = visible.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const done = items.filter((item) => item.status === 'Penyaluran Selesai').length;
  const statuses = ['Semua', ...Array.from(new Set(items.map((item) => item.status).filter(Boolean)))];

  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 sm:space-y-6"><header className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-[0_14px_45px_rgba(15,23,42,0.045)] sm:px-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-emerald-700"><WalletCards className="size-4" /><p className="text-xs font-black uppercase tracking-[0.16em]">Jurnal operasional</p></div><h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Riwayat transaksi penyaluran</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Telusuri pencairan bantuan dari nomor PPD hingga penerima manfaat dalam satu daftar yang rapi.</p></div><div className="grid grid-cols-2 gap-3 sm:min-w-[330px]"><div className="rounded-2xl bg-emerald-50 px-4 py-3"><p className="text-xs font-bold text-emerald-800">Nominal ditampilkan</p><p className="mt-1 text-lg font-black tracking-tight text-emerald-950">{rupiah(total)}</p></div><div className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-600">Tersalurkan</p><p className="mt-1 text-lg font-black tracking-tight text-slate-950">{done} transaksi</p></div></div></div></header><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.045)]"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="relative w-full sm:max-w-md"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><label className="sr-only" htmlFor="transaction-search">Cari transaksi</label><input id="transaction-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari penerima, nomor transaksi, atau wilayah" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></div><div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">{statuses.map((item) => <button key={item} type="button" onClick={() => setStatus(item)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold transition ${status === item ? 'bg-emerald-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{item}</button>)}</div></div>{loading ? <div className="grid min-h-80 place-items-center text-sm font-semibold text-slate-500">Memuat jurnal transaksi…</div> : error ? <div role="alert" className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div> : visible.length === 0 ? <div className="grid min-h-80 place-items-center p-6 text-center"><div><CircleDollarSign className="mx-auto size-7 text-slate-400" /><p className="mt-3 text-sm font-black text-slate-900">Belum ada transaksi yang sesuai</p><p className="mt-1 text-xs text-slate-500">Ubah kata kunci atau filter untuk melihat pencairan lain.</p></div></div> : <div className="divide-y divide-slate-100">{visible.map((item) => <article key={item.id} className="group grid gap-4 px-5 py-5 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] sm:items-center sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-base font-black text-slate-950">{item.recipient_name}</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.status === 'Penyaluran Selesai' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.status === 'Penyaluran Selesai' ? 'Tersalurkan' : 'Dalam proses'}</span></div><p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.program || 'Program belum ditetapkan'} · {item.asnaf || 'Asnaf belum ditetapkan'} · {item.kecamatan || '-'}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500"><span className="inline-flex items-center gap-1"><FileText className="size-3.5 text-slate-400" />{item.transaction_number || item.ppd_number || item.form_number || 'Nomor belum terbit'}</span><span>{date(item.disbursement_date || item.created_at)}</span></div></div><div className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-500">Nominal bantuan</p><p className="mt-1 text-lg font-black tracking-tight text-slate-950">{rupiah(item.amount)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.payment_type || 'Metode belum dicatat'}</p></div><Link aria-label={`Lihat ${item.recipient_name}`} href={`/penyaluran/mustahik?id=${item.mustahik_id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50">Lihat penerima<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></Link></article>)}</div>}</section></main>;
}
