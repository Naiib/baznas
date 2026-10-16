import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';
import { getPostLoginRedirect } from './redirect';

const { apiLogin, login, replace, searchParams } = vi.hoisted(() => ({
  apiLogin: vi.fn(),
  login: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.delete('next');
  apiLogin.mockRejectedValue(new Error('Layanan autentikasi tidak tersedia'));
});

vi.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => ({ login }) }));
vi.mock('@/lib/api/client', () => ({ api: { login: apiLogin } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

describe('LoginPage', () => {
  it('shows an API failure and does not create a client session', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'amil@baznas.go.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia' } });
    fireEvent.click(screen.getByRole('button', { name: /masuk ke sistem/i }));

    await waitFor(() => expect(screen.getByText('Layanan autentikasi tidak tersedia')).toBeInTheDocument());
    expect(apiLogin).toHaveBeenCalledWith({ email: 'amil@baznas.go.id', password: 'rahasia' });
    expect(login).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('routes penerimaan users to the penerimaan dashboard after login', async () => {
    apiLogin.mockResolvedValueOnce({
      data: {
        token: 'penerimaan-token',
        user: { id: 'amil-1', name: 'Amil Penerimaan', role: 'penerimaan', division: 'Penerimaan' },
      },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'penerimaan@baznas.go.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia' } });
    fireEvent.click(screen.getByRole('button', { name: /masuk ke sistem/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/penerimaan'));
    expect(login).toHaveBeenCalledWith(
      'penerimaan-token',
      expect.objectContaining({ role: 'penerimaan' }),
    );
  });

  it('routes a staff actor in the Penerimaan division to the penerimaan dashboard', () => {
    expect(getPostLoginRedirect({ role: 'staff' as any, division: 'Bidang Pengumpulan & ZIS' } as any)).toBe('/penerimaan');
  });

  it('keeps a safe internal next path after login', async () => {
    searchParams.set('next', '/penerimaan/transaksi');
    apiLogin.mockResolvedValueOnce({
      data: {
        token: 'penerimaan-token',
        user: { id: 'amil-1', name: 'Amil Penerimaan', role: 'penerimaan' },
      },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'penerimaan@baznas.go.id' } });
    fireEvent.change(screen.getByLabelText(/kata sandi/i), { target: { value: 'rahasia' } });
    fireEvent.click(screen.getByRole('button', { name: /masuk ke sistem/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/penerimaan/transaksi'));
  });

  it('falls back when next targets the other operational workspace', () => {
    expect(getPostLoginRedirect({ role: 'penerimaan' }, '/penyaluran')).toBe('/penerimaan');
    expect(getPostLoginRedirect({ role: 'penyaluran' }, '/penerimaan/transaksi')).toBe('/penyaluran');
  });

  it('rejects unsafe or unknown next paths', () => {
    expect(getPostLoginRedirect({ role: 'penerimaan' }, '/\\evil.com')).toBe('/penerimaan');
    expect(getPostLoginRedirect({ role: 'penerimaan' }, '/api/auth/me')).toBe('/penerimaan');
    expect(getPostLoginRedirect({ role: 'penerimaan' }, '/login')).toBe('/penerimaan');
    expect(getPostLoginRedirect({ role: 'penerimaan' }, '/not-a-route')).toBe('/penerimaan');
  });

  it('routes keuangan role to penyaluran workspace with default landing at /penyaluran/mustahik', () => {
    expect(getPostLoginRedirect({ role: 'keuangan' })).toBe('/penyaluran/mustahik');
    expect(getPostLoginRedirect({ role: 'keuangan' }, '/penyaluran/mustahik')).toBe('/penyaluran/mustahik');
  });

  it('does not send unsupported operational roles into penyaluran', () => {
    expect(getPostLoginRedirect({ role: 'sdm' })).toBe('/');
  });
});
