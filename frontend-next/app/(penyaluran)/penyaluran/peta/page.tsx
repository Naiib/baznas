import { RequireAuth } from '@/components/auth/RequireAuth';
import { PetaSebaranWorkspace } from '@/components/penyaluran/peta/PetaSebaranWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Peta Sebaran Penyaluran GIS',
};

export default function PetaPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran', 'surveyor']}>
      <PetaSebaranWorkspace mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN} />
    </RequireAuth>
  );
}
