'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor, type AccessActor } from '@/components/auth/access';
import { api } from '@/lib/api/client';
import type { CurrentUser } from '@/lib/api/types';
import { Lock, Mail, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type Workspace = 'penerimaan' | 'penyaluran';
type LoginDestination = Workspace | 'public';

const LOGIN_ORIGIN = 'https://baznas.local';

function destinationForPath(pathname: string): LoginDestination | null {
  if (pathname === '/' || pathname === '/cek-pengajuan' || pathname === '/pengajuan') {
    return 'public';
  }
  if (pathname === '/penerimaan' || pathname.startsWith('/penerimaan/')) {
    return 'penerimaan';
  }
  if (pathname === '/penyaluran' || pathname.startsWith('/penyaluran/')) {
    return 'penyaluran';
  }
  return null;
}

import { getPostLoginRedirect } from './redirect';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login({ email: username, password });
      const token = res.data?.token || (res as unknown as { token?: string }).token;
      const user = res.data?.user || (res as unknown as { user?: CurrentUser }).user;
      if (token && user) {
        login(token, user);
        router.replace(getPostLoginRedirect(user, nextPath));
      } else {
        setError('Respons autentikasi tidak lengkap. Silakan coba kembali.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Layanan autentikasi tidak tersedia');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto size-12 overflow-hidden rounded-xl">
          <img
            src="/baznas-logo.png"
            alt="BAZNAS"
            className="size-full object-contain"
          />
        </div>
        <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
          SIM BAZNAS KOTA TANGERANG
        </h1>
        <p className="text-xs text-zinc-500">
          Masuk ke portal operasional amil penyaluran
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-bold text-zinc-700 mb-1">
            Email / Username Amil
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              id="login-email"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="penyaluran@baznas.go.id"
              className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="block text-xs font-bold text-zinc-700 mb-1">
            Kata Sandi
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Memproses...</span>
            </>
          ) : (
            <>
              <span>Masuk ke Sistem</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center">
        <Link href="/" className="text-[11px] font-semibold text-emerald-700 hover:underline">
          ← Kembali ke Portal Publik Mustahik
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-8">
            <Loader2 className="size-6 animate-spin text-emerald-600" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
