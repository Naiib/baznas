import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PenerimaanDashboard } from './PenerimaanDashboard';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanOverviewResponse } from '@/lib/api/types';

const mockOverviewData: PenerimaanOverviewResponse = {
  period: '30d',
  metrics: {
    total_collected: '150000000',
    total_transactions: 120,
    validated_transaction_count: 112,
    active_muzakki_count: 95,
    pending_validation_count: 5,
    pending_approval_count: 3,
    unreconciled_count: 8,
    average_amount: '1250000',
    target_attainment_pct: 82.5,
    exception_count: 2,
  },
  trend: [
    { date: '2026-09-01', amount: '25000000', count: 20 },
    { date: '2026-09-02', amount: '35000000', count: 30 },
    { date: '2026-09-03', amount: '45000000', count: 40 },
  ],
  fund_type_breakdown: [
    { fund_type: 'zakat_maal', name: 'Zakat Maal', amount: '90000000', percentage: 60 },
    { fund_type: 'infak', name: 'Infak & Sedekah', amount: '45000000', percentage: 30 },
    { fund_type: 'dskh', name: 'DSKH', amount: '15000000', percentage: 10 },
  ],
  channel_breakdown: [
    { channel: 'qris', name: 'QRIS', amount: '60000000', percentage: 40 },
    { channel: 'transfer_bank', name: 'Transfer Bank', amount: '60000000', percentage: 40 },
    { channel: 'tunai', name: 'Kas Tunai', amount: '30000000', percentage: 20 },
  ],
  action_queue: [
    { id: 'act-1', title: 'Validasi Transaksi Masuk', type: 'validation', count: 5, link: '/penerimaan/transaksi?status=Masuk' },
    { id: 'act-2', title: 'Persetujuan Kepala Bagian', type: 'approval', count: 3, link: '/penerimaan/transaksi?status=Menunggu+Approval' },
    { id: 'act-3', title: 'Rekonsiliasi Settlement', type: 'reconciliation', count: 8, link: '/penerimaan/rekonsiliasi' },
  ],
  recent_activity: [
    {
      id: 'log-1',
      transaction_number: 'TRX-202609-0001',
      actor_name: 'Ahmad Staff',
      action: 'Validasi',
      description: 'Zakat Maal Rp5.000.000 berhasil diverifikasi',
      amount: '5000000',
      timestamp: '2026-09-08T10:30:00Z',
      status: 'Menunggu Rekonsiliasi',
    },
  ],
};

let mockUser = {
  id: 1,
  name: 'Ahmad Staff',
  email: 'ahmad@baznas.go.id',
  role: 'penerimaan',
  division: 'Divisi Penerimaan',
  level: 'staff',
};

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

vi.mock('@/lib/api/penerimaan', () => ({
  penerimaanApi: {
    getOverview: vi.fn(),
  },
}));

describe('PenerimaanDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 1,
      name: 'Ahmad Staff',
      email: 'ahmad@baznas.go.id',
      role: 'penerimaan',
      division: 'Divisi Penerimaan',
      level: 'staff',
    };
    (penerimaanApi.getOverview as any).mockResolvedValue({
      success: true,
      data: mockOverviewData,
    });
  });

  it('renders all 8 KPI cards with formatted values', async () => {
    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/total penerimaan/i)).toBeInTheDocument();
    });

    // 8 KPI labels
    expect(screen.getByText(/total penerimaan/i)).toBeInTheDocument();
    expect(screen.getByText(/terverifikasi/i)).toBeInTheDocument();
    expect(screen.getByText(/menunggu validasi/i)).toBeInTheDocument();
    expect(screen.getByText(/antrean approval/i)).toBeInTheDocument();
    expect(screen.getByText(/muzakki aktif/i)).toBeInTheDocument();
    expect(screen.getByText(/rata-rata transaksi/i)).toBeInTheDocument();
    expect(screen.getByText(/pencapaian target/i)).toBeInTheDocument();
    expect(screen.getByText(/pengecualian & flag/i)).toBeInTheDocument();

    // KPI Values
    expect(screen.getByText('Rp 150.000.000')).toBeInTheDocument();
    expect(screen.getByText('112')).toBeInTheDocument(); // Validated transaction count
    expect(screen.getByText('95')).toBeInTheDocument(); // Active muzakki count
    expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(2); // Pending validation and action queue
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(2); // Pending approval and action queue
    expect(screen.getByText('82.5%')).toBeInTheDocument(); // Target attainment
  });

  it('uses the default dashboard period without rendering standalone period controls', async () => {
    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(penerimaanApi.getOverview).toHaveBeenCalledWith('30d');
    });

    expect(screen.queryByRole('button', { name: /7 hari/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /30 hari/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /1 tahun/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kustom/i })).not.toBeInTheDocument();
  });

  it('renders action queue linking directly to operational tasks', async () => {
    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Validasi Transaksi Masuk')).toBeInTheDocument();
    });

    const validationLink = screen.getByRole('link', { name: /validasi transaksi masuk/i });
    expect(validationLink).toHaveAttribute('href', '/penerimaan/transaksi?status=Masuk');

    const approvalLink = screen.getByRole('link', { name: /persetujuan kepala bagian/i });
    expect(approvalLink).toHaveAttribute('href', '/penerimaan/transaksi?status=Menunggu+Approval');
  });

  it('renders fund type and payment channel breakdowns', async () => {
    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Zakat Maal')).toBeInTheDocument();
    });

    expect(screen.getByText('Infak & Sedekah')).toBeInTheDocument();
    expect(screen.getByText('QRIS')).toBeInTheDocument();
    expect(screen.getByText('Transfer Bank')).toBeInTheDocument();
    expect(screen.getByText('Kas Tunai')).toBeInTheDocument();
  });

  it('renders empty state when total transactions is zero', async () => {
    (penerimaanApi.getOverview as any).mockResolvedValue({
      success: true,
      data: {
        ...mockOverviewData,
        metrics: {
          ...mockOverviewData.metrics,
          total_collected: '0',
          total_transactions: 0,
          pending_validation_count: 0,
          pending_approval_count: 0,
          unreconciled_count: 0,
          exception_count: 0,
        },
        action_queue: [],
        trend: [],
        fund_type_breakdown: [],
        channel_breakdown: [],
      },
    });

    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/belum ada transaksi/i)).toBeInTheDocument();
    });

    const createLink = screen.getByRole('link', { name: /catat transaksi manual/i });
    expect(createLink).toHaveAttribute('href', '/penerimaan/transaksi/baru');
  });

  it('renders error state with retry button on API failure', async () => {
    (penerimaanApi.getOverview as any).mockRejectedValue(new Error('Gagal terhubung ke server'));

    render(<PenerimaanDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/gagal memuat data dashboard/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /coba lagi/i });
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    (penerimaanApi.getOverview as any).mockResolvedValue({
      success: true,
      data: mockOverviewData,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Rp 150.000.000')).toBeInTheDocument();
    });
  });
});
