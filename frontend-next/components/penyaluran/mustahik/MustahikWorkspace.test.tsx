import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { api } from '@/lib/api/client';
import type { P0CaseWorkspace } from '@/lib/api/penyaluran-p0-types';
import { getDecisionCapabilities, MustahikWorkspace } from './MustahikWorkspace';
import { resolveMustahikCenter, TANGERANG_CENTER } from './MustahikLocationMap';

const mockCurrentUser = vi.hoisted(() => ({
  value: { id: 'staff-1' as string, role: 'penyaluran' as string, division: 'Penyaluran' as string, level: 'staff' as string },
}));

function createMockWorkspace(id: number, name: string, status: string, fileNo: string): P0CaseWorkspace {
  return {
    success: true,
    case: {
      id,
      nomor_registrasi: `REG-${id}`,
      file_no: fileNo,
      status,
      p0_version: 1,
      workflow_version: 1,
      workflow_mode: 'p0',
      is_legacy: false,
      legacy_banner: false,
      created_at: '2026-09-20T08:00:00.000Z',
      updated_at: '2026-09-20T08:00:00.000Z',
      archived_at: null,
      archived_by_id: null,
      archive_reason: null,
    },
    mustahik: {
      id,
      nama: name,
      name,
      nik_masked: '367101******0001',
      phone_masked: '0812****5678',
      applicant_status: 'Kepala Keluarga',
      kategori: 'Perorangan',
      asnaf: 'Miskin',
      program: 'Tangerang Peduli',
      address: 'Jl. Merdeka No. 10',
      rt_rw: '001/002',
      kelurahan: 'Cipondoh',
      kecamatan: 'Cipondoh',
      kabupaten_kota: 'Kota Tangerang',
      province: 'Banten',
    },
    case_progress: {
      current_stage: status === 'Survey' ? 'assessment' : 'intake',
      active_artifact: status === 'Survey' ? 'assessment' : null,
      required_action: null,
      blocking_reasons: [],
      is_terminal: false,
    },
    assessment: null,
    mpzis_approvals: [],
    mpzis: null,
    ppd: {
      id: null,
      revision: null,
      status: null,
      total_rab: 0,
      amount: 0,
      rab_lines: [],
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
      can_approve_mpzis: false,
      allowed_mpzis_roles: [],
      can_submit_ppd: false,
      can_disburse: false,
      can_archive: false,
      can_restore: false,
    },
    capabilities: {
      can_create_draft: true,
    },
    timeline: [],
    history: [],
    documents: [],
  };
}

const mockMustahikList = [
  {
    id: 1,
    name: 'Siti Maryam',
    nik: '3175000000000002',
    file_no: 'M/VER/250826/00024',
    status: 'Survey',
    kecamatan: 'Karawaci',
    address: 'Jl. Melati No. 23',
    asnaf: 'Miskin',
    program: 'Tangerang Sehat',
    recommended_amount: 1500000,
  },
  {
    id: 2,
    name: 'Ahmad Fauzi',
    nik: '3175000000000025',
    file_no: 'M/VER/250826/00025',
    status: 'Verifikasi Administrasi',
    kecamatan: 'Ciledug',
    address: 'Jl. KH Hasyim Ashari No. 12',
    asnaf: 'Fakir',
    program: 'Tangerang Peduli',
    recommended_amount: 1200000,
  },
];

vi.mock('@/lib/api/client', () => ({
  api: {
    getMustahikList: vi.fn(),
    getP0CaseWorkspace: vi.fn(),
    createP0MustahikIntake: vi.fn(),
    createMustahik: vi.fn(),
    downloadArtifact: vi.fn(),
    downloadReceipt: vi.fn(),
  },
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockCurrentUser.value,
  }),
}));

describe('MustahikWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.value = { id: 'staff-1', role: 'penyaluran', division: 'Penyaluran', level: 'staff' };
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-file');
    window.URL.revokeObjectURL = vi.fn();

    vi.mocked(api.getMustahikList).mockResolvedValue({
      data: mockMustahikList,
    } as any);

    vi.mocked(api.getP0CaseWorkspace).mockImplementation(async (id: string | number) => {
      if (Number(id) === 1) {
        return createMockWorkspace(1, 'Siti Maryam', 'Survey', 'M/VER/250826/00024');
      }
      return createMockWorkspace(2, 'Ahmad Fauzi', 'Verifikasi Administrasi', 'M/VER/250826/00025');
    });

    vi.mocked(api.createP0MustahikIntake).mockResolvedValue({
      success: true,
      data: {
        case_id: 3,
        mustahik_id: 3,
        nomor_registrasi: 'REG-3',
        file_no: 'MST-3',
        status: 'Diajukan',
        workflow_version: 1,
        created_at: '2026-09-20T10:00:00.000Z',
      },
    } as any);
  });

  it('maps decision actions to staff and leader authority', () => {
    expect(
      getDecisionCapabilities({ role: 'penyaluran', division: 'Penyaluran', level: 'staff' }, 'Survey')
    ).toMatchObject({ canApprove: true, canReject: true });

    expect(
      getDecisionCapabilities({ role: 'penyaluran', division: 'Penyaluran', level: 'staff' }, 'Persetujuan MPZIS')
    ).toMatchObject({ canApprove: false, canReject: false });

    expect(
      getDecisionCapabilities({ role: 'penyaluran', division: 'Penyaluran', level: 'leader' }, 'Persetujuan MPZIS')
    ).toMatchObject({ canApprove: true, canReject: true, approveLabel: 'Setujui MPZIS' });
  });

  it('normalizes mixed-case Penyaluran leader claims for decision authority', () => {
    expect(
      getDecisionCapabilities(
        { role: ' PENYALURAN ', division: 'Penyaluran', level: ' LEADER ' },
        'Persetujuan MPZIS'
      )
    ).toMatchObject({
      canApprove: true,
      canReject: true,
      approveLabel: 'Setujui MPZIS',
    });
  });

  it('recognizes official division Bidang Pendistribusian & Pendayagunaan for decision authority', () => {
    expect(
      getDecisionCapabilities(
        { role: 'penyaluran', division: 'Bidang Pendistribusian & Pendayagunaan', level: 'leader' },
        'Persetujuan MPZIS'
      )
    ).toMatchObject({
      canApprove: true,
      canReject: true,
      approveLabel: 'Setujui MPZIS',
    });

    expect(
      getDecisionCapabilities(
        { role: 'penyaluran', division: 'Bidang Pendistribusian & Pendayagunaan', level: 'staff' },
        'Persetujuan MPZIS'
      )
    ).toMatchObject({
      canApprove: false,
      canReject: false,
    });
  });

  it('uses Tangerang as a safe fallback when a subdistrict has no coordinate', () => {
    expect(resolveMustahikCenter('Kecamatan Tidak Ada')).toEqual(TANGERANG_CENTER);
  });

  it('loads canonical case workspace and updates when an applicant is selected', async () => {
    render(<MustahikWorkspace />);

    expect(await screen.findByRole('heading', { name: 'Data Mustahik' })).toBeInTheDocument();
    expect(screen.getByText('Antrean verifikasi')).toBeInTheDocument();

    // Verify api.getP0CaseWorkspace was called for the initial selected mustahik (id: 1)
    await waitFor(() => {
      expect(api.getP0CaseWorkspace).toHaveBeenCalledWith(1);
    });

    // Siti Maryam's CaseWorkflowPanel should be displayed
    expect(await screen.findByRole('heading', { name: 'Siti Maryam' })).toBeInTheDocument();
    expect(screen.getByText('M/VER/250826/00024')).toBeInTheDocument();

    // Select Ahmad Fauzi
    const ahmadBtn = screen.getByRole('button', { name: /pilih ahmad fauzi/i });
    fireEvent.click(ahmadBtn);

    // Verify api.getP0CaseWorkspace was called with id: 2
    await waitFor(() => {
      expect(api.getP0CaseWorkspace).toHaveBeenCalledWith(2);
    });

    expect(await screen.findByRole('heading', { name: 'Ahmad Fauzi' })).toBeInTheDocument();
    expect(screen.getByText('M/VER/250826/00025')).toBeInTheDocument();
  });

  it('filters the queue by workflow stage', async () => {
    render(<MustahikWorkspace />);
    await screen.findByText('Antrean verifikasi');

    // Click 'Survey' stage rail
    const surveyStageBtn = await screen.findByRole('button', { name: /survey lapangan 1/i });
    fireEvent.click(surveyStageBtn);

    expect(screen.getByRole('button', { name: /pilih siti maryam/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pilih ahmad fauzi/i })).not.toBeInTheDocument();
  });

  it('limits keuangan to PPD stage records and hides intake controls', async () => {
    mockCurrentUser.value = { id: 'finance-1', role: 'keuangan', division: 'Keuangan', level: 'staff' };
    vi.mocked(api.getMustahikList).mockResolvedValue({
      data: [
        ...mockMustahikList,
        { ...mockMustahikList[0]!, id: 3, name: 'Dewi PPD', status: 'Pengajuan Dana (FPD)' },
      ],
    } as any);

    render(<MustahikWorkspace />);

    expect(await screen.findByRole('button', { name: 'Pencairan PPD 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pengajuan Masuk/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tambah Mustahik/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Impor data/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pilih dewi ppd/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pilih siti maryam/i })).not.toBeInTheDocument();
  });

  it('shows an actionable empty state when search has no match and clears search', async () => {
    render(<MustahikWorkspace />);
    const searchInput = await screen.findByPlaceholderText('Cari nama, NIK, atau no. pengajuan…');

    fireEvent.change(searchInput, { target: { value: 'tidak-ada-orang-ini' } });

    await waitFor(() => {
      expect(screen.getByText('Data tidak ditemukan')).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: 'Hapus pencarian' });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pilih siti maryam/i })).toBeInTheDocument();
    });
  });

  it('filters by quick filter buttons (Perlu tindakan, Persetujuan, Selesai)', async () => {
    render(<MustahikWorkspace />);
    await screen.findByText('Antrean verifikasi');

    // Click 'Perlu tindakan' quick filter
    const perluTindakanBtn = screen.getByRole('button', { name: 'Filter antrean perlu tindakan' });
    fireEvent.click(perluTindakanBtn);

    // Both Siti (Survey) and Ahmad (Verifikasi Administrasi) need action
    expect(screen.getByRole('button', { name: /pilih siti maryam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pilih ahmad fauzi/i })).toBeInTheDocument();

    // Click 'Selesai' quick filter (neither is completed)
    const selesaiBtn = screen.getByRole('button', { name: 'Filter antrean selesai' });
    fireEvent.click(selesaiBtn);

    expect(screen.getByText('Data tidak ditemukan')).toBeInTheDocument();
  });

  it('routes Tambah Mustahik modal exclusively to api.createP0MustahikIntake', async () => {
    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    // Open Add Modal
    const addBtn = screen.getByRole('button', { name: /tambah mustahik/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Pendaftaran Intake Mustahik Baru')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), {
      target: { value: 'Dewi Lestari' },
    });
    fireEvent.change(screen.getByLabelText(/nik \(16 digit\)/i), {
      target: { value: '3671012345678901' },
    });
    fireEvent.change(screen.getByLabelText(/no\. whatsapp/i), {
      target: { value: '081234567890' },
    });
    fireEvent.change(screen.getByLabelText(/alamat lengkap/i), {
      target: { value: 'Jl. Melati No. 12' },
    });
    fireEvent.change(screen.getByLabelText(/kecamatan/i), {
      target: { value: 'Cipondoh' },
    });
    fireEvent.change(screen.getByLabelText(/kelurahan/i), {
      target: { value: 'Cipondoh' },
    });
    fireEvent.change(screen.getByLabelText(/asnaf/i), {
      target: { value: 'Miskin' },
    });
    fireEvent.change(screen.getByLabelText(/program/i), {
      target: { value: 'Tangerang Peduli' },
    });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /simpan intake/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createP0MustahikIntake).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dewi Lestari',
          nik: '3671012345678901',
          phone: '081234567890',
          address: 'Jl. Melati No. 12',
          kecamatan: 'Cipondoh',
          kelurahan: 'Cipondoh',
          asnaf: 'Miskin',
          program: 'Tangerang Peduli',
        })
      );
    });

    // Verify legacy api.createMustahik is NEVER called
    expect(api.createMustahik).not.toHaveBeenCalled();

    // Verify recommended_amount is NOT passed
    expect(api.createP0MustahikIntake).not.toHaveBeenCalledWith(
      expect.objectContaining({
        recommended_amount: expect.anything(),
      })
    );
  });

  it('validates required consequential fields (kecamatan, kelurahan, asnaf, program) on intake', async () => {
    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    // Open Add Modal
    const addBtn = screen.getByRole('button', { name: /tambah mustahik/i });
    fireEvent.click(addBtn);

    // Consequential fields start unselected/empty
    const kecamatanSelect = screen.getByLabelText(/kecamatan/i) as HTMLSelectElement;
    expect(kecamatanSelect.value).toBe('');

    const kelurahanSelect = screen.getByLabelText(/kelurahan/i) as HTMLSelectElement;
    expect(kelurahanSelect.value).toBe('');
    expect(kelurahanSelect).toBeDisabled(); // Disabled until kecamatan chosen

    // Fill partial details but leave consequential fields empty
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Budi Test' } });
    fireEvent.change(screen.getByLabelText(/nik \(16 digit\)/i), { target: { value: '3671012345678902' } });

    // Attempt submit
    fireEvent.click(screen.getByRole('button', { name: /simpan intake/i }));

    expect(screen.getAllByText('Kecamatan domisili wajib dipilih.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Kelurahan domisili wajib dipilih atau diisi.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Kategori asnaf wajib dipilih.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Program bantuan wajib dipilih.').length).toBeGreaterThanOrEqual(1);
    expect(api.createP0MustahikIntake).not.toHaveBeenCalled();

    // Select kecamatan, kelurahan options populate
    fireEvent.change(kecamatanSelect, { target: { value: 'Cipondoh' } });
    expect(kelurahanSelect).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Cipondoh Indah' })).toBeInTheDocument();
  });

  it('updates kelurahan options dynamically for different kecamatan values without implicit selection', async () => {
    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    fireEvent.click(screen.getByRole('button', { name: /tambah mustahik/i }));

    const kecamatanSelect = screen.getByLabelText(/kecamatan/i) as HTMLSelectElement;
    const kelurahanSelect = screen.getByLabelText(/kelurahan/i) as HTMLSelectElement;
    const asnafSelect = screen.getByLabelText(/asnaf/i) as HTMLSelectElement;
    const programSelect = screen.getByLabelText(/program/i) as HTMLSelectElement;

    // Consequential fields start completely unselected
    expect(kecamatanSelect.value).toBe('');
    expect(kelurahanSelect.value).toBe('');
    expect(asnafSelect.value).toBe('');
    expect(programSelect.value).toBe('');

    // 1. Select Karawaci
    fireEvent.change(kecamatanSelect, { target: { value: 'Karawaci' } });
    expect(kelurahanSelect).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Bugel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cimone' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cipondoh Indah' })).not.toBeInTheDocument();

    // Select Bugel
    fireEvent.change(kelurahanSelect, { target: { value: 'Bugel' } });
    expect(kelurahanSelect.value).toBe('Bugel');

    // 2. Switch to Ciledug - kelurahan resets to empty and populates Ciledug subdistricts
    fireEvent.change(kecamatanSelect, { target: { value: 'Ciledug' } });
    expect(kelurahanSelect.value).toBe('');
    expect(screen.getByRole('option', { name: 'Paninggilan' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sudimara Barat' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Bugel' })).not.toBeInTheDocument();

    // Asnaf and program remain untouched/unselected without implicit defaults
    expect(asnafSelect.value).toBe('');
    expect(programSelect.value).toBe('');
  });

  it('renders rollout notice and disables Tambah Mustahik when isP0Enabled is false', async () => {
    render(<MustahikWorkspace isP0Enabled={false} />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    expect(screen.getByText(/Mode Baca P0 \(Rollout Terbatas\):/i)).toBeInTheDocument();
    const addBtn = screen.getByRole('button', { name: /tambah mustahik/i });
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveAttribute('title', 'Pendaftaran kasus baru dinonaktifkan (mode baca)');
  });

  it('handles 503 P0_WORKFLOW_DISABLED error gracefully during intake submission', async () => {
    const error503 = new Error('P0 intake workflow is currently disabled by operator flag');
    (error503 as any).status = 503;
    (error503 as any).code = 'P0_WORKFLOW_DISABLED';
    vi.mocked(api.createP0MustahikIntake).mockRejectedValueOnce(error503);

    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    fireEvent.click(screen.getByRole('button', { name: /tambah mustahik/i }));

    // Fill valid form
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Dewi Lestari' } });
    fireEvent.change(screen.getByLabelText(/nik \(16 digit\)/i), { target: { value: '3671012345678901' } });
    fireEvent.change(screen.getByLabelText(/no\. whatsapp/i), { target: { value: '081234567890' } });
    fireEvent.change(screen.getByLabelText(/alamat lengkap/i), { target: { value: 'Jl. Melati No. 12' } });
    fireEvent.change(screen.getByLabelText(/kecamatan/i), { target: { value: 'Cipondoh' } });
    fireEvent.change(screen.getByLabelText(/kelurahan/i), { target: { value: 'Cipondoh' } });
    fireEvent.change(screen.getByLabelText(/asnaf/i), { target: { value: 'Miskin' } });
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: 'Tangerang Peduli' } });

    fireEvent.click(screen.getByRole('button', { name: /simpan intake/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Workflow P0 sedang dinonaktifkan oleh server (503 P0_WORKFLOW_DISABLED).')
      ).toBeInTheDocument();
    });
  });

  it('does not render recommended_amount input in intake modal', async () => {
    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Data Mustahik' });

    fireEvent.click(screen.getByRole('button', { name: /tambah mustahik/i }));

    expect(screen.queryByLabelText(/rekomendasi nominal/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nominal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rekomendasi nominal bantuan/i)).not.toBeInTheDocument();
  });

  it('handles workspace fetch errors gracefully with a retry option', async () => {
    vi.mocked(api.getP0CaseWorkspace).mockRejectedValueOnce(
      new Error('Koneksi ke server terputus')
    );

    render(<MustahikWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Koneksi ke server terputus');
    });

    const retryBtn = screen.getByRole('button', { name: /coba lagi/i });
    expect(retryBtn).toBeInTheDocument();

    // Setup success for retry
    vi.mocked(api.getP0CaseWorkspace).mockResolvedValueOnce(
      createMockWorkspace(1, 'Siti Maryam', 'Survey', 'M/VER/250826/00024')
    );

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Siti Maryam' })).toBeInTheDocument();
    });
  });

  it('contains zero synthetic score cards, Had Kifayah badges, or generic decision drawer', async () => {
    render(<MustahikWorkspace />);
    await screen.findByRole('heading', { name: 'Siti Maryam' });

    // Assert absence of all synthetic artifacts
    expect(screen.queryByText(/86\/100/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Skor kelayakan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rasio Had Kifayah/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ambang Kelulusan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Keputusan siap ditinjau/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tinjau keputusan/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Keputusan Mustahik' })).not.toBeInTheDocument();
  });
});
