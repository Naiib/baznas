import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasterDataOperations } from './MasterDataOperations';
import { PengaturanWorkspace } from './PengaturanWorkspace';

const { getMasterData, createMasterData, getUsers, updateUserAccess } = vi.hoisted(() => ({ getMasterData: vi.fn(), createMasterData: vi.fn(), getUsers: vi.fn(), updateUserAccess: vi.fn() }));
const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/lib/api/client', () => ({ api: { getMasterData, createMasterData, getUsers, updateUserAccess } }));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth }));

describe('MasterDataOperations', () => {
  beforeEach(() => {
    getMasterData.mockReset();
    createMasterData.mockReset();
    getUsers.mockReset();
    updateUserAccess.mockReset();
    useAuth.mockReturnValue({ user: { role: 'admin' } });
    getMasterData.mockResolvedValue({ success: true, data: [
      { id: 1, category: 'program', record_key: 'tangerang-cerdas', label: 'Tangerang Cerdas', description: 'Pendidikan', is_active: true, sort_order: 1 },
    ] });
    getUsers.mockResolvedValue({ success: true, data: [
      { id: 2, name: 'H. Rahmat Hidayat', email: 'rahmat@baznas.go.id', role: 'penyaluran', division: 'Penyaluran', level: 'leader', is_active: true },
    ] });
  });

  it('renders master records and allows an admin to switch category', async () => {
    render(<MasterDataOperations />);

    expect(await screen.findByText('Tangerang Cerdas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tambah data/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dokumen wajib/i }));
    expect(getMasterData).toHaveBeenLastCalledWith({ category: 'dokumen' });
  });

  it('shows Penyaluran access levels to an administrator', async () => {
    render(<PengaturanWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Akses tim Penyaluran' })).toBeInTheDocument();
    expect(screen.getByText('H. Rahmat Hidayat')).toBeInTheDocument();
    expect(screen.getByText('Kepala Bagian')).toBeInTheDocument();
  });

  it('shows administrator controls for a padded mixed-case admin level', async () => {
    useAuth.mockReturnValue({ user: { role: ' penyaluran ', level: ' ADMIN ' } });

    render(<PengaturanWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Akses tim Penyaluran' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tambah data/i })).toBeInTheDocument();
  });
});
