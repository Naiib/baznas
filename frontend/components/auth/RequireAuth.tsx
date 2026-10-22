'use client';

import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { canAccessActor } from './access';

export function RequireAuth({
  children,
  allowedRoles,
  allowedDivisions,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedDivisions?: string[];
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      const nextParam = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
      if (typeof window !== 'undefined') {
        window.location.replace(`/login${nextParam}`);
      }
    }
  }, [user, isLoading, pathname]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-emerald-600" />
          <p className="text-xs font-semibold text-zinc-500">Memverifikasi sesi amil...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isAuthorized = (!allowedRoles?.length && !allowedDivisions?.length)
    || canAccessActor(user, allowedRoles)
    || (allowedDivisions || []).some((division) => String(user.division || '').trim().toLowerCase().includes(String(division).trim().toLowerCase()));

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white p-4 text-center">
        <h2 className="text-base font-bold text-zinc-900">Akses Ditolak</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Akun Anda ({user.name} - {user.division || user.role}) tidak memiliki izin untuk mengakses halaman ini.
        </p>
        <button
          onClick={() => router.push('/')}
          className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
