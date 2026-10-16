import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MuzakkiWorkspace } from './MuzakkiWorkspace';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { Muzakki, MuzakkiDetail, DuplicateMuzakkiSuggestion } from '@/lib/api/types';

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Staff Penerimaan', role: 'penerimaan', division: 'Bidang Pengumpulan & ZIS', level: 'staff' },
    isAuthenticated: true,
  }),
}));

const mockMuzakkiList: Muzakki[] = [
  {
    id: 1,
    npwz: 'NPWZ-2026-0001',
    name: 'H. Bambang Sudirman',
    type: 'individu',
    identity_type: 'ktp',
    identity_number: '3201123456780001',
    phone: '081234567890',
    email: 'bambang@example.com',
    city: 'Kota Tangerang',
    total_donations_count: 5,
    total_donations_amount: '15000000',
    last_donation_date: '2026-09-08T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    npwz: 'NPWZ-2026-0002',
    name: 'PT Berkah Cahaya Utama',
    type: 'lembaga',
    identity_type: 'npwp',
    identity_number: '012345678901000',
    phone: '0215559999',
    email: 'corp@berkahcahaya.co.id',
    city: 'Kota Tangerang',
    total_donations_count: 12,
    total_donations_amount: '120000000',
    last_donation_date: '2026-09-05T14:30:00Z',
    created_at: '2025-12-15T00:00:00Z',
  },
  {
    id: 3,
    npwz: 'NPWZ-2026-0003',
    name: 'Hamba Allah',
    type: 'anonim',
    identity_type: 'ktp',
    identity_number: '3201******01',
    phone: '0819****321',
    email: 'h***h@secret.id',
    city: 'Kota Tangerang',
    total_donations_count: 2,
    total_donations_amount: '5000000',
    last_donation_date: '2026-09-07T08:00:00Z',
    created_at: '2026-02-01T00:00:00Z',
  },
];

const mockMuzakkiDetail: MuzakkiDetail = {
  ...mockMuzakkiList[0],
  preferred_channel: 'transfer_bank',
  donation_summary: {
    total_amount: '15000000',
    total_count: 5,
    avg_amount: '3000000',
    first_donation: '2026-01-05T00:00:00Z',
    last_donation: '2026-09-08T10:00:00Z',
    preferred_channel: 'transfer_bank',
  },
  recent_transactions: [
    {
      id: 101,
      transaction_number: 'TRX-202609-001',
      receipt_number: 'KWT-202609-001',
      channel: 'bank_transfer' as any,
      channel_category: 'bank_transfer' as any,
      muzakki_id: 1,
      muzakki_name: 'H. Bambang Sudirman',
      fund_type: 'zakat_maal' as any,
      amount: '5000000',
      status: 'Posted',
      is_manual: false,
      is_duplicate: false,
      is_incomplete: false,
      is_flagged: false,
      created_at: '2026-09-08T10:00:00Z',
    },
  ],
};

const mockDuplicates: DuplicateMuzakkiSuggestion[] = [
  {
    primary: mockMuzakkiList[0],
    duplicates: [
      {
        id: 99,
        npwz: null,
        name: 'Bambang Sudirman',
        type: 'individu',
        phone: '081234567890',
        email: 'bambang_s@gmail.com',
        city: 'Kota Tangerang',
        total_donations_count: 1,
        total_donations_amount: '1000000',
      },
    ],
    confidence: 90,
    match_reason: 'Nomor telepon identik: 081234567890',
  },
];

describe('MuzakkiWorkspace Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(penerimaanApi, 'getMuzakkiList').mockResolvedValue({
      success: true,
      data: {
        items: mockMuzakkiList,
        next_cursor: null,
        has_more: false,
        total_count: 3,
      },
    });
    vi.spyOn(penerimaanApi, 'getDuplicateMuzakkiSuggestions').mockResolvedValue({
      success: true,
      data: mockDuplicates,
    });
    vi.spyOn(penerimaanApi, 'getMuzakkiById').mockResolvedValue({
      success: true,
      data: mockMuzakkiDetail,
    });
    vi.spyOn(penerimaanApi, 'getAuditLogs').mockResolvedValue({
      success: true,
      data: {
        items: [],
        next_cursor: null,
        has_more: false,
      },
    });
    vi.spyOn(penerimaanApi, 'createMuzakki').mockResolvedValue({
      success: true,
      data: mockMuzakkiList[0],
    });
    vi.spyOn(penerimaanApi, 'mergeMuzakki').mockResolvedValue({
      success: true,
      data: { success: true, merged_id: 1 },
    });
  });

  it('renders directory heading, stats, duplicate badge, and muzakki records', async () => {
    render(<MuzakkiWorkspace />);

    expect(screen.getByText(/Direktori Muzakki & Donatur/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('H. Bambang Sudirman')[0]).toBeInTheDocument();
      expect(screen.getAllByText('PT Berkah Cahaya Utama')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Hamba Allah')[0]).toBeInTheDocument();
    });

    // Verify duplicate badge indicator
    const mergeBtn = screen.getByRole('button', { name: /Saran Penggabungan/i });
    expect(mergeBtn).toBeInTheDocument();
    expect(mergeBtn).toHaveTextContent('1');
  });

  it('protects anonymous donor privacy with masked PII indicators', async () => {
    render(<MuzakkiWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('Hamba Allah')[0]).toBeInTheDocument();
    });

    // Check masked phone rendering for anonymous
    expect(screen.getByText('0819****321')).toBeInTheDocument();
  });

  it('filters directory by search query and type tabs', async () => {
    render(<MuzakkiWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('H. Bambang Sudirman')[0]).toBeInTheDocument();
    });

    // Click Lembaga tab
    const lembagaTab = screen.getByRole('button', { name: 'Lembaga' });
    fireEvent.click(lembagaTab);

    await waitFor(() => {
      expect(penerimaanApi.getMuzakkiList).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'lembaga' })
      );
    });

    // Search input
    const searchInput = screen.getByPlaceholderText(/Cari nama, NPWZ, telepon/i);
    fireEvent.change(searchInput, { target: { value: 'Berkah' } });

    await waitFor(() => {
      expect(penerimaanApi.getMuzakkiList).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Berkah' })
      );
    });
  });

  it('opens detail drawer with contribution summary, history, and transaction links', async () => {
    render(<MuzakkiWorkspace />);

    await waitFor(() => {
      expect(screen.getAllByText('H. Bambang Sudirman')[0]).toBeInTheDocument();
    });

    // Click Detail button on first muzakki
    const detailButtons = screen.getAllByRole('button', { name: /Detail/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(penerimaanApi.getMuzakkiById).toHaveBeenCalledWith(1);
      expect(screen.getByText(/Ringkasan Kontribusi & Donasi/i)).toBeInTheDocument();
      expect(screen.getByText(/Frekuensi Donasi/i)).toBeInTheDocument();
      expect(screen.getByText(/Kanal Terfavorit/i)).toBeInTheDocument();
    });

    // Switch to Riwayat Donasi tab
    const historyTab = screen.getByRole('button', { name: /Riwayat Donasi/i });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText('TRX-202609-001')).toBeInTheDocument();
      expect(screen.getByText('KWT-202609-001')).toBeInTheDocument();
      expect(screen.getByText(/Buka Ruang Transaksi/i)).toBeInTheDocument();
    });
  });

  it('opens duplicate merge modal and handles merge confirmation', async () => {
    render(<MuzakkiWorkspace />);

    const mergeBtn = await screen.findByRole('button', { name: /Saran Penggabungan/i });
    fireEvent.click(mergeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Saran Penggabungan Profil Duplikat/i)).toBeInTheDocument();
      expect(screen.getByText(/Nomor telepon identik: 081234567890/i)).toBeInTheDocument();
      expect(screen.getByText(/Profil Utama \(Pertahankan\)/i)).toBeInTheDocument();
    });

    // Confirm merge
    const confirmMergeBtn = screen.getByRole('button', { name: /Konfirmasi & Gabungkan Profil/i });
    fireEvent.click(confirmMergeBtn);

    await waitFor(() => {
      expect(penerimaanApi.mergeMuzakki).toHaveBeenCalledWith(1, [99]);
      expect(screen.getByText(/Berhasil menggabungkan/i)).toBeInTheDocument();
    });
  });

  it('opens create modal and submits new muzakki', async () => {
    render(<MuzakkiWorkspace />);

    const addBtn = screen.getByRole('button', { name: /Tambah Muzakki/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Tambah Muzakki Baru/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nama Lengkap/i);
    fireEvent.change(nameInput, { target: { value: 'Dr. Farhan Kamil' } });

    const submitBtn = screen.getByRole('button', { name: /Daftarkan Muzakki/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(penerimaanApi.createMuzakki).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dr. Farhan Kamil', type: 'individu' })
      );
    });
  });
});
