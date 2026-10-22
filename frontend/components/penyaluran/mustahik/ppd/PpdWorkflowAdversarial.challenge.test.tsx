import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type { PpdDraft, RabLine } from '@/lib/api/penyaluran-p0-types';
import { RabLineEditor } from './RabLineEditor';
import { PpdForm } from './PpdForm';
import { FinanceApprovalPanel } from './FinanceApprovalPanel';
import { PaymentEvidencePanel } from './PaymentEvidencePanel';
import { RecipientConfirmationPanel } from './RecipientConfirmationPanel';
import { SystemReceiptPanel } from './SystemReceiptPanel';

vi.mock('@/lib/api/client', () => ({
  api: {
    getPpd: vi.fn(),
    createPpdDraft: vi.fn(),
    savePpdDraft: vi.fn(),
    submitPpd: vi.fn(),
    financeCheckPpd: vi.fn(),
    financeApprovePpd: vi.fn(),
    recordPaymentProof: vi.fn(),
    verifyPayment: vi.fn(),
    recordRecipientConfirmation: vi.fn(),
    completePpd: vi.fn(),
    downloadReceipt: vi.fn(),
  },
}));

function createDraft(overrides: Partial<PpdDraft> = {}): PpdDraft {
  return {
    id: 42,
    mustahik_id: 101,
    status: 'draft',
    form_number: 'F-PKP/03',
    ppd_number: 'PPD/2026/09/0042',
    transaction_number: 'TRX-0042',
    purpose: 'Bantuan modal usaha mustahik',
    fund_source: 'Zakat',
    fund_source_confirmed: true,
    payment_type: 'Pembayaran',
    payment_type_confirmed: true,
    payment_type_other: null,
    bank_name: 'Bank BSI',
    bank_account_name: 'Mustahik Fulan',
    bank_account_number: '1234567890',
    amount: 2000000,
    total_rab: 2000000,
    created_by_id: 10,
    rab_lines: [
      {
        line_no: 1,
        register_number: 'RAB-01',
        description: 'Baris 1',
        jumlah: 1,
        harga_satuan: 2000000,
        total: 2000000,
        amount: 2000000,
      },
    ],
    ...overrides,
  };
}

describe('EMPIRICAL ADVERSARIAL CHALLENGE — Task 18 Workflow & Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Challenge 1: RAB Rows Boundary & Mutability Constraints
  // -------------------------------------------------------------------------
  describe('Challenge 1: Can a user add > 3 rows or delete the last remaining row?', () => {
    it('C1.1: Prevents adding more than 3 rows even with repeated user events', () => {
      const handleChange = vi.fn();
      const threeRows: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'R1', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
        { line_no: 2, register_number: 'RAB-02', description: 'R2', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
        { line_no: 3, register_number: 'RAB-03', description: 'R3', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
      ];

      render(<RabLineEditor lines={threeRows} onChange={handleChange} />);
      const addBtn = screen.getByRole('button', { name: /Tambah Baris RAB/i });
      expect(addBtn).toBeDisabled();

      // Attempt clicking disabled button
      fireEvent.click(addBtn);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('C1.2: Prevents deleting the single remaining row (enforces min 1 row)', () => {
      const handleChange = vi.fn();
      const singleRow: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'Only row', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
      ];

      render(<RabLineEditor lines={singleRow} onChange={handleChange} />);
      const deleteBtn = screen.getByRole('button', { name: /Hapus Baris RAB 1/i });
      expect(deleteBtn).toBeDisabled();

      // Attempt clicking disabled delete button
      fireEvent.click(deleteBtn);
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('C1.3: Recovers gracefully and injects default 1 row if empty array is passed', () => {
      render(<RabLineEditor lines={[]} onChange={vi.fn()} />);
      expect(screen.getByLabelText('Nomor Register Baris 1')).toHaveValue('RAB-01');
      expect(screen.getByRole('button', { name: /Hapus Baris RAB 1/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Tambah Baris RAB/i })).toBeEnabled();
    });
  });

  // -------------------------------------------------------------------------
  // Challenge 2: Grand Total Overflow vs mpzisAllocation Ceiling
  // -------------------------------------------------------------------------
  describe('Challenge 2: Grand total overflow vs mpzisAllocation', () => {
    it('C2.1: Triggers alert banner and displays exact excess amount when total > ceiling', () => {
      const lines: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'Biaya', jumlah: 1, harga_satuan: 2000001, total: 2000001, amount: 2000001 },
      ];

      render(<RabLineEditor lines={lines} mpzisCeilingAmount={2000000} />);
      const alertBox = screen.getByRole('alert');
      expect(alertBox).toHaveTextContent(/Peringatan: Total RAB Melebihi Pagu MPZIS yang Disetujui/i);
      expect(alertBox).toHaveTextContent(/Kelebihan: \+Rp 1/i);
    });

    it('C2.2: PpdForm disables submit button and shows validation error on ceiling overflow', () => {
      const draft = createDraft({
        amount: 2500000,
        total_rab: 2500000,
        rab_lines: [
          { line_no: 1, register_number: 'RAB-01', description: 'Item 1', jumlah: 1, harga_satuan: 2500000, total: 2500000, amount: 2500000 },
        ],
      });

      render(
        <PpdForm
          mustahikId={101}
          initialDraft={draft}
          mpzisAllocation={2000000} // Ceiling 2,000,000 < Total 2,500,000
        />
      );

      const submitBtn = screen.getByRole('button', { name: /Ajukan PPD \(F-PKP\/03\)/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Challenge 3: Recipient Confirmation Notes Strict Character Bounds (10-1000)
  // -------------------------------------------------------------------------
  describe('Challenge 3: Notes validation in Recipient Confirmation (10 to 1000 chars)', () => {
    it('C3.1: Rejects note with < 10 characters', () => {
      const ppd = createDraft({ status: 'payment_verified' });
      render(<RecipientConfirmationPanel mustahikId={101} ppd={ppd} recipientNameSnapshot="Budi" />);

      const noteTextarea = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      const submitBtn = screen.getByRole('button', { name: /Catat Konfirmasi Penerimaan/i });

      // 9 characters
      fireEvent.change(noteTextarea, { target: { value: '123456789' } });
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/9 \/ 1000 karakter \(kurang 1\)/i)).toBeInTheDocument();
    });

    it('C3.2: Rejects whitespace-only note even if length >= 10', () => {
      const ppd = createDraft({ status: 'payment_verified' });
      render(<RecipientConfirmationPanel mustahikId={101} ppd={ppd} recipientNameSnapshot="Budi" />);

      const noteTextarea = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      const submitBtn = screen.getByRole('button', { name: /Catat Konfirmasi Penerimaan/i });

      // 12 spaces
      fireEvent.change(noteTextarea, { target: { value: '            ' } });
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/0 \/ 1000 karakter \(kurang 10\)/i)).toBeInTheDocument();
    });

    it('C3.3: Accepts note at boundary exactly 10 characters', () => {
      const ppd = createDraft({ status: 'payment_verified' });
      render(<RecipientConfirmationPanel mustahikId={101} ppd={ppd} recipientNameSnapshot="Budi" />);

      const noteTextarea = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      const submitBtn = screen.getByRole('button', { name: /Catat Konfirmasi Penerimaan/i });

      // 10 characters
      fireEvent.change(noteTextarea, { target: { value: '1234567890' } });
      expect(submitBtn).toBeEnabled();
      expect(screen.getByText(/10 \/ 1000 karakter/i)).toBeInTheDocument();
    });

    it('C3.4: Accepts note at boundary exactly 1000 characters and rejects 1001', () => {
      const ppd = createDraft({ status: 'payment_verified' });
      render(<RecipientConfirmationPanel mustahikId={101} ppd={ppd} recipientNameSnapshot="Budi" />);

      const noteTextarea = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      const submitBtn = screen.getByRole('button', { name: /Catat Konfirmasi Penerimaan/i });

      // 1000 characters
      const note1000 = 'a'.repeat(1000);
      fireEvent.change(noteTextarea, { target: { value: note1000 } });
      expect(submitBtn).toBeEnabled();
      expect(screen.getByText(/1000 \/ 1000 karakter/i)).toBeInTheDocument();

      // 1001 characters
      const note1001 = 'a'.repeat(1001);
      fireEvent.change(noteTextarea, { target: { value: note1001 } });
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/1001 \/ 1000 karakter/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Challenge 4: Payment Evidence Files > 10MB & Mismatching Paid Amounts
  // -------------------------------------------------------------------------
  describe('Challenge 4: Payment Evidence file size > 10MB and amount mismatch', () => {
    it('C4.1: Rejects file strictly greater than 10MB', () => {
      const ppd = createDraft({ status: 'finance_approved', amount: 2000000 });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25}
          currentUserRole="keuangan"
        />
      );

      const fileInput = document.getElementById('proof-file') as HTMLInputElement;
      const oversizedFile = new File([new ArrayBuffer(10 * 1024 * 1024 + 10)], 'huge.pdf', {
        type: 'application/pdf',
      });

      fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
      expect(screen.getByText('Ukuran berkas melebihi batas maksimal 10 MB.')).toBeInTheDocument();

      // Try submitting
      const submitBtn = screen.getByRole('button', { name: 'Simpan Bukti Pembayaran' });
      fireEvent.click(submitBtn);

      expect(api.recordPaymentProof).not.toHaveBeenCalled();
    });

    it('C4.2: Rejects payment recording if paid_amount differs by even 1 rupiah', () => {
      const ppd = createDraft({ status: 'finance_approved', amount: 2000000 });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25}
          currentUserRole="keuangan"
        />
      );

      const amountInput = screen.getByLabelText('Nominal Pembayaran (Rp) *');
      fireEvent.change(amountInput, { target: { value: '2000001' } });

      const submitBtn = screen.getByRole('button', { name: 'Simpan Bukti Pembayaran' });
      fireEvent.click(submitBtn);

      expect(
        screen.getByText(/Nilai pembayaran \(Rp 2\.000\.001\) harus sama persis dengan nilai PPD yang disetujui \(Rp 2\.000\.000\)/i)
      ).toBeInTheDocument();
      expect(api.recordPaymentProof).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Challenge 5: Segregation of Duties Locks on Buttons and Dialogs
  // -------------------------------------------------------------------------
  describe('Challenge 5: Segregation locks on buttons and dialogs', () => {
    it('C5.1: Blocks PPD creator from executing finance check or finance approve', () => {
      const ppd = createDraft({ status: 'submitted', created_by_id: 10 });
      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={10} // Creator ID
          currentUserRole="keuangan"
          currentUserLevel="staff"
        />
      );

      expect(screen.getByText(/Pemisahan Peran: Pembuat PPD di Penyaluran dilarang memeriksa keuangan/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).not.toBeInTheDocument();
    });

    it('C5.2: Blocks checker from executing approver step (checker !== approver)', () => {
      const ppd = createDraft({ status: 'finance_checked', created_by_id: 10 });
      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={20} // User 20 was checker
          currentUserRole="keuangan"
          currentUserLevel="leader"
          approvalEvents={[
            {
              id: 1,
              artifact_type: 'ppd',
              artifact_id: 42,
              artifact_revision: 1,
              approval_step: 'finance_check',
              action: 'finance_check',
              actor_id: 20, // Checker actor
              actor_name: 'Checker 20',
            },
          ]}
        />
      );

      expect(
        screen.getByText(/Pemeriksa PPD \(Checker\) tidak dapat merangkap sebagai Penyetuju PPD \(Approver\)/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Setujui Pencairan Keuangan' })).not.toBeInTheDocument();
    });

    it('C5.3: Blocks non-leader from executing approver step', () => {
      const ppd = createDraft({ status: 'finance_checked', created_by_id: 10 });
      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={30}
          currentUserRole="keuangan"
          currentUserLevel="staff" // Not a leader!
          approvalEvents={[
            {
              id: 1,
              artifact_type: 'ppd',
              artifact_id: 42,
              artifact_revision: 1,
              approval_step: 'finance_check',
              action: 'finance_check',
              actor_id: 20,
              actor_name: 'Checker 20',
            },
          ]}
        />
      );

      expect(
        screen.getByText(/Persetujuan Keuangan memerlukan level pimpinan \(Leader\)/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Setujui Pencairan Keuangan' })).not.toBeInTheDocument();
    });

    it('C5.4: Blocks payment recorder from verifying the payment (recorder !== verifier)', () => {
      const ppd = createDraft({ status: 'payment_recorded' });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25} // User 25 recorded
          currentUserRole="keuangan"
          paymentRecord={{
            id: 1,
            ppd_id: 42,
            transaction_number: 'TRX-999',
            paid_amount: 2000000,
            paid_at: '2026-09-20T11:00:00Z',
            proof_file_id: 88,
            recorded_by_id: 25, // Same user!
            verification_status: 'pending',
          }}
        />
      );

      expect(
        screen.getByText(/Petugas yang mencatat pembayaran tidak dapat memverifikasi pembayarannya sendiri/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Verifikasi Bukti & Transaksi Transfer' })).not.toBeInTheDocument();
    });

    it('C5.5: SystemReceiptPanel disables download button when status is pending or failed', () => {
      const ppdPending = createDraft({
        status: 'completed',
        receipt: {
          status: 'pending',
          file_id: null,
          payload_sha256: null,
          file_sha256: null,
          created_at: new Date().toISOString(),
        },
      });

      const { rerender } = render(
        <SystemReceiptPanel mustahikId={101} ppd={ppdPending} isCompleted={true} />
      );

      const downloadBtn = screen.getByRole('button', {
        name: 'Unduh Bukti Digital Penyaluran (PDF)',
      });
      expect(downloadBtn).toBeDisabled();

      // Test failed status
      const ppdFailed = createDraft({
        status: 'completed',
        receipt: {
          status: 'failed',
          file_id: null,
          payload_sha256: null,
          file_sha256: null,
          created_at: new Date().toISOString(),
        },
      });

      rerender(<SystemReceiptPanel mustahikId={101} ppd={ppdFailed} isCompleted={true} />);
      expect(screen.getByText('Pembuatan Bukti Digital Mengalami Kendala')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Unduh Bukti Digital Penyaluran (PDF)' })).toBeDisabled();
    });
  });
});
