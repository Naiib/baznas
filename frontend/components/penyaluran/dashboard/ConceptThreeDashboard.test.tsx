import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { ConceptThreeDashboard } from './ConceptThreeDashboard';

const getPenyaluranOverview = vi.hoisted(() => vi.fn());
const getPenyaluranByKecamatan = vi.hoisted(() => vi.fn());

vi.mock('next/dynamic', () => ({
  default: () => function MockRealKecamatanMap({ onSelectKecamatan }: { onSelectKecamatan: (name: string) => void }) {
    return <button type="button" onClick={() => onSelectKecamatan('Pinang')}>Pilih Pinang</button>;
  },
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'staff-1', role: 'penyaluran', level: 'staff' }, isLoading: false }),
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    getPenyaluranOverview,
    getPenyaluranByKecamatan,
    getPenyaluranTransactions: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

describe('ConceptThreeDashboard', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
    vi.clearAllMocks();
    getPenyaluranOverview.mockResolvedValue({
    data: {
      dataStatus: 'empty',
      metrics: { totalPenyaluran: 0, totalMustahik: 0, efektivitasPenyaluran: 0, targetRkat: 0 },
      map: {},
    },
    });
    getPenyaluranByKecamatan.mockResolvedValue({
      data: [],
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('shows a loading state instead of empty dashboard values while overview is pending', () => {
    getPenyaluranOverview.mockReturnValue(new Promise(() => {}));
    getPenyaluranByKecamatan.mockReturnValue(new Promise(() => {}));

    render(<ConceptThreeDashboard />);

    expect(screen.getAllByRole('status')).not.toHaveLength(0);
    expect(screen.getAllByText('Memuat ringkasan operasional…')).not.toHaveLength(0);
    expect(screen.queryByText(/Belum ada transaksi tervalidasi/i)).not.toBeInTheDocument();
  });

  it('keeps the dashboard period fixed without rendering standalone period controls', async () => {
    render(<ConceptThreeDashboard />);

    await waitFor(() => {
      expect(getPenyaluranOverview).toHaveBeenCalledWith('30d');
    });
    expect(screen.queryByRole('button', { name: '7 Hari' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30 Hari' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 Tahun' })).not.toBeInTheDocument();
  });

  it('switches between the four V1 dashboard modules', async () => {
    render(<ConceptThreeDashboard />);

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Ringkasan Eksekutif', 'Analisis 5 Pilar', 'Syariat 8 Asnaf', 'Buku Kas Realisasi',
    ]);
    fireEvent.click(tabs[1]!);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Alokasi & Dampak 5 Pilar')).toBeInTheDocument();
    fireEvent.click(tabs[3]!);
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Buku Kas Realisasi Penyaluran' })).toBeInTheDocument();
  });

  it('surfaces kecamatan data failures instead of implying the map is complete', async () => {
    getPenyaluranByKecamatan.mockRejectedValue(new Error('Data wilayah belum tersedia'));

    render(<ConceptThreeDashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Data wilayah belum tersedia');
  });

  it('renders truthful empty program text instead of synthetic Tangerang Peduli when area has no program', async () => {
    render(<ConceptThreeDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pilih Pinang' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pilih Pinang' }));

    expect(screen.getByRole('heading', { name: 'Pinang' })).toBeInTheDocument();
    expect(screen.getByText(/0 mustahik · Belum ada data/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tangerang Peduli/i)).not.toBeInTheDocument();
  });
});
