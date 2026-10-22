import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type {
  CurrentUser,
  MpzisDraft,
  P0MustahikProfile,
} from '@/lib/api/penyaluran-p0-types';
import {
  MpzisForm,
  buildMpzisDraftPayload,
  extractInitialMpzisData,
  validateMpzisSubmit,
} from './MpzisForm';
import {
  MpzisApprovalStepper,
  checkRoleSegregation,
  normalizeMpzisSteps,
} from './MpzisApprovalStepper';

vi.mock('@/lib/api/client', () => ({
  api: {
    getMpzis: vi.fn(),
    createMpzisDraft: vi.fn(),
    saveMpzisDraft: vi.fn(),
    submitMpzis: vi.fn(),
    decideMpzisStep: vi.fn(),
  },
}));

function createMockDraft(overrides: Partial<MpzisDraft> = {}): MpzisDraft {
  return {
    id: 101,
    mustahik_id: 55,
    revision: 1,
    status: 'draft',
    form_number: 'BPP-06/2026/09/001',
    mpzis_date: '2026-09-20',
    program_classification: 'BAZNAS Peduli - Modal Usaha',
    purpose: 'Bantuan modal usaha warung sembako mustahik',
    asnaf: 'Miskin',
    fund_source: 'Zakat',
    recipient_name: 'Siti Aminah',
    recipient_type: 'Individu',
    beneficiary_count: 3,
    total_amount: 3500000,
    recipient_section_confirmed: true,
    fund_source_confirmed: true,
    created_by_id: 10,
    submitted_by_id: 20,
    address_snapshot: {
      address: 'Jl. Melati No. 12',
      rt_rw: '002/005',
      kelurahan: 'Cipondoh',
      kecamatan: 'Cipondoh',
      kabupaten_kota: 'Kota Tangerang',
      province: 'Banten',
    },
    marital_status_snapshot: 'Menikah',
    ...overrides,
  };
}

function createMockMustahikProfile(
  overrides: Partial<P0MustahikProfile> = {}
): P0MustahikProfile {
  return {
    id: 55,
    nama: 'Siti Aminah',
    name: 'Siti Aminah',
    nik_masked: '367101******0001',
    phone_masked: '0812****7890',
    applicant_status: 'Kepala Keluarga',
    kategori: 'Perorangan',
    asnaf: 'Miskin',
    program: 'BAZNAS Peduli',
    address: 'Jl. Melati No. 12',
    rt_rw: '002/005',
    kelurahan: 'Cipondoh',
    kecamatan: 'Cipondoh',
    kabupaten_kota: 'Kota Tangerang',
    province: 'Banten',
    ...overrides,
  };
}

describe('MPZIS Workflow & 5-Step Approval Stepper (Task 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. MPZIS Form: F-BPP/06 Rendering & Structure
  // =========================================================================
  describe('1. MpzisForm: F-BPP/06 Rendering & Structure', () => {
    it('renders F-BPP/06 title, badges, and all form sections', () => {
      render(<MpzisForm mustahikId={55} />);

      expect(
        screen.getByRole('heading', {
          name: /Formulir MPZIS F-BPP\/06 \(Persetujuan Bantuan\)/i,
        })
      ).toBeInTheDocument();
      expect(screen.getByText('F-BPP/06')).toBeInTheDocument();
      expect(screen.getByText('v2026-09-13')).toBeInTheDocument();

      // 3 Main Sections
      expect(
        screen.getByText(/1\. Data Formulir & Klasifikasi Program/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/2\. Penerima Manfaat & Alokasi Dana/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/3\. Snapshot Kependudukan Mustahik \(Terkunci\)/i)
      ).toBeInTheDocument();
    });

    it('populates fields correctly from initialDraft and mustahikProfile', () => {
      const mockDraft = createMockDraft();
      const mockProfile = createMockMustahikProfile();

      render(
        <MpzisForm
          mustahikId={55}
          initialDraft={mockDraft}
          mustahikProfile={mockProfile}
        />
      );

      // Section 1 fields
      expect(screen.getByLabelText(/Nomor Formulir \(F-BPP\/06\)/i)).toHaveValue(
        'BPP-06/2026/09/001'
      );
      expect(screen.getByLabelText(/Tanggal Formulir MPZIS/i)).toHaveValue(
        '2026-09-20'
      );
      expect(screen.getByLabelText(/Klasifikasi Program/i)).toHaveValue(
        'BAZNAS Peduli - Modal Usaha'
      );
      expect(screen.getByLabelText(/Tujuan Penyaluran \/ Distribusi/i)).toHaveValue(
        'Bantuan modal usaha warung sembako mustahik'
      );
      expect(screen.getByLabelText(/Kategori Asnaf/i)).toHaveValue('Miskin');
      expect(screen.getByRole('combobox', { name: /^Sumber Dana/i })).toHaveValue(
        'Zakat'
      );
      expect(
        screen.getByRole('checkbox', { name: /Konfirmasi Sumber Dana/i })
      ).toBeChecked();

      // Section 2 fields
      expect(screen.getByLabelText(/Nama Penerima Manfaat/i)).toHaveValue(
        'Siti Aminah'
      );
      expect(screen.getByLabelText(/Jenis Penerima/i)).toHaveValue('Individu');
      expect(screen.getByLabelText(/Jumlah Jiwa Penerima/i)).toHaveValue(3);
      expect(
        screen.getByRole('checkbox', {
          name: /Konfirmasi Kelayakan Penerima Manfaat/i,
        })
      ).toBeChecked();

      // Section 3: Read-only Address Snapshot
      expect(screen.getByText('Jl. Melati No. 12')).toBeInTheDocument();
      expect(screen.getByText('002/005')).toBeInTheDocument();
      expect(screen.getAllByText('Cipondoh').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Kota Tangerang, Banten')).toBeInTheDocument();
      expect(screen.getByText('Menikah')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. MPZIS Form: Client Validation & FieldErrorSummary
  // =========================================================================
  describe('2. MpzisForm: Validation & Confirmations', () => {
    it('displays FieldErrorSummary when submitting an incomplete form', async () => {
      // Empty draft with no fields filled
      render(<MpzisForm mustahikId={55} />);

      const submitBtn = screen.getByRole('button', {
        name: /Kirim MPZIS \(F-BPP\/06\)/i,
      });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/kesalahan pengisian formulir/i)
        ).toBeInTheDocument();
      });

      const errorSummary = document.getElementById('form-error-summary')!;
      expect(errorSummary).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Nomor formulir MPZIS \(F-BPP\/06\) wajib diisi/i)
      ).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Tujuan penyaluran \/ distribusi wajib diisi/i)
      ).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Kategori asnaf wajib dipilih/i)
      ).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Konfirmasi kesesuaian alokasi sumber dana syariah wajib dicentang/i)
      ).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Konfirmasi keabsahan data penerima manfaat wajib dicentang/i)
      ).toBeInTheDocument();
      expect(
        within(errorSummary).getByText(/Jumlah dana MPZIS wajib diisi dan harus lebih dari Rp 0/i)
      ).toBeInTheDocument();
    });

    it('requires both confirmation checkboxes to pass validation', () => {
      const data = extractInitialMpzisData(createMockDraft());
      // Uncheck confirmations
      data.fund_source_confirmed = false;
      data.recipient_section_confirmed = false;

      const errors = validateMpzisSubmit(data);
      expect(errors.fund_source_confirmed).toBeDefined();
      expect(errors.recipient_section_confirmed).toBeDefined();

      // Check confirmations
      data.fund_source_confirmed = true;
      data.recipient_section_confirmed = true;
      const cleanErrors = validateMpzisSubmit(data);
      expect(cleanErrors.fund_source_confirmed).toBeUndefined();
      expect(cleanErrors.recipient_section_confirmed).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. MPZIS Form: Draft Saving (Autosave & Manual)
  // =========================================================================
  describe('3. MpzisForm: Autosave & Manual Save', () => {
    it('triggers debounced autosave via api.saveMpzisDraft on form modification', async () => {
      vi.useFakeTimers();
      const mockDraft = createMockDraft({ id: 101 });
      vi.mocked(api.saveMpzisDraft).mockResolvedValueOnce({
        success: true,
        data: { ...mockDraft, purpose: 'Tujuan terupdate' },
      });

      const handleSaved = vi.fn();

      render(
        <MpzisForm
          mustahikId={55}
          initialDraft={mockDraft}
          onSaved={handleSaved}
        />
      );

      const purposeInput = screen.getByLabelText(
        /Tujuan Penyaluran \/ Distribusi/i
      );
      fireEvent.change(purposeInput, {
        target: { value: 'Tujuan baru yang dimodifikasi' },
      });

      // Before 800ms: not yet saved
      expect(api.saveMpzisDraft).not.toHaveBeenCalled();

      // Fast-forward debounce timer (800ms)
      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(api.saveMpzisDraft).toHaveBeenCalledTimes(1);
      expect(api.saveMpzisDraft).toHaveBeenCalledWith(
        55,
        101,
        expect.objectContaining({
          purpose: 'Tujuan baru yang dimodifikasi',
        })
      );
      expect(handleSaved).toHaveBeenCalledTimes(1);
    });

    it('triggers manual save on clicking Simpan Draft button', async () => {
      const mockDraft = createMockDraft({ id: 101 });
      vi.mocked(api.saveMpzisDraft).mockResolvedValueOnce({
        success: true,
        data: mockDraft,
      });

      render(<MpzisForm mustahikId={55} initialDraft={mockDraft} />);

      const saveBtn = screen.getByRole('button', { name: /Simpan Draft/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(api.saveMpzisDraft).toHaveBeenCalledWith(
          55,
          101,
          expect.objectContaining({
            form_number: 'BPP-06/2026/09/001',
          })
        );
      });
    });
  });

  // =========================================================================
  // 4. MPZIS Form: Submission with Confirmation Dialog
  // =========================================================================
  describe('4. MpzisForm: Submission & Confirmation Dialog', () => {
    it('opens confirmation dialog on valid submit and invokes api.submitMpzis', async () => {
      const mockDraft = createMockDraft({ id: 101 });
      const handleSubmitted = vi.fn();

      vi.mocked(api.submitMpzis).mockResolvedValueOnce({
        success: true,
        data: { ...mockDraft, status: 'submitted' },
      });

      render(
        <MpzisForm
          mustahikId={55}
          initialDraft={mockDraft}
          onSubmitted={handleSubmitted}
        />
      );

      // Click submit button
      const submitBtn = screen.getByRole('button', {
        name: /Kirim MPZIS \(F-BPP\/06\)/i,
      });
      fireEvent.click(submitBtn);

      // Verify confirmation dialog opens
      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: /Konfirmasi Pengajuan MPZIS \(F-BPP\/06\)/i,
          })
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Siti Aminah')).toBeInTheDocument();

      // Confirm in dialog
      const confirmBtn = screen.getByRole('button', {
        name: /Kirim Formulir MPZIS/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.submitMpzis).toHaveBeenCalledWith(
          55,
          101,
          expect.objectContaining({
            form_number: 'BPP-06/2026/09/001',
          })
        );
        expect(handleSubmitted).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // 5. MpzisApprovalStepper: 5 Sequential Steps Rendering
  // =========================================================================
  describe('5. MpzisApprovalStepper: 5 Sequential Steps Rendering', () => {
    it('renders all 5 sequential steps in exact order', () => {
      const mockMpzis = createMockDraft({
        status: 'submitted',
      });

      render(<MpzisApprovalStepper mustahikId={55} mpzis={mockMpzis} />);

      expect(
        screen.getByRole('heading', {
          name: /Persetujuan Berjenjang MPZIS \(5 Tingkat\)/i,
        })
      ).toBeInTheDocument();

      // Verify all 5 steps exist
      expect(screen.getByRole('heading', { name: 'Diajukan' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Diperiksa' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Verifikator Ashnaf' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Penanggungjawab Penyaluran' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Disetujui' })).toBeInTheDocument();

      // Verify role levels
      expect(screen.getByText('Staff Penyaluran')).toBeInTheDocument();
      expect(screen.getByText('Kasie / Staff Penyaluran')).toBeInTheDocument();
      expect(screen.getByText('Verifikator Ashnaf (Staff Penyaluran)')).toBeInTheDocument();
      expect(screen.getByText('Kabid / Leader')).toBeInTheDocument();
      expect(screen.getByText('Waka II / Leader')).toBeInTheDocument();
    });

    it('renders completed step approver details (actor name, timestamp, hash)', () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'examined',
        approvals: [
          {
            id: 1,
            artifact_type: 'mpzis',
            artifact_id: 101,
            artifact_revision: 1,
            approval_step: 'proposed',
            action: 'approve',
            actor_id: 11,
            actor_name: 'Budi Santoso',
            actor_role: 'penyaluran',
            created_at: '2026-09-20T10:00:00.000Z',
            snapshot_hash: '12345678abcdef',
            note: 'Diusulkan sesuai asesmen',
          },
          {
            id: 2,
            artifact_type: 'mpzis',
            artifact_id: 101,
            artifact_revision: 1,
            approval_step: 'examined',
            action: 'approve',
            actor_id: 12,
            actor_name: 'Hendro Kasie',
            actor_role: 'penyaluran',
            created_at: '2026-09-20T11:00:00.000Z',
            snapshot_hash: 'abcdef12345678',
            note: 'Berkas dan RAB telah diverifikasi',
          },
        ],
      };

      render(<MpzisApprovalStepper mustahikId={55} mpzis={mockMpzis} />);

      expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
      expect(screen.getByText('Hendro Kasie')).toBeInTheDocument();
      expect(screen.getByText('#12345678')).toBeInTheDocument();
      expect(screen.getByText('#abcdef12')).toBeInTheDocument();
      expect(screen.getByText(/Diusulkan sesuai asesmen/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. MpzisApprovalStepper: Role Segregation Enforcement
  // =========================================================================
  describe('6. MpzisApprovalStepper: Role Segregation Enforcement', () => {
    it('disallows staff user from approving leader steps (responsible_acknowledged / approved)', () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'ashnaf_verified', // Active step is step 4: responsible_acknowledged (Leader required)
        approvals: [
          { id: 1, artifact_type: 'mpzis', artifact_id: 101, artifact_revision: 1, approval_step: 'proposed', action: 'approve', actor_id: 31 },
          { id: 2, artifact_type: 'mpzis', artifact_id: 101, artifact_revision: 1, approval_step: 'examined', action: 'approve', actor_id: 32 },
          { id: 3, artifact_type: 'mpzis', artifact_id: 101, artifact_revision: 1, approval_step: 'ashnaf_verified', action: 'approve', actor_id: 33 },
        ],
      };

      // Current user is a staff member
      const staffUser: CurrentUser = {
        id: 40,
        name: 'Staff Joni',
        email: 'joni@baznas.go.id',
        role: 'penyaluran',
        level: 'staff',
      };

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={staffUser}
        />
      );

      // Should display unauthorized notice
      expect(
        screen.getByText(
          /Tahap ini \(Kabid \/ Leader\) membutuhkan peran Pimpinan \/ Kabid Penyaluran/i
        )
      ).toBeInTheDocument();

      // Approve button should be disabled
      const approveBtn = screen.getByRole('button', { name: /Setujui/i });
      expect(approveBtn).toBeDisabled();
    });

    it('disallows leader user from approving staff steps (proposed / examined / ashnaf_verified)', () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'submitted', // Active step is step 1: proposed (Staff required)
      };

      const leaderUser: CurrentUser = {
        id: 50,
        name: 'Kabid Ahmad',
        email: 'ahmad@baznas.go.id',
        role: 'penyaluran',
        level: 'leader',
      };

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={leaderUser}
        />
      );

      expect(
        screen.getByText(
          /Tahap ini \(Staff Penyaluran\) membutuhkan peran Staf Penyaluran/i
        )
      ).toBeInTheDocument();

      const approveBtn = screen.getByRole('button', { name: /Setujui/i });
      expect(approveBtn).toBeDisabled();
    });

    it('disallows the same user who approved a prior step from approving subsequent steps', () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'proposed', // Active step is step 2: examined
        approvals: [
          {
            id: 1,
            artifact_type: 'mpzis',
            artifact_id: 101,
            artifact_revision: 1,
            approval_step: 'proposed',
            action: 'approve',
            actor_id: 77, // User 77 approved step 1
            actor_name: 'Staf Budi',
          },
        ],
      };

      // Current user is User 77 trying to approve step 2
      const duplicateUser: CurrentUser = {
        id: 77,
        name: 'Staf Budi',
        email: 'budi@baznas.go.id',
        role: 'penyaluran',
        level: 'staff',
      };

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={duplicateUser}
        />
      );

      expect(
        screen.getByText(
          /User yang sama tidak dapat menyetujui tahap berikutnya \(pemisahan peran aktor\)/i
        )
      ).toBeInTheDocument();

      const approveBtn = screen.getByRole('button', { name: /Setujui/i });
      expect(approveBtn).toBeDisabled();
    });

    it('disallows non-penyaluran division users from approving', () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'submitted',
      };

      const financeUser: CurrentUser = {
        id: 88,
        name: 'Keuangan Siti',
        email: 'siti@baznas.go.id',
        role: 'keuangan',
        level: 'staff',
      };

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={financeUser}
        />
      );

      expect(
        screen.getByText(
          /Hanya divisi Penyaluran yang berwenang menyetujui tahapan MPZIS/i
        )
      ).toBeInTheDocument();

      const approveBtn = screen.getByRole('button', { name: /Setujui/i });
      expect(approveBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // 7. MpzisApprovalStepper: Approve and Return Step Decisions
  // =========================================================================
  describe('7. MpzisApprovalStepper: Decision Actions', () => {
    it('allows authorized user to approve active step and invokes api.decideMpzisStep', async () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'submitted',
      };

      const authorizedStaff: CurrentUser = {
        id: 99,
        name: 'Staff Baru',
        email: 'baru@baznas.go.id',
        role: 'penyaluran',
        level: 'staff',
      };

      const handleDecided = vi.fn();
      const handleRefresh = vi.fn();

      vi.mocked(api.decideMpzisStep).mockResolvedValueOnce({
        success: true,
        data: { ...mockMpzis, status: 'proposed' },
      });

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={authorizedStaff}
          onStepDecided={handleDecided}
          onRefresh={handleRefresh}
        />
      );

      expect(screen.getByText('Wewenang Terverifikasi')).toBeInTheDocument();

      // Click Setujui button
      const approveBtn = screen.getByRole('button', { name: /Setujui/i });
      expect(approveBtn).not.toBeDisabled();
      fireEvent.click(approveBtn);

      // Verify dialog
      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: /Persetujuan MPZIS: 1\. Diajukan \(Staff Penyaluran\)/i,
          })
        ).toBeInTheDocument();
      });

      // Confirm in dialog
      const confirmBtn = screen.getByRole('button', {
        name: /Konfirmasi Setujui/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.decideMpzisStep).toHaveBeenCalledWith(
          55,
          101,
          'proposed',
          expect.objectContaining({
            action: 'approve',
          })
        );
        expect(handleDecided).toHaveBeenCalledTimes(1);
        expect(handleRefresh).toHaveBeenCalledTimes(1);
      });
    });

    it('requires note when returning MPZIS and invokes api.decideMpzisStep with action return', async () => {
      const mockMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'submitted',
      };

      const authorizedStaff: CurrentUser = {
        id: 99,
        name: 'Staff Baru',
        email: 'baru@baznas.go.id',
        role: 'penyaluran',
        level: 'staff',
      };

      const handleDecided = vi.fn();

      vi.mocked(api.decideMpzisStep).mockResolvedValueOnce({
        success: true,
        data: { ...mockMpzis, status: 'returned' },
      });

      render(
        <MpzisApprovalStepper
          mustahikId={55}
          mpzis={mockMpzis}
          currentUser={authorizedStaff}
          onStepDecided={handleDecided}
        />
      );

      const returnBtn = screen.getByRole('button', { name: /Kembalikan/i });
      fireEvent.click(returnBtn);

      // Verify dialog opens
      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            name: /Kembalikan Berkas MPZIS: Diajukan/i,
          })
        ).toBeInTheDocument();
      });

      // Confirm button should be disabled when note is empty
      const confirmReturnBtn = screen.getByRole('button', {
        name: /Kembalikan Berkas/i,
      });
      expect(confirmReturnBtn).toBeDisabled();

      // Type return note and confirm
      const noteInput = screen.getByPlaceholderText(
        /Jelaskan poin-poin yang perlu diperbaiki/i
      );
      fireEvent.change(noteInput, {
        target: { value: 'Nominal bantuan perlu ditinjau ulang' },
      });

      expect(confirmReturnBtn).not.toBeDisabled();
      fireEvent.click(confirmReturnBtn);

      await waitFor(() => {
        expect(api.decideMpzisStep).toHaveBeenCalledWith(
          55,
          101,
          'proposed',
          expect.objectContaining({
            action: 'return',
            note: 'Nominal bantuan perlu ditinjau ulang',
          })
        );
        expect(handleDecided).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // 8. MpzisApprovalStepper: All Steps Completed
  // =========================================================================
  describe('8. MpzisApprovalStepper: All Completed State', () => {
    it('displays full completion banner when MPZIS status is approved', () => {
      const completedMpzis: MpzisDraft = {
        ...createMockDraft(),
        status: 'approved',
      };

      render(<MpzisApprovalStepper mustahikId={55} mpzis={completedMpzis} />);

      expect(
        screen.getByText(
          /Persetujuan Berjenjang MPZIS Lengkap \(5\/5 Tingkat Disetujui\)/i
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/✓ Selesai Disetujui/i)).toBeInTheDocument();
    });
  });
});
