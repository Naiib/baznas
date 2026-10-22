import { RequireAuth } from '@/components/auth/RequireAuth';
import { ProgramPilarWorkspace } from '@/components/penyaluran/program/ProgramPilarWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Program 5 Pilar BAZNAS',
};

export default function ProgramPage() {
  return (
    <RequireAuth allowedRoles={['admin', 'penyaluran']}>
      <ProgramPilarWorkspace />
    </RequireAuth>
  );
}
