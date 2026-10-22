import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TransactionJournal } from './TransactionJournal';

const { getPenyaluranTransactions } = vi.hoisted(() => ({ getPenyaluranTransactions: vi.fn() }));

vi.mock('@/lib/api/client', () => ({ api: { getPenyaluranTransactions } }));

const transactions = [
  { id: 1, mustahik_id: 11, transaction_number: 'TRX-202609-001', ppd_number: 'PPD-001', amount: 2500000, recipient_name: 'Siti Aminah', program: 'Tangerang Cerdas', asnaf: 'Miskin', kecamatan: 'Karawaci', payment_type: 'Transfer', disbursement_date: '2026-09-05', status: 'Penyaluran Selesai' },
  { id: 2, mustahik_id: 12, transaction_number: 'TRX-202609-002', ppd_number: 'PPD-002', amount: 1500000, recipient_name: 'Budi Santoso', program: 'Tangerang Sehat', asnaf: 'Fakir', kecamatan: 'Ciledug', payment_type: 'Tunai', disbursement_date: '2026-09-04', status: 'Pengajuan Dana (PPD)' },
];

describe('TransactionJournal', () => {
  beforeEach(() => {
    getPenyaluranTransactions.mockReset();
    getPenyaluranTransactions.mockResolvedValue({ success: true, data: transactions });
  });

  it('renders transaction rows and deep-links to the recipient detail', async () => {
    render(<TransactionJournal />);

    expect(await screen.findByText('Siti Aminah')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /lihat Siti Aminah/i })).toHaveAttribute('href', '/penyaluran/mustahik?id=11');
  });

  it('filters loaded records with the search field', async () => {
    render(<TransactionJournal />);
    await screen.findByText('Siti Aminah');

    fireEvent.change(screen.getByLabelText(/cari transaksi/i), { target: { value: 'Budi' } });

    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.queryByText('Siti Aminah')).not.toBeInTheDocument();
  });
});
