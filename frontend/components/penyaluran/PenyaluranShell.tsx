import React from 'react';
import { PenyaluranTopNav } from './PenyaluranTopNav';

export function PenyaluranShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-white flex flex-col font-sans">
      <PenyaluranTopNav />
      <main className="flex-1 w-full max-w-[1920px] mx-auto p-4 sm:p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
