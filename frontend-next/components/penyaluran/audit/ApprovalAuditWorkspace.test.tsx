import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApprovalAuditWorkspace } from './ApprovalAuditWorkspace';

const getApprovalAudit = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({ api: { getApprovalAudit } }));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth }));

describe('ApprovalAuditWorkspace', () => {
  beforeEach(() => {
    getApprovalAudit.mockReset().mockResolvedValue({ data: [] });
    useAuth.mockReturnValue({ user: { role: 'penyaluran', level: 'ADMIN' } });
  });

  it('authorizes a padded mixed-case admin level consistently with RequireAuth', async () => {
    useAuth.mockReturnValue({ user: { role: ' penyaluran ', level: ' ADMIN ' } });
    render(<ApprovalAuditWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Audit keputusan penyaluran' })).toBeInTheDocument();
    await waitFor(() => expect(getApprovalAudit).toHaveBeenCalledWith(undefined));
    expect(screen.queryByText('Audit khusus admin')).not.toBeInTheDocument();
  });
});
