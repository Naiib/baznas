'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileDown, LogOut, Menu, Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { PENYALURAN_NAV_ITEMS } from './penyaluran-nav';
import { useAuth } from '../auth/AuthProvider';
import { normalizeAccessActor } from '../auth/access';
import { ExportPDFModal } from './ExportPDFModal';

export function PenyaluranTopNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const userName = user?.name || 'Amil Penyaluran';
  const initials = userName.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const actor = normalizeAccessActor(user);
  const divisionLabel = user?.division || (actor.role === 'keuangan' ? 'Divisi Keuangan' : 'Bidang Penyaluran');
  const navItems = actor.role === 'keuangan'
    ? PENYALURAN_NAV_ITEMS.filter((item) => item.id === 'mustahik')
    : actor.role === 'surveyor'
      ? PENYALURAN_NAV_ITEMS.filter((item) => item.id !== 'program')
      : PENYALURAN_NAV_ITEMS;

  const renderLinks = (mobile = false) => navItems.map((item) => {
    const Icon = item.icon;
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href || '');
    return <Link key={item.id} href={item.href!} onClick={() => setMobileOpen(false)} aria-current={active ? 'page' : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-700 hover:bg-zinc-100'} ${mobile ? 'w-full py-3' : 'whitespace-nowrap'}`}><Icon className="size-4 shrink-0" />{item.label}</Link>;
  });

  return <>
    <header className="sticky top-0 z-40 border-b border-[#e5e7eb] bg-white">
      <div className="mx-auto grid min-h-16 max-w-[1920px] grid-cols-[1fr_auto] items-center gap-3 px-4 sm:px-6 lg:grid-cols-[auto_1fr_auto]">
        <Link href="/penyaluran" className="flex min-w-0 items-center gap-2.5" aria-label="BAZNAS Kota Tangerang — Beranda Penyaluran"><span className="grid size-9 shrink-0 place-items-center overflow-hidden"><img src="/baznas-logo.png" alt="" className="size-full object-contain" /></span><span className="flex flex-col leading-none"><strong className="text-xs font-black tracking-tight text-zinc-900">BAZNAS</strong><small className="mt-1 text-[9px] font-bold tracking-[0.12em] text-emerald-800">KOTA TANGERANG</small></span></Link>
        <nav aria-label="Navigasi utama" className="hidden items-center justify-center gap-1 lg:flex">{renderLinks()}{actor.role !== 'keuangan' && <button type="button" onClick={() => setExportOpen(true)} className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"><FileDown className="size-4" />Export PDF</button>}</nav>
        <div className="relative flex items-center justify-self-end gap-2">
          <button type="button" aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)} className="grid size-10 place-items-center rounded-lg border border-zinc-200 text-zinc-700 lg:hidden">{mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <button type="button" aria-label="Profil amil" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)} className="flex h-11 items-center gap-2 rounded-lg py-1 pl-1.5 pr-2.5 text-left hover:bg-zinc-50"><span className="grid size-8 place-items-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">{initials || 'AP'}</span><span className="hidden flex-col leading-none sm:flex"><strong className="max-w-[130px] truncate text-sm text-zinc-900">{userName}</strong><small className="mt-1 text-[10px] font-medium text-zinc-500">{divisionLabel}</small></span></button>
          {profileOpen && <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg"><div className="border-b border-zinc-100 px-3 py-2"><p className="text-xs font-bold text-zinc-900">{userName}</p><p className="mt-1 truncate text-[10px] text-zinc-500">{user?.email || 'amil@baznas.go.id'}</p></div>{actor.isAdmin && <Link href="/penyaluran/pengaturan" role="menuitem" onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"><Settings2 className="size-4" />Pengaturan</Link>}<button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><LogOut className="size-4" />Keluar</button></div>}
        </div>
      </div>
      {mobileOpen && <nav aria-label="Navigasi mobile" className="border-t border-zinc-100 bg-white p-3 lg:hidden">{renderLinks(true)}{actor.role !== 'keuangan' && <button type="button" onClick={() => { setExportOpen(true); setMobileOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"><FileDown className="size-4" />Export PDF</button>}</nav>}
    </header>
    {exportOpen && <ExportPDFModal currentUser={user} onClose={() => setExportOpen(false)} />}
  </>;
}
