import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { api } from '@/lib/api/client';
import type { P0CaseWorkspace, PpdDraft } from '@/lib/api/penyaluran-p0-types';
import { CaseWorkflowPanel } from '../case/CaseWorkflowPanel';
import { PpdForm } from './PpdForm';
import { IrreversibleActionDialog } from '../shared/IrreversibleActionDialog';

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

function createMockWorkspace(overrides: Partial<P0CaseWorkspace> = {}): P0CaseWorkspace {
  return {
    success: true,
    case: {
      id: 202,
      nomor_registrasi: 'REG-2026-00202',
      file_no: 'MST/2026/09/00202',
      status: 'Survey',
      p0_version: 1,
      workflow_version: 1,
      workflow_mode: 'p0',
      is_legacy: false,
      legacy_banner: false,
      created_at: '2026-09-20T08:00:00.000Z',
      updated_at: '2026-09-20T08:30:00.000Z',
      archived_at: null,
      archived_by_id: null,
      archive_reason: null,
      ...overrides.case,
    },
    mustahik: {
      id: 202,
      nama: 'Ahmad Fauzi',
      name: 'Ahmad Fauzi',
      nik_masked: '320101******0005',
      phone_masked: '0813****1234',
      applicant_status: 'Kepala Keluarga',
      kategori: 'Perorangan',
      asnaf: 'Miskin',
      program: 'BAZNAS Peduli Lingkungan',
      address: 'Kp. Baru No. 10',
      rt_rw: '001/003',
      kelurahan: 'Sukasari',
      kecamatan: 'Tangerang',
      kabupaten_kota: 'Kota Tangerang',
      province: 'Banten',
      ...overrides.mustahik,
    },
    case_progress: {
      current_stage: 'intake',
      active_artifact: 'intake',
      required_action: 'Lengkapi berkas pendaftaran',
      blocking_reasons: [],
      is_terminal: false,
      ...overrides.case_progress,
    },
    assessment: {
      id: 10,
      revision: 1,
      status: 'draft',
      snapshot_hash: 'hash-assessment-001',
      fields: {
        husband_in_household: true,
        husband_name: 'Ahmad Fauzi',
        wife_in_household: true,
        wife_name: 'Nurul Hidayah',
        child_count: 2,
        house_ownership: 'Milik Sendiri',
        home_address: 'Kp. Baru No. 10',
        address_matches_ktp: true,
        monthly_rent_amount: 0,
        husband_occupation: 'Pedagang Keliling',
        husband_monthly_income: 1500000,
        wife_occupation: 'Ibu Rumah Tangga',
        wife_monthly_income: 0,
        child_occupation: 'Pelajar',
        child_monthly_support: 0,
        assistance_request: 'Bantuan gerobak usaha',
        applied_to_baznas_before: false,
        previous_application_year: null,
        occupation: 'Pedagang Keliling',
        monthly_income: 1500000,
        monthly_expense: 1400000,
      },
      ...overrides.assessment,
    },
    mpzis_approvals: [
      {
        step_key: 'proposed',
        role: 'STAFF_PENYALURAN',
        user_id: 11,
        user_nama: 'Petugas Lapangan',
        status: 'APPROVED',
        decided_at: '2026-09-20T09:00:00.000Z',
        snapshot_hash: 'mpzis-step-1-hash',
        note: 'Memenuhi syarat ashnaf miskin',
      },
    ],
    mpzis: {
      id: 15,
      revision: 1,
      status: 'submitted',
      form_number: 'BPP-06/2026/09/0015',
      total_amount: 3000000,
      snapshot_hash: 'mpzis-hash-001',
      approvals: [],
      ...overrides.mpzis,
    },
    ppd: {
      id: 30,
      revision: 1,
      status: 'draft',
      form_number: 'F-PKP/03',
      ppd_number: 'PPD/2026/09/0030',
      transaction_number: 'TRX-2026-0030',
      total_rab: 3000000,
      amount: 3000000,
      amount_in_words: 'Tiga juta rupiah',
      bank_name: 'Bank Syariah Indonesia (BSI)',
      bank_account_masked: '******5678',
      bank_account_name: 'Ahmad Fauzi',
      rab_lines: [
        {
          line_no: 1,
          register_number: 'RAB-01',
          description: 'Pengadaan gerobak usaha',
          jumlah: 1,
          harga_satuan: 3000000,
          total: 3000000,
          amount: 3000000,
        },
      ],
      ...overrides.ppd,
    },
    disbursement: {
      status: 'pending',
      paid_amount: null,
      paid_at: null,
      transaction_number: null,
      proof_url: null,
      verification_status: null,
      verified_at: null,
      ...overrides.disbursement,
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
      ...overrides.completion,
    },
    permissions: {
      can_assess: true,
      can_approve_mpzis: false,
      allowed_mpzis_roles: ['STAFF_PENYALURAN'],
      can_submit_ppd: true,
      can_disburse: false,
      can_archive: false,
      can_restore: false,
      ...overrides.permissions,
    },
    capabilities: {
      can_create_draft: true,
      ...overrides.capabilities,
    },
    timeline: [],
    history: [],
    documents: [],
    ...overrides,
  };
}

describe('Adversarial Challenger: Milestone 4 Integration Integrity Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-receipt');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // MISSION ITEM 1: CaseWorkflowPanel Tab "Proses" Across ALL Stages
  // =========================================================================
  describe('Mission 1: CaseWorkflowPanel Tab "Proses" Multi-Stage Integration', () => {
    it('1.1 renders intake stage content with registration number and can_assess indicator', () => {
      const workspace = createMockWorkspace({
        case_progress: {
          current_stage: 'intake',
          active_artifact: null,
          required_action: 'Verifikasi pendaftaran',
          blocking_reasons: [],
          is_terminal: false,
        },
      });

      render(<CaseWorkflowPanel workspace={workspace} activeTab="process" />);

      expect(screen.getByText('Intake Berkas Terdaftar')).toBeInTheDocument();
      expect(screen.getByText(/File No: MST\/2026\/09\/00202/i)).toBeInTheDocument();
      expect(screen.getByText(/Memiliki wewenang mengisi asesmen lapangan/i)).toBeInTheDocument();
    });

    it('1.2 renders assessment stage: AssessmentForm when draft, AssessmentReviewPanel when submitted', () => {
      // Draft -> AssessmentForm
      const draftWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'assessment',
          active_artifact: 'assessment',
          required_action: 'Lengkapi asesmen',
          blocking_reasons: [],
          is_terminal: false,
        },
        assessment: {
          id: 10,
          revision: 1,
          status: 'draft',
          snapshot_hash: 'hash-draft',
          fields: {
            husband_name: 'Ahmad Fauzi',
            assistance_request: 'Bantuan gerobak',
          } as any,
        },
      });

      const { rerender } = render(
        <CaseWorkflowPanel workspace={draftWorkspace} activeTab="process" />
      );

      expect(screen.getByText('Formulir Asesmen Lapangan (P0)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Ahmad Fauzi')).toBeInTheDocument();

      // Submitted -> AssessmentReviewPanel
      const submittedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'assessment',
          active_artifact: 'assessment',
          required_action: 'Tinjau asesmen',
          blocking_reasons: [],
          is_terminal: false,
        },
        assessment: {
          id: 10,
          revision: 1,
          status: 'submitted',
          snapshot_hash: 'hash-submitted',
          submitted_by_id: 10,
          fields: {
            husband_name: 'Ahmad Fauzi',
            assistance_request: 'Bantuan gerobak',
          } as any,
        },
      });

      rerender(<CaseWorkflowPanel workspace={submittedWorkspace} activeTab="process" />);
      expect(screen.getByText('Tinjauan Asesmen Lapangan (P0)')).toBeInTheDocument();
    });

    it('1.3 renders mpzis stage: MpzisForm when draft, MpzisApprovalStepper when submitted', () => {
      // Draft -> MpzisForm
      const draftWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'mpzis',
          active_artifact: 'mpzis',
          required_action: 'Isi formulir MPZIS',
          blocking_reasons: [],
          is_terminal: false,
        },
        mpzis: {
          id: 15,
          revision: 1,
          status: 'draft',
          form_number: 'BPP-06/2026/09/0015',
          total_amount: 3000000,
          snapshot_hash: 'mpzis-draft-hash',
          approvals: [],
        },
      });

      const { rerender } = render(
        <CaseWorkflowPanel workspace={draftWorkspace} activeTab="process" />
      );

      expect(
        screen.getByRole('heading', {
          name: /Formulir MPZIS F-BPP\/06 \(Persetujuan Bantuan\)/i,
        })
      ).toBeInTheDocument();

      // Submitted -> MpzisApprovalStepper
      const submittedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'mpzis',
          active_artifact: 'mpzis',
          required_action: 'Persetujuan berjenjang',
          blocking_reasons: [],
          is_terminal: false,
        },
        mpzis: {
          id: 15,
          revision: 1,
          status: 'submitted',
          form_number: 'BPP-06/2026/09/0015',
          total_amount: 3000000,
          snapshot_hash: 'mpzis-submitted-hash',
          approvals: [],
        },
      });

      rerender(<CaseWorkflowPanel workspace={submittedWorkspace} activeTab="process" />);
      expect(
        screen.getByRole('heading', {
          name: /Persetujuan Berjenjang MPZIS \(5 Tingkat\)/i,
        })
      ).toBeInTheDocument();
    });

    it('1.4 renders all sub-stages of PPD: Form -> FinanceApproval -> PaymentEvidence -> RecipientConfirmation -> SystemReceipt', () => {
      // Sub-stage 1: PPD draft -> PpdForm
      const ppdDraftWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'ppd',
          active_artifact: 'ppd',
          required_action: 'Isi PPD',
          blocking_reasons: [],
          is_terminal: false,
        },
        ppd: {
          id: 30,
          revision: 1,
          status: 'draft',
          amount: 3000000,
          total_rab: 3000000,
          bank_name: 'BSI',
          bank_account_masked: '******5678',
          rab_lines: [
            { line_no: 1, description: 'Gerobak', jumlah: 1, harga_satuan: 3000000, total: 3000000 },
          ],
        },
      });

      const { rerender } = render(
        <CaseWorkflowPanel workspace={ppdDraftWorkspace} activeTab="process" />
      );
      expect(screen.getByText('Pengajuan Pencairan Dana (PPD)')).toBeInTheDocument();
      expect(screen.getByText('BSI')).toBeInTheDocument();

      // Sub-stage 2: PPD submitted -> FinanceApprovalPanel
      const ppdSubmittedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'ppd',
          active_artifact: 'ppd',
          required_action: 'Pemeriksaan Keuangan',
          blocking_reasons: [],
          is_terminal: false,
        },
        ppd: {
          ...ppdDraftWorkspace.ppd!,
          status: 'submitted',
          created_by_id: 10,
        },
      });

      rerender(<CaseWorkflowPanel workspace={ppdSubmittedWorkspace} activeTab="process" />);
      expect(
        screen.getByText(/Tinjauan & Persetujuan Keuangan \(Dual-Actor\)/i)
      ).toBeInTheDocument();

      // Sub-stage 3: PPD finance_approved -> PaymentEvidencePanel
      const ppdFinanceApprovedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'ppd',
          active_artifact: 'ppd',
          required_action: 'Catat Bukti Transfer',
          blocking_reasons: [],
          is_terminal: false,
        },
        ppd: {
          ...ppdDraftWorkspace.ppd!,
          status: 'finance_approved',
          amount: 3000000,
        },
      });

      rerender(<CaseWorkflowPanel workspace={ppdFinanceApprovedWorkspace} activeTab="process" />);
      expect(
        screen.getByText(/Bukti Transfer & Verifikasi Pencairan/i)
      ).toBeInTheDocument();

      // Sub-stage 4: PPD payment_verified -> RecipientConfirmationPanel
      const ppdPaymentVerifiedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'ppd',
          active_artifact: 'ppd',
          required_action: 'Konfirmasi Penerima',
          blocking_reasons: [],
          is_terminal: false,
        },
        ppd: {
          ...ppdDraftWorkspace.ppd!,
          status: 'payment_verified',
        },
      });

      rerender(<CaseWorkflowPanel workspace={ppdPaymentVerifiedWorkspace} activeTab="process" />);
      expect(
        screen.getByRole('heading', {
          name: /^Konfirmasi Tanda Terima Mustahik/i,
        })
      ).toBeInTheDocument();

      // Sub-stage 5: PPD recipient_confirmed -> SystemReceiptPanel
      const ppdRecipientConfirmedWorkspace = createMockWorkspace({
        case_progress: {
          current_stage: 'ppd',
          active_artifact: 'ppd',
          required_action: 'Penuntasan Kasus',
          blocking_reasons: [],
          is_terminal: false,
        },
        ppd: {
          ...ppdDraftWorkspace.ppd!,
          status: 'recipient_confirmed',
        },
      });

      rerender(<CaseWorkflowPanel workspace={ppdRecipientConfirmedWorkspace} activeTab="process" />);
      expect(
        screen.getByRole('heading', {
          name: /Bukti Digital Penyaluran & Penutupan Kasus/i,
        })
      ).toBeInTheDocument();
    });

    it('1.5 renders completion stage and downloads digital receipt PDF', async () => {
      const completedWorkspace = createMockWorkspace({
        case: {
          id: 202,
          file_no: 'MST/2026/09/00202',
          status: 'Penyaluran Selesai',
          is_legacy: false,
        } as any,
        case_progress: {
          current_stage: 'completed',
          active_artifact: null,
          required_action: null,
          blocking_reasons: [],
          is_terminal: true,
        },
        ppd: {
          id: 30,
          status: 'completed',
          amount: 3000000,
        } as any,
        completion: {
          status: 'completed',
          receipt_status: 'ready',
          payload_sha256: 'payload-sha256-abc1234567890',
          file_sha256: 'file-sha256-def1234567890',
        } as any,
      });

      const mockBlob = new Blob(['sample-receipt'], { type: 'application/pdf' });
      vi.mocked(api.downloadReceipt).mockResolvedValueOnce(mockBlob);

      render(<CaseWorkflowPanel workspace={completedWorkspace} activeTab="process" />);

      expect(screen.getByText('Penyaluran Berhasil Tuntas')).toBeInTheDocument();
      expect(screen.getByText(/Bukti Digital Penyaluran Resmi Siap Diunduh/i)).toBeInTheDocument();

      const downloadBtn = screen.getByRole('button', {
        name: /Unduh Bukti Digital Penyaluran \(PDF\)/i,
      });
      expect(downloadBtn).toBeEnabled();
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.downloadReceipt).toHaveBeenCalledWith(202, 30);
        expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      });
    });
  });

  // =========================================================================
  // MISSION ITEM 2: Debounced Autosave Behavior (800ms)
  // =========================================================================
  describe('Mission 2: Debounced Autosave Behavior (800ms) in PpdForm', () => {
    it('2.1 adheres strictly to 800ms debounce: does NOT fire at 799ms, fires at 800ms', async () => {
      vi.useFakeTimers();
      const mockDraft: PpdDraft = {
        id: 77,
        mustahik_id: 202,
        status: 'draft',
        purpose: 'Tujuan awal',
        rab_lines: [
          { line_no: 1, description: 'Baris 1', jumlah: 1, harga_satuan: 1000000, total: 1000000 },
        ],
      } as any;

      vi.mocked(api.savePpdDraft).mockResolvedValue({
        success: true,
        data: { ...mockDraft, purpose: 'Tujuan diperbarui' },
      });

      const handleSaved = vi.fn();
      render(
        <PpdForm
          mustahikId={202}
          initialDraft={mockDraft}
          onSaved={handleSaved}
        />
      );

      const purposeInput = screen.getByLabelText(/Tujuan \/ Keperluan Pencairan/i);
      fireEvent.change(purposeInput, {
        target: { value: 'Tujuan diperbarui yang valid' },
      });

      // At 0ms: not called
      expect(api.savePpdDraft).not.toHaveBeenCalled();

      // Advance by 799ms: still not called
      await act(async () => {
        vi.advanceTimersByTime(799);
      });
      expect(api.savePpdDraft).not.toHaveBeenCalled();
      expect(handleSaved).not.toHaveBeenCalled();

      // Advance 1ms more (total 800ms): fired!
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(api.savePpdDraft).toHaveBeenCalledTimes(1);
      expect(api.savePpdDraft).toHaveBeenCalledWith(
        202,
        77,
        expect.objectContaining({
          purpose: 'Tujuan diperbarui yang valid',
        })
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
    });

    it('2.2 collapses rapid multiple keystrokes into a single autosave call', async () => {
      vi.useFakeTimers();
      const mockDraft: PpdDraft = {
        id: 88,
        mustahik_id: 202,
        status: 'draft',
        bank_name: 'BSI',
        rab_lines: [
          { line_no: 1, description: 'Baris 1', jumlah: 1, harga_satuan: 500000, total: 500000 },
        ],
      } as any;

      vi.mocked(api.savePpdDraft).mockResolvedValue({
        success: true,
        data: mockDraft,
      });

      render(<PpdForm mustahikId={202} initialDraft={mockDraft} />);

      const bankNameInput = screen.getByLabelText(/^Nama Bank/i);

      // 3 Keystrokes at 200ms intervals
      fireEvent.change(bankNameInput, { target: { value: 'Bank B' } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(api.savePpdDraft).not.toHaveBeenCalled();

      fireEvent.change(bankNameInput, { target: { value: 'Bank BA' } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(api.savePpdDraft).not.toHaveBeenCalled();

      fireEvent.change(bankNameInput, { target: { value: 'Bank BAZNAS' } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(api.savePpdDraft).not.toHaveBeenCalled();

      // Now wait the full 800ms after the last change
      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(api.savePpdDraft).toHaveBeenCalledTimes(1);
      expect(api.savePpdDraft).toHaveBeenCalledWith(
        202,
        88,
        expect.objectContaining({
          bank_name: 'Bank BAZNAS',
        })
      );
    });

    it('2.3 displays error indicator when autosave rejects', async () => {
      vi.useFakeTimers();
      const mockDraft: PpdDraft = {
        id: 99,
        mustahik_id: 202,
        status: 'draft',
        purpose: 'Modal usaha',
        rab_lines: [
          { line_no: 1, description: 'Item', jumlah: 1, harga_satuan: 100000, total: 100000 },
        ],
      } as any;

      vi.mocked(api.savePpdDraft).mockRejectedValueOnce(new Error('Network offline'));

      render(<PpdForm mustahikId={202} initialDraft={mockDraft} />);

      const purposeInput = screen.getByLabelText(/Tujuan \/ Keperluan Pencairan/i);
      fireEvent.change(purposeInput, { target: { value: 'Modal usaha warung sembako' } });

      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(api.savePpdDraft).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Gagal disimpan otomatis')).toBeInTheDocument();
    });

    it('2.4 does not trigger autosave when form is read-only', async () => {
      vi.useFakeTimers();
      const mockDraft: PpdDraft = {
        id: 100,
        mustahik_id: 202,
        status: 'submitted', // submitted status implies readOnly
        purpose: 'Sudah diajukan',
        rab_lines: [],
      } as any;

      render(<PpdForm mustahikId={202} initialDraft={mockDraft} readOnly={true} />);

      // Purpose input should not be editable
      expect(screen.queryByRole('textbox', { name: /Tujuan/i })).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(api.savePpdDraft).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // MISSION ITEM 3: IrreversibleActionDialog Focus Trap, Escape & A11y
  // =========================================================================
  describe('Mission 3: IrreversibleActionDialog Focus Trap & Escape Handling', () => {
    function DialogHarness({
      requiresConfirmationPhrase = false,
      confirmationPhrase = 'SETUJU',
      noteRequired = false,
      isSubmitting = false,
    }: {
      requiresConfirmationPhrase?: boolean;
      confirmationPhrase?: string;
      noteRequired?: boolean;
      isSubmitting?: boolean;
    }) {
      const [isOpen, setIsOpen] = useState(false);
      const [note, setNote] = useState('');
      const [confirmed, setConfirmed] = useState(false);

      return (
        <div>
          <button
            type="button"
            id="trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Buka Dialog
          </button>
          {confirmed && <span data-testid="confirmed-marker">Aksi Terkonfirmasi</span>}

          <IrreversibleActionDialog
            isOpen={isOpen}
            title="Konfirmasi Tindakan Permanen"
            description="Tindakan ini tidak dapat dibatalkan."
            actionLabel="Lanjutkan Tindakan"
            cancelLabel="Batal"
            variant="danger"
            requiresConfirmationPhrase={requiresConfirmationPhrase}
            confirmationPhrase={confirmationPhrase}
            noteLabel={noteRequired ? 'Alasan Tindakan' : undefined}
            noteRequired={noteRequired}
            noteValue={note}
            onNoteChange={setNote}
            isSubmitting={isSubmitting}
            onConfirm={() => {
              setConfirmed(true);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    it('3.1 opens dialog, traps focus with Tab and Shift+Tab cycles', async () => {
      render(<DialogHarness />);

      const triggerBtn = screen.getByRole('button', { name: 'Buka Dialog' });
      fireEvent.click(triggerBtn);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      // Focusable elements inside dialog: Close ('Tutup dialog'), Cancel ('Batal'), Confirm ('Lanjutkan Tindakan')
      const closeBtn = screen.getByRole('button', { name: 'Tutup dialog' });
      const cancelBtn = screen.getByRole('button', { name: 'Batal' });
      const confirmBtn = screen.getByRole('button', { name: 'Lanjutkan Tindakan' });

      // Tab on last element (confirmBtn) wraps to first (closeBtn)
      confirmBtn.focus();
      expect(document.activeElement).toBe(confirmBtn);

      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(closeBtn);

      // Shift+Tab on first element (closeBtn) wraps to last (confirmBtn)
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(confirmBtn);
    });

    it('3.2 dismisses dialog on Escape key and returns focus to trigger button', async () => {
      render(<DialogHarness />);

      const triggerBtn = screen.getByRole('button', { name: 'Buka Dialog' });
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      fireEvent.click(triggerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Dialog should be closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Focus restored to trigger button
      expect(document.activeElement).toBe(triggerBtn);
    });

    it('3.3 prevents Escape key dismissal while isSubmitting is true', () => {
      render(<DialogHarness isSubmitting={true} />);

      const triggerBtn = screen.getByRole('button', { name: 'Buka Dialog' });
      fireEvent.click(triggerBtn);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Press Escape while submitting
      fireEvent.keyDown(document, { key: 'Escape' });

      // Dialog remains open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('3.4 enforces confirmation phrase and required note before enabling submit', () => {
      render(
        <DialogHarness
          requiresConfirmationPhrase={true}
          confirmationPhrase="KIRIM_PPD"
          noteRequired={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Buka Dialog' }));

      const confirmBtn = screen.getByRole('button', { name: 'Lanjutkan Tindakan' });
      expect(confirmBtn).toBeDisabled();

      // Enter required note only
      const noteInput = screen.getByRole('textbox', { name: /Alasan Tindakan/i });
      fireEvent.change(noteInput, { target: { value: 'Catatan pengajuan resmi' } });
      expect(confirmBtn).toBeDisabled();

      // Enter wrong phrase
      const phraseInput = screen.getByPlaceholderText('KIRIM_PPD');
      fireEvent.change(phraseInput, { target: { value: 'SALAH' } });
      expect(confirmBtn).toBeDisabled();

      // Enter exact confirmation phrase
      fireEvent.change(phraseInput, { target: { value: 'KIRIM_PPD' } });
      expect(confirmBtn).toBeEnabled();

      // Click confirm
      fireEvent.click(confirmBtn);
      expect(screen.getByTestId('confirmed-marker')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
