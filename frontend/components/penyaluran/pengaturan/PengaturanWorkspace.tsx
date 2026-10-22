'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';
import { MasterDataOperations } from './MasterDataOperations';
import { TeamAccessPanel } from './TeamAccessPanel';

export function PengaturanWorkspace() {
  const { user } = useAuth();
  const isAdmin = normalizeAccessActor(user).isAdmin;
  return <main className="mx-auto w-full max-w-[1440px] space-y-5 pb-8 sm:space-y-6">
    {isAdmin && <TeamAccessPanel />}
    <MasterDataOperations />
  </main>;
}
