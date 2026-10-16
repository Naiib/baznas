import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type {
  AssessmentDraft,
  AssessmentSourceFields,
} from '@/lib/api/penyaluran-p0-types';
import { AssessmentForm, buildAssessmentDraftPayload } from './AssessmentForm';
import { AssessmentReviewPanel } from './AssessmentReviewPanel';

vi.mock('@/lib/api/client', () => ({
  api: {
    getAssessment: vi.fn(),
    createAssessmentDraft: vi.fn(),
    saveAssessmentDraft: vi.fn(),
    submitAssessment: vi.fn(),
    reviewAssessment: vi.fn(),
  },
}));

function createFullMockDraft(overrides: Partial<AssessmentDraft> = {}): AssessmentDraft {
  return {
    id: 101,
    mustahik_id: 55,
    revision: 1,
    status: 'draft',
    snapshot_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    created_by_id: 10,
    husband_in_household: true,
    husband_name: 'Ahmad Fauzi',
    wife_in_household: true,
    wife_name: 'Siti Aminah',
    child_count: 3,
    house_ownership: 'Kontrak',
    home_address: 'Jl. Melati No. 12, Cipondoh',
    address_matches_ktp: true,
    monthly_rent_amount: 750000,
    husband_occupation: 'Buruh Harian',
    husband_monthly_income: 1500000,
    wife_occupation: 'Penjahit',
    wife_monthly_income: 500000,
    child_occupation: 'Pelajar',
    child_monthly_support: 0,
    assistance_request: 'Bantuan biaya sewa rumah dan modal dagang',
    applied_to_baznas_before: true,
    previous_application_year: 2023,
    ...overrides,
  };
}

describe('AssessmentForm & Review Experience (Task 16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Form Rendering & Structure (Exact 18 Fields in 4 Sections)', () => {
    it('renders all 4 official sections and headings', () => {
      render(<AssessmentForm mustahikId={55} />);

      expect(
        screen.getByRole('heading', { name: 'Formulir Asesmen Lapangan (P0)' })
      ).toBeInTheDocument();
      expect(screen.getByText(/1\. Rumah Tangga \(5 Field\)/i)).toBeInTheDocument();
      expect(screen.getByText(/2\. Tempat Tinggal \(4 Field\)/i)).toBeInTheDocument();
      expect(screen.getByText(/3\. Penghidupan \(6 Field\)/i)).toBeInTheDocument();
      expect(screen.getByText(/4\. Riwayat Permohonan \(3 Field\)/i)).toBeInTheDocument();
    });

    it('renders all 18 source fields with correct labels and initial values', () => {
      const mockDraft = createFullMockDraft();
      render(<AssessmentForm mustahikId={55} initialDraft={mockDraft} />);

      // Seksi 1: Rumah Tangga (5)
      expect(screen.getByText('Suami Tinggal Serumah')).toBeInTheDocument();
      expect(screen.getByLabelText(/Nama Suami/i)).toHaveValue('Ahmad Fauzi');
      expect(screen.getByText('Istri Tinggal Serumah')).toBeInTheDocument();
      expect(screen.getByLabelText(/Nama Istri/i)).toHaveValue('Siti Aminah');
      expect(screen.getByLabelText(/Jumlah Anak/i)).toHaveValue(3);

      // Seksi 2: Tempat Tinggal (4)
      expect(screen.getByLabelText(/Status Kepemilikan Rumah/i)).toHaveValue('Kontrak');
      expect(screen.getByLabelText(/Alamat Domisili Tempat Tinggal/i)).toHaveValue(
        'Jl. Melati No. 12, Cipondoh'
      );
      expect(screen.getByText('Alamat Sesuai KTP')).toBeInTheDocument();
      expect(screen.getByLabelText(/Biaya Sewa \/ Kontrak Bulanan/i)).toBeInTheDocument();

      // Seksi 3: Penghidupan (6)
      expect(screen.getByLabelText(/Pekerjaan Kepala Keluarga \/ Suami/i)).toHaveValue(
        'Buruh Harian'
      );
      expect(screen.getByLabelText(/Penghasilan Bulanan Suami/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pekerjaan Istri/i)).toHaveValue('Penjahit');
      expect(screen.getByLabelText(/Penghasilan Bulanan Istri/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pekerjaan \/ Aktivitas Anak/i)).toHaveValue('Pelajar');
      expect(screen.getByLabelText(/Bantuan \/ Penghasilan Bulanan Anak/i)).toBeInTheDocument();

      // Seksi 4: Riwayat Permohonan (3)
      expect(
        screen.getByLabelText(/Permohonan Bantuan yang Diajukan/i)
      ).toHaveValue('Bantuan biaya sewa rumah dan modal dagang');
      expect(screen.getByText('Pernah Mengajukan ke BAZNAS Sebelumnya')).toBeInTheDocument();
      expect(screen.getByLabelText(/Tahun Pengajuan Sebelumnya/i)).toHaveValue(2023);
    });
  });

  describe('2. Null-Preserving & Zero Fabricated Defaults', () => {
    it('preserves null/missing values without fabricating scores or defaults', () => {
      const emptyDraft: AssessmentDraft = {
        id: 102,
        mustahik_id: 56,
        revision: 1,
        status: 'draft',
        husband_in_household: null,
        husband_name: null,
        wife_in_household: null,
        wife_name: null,
        child_count: null,
        house_ownership: null,
        home_address: null,
        address_matches_ktp: null,
        monthly_rent_amount: null,
        husband_occupation: null,
        husband_monthly_income: null,
        wife_occupation: null,
        wife_monthly_income: null,
        child_occupation: null,
        child_monthly_support: null,
        assistance_request: null,
        applied_to_baznas_before: null,
        previous_application_year: null,
      };

      render(<AssessmentForm mustahikId={56} initialDraft={emptyDraft} />);

      // Verify empty text inputs remain empty
      expect(screen.getByLabelText(/Nama Suami/i)).toHaveValue('');
      expect(screen.getByLabelText(/Nama Istri/i)).toHaveValue('');
      expect(screen.getByLabelText(/Status Kepemilikan Rumah/i)).toHaveValue('');
      expect(screen.getByLabelText(/Alamat Domisili Tempat Tinggal/i)).toHaveValue('');

      // Verify absence of fabricated scoring or completion metrics
      expect(screen.queryByText(/85\/100/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Kelayakan/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Had Kifayah/i)).not.toBeInTheDocument();

      // Test buildAssessmentDraftPayload preserves nulls
      const payload = buildAssessmentDraftPayload({
        husband_in_household: null,
        husband_name: '',
        wife_in_household: null,
        wife_name: '',
        child_count: '',
        house_ownership: '',
        home_address: '',
        address_matches_ktp: null,
        monthly_rent_amount: null,
        husband_occupation: '',
        husband_monthly_income: null,
        wife_occupation: '',
        wife_monthly_income: null,
        child_occupation: '',
        child_monthly_support: null,
        assistance_request: '',
        applied_to_baznas_before: null,
        previous_application_year: '',
      });

      expect(payload.husband_name).toBeNull();
      expect(payload.child_count).toBeNull();
      expect(payload.house_ownership).toBeNull();
      expect(payload.monthly_rent_amount).toBeNull();
      expect(payload.previous_application_year).toBeNull();
    });
  });

  describe('3. Dynamic Conditionals', () => {
    it('shows monthly_rent_amount only when house_ownership is Kontrak', () => {
      render(<AssessmentForm mustahikId={55} />);

      // Initially empty: rent input is NOT in the document
      expect(
        screen.queryByLabelText(/Biaya Sewa \/ Kontrak Bulanan/i)
      ).not.toBeInTheDocument();

      // Select 'Milik Sendiri': rent input is NOT in the document
      const ownershipSelect = screen.getByLabelText(/Status Kepemilikan Rumah/i);
      fireEvent.change(ownershipSelect, { target: { value: 'Milik Sendiri' } });
      expect(
        screen.queryByLabelText(/Biaya Sewa \/ Kontrak Bulanan/i)
      ).not.toBeInTheDocument();

      // Select 'Kontrak': rent input appears
      fireEvent.change(ownershipSelect, { target: { value: 'Kontrak' } });
      expect(
        screen.getByLabelText(/Biaya Sewa \/ Kontrak Bulanan/i)
      ).toBeInTheDocument();

      // Change back to 'Orang Tua (Menumpang)': rent input disappears
      fireEvent.change(ownershipSelect, { target: { value: 'Orang Tua (Menumpang)' } });
      expect(
        screen.queryByLabelText(/Biaya Sewa \/ Kontrak Bulanan/i)
      ).not.toBeInTheDocument();
    });

    it('shows previous_application_year only when applied_to_baznas_before is true', () => {
      render(<AssessmentForm mustahikId={55} />);

      // Initially null/empty: year input is NOT in the document
      expect(
        screen.queryByLabelText(/Tahun Pengajuan Sebelumnya/i)
      ).not.toBeInTheDocument();

      // Select 'Ya' (applied before)
      const yesRadio = screen.getByLabelText('Ya', {
        selector: '#applied_to_baznas_before-yes',
      });
      fireEvent.click(yesRadio);

      // Now year input appears
      expect(
        screen.getByLabelText(/Tahun Pengajuan Sebelumnya/i)
      ).toBeInTheDocument();

      // Select 'Tidak'
      const noRadio = screen.getByLabelText('Tidak', {
        selector: '#applied_to_baznas_before-no',
      });
      fireEvent.click(noRadio);

      // Year input disappears
      expect(
        screen.queryByLabelText(/Tahun Pengajuan Sebelumnya/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('4. Autosave Debounce (800ms) & Status Indicators', () => {
    it('debounces autosave by 800ms and shows Menyimpan and Tersimpan indicators', async () => {
      vi.useFakeTimers();

      const mockSavedDraft = createFullMockDraft({ id: 202 });
      vi.mocked(api.saveAssessmentDraft).mockResolvedValueOnce({
        success: true,
        data: mockSavedDraft,
      });

      render(
        <AssessmentForm
          mustahikId={55}
          initialDraft={createFullMockDraft({ id: 202 })}
        />
      );

      const husbandInput = screen.getByLabelText(/Nama Suami/i);
      fireEvent.change(husbandInput, { target: { value: 'Budi Hartono' } });

      // Before 800ms: api.saveAssessmentDraft should NOT have been called
      expect(api.saveAssessmentDraft).not.toHaveBeenCalled();

      // Fast-forward 799ms
      act(() => {
        vi.advanceTimersByTime(799);
      });
      expect(api.saveAssessmentDraft).not.toHaveBeenCalled();

      // Advance to 800ms
      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(api.saveAssessmentDraft).toHaveBeenCalledTimes(1);
      expect(api.saveAssessmentDraft).toHaveBeenCalledWith(
        55,
        202,
        expect.objectContaining({ husband_name: 'Budi Hartono' })
      );

      // Visual indicator should reflect 'Tersimpan'
      expect(screen.getByText('Tersimpan')).toBeInTheDocument();
    });

    it('shows Gagal disimpan indicator when autosave fails', async () => {
      vi.useFakeTimers();

      vi.mocked(api.saveAssessmentDraft).mockRejectedValueOnce(
        new Error('Koneksi terputus')
      );

      render(
        <AssessmentForm
          mustahikId={55}
          initialDraft={createFullMockDraft({ id: 202 })}
        />
      );

      const wifeInput = screen.getByLabelText(/Nama Istri/i);
      fireEvent.change(wifeInput, { target: { value: 'Nurul Hidayah' } });

      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(screen.getByText('Gagal disimpan')).toBeInTheDocument();
    });
  });

  describe('5. Validation & FieldErrorSummary', () => {
    it('displays FieldErrorSummary with anchor links when required fields are missing', async () => {
      render(<AssessmentForm mustahikId={55} />);

      const submitButton = screen.getByRole('button', { name: /ajukan asesmen/i });
      fireEvent.click(submitButton);

      // FieldErrorSummary should be displayed with id="form-error-summary"
      const errorSummary = document.getElementById('form-error-summary');
      expect(errorSummary).toBeInTheDocument();
      expect(errorSummary).toHaveTextContent(/kesalahan pengisian formulir/i);

      // Error messages for mandatory fields inside summary
      expect(within(errorSummary!).getByRole('link', { name: 'Permohonan bantuan wajib diisi.' })).toHaveAttribute('href', '#assistance_request');
      expect(within(errorSummary!).getByRole('link', { name: 'Status kepemilikan rumah wajib dipilih.' })).toHaveAttribute('href', '#house_ownership');

      // API submit should not be called
      expect(api.submitAssessment).not.toHaveBeenCalled();
    });

    it('validates conditional rent amount when Kontrak is selected', async () => {
      render(
        <AssessmentForm
          mustahikId={55}
          initialDraft={{
            id: 1,
            assistance_request: 'Permohonan modal',
            house_ownership: 'Kontrak',
            monthly_rent_amount: null,
          }}
        />
      );

      const submitButton = screen.getByRole('button', { name: /ajukan asesmen/i });
      fireEvent.click(submitButton);

      expect(
        screen.getAllByText('Biaya sewa bulanan wajib diisi untuk status kepemilikan Kontrak.').length
      ).toBeGreaterThanOrEqual(1);
      expect(api.submitAssessment).not.toHaveBeenCalled();
    });
  });

  describe('6. Submission Flow', () => {
    it('submits form via api.submitAssessment after confirming dialog', async () => {
      const mockDraft = createFullMockDraft({ id: 101 });
      const submittedDraft = { ...mockDraft, status: 'submitted' as const };
      vi.mocked(api.submitAssessment).mockResolvedValueOnce({
        success: true,
        data: submittedDraft,
      });

      const handleSubmitted = vi.fn();
      render(
        <AssessmentForm
          mustahikId={55}
          initialDraft={mockDraft}
          onSubmitted={handleSubmitted}
        />
      );

      // Click submit button
      const submitButton = screen.getByRole('button', { name: /ajukan asesmen/i });
      fireEvent.click(submitButton);

      // Confirmation dialog should appear
      expect(
        screen.getByRole('heading', { name: 'Konfirmasi Pengajuan Asesmen Lapangan' })
      ).toBeInTheDocument();

      // Confirm in dialog
      const confirmButton = screen.getByRole('button', { name: 'Ya, Ajukan Asesmen' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(api.submitAssessment).toHaveBeenCalledWith(
          55,
          101,
          expect.objectContaining({
            husband_name: 'Ahmad Fauzi',
            house_ownership: 'Kontrak',
            assistance_request: 'Bantuan biaya sewa rumah dan modal dagang',
          })
        );
        expect(handleSubmitted).toHaveBeenCalledWith(submittedDraft);
      });
    });
  });

  describe('7. AssessmentReviewPanel (18 Fields & displaySourceValue)', () => {
    it('renders all 18 fields formatted with displaySourceValue and snapshot hash banner', () => {
      const mockDraft = createFullMockDraft({
        status: 'submitted',
        revision: 2,
        snapshot_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      });

      render(
        <AssessmentReviewPanel
          mustahikId={55}
          assessment={mockDraft}
          currentUserId={99} // Not submitter
        />
      );

      // Header Banner
      expect(screen.getByText('Tinjauan Asesmen Lapangan (P0)')).toBeInTheDocument();
      expect(screen.getByText(/sha256:12345678\.\.\./i)).toBeInTheDocument();
      expect(screen.getByText('Revisi 2')).toBeInTheDocument();

      // 18 Fields formatted
      expect(screen.getByText('Ahmad Fauzi')).toBeInTheDocument();
      expect(screen.getByText('Siti Aminah')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Kontrak')).toBeInTheDocument();
      expect(screen.getByText('Jl. Melati No. 12, Cipondoh')).toBeInTheDocument();
      expect(screen.getByText('Buruh Harian')).toBeInTheDocument();
      expect(screen.getByText('Rp 1.500.000')).toBeInTheDocument();
      expect(screen.getByText('Penjahit')).toBeInTheDocument();
      expect(screen.getByText('Rp 500.000')).toBeInTheDocument();
      expect(screen.getByText('Pelajar')).toBeInTheDocument();
      expect(screen.getByText('Rp 0')).toBeInTheDocument();
      expect(
        screen.getByText('Bantuan biaya sewa rumah dan modal dagang')
      ).toBeInTheDocument();
      expect(screen.getByText('2023')).toBeInTheDocument();
    });

    it('renders Belum dicatat for unrecorded fields', () => {
      const sparseDraft: AssessmentDraft = {
        id: 105,
        status: 'submitted',
        revision: 1,
        created_by_id: 12,
        husband_name: null,
        wife_name: '',
        husband_occupation: null,
      };

      render(
        <AssessmentReviewPanel
          mustahikId={55}
          assessment={sparseDraft}
          currentUserId={99}
        />
      );

      const unrecordedBadges = screen.getAllByText('Belum dicatat');
      expect(unrecordedBadges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('8. Strict Role Segregation in AssessmentReviewPanel', () => {
    it('disables approve button and displays notice when submitter attempts to approve own submission', () => {
      const mockDraft = createFullMockDraft({
        status: 'submitted',
        created_by_id: 42, // Submitter is User 42
      });

      render(
        <AssessmentReviewPanel
          mustahikId={55}
          assessment={mockDraft}
          currentUserId={42} // Logged in user is also 42 (Submitter!)
        />
      );

      // Warning banner must be present
      const notice = screen.getByRole('alert');
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveTextContent(
        /Pemisahan Peran: Submitter Tidak Dapat Menyetujui Sendiri/i
      );

      // Approve button must be disabled
      const approveBtn = screen.getByRole('button', { name: /setujui asesmen/i });
      expect(approveBtn).toBeDisabled();
      expect(approveBtn).toHaveAttribute(
        'title',
        expect.stringMatching(/Submitter tidak dapat menyetujui pengajuannya sendiri/i)
      );
    });

    it('enables approve button when reviewer is a different user', async () => {
      const mockDraft = createFullMockDraft({
        status: 'submitted',
        created_by_id: 42, // Submitter is 42
      });

      vi.mocked(api.reviewAssessment).mockResolvedValueOnce({
        success: true,
        data: { ...mockDraft, status: 'accepted' },
      });

      const handleApproved = vi.fn();
      render(
        <AssessmentReviewPanel
          mustahikId={55}
          assessment={mockDraft}
          currentUserId={99} // Reviewer is 99 (Different user!)
          onApproved={handleApproved}
        />
      );

      // Notice should NOT be present
      expect(
        screen.queryByText(/Pemisahan Peran: Submitter Tidak Dapat Menyetujui Sendiri/i)
      ).not.toBeInTheDocument();

      // Approve button must be enabled
      const approveBtn = screen.getByRole('button', { name: /setujui asesmen/i });
      expect(approveBtn).toBeEnabled();

      // Click approve
      fireEvent.click(approveBtn);

      // Dialog opens
      expect(
        screen.getByRole('heading', { name: 'Persetujuan Asesmen Lapangan' })
      ).toBeInTheDocument();

      // Confirm dialog
      const dialog = screen.getByRole('dialog');
      const dialogConfirmBtn = within(dialog).getByRole('button', {
        name: 'Setujui Asesmen',
      });
      fireEvent.click(dialogConfirmBtn);

      await waitFor(() => {
        expect(api.reviewAssessment).toHaveBeenCalledWith(55, 101, {
          action: 'accept',
          note: undefined,
        });
        expect(handleApproved).toHaveBeenCalled();
      });
    });

    it('enforces required note when returning / rejecting assessment', async () => {
      const mockDraft = createFullMockDraft({
        status: 'submitted',
        created_by_id: 42,
      });

      vi.mocked(api.reviewAssessment).mockResolvedValueOnce({
        success: true,
        data: { ...mockDraft, status: 'returned' },
      });

      const handleReturned = vi.fn();
      render(
        <AssessmentReviewPanel
          mustahikId={55}
          assessment={mockDraft}
          currentUserId={99}
          onReturned={handleReturned}
        />
      );

      // Click return
      const returnBtn = screen.getByRole('button', { name: /kembalikan \/ tolak/i });
      fireEvent.click(returnBtn);

      // Dialog opens
      expect(
        screen.getByRole('heading', { name: 'Pengembalian Berkas Asesmen' })
      ).toBeInTheDocument();

      // Button is initially disabled because note is required in IrreversibleActionDialog
      const confirmReturnBtn = screen.getByRole('button', {
        name: 'Kembalikan Berkas',
      });
      expect(confirmReturnBtn).toBeDisabled();

      // Type note
      const noteInput = screen.getByPlaceholderText(
        /Tuliskan alasan pengembalian atau data yang perlu dikoreksi/i
      );
      fireEvent.change(noteInput, {
        target: { value: 'Alamat survei perlu diverifikasi ulang dengan RT setempat.' },
      });

      expect(confirmReturnBtn).toBeEnabled();
      fireEvent.click(confirmReturnBtn);

      await waitFor(() => {
        expect(api.reviewAssessment).toHaveBeenCalledWith(55, 101, {
          action: 'return',
          note: 'Alamat survei perlu diverifikasi ulang dengan RT setempat.',
        });
        expect(handleReturned).toHaveBeenCalled();
      });
    });
  });
});
