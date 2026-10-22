import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FieldErrorSummary } from './shared/FieldErrorSummary';
import { IrreversibleActionDialog } from './shared/IrreversibleActionDialog';
import { ArtifactStatusBanner } from './shared/ArtifactStatusBanner';
import { AssessmentForm } from './assessment/AssessmentForm';

describe('P0 Accessibility and Keyboard Regression Suite (Task 19 Step 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FieldErrorSummary Accessibility & Focus Navigation', () => {
    it('renders with role="alert", aria-live="polite", and autofocuses on error summary', () => {
      render(
        <div>
          <FieldErrorSummary
            errors={[
              { field: 'husband_name', message: 'Nama suami wajib diisi' },
              { field: 'monthly_rent_amount', message: 'Nominal sewa harus valid' },
            ]}
          />
          <input id="husband_name" name="husband_name" aria-label="Nama Suami" />
          <input id="monthly_rent_amount" name="monthly_rent_amount" aria-label="Sewa Bulanan" />
        </div>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('aria-live', 'polite');
      expect(document.activeElement).toBe(alert);

      // Links inside error summary navigate focus to target field on click
      const husbandLink = screen.getByRole('link', { name: /Nama suami wajib diisi/i });
      expect(husbandLink).toBeInTheDocument();
      expect(husbandLink.className).toContain('min-h-[44px]');
      fireEvent.click(husbandLink);
      expect(document.activeElement?.id).toBe('husband_name');
    });

    it('returns null when errors object is empty or null', () => {
      const { container } = render(<FieldErrorSummary errors={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('IrreversibleActionDialog Escape Handling & Focus Restoration', () => {
    it('handles Escape key to close and restores focus to previous active element on close', async () => {
      const button = document.createElement('button');
      button.textContent = 'Buka Dialog';
      document.body.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);

      const handleClose = vi.fn();
      const { rerender } = render(
        <IrreversibleActionDialog
          isOpen={true}
          title="Konfirmasi Tindakan"
          description="Apakah Anda yakin ingin menyetujui?"
          actionLabel="Setujui"
          onConfirm={vi.fn()}
          onClose={handleClose}
        />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      // Press Escape key on document triggers onClose
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Unmount / close dialog restores focus
      rerender(
        <IrreversibleActionDialog
          isOpen={false}
          title="Konfirmasi Tindakan"
          description="Apakah Anda yakin ingin menyetujui?"
          actionLabel="Setujui"
          onConfirm={vi.fn()}
          onClose={handleClose}
        />
      );

      expect(document.activeElement).toBe(button);
      document.body.removeChild(button);
    });

    it('requires confirmation phrase before submit button is enabled if configured', () => {
      const handleConfirm = vi.fn();
      render(
        <IrreversibleActionDialog
          isOpen={true}
          title="Setujui Rekomendasi"
          description="Persetujuan bersifat permanen."
          actionLabel="Konfirmasi"
          requiresConfirmationPhrase={true}
          confirmationPhrase="SETUJU"
          onConfirm={handleConfirm}
          onClose={vi.fn()}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: 'Konfirmasi' });
      expect(confirmBtn).toBeDisabled();

      const phraseInput = screen.getByPlaceholderText('SETUJU');
      fireEvent.change(phraseInput, { target: { value: 'SETUJU' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('verifies action buttons meet 44px min touch target classes', () => {
      render(
        <IrreversibleActionDialog
          isOpen={true}
          title="Uji Target Sentuh"
          description="Memastikan tombol memiliki target sentuh memadai"
          actionLabel="Lanjutkan"
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Lanjutkan' });
      expect(actionButton.className).toContain('min-h-[44px]');

      const cancelButton = screen.getByRole('button', { name: 'Batal' });
      expect(cancelButton.className).toContain('min-h-[44px]');
    });
  });

  describe('AssessmentForm Semantics and Accessible Form Controls', () => {
    it('AssessmentForm has accessible sections, headings, and labeled form inputs', () => {
      render(
        <AssessmentForm
          mustahikId={1}
          assessment={null}
          canEdit={true}
          onSaved={vi.fn()}
          onSubmitSuccess={vi.fn()}
        />
      );

      // Verify presence of accessible sections
      const sections = document.querySelectorAll('section');
      expect(sections.length).toBeGreaterThan(0);

      // Verify sections have aria-labelledby matching heading ids
      for (const sec of sections) {
        const labelledBy = sec.getAttribute('aria-labelledby');
        if (labelledBy) {
          const heading = document.getElementById(labelledBy);
          expect(heading).toBeInTheDocument();
        }
      }

      // Inputs have accessible labels
      expect(screen.getByLabelText(/Alamat Domisili/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Jumlah Anak/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Permohonan Bantuan/i)).toBeInTheDocument();

      // Radio button labels have min-h-[44px] touch target class
      const radioLabels = document.querySelectorAll('label.inline-flex');
      expect(radioLabels.length).toBeGreaterThan(0);
      for (const rLabel of radioLabels) {
        expect(rLabel.className).toContain('min-h-[44px]');
      }
    });
  });

  describe('ArtifactStatusBanner and Live Announcements', () => {
    it('renders status alert for info/success and alert for error/legacy', () => {
      const { rerender } = render(
        <ArtifactStatusBanner
          title="Status Draft"
          message="Dokumen sedang disunting oleh petugas lapangan."
          variant="info"
        />
      );

      const infoBanner = screen.getByRole('status');
      expect(infoBanner).toBeInTheDocument();
      expect(screen.getByText('Status Draft')).toBeInTheDocument();

      rerender(
        <ArtifactStatusBanner
          title="Status Ditolak"
          message="Dokumen ditolak karena tidak memenuhi syarat."
          variant="error"
        />
      );

      const errorBanner = screen.getByRole('alert');
      expect(errorBanner).toBeInTheDocument();
      expect(screen.getByText('Status Ditolak')).toBeInTheDocument();
    });
  });
});
