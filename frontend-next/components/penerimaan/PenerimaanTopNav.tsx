'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, LogOut, Menu, Settings2, X } from 'lucide-react';
import { PENERIMAAN_NAV_ITEMS } from './penerimaan-nav';
import { useAuth } from '../auth/AuthProvider';
import { canAccessActor, normalizeAccessActor } from '../auth/access';

export function PenerimaanTopNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close menus on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close profile dropdown on click outside
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [profileOpen]);

  // Check if current user belongs to Penerimaan division or is an Admin
  const actor = normalizeAccessActor(user);
  const isPenerimaanAuthorized = canAccessActor(user, ['admin', 'penerimaan']);
  const isAdmin = actor.isAdmin;
  const userName = user?.name || 'Amil Penerimaan';
  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navItems = isPenerimaanAuthorized ? PENERIMAAN_NAV_ITEMS : [];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-xs font-sans">
      <div className="mx-auto grid h-16 max-w-[1920px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        {/* Brand Logo & Organization */}
        <Link
          href="/penerimaan"
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 border border-emerald-100">
            <img
              src="/baznas-logo.png"
              alt="BAZNAS Kota Tangerang"
              className="size-full object-contain"
            />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <strong className="text-xs font-black tracking-tight text-zinc-900">
              BAZNAS
            </strong>
            <small className="text-[9px] font-semibold tracking-wider text-emerald-700">
              DIVISI PENERIMAAN
            </small>
          </span>
        </Link>

        {/* Primary Desktop Navigation (Five Menu Items Only) */}
        {isPenerimaanAuthorized && (
          <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-active={active ? 'true' : 'false'}
                  className={`relative flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'text-zinc-600 font-medium hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-emerald-600" />
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right Controls: Mobile Toggle & Profile Dropdown */}
        <div className="relative flex items-center gap-2 justify-self-end">
          {/* Mobile hamburger button */}
          {isPenerimaanAuthorized && (
            <button
              type="button"
              aria-label={mobileOpen ? 'Tutup navigasi' : 'Buka navigasi'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(!mobileOpen)}
              className="grid size-10 place-items-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 md:hidden"
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          )}

          {/* Profile Dropdown Container */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              aria-label="Profil amil"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen(!profileOpen);
              }}
              className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 py-1 pl-1.5 pr-2.5 text-left text-xs transition hover:bg-zinc-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <span className="grid size-7 place-items-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {initials || 'AP'}
              </span>
              <span className="hidden flex-col leading-none sm:flex">
                <strong className="max-w-[130px] truncate text-sm text-zinc-900">
                  {userName}
                </strong>
                <small className="mt-1 text-[10px] font-medium text-zinc-500">
                  {actor.level === 'leader' ? 'Kepala Penerimaan' : actor.isAdmin ? 'Administrator' : 'Staff Penerimaan'}
                </small>
              </span>
              <ChevronDown className={`size-3 text-zinc-400 transition ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Profile Dropdown Menu */}
            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="border-b border-zinc-100 px-3 py-2">
                  <p className="text-xs font-bold text-zinc-900">{userName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                    {user?.email || 'amil@baznas.go.id'}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                      {actor.level === 'leader' ? 'Kepala Bagian' : actor.isAdmin ? 'Admin' : 'Staff Pelaksana'}
                    </span>
                  </div>
                </div>

                {/* Settings link placed under profile dropdown */}
                {isAdmin && (
                  <Link
                    href="/penerimaan/pengaturan"
                    role="menuitem"
                    onClick={() => setProfileOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    <Settings2 className="size-4 text-zinc-500" />
                    <span>Pengaturan</span>
                  </Link>
                )}

                {/* Logout button */}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <LogOut className="size-4" />
                  <span>Keluar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Collapsible Navigation Drawer */}
      {mobileOpen && isPenerimaanAuthorized && (
        <nav
          aria-label="Navigasi mobile"
          className="border-t border-zinc-100 bg-white p-3 space-y-1 md:hidden shadow-lg animate-in slide-in-from-top-2 duration-150"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.id}
                href={item.href}
                data-active={active ? 'true' : 'false'}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  active
                    ? 'bg-emerald-50 text-emerald-700 font-bold'
                    : 'text-zinc-700 font-medium hover:bg-zinc-50'
                }`}
              >
                <Icon className={`size-4 ${active ? 'text-emerald-700' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {isAdmin && (
            <Link
              href="/penerimaan/pengaturan"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Settings2 className="size-4 text-zinc-500" />
              <span>Pengaturan</span>
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
