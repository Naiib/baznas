import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { canAccessActor, normalizeAccessActor } from './access';
import { RequireAuth } from './RequireAuth';
import * as AuthProviderModule from './AuthProvider';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/penyaluran';

vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
  })),
  usePathname: vi.fn(() => mockPathname),
}));

describe('RequireAuth access normalization', () => {
  it('treats role and level administrator representations identically', () => {
    expect(normalizeAccessActor({ role: 'PENYALURAN', level: 'ADMIN' }).isAdmin).toBe(true);
    expect(canAccessActor({ role: 'staff', division: 'Bidang Pengumpulan & ZIS' }, ['admin', 'penerimaan'])).toBe(true);
  });

  it('matches backend division rules without granting unrelated divisions', () => {
    expect(canAccessActor({ role: 'staff', division: 'Bidang Pengumpulan & ZIS' }, ['penerimaan'])).toBe(true);
    expect(canAccessActor({ role: 'staff', division: 'Tim Asesmen & Survey' }, ['penerimaan'])).toBe(false);
    expect(canAccessActor({ role: 'penyaluran', division: 'Bidang Pendistribusian & Pendayagunaan' }, ['penyaluran'])).toBe(true);
    expect(canAccessActor({ role: 'staff', division: 'Bidang Pendistribusian & Pendayagunaan' }, ['penyaluran'])).toBe(true);
    expect(canAccessActor({ role: 'staff', division: 'Bidang Pendistribusian & Pendayagunaan' }, ['penerimaan'])).toBe(false);
  });
});

describe('RequireAuth unauthenticated redirection', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete (window as unknown as { location?: Location }).location;
    window.location = {
      ...originalLocation,
      replace: vi.fn(),
    } as unknown as Location;
    mockPush.mockClear();
    mockReplace.mockClear();
    mockPathname = '/penyaluran';
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.clearAllMocks();
  });

  it('performs native window.location.replace to /login and avoids Next router.replace to prevent cross-origin RSC fetch errors', () => {
    vi.mocked(AuthProviderModule.useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(window.location.replace).toHaveBeenCalledWith('/login?next=%2Fpenyaluran');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it.each([
    ['/penerimaan/transaksi', { role: 'penyaluran', division: 'Penyaluran', level: 'staff' }],
    ['/penyaluran/mustahik', { role: 'penerimaan', division: 'Penerimaan', level: 'staff' }],
  ])('blocks a single-module session on direct URL %s', (pathname, user) => {
    mockPathname = pathname;
    vi.mocked(AuthProviderModule.useAuth).mockReturnValue({
      user: { id: 'single-role', name: 'Amil', email: 'amil@example.test', ...user } as any,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(
      <RequireAuth allowedRoles={pathname.startsWith('/penyaluran') ? ['admin', 'penyaluran', 'surveyor', 'keuangan'] : ['admin', 'penerimaan']}>
        <div>Operational data</div>
      </RequireAuth>,
    );

    expect(screen.getByText('Akses Ditolak')).toBeInTheDocument();
    expect(screen.queryByText('Operational data')).not.toBeInTheDocument();
  });
});
