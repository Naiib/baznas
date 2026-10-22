import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AmilTaskCenter } from './AmilTaskCenter';

const { getMustahikList } = vi.hoisted(() => ({ getMustahikList: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ api: { getMustahikList } }));

describe('AmilTaskCenter', () => {
  beforeEach(() => {
    getMustahikList.mockReset();
    getMustahikList.mockResolvedValue({ success: true, data: [
      { id: 3, name: 'Siti Aminah', nik: '3671012345678901', status: 'Diajukan', priority: 'Prioritas 1', program: 'Tangerang Cerdas', kecamatan: 'Karawaci' },
      { id: 4, name: 'Budi Santoso', nik: '3671012345678902', status: 'Survey', priority: 'Prioritas 2', program: 'Tangerang Sehat', kecamatan: 'Ciledug' },
    ] });
  });

  it('turns active applicant statuses into clear amil actions', async () => {
    render(<AmilTaskCenter />);

    expect(await screen.findByText('Verifikasi administrasi')).toBeInTheDocument();
    expect(screen.getByText('Survey lapangan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tinjau Siti Aminah/i })).toHaveAttribute('href', '/penyaluran/mustahik?id=3');
  });
});
