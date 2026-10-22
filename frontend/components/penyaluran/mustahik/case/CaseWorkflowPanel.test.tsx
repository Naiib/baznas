import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type { P0CaseWorkspace } from '@/lib/api/penyaluran-p0-types';
import {
  CaseWorkflowPanel,
  displaySourceValue,
} from './CaseWorkflowPanel';

vi.mock('@/lib/api/client', () => ({
  api: {
    downloadArtifact: vi.fn(),
    downloadCaseDocument: vi.fn(),
    downloadReceipt: vi.fn(),
    startLegacyReconciliation: vi.fn(),
    completeLegacyReconciliation: vi.fn(),
  },
}));

function createMockWorkspace(overrides: Partial<P0CaseWorkspace> = {}): P0CaseWorkspace {
  return {
    success: true,
    case: {
      id: 101,
      nomor_registrasi: 'REG-2026-00101',
      file_no: 'MST/2026/09/00101',
      status: 'Survey',
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
      ...overrides.case,
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
      ...overrides.mustahik,
    },
    case_progress: {
      current_stage: 'assessment',
      active_artifact: 'assessment',
      required_action: 'Lengkapi formulir asesmen lapangan',
      blocking_reasons: [],
      is_terminal: false,
      ...overrides.case_progress,
    },
    assessment: {
      id: 5,
      revision: 1,
      status: 'draft',
      snapshot_hash: 'abcdef1234567890abcdef1234567890',
      fields: {
        husband_in_household: true,
        husband_name: 'Ahmad',
        wife_in_household: true,
        wife_name: 'Siti',
        child_count: 2,
        house_ownership: 'Sewa',
        home_address: 'Jl. Merdeka No. 45',
        address_matches_ktp: true,
        monthly_rent_amount: 500000,
        husband_occupation: 'Buruh Harian',
        husband_monthly_income: 1200000,
        wife_occupation: 'Ibu Rumah Tangga',
        wife_monthly_income: 0,
        child_occupation: 'Pelajar',
        child_monthly_support: 0,
        assistance_request: 'Bantuan modal usaha warung',
        applied_to_baznas_before: false,
        previous_application_year: null,
        occupation: 'Buruh Harian',
        monthly_income: 1200000,
        monthly_expense: 1100000,
      },
      ...overrides.assessment,
    },
    mpzis_approvals: [
      {
        step_key: 'proposed',
        role: 'STAFF_PENYALURAN',
        user_id: 11,
        user_nama: 'Budi Santoso',
        status: 'APPROVED',
        decided_at: '2026-09-20T10:00:00.000Z',
        snapshot_hash: 'hash111111',
        note: 'Diusulkan sesuai kriteria',
      },
      {
        step_key: 'examined',
        role: 'KASIE_PENDISTRIBUSIAN',
        user_id: 12,
        user_nama: 'Hendro',
        status: 'PENDING',
        decided_at: null,
        snapshot_hash: null,
        note: null,
      },
    ],
    mpzis: {
      id: 12,
      revision: 1,
      status: 'review',
      form_number: 'MPZIS-2026-0012',
      total_amount: 2500000,
      snapshot_hash: 'mpzishash123456',
      approvals: [],
      ...overrides.mpzis,
    },
    ppd: {
      id: 20,
      revision: 1,
      status: 'draft',
      form_number: 'PPD-2026-0020',
      ppd_number: 'PPD/2026/09/0020',
      transaction_number: 'TRX-2026-999',
      total_rab: 2500000,
      amount: 2500000,
      amount_in_words: 'Dua juta lima ratus ribu rupiah',
      bank_name: 'BSI',
      bank_account_masked: '******7890',
      rab_lines: [
        {
          line_no: 1,
          deskripsi: 'Modal dagang sembako',
          jumlah: 1,
          harga_satuan: 2500000,
          total: 2500000,
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
      can_submit_ppd: false,
      can_disburse: false,
      can_archive: false,
      can_restore: false,
      ...overrides.permissions,
    },
    capabilities: {
      can_create_draft: true,
      ...overrides.capabilities,
    },
    timeline: [
      {
        id: 1,
        event_type: 'intake_registered',
        action: 'submit',
        actor: 'Admin Amil',
        actor_name: 'Admin Amil',
        actor_role: 'Amil Pendaftaran',
        actor_division: 'Penyaluran',
        timestamp: '2026-09-20T08:30:00.000Z',
        note: 'Pendaftaran berkas mustahik baru secara digital',
        created_at: '2026-09-20T08:30:00.000Z',
      },
    ],
    history: [],
    documents: [
      {
        id: 1001,
        mustahik_id: 101,
        kind: 'KTP',
        filename: 'ktp-siti-maryam.pdf',
        original_name: 'KTP Asli.pdf',
        mime_type: 'application/pdf',
        byte_size: 245000,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        created_at: '2026-09-20T08:35:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('displaySourceValue formatter', () => {
  it('returns Belum dicatat for null, undefined, or empty string', () => {
    expect(displaySourceValue(null)).toBe('Belum dicatat');
    expect(displaySourceValue(undefined)).toBe('Belum dicatat');
    expect(displaySourceValue('')).toBe('Belum dicatat');
    expect(displaySourceValue('   ')).toBe('Belum dicatat');
  });

  it('preserves numeric 0 and boolean false', () => {
    expect(displaySourceValue(0)).toBe('0');
    expect(displaySourceValue(false)).toBe('false');
  });

  it('preserves valid strings and numbers', () => {
    expect(displaySourceValue('Siti Maryam')).toBe('Siti Maryam');
    expect(displaySourceValue(12345)).toBe('12345');
    expect(displaySourceValue(true)).toBe('true');
  });
});

describe('CaseWorkflowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-file');
    window.URL.revokeObjectURL = vi.fn();
  });

  it('renders all 4 tabs with proper accessibility attributes', () => {
    const workspace = createMockWorkspace();
    render(<CaseWorkflowPanel workspace={workspace} />);

    const tablist = screen.getByRole('tablist', { name: 'Navigasi Alur Kasus Mustahik' });
    expect(tablist).toBeInTheDocument();

    const summaryTab = screen.getByRole('tab', { name: 'Ringkasan' });
    const processTab = screen.getByRole('tab', { name: 'Proses' });
    const documentsTab = screen.getByRole('tab', { name: 'Dokumen' });
    const historyTab = screen.getByRole('tab', { name: 'Riwayat' });

    expect(summaryTab).toHaveAttribute('aria-selected', 'true');
    expect(processTab).toHaveAttribute('aria-selected', 'false');
    expect(documentsTab).toHaveAttribute('aria-selected', 'false');
    expect(historyTab).toHaveAttribute('aria-selected', 'false');

    expect(screen.getByRole('tabpanel', { name: 'Ringkasan' })).toBeInTheDocument();
  });

  it('switches tabs on mouse click and updates aria-selected', () => {
    const workspace = createMockWorkspace();
    render(<CaseWorkflowPanel workspace={workspace} />);

    const processTab = screen.getByRole('tab', { name: 'Proses' });
    fireEvent.click(processTab);

    expect(processTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel', { name: 'Proses' })).toBeInTheDocument();

    const docsTab = screen.getByRole('tab', { name: 'Dokumen' });
    fireEvent.click(docsTab);
    expect(docsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Dokumen' })).toBeInTheDocument();

    const historyTab = screen.getByRole('tab', { name: 'Riwayat' });
    fireEvent.click(historyTab);
    expect(historyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Riwayat' })).toBeInTheDocument();
  });

  it('navigates tabs using keyboard arrow keys', () => {
    const workspace = createMockWorkspace();
    render(<CaseWorkflowPanel workspace={workspace} />);

    const summaryTab = screen.getByRole('tab', { name: 'Ringkasan' });
    summaryTab.focus();

    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Proses' })).toHaveAttribute('aria-selected', 'true');

    const processTab = screen.getByRole('tab', { name: 'Proses' });
    fireEvent.keyDown(processTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Dokumen' })).toHaveAttribute('aria-selected', 'true');

    const docsTab = screen.getByRole('tab', { name: 'Dokumen' });
    fireEvent.keyDown(docsTab, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Proses' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(processTab, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Ringkasan' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(summaryTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Riwayat' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders server-truth data and Belum dicatat for null/missing fields in Ringkasan', () => {
    const workspace = createMockWorkspace({
      mustahik: {
        id: 101,
        nama: 'Siti Maryam',
        name: 'Siti Maryam',
        nik_masked: null,
        phone_masked: '',
        applicant_status: undefined,
        kategori: null,
        asnaf: 'Fakir',
        program: 'Tangerang Peduli',
        address: null,
        rt_rw: null,
        kelurahan: 'Cipondoh',
        kecamatan: 'Cipondoh',
        kabupaten_kota: 'Kota Tangerang',
        province: 'Banten',
      },
    });

    render(<CaseWorkflowPanel workspace={workspace} />);

    expect(screen.getByRole('heading', { name: 'Siti Maryam' })).toBeInTheDocument();
    expect(screen.getByText('MST/2026/09/00101')).toBeInTheDocument();
    expect(screen.getByText('Tangerang Peduli')).toBeInTheDocument();

    // Check that missing fields rendered 'Belum dicatat'
    const unrecordedItems = screen.getAllByText('Belum dicatat');
    expect(unrecordedItems.length).toBeGreaterThanOrEqual(3);

    // Verify absence of fabricated score & Had Kifayah
    expect(screen.queryByText(/86\/100/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Had Kifayah/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kelengkapan data/i)).not.toBeInTheDocument();
  });

  it('renders legacy warning banner when is_legacy is true', () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'LEGACY-001',
        file_no: 'LEGACY-001',
        status: 'Survey',
        p0_version: 1,
        workflow_version: 1,
        workflow_mode: 'legacy',
        is_legacy: true,
        legacy_banner: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        archived_at: null,
        archived_by_id: null,
        archive_reason: null,
      },
    });

    render(<CaseWorkflowPanel workspace={workspace} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Arsip Berkas Kasus Legacy|Peringatan: Berkas Kasus Legacy/i);
    expect(alert).toHaveTextContent(/Perhatian: Data ini merupakan arsip legacy sebelum migrasi P0/i);
  });

  it('renders stage-specific content for intake, assessment, mpzis, and ppd in Proses tab', () => {
    // 1. Intake stage
    const intakeWorkspace = createMockWorkspace({
      case_progress: {
        current_stage: 'intake',
        active_artifact: null,
        required_action: null,
        blocking_reasons: [],
        is_terminal: false,
      },
    });
    const { rerender } = render(<CaseWorkflowPanel workspace={intakeWorkspace} activeTab="process" />);
    expect(screen.getByText('Intake Berkas Terdaftar')).toBeInTheDocument();

    // 2. Assessment stage
    const assessmentWorkspace = createMockWorkspace({
      case_progress: {
        current_stage: 'assessment',
        active_artifact: 'assessment',
        required_action: null,
        blocking_reasons: [],
        is_terminal: false,
      },
    });
    rerender(<CaseWorkflowPanel workspace={assessmentWorkspace} activeTab="process" />);
    expect(screen.getByText('Formulir Asesmen Lapangan (P0)')).toBeInTheDocument();
    expect(screen.getByText('Buruh Harian')).toBeInTheDocument();

    // 3. MPZIS stage
    const mpzisWorkspace = createMockWorkspace({
      case_progress: {
        current_stage: 'mpzis',
        active_artifact: 'mpzis',
        required_action: null,
        blocking_reasons: [],
        is_terminal: false,
      },
    });
    rerender(<CaseWorkflowPanel workspace={mpzisWorkspace} activeTab="process" />);
    expect(screen.getByText('Persetujuan Berjenjang MPZIS (5 Tingkat)')).toBeInTheDocument();
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();

    // 4. PPD stage
    const ppdWorkspace = createMockWorkspace({
      case_progress: {
        current_stage: 'ppd',
        active_artifact: 'ppd',
        required_action: null,
        blocking_reasons: [],
        is_terminal: false,
      },
    });
    rerender(<CaseWorkflowPanel workspace={ppdWorkspace} activeTab="process" />);
    expect(screen.getByText('Pengajuan Pencairan Dana (PPD)')).toBeInTheDocument();
    expect(screen.getByText('BSI')).toBeInTheDocument();
    expect(screen.getByText('Modal dagang sembako')).toBeInTheDocument();
  });

  it('renders document table and triggers api.downloadArtifact on download click', async () => {
    const workspace = createMockWorkspace();
    const mockBlob = new Blob(['sample-pdf'], { type: 'application/pdf' });
    vi.mocked(api.downloadArtifact).mockResolvedValueOnce(mockBlob);

    render(<CaseWorkflowPanel workspace={workspace} activeTab="documents" />);

    expect(screen.getByText('KTP Asli.pdf')).toBeInTheDocument();
    expect(screen.getByText('KTP')).toBeInTheDocument();

    const downloadButton = screen.getByRole('button', { name: /unduh berkas ktp asli.pdf/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(api.downloadArtifact).toHaveBeenCalledWith(101, 1001, 'attachment');
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });
  });

  it('downloads intake documents through their case-scoped workspace URL', async () => {
    const workspace = createMockWorkspace({
      documents: [{
        id: 'intake-31',
        mustahik_id: 101,
        artifact_type: null,
        kind: 'ktp',
        filename: 'ktp-random.pdf',
        original_name: 'KTP Pemohon.pdf',
        mime_type: null,
        byte_size: null,
        sha256: null,
        created_at: '2026-09-26T11:00:00.000Z',
        download_url: '/api/penyaluran/mustahik/101/documents/31',
      }],
    });
    const mockBlob = new Blob(['private-ktp'], { type: 'application/pdf' });
    vi.mocked(api.downloadCaseDocument).mockResolvedValueOnce(mockBlob);
    render(<CaseWorkflowPanel workspace={workspace} activeTab='documents' />);
    fireEvent.click(screen.getByRole('button', { name: /unduh berkas ktp pemohon.pdf/i }));
    await waitFor(() => {
      expect(api.downloadCaseDocument).toHaveBeenCalledWith('/api/penyaluran/mustahik/101/documents/31');
      expect(api.downloadArtifact).not.toHaveBeenCalled();
    });
  });
  it('renders empty documents message when documents list is empty', () => {
    const workspace = createMockWorkspace({ documents: [] });
    render(<CaseWorkflowPanel workspace={workspace} activeTab="documents" />);

    expect(
      screen.getByText('Belum ada dokumen digital yang tersimpan pada pengajuan ini.')
    ).toBeInTheDocument();
  });

  it('renders history timeline with events and actor roles', () => {
    const workspace = createMockWorkspace();
    render(<CaseWorkflowPanel workspace={workspace} activeTab="history" />);

    expect(screen.getByText('Admin Amil')).toBeInTheDocument();
    expect(screen.getByText(/Amil Pendaftaran/i)).toBeInTheDocument();
    expect(screen.getByText('Pendaftaran berkas mustahik baru secara digital')).toBeInTheDocument();
  });

  it('renders completion state and downloads receipt', async () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'REG-2026-00101',
        file_no: 'MST-00101',
        status: 'Penyaluran Selesai',
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
      case_progress: {
        current_stage: 'completed',
        active_artifact: null,
        required_action: null,
        blocking_reasons: [],
        is_terminal: true,
      },
    });

    const receiptBlob = new Blob(['receipt-pdf'], { type: 'application/pdf' });
    vi.mocked(api.downloadReceipt).mockResolvedValueOnce(receiptBlob);

    render(<CaseWorkflowPanel workspace={workspace} activeTab="process" />);

    expect(screen.getByText('Penyaluran Berhasil Tuntas')).toBeInTheDocument();
    const downloadReceiptBtn = screen.getByRole('button', {
      name: /unduh bukti digital penyaluran/i,
    });
    fireEvent.click(downloadReceiptBtn);

    await waitFor(() => {
      expect(api.downloadReceipt).toHaveBeenCalledWith(101, 20);
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(receiptBlob);
    });
  });

  it('triggers onRefresh when Segarkan button is clicked', () => {
    const workspace = createMockWorkspace();
    const handleRefresh = vi.fn();

    render(<CaseWorkflowPanel workspace={workspace} onRefresh={handleRefresh} />);

    const refreshBtn = screen.getByRole('button', { name: 'Segarkan data kasus' });
    fireEvent.click(refreshBtn);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders reconciliation in-progress banner and suppresses routine actions for legacy_reconciliation mode', async () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'REC-001',
        file_no: 'MST/2026/09/00101',
        status: 'Verifikasi Berkas Rekonsiliasi',
        p0_version: 1,
        workflow_version: 1,
        workflow_mode: 'legacy_reconciliation',
        is_legacy: false,
        is_reconciliation: true,
        legacy_banner: false,
        reconciliation_banner: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        archived_at: null,
        archived_by_id: null,
        archive_reason: null,
      },
    });

    render(<CaseWorkflowPanel workspace={workspace} />);

    // Reconciliation banner is rendered
    expect(screen.getByText('Rekonsiliasi Berkas Legacy Sedang Berlangsung')).toBeInTheDocument();
    // Legacy archive banner is NOT rendered
    expect(screen.queryByText('Arsip Berkas Kasus Legacy')).not.toBeInTheDocument();
  });

  it('allows authorized user to complete legacy reconciliation via modal', async () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'REC-001',
        file_no: 'MST/2026/09/00101',
        status: 'Verifikasi Berkas Rekonsiliasi',
        p0_version: 1,
        workflow_version: 1,
        workflow_mode: 'legacy_reconciliation',
        is_legacy: false,
        is_reconciliation: true,
        legacy_banner: false,
        reconciliation_banner: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        archived_at: null,
        archived_by_id: null,
        archive_reason: null,
      },
      capabilities: {
        admin_recovery: true,
      },
    });

    vi.mocked(api.completeLegacyReconciliation).mockResolvedValueOnce({
      success: true,
      data: {
        case_id: 101,
        reconciled_at: '2026-09-21T00:00:00.000Z',
      },
    } as any);

    const onRefresh = vi.fn();
    render(<CaseWorkflowPanel workspace={workspace} onRefresh={onRefresh} />);

    const completeBtn = screen.getByRole('button', { name: /selesaikan rekonsiliasi/i });
    expect(completeBtn).toBeInTheDocument();
    fireEvent.click(completeBtn);

    // Modal opens
    expect(screen.getByRole('heading', { name: 'Selesaikan Rekonsiliasi Berkas' })).toBeInTheDocument();

    const noteTextarea = screen.getByLabelText(/catatan rekonsiliasi/i);
    fireEvent.change(noteTextarea, { target: { value: 'Berkas telah divalidasi sesuai standar P0.' } });

    const submitBtn = screen.getByRole('button', { name: 'Konfirmasi Selesai Rekonsiliasi' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.completeLegacyReconciliation).toHaveBeenCalledWith(101, {
        note: 'Berkas telah divalidasi sesuai standar P0.',
      });
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('allows authorized user to start legacy reconciliation on unmigrated legacy cases', async () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'LEG-001',
        file_no: 'MST/2025/12/00001',
        status: 'Survey',
        p0_version: 0,
        workflow_version: 0,
        workflow_mode: 'legacy',
        is_legacy: true,
        is_reconciliation: false,
        legacy_banner: true,
        reconciliation_banner: false,
        created_at: '2025-12-01T00:00:00.000Z',
        updated_at: '2025-12-01T00:00:00.000Z',
        archived_at: null,
        archived_by_id: null,
        archive_reason: null,
      },
      capabilities: {
        admin_recovery: true,
      },
    });

    vi.mocked(api.startLegacyReconciliation).mockResolvedValueOnce({
      success: true,
      data: {
        id: 101,
        workflow_mode: 'legacy_reconciliation',
      },
    } as any);

    const onRefresh = vi.fn();
    render(<CaseWorkflowPanel workspace={workspace} onRefresh={onRefresh} />);

    expect(screen.getByText('Arsip Berkas Kasus Legacy')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /mulai rekonsiliasi/i });
    expect(startBtn).toBeInTheDocument();
    fireEvent.click(startBtn);

    // Modal opens
    expect(screen.getByRole('heading', { name: 'Mulai Rekonsiliasi Berkas Legacy' })).toBeInTheDocument();

    // Validates short note
    const noteTextarea = screen.getByLabelText(/alasan rekonsiliasi/i);
    fireEvent.change(noteTextarea, { target: { value: 'Terlalu pendek' } });

    const submitBtn = screen.getByRole('button', { name: 'Konfirmasi Mulai Rekonsiliasi' });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Catatan rekonsiliasi wajib antara 20 dan 1000 karakter.')).toBeInTheDocument();
    expect(api.startLegacyReconciliation).not.toHaveBeenCalled();

    // Valid note >= 20 chars
    fireEvent.change(noteTextarea, {
      target: { value: 'Memulai proses rekonsiliasi berkas legacy ke verifikasi digital P0.' },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.startLegacyReconciliation).toHaveBeenCalledWith(101, {
        note: 'Memulai proses rekonsiliasi berkas legacy ke verifikasi digital P0.',
      });
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('permits controlled artifact rebuilding for authorized reconciliation actors during legacy_reconciliation', async () => {
    const workspace = createMockWorkspace({
      case: {
        id: 101,
        nomor_registrasi: 'REC-001',
        file_no: 'MST/2026/09/00101',
        status: 'Survey',
        p0_version: 1,
        workflow_version: 1,
        workflow_mode: 'legacy_reconciliation',
        is_legacy: false,
        is_reconciliation: true,
        legacy_banner: false,
        reconciliation_banner: true,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        archived_at: null,
        archived_by_id: null,
        archive_reason: null,
      },
      case_progress: {
        current_stage: 'assessment',
        active_artifact: 'assessment',
        required_action: 'Lengkapi formulir asesmen lapangan',
        blocking_reasons: [],
        is_terminal: false,
      },
      capabilities: {
        admin_recovery: true,
      },
    });

    render(<CaseWorkflowPanel workspace={workspace} activeTab="process" />);

    // In reconciliation mode, authorized actor sees reconstruction notice
    expect(screen.getByText(/Mode Rekonstruksi Berkas:/i)).toBeInTheDocument();

    // AssessmentForm is enabled (not blanket read-only) for controlled rebuild
    expect(screen.getByLabelText(/permohonan bantuan/i)).not.toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Simpan Draf' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Ajukan Asesmen' })).toBeInTheDocument();
  });
});
