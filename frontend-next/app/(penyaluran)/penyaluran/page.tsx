import { RequireAuth } from '@/components/auth/RequireAuth';
import { ConceptThreeDashboard } from '@/components/penyaluran/dashboard/ConceptThreeDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Beranda Penyaluran',
};

export default function PenyaluranPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran', 'surveyor']}>
      <ConceptThreeDashboard mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN} />
    </RequireAuth>
  );
}
