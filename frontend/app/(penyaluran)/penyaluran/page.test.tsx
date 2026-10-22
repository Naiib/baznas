import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PenyaluranPage from './page';

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/penyaluran',
}));

describe('PenyaluranPage App Router Entry', () => {
  it('renders the current operational dashboard entry for penyaluran role', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Amil Penyaluran', role: 'penyaluran', level: 'staff' },
      isLoading: false,
    });

    render(<PenyaluranPage />);
    expect(await screen.findByRole('heading', { name: /Penyaluran & Asesmen Program/ })).toBeInTheDocument();
    expect(await screen.findByText(/Kota Tangerang/)).toBeInTheDocument();
    expect(await screen.findByRole('tab', { name: /Ringkasan Eksekutif/ })).toBeInTheDocument();
  });

  it('rejects keuangan role with Akses Ditolak', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'finance-1', name: 'Staff Keuangan', role: 'keuangan', division: 'Divisi Keuangan', level: 'staff' },
      isLoading: false,
    });

    render(<PenyaluranPage />);
    expect(await screen.findByText('Akses Ditolak')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ruang kendali penyaluran' })).not.toBeInTheDocument();
  });
});
