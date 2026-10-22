import { RequireAuth } from '@/components/auth/RequireAuth';
import { AmilTaskCenter } from '@/components/penyaluran/tugas/AmilTaskCenter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tugas Amil | Penyaluran BAZNAS' };

export default function TugasPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran', 'surveyor']}>
      <AmilTaskCenter />
    </RequireAuth>
  );
}
