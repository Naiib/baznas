'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CirclePlus, FileCheck2, Layers3, MapPinned, Settings2, WalletCards, X } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { MasterDataRecord } from '@/lib/api/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';

const CATEGORIES = [
  { id: 'program', label: 'Program 5 Pilar', icon: Layers3, description: 'Layanan bantuan yang tersedia untuk pemohon.' },
  { id: 'asnaf', label: 'Kategori Asnaf', icon: CheckCircle2, description: 'Kelompok penerima manfaat sesuai ketentuan zakat.' },
  { id: 'dokumen', label: 'Dokumen wajib', icon: FileCheck2, description: 'Berkas yang diperiksa dalam proses verifikasi.' },
  { id: 'pencairan', label: 'Metode pencairan', icon: WalletCards, description: 'Pilihan penyaluran dana yang dapat digunakan.' },
] as const;

export function MasterDataOperations() {
  const { user } = useAuth();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id']>('program');
  const [records, setRecords] = useState<MasterDataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: '', description: '' });
  const isAdmin = normalizeAccessActor(user).isAdmin;
  const current = CATEGORIES.find((item) => item.id === category)!;

  const load = async (nextCategory = category) => {
    setLoading(true); setError('');
    try {
      const response = await api.getMasterData({ category: nextCategory });
      setRecords(response.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Data master belum dapat dimuat.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(category); }, [category]);

  const choose = (next: typeof category) => { setCategory(next); void load(next); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = form.label.trim();
    if (!label) return;
    setSaving(true);
    try {
      await api.createMasterData({ category, record_key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), label, description: form.description.trim(), is_active: true, sort_order: records.length + 1 });
      setOpen(false); setForm({ label: '', description: '' }); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Data baru belum dapat disimpan.'); }
    finally { setSaving(false); }
  };

  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 sm:space-y-6"><header className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-[0_14px_45px_rgba(15,23,42,0.045)] sm:px-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-emerald-700"><Settings2 className="size-4" /><p className="text-xs font-black uppercase tracking-[0.16em]">Konfigurasi operasional</p></div><h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Data master penyaluran</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Kelola pilihan yang dipakai bersama oleh form publik, verifikasi amil, pencairan, dan laporan.</p></div>{isAdmin && <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800"><CirclePlus className="size-4" />Tambah data</button>}</div><div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{CATEGORIES.map((item) => { const Icon = item.icon; const active = item.id === category; return <button key={item.id} type="button" onClick={() => choose(item.id)} className={`rounded-2xl border p-4 text-left transition ${active ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}><span className={`grid size-9 place-items-center rounded-xl ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="size-4" /></span><span className="mt-3 block font-black text-slate-950">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span></button>; })}</div></header><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.045)]"><div className="border-b border-slate-100 px-5 py-5 sm:px-6"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><current.icon className="size-5" /></span><div><h2 className="text-lg font-black text-slate-950">{current.label}</h2><p className="mt-1 text-sm text-slate-500">{current.description}</p></div></div></div>{loading ? <div className="grid min-h-64 place-items-center text-sm font-semibold text-slate-500">Memuat data master…</div> : error ? <div role="alert" className="m-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div> : records.length === 0 ? <div className="grid min-h-64 place-items-center p-6 text-center"><div><MapPinned className="mx-auto size-7 text-slate-400" /><p className="mt-3 font-black text-slate-900">Belum ada data pada kategori ini</p><p className="mt-1 text-sm text-slate-500">Admin dapat menambahkan data yang diperlukan.</p></div></div> : <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">{records.map((record) => <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-black text-slate-950">{record.label}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${record.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{record.is_active ? 'Aktif' : 'Nonaktif'}</span></div><p className="mt-3 min-h-10 text-sm leading-5 text-slate-500">{record.description || 'Belum ada keterangan.'}</p><p className="mt-4 font-mono text-[11px] font-bold text-slate-400">{record.record_key}</p></article>)}</div>}</section>{open && <div className="fixed inset-0 z-[90] grid place-items-center p-4"><button aria-label="Tutup dialog" type="button" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" /><form onSubmit={submit} className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{current.label}</p><h2 className="mt-1 text-xl font-black text-slate-950">Tambah data baru</h2></div><button aria-label="Tutup dialog" type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-500"><X className="size-4" /></button></div><label className="mt-6 block text-sm font-bold text-slate-800">Nama data<input required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" /></label><label className="mt-4 block text-sm font-bold text-slate-800">Keterangan <span className="font-normal text-slate-400">(opsional)</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" /></label><button disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{saving ? 'Menyimpan…' : 'Simpan data'}</button></form></div>}</main>;
}
