import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanTransactionDetail } from '@/lib/api/types';

const mockFetchAuthenticatedBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({
  fetchAuthenticatedBlob: mockFetchAuthenticatedBlob,
}));

const mockDetail: PenerimaanTransactionDetail = {
  id: 1,
  transaction_number: 'TRX-202609-001',
  receipt_number: 'RCP-202609-001',
  channel: 'bank_transfer' as any,
  channel_category: 'digital',
  muzakki_name: 'Budi Santoso',
  muzakki_phone: '08123456789',
  muzakki_email: 'budi@example.com',
  fund_type: 'zakat_maal' as any,
  amount: '15000000',
  fee_amount: '0',
  net_amount: '15000000',
  status: 'Menunggu Approval',
  is_manual: false,
  is_duplicate: false,
  is_incomplete: false,
  is_flagged: true,
  risk_flags: ['amount_exceeds_threshold', 'unusual_hour'],
  evidence_url: 'https://storage.example.com/receipt-001.jpg',
  created_at: '2026-09-08T10:00:00Z',
  updated_at: '2026-09-08T10:00:00Z',
  approvals: [],
  timeline: [
    {
      status: 'Masuk',
      timestamp: '2026-09-08T10:00:00Z',
      actor_name: 'Gateway BSI',
      notes: 'Transaksi donasi berhasil dicatat.',
    },
    {
      status: 'Menunggu Approval',
      timestamp: '2026-09-08T10:05:00Z',
      actor_name: 'Staff Penerimaan',
      notes: 'Validasi berkas selesai, memerlukan persetujuan Kabag.',
    },
  ],
};

let mockUser = {
  id: 2,
  name: 'Kepala Bagian Penerimaan',
  role: 'penerimaan',
  division: 'Divisi Penerimaan',
  level: 'leader',
};

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
  }),
}));

vi.mock('@/lib/api/penerimaan', () => ({
  penerimaanApi: {
    getTransactionById: vi.fn(),
    approveTransaction: vi.fn(),
    rejectTransaction: vi.fn(),
    reverseTransaction: vi.fn(),
    downloadBszPdf: vi.fn(),
  },
}));

describe('TransactionDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (penerimaanApi.getTransactionById as any).mockResolvedValue({
      success: true,
      data: mockDetail,
    });
  });

  it('renders full transaction details, donor info, evidence, and timeline', async () => {
    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('TRX-202609-001')).toBeInTheDocument();
      expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
      expect(screen.getByText('08123456789')).toBeInTheDocument();
      expect(screen.getByText('budi@example.com')).toBeInTheDocument();
      expect(screen.getByText('Bukti Transfer & Verifikasi')).toBeInTheDocument();
      expect(screen.getByText(/Lihat Bukti/i)).toBeInTheDocument();
      expect(screen.getByText('Linimasa Siklus Transaksi')).toBeInTheDocument();
      expect(screen.getByText(/Gateway BSI/i)).toBeInTheDocument();
    });
  });

  it('shows approval action buttons for Leader role when status is Menunggu Approval', async () => {
    mockUser.level = 'leader';

    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Setujui Transaksi/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tolak Transaksi/i })).toBeInTheDocument();
    });

    (penerimaanApi.approveTransaction as any).mockResolvedValueOnce({
      success: true,
      data: { ...mockDetail, status: 'Menunggu Rekonsiliasi' },
    });

    const approveBtn = screen.getByRole('button', { name: /Setujui Transaksi/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(penerimaanApi.approveTransaction).toHaveBeenCalledWith(1);
    });
  });

  it('allows Leader to reverse a Posted transaction with confirmation prompt', async () => {
    mockUser.level = 'leader';
    (penerimaanApi.getTransactionById as any).mockResolvedValueOnce({
      success: true,
      data: {
        ...mockDetail,
        status: 'Posted',
      },
    });

    vi.spyOn(window, 'prompt').mockReturnValue('Salah input kanal mutasi');
    (penerimaanApi.reverseTransaction as any).mockResolvedValueOnce({
      success: true,
      data: { ...mockDetail, status: 'Dibatalkan' },
    });

    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Koreksi \/ Reversal/i })).toBeInTheDocument();
    });

    const reverseBtn = screen.getByRole('button', { name: /Koreksi \/ Reversal/i });
    fireEvent.click(reverseBtn);

    await waitFor(() => {
      expect(penerimaanApi.reverseTransaction).toHaveBeenCalledWith(1, { reason: 'Salah input kanal mutasi' });
    });
  });

  it('closes when pressing Escape key', async () => {
    const handleClose = vi.fn();
    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={handleClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('TRX-202609-001')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('normalizes mixed-case leader claims before showing approval actions', async () => {
    mockUser.role = 'PENERIMAAN';
    mockUser.level = ' LEADER ';

    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Setujui Transaksi/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tolak Transaksi/i })).toBeInTheDocument();
    });
  });

  it('opens a protected local evidence placeholder during the click gesture', async () => {
    let resolveBlob: (value: Blob) => void = () => {};
    mockFetchAuthenticatedBlob.mockImplementationOnce(() => new Promise<Blob>((resolve) => {
      resolveBlob = resolve;
    }));
    (penerimaanApi.getTransactionById as any).mockResolvedValueOnce({
      success: true,
      data: { ...mockDetail, evidence_url: '/uploads/protected-evidence.png' },
    });
    const openedWindow = { location: { href: '' } };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(openedWindow as any);

    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const evidenceLink = await screen.findByRole('link', { name: /Lihat Bukti/i });
    fireEvent.click(evidenceLink);
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank', 'noopener,noreferrer');

    resolveBlob(new Blob(['evidence'], { type: 'image/png' }));
    await waitFor(() => expect(mockFetchAuthenticatedBlob).toHaveBeenCalledWith('/uploads/protected-evidence.png'));
    openSpy.mockRestore();
  });

  it('triggers downloadBszPdf when clicking Unduh BSZ (PDF)', async () => {
    (penerimaanApi.downloadBszPdf as any).mockResolvedValueOnce(
      new Blob(['%PDF-1.4 sample'], { type: 'application/pdf' })
    );

    render(
      <TransactionDetailDrawer
        transactionId={1}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const downloadBtn = await screen.findByRole('button', { name: /Unduh BSZ \(PDF\)/i });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(penerimaanApi.downloadBszPdf).toHaveBeenCalledWith(1);
    });
  });
});
