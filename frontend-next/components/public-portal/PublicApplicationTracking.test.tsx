import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublicApplicationTracking } from './PublicApplicationTracking';

const { trackPublicApplication } = vi.hoisted(() => ({ trackPublicApplication: vi.fn() }));

vi.mock('@/lib/api/client', () => ({
  api: { trackPublicApplication },
  ApiError: class ApiError extends Error { status = 404; },
}));

describe('PublicApplicationTracking', () => {
  beforeEach(() => trackPublicApplication.mockReset());

  it('renders the status timeline for a found application', async () => {
    trackPublicApplication.mockResolvedValue({ success: true, data: { mustahik: { name: 'Siti Aminah', nik: '3671012345678901', phone: '081234567890', address: 'Jl. Rahasia No. 1', file_no: 'MST-202609-0001', kecamatan: 'Karawaci', program: 'Tangerang Cerdas', asnaf: 'Miskin', status: 'Survey' }, status: 'Survey', timeline: [{ phase: 1, name: 'Pendaftaran & Berkas', status: 'completed' }, { phase: 2, name: 'Verifikasi Administrasi', status: 'completed' }, { phase: 3, name: 'Survey & Penilaian Lapangan', status: 'active' }, { phase: 4, name: 'Persetujuan MPZIS & Pengajuan Dana', status: 'pending' }, { phase: 5, name: 'Penyaluran Dana', status: 'pending' }] } });
    render(<PublicApplicationTracking />);

    fireEvent.change(screen.getByLabelText(/nomor berkas/i), { target: { value: 'MST-202609-0001' } });
    fireEvent.click(screen.getByRole('button', { name: /lacak pengajuan/i }));

    expect((await screen.findAllByText(/survey & penilaian lapangan/i)).length).toBeGreaterThan(0);
    expect(screen.getByText('S. A.')).toBeInTheDocument();
    expect(screen.queryByText('Siti Aminah')).not.toBeInTheDocument();
    expect(screen.queryByText('3671012345678901')).not.toBeInTheDocument();
    expect(screen.queryByText('081234567890')).not.toBeInTheDocument();
    expect(screen.queryByText('Jl. Rahasia No. 1')).not.toBeInTheDocument();
  });

  it('renders a not-found message without showing a fabricated record', async () => {
    trackPublicApplication.mockRejectedValueOnce(new Error('Pengajuan tidak ditemukan.'));
    render(<PublicApplicationTracking />);

    fireEvent.change(screen.getByLabelText(/nomor berkas/i), { target: { value: 'MST-0000' } });
    fireEvent.click(screen.getByRole('button', { name: /lacak pengajuan/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pengajuan tidak ditemukan/i);
    expect(screen.queryByText(/ringkasan pengajuan/i)).not.toBeInTheDocument();
  });
});
