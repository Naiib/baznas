'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck, ListTodo, MapPin, Search, WalletCards } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { Mustahik } from '@/lib/api/types';

type TaskTone = 'emerald' | 'amber' | 'violet' | 'sky';
type Task = { item: Mustahik; title: string; description: string; tone: TaskTone; category: 'Administrasi' | 'Lapangan' | 'Keputusan' | 'Pencairan' };

function toTask(item: Mustahik): Task | null {
  if (item.status === 'Diajukan' || item.status === 'Verifikasi Administrasi' || item.status === 'Verifikasi') return { item, title: 'Verifikasi administrasi', description: 'Periksa kelengkapan berkas dan tentukan apakah pengajuan dapat dilanjutkan.', tone: 'amber', category: 'Administrasi' };
  if (item.status === 'Survey') return { item, title: 'Survey lapangan', description: 'Konfirmasi jadwal atau tindak lanjuti hasil assessment lapangan.', tone: 'sky', category: 'Lapangan' };
  if (item.status === 'Persetujuan MPZIS') return { item, title: 'Tinjau keputusan MPZIS', description: 'Lengkapi rekomendasi dan siapkan keputusan kelayakan bantuan.', tone: 'violet', category: 'Keputusan' };
  if (item.status === 'Pengajuan Dana (FPD)' || item.status === 'Pengajuan Dana (PPD)') return { item, title: 'Proses pencairan', description: 'Pastikan dokumen pencairan dan nominal bantuan sudah sesuai.', tone: 'emerald', category: 'Pencairan' };
  return null;
}

const toneClass: Record<TaskTone, string> = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800', amber: 'border-amber-200 bg-amber-50 text-amber-800', violet: 'border-violet-200 bg-violet-50 text-violet-800', sky: 'border-sky-200 bg-sky-50 text-sky-800' };
const toneIcon: Record<TaskTone, typeof ClipboardCheck> = { emerald: WalletCards, amber: ClipboardCheck, violet: CheckCircle2, sky: CalendarClock };

export function AmilTaskCenter() {
  const [items, setItems] = useState<Mustahik[]>([]);
  const [filter, setFilter] = useState<'Semua' | Task['category']>('Semua');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getMustahikList().then((response) => { if (active) setItems(response.data || []); }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Tugas belum dapat dimuat.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const tasks = useMemo(() => items.map(toTask).filter((task): task is Task => task !== null), [items]);
  const visible = useMemo(() => tasks.filter((task) => {
    const matchesFilter = filter === 'Semua' || task.category === filter;
    const haystack = [task.item.name, task.item.program, task.item.kecamatan, task.title].join(' ').toLowerCase();
    return matchesFilter && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [filter, query, tasks]);
  const counts = useMemo(() => ({ Administrasi: tasks.filter((task) => task.category === 'Administrasi').length, Lapangan: tasks.filter((task) => task.category === 'Lapangan').length, Keputusan: tasks.filter((task) => task.category === 'Keputusan').length, Pencairan: tasks.filter((task) => task.category === 'Pencairan').length }), [tasks]);

  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 sm:space-y-6"><header className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-[0_14px_45px_rgba(15,23,42,0.045)] sm:px-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-emerald-700"><ListTodo className="size-4" /><p className="text-xs font-black uppercase tracking-[0.16em]">Ruang kerja amil</p></div><h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Tugas yang perlu ditindaklanjuti</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Prioritas operasional dibentuk langsung dari status pengajuan aktif agar setiap berkas punya langkah berikutnya yang jelas.</p></div><div className="rounded-2xl bg-emerald-50 px-5 py-4"><p className="text-xs font-bold text-emerald-800">Tugas aktif</p><p className="mt-1 text-3xl font-black tracking-tight text-emerald-950">{tasks.length}</p></div></div><div className="mt-6 grid gap-2 sm:grid-cols-4">{(Object.keys(counts) as Array<Task['category']>).map((category) => <button key={category} type="button" onClick={() => setFilter(filter === category ? 'Semua' : category)} className={`rounded-2xl border p-3 text-left transition ${filter === category ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}><span className="block text-xs font-bold text-slate-500">{category}</span><span className="mt-1 block text-xl font-black text-slate-950">{counts[category]}</span></button>)}</div></header><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.045)]"><div className="border-b border-slate-100 p-4 sm:p-5"><div className="relative max-w-md"><Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><label className="sr-only" htmlFor="task-search">Cari tugas</label><input id="task-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, program, atau kecamatan" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100" /></div></div>{loading ? <div className="grid min-h-80 place-items-center text-sm font-semibold text-slate-500">Memuat tugas amil…</div> : error ? <div role="alert" className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div> : visible.length === 0 ? <div className="grid min-h-80 place-items-center p-6 text-center"><div><CheckCircle2 className="mx-auto size-8 text-emerald-600" /><p className="mt-3 text-base font-black text-slate-900">Tidak ada tugas pada filter ini</p><p className="mt-1 text-sm text-slate-500">Coba pilih kategori lain atau hapus pencarian.</p></div></div> : <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{visible.map((task) => { const Icon = toneIcon[task.tone]; return <article key={task.item.id} className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><span className={`grid size-10 place-items-center rounded-xl border ${toneClass[task.tone]}`}><Icon className="size-5" /></span><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${toneClass[task.tone]}`}>{task.category}</span></div><h2 className="mt-5 text-base font-black text-slate-950">{task.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{task.description}</p><div className="mt-5 border-t border-slate-100 pt-4"><p className="font-black text-slate-900">{task.item.name}</p><p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><MapPin className="size-3.5 text-slate-400" />{task.item.kecamatan || 'Wilayah belum diisi'} · {task.item.program || 'Program belum diisi'}</p></div><Link aria-label={`Tinjau ${task.item.name}`} href={`/penyaluran/mustahik?id=${task.item.id}`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-emerald-800">Tinjau berkas<ArrowRight className="size-4" /></Link></article>; })}</div>}</section></main>;
}
