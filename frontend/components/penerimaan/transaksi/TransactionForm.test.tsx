import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionForm } from './TransactionForm';
import { penerimaanApi } from '@/lib/api/penerimaan';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/lib/api/penerimaan', () => ({
  penerimaanApi: {
    uploadEvidence: vi.fn(),
    createManualTransaction: vi.fn(),
  },
}));

describe('TransactionForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Step 1 (Sumber & Kanal) by default', () => {
    render(<TransactionForm />);

    expect(screen.getByText('1. Pilih Sumber & Kanal Penerimaan')).toBeInTheDocument();
    expect(screen.getByText('Counter Kasir')).toBeInTheDocument();
    expect(screen.getByText('Jemput Zakat')).toBeInTheDocument();
    expect(screen.getByText('Transfer Bank Manual')).toBeInTheDocument();
  });

  it('navigates from Step 1 to Step 2 and requires Muzakki Name', async () => {
    render(<TransactionForm />);

    // Click "Lanjutkan" to Step 2
    const nextBtn = screen.getByRole('button', { name: /lanjutkan/i });
    fireEvent.click(nextBtn);

    // Step 2 rendered
    expect(screen.getByText('2. Identitas Donatur / Muzakki')).toBeInTheDocument();

    // Try to advance without filling name -> error shown
    fireEvent.click(nextBtn);
    expect(screen.getByText(/nama lengkap muzakki atau lembaga wajib diisi/i)).toBeInTheDocument();

    // Fill Muzakki Name
    const nameInput = screen.getByLabelText(/nama lengkap muzakki/i);
    fireEvent.change(nameInput, { target: { value: 'Budi Santoso' } });

    // Advance to Step 3
    fireEvent.click(nextBtn);
    expect(screen.getByText('3. Nilai & Alokasi Dana ZIS')).toBeInTheDocument();
  });

  it('formats Rupiah amount, displays spelled-out text, and shows approval threshold badge for high amounts', async () => {
    render(<TransactionForm />);

    const nextBtn = screen.getByRole('button', { name: /lanjutkan/i });
    fireEvent.click(nextBtn); // To Step 2

    const nameInput = screen.getByLabelText(/nama lengkap muzakki/i);
    fireEvent.change(nameInput, { target: { value: 'Budi Santoso' } });
    fireEvent.click(nextBtn); // To Step 3

    const nominalInput = screen.getByLabelText(/nominal donasi/i);

    // Fill Rp 5.000.000
    fireEvent.change(nominalInput, { target: { value: '5000000' } });
    expect(nominalInput).toHaveValue('5.000.000');
    expect(screen.getByText(/terbilang: rp 5\.000\.000/i)).toBeInTheDocument();

    // Fill Rp 15.000.000 (> 10M threshold)
    fireEvent.change(nominalInput, { target: { value: '15000000' } });
    expect(nominalInput).toHaveValue('15.000.000');
    expect(screen.getByText(/transaksi nominal di atas rp 10\.000\.000 otomatis dialihkan ke antrean persetujuan/i)).toBeInTheDocument();
  });

  it('restores draft from localStorage when prompted', async () => {
    localStorage.setItem(
      'baznas_penerimaan_manual_intake_draft',
      JSON.stringify({
        channel: 'jemput_zakat',
        bank_name: 'Kas Kantor BAZNAS',
        bank_account_number: '',
        transaction_date: '2026-09-08',
        muzakki_type: 'individu',
        muzakki_name: 'Draf H. Dahlan',
        muzakki_phone: '08123456789',
        muzakki_email: '',
        muzakki_identifier: '',
        muzakki_address: '',
        fund_type: 'zakat_maal',
        program_name: 'Tangerang Peduli',
        sub_program: '',
        amount: '3.000.000',
        evidence_url: '',
        evidence_name: '',
        provider_ref: '',
        notes: '',
      })
    );

    render(<TransactionForm />);

    expect(screen.getByText(/ada draf formulir yang belum disimpan sebelumnya/i)).toBeInTheDocument();

    const restoreBtn = screen.getByRole('button', { name: /lanjutkan draf/i });
    fireEvent.click(restoreBtn);

    // Go to step 2 to confirm data restored
    const nextBtn = screen.getByRole('button', { name: /lanjutkan/i });
    fireEvent.click(nextBtn);

    const nameInput = screen.getByLabelText(/nama lengkap muzakki/i);
    expect(nameInput).toHaveValue('Draf H. Dahlan');
  });

  it('submits manual transaction and displays success screen with transaction and BSZ receipt number', async () => {
    (penerimaanApi.createManualTransaction as any).mockResolvedValue({
      success: true,
      data: {
        id: 99,
        transaction_number: 'TRX-202609-0099',
        receipt_number: 'BSZ-2026-0099',
        channel: 'counter_kasir',
        muzakki_name: 'Budi Santoso',
        amount: 2500000,
        status: 'Menunggu Validasi',
      },
    });

    render(<TransactionForm />);

    const nextBtn = screen.getByRole('button', { name: /lanjutkan/i });

    // Step 1 -> Step 2
    fireEvent.click(nextBtn);

    // Step 2
    const nameInput = screen.getByLabelText(/nama lengkap muzakki/i);
    fireEvent.change(nameInput, { target: { value: 'Budi Santoso' } });
    fireEvent.click(nextBtn);

    // Step 3
    const nominalInput = screen.getByLabelText(/nominal donasi/i);
    fireEvent.change(nominalInput, { target: { value: '2500000' } });
    fireEvent.click(nextBtn);

    // Step 4: Summary & Submit
    expect(screen.getByText('4. Bukti Setor & Konfirmasi Final')).toBeInTheDocument();
    expect(screen.getByText('Rangkuman Transaksi')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /simpan transaksi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(penerimaanApi.createManualTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'counter_kasir',
          muzakki_name: 'Budi Santoso',
          amount: 2500000,
        })
      );
    });

    // Success screen verified
    await waitFor(() => {
      expect(screen.getByText('Transaksi Berhasil Dicatat!')).toBeInTheDocument();
      expect(screen.getByText('TRX-202609-0099')).toBeInTheDocument();
      expect(screen.getByText('BSZ-2026-0099')).toBeInTheDocument();
    });
  });
});
