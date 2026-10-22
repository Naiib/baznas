'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { CurrentUser } from '@/lib/api/types';
import { canReviewBothModules } from './module-access';

export function ModuleSwitcher({ user, currentModule }: { user: CurrentUser | null; currentModule: 'penyaluran' | 'penerimaan' }) {
  const [open, setOpen] = useState(false);
  if (!canReviewBothModules(user)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mode peninjau: pindah modul"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <ArrowLeftRight className="size-4 shrink-0" />
        <span className="hidden whitespace-nowrap sm:inline">Mode peninjau</span>
        <ChevronDown className={`size-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <nav aria-label="Pindah modul" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Modul yang diizinkan</p>
          <Link href="/penyaluran" aria-current={currentModule === 'penyaluran' ? 'page' : undefined} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-3 text-sm font-semibold ${currentModule === 'penyaluran' ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-700 hover:bg-zinc-50'}`}>Penyaluran</Link>
          <Link href="/penerimaan" aria-current={currentModule === 'penerimaan' ? 'page' : undefined} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-3 text-sm font-semibold ${currentModule === 'penerimaan' ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-700 hover:bg-zinc-50'}`}>Penerimaan</Link>
          <p className="px-3 pb-2 pt-1 text-[10px] leading-relaxed text-zinc-500">Navigasi mengikuti izin sesi yang diberikan server.</p>
        </nav>
      )}
    </div>
  );
}
