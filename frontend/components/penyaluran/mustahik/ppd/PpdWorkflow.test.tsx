import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type {
  CurrentUser,
  P0CaseWorkspace,
  PpdDraft,
  RabLine,
} from '@/lib/api/penyaluran-p0-types';
import { RabLineEditor } from './RabLineEditor';
import { PpdForm } from './PpdForm';
import { FinanceApprovalPanel } from './FinanceApprovalPanel';
import { PaymentEvidencePanel } from './PaymentEvidencePanel';
import { RecipientConfirmationPanel } from './RecipientConfirmationPanel';
import { SystemReceiptPanel } from './SystemReceiptPanel';
import { CaseWorkflowPanel } from '../case/CaseWorkflowPanel';

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
    downloadArtifact: vi.fn(),
  },
}));

function createMockPpdDraft(overrides: Partial<PpdDraft> = {}): PpdDraft {
  return {
    id: 42,
    mustahik_id: 101,
    status: 'draft',
    form_number: 'F-PKP/03',
    ppd_number: 'PPD/2026/09/0042',
    transaction_number: 'TRX-PPD-2026-0042',
    purpose: 'Bantuan biaya hidup dan modal usaha keluarga mustahik',
    fund_source: 'Zakat',
    fund_source_confirmed: true,
    payment_type: 'Pembayaran',
    payment_type_confirmed: true,
    payment_type_other: null,
    bank_name: 'Bank Syariah Indonesia (BSI)',
    bank_account_name: 'Siti Maryam',
    bank_account_number: '1234567890',
    bank_account_masked: '******7890',
    amount: 3000000,
    total_rab: 3000000,
    amount_in_words: 'Tiga juta rupiah',
    created_by_id: 10,
    rab_lines: [
      {
        line_no: 1,
        register_number: 'RAB-01',
        description: 'Bantuan modal usaha warung',
        deskripsi: 'Bantuan modal usaha warung',
        jumlah: 1,
        harga_satuan: 2000000,
        total: 2000000,
        amount: 2000000,
      },
      {
        line_no: 2,
        register_number: 'RAB-02',
        description: 'Bantuan sembako pangan',
        deskripsi: 'Bantuan sembako pangan',
        jumlah: 1,
        harga_satuan: 1000000,
        total: 1000000,
        amount: 1000000,
      },
    ],
    ...overrides,
  };
}

describe('PPD Workflow, Finance Disbursement & Digital Receipt (Milestone 4 - Task 18)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-receipt');
    window.URL.revokeObjectURL = vi.fn();
  });

  // =========================================================================
  afterEach(() => {
    vi.useRealTimers();
  });

  // R1: RabLineEditor
  // =========================================================================
  describe('1. RabLineEditor (R1): 1–3 Dynamic Rows, Renumbering & Ceiling Checks', () => {
    it('1.1 renders initial default row (min 1 row) with volume 1 and line_no 1', () => {
      render(<RabLineEditor lines={[]} onChange={vi.fn()} />);

      expect(screen.getByText('Rencana Anggaran Biaya (RAB)')).toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Tabel Rencana Anggaran Biaya' })).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByLabelText('Nomor Register Baris 1')).toHaveValue('RAB-01');
      expect(screen.getByLabelText('Volume Baris 1')).toHaveValue(1);
    });

    it('1.2 adds new rows dynamically up to max 3 rows and auto-renumbers', () => {
      const handleChange = vi.fn();
      const initialLines: RabLine[] = [
        {
          line_no: 1,
          register_number: 'RAB-01',
          description: 'Kebutuhan A',
          jumlah: 1,
          harga_satuan: 500000,
          total: 500000,
          amount: 500000,
        },
      ];

      const { rerender } = render(<RabLineEditor lines={initialLines} onChange={handleChange} />);

      const addBtn = screen.getByRole('button', { name: 'Tambah Baris RAB' });
      expect(addBtn).toBeEnabled();
      fireEvent.click(addBtn);

      expect(handleChange).toHaveBeenCalledTimes(1);
      const passedLines = handleChange.mock.calls[0]![0] as RabLine[];
      expect(passedLines).toHaveLength(2);
      expect(passedLines[1]!.line_no).toBe(2);
      expect(passedLines[1]!.register_number).toBe('RAB-02');

      // Test maximum 3 rows disables add button
      const threeLines: RabLine[] = [
        ...initialLines,
        {
          line_no: 2,
          register_number: 'RAB-02',
          description: 'Kebutuhan B',
          jumlah: 1,
          harga_satuan: 500000,
          total: 500000,
          amount: 500000,
        },
        {
          line_no: 3,
          register_number: 'RAB-03',
          description: 'Kebutuhan C',
          jumlah: 1,
          harga_satuan: 500000,
          total: 500000,
          amount: 500000,
        },
      ];

      rerender(<RabLineEditor lines={threeLines} onChange={handleChange} />);
      const disabledAddBtn = screen.getByRole('button', { name: 'Tambah Baris RAB' });
      expect(disabledAddBtn).toBeDisabled();
    });

    it('1.3 deletes a row and sequentially renumbers remaining rows', () => {
      const handleChange = vi.fn();
      const threeLines: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'Item 1', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
        { line_no: 2, register_number: 'RAB-02', description: 'Item 2 (To Delete)', jumlah: 1, harga_satuan: 200000, total: 200000, amount: 200000 },
        { line_no: 3, register_number: 'RAB-03', description: 'Item 3', jumlah: 1, harga_satuan: 300000, total: 300000, amount: 300000 },
      ];

      render(<RabLineEditor lines={threeLines} onChange={handleChange} />);

      const deleteBtn2 = screen.getByRole('button', { name: 'Hapus Baris RAB 2' });
      fireEvent.click(deleteBtn2);

      expect(handleChange).toHaveBeenCalledTimes(1);
      const remaining = handleChange.mock.calls[0]![0] as RabLine[];
      expect(remaining).toHaveLength(2);
      expect(remaining[0]!.description).toBe('Item 1');
      expect(remaining[0]!.line_no).toBe(1);
      expect(remaining[1]!.description).toBe('Item 3');
      expect(remaining[1]!.line_no).toBe(2);
      expect(remaining[1]!.register_number).toBe('RAB-02');
    });

    it('1.4 disables delete button when only 1 row remains', () => {
      const oneLine: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'Only row', jumlah: 1, harga_satuan: 100000, total: 100000, amount: 100000 },
      ];

      render(<RabLineEditor lines={oneLine} onChange={vi.fn()} />);

      const deleteBtn = screen.getByRole('button', { name: 'Hapus Baris RAB 1' });
      expect(deleteBtn).toBeDisabled();
    });

    it('1.5 calculates grand total and triggers ceiling alert when exceeded', () => {
      const lines: RabLine[] = [
        { line_no: 1, register_number: 'RAB-01', description: 'Item 1', jumlah: 2, harga_satuan: 1500000, total: 3000000, amount: 3000000 },
      ];

      // Ceiling is 2.500.000, total is 3.000.000 -> Exceeded!
      const { rerender } = render(
        <RabLineEditor lines={lines} mpzisCeilingAmount={2500000} onChange={vi.fn()} />
      );

      expect(screen.getAllByText('Rp 3.000.000').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Tiga juta rupiah/i)).toBeInTheDocument();
      const alertBox = screen.getByRole('alert');
      expect(alertBox).toHaveTextContent(/Peringatan: Total RAB Melebihi Pagu MPZIS yang Disetujui/i);
      expect(alertBox).toHaveTextContent(/Kelebihan: \+Rp 500.000/i);

      // Now set ceiling to 3.500.000 -> Valid!
      rerender(<RabLineEditor lines={lines} mpzisCeilingAmount={3500000} onChange={vi.fn()} />);
      const statusBox = screen.getByRole('status');
      expect(statusBox).toHaveTextContent(/Rekonsiliasi Pagu MPZIS Sesuai/i);
      expect(statusBox).toHaveTextContent(/Sisa Pagu: Rp 500.000/i);
    });
  });

  // =========================================================================
  // R2: PpdForm F-PKP/03
  // =========================================================================
  describe('2. PpdForm (R2): F-PKP/03 Structure, Autosave, Validations & Submission', () => {
    it('2.1 renders form headers, identifiers, and bank details', () => {
      const draft = createMockPpdDraft();
      render(<PpdForm mustahikId={101} initialDraft={draft} mpzisAllocation={5000000} />);

      expect(screen.getByText('Pengajuan Pencairan Dana (PPD)')).toBeInTheDocument();
      expect(screen.getByLabelText('Nomor Formulir')).toHaveValue('F-PKP/03');
      expect(screen.getByLabelText('Nomor PPD')).toHaveValue('PPD/2026/09/0042');
      expect(screen.getByLabelText('Tujuan / Keperluan Pencairan *')).toHaveValue(draft.purpose);
      expect(screen.getByLabelText('Nama Bank *')).toHaveValue('Bank Syariah Indonesia (BSI)');
      expect(screen.getByLabelText('Nama Pemilik Rekening *')).toHaveValue('Siti Maryam');
    });

    it('2.2 reveals conditional input for payment_type Lain-lain', () => {
      const draft = createMockPpdDraft({ payment_type: 'Pembayaran' });
      render(<PpdForm mustahikId={101} initialDraft={draft} />);

      expect(screen.queryByLabelText(/Rincian Jenis Pembayaran Lain-lain/i)).not.toBeInTheDocument();

      const paymentTypeSelect = screen.getByLabelText('Jenis Pembayaran *');
      fireEvent.change(paymentTypeSelect, { target: { value: 'Lain-lain' } });

      expect(screen.getByLabelText(/Rincian Jenis Pembayaran Lain-lain/i)).toBeInTheDocument();
    });

    it('2.3 performs debounced autosave at 800ms and calls api.savePpdDraft', async () => {
      vi.useFakeTimers();
      const draft = createMockPpdDraft();
      vi.mocked(api.savePpdDraft).mockResolvedValueOnce({
        success: true,
        data: { ...draft, purpose: 'Tujuan yang diperbarui' },
      });

      render(<PpdForm mustahikId={101} initialDraft={draft} />);

      const purposeInput = screen.getByLabelText('Tujuan / Keperluan Pencairan *');
      fireEvent.change(purposeInput, { target: { value: 'Tujuan yang diperbarui' } });

      // Before 800ms, not called yet
      expect(api.savePpdDraft).not.toHaveBeenCalled();

      // Advance by 800ms
      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(api.savePpdDraft).toHaveBeenCalledTimes(1);
      expect(api.savePpdDraft).toHaveBeenCalledWith(
        101,
        42,
        expect.objectContaining({ purpose: 'Tujuan yang diperbarui' })
      );

      vi.useRealTimers();
    });

    it('preserves a reloaded canonical RAB amount when autosaving another field', async () => {
      vi.useFakeTimers();
      const reloadedDraft = createMockPpdDraft({
        rab_lines: [
          {
            line_no: 1,
            register_number: 'RAB-01',
            description: 'Bantuan modal usaha',
            amount: 2000000,
          },
        ],
      });
      vi.mocked(api.savePpdDraft).mockResolvedValueOnce({
        success: true,
        data: reloadedDraft,
      });

      render(<PpdForm mustahikId={101} initialDraft={reloadedDraft} />);
      expect(screen.getAllByText('Rp 2.000.000').length).toBeGreaterThan(0);
      fireEvent.change(screen.getByLabelText('Tujuan / Keperluan Pencairan *'), {
        target: { value: 'Tujuan diperbarui setelah draf dibuka kembali' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });

      expect(api.savePpdDraft).toHaveBeenCalledWith(
        101,
        42,
        expect.objectContaining({
          rab_lines: [
            expect.objectContaining({
              line_no: 1,
              amount: 2000000,
            }),
          ],
        })
      );
      vi.useRealTimers();
    });

    it('2.4 validates required fields and blocks submission if invalid', () => {
      const draft = createMockPpdDraft({
        purpose: 'pendek', // < 5 chars after trimming is okay, let's make it 2 chars
      });
      render(
        <PpdForm
          mustahikId={101}
          initialDraft={{
            ...draft,
            purpose: 'abc', // < 5 chars
            fund_source_confirmed: false,
          }}
        />
      );

      const submitBtn = screen.getByRole('button', { name: 'Ajukan PPD (F-PKP/03)' });
      fireEvent.click(submitBtn);

      expect(screen.getAllByText('Keperluan/tujuan pengajuan wajib diisi minimal 5 karakter.').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Konfirmasi kesesuaian sumber dana wajib dicentang.').length).toBeGreaterThanOrEqual(1);
      expect(api.submitPpd).not.toHaveBeenCalled();
    });

    it('2.5 opens IrreversibleActionDialog and submits PPD via api.submitPpd', async () => {
      const draft = createMockPpdDraft();
      vi.mocked(api.submitPpd).mockResolvedValueOnce({
        success: true,
        data: { ...draft, status: 'submitted' },
      });
      const handleSubmitted = vi.fn();

      render(
        <PpdForm
          mustahikId={101}
          initialDraft={draft}
          mpzisAllocation={5000000}
          onSubmitted={handleSubmitted}
        />
      );

      const submitBtn = screen.getByRole('button', { name: 'Ajukan PPD (F-PKP/03)' });
      fireEvent.click(submitBtn);

      expect(screen.getByText('Konfirmasi Pengajuan PPD (F-PKP/03)')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Kirim Pengajuan PPD' });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.submitPpd).toHaveBeenCalledWith(
          101,
          42,
          expect.objectContaining({
            form_number: 'F-PKP/03',
            fund_source: 'Zakat',
            payment_type: 'Pembayaran',
          })
        );
        expect(handleSubmitted).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // R3: FinanceApprovalPanel
  // =========================================================================
  describe('3. FinanceApprovalPanel (R3): Dual-Actor Review & Role Segregation', () => {
    it('3.1 renders Checker and Approver stages in order', () => {
      const ppd = createMockPpdDraft({ status: 'submitted' });
      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={20}
          currentUserRole="keuangan"
          currentUserLevel="staff"
        />
      );

      expect(screen.getByText('Pemeriksaan Keuangan (Checker)')).toBeInTheDocument();
      expect(screen.getByText('Persetujuan Keuangan (Approver)')).toBeInTheDocument();
      expect(screen.getByText('Menunggu Pemeriksaan')).toBeInTheDocument();
    });

    it('3.2 blocks PPD creator from acting as finance checker or approver', () => {
      const ppd = createMockPpdDraft({ status: 'submitted', created_by_id: 10 });
      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={10} // Same as created_by_id
          currentUserRole="keuangan"
          currentUserLevel="staff"
        />
      );

      expect(
        screen.getByText(/Pemisahan Peran: Pembuat PPD di Penyaluran dilarang memeriksa keuangan/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).not.toBeInTheDocument();
    });

    it('3.3 allows authorized finance staff to perform Checker step', async () => {
      const ppd = createMockPpdDraft({ status: 'submitted', created_by_id: 10 });
      vi.mocked(api.financeCheckPpd).mockResolvedValueOnce({
        success: true,
        data: { ...ppd, status: 'finance_checked' },
      });
      const handleDecided = vi.fn();

      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={20} // Distinct finance actor
          currentUserRole="keuangan"
          currentUserLevel="staff"
          onDecided={handleDecided}
        />
      );

      const noteInput = screen.getByLabelText('Catatan Pemeriksaan (Opsional)');
      fireEvent.change(noteInput, { target: { value: 'RAB dan berkas lengkap' } });

      const checkBtn = screen.getByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' });
      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(api.financeCheckPpd).toHaveBeenCalledWith(101, 42, {
          note: 'RAB dan berkas lengkap',
        });
        expect(handleDecided).toHaveBeenCalledTimes(1);
      });
    });

    it('3.4 blocks the Checker from also acting as Approver (same actor segregation)', () => {
      const ppd = createMockPpdDraft({
        status: 'finance_checked',
        created_by_id: 10,
      });

      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={20} // User 20 was the checker
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
              actor_id: 20, // Checker was user 20!
              actor_name: 'Bambang Staff Keuangan',
            },
          ]}
        />
      );

      expect(
        screen.getByText(/Pemeriksa PPD \(Checker\) tidak dapat merangkap sebagai Penyetuju PPD \(Approver\)/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Setujui Pencairan Keuangan' })).not.toBeInTheDocument();
    });

    it('3.5 allows distinct finance leader to perform Approver step', async () => {
      const ppd = createMockPpdDraft({
        status: 'finance_checked',
        created_by_id: 10,
      });

      vi.mocked(api.financeApprovePpd).mockResolvedValueOnce({
        success: true,
        data: { ...ppd, status: 'finance_approved' },
      });
      const handleDecided = vi.fn();

      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={30} // User 30 is distinct leader
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
              actor_id: 20,
              actor_name: 'Bambang Staff Keuangan',
            },
          ]}
          onDecided={handleDecided}
        />
      );

      const approveBtn = screen.getByRole('button', { name: 'Setujui Pencairan Keuangan' });
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(api.financeApprovePpd).toHaveBeenCalledWith(101, 42, {
          note: undefined,
        });
        expect(handleDecided).toHaveBeenCalledTimes(1);
      });
    });

    it('3.6 disables finance check and approve actions for admin user and displays segregation notice', () => {
      const ppd = createMockPpdDraft({
        status: 'submitted',
        created_by_id: 10,
      });

      render(
        <FinanceApprovalPanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={99}
          currentUserRole="admin"
        />
      );

      expect(
        screen.getByText(/Akun Administrator tidak dapat melakukan pemeriksaan atau persetujuan keuangan rutin/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Konfirmasi Pemeriksaan Keuangan' })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // R4: PaymentEvidencePanel
  // =========================================================================
  describe('4. PaymentEvidencePanel (R4): Multipart Upload, Exact Amount & Independent Verification', () => {
    it('4.1 enforces exact amount matching rule', async () => {
      const ppd = createMockPpdDraft({ status: 'finance_approved', amount: 3000000 });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25}
          currentUserRole="keuangan"
        />
      );

      const amountInput = screen.getByLabelText('Nominal Pembayaran (Rp) *');
      fireEvent.change(amountInput, { target: { value: '2500000' } }); // Mismatched!

      const submitBtn = screen.getByRole('button', { name: 'Simpan Bukti Pembayaran' });
      fireEvent.click(submitBtn);

      expect(
        screen.getByText(/Nilai pembayaran \(Rp 2\.500\.000\) harus sama persis dengan nilai PPD yang disetujui/i)
      ).toBeInTheDocument();
      expect(api.recordPaymentProof).not.toHaveBeenCalled();
    });

    it('4.2 validates file type and size restrictions', () => {
      const ppd = createMockPpdDraft({ status: 'finance_approved' });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25}
          currentUserRole="keuangan"
        />
      );

      const fileInput = document.getElementById('proof-file') as HTMLInputElement;

      // Reject non-PDF/image
      const textFile = new File(['hello'], 'proof.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [textFile] } });

      expect(
        screen.getByText('Format berkas tidak didukung. Harap unggah PDF, JPEG, atau PNG.')
      ).toBeInTheDocument();

      // Reject oversized > 10MB
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', {
        type: 'application/pdf',
      });
      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      expect(screen.getByText('Ukuran berkas melebihi batas maksimal 10 MB.')).toBeInTheDocument();
    });

    it('4.3 records payment proof with multipart FormData', async () => {
      const ppd = createMockPpdDraft({ status: 'finance_approved', amount: 3000000 });
      vi.mocked(api.recordPaymentProof).mockResolvedValueOnce({
        success: true,
        data: {
          id: 1,
          ppd_id: 42,
          transaction_number: 'TRX-PPD-2026-0042',
          paid_amount: 3000000,
          paid_at: new Date().toISOString(),
          proof_file_id: 88,
          recorded_by_id: 25,
          verification_status: 'pending',
        },
      });

      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25}
          currentUserRole="keuangan"
        />
      );

      const fileInput = document.getElementById('proof-file') as HTMLInputElement;
      const validPdf = new File(['dummy-bytes'], 'transfer-bsi.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [validPdf] } });

      const submitBtn = screen.getByRole('button', { name: 'Simpan Bukti Pembayaran' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.recordPaymentProof).toHaveBeenCalledWith(
          101,
          42,
          expect.any(FormData)
        );
      });
    });

    it('4.4 blocks the payment recorder from verifying payment (segregation)', () => {
      const ppd = createMockPpdDraft({ status: 'payment_recorded' });
      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={25} // Same as recorder_id
          currentUserRole="keuangan"
          paymentRecord={{
            id: 1,
            ppd_id: 42,
            transaction_number: 'TRX-123',
            paid_amount: 3000000,
            paid_at: '2026-09-20T10:00:00Z',
            proof_file_id: 88,
            recorded_by_id: 25, // User 25 recorded!
            verification_status: 'pending',
          }}
        />
      );

      expect(
        screen.getByText(/Petugas yang mencatat pembayaran tidak dapat memverifikasi pembayarannya sendiri/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Verifikasi Bukti & Transaksi Transfer' })).not.toBeInTheDocument();
    });

    it('4.5 allows independent finance staff/leader to verify payment', async () => {
      const ppd = createMockPpdDraft({ status: 'payment_recorded' });
      vi.mocked(api.verifyPayment).mockResolvedValueOnce({
        success: true,
        data: {
          id: 1,
          ppd_id: 42,
          verification_status: 'verified',
          verified_by_id: 35,
          verified_at: new Date().toISOString(),
        },
      });

      render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppd}
          currentUserId={35} // Independent finance actor
          currentUserRole="keuangan"
          paymentRecord={{
            id: 1,
            ppd_id: 42,
            transaction_number: 'TRX-123',
            paid_amount: 3000000,
            paid_at: '2026-09-20T10:00:00Z',
            proof_file_id: 88,
            recorded_by_id: 25,
            verification_status: 'pending',
          }}
        />
      );

      const verifyBtn = screen.getByRole('button', { name: 'Verifikasi Bukti & Transaksi Transfer' });
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(api.verifyPayment).toHaveBeenCalledWith(101, 42);
      });
    });

    it('4.6 segregates admin from recording payment evidence and verifying disbursement', () => {
      // Stage A: finance_approved
      const ppdStageA = createMockPpdDraft({ status: 'finance_approved', amount: 3000000 });
      const { rerender } = render(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppdStageA}
          currentUserId={99}
          currentUserRole="admin"
        />
      );

      expect(
        screen.getByText(/Akun Administrator tidak dapat mencatat bukti transfer pembayaran rutin/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Simpan Bukti Pembayaran' })).not.toBeInTheDocument();

      // Stage B: payment_recorded
      const ppdStageB = createMockPpdDraft({ status: 'payment_recorded' });
      rerender(
        <PaymentEvidencePanel
          mustahikId={101}
          ppd={ppdStageB}
          currentUserId={99}
          currentUserRole="admin"
          paymentRecord={{
            id: 1,
            ppd_id: 42,
            transaction_number: 'TRX-123',
            paid_amount: 3000000,
            paid_at: '2026-09-20T10:00:00Z',
            proof_file_id: 88,
            recorded_by_id: 25,
            verification_status: 'pending',
          }}
        />
      );

      expect(
        screen.getByText(/Akun Administrator tidak dapat memverifikasi pembayaran rutin/i)
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Verifikasi Bukti & Transaksi Transfer' })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // R5: RecipientConfirmationPanel
  // =========================================================================
  describe('5. RecipientConfirmationPanel (R5): Beneficiary Receipt Confirmation', () => {
    it('5.1 validates required 10–1000 character note length', () => {
      const ppd = createMockPpdDraft({ status: 'payment_verified' });
      render(
        <RecipientConfirmationPanel
          mustahikId={101}
          ppd={ppd}
          recipientNameSnapshot="Siti Maryam"
        />
      );

      expect(screen.getByText('Konfirmasi Tanda Terima Mustahik')).toBeInTheDocument();
      expect(screen.getAllByText('Siti Maryam').length).toBeGreaterThanOrEqual(1);

      const noteInput = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      fireEvent.change(noteInput, { target: { value: 'singkat' } }); // 7 chars, less than 10

      const submitBtn = screen.getByRole('button', { name: 'Catat Konfirmasi Penerimaan' });
      expect(submitBtn).toBeDisabled();

      fireEvent.change(noteInput, {
        target: { value: 'Dana telah diterima langsung oleh mustahik dalam keadaan baik.' },
      });
      expect(submitBtn).toBeEnabled();
    });

    it('5.2 submits confirmation payload via api.recordRecipientConfirmation', async () => {
      const ppd = createMockPpdDraft({ status: 'payment_verified' });
      vi.mocked(api.recordRecipientConfirmation).mockResolvedValueOnce({
        success: true,
        data: {
          id: 1,
          ppd_id: 42,
          method: 'Tatap Muka',
          recipient_name_snapshot: 'Siti Maryam',
          confirmed_at: new Date().toISOString(),
          note: 'Dana telah diserahkan di rumah mustahik.',
          evidence_file_id: null,
          recorded_by_id: 15,
          snapshot_hash: 'hash-confirmation-1234',
        },
      });

      render(
        <RecipientConfirmationPanel
          mustahikId={101}
          ppd={ppd}
          recipientNameSnapshot="Siti Maryam"
        />
      );

      const noteInput = screen.getByLabelText(/Catatan Konfirmasi Operasional \*/i);
      fireEvent.change(noteInput, { target: { value: 'Dana telah diserahkan di rumah mustahik.' } });

      const submitBtn = screen.getByRole('button', { name: 'Catat Konfirmasi Penerimaan' });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.recordRecipientConfirmation).toHaveBeenCalledWith(
          101,
          42,
          expect.objectContaining({
            method: 'Tatap Muka',
            recipient_name_snapshot: 'Siti Maryam',
            note: 'Dana telah diserahkan di rumah mustahik.',
          })
        );
      });
    });
  });

  // =========================================================================
  // R6: SystemReceiptPanel
  // =========================================================================
  describe('6. SystemReceiptPanel (R6): Dual-Hash Display & PDF Download', () => {
    it('6.1 closes case and invokes api.completePpd', async () => {
      const ppd = createMockPpdDraft({ status: 'recipient_confirmed' });
      vi.mocked(api.completePpd).mockResolvedValueOnce({
        success: true,
        data: { ...ppd, status: 'completed' },
      });

      render(
        <SystemReceiptPanel
          mustahikId={101}
          ppd={ppd}
          fileNo="MST/2026/09/00101"
        />
      );

      const completeBtn = screen.getByRole('button', {
        name: 'Tuntaskan Penyaluran & Terbitkan Bukti Digital',
      });
      fireEvent.click(completeBtn);

      expect(screen.getByText('Tuntaskan Penyaluran Kasus & Terbitkan Bukti')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Tuntaskan Kasus Sekarang' });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.completePpd).toHaveBeenCalledWith(101, 42);
      });
    });

    it('6.2 displays dual cryptographic hashes and downloads PDF', async () => {
      const ppd = createMockPpdDraft({
        status: 'completed',
        receipt: {
          status: 'ready',
          file_id: 99,
          payload_sha256: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff66667777888899990000',
          file_sha256: 'ffff6666eeee5555dddd4444cccc3333bbbb2222aaaa11119999000088887777',
          created_at: new Date().toISOString(),
        },
      });

      const receiptBlob = new Blob(['pdf-content'], { type: 'application/pdf' });
      vi.mocked(api.downloadReceipt).mockResolvedValueOnce(receiptBlob);

      render(
        <SystemReceiptPanel
          mustahikId={101}
          ppd={ppd}
          fileNo="MST-00101"
          isCompleted={true}
        />
      );

      expect(screen.getByText('Penyaluran Berhasil Tuntas')).toBeInTheDocument();
      expect(
        screen.getByText('aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff66667777888899990000')
      ).toBeInTheDocument();
      expect(
        screen.getByText('ffff6666eeee5555dddd4444cccc3333bbbb2222aaaa11119999000088887777')
      ).toBeInTheDocument();

      const downloadBtn = screen.getByRole('button', {
        name: 'Unduh Bukti Digital Penyaluran (PDF)',
      });
      expect(downloadBtn).toBeEnabled();
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.downloadReceipt).toHaveBeenCalledWith(101, 42);
        expect(window.URL.createObjectURL).toHaveBeenCalledWith(receiptBlob);
      });
    });
  });

  // =========================================================================
  // R7: CaseWorkflowPanel Stage Dispatcher & Integration
  // =========================================================================
  describe('7. CaseWorkflowPanel Integration (R7): Stage Dispatcher in Tab Proses', () => {
    function buildMockWorkspace(stage: string, ppdStatus: string): P0CaseWorkspace {
      return {
        success: true,
        case: {
          id: 101,
          nomor_registrasi: 'REG-2026-00101',
          file_no: 'MST-00101',
          status: 'Proses',
          p0_version: 1,
          workflow_version: 1,
          workflow_mode: 'p0',
          is_legacy: false,
          legacy_banner: false,
          created_at: '2026-09-20T08:30:00.000Z',
          updated_at: '2026-09-20T09:00:00.000Z',
          archived_at: null,
          archived_by_id: null,
          archive_reason: null,
        },
        mustahik: {
          id: 101,
          nama: 'Siti Maryam',
          name: 'Siti Maryam',
          nik_masked: '367101******0001',
          phone_masked: '0812****5678',
          applicant_status: 'Kepala Keluarga',
          kategori: 'Perorangan',
          asnaf: 'Fakir',
          program: 'Tangerang Peduli',
          address: 'Jl. Merdeka No. 45',
          rt_rw: '003/002',
          kelurahan: 'Cipondoh',
          kecamatan: 'Cipondoh',
          kabupaten_kota: 'Kota Tangerang',
          province: 'Banten',
        },
        case_progress: {
          current_stage: stage as any,
          active_artifact: 'ppd',
          required_action: null,
          blocking_reasons: [],
          is_terminal: false,
        },
        assessment: null,
        mpzis_approvals: [],
        mpzis: {
          id: 12,
          revision: 1,
          status: 'approved',
          form_number: 'MPZIS-2026-0012',
          total_amount: 3000000,
          snapshot_hash: 'mpzishash123456',
          approvals: [],
        },
        ppd: {
          id: 42,
          revision: 1,
          status: ppdStatus as any,
          form_number: 'F-PKP/03',
          ppd_number: 'PPD/2026/09/0042',
          transaction_number: 'TRX-PPD-2026-0042',
          total_rab: 3000000,
          amount: 3000000,
          amount_in_words: 'Tiga juta rupiah',
          bank_name: 'Bank Syariah Indonesia (BSI)',
          bank_account_masked: '******7890',
          rab_lines: [
            {
              line_no: 1,
              deskripsi: 'Bantuan modal usaha warung',
              description: 'Bantuan modal usaha warung',
              register_number: 'RAB-01',
              jumlah: 1,
              harga_satuan: 3000000,
              total: 3000000,
              amount: 3000000,
            },
          ],
        },
        disbursement: {
          status: 'pending',
          paid_amount: null,
          paid_at: null,
          transaction_number: null,
          proof_url: null,
          verification_status: null,
          verified_at: null,
        },
        completion: {
          status: 'pending',
          method: null,
          confirmed_at: null,
          recipient_name: null,
          receipt_status: null,
          receipt_url: null,
          payload_sha256: null,
          file_sha256: null,
        },
        permissions: {
          can_assess: true,
          can_approve_mpzis: true,
          allowed_mpzis_roles: [],
          can_submit_ppd: true,
          can_disburse: true,
          can_archive: false,
          can_restore: false,
        },
        capabilities: {},
        timeline: [],
        history: [],
        documents: [],
      };
    }

    it('7.1 renders PpdForm when PPD status is draft', () => {
      const workspace = buildMockWorkspace('ppd', 'draft');
      render(<CaseWorkflowPanel workspace={workspace} activeTab="process" />);

      expect(screen.getByText('Pengajuan Pencairan Dana (PPD)')).toBeInTheDocument();
      expect(screen.getByText('Rencana Anggaran Biaya (RAB)')).toBeInTheDocument();
    });

    it('7.2 renders FinanceApprovalPanel when PPD status is submitted', () => {
      const workspace = buildMockWorkspace('ppd', 'submitted');
      render(
        <CaseWorkflowPanel
          workspace={workspace}
          activeTab="process"
          currentUserId={20}
        />
      );

      expect(
        screen.getByText('Tinjauan & Persetujuan Keuangan (Dual-Actor)')
      ).toBeInTheDocument();
    });

    it('7.3 renders PaymentEvidencePanel when PPD status is finance_approved', () => {
      const workspace = buildMockWorkspace('ppd', 'finance_approved');
      render(
        <CaseWorkflowPanel
          workspace={workspace}
          activeTab="process"
          currentUserId={25}
        />
      );

      expect(screen.getByText('Bukti Transfer & Verifikasi Pencairan')).toBeInTheDocument();
    });

    it('7.4 renders RecipientConfirmationPanel when PPD status is payment_verified', () => {
      const workspace = buildMockWorkspace('ppd', 'payment_verified');
      render(
        <CaseWorkflowPanel
          workspace={workspace}
          activeTab="process"
          currentUserId={15}
        />
      );

      expect(screen.getByText('Konfirmasi Tanda Terima Mustahik')).toBeInTheDocument();
    });

    it('7.5 renders SystemReceiptPanel when PPD status is recipient_confirmed or completed', () => {
      const workspace = buildMockWorkspace('ppd', 'recipient_confirmed');
      render(
        <CaseWorkflowPanel
          workspace={workspace}
          activeTab="process"
          currentUserId={5}
        />
      );

      expect(
        screen.getByText('Bukti Digital Penyaluran & Penutupan Kasus')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Tuntaskan Penyaluran & Terbitkan Bukti Digital' })
      ).toBeInTheDocument();
    });
  });
});
