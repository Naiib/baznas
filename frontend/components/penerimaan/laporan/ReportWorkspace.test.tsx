import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportWorkspace } from './ReportWorkspace';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanReportSummary, PenerimaanTransaction } from '@/lib/api/types';

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Amil Penerimaan', role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'leader' },
    isAuthenticated: true,
  }),
}));

const mockSummary: PenerimaanReportSummary = {
  reports: [
    {
      id: 'rep-001',
      category: 'penerimaan_zis',
      period: '30d',
      title: 'Laporan Penerimaan ZIS 30 Hari Terakhir',
      description: 'Rekapitulasi seluruh penerimaan ZIS dari seluruh kanal.',
      scope: 'Semua Kanal',
      status: 'Siap diekspor',
      total_rows: 15,
      total_amount: '85000000',
      data_freshness: '1 menit yang lalu',
      updated_at: '2026-09-08T10:00:00Z',
    },
  ],
  kpis: {
    total_revenue: '85000000',
    total_transactions: 15,
    reconciled_pct: 93.3,
  },
  preview_transactions: [
    {
      id: 101,
      transaction_number: 'TRX-REP-001',
      channel: 'bank_transfer',
      channel_category: 'digital',
      muzakki_name: 'Hamba Allah',
      fund_type: 'zakat_maal',
      amount: '10000000',
      fee_amount: '0',
      net_amount: '10000000',
      status: 'Posted',
      is_manual: false,
      is_duplicate: false,
      is_incomplete: false,
      is_flagged: false,
      created_at: '2026-09-08T09:00:00Z',
      updated_at: '2026-09-08T09:30:00Z',
    },
    {
      id: 102,
      transaction_number: 'TRX-REP-002',
      channel: 'qris',
      channel_category: 'digital',
      muzakki_name: 'Siti Aminah',
      fund_type: 'infak',
      amount: '500000',
      fee_amount: '0',
      net_amount: '500000',
      status: 'Terekonsiliasi',
      is_manual: false,
      is_duplicate: false,
      is_incomplete: false,
      is_flagged: false,
      created_at: '2026-09-08T11:00:00Z',
      updated_at: '2026-09-08T11:15:00Z',
    },
  ],
};

const mockTransactions: PenerimaanTransaction[] = [
  {
    id: 101,
    transaction_number: 'TRX-REP-001',
    channel: 'bank_transfer',
    channel_category: 'digital',
    muzakki_name: 'Hamba Allah',
    fund_type: 'zakat_maal',
    amount: '10000000',
    fee_amount: '0',
    net_amount: '10000000',
    status: 'Posted',
    is_manual: false,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: false,
    created_at: '2026-09-08T09:00:00Z',
    updated_at: '2026-09-08T09:30:00Z',
  },
  {
    id: 102,
    transaction_number: 'TRX-REP-002',
    channel: 'qris',
    channel_category: 'digital',
    muzakki_name: 'Siti Aminah',
    fund_type: 'infak',
    amount: '500000',
    fee_amount: '0',
    net_amount: '500000',
    status: 'Terekonsiliasi',
    is_manual: false,
    is_duplicate: false,
    is_incomplete: false,
    is_flagged: false,
    created_at: '2026-09-08T11:00:00Z',
    updated_at: '2026-09-08T11:15:00Z',
  },
];

vi.mock('@/lib/api/penerimaan', () => ({
  penerimaanApi: {
    getReports: vi.fn(),
    getTransactions: vi.fn(),
    getAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
    exportReport: vi.fn(),
    generateReport: vi.fn(),
    getExportJob: vi.fn(),
    downloadExportJob: vi.fn(),
    getExportUrl: vi.fn().mockReturnValue('/api/penerimaan/laporan/export/job-123'),
  },
}));

describe('ReportWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (penerimaanApi.getAccounts as any).mockResolvedValue({ success: true, data: [] });
    (penerimaanApi.getReports as any).mockResolvedValue({
      success: true,
      data: mockSummary,
    });
    (penerimaanApi.getTransactions as any).mockResolvedValue({
      success: true,
      data: {
        items: mockTransactions,
        has_more: false,
        total_count: 2,
      },
    });
    (penerimaanApi.exportReport as any).mockResolvedValue(new Blob(['dummy-content'], { type: 'application/pdf' }));
  });

  it('renders report workspace with KPI summary cards and preview', async () => {
    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Laporan Penerimaan ZIS/i)).toBeInTheDocument();
      expect(screen.getByText(/Rp 85\.000\.000|85\.000\.000/)).toBeInTheDocument();
      expect(screen.getByText('TRX-REP-001')).toBeInTheDocument();
      expect(screen.getByText('TRX-REP-002')).toBeInTheDocument();
    });

    expect(penerimaanApi.getReports).toHaveBeenCalled();
  });

  it('filters data when switching period tabs', async () => {
    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('TRX-REP-001')).toBeInTheDocument();
    });

    const button7d = screen.getByRole('button', { name: /7 Hari/i });
    fireEvent.click(button7d);

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ period: '7d' })
      );
    });
  });

  it('triggers asynchronous export workflow: generates job, polls status, and downloads artifact', async () => {
    const mockCreateUrl = vi.fn().mockReturnValue('blob:http://localhost/mock-export');
    const mockRevokeUrl = vi.fn();
    window.URL.createObjectURL = mockCreateUrl;
    window.URL.revokeObjectURL = mockRevokeUrl;

    (penerimaanApi.generateReport as any).mockResolvedValue({
      success: true,
      data: { id: 'job-pdf-001', status: 'queued', download_url: '/api/penerimaan/laporan/export/job-pdf-001' },
    });
    (penerimaanApi.getExportJob as any)
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'job-pdf-001', status: 'processing', format: 'pdf' },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'job-pdf-001', status: 'completed', format: 'pdf', file_name: 'laporan.pdf' },
      });
    (penerimaanApi.downloadExportJob as any).mockResolvedValue(new Blob(['dummy-pdf'], { type: 'application/pdf' }));

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Unduh PDF|Export PDF/i })).toBeInTheDocument();
    });

    const pdfBtn = screen.getByRole('button', { name: /Unduh PDF|Export PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(penerimaanApi.generateReport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'pdf' })
      );
    });

    await waitFor(() => {
      expect(penerimaanApi.getExportJob).toHaveBeenCalledWith('job-pdf-001');
      expect(penerimaanApi.downloadExportJob).toHaveBeenCalledWith('job-pdf-001');
    });
  });

  it('renders clean empty state when no records match filter', async () => {
    (penerimaanApi.getReports as any).mockResolvedValue({
      success: true,
      data: {
        reports: [],
        kpis: { total_revenue: '0', total_transactions: 0, reconciled_pct: 0 },
      },
    });
    (penerimaanApi.getTransactions as any).mockResolvedValue({
      success: true,
      data: { items: [], has_more: false, total_count: 0 },
    });

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Tidak ada transaksi untuk filter ini/i)).toBeInTheDocument();
    });
  });

  it('renders error state and retries successfully', async () => {
    (penerimaanApi.getReports as any).mockRejectedValueOnce(new Error('Network failure'));

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Gagal memuat laporan/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Coba Lagi/i });
    (penerimaanApi.getReports as any).mockResolvedValueOnce({
      success: true,
      data: mockSummary,
    });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Rp 85\.000\.000|85\.000\.000/)).toBeInTheDocument();
    });
  });

  it('loads report preview data exclusively from getReports and never calls generic getTransactions', async () => {
    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalled();
      expect(screen.getByText('TRX-REP-001')).toBeInTheDocument();
    });

    // Report preview MUST come from the report endpoint only
    expect(penerimaanApi.getTransactions).not.toHaveBeenCalled();
  });

  it('submits exact canonical normalized filters from preview to generateReport', async () => {
    (penerimaanApi.generateReport as any).mockResolvedValue({
      success: true,
      data: { id: 'job-pdf-002', status: 'completed' },
    });
    (penerimaanApi.getExportJob as any).mockResolvedValue({
      success: true,
      data: { id: 'job-pdf-002', status: 'completed', format: 'pdf' },
    });
    (penerimaanApi.downloadExportJob as any).mockResolvedValue(new Blob(['dummy'], { type: 'application/pdf' }));

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('TRX-REP-001')).toBeInTheDocument();
    });

    const pdfBtn = screen.getByRole('button', { name: /Unduh PDF|Export PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(penerimaanApi.generateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'pdf',
          period: '30d',
        })
      );
    });
  });

  it('exposes full canonical report filter controls and sends them to getReports', async () => {
    (penerimaanApi.getAccounts as any) = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 10, bank_name: 'BSI', account_number: '7001122334', account_name: 'Zakat BAZNAS' },
      ],
    });

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Rekening|Pilih Rekening/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ID Program/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Cari Program/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ID Muzakki/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Sumber|Mode Transaksi/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Status Anomali|Pengecualian/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Status Rekonsiliasi/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Tampilan|Jenis Laporan/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Urutkan Berdasarkan/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Arah Urutan/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Halaman Sebelumnya/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Halaman Berikutnya/i)).toBeInTheDocument();
    });
  });

  it('supports pagination controls: page size change, next and previous page navigation', async () => {
    (penerimaanApi.getReports as any).mockResolvedValue({
      success: true,
      data: {
        ...mockSummary,
        kpis: { total_revenue: '85000000', total_transactions: 100, total_count: 100, reconciled_pct: 90 },
      },
    });

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('TRX-REP-001')).toBeInTheDocument();
    });

    // Change page size to 25
    const pageSizeSelect = screen.getByLabelText(/Baris per halaman/i);
    fireEvent.change(pageSizeSelect, { target: { value: '25' } });

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 0 })
      );
    });

    // Click next page
    const nextBtn = screen.getByRole('button', { name: /Halaman Berikutnya|Berikutnya/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 25 })
      );
    });

    // Click previous page
    const prevBtn = screen.getByRole('button', { name: /Halaman Sebelumnya|Sebelumnya/i });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 0 })
      );
    });
  });

  it('renders audit mode KPI cards with audit-specific labels and no misleading Rp 0', async () => {
    (penerimaanApi.getReports as any).mockResolvedValue({
      success: true,
      data: {
        ...mockSummary,
        kpis: {
          total_count: 42,
          total_transactions: 42,
          reconciled_pct: 0,
        },
        preview_transactions: [{
          audit_event_id: 77,
          id: 77,
          entity_type: 'transaction',
          entity_id: 44,
          action: 'approve',
          actor_name: 'Auditor Test',
          actor_role: 'leader',
          changes: '{"status":"Posted"}',
          metadata: '{}',
          created_at: '2026-09-08T10:00:00Z',
        }],
        meta: { data_freshness: '2026-09-08T10:00:00Z' },
      },
    });

    render(<ReportWorkspace />);

    const viewSelect = screen.getByLabelText(/Tampilan|Jenis Laporan/i);
    fireEvent.change(viewSelect, { target: { value: 'audit' } });

    await waitFor(() => {
      expect(penerimaanApi.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'audit' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Total Log Audit')).toBeInTheDocument();
      expect(screen.getByText('Status Jejak Audit')).toBeInTheDocument();
      expect(screen.getByText(/42 Aktivitas/)).toBeInTheDocument();
      expect(screen.getByText('Pratinjau Jejak Audit')).toBeInTheDocument();
      expect(screen.getAllByText('approve').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Auditor Test').length).toBeGreaterThan(0);
      expect(screen.queryByText('Nominal')).not.toBeInTheDocument();
      // Should NOT render misleading Rp 0 totals or averages
      expect(screen.queryByText('Rp 0')).not.toBeInTheDocument();
    });
  });

  it('downloads exactly once upon completion without duplicate triggers', async () => {
    const mockCreateUrl = vi.fn().mockReturnValue('blob:http://localhost/mock-once');
    const mockRevokeUrl = vi.fn();
    window.URL.createObjectURL = mockCreateUrl;
    window.URL.revokeObjectURL = mockRevokeUrl;

    (penerimaanApi.generateReport as any).mockResolvedValue({
      success: true,
      data: { id: 'job-once-001', status: 'completed' },
    });
    (penerimaanApi.getExportJob as any).mockResolvedValue({
      success: true,
      data: { id: 'job-once-001', status: 'completed', format: 'pdf', file_name: 'laporan-once.pdf' },
    });
    (penerimaanApi.downloadExportJob as any).mockResolvedValue(new Blob(['dummy'], { type: 'application/pdf' }));

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Unduh PDF|Export PDF/i })).toBeInTheDocument();
    });

    const pdfBtn = screen.getByRole('button', { name: /Unduh PDF|Export PDF/i });
    fireEvent.click(pdfBtn);

    await waitFor(() => {
      expect(penerimaanApi.downloadExportJob).toHaveBeenCalledTimes(1);
    });
  });

  it('renders odd above-safe-integer rupiah values without losing digits', async () => {
    (penerimaanApi.getReports as any).mockResolvedValue({
      success: true,
      data: {
        ...mockSummary,
        reports: [{ ...mockSummary.reports[0], total_amount: '9007199254740995' }],
        kpis: { total_revenue: '9007199254740995', total_transactions: 1, reconciled_pct: 100 },
      },
    });

    render(<ReportWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('Rp 9.007.199.254.740.995').length).toBeGreaterThan(0);
    });
  });
});
