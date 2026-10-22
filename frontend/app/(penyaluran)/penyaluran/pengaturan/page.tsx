import { RequireAuth } from '@/components/auth/RequireAuth';
import { PengaturanWorkspace } from '@/components/penyaluran/pengaturan/PengaturanWorkspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data Master | Penyaluran BAZNAS' };

export default function PengaturanPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran', 'surveyor']}>
      <PengaturanWorkspace />
    </RequireAuth>
  );
}
