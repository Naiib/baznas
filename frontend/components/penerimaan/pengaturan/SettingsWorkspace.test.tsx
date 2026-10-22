import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsWorkspace } from './SettingsWorkspace';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { PenerimaanSettings, PenerimaanChannelConfig, PenerimaanAccount } from '@/lib/api/types';

let mockUser = {
  id: 1,
  name: 'Administrator Penerimaan',
  role: 'admin',
  division: 'Direksi & Sekretariat',
  level: 'admin',
};

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
  }),
}));

const mockSettings: PenerimaanSettings = {
  approval_threshold: '10000000',
  auto_reconcile_tolerance: '0',
  require_evidence_manual: true,
  updated_at: '2026-09-08T10:00:00Z',
  updated_by: 'Administrator',
};

const mockChannels: PenerimaanChannelConfig[] = [
  {
    id: 1,
    code: 'bank_transfer',
    name: 'Transfer Bank Virtual Account & Manual',
    category: 'digital',
    provider_name: 'BSI & Bank Mandiri',
    is_active: true,
    settlement_type: 'realtime',
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 2,
    code: 'qris',
    name: 'QRIS Dinamis / Statis',
    category: 'digital',
    provider_name: 'QRIS BAZNAS',
    is_active: true,
    settlement_type: 'realtime',
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 3,
    code: 'counter_kasir',
    name: 'Counter Kasir Tunai Kantor BAZNAS',
    category: 'manual',
    provider_name: 'Kasir Pusat',
    is_active: true,
    settlement_type: 'manual',
    updated_at: '2026-09-01T00:00:00Z',
  },
];

const mockAccounts: PenerimaanAccount[] = [
  {
    id: 1,
    bank_name: 'Bank Syariah Indonesia (BSI)',
    account_number: '7001122334',
    account_name: 'BAZNAS RI - ZAKAT',
    channel: 'bank_transfer',
    is_active: true,
  },
];

const mockFundCategories: PenerimaanFundCategoryConfig[] = [
  {
    id: 1,
    code: 'zakat',
    name: 'Zakat Mal & Profesi',
    description: 'Penerimaan zakat harta dan penghasilan',
    is_active: true,
  },
  {
    id: 2,
    code: 'fidyah',
    name: 'Fidyah & Kafarat',
    description: 'Penerimaan fidyah dan kafarat',
    is_active: true,
  },
];

const mockProviders: PenerimaanProviderConfig[] = [
  {
    id: 1,
    provider_name: 'portal',
    display_name: 'Portal Publik BAZNAS',
    is_active: true,
    is_secret_set: true,
    has_secret: true,
    secret_key: '••••••••',
    secret_masked: '••••••••',
    secret_updated_at: '2026-09-08T12:00:00Z',
  },
  {
    id: 2,
    provider_name: 'bsi',
    display_name: 'BSI Webhook Direct',
    is_active: true,
    is_secret_set: false,
    has_secret: false,
    secret_key: null,
    secret_masked: null,
  },
];

vi.mock('@/lib/api/penerimaan', () => ({
  penerimaanApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannelConfig: vi.fn(),
    getAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    getFundCategories: vi.fn(),
    createFundCategory: vi.fn(),
    updateFundCategory: vi.fn(),
    getProviderConfigs: vi.fn(),
    updateProviderConfig: vi.fn(),
    getAuditLogs: vi.fn().mockResolvedValue({ success: true, data: { items: [], has_more: false } }),
  },
}));

describe('SettingsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 1,
      name: 'Administrator Penerimaan',
      role: 'admin',
      division: 'Direksi & Sekretariat',
      level: 'admin',
    };
    (penerimaanApi.getSettings as any).mockResolvedValue({
      success: true,
      data: mockSettings,
    });
    (penerimaanApi.getChannels as any).mockResolvedValue({
      success: true,
      data: mockChannels,
    });
    (penerimaanApi.getAccounts as any).mockResolvedValue({
      success: true,
      data: mockAccounts,
    });
    (penerimaanApi.getFundCategories as any).mockResolvedValue({
      success: true,
      data: mockFundCategories,
    });
    (penerimaanApi.getProviderConfigs as any).mockResolvedValue({
      success: true,
      data: mockProviders,
    });
    (penerimaanApi.updateSettings as any).mockResolvedValue({
      success: true,
      data: { ...mockSettings, approval_threshold: '15000000' },
    });
    (penerimaanApi.updateProviderConfig as any).mockImplementation((id, data) =>
      Promise.resolve({
        success: true,
        data: { ...mockProviders.find((p) => p.id === Number(id)), ...data },
      })
    );
    (penerimaanApi.createFundCategory as any).mockImplementation((data) =>
      Promise.resolve({
        success: true,
        data: { id: 3, ...data },
      })
    );
    (penerimaanApi.updateFundCategory as any).mockImplementation((id, data) =>
      Promise.resolve({
        success: true,
        data: { ...mockFundCategories.find((f) => f.id === Number(id)), ...data },
      })
    );
    (penerimaanApi.createChannel as any).mockImplementation((data) =>
      Promise.resolve({
        success: true,
        data: { id: 4, ...data },
      })
    );
    (penerimaanApi.createAccount as any).mockImplementation((data) =>
      Promise.resolve({
        success: true,
        data: { id: 2, ...data },
      })
    );
  });

  it('renders settings dashboard with tabs and loaded data', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Pengaturan Penerimaan/i)).toBeInTheDocument();
      expect(screen.getByText(/Threshold Approval Kepala/i)).toBeInTheDocument();
      expect(screen.getByText(/Transfer Bank/i)).toBeInTheDocument();
    });

    expect(penerimaanApi.getSettings).toHaveBeenCalled();
    expect(penerimaanApi.getChannels).toHaveBeenCalled();
  });

  it('allows Admin to update approval threshold with positive integer validation', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('10000000')).toBeInTheDocument();
    });

    const thresholdInput = screen.getByDisplayValue('10000000');
    fireEvent.change(thresholdInput, { target: { value: '15000000' } });

    const saveBtn = screen.getByRole('button', { name: /Simpan Parameter|Simpan Perubahan/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(penerimaanApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ approval_threshold: '15000000' })
      );
    });
  });

  it('displays error if channel deactivation is rejected due to unsettled transactions', async () => {
    (penerimaanApi.updateChannelConfig as any).mockRejectedValueOnce(
      new Error('Kanal tidak dapat dinonaktifkan karena masih terdapat transaksi belum tuntas')
    );

    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Transfer Bank/i)).toBeInTheDocument();
    });

    // Find toggle or disable button for bank_transfer
    const toggleButtons = screen.getAllByRole('button', { name: /Nonaktifkan|Aktif/i });
    expect(toggleButtons.length).toBeGreaterThan(0);
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/transaksi belum tuntas/i)).toBeInTheDocument();
    });
  });

  it('enforces read-only controls for non-admin amil', async () => {
    mockUser = {
      id: 2,
      name: 'Staff Penerimaan',
      role: 'penerimaan',
      division: 'Bidang Pengumpulan & ZIS',
      level: 'staff',
    };

    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText(/Pengaturan Penerimaan/i)).toBeInTheDocument();
    });

    // Save button should either not exist or be disabled for staff
    const saveBtns = screen.queryAllByRole('button', { name: /Simpan/i });
    for (const btn of saveBtns) {
      expect(btn).toBeDisabled();
    }
  });

  it('keeps administrator controls enabled for padded mixed-case claims', async () => {
    mockUser = {
      id: 1,
      name: 'Administrator Penyaluran',
      role: ' penyaluran ',
      division: 'Direksi & Sekretariat',
      level: ' ADMIN ',
    };

    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('10000000')).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByRole('button', { name: /Simpan Parameter|Simpan Perubahan/i });
    expect(saveButtons.length).toBeGreaterThan(0);
    expect(saveButtons[0]).not.toBeDisabled();
  });

  it('renders fund categories and provider configs with masked secrets', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Zakat Mal & Profesi')).toBeInTheDocument();
      expect(screen.getByText('Fidyah & Kafarat')).toBeInTheDocument();
      expect(screen.getByText('Portal Publik BAZNAS')).toBeInTheDocument();
      expect(screen.getByText('BSI Webhook Direct')).toBeInTheDocument();
      // Masked secret
      expect(screen.getByText('••••••••')).toBeInTheDocument();
      expect(screen.getByText('Belum Diatur')).toBeInTheDocument();
    });
  });

  it('allows Admin to edit provider config and preserves secret when left blank', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Portal Publik BAZNAS')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByRole('button', { name: /Ubah Konfigurasi/i });
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Ubah Konfigurasi Provider/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Kosongkan untuk mempertahankan secret saat ini/i)
      ).toBeInTheDocument();
    });

    const displayNameInput = screen.getByDisplayValue('Portal Publik BAZNAS');
    fireEvent.change(displayNameInput, { target: { value: 'Portal Publik Kota Tangerang' } });

    // Leave secret input blank, submit
    const submitBtn = screen.getByRole('button', { name: /Simpan Konfigurasi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(penerimaanApi.updateProviderConfig).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          display_name: 'Portal Publik Kota Tangerang',
        })
      );
      // Ensure secret_key was NOT passed or empty
      const callArgs = (penerimaanApi.updateProviderConfig as any).mock.calls[0][1];
      expect(callArgs.secret_key).toBeUndefined();
    });
  });

  it('allows Admin to rotate provider secret with new secret key', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Portal Publik BAZNAS')).toBeInTheDocument();
    });

    const editBtns = screen.getAllByRole('button', { name: /Ubah Konfigurasi/i });
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Biarkan kosong jika tidak diubah/i)).toBeInTheDocument();
    });

    const secretInput = screen.getByPlaceholderText(/Biarkan kosong jika tidak diubah/i);
    fireEvent.change(secretInput, { target: { value: 'new-rotated-secret-xyz' } });

    const submitBtn = screen.getByRole('button', { name: /Simpan Konfigurasi/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(penerimaanApi.updateProviderConfig).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          secret_key: 'new-rotated-secret-xyz',
        })
      );
    });
  });

  it('allows Admin to create a new fund category and toggle its active status', async () => {
    render(<SettingsWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('Kategori Dana Penerimaan')).toBeInTheDocument();
    });

    const addFundBtn = screen.getByRole('button', { name: /Tambah Kategori Dana/i });
    fireEvent.click(addFundBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('contoh: fidyah')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('contoh: fidyah'), { target: { value: 'dskl' } });
    fireEvent.change(screen.getByPlaceholderText('contoh: Fidyah & Kafarat'), { target: { value: 'DSKL dan Hibah' } });
    fireEvent.change(screen.getByPlaceholderText(/Penerimaan fidyah dan kafarat/i), { target: { value: 'Dana Sosial Keagamaan Lainnya' } });

    const saveBtn = screen.getByRole('button', { name: /Simpan Kategori/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(penerimaanApi.createFundCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'dskl',
          name: 'DSKL dan Hibah',
          description: 'Dana Sosial Keagamaan Lainnya',
          is_active: true,
        })
      );
    });

    // Test toggle fund category
    const toggleBtns = screen.getAllByRole('button', { name: /Nonaktifkan/i });
    expect(toggleBtns.length).toBeGreaterThan(0);
    // Click toggle on fund category
    fireEvent.click(toggleBtns[toggleBtns.length - 1]);

    await waitFor(() => {
      expect(penerimaanApi.updateFundCategory).toHaveBeenCalled();
    });
  });
});
