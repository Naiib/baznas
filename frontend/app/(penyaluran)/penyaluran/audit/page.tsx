import { RequireAuth } from '@/components/auth/RequireAuth';
import { ApprovalAuditWorkspace } from '@/components/penyaluran/audit/ApprovalAuditWorkspace';

export default function ApprovalAuditPage() {
  return (
    <RequireAuth allowedRoles={['admin']}>
      <ApprovalAuditWorkspace />
    </RequireAuth>
  );
}
