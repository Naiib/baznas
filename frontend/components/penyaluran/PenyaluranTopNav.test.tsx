import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PenyaluranTopNav } from './PenyaluranTopNav';

let mockUser: { name: string; role: string; level: string; email: string };

vi.mock('next/navigation', () => ({
  usePathname: () => '/penyaluran',
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

describe('PenyaluranTopNav', () => {
  beforeEach(() => {
    mockUser = { name: 'Admin Level', role: 'penyaluran', level: 'admin', email: 'admin@baznas.go.id' };
  });

  it('shows direct V1 navigation and admin-only settings', () => {
    render(<PenyaluranTopNav />);

    expect(screen.getByRole('img', { name: 'Logo resmi BAZNAS' })).toHaveAttribute('src', '/baznas-logo.png');
    expect(screen.getByRole('link', { name: 'Data Mustahik' })).toHaveAttribute('href', '/penyaluran/mustahik');
    expect(screen.getByRole('link', { name: 'Program 5 Pilar' })).toHaveAttribute('href', '/penyaluran/program');
    expect(screen.getByRole('link', { name: 'Peta Sebaran (GIS)' })).toHaveAttribute('href', '/penyaluran/peta');
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Profil amil' }));
    expect(screen.getByRole('menuitem', { name: 'Pengaturan' })).toBeInTheDocument();
  });

  it('treats padded mixed-case admin role and level values as administrator access', () => {
    mockUser = { name: 'Admin Mixed', role: ' PENYALURAN ', level: ' ADMIN ', email: 'admin@baznas.go.id' };

    render(<PenyaluranTopNav />);

    fireEvent.click(screen.getByRole('button', { name: 'Profil amil' }));
    expect(screen.getByRole('menuitem', { name: 'Pengaturan' })).toBeInTheDocument();
  });

  it('announces the mobile navigation state through its accessible label', () => {
    render(<PenyaluranTopNav />);

    const toggle = screen.getByRole('button', { name: 'Buka navigasi' });
    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Tutup navigasi' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('restricts navigation for role keuangan to Mustahik and shows Divisi Keuangan label', () => {
    mockUser = { name: 'Finance Staff', role: 'keuangan', level: 'staff', email: 'finance@baznas.go.id' };

    render(<PenyaluranTopNav />);

    expect(screen.getByRole('link', { name: 'Data Mustahik' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Beranda' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Program 5 Pilar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Peta Sebaran (GIS)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export PDF/ })).not.toBeInTheDocument();
    expect(screen.getByText('Divisi Keuangan')).toBeInTheDocument();
  });

  it('does not expose the program destination to surveyors', () => {
    mockUser = { name: 'Surveyor', role: 'surveyor', level: 'staff', email: 'surveyor@baznas.go.id' };

    render(<PenyaluranTopNav />);

    expect(screen.getByRole('link', { name: 'Beranda' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Data Mustahik' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Peta Sebaran (GIS)' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Program 5 Pilar' })).not.toBeInTheDocument();
  });

  it('shows module navigation only to a session authorized for both modules', () => {
    const { unmount } = render(<PenyaluranTopNav />);
    fireEvent.click(screen.getByRole('button', { name: /mode peninjau/i }));
    expect(screen.getByRole('navigation', { name: 'Pindah modul' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Penerimaan' })).toHaveAttribute('href', '/penerimaan');
    unmount();

    mockUser = { name: 'Amil Penyaluran', role: 'penyaluran', level: 'staff', email: 'p@baznas.go.id' };
    render(<PenyaluranTopNav />);
    expect(screen.queryByRole('button', { name: /mode peninjau/i })).not.toBeInTheDocument();
    unmount();
  });

  it('opens and closes the export PDF dialog from the flat navigation', () => {
    render(<PenyaluranTopNav />);

    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }));
    expect(screen.getByRole('dialog', { name: 'Export Laporan PDF' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup export PDF' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
