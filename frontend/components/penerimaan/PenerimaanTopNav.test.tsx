import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PenerimaanTopNav } from './PenerimaanTopNav';

let mockPathname = '/penerimaan';
const mockLogout = vi.fn();
let mockUser: {
  id: string | number;
  name: string;
  email: string;
  role: string;
  division?: string;
  level?: string;
} | null = {
  id: 1,
  name: 'Ahmad Staff',
  email: 'ahmad@baznas.go.id',
  role: 'penerimaan',
  division: 'Divisi Penerimaan',
  level: 'staff',
};

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
    isLoading: false,
  }),
}));

describe('PenerimaanTopNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/penerimaan';
    mockUser = {
      id: 1,
      name: 'Ahmad Staff',
      email: 'ahmad@baznas.go.id',
      role: 'penerimaan',
      division: 'Divisi Penerimaan',
      level: 'staff',
    };
  });

  it('renders exactly five primary navigation menu items', () => {
    render(<PenerimaanTopNav />);
    expect(screen.getByRole('img', { name: 'Logo resmi BAZNAS' })).toHaveAttribute('src', '/baznas-logo.png');
    const nav = screen.getByRole('navigation', { name: /navigasi utama/i });
    expect(nav).toBeInTheDocument();

    const expectedItems = ['Beranda', 'Transaksi', 'Muzakki', 'Rekonsiliasi', 'Laporan'];
    for (const label of expectedItems) {
      expect(within(nav).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('indicates active state for current pathname', () => {
    mockPathname = '/penerimaan/transaksi';
    render(<PenerimaanTopNav />);

    const transaksiLink = screen.getByRole('link', { name: /transaksi/i });
    expect(transaksiLink).toHaveAttribute('data-active', 'true');

    const berandaLink = within(screen.getByRole('navigation', { name: /navigasi utama/i })).getByRole('link', { name: /beranda/i });
    expect(berandaLink).toHaveAttribute('data-active', 'false');
  });

  it('toggles mobile menu and allows closing it', () => {
    render(<PenerimaanTopNav />);

    const mobileToggle = screen.getByRole('button', { name: /buka navigasi|tutup navigasi/i });
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(mobileToggle);
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = screen.getByRole('navigation', { name: /navigasi mobile/i });
    expect(mobileNav).toBeInTheDocument();

    // Click again to close
    fireEvent.click(mobileToggle);
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: /navigasi mobile/i })).not.toBeInTheDocument();
  });

  it('opens profile dropdown and displays user info', () => {
    render(<PenerimaanTopNav />);

    const profileButton = screen.getByRole('button', { name: /profil amil/i });
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(profileButton);
    expect(profileButton).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getAllByText('Ahmad Staff').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('ahmad@baznas.go.id')).toBeInTheDocument();
  });

  it('shows Pengaturan in profile dropdown only for Admin', () => {
    // Non-admin staff
    const { unmount } = render(<PenerimaanTopNav />);
    fireEvent.click(screen.getByRole('button', { name: /profil amil/i }));
    expect(screen.queryByRole('menuitem', { name: /pengaturan/i })).not.toBeInTheDocument();
    unmount();

    // Admin user
    mockUser = {
      id: 99,
      name: 'Super Admin',
      email: 'admin@baznas.go.id',
      role: 'admin',
      level: 'admin',
    };

    render(<PenerimaanTopNav />);
    fireEvent.click(screen.getByRole('button', { name: /profil amil/i }));
    const settingsLink = screen.getByRole('menuitem', { name: /pengaturan/i });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute('href', '/penerimaan/pengaturan');
  });

  it('calls logout callback when clicking Keluar', () => {
    render(<PenerimaanTopNav />);
    fireEvent.click(screen.getByRole('button', { name: /profil amil/i }));

    const logoutButton = screen.getByRole('menuitem', { name: /keluar/i });
    fireEvent.click(logoutButton);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('closes profile dropdown on Escape key press', () => {
    render(<PenerimaanTopNav />);
    const profileButton = screen.getByRole('button', { name: /profil amil/i });
    fireEvent.click(profileButton);
    expect(profileButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes profile dropdown when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <PenerimaanTopNav />
      </div>
    );
    const profileButton = screen.getByRole('button', { name: /profil amil/i });
    fireEvent.click(profileButton);
    expect(profileButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(profileButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('allows staff with role: staff and division: Divisi Penerimaan', () => {
    mockUser = {
      id: 7,
      name: 'Budi Staff',
      email: 'budi@baznas.go.id',
      role: 'staff',
      division: 'Divisi Penerimaan',
      level: 'staff',
    };

    render(<PenerimaanTopNav />);
    expect(screen.getByRole('navigation', { name: /navigasi utama/i })).toBeInTheDocument();
  });

  it('normalizes mixed-case administrator claims for settings access', () => {
    mockUser = {
      id: 99,
      name: 'Super Admin',
      email: 'admin@baznas.go.id',
      role: 'PENYALURAN',
      division: 'Divisi Penyaluran',
      level: ' ADMIN ',
    };

    render(<PenerimaanTopNav />);
    fireEvent.click(screen.getByRole('button', { name: /profil amil/i }));
    expect(screen.getByRole('menuitem', { name: /pengaturan/i })).toBeInTheDocument();
  });

  it('hides primary navigation destinations if user belongs to another division', () => {
    mockUser = {
      id: 5,
      name: 'Amil Penyaluran',
      email: 'penyaluran@baznas.go.id',
      role: 'penyaluran',
      division: 'Divisi Penyaluran',
      level: 'staff',
    };

    render(<PenerimaanTopNav />);
    expect(screen.queryByRole('navigation', { name: /navigasi utama/i })).not.toBeInTheDocument();
  });

  it('offers ordinary links to both modules only when the actual session claims allow both', () => {
    mockUser = {
      id: 99,
      name: 'Super Admin',
      email: 'admin@baznas.go.id',
      role: 'admin',
      level: 'admin',
      division: 'Pimpinan & Super Admin',
    };
    render(<PenerimaanTopNav />);

    fireEvent.click(screen.getByRole('button', { name: /mode peninjau/i }));
    expect(screen.getByRole('link', { name: 'Penyaluran' })).toHaveAttribute('href', '/penyaluran');
    expect(screen.getByRole('link', { name: 'Penerimaan' })).toHaveAttribute('href', '/penerimaan');
    expect(screen.getByRole('link', { name: 'Penerimaan' })).toHaveAttribute('aria-current', 'page');
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
