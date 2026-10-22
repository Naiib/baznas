import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetaSebaranWorkspace } from './PetaSebaranWorkspace';

const getPenyaluranByKecamatan = vi.hoisted(() => vi.fn());

vi.mock('next/dynamic', () => ({
  default: () => function RealKecamatanMapMock({ onSelectKecamatan, mapboxAccessToken }: { onSelectKecamatan: (name: string) => void; mapboxAccessToken?: string }) {
    return <button type="button" data-mapbox-token={mapboxAccessToken} onClick={() => onSelectKecamatan('Karawaci')}>Pilih Karawaci</button>;
  },
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    getPenyaluranByKecamatan,
  },
}));

describe('PetaSebaranWorkspace', () => {
  it('forwards the server-provided public Mapbox token to the map renderer', () => {
    render(<PetaSebaranWorkspace mapboxAccessToken="public-mapbox-token" />);

    expect(screen.getByRole('button', { name: 'Pilih Karawaci' })).toHaveAttribute('data-mapbox-token', 'public-mapbox-token');
  });

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
    getPenyaluranByKecamatan.mockReset();
    getPenyaluranByKecamatan.mockRejectedValue(new Error('Data API belum tersedia'));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('shows a loading state before live map data resolves', () => {
    getPenyaluranByKecamatan.mockReturnValue(new Promise(() => {}));

    render(<PetaSebaranWorkspace />);

    expect(screen.getAllByText('Memuat data peta…')).not.toHaveLength(0);
    expect(screen.queryByText('Data peta tersinkron')).not.toBeInTheDocument();
    expect(screen.queryByText(/Belum ada transaksi tervalidasi/i)).not.toBeInTheDocument();
  });

  it('updates selected detail after selecting a map area', async () => {
    render(<PetaSebaranWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pilih Karawaci' }));

    expect(screen.getByRole('heading', { name: 'Karawaci' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/data peta tidak tersedia/i);
  });

  it('does not render fixture insights when live map data is unavailable', async () => {
    render(<PetaSebaranWorkspace />);

    await screen.findByRole('alert');

    expect(screen.queryByText(/14,2% dari periode sebelumnya/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Rp 492 jt')).not.toBeInTheDocument();
    expect(screen.queryByText('490')).not.toBeInTheDocument();
  });

  it('changes metric wording to jumlah mustahik', async () => {
    render(<PetaSebaranWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: 'Jumlah mustahik' }));

    expect(screen.getAllByText('Mustahik terbantu')).not.toHaveLength(0);
  });

  it('does not present a program filter before filtering is available', async () => {
    render(<PetaSebaranWorkspace />);

    await screen.findByRole('button', { name: 'Realisasi dana' });

    expect(screen.queryByRole('button', { name: 'Semua program' })).not.toBeInTheDocument();
  });

  it('uses the current API top program in the selected area detail', async () => {
    getPenyaluranByKecamatan.mockResolvedValue({
      data: [{
        id: 'cipondoh', name: 'Cipondoh', totalDisalurkan: 2_900_000_000,
        totalMustahik: 1_500, desil1Count: 600, topProgram: 'Program API Terkini',
      }],
    });

    render(<PetaSebaranWorkspace />);

    const detail = await screen.findByLabelText('Detail wilayah terpilih');
    expect(within(detail).getByText('Program API Terkini')).toBeInTheDocument();
  });

  it('labels aggregate panels unavailable when live areas exist without aggregates', async () => {
    getPenyaluranByKecamatan.mockResolvedValue({
      data: [{ id: 'cipondoh', name: 'Cipondoh', totalDisalurkan: 1_000_000, totalMustahik: 4, desil1Count: 2, topProgram: 'Program API Terkini' }],
    });

    render(<PetaSebaranWorkspace />);

    expect(await screen.findByText('Data agregat program belum tersedia untuk periode ini.')).toBeInTheDocument();
    expect(screen.queryByText(/Belum ada transaksi tervalidasi/i)).not.toBeInTheDocument();
  });

  it('does not report a zero trend when live trend evidence is unavailable', async () => {
    getPenyaluranByKecamatan.mockResolvedValue({
      data: [{ id: 'cipondoh', name: 'Cipondoh', totalDisalurkan: 1_000_000, totalMustahik: 4, desil1Count: 2, topProgram: 'Program API Terkini' }],
    });

    render(<PetaSebaranWorkspace />);

    expect(await screen.findByText('Tren belum tersedia')).toBeInTheDocument();
    expect(screen.queryByText(/↑ 0% dari periode sebelumnya/i)).not.toBeInTheDocument();
  });

  it('shows an empty data state when the API returns no areas', async () => {
    getPenyaluranByKecamatan.mockResolvedValue({ data: [] });

    render(<PetaSebaranWorkspace />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/data peta tidak tersedia/i);
  });

  it('does not mark a selected area as priority when live data is unavailable', async () => {
    render(<PetaSebaranWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pilih Karawaci' }));
    await screen.findByRole('alert');

    expect(screen.queryByText('PRIORITAS')).not.toBeInTheDocument();
  });
});
