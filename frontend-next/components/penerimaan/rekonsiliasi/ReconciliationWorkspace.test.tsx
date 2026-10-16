import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconciliationWorkspace } from './ReconciliationWorkspace';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type {
  ReconciliationBatch,
  ReconciliationBatchDetail,
  ReconciliationStatementLine,
  PenerimaanTransaction,
} from '@/lib/api/types';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth,
}));

const mockBatches: ReconciliationBatch[] = [
  {
    id: 1,
    batch_number: 'REC-20260901-1001',
    channel: 'bank_transfer',
    account_name: 'Bank Syariah Indonesia (BSI)',
    account_number: '7001122334',
    period_start: '2026-09-01T00:00:00Z',
    period_end: '2026-09-30T23:59:59Z',
    total_expected_count: 5,
    total_expected_amount: '15000000',
    total_matched_count: 3,
    total_matched_amount: '10000000',
    discrepancy_amount: '5000000',
    status: 'in_progress',
    notes: 'Batch BSI September 2026',
    created_at: '2026-09-01T08:00:00Z',
    updated_at: '2026-09-05T10:00:00Z',
  },
  {
    id: 2,
    batch_number: 'REC-20260902-1002',
    channel: 'qris',
    account_name: 'QRIS BAZNAS Kota Tangerang',
    account_number: '936001234567',
    period_start: '2026-09-01T00:00:00Z',
    period_end: '2026-09-30T23:59:59Z',
    total_expected_count: 2,
    total_expected_amount: '500000',
    total_matched_count: 2,
    total_matched_amount: '500000',
    discrepancy_amount: '0',
    status: 'matched',
    notes: 'Batch QRIS September 2026',
    created_at: '2026-09-02T08:00:00Z',
    updated_at: '2026-09-06T10:00:00Z',
  },
];

const mockBatchDetail: ReconciliationBatchDetail = {
  ...mockBatches[0],
  statement_lines: [
    {
      id: 10,
      batch_id: 1,
      line_number: 1,
      transaction_date: '2026-09-03T10:00:00Z',
      reference_number: 'REF-BSI-101',
      description: 'Setoran Zakat Maal BSI',
      amount: '5000000',
      status: 'matched',
      matched_transaction_id: 101,
    },
    {
      id: 11,
      batch_id: 1,
      line_number: 2,
      transaction_date: '2026-09-04T11:00:00Z',
      reference_number: 'REF-BSI-102',
      description: 'Setoran Infak Digital',
      amount: '2500000',
      status: 'unmatched',
      matched_transaction_id: null,
    },
  ],
  unmatched_transactions: [
    {
      id: 201,
      transaction_number: 'TRX-202609-0201',
      receipt_number: 'BSZ-2026-0201',
      channel: 'bank_transfer',
      channel_category: 'digital',
      muzakki_name: 'Hj. Aminah Zahra',
      fund_type: 'infak',
      amount: '2500000',
      net_amount: '2500000',
      status: 'Menunggu Rekonsiliasi',
      is_manual: false,
      is_duplicate: false,
      is_incomplete: false,
      is_flagged: false,
      created_at: '2026-09-04T10:30:00Z',
    },
  ],
};

describe('ReconciliationWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuth.mockReturnValue({
      user: { id: 1, name: 'Kepala Bagian Penerimaan', role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'leader' },
      isAuthenticated: true,
    });

    vi.spyOn(penerimaanApi, 'getReconciliationBatches').mockResolvedValue({
      success: true,
      data: {
        items: mockBatches,
        next_cursor: null,
        has_more: false,
        total_count: 2,
      },
    });

    vi.spyOn(penerimaanApi, 'getReconciliationBatchById').mockResolvedValue({
      success: true,
      data: mockBatchDetail,
    });
  });

  it('renders batches list, KPIs, and channel filters', async () => {
    render(<ReconciliationWorkspace />);

    expect(screen.getByText('Rekonsiliasi & Settlement Bank')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
      expect(screen.getByText('REC-20260902-1002')).toBeInTheDocument();
      expect(screen.getByText('Bank Syariah Indonesia (BSI) (7001122334)')).toBeInTheDocument();
      expect(penerimaanApi.getReconciliationBatches).toHaveBeenCalled();
    });
  });

  it('selects a batch and displays statement lines and candidate transactions', async () => {
    render(<ReconciliationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
    });

    // Click on the first batch card
    fireEvent.click(screen.getByText('REC-20260901-1001'));

    await waitFor(() => {
      expect(penerimaanApi.getReconciliationBatchById).toHaveBeenCalledWith(1);
      expect(screen.getByText('Setoran Zakat Maal BSI')).toBeInTheDocument();
      expect(screen.getByText('REF-BSI-101')).toBeInTheDocument();
      expect(screen.getByText('REF-BSI-102')).toBeInTheDocument();
    });
  });

  it('triggers auto-match on selected batch', async () => {
    const autoMatchSpy = vi.spyOn(penerimaanApi, 'autoMatchBatch').mockResolvedValue({
      success: true,
      data: {
        matched_count: 2,
        matched_amount: '7500000',
        discrepancy_amount: '7500000',
        new_matches: 1,
        status: 'in_progress',
      },
    });

    render(<ReconciliationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('REC-20260901-1001'));

    await waitFor(() => {
      expect(screen.getByText('Auto Match')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Auto Match'));

    await waitFor(() => {
      expect(autoMatchSpy).toHaveBeenCalledWith(1);
      expect(screen.getByText(/Auto-match selesai: 1 kecocokan baru ditemukan/)).toBeInTheDocument();
    });
  });

  it('opens manual match modal and matches statement line with candidate transaction', async () => {
    const matchSpy = vi.spyOn(penerimaanApi, 'matchTransaction').mockResolvedValue({
      success: true,
      data: { success: true, match_id: 99 },
    });

    render(<ReconciliationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('REC-20260901-1001'));

    await waitFor(() => {
      expect(screen.getByText('REF-BSI-102')).toBeInTheDocument();
    });

    // Click 'Cocokkan' button for line 2
    const matchButtons = screen.getAllByText('Cocokkan');
    fireEvent.click(matchButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Pencocokan Manual Amil')).toBeInTheDocument();
    });

    // Select candidate transaction and submit
    const selectEl = screen.getByLabelText(/Pilih Transaksi Penerimaan Kandidat/i);
    fireEvent.change(selectEl, { target: { value: '201' } });

    const submitBtn = screen.getByText('Tautkan Transaksi');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(matchSpy).toHaveBeenCalledWith(1, {
        statement_line_id: 11,
        transaction_id: '201',
      });
      expect(screen.getByText('Transaksi berhasil dicocokkan secara manual.')).toBeInTheDocument();
    });
  });

  it('allows leader to close batch with confirmation', async () => {
    const closeSpy = vi.spyOn(penerimaanApi, 'closeReconciliationBatch').mockResolvedValue({
      success: true,
      data: {
        ...mockBatchDetail,
        status: 'closed',
        closed_at: '2026-09-09T12:00:00Z',
      },
    });

    render(<ReconciliationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('REC-20260901-1001'));

    await waitFor(() => {
      expect(screen.getByText('Tutup Batch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tutup Batch'));

    await waitFor(() => {
      expect(screen.getByText('Konfirmasi Penutupan Batch')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByText('Tutup Batch Permanen');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledWith(1, {});
      expect(screen.getByText('Batch rekonsiliasi telah berhasil ditutup dan difinalisasi.')).toBeInTheDocument();
    });
  });

  it('allows an administrator with padded mixed-case claims to close a batch', async () => {
    useAuth.mockReturnValue({
      user: { id: 1, name: 'Administrator', role: ' penyaluran ', division: 'Direksi & Sekretariat', level: ' ADMIN ' },
      isAuthenticated: true,
    });

    render(<ReconciliationWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('REC-20260901-1001')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('REC-20260901-1001'));

    await waitFor(() => {
      expect(screen.getByText('Tutup Batch')).toBeInTheDocument();
    });
  });
});
