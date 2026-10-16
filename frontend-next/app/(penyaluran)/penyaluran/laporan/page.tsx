import { RequireAuth } from '@/components/auth/RequireAuth';
import { LaporanPenyaluranWorkspace } from '@/components/penyaluran/laporan/LaporanPenyaluranWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Laporan Penyaluran',
};

export default function LaporanPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran', 'surveyor']}>
      <LaporanPenyaluranWorkspace />
    </RequireAuth>
  );
}
