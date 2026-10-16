'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ApprovalDecision } from '@/lib/api/types';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';

const dateTime = (value: string) => new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const amount = (value?: number | null) => value ? `Rp ${Number(value).toLocaleString('id-ID')}` : '—';

export function ApprovalAuditWorkspace() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApprovalDecision[]>([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const isAdmin = normalizeAccessActor(user).isAdmin;
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true); setError('');
    api.getApprovalAudit(action ? { action } : undefined).then((res) => setItems(res.data || [])).catch((err) => setError(err.message || 'Audit belum dapat dimuat.')).finally(() => setLoading(false));
  }, [action, isAdmin]);
  const summary = useMemo(() => ({ total: items.length, approved: items.filter((item) => item.action === 'approve').length, rejected: items.filter((item) => item.action === 'reject').length }), [items]);
  if (!isAdmin) return <main className="mx-auto max-w-3xl p-6"><section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck className="mx-auto size-8 text-amber-700" /><h1 className="mt-3 text-xl font-black text-slate-950">Audit khusus admin</h1><p className="mt-2 text-sm leading-6 text-slate-600">Jejak keputusan dapat dibaca oleh administrator untuk menjaga akuntabilitas proses.</p></section></main>;
  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8"><header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_45px_rgba(15,23,42,0.045)]"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700"><ShieldCheck className="size-4" />Akuntabilitas operasional</p><h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Audit keputusan penyaluran</h1><p className="mt-2 text-sm leading-6 text-slate-500">Rekam jejak keputusan yang tidak dapat diubah dari proses operasional.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"><SlidersHorizontal className="size-4 text-slate-400" /><span className="sr-only">Aksi</span><select aria-label="Aksi" value={action} onChange={(event) => setAction(event.target.value)} className="bg-transparent outline-none"><option value="">Semua aksi</option><option value="approve">Disetujui</option><option value="reject">Ditolak</option></select></label></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{[['Total keputusan', summary.total, 'bg-slate-50 text-slate-900'], ['Disetujui', summary.approved, 'bg-emerald-50 text-emerald-800'], ['Ditolak', summary.rejected, 'bg-rose-50 text-rose-800']].map(([label, value, tone]) => <div key={String(label)} className={`rounded-2xl p-4 ${tone}`}><p className="text-xs font-bold">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div></header><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.045)]">{loading ? <div className="grid min-h-64 place-items-center text-sm font-semibold text-slate-500">Memuat jejak audit…</div> : error ? <p role="alert" className="m-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p> : items.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><p className="text-sm text-slate-500">Belum ada keputusan pada filter ini.</p></div> : <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-950">{item.mustahik_name}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.action === 'reject' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'}`}>{item.action === 'reject' ? 'Ditolak' : 'Disetujui'}</span></div><p className="mt-1 text-xs font-semibold text-slate-500">{item.file_no} · {item.previous_status} → {item.next_status}</p><p className="mt-3 text-sm leading-6 text-slate-600">{item.note}</p></div><div className="text-left md:text-right"><p className="text-sm font-black text-slate-900">{amount(item.approved_amount)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.actor_name} · {item.actor_role}</p><p className="mt-1 text-xs text-slate-400">{dateTime(item.created_at)}</p></div></article>)}</div>}</section></main>;
}
