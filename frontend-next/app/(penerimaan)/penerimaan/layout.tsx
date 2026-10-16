import React from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PenerimaanTopNav } from '@/components/penerimaan/PenerimaanTopNav';

export default function PenerimaanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={['admin', 'penerimaan']}>
      <div className="min-h-screen w-full bg-white flex flex-col font-sans text-zinc-900">
        <PenerimaanTopNav />
        <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}
