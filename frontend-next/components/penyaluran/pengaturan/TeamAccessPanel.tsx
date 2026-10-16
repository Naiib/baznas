'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, UsersRound } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { OperationalUser } from '@/lib/api/types';

export function TeamAccessPanel() {
  const [users, setUsers] = useState<OperationalUser[]>([]);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | number | null>(null);

  useEffect(() => {
    api.getUsers().then((response) => setUsers((response.data || []).filter((user) => user.role === 'penyaluran')))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Akses tim belum dapat dimuat.'));
  }, []);

  const updateLevel = async (user: OperationalUser, level: 'staff' | 'leader') => {
    setSavingId(user.id); setError('');
    try {
      const response = await api.updateUserAccess(user.id, { level });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, ...(response.data || {}), level } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Level akses belum dapat diperbarui.');
    } finally { setSavingId(null); }
  };

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_45px_rgba(15,23,42,0.045)]">
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UsersRound className="size-5" /></span><div><h2 className="text-lg font-black text-slate-950">Akses tim Penyaluran</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Tetapkan pelaksana sebagai Staff atau pemberi persetujuan sebagai Kepala Bagian. Kepala Bagian tidak dapat menyetujui rekomendasinya sendiri.</p></div></div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800"><ShieldCheck className="size-3.5" />Hanya admin</span>
    </div>
    {error && <p role="alert" className="mx-5 mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="divide-y divide-slate-100">{users.map((user) => <div key={user.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="min-w-0"><p className="truncate font-black text-slate-950">{user.name}</p><p className="mt-1 truncate text-sm text-slate-500">{user.email} · {user.division || 'Penyaluran'}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${user.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{user.is_active ? 'Aktif' : 'Nonaktif'}</span><label className="sr-only" htmlFor={`level-${user.id}`}>Level akses {user.name}</label><select id={`level-${user.id}`} value={user.level === 'leader' ? 'leader' : 'staff'} disabled={savingId === user.id} onChange={(event) => void updateLevel(user, event.target.value as 'staff' | 'leader')} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"><option value="staff">Staff</option><option value="leader">Kepala Bagian</option></select></div></div>)}</div>
    {!error && users.length === 0 && <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">Belum ada akun Penyaluran yang dapat dikelola.</p>}
  </section>;
}
