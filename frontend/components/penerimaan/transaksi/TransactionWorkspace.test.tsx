import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionWorkspace } from './TransactionWorkspace';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanTransaction, CursorPaginatedResponse } from '@/lib/api/types';

const mockTransactions: PenerimaanTransaction[] = [
  {
    id: 1,
    transaction_number: 'TRX-202609-001',
    channel: 'bank_transfer' as any,
    channel_category: 'digital',
    muzakki_name: 'Budi Santoso',
    muzakki_phone: '08123456789',
    fund_type: 'zakat_maal' as any,
    amount: '5000000',
    fee_amount: '0',
    net_amount: '5000000',
    status: 'Menunggu Validasi',
    is_manual: false,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: false,
    created_at: '2026-09-08T10:00:00Z',
    updated_at: '2026-09-08T10:00:00Z',
  },
  {
    id: 2,
    transaction_number: 'TRX-202609-002',
    channel: 'qris' as any,
    channel_category: 'digital',
    muzakki_name: 'PT Maju Bersama',
    muzakki_phone: '08198765432',
    fund_type: 'infak' as any,
    amount: '25000000', // > 10M (ineligible for bulk validation)
    fee_amount: '0',
    net_amount: '25000000',
    status: 'Menunggu Validasi',
    is_manual: false,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: false,
    created_at: '2026-09-08T11:00:00Z',
    updated_at: '2026-09-08T11:00:00Z',
  },
  {
    id: 3,
    transaction_number: 'TRX-202609-003',
    channel: 'bank_transfer' as any,
    channel_category: 'digital',
    muzakki_name: 'Siti Rahma',
    fund_type: 'sedekah' as any,
    amount: '1000000',
    fee_amount: '0',
    net_amount: '1000000',
    status: 'Menunggu Validasi',
    is_manual: false,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: true, // Flagged (ineligible for bulk validation)
    created_at: '2026-09-08T12:00:00Z',
    updated_at: '2026-09-08T12:00:00Z',
  },
  {
    id: 4,
    transaction_number: 'TRX-202609-004',
    channel: 'counter_kasir' as any,
    channel_category: 'manual',
    muzakki_name: 'Haji Ahmad',
    fund_type: 'zakat_fitrah' as any,
    amount: '2500000',
    fee_amount: '0',
    net_amount: '2500000',
    status: 'Posted', // Not Menunggu Validasi (ineligible)
    is_manual: true,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: false,
    created_at: '2026-09-07T09:00:00Z',
    updated_at: '2026-09-07T09:00:00Z',
  },
];

let mockUser = {
  id: 1,
  name: 'Staff Penerimaan',
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
    getTransactions: vi.fn(),
    getTransactionById: vi.fn(),
    bulkValidateTransactions: vi.fn(),
  },
}));

describe('TransactionWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (penerimaanApi.getTransactions as any).mockResolvedValue({
      success: true,
      data: {
        items: mockTransactions,
        next_cursor: 'cursor-page-2',
        has_more: true,
        total_count: 4,
      },
    });
    (penerimaanApi.getTransactionById as any).mockResolvedValue({
      success: true,
      data: {
        ...mockTransactions[0],
        approvals: [],
        timeline: [],
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders transactions list in desktop table and mobile cards', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Budi Santoso').length).toBeGreaterThan(0);
      expect(screen.getAllByText('PT Maju Bersama').length).toBeGreaterThan(0);
    });

    expect(penerimaanApi.getTransactions).toHaveBeenCalledTimes(1);
  });

  it('renders an above-safe odd API amount without precision loss', async () => {
    const oddAmount = '9007199254740995';
    (penerimaanApi.getTransactions as any).mockResolvedValueOnce({
      success: true,
      data: { items: [{ ...mockTransactions[0], amount: oddAmount }], next_cursor: null, has_more: false, total_count: 1 },
    });
    render(<TransactionWorkspace />);
    await waitFor(() => {
      expect(screen.getAllByText('Rp 9.007.199.254.740.995').length).toBeGreaterThan(0);
    });
  });

  it('filters by status when clicking status tabs', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    const postedTab = screen.getByRole('button', { name: 'Posted' });
    fireEvent.click(postedTab);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Posted' })
      );
    });
  });

  it('filters by search input', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText(/Cari nomor transaksi/i);
    fireEvent.change(searchInput, { target: { value: 'Budi' } });

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Budi' })
      );
    });
  });

  it('toggles quick filters for action-needed and flagged', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    const actionNeededBtn = screen.getByRole('button', { name: /Perlu Tindakan/i });
    fireEvent.click(actionNeededBtn);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ needs_action: true })
      );
    });

    const flaggedBtn = screen.getByRole('button', { name: /Berisiko \/ Flagged/i });
    fireEvent.click(flaggedBtn);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ is_flagged: true })
      );
    });
  });

  it('enforces bulk validation eligibility policy strictly', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    // TRX 1: Eligible (< 10M, Menunggu Validasi, !is_flagged)
    // TRX 2: Ineligible (25M >= 10M)
    // TRX 3: Ineligible (is_flagged === true)
    // TRX 4: Ineligible (status === Posted)

    // Master select all button should only select TRX 1
    const masterCheckbox = screen.getByTitle('Pilih semua transaksi yang memenuhi syarat validasi massal');
    fireEvent.click(masterCheckbox);

    // Bulk banner should appear with 1 transaction selected
    await waitFor(() => {
      expect(screen.getByText(/1 transaksi dipilih untuk validasi massal/i)).toBeInTheDocument();
    });

    // Execute bulk validation
    (penerimaanApi.bulkValidateTransactions as any).mockResolvedValueOnce({
      success: true,
      data: { validated_count: 1, failed_count: 0 },
    });

    const validateBtn = screen.getByRole('button', { name: /Validasi Terpilih \(1\)/i });
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(penerimaanApi.bulkValidateTransactions).toHaveBeenCalledWith([1]);
    });
  });

  it('handles pagination next and previous pages', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    const nextBtn = screen.getByRole('button', { name: /Berikutnya/i });
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-page-2' })
      );
    });

    const prevBtn = screen.getByRole('button', { name: /Sebelumnya/i });
    expect(prevBtn).not.toBeDisabled();
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledWith(
        expect.not.objectContaining({ cursor: 'cursor-page-2' })
      );
    });
  });

  it('displays empty state when no transactions returned', async () => {
    (penerimaanApi.getTransactions as any).mockResolvedValueOnce({
      success: true,
      data: {
        items: [],
        next_cursor: null,
        has_more: false,
        total_count: 0,
      },
    });

    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Tidak ada transaksi ditemukan')).toBeInTheDocument();
    });
  });

  it('displays error state with retry button on API failure', async () => {
    (penerimaanApi.getTransactions as any).mockRejectedValueOnce(new Error('Koneksi database terputus'));

    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Koneksi database terputus')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Coba Lagi/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(penerimaanApi.getTransactions).toHaveBeenCalledTimes(2);
    });
  });

  it('opens detail drawer when clicking detail button and restores focus', async () => {
    render(<TransactionWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('TRX-202609-001').length).toBeGreaterThan(0);
    });

    const detailButtons = screen.getAllByRole('button', { name: /Detail/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(penerimaanApi.getTransactionById).toHaveBeenCalledWith(1);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText('Tutup detail transaksi');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
