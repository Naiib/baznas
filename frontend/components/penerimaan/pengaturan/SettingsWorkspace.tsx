'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Shield,
  CreditCard,
  Building2,
  History,
  Save,
  AlertCircle,
  CheckCircle2,
  Lock,
  RefreshCw,
  Check,
  X,
  Plus,
  Key,
  Layers,
  Radio,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';
import type {
  PenerimaanSettings,
  PenerimaanChannelConfig,
  PenerimaanAccount,
  PenerimaanAuditLogItem,
  PenerimaanFundCategoryConfig,
  PenerimaanProviderConfig,
  PenerimaanChannelCategory,
} from '@/lib/api/types';

function formatRupiahExact(amount: string | number | bigint | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const clean = String(amount).trim().replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const isNegative = clean.startsWith('-');
  const digits = isNegative ? clean.slice(1) : clean;
  const parts = [];
  for (let i = digits.length; i > 0; i -= 3) {
    parts.unshift(digits.slice(Math.max(0, i - 3), i));
  }
  return `${isNegative ? '-Rp ' : 'Rp '}${parts.join('.')}`;
}

export function SettingsWorkspace() {
  const { user } = useAuth();
  const isAdmin = normalizeAccessActor(user).isAdmin;

  const [activeTab, setActiveTab] = useState<
    'all' | 'parameters' | 'channels' | 'accounts' | 'fund_categories' | 'providers' | 'audit'
  >('all');

  const [settings, setSettings] = useState<PenerimaanSettings | null>(null);
  const [thresholdInput, setThresholdInput] = useState<string>('10000000');
  const [toleranceInput, setToleranceInput] = useState<string>('0');
  const [requireEvidence, setRequireEvidence] = useState<boolean>(true);

  const [channels, setChannels] = useState<PenerimaanChannelConfig[]>([]);
  const [accounts, setAccounts] = useState<PenerimaanAccount[]>([]);
  const [fundCategories, setFundCategories] = useState<PenerimaanFundCategoryConfig[]>([]);
  const [providers, setProviders] = useState<PenerimaanProviderConfig[]>([]);
  const [auditLogs, setAuditLogs] = useState<PenerimaanAuditLogItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [updatingChannelId, setUpdatingChannelId] = useState<number | string | null>(null);
  const [updatingFundId, setUpdatingFundId] = useState<number | string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [showAddChannelModal, setShowAddChannelModal] = useState<boolean>(false);
  const [newChannel, setNewChannel] = useState<{
    code: string;
    name: string;
    category: PenerimaanChannelCategory;
    provider_name: string;
    settlement_type: 'realtime' | 'batch_d1' | 'manual';
  }>({
    code: '',
    name: '',
    category: 'digital',
    provider_name: '',
    settlement_type: 'realtime',
  });

  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);
  const [newAccount, setNewAccount] = useState<{
    bank_name: string;
    account_number: string;
    account_name: string;
    channel: string;
  }>({
    bank_name: '',
    account_number: '',
    account_name: '',
    channel: 'bank_transfer',
  });

  const [showAddFundModal, setShowAddFundModal] = useState<boolean>(false);
  const [newFund, setNewFund] = useState<{
    code: string;
    name: string;
    description: string;
  }>({
    code: '',
    name: '',
    description: '',
  });

  const [editingProvider, setEditingProvider] = useState<PenerimaanProviderConfig | null>(null);
  const [providerDisplayName, setProviderDisplayName] = useState<string>('');
  const [providerSecretInput, setProviderSecretInput] = useState<string>('');
  const [providerIsActive, setProviderIsActive] = useState<boolean>(true);
  const [isSubmittingModal, setIsSubmittingModal] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [settingsRes, channelsRes, accountsRes, fundCatsRes, providersRes, auditRes] = await Promise.all([
        penerimaanApi.getSettings(),
        penerimaanApi.getChannels(),
        penerimaanApi.getAccounts(),
        typeof penerimaanApi.getFundCategories === 'function'
          ? penerimaanApi.getFundCategories()
          : Promise.resolve({ success: true, data: [] }),
        typeof penerimaanApi.getProviderConfigs === 'function'
          ? penerimaanApi.getProviderConfigs()
          : Promise.resolve({ success: true, data: [] }),
        penerimaanApi.getAuditLogs({ entity_type: 'penerimaan_settings', limit: 20 }),
      ]);

      if (settingsRes?.success && settingsRes.data) {
        setSettings(settingsRes.data);
        setThresholdInput(String(settingsRes.data.approval_threshold || '10000000'));
        setToleranceInput(String(settingsRes.data.auto_reconcile_tolerance || '0'));
        setRequireEvidence(Boolean(settingsRes.data.require_evidence_manual));
      }

      if (channelsRes?.success && channelsRes.data) {
        setChannels(channelsRes.data);
      }

      if (accountsRes?.success && accountsRes.data) {
        setAccounts(accountsRes.data);
      }

      if (fundCatsRes?.success && fundCatsRes.data) {
        setFundCategories(fundCatsRes.data);
      }

      if (providersRes?.success && providersRes.data) {
        setProviders(providersRes.data);
      }

      if (auditRes?.success && auditRes.data?.items) {
        setAuditLogs(auditRes.data.items);
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setErrorMsg(err?.message || 'Gagal memuat konfigurasi penerimaan.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveParameters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanThreshold = thresholdInput.trim();
    if (!/^\d+$/.test(cleanThreshold) || BigInt(cleanThreshold) <= 0n) {
      setErrorMsg('Threshold approval harus berupa bilangan bulat positif (> 0).');
      return;
    }

    const cleanTolerance = toleranceInput.trim();
    if (!/^\d+$/.test(cleanTolerance) || BigInt(cleanTolerance) < 0n) {
      setErrorMsg('Toleransi rekonsiliasi tidak boleh negatif.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await penerimaanApi.updateSettings({
        approval_threshold: cleanThreshold,
        auto_reconcile_tolerance: cleanTolerance,
        require_evidence_manual: requireEvidence,
      });

      if (res.success && res.data) {
        setSettings(res.data);
        setSuccessMsg('Parameter operasional berhasil diperbarui.');
      } else {
        throw new Error(res.message || 'Gagal menyimpan pengaturan.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menyimpan pengaturan.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleChannel = async (channel: PenerimaanChannelConfig) => {
    if (!isAdmin) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setUpdatingChannelId(channel.id);

    try {
      const newActive = !channel.is_active;
      const res = await penerimaanApi.updateChannelConfig(channel.id, {
        is_active: newActive,
      });

      if (res.success && res.data) {
        setChannels((prev) =>
          prev.map((c) => (c.id === channel.id ? { ...c, is_active: newActive } : c))
        );
        setSuccessMsg(`Kanal ${channel.name} berhasil ${newActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      } else {
        throw new Error(res.message || 'Gagal mengubah status kanal.');
      }
    } catch (err: any) {
      console.error('Failed to toggle channel:', err);
      setErrorMsg(err?.message || 'Gagal mengubah status kanal.');
    } finally {
      setUpdatingChannelId(null);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!newChannel.code.trim() || !newChannel.name.trim()) {
      setErrorMsg('Kode dan nama kanal wajib diisi.');
      return;
    }

    setIsSubmittingModal(true);
    setErrorMsg(null);
    try {
      const res = await penerimaanApi.createChannel({
        ...newChannel,
        code: newChannel.code.trim().toLowerCase(),
        name: newChannel.name.trim(),
        provider_name: newChannel.provider_name.trim() || null,
        is_active: true,
      });

      const createdChannel = res?.data;
      if (res?.success && createdChannel) {
        setChannels((prev) => [...prev, createdChannel]);
        setShowAddChannelModal(false);
        setNewChannel({
          code: '',
          name: '',
          category: 'digital',
          provider_name: '',
          settlement_type: 'realtime',
        });
        setSuccessMsg(`Kanal penerimaan ${createdChannel.name} berhasil ditambahkan.`);
      } else {
        throw new Error(res?.message || 'Gagal menambahkan kanal.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menambahkan kanal.');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!newAccount.bank_name.trim() || !newAccount.account_number.trim() || !newAccount.account_name.trim()) {
      setErrorMsg('Nama bank, nomor rekening, dan nama pemilik rekening wajib diisi.');
      return;
    }

    setIsSubmittingModal(true);
    setErrorMsg(null);
    try {
      const res = await penerimaanApi.createAccount({
        bank_name: newAccount.bank_name.trim(),
        account_number: newAccount.account_number.trim(),
        account_name: newAccount.account_name.trim(),
        account_holder: newAccount.account_name.trim(),
        channel: newAccount.channel.trim() as any,
        is_active: true,
      });

      const createdAccount = res?.data;
      if (res?.success && createdAccount) {
        setAccounts((prev) => [...prev, createdAccount]);
        setShowAddAccountModal(false);
        setNewAccount({
          bank_name: '',
          account_number: '',
          account_name: '',
          channel: 'bank_transfer',
        });
        setSuccessMsg(`Rekening ${createdAccount.bank_name} berhasil ditambahkan.`);
      } else {
        throw new Error(res?.message || 'Gagal menambahkan rekening.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menambahkan rekening.');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleToggleFundCategory = async (fundCat: PenerimaanFundCategoryConfig) => {
    if (!isAdmin) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setUpdatingFundId(fundCat.id);

    try {
      const newActive = !fundCat.is_active;
      const res = await penerimaanApi.updateFundCategory(fundCat.id, {
        is_active: newActive,
      });

      if (res?.success && res.data) {
        setFundCategories((prev) =>
          prev.map((f) => (f.id === fundCat.id ? { ...f, is_active: newActive } : f))
        );
        setSuccessMsg(`Kategori dana ${fundCat.name} berhasil ${newActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      } else {
        throw new Error(res?.message || 'Gagal mengubah status kategori dana.');
      }
    } catch (err: any) {
      console.error('Failed to toggle fund category:', err);
      setErrorMsg(err?.message || 'Gagal mengubah status kategori dana.');
    } finally {
      setUpdatingFundId(null);
    }
  };

  const handleCreateFundCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!newFund.code.trim() || !newFund.name.trim()) {
      setErrorMsg('Kode dan nama kategori dana wajib diisi.');
      return;
    }

    setIsSubmittingModal(true);
    setErrorMsg(null);
    try {
      const res = await penerimaanApi.createFundCategory({
        code: newFund.code.trim().toLowerCase(),
        name: newFund.name.trim(),
        description: newFund.description.trim() || null,
        is_active: true,
      });

      const createdFund = res?.data;
      if (res?.success && createdFund) {
        setFundCategories((prev) => [...prev, createdFund]);
        setShowAddFundModal(false);
        setNewFund({ code: '', name: '', description: '' });
        setSuccessMsg(`Kategori dana ${createdFund.name} berhasil ditambahkan.`);
      } else {
        throw new Error(res?.message || 'Gagal menambahkan kategori dana.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menambahkan kategori dana.');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const handleOpenEditProvider = (provider: PenerimaanProviderConfig) => {
    setEditingProvider(provider);
    setProviderDisplayName(provider.display_name || provider.provider_name);
    setProviderSecretInput('');
    setProviderIsActive(provider.is_active);
  };

  const handleSaveProviderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingProvider) return;

    setIsSubmittingModal(true);
    setErrorMsg(null);
    try {
      const payload: Partial<PenerimaanProviderConfig> = {
        display_name: providerDisplayName.trim(),
        is_active: providerIsActive,
      };

      // Write-only rotation: only provide secret_key if non-empty
      if (providerSecretInput.trim().length > 0) {
        payload.secret_key = providerSecretInput.trim();
      }

      const res = await penerimaanApi.updateProviderConfig(editingProvider.id, payload);

      if (res?.success && res.data) {
        setProviders((prev) =>
          prev.map((p) => (p.id === editingProvider.id ? { ...p, ...res.data } : p))
        );
        setEditingProvider(null);
        setSuccessMsg(`Konfigurasi provider ${res.data.display_name || res.data.provider_name} berhasil disimpan.`);
      } else {
        throw new Error(res?.message || 'Gagal menyimpan konfigurasi provider.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menyimpan konfigurasi provider.');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Pengaturan Penerimaan
            </h1>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                <Lock className="size-3" /> Mode Baca Saja
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Parameter operasional, batas otorisasi kepala, master kanal, dan rekening bank resmi.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3 animate-in fade-in">
          <AlertCircle className="size-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-800"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-start gap-3 animate-in fade-in">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMsg}</div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-800"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'all'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Settings className="size-4" />
          <span>Semua Pengaturan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('parameters')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'parameters'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Shield className="size-4" />
          <span>Parameter Operasional & Threshold</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('channels')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'channels'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <CreditCard className="size-4" />
          <span>Kanal Penerimaan</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'accounts'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Building2 className="size-4" />
          <span>Rekening Bank & Kasir</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fund_categories')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'fund_categories'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Layers className="size-4" />
          <span>Kategori Dana</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'providers'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Radio className="size-4" />
          <span>Konfigurasi Provider</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
            activeTab === 'audit'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <History className="size-4" />
          <span>Audit Konfigurasi</span>
        </button>
      </div>

      {/* TAB 1: PARAMETER OPERASIONAL & THRESHOLD */}
      {(activeTab === 'all' || activeTab === 'parameters') && (
        <form onSubmit={handleSaveParameters} className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Otorisasi & Kebijakan Penerimaan
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                Mengatur batas nominal transaksi yang wajib mendapatkan persetujuan Kepala Bagian Penerimaan.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-zinc-100">
              {/* Approval Threshold */}
              <div>
                <label
                  htmlFor="approval-threshold"
                  className="block text-sm font-bold text-zinc-800"
                >
                  Threshold Approval Kepala Bagian (IDR)
                </label>
                <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                  Transaksi dengan nominal sama dengan atau melebihi batas ini wajib disetujui Kepala Bagian.
                </p>
                <div className="relative rounded-xl shadow-xs">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-zinc-400 text-sm font-semibold">Rp</span>
                  </div>
                  <input
                    id="approval-threshold"
                    type="number"
                    min="1"
                    step="1"
                    disabled={!isAdmin}
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="block w-full rounded-xl border border-zinc-200 pl-10 pr-3 py-2.5 text-sm font-bold text-zinc-900 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50 disabled:text-zinc-500"
                  />
                </div>
                <p className="text-xs text-emerald-600 font-semibold mt-1.5">
                  Nominal saat ini: {formatRupiahExact(thresholdInput)}
                </p>
              </div>

              {/* Reconciliation Tolerance */}
              <div>
                <label
                  htmlFor="tolerance-input"
                  className="block text-sm font-bold text-zinc-800"
                >
                  Toleransi Selisih Auto-Rekonsiliasi (IDR)
                </label>
                <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                  Toleransi perbedaan pembulatan pada pencocokan otomatis rekening koran (default 0).
                </p>
                <div className="relative rounded-xl shadow-xs">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-zinc-400 text-sm font-semibold">Rp</span>
                  </div>
                  <input
                    id="tolerance-input"
                    type="number"
                    min="0"
                    step="1"
                    disabled={!isAdmin}
                    value={toleranceInput}
                    onChange={(e) => setToleranceInput(e.target.value)}
                    className="block w-full rounded-xl border border-zinc-200 pl-10 pr-3 py-2.5 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50 disabled:text-zinc-500"
                  />
                </div>
              </div>
            </div>

            {/* Checkbox require evidence */}
            <div className="pt-4 border-t border-zinc-100 flex items-start gap-3">
              <input
                id="require-evidence"
                type="checkbox"
                disabled={!isAdmin}
                checked={requireEvidence}
                onChange={(e) => setRequireEvidence(e.target.checked)}
                className="size-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 mt-0.5"
              />
              <div>
                <label
                  htmlFor="require-evidence"
                  className="text-sm font-bold text-zinc-800 cursor-pointer"
                >
                  Wajib Lampiran Bukti Setor / Transfer untuk Transaksi Manual
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Jika aktif, amil tidak dapat memvalidasi draft transaksi tunai/manual tanpa dokumen bukti setor.
                </p>
              </div>
            </div>

            {settings?.updated_at && (
              <div className="pt-4 border-t border-zinc-100 text-xs text-zinc-500">
                Terakhir diperbarui: {new Date(settings.updated_at).toLocaleString('id-ID')}
                {settings.updated_by ? ` oleh ${settings.updated_by}` : ''}
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!isAdmin || isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="size-4" />
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Parameter'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: KANAL PENERIMAAN */}
      {(activeTab === 'all' || activeTab === 'channels') && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900">Kanal Penerimaan ZIS</h2>
              <p className="text-sm text-zinc-500">
                Pengaturan status aktif kanal digital dan manual serta tipe settlement.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddChannelModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-xs self-start sm:self-auto"
              >
                <Plus className="size-4" />
                <span>Tambah Kanal</span>
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Nama Kanal
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Kategori
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Provider / Gateway
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Settlement
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white text-sm">
                {channels.map((channel) => {
                  const isUpdating = updatingChannelId === channel.id;
                  return (
                    <tr key={channel.id} className="hover:bg-zinc-50/60 transition">
                      <td className="px-5 py-4 font-bold text-zinc-900">
                        {channel.name}
                        <div className="text-xs font-mono font-normal text-zinc-400">
                          {channel.code}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-zinc-600 capitalize">
                        {channel.category}
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        {channel.provider_name || '-'}
                      </td>
                      <td className="px-5 py-4 text-zinc-600 font-mono text-xs">
                        {channel.settlement_type || 'realtime'}
                      </td>
                      <td className="px-5 py-4">
                        {channel.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <span className="size-1.5 rounded-full bg-emerald-600" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                            <span className="size-1.5 rounded-full bg-zinc-400" />
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleChannel(channel)}
                          disabled={!isAdmin || isUpdating}
                          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                            channel.is_active
                              ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {isUpdating ? (
                            <RefreshCw className="size-3 animate-spin" />
                          ) : channel.is_active ? (
                            'Nonaktifkan'
                          ) : (
                            'Aktifkan'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: REKENING BANK & KASIR */}
      {(activeTab === 'all' || activeTab === 'accounts') && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900">Rekening Bank & Kasir Penerimaan</h2>
              <p className="text-sm text-zinc-500">
                Daftar rekening giro/tabungan perbankan syariah dan kasir resmi untuk penerimaan dana ZIS.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddAccountModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-xs self-start sm:self-auto"
              >
                <Plus className="size-4" />
                <span>Tambah Rekening</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 font-bold">
                      <Building2 className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-zinc-900">{acc.bank_name}</h3>
                      <p className="text-xs text-zinc-500">{acc.channel || 'Semua Kanal'}</p>
                    </div>
                  </div>
                  {acc.is_active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      Aktif
                    </span>
                  ) : (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">
                      Nonaktif
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <p className="text-xs text-zinc-400 font-medium">Nomor Rekening</p>
                  <p className="font-mono text-sm font-bold text-zinc-900 tracking-wider">
                    {acc.account_number}
                  </p>
                  <p className="text-xs text-zinc-600 font-medium mt-1">
                    a.n. {acc.account_name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: KATEGORI DANA */}
      {(activeTab === 'all' || activeTab === 'fund_categories') && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900">Kategori Dana Penerimaan</h2>
              <p className="text-sm text-zinc-500">
                Master kategori jenis dana syariah (Zakat, Infak, Sedekah, DSKL, Fidyah) yang dikelola BAZNAS.
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddFundModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition shadow-xs self-start sm:self-auto"
              >
                <Plus className="size-4" />
                <span>Tambah Kategori Dana</span>
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Kode
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Nama Kategori
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Deskripsi
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white text-sm">
                {fundCategories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-400 text-sm">
                      Belum ada master kategori dana.
                    </td>
                  </tr>
                ) : (
                  fundCategories.map((cat) => {
                    const isUpdating = updatingFundId === cat.id;
                    return (
                      <tr key={cat.id} className="hover:bg-zinc-50/60 transition">
                        <td className="px-5 py-4 font-mono font-bold text-xs text-zinc-900">
                          {cat.code}
                        </td>
                        <td className="px-5 py-4 font-bold text-zinc-900">
                          {cat.name}
                        </td>
                        <td className="px-5 py-4 text-zinc-600 text-xs max-w-sm truncate">
                          {cat.description || '-'}
                        </td>
                        <td className="px-5 py-4">
                          {cat.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="size-1.5 rounded-full bg-emerald-600" />
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                              <span className="size-1.5 rounded-full bg-zinc-400" />
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleFundCategory(cat)}
                            disabled={!isAdmin || isUpdating}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                              cat.is_active
                                ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {isUpdating ? (
                              <RefreshCw className="size-3 animate-spin" />
                            ) : cat.is_active ? (
                              'Nonaktifkan'
                            ) : (
                              'Aktifkan'
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: KONFIGURASI PROVIDER & INTEGRASI */}
      {(activeTab === 'all' || activeTab === 'providers') && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Konfigurasi Integrasi & Provider</h2>
            <p className="text-sm text-zinc-500">
              Konfigurasi gateway pembayaran, webhook publik portal, dan perbankan syariah. Secret tersimpan dengan write-only rotation dan terenkripsi.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Provider
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Webhook Secret
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Pembaruan Secret
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white text-sm">
                {providers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-400 text-sm">
                      Belum ada konfigurasi provider terdaftar.
                    </td>
                  </tr>
                ) : (
                  providers.map((p) => {
                    const hasSecret = Boolean(p.is_secret_set || p.has_secret || p.secret_masked);
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50/60 transition">
                        <td className="px-5 py-4">
                          <div className="font-bold text-zinc-900">{p.display_name || p.provider_name}</div>
                          <div className="text-xs font-mono text-zinc-400">{p.provider_name}</div>
                        </td>
                        <td className="px-5 py-4">
                          {hasSecret ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-mono font-bold text-zinc-700">
                              <Key className="size-3 text-zinc-500" />
                              ••••••••
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Belum Diatur
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500">
                          {p.secret_updated_at
                            ? new Date(p.secret_updated_at).toLocaleString('id-ID')
                            : '-'}
                        </td>
                        <td className="px-5 py-4">
                          {p.is_active ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="size-1.5 rounded-full bg-emerald-600" />
                              Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                              <span className="size-1.5 rounded-full bg-zinc-400" />
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenEditProvider(p)}
                            disabled={!isAdmin}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition disabled:opacity-50"
                          >
                            <Key className="size-3 text-zinc-500" />
                            <span>Ubah Konfigurasi</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: AUDIT KONFIGURASI */}
      {(activeTab === 'all' || activeTab === 'audit') && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Log Audit Konfigurasi</h2>
            <p className="text-sm text-zinc-500">
              Riwayat perubahan parameter, threshold otorisasi, dan status kanal penerimaan yang tidak dapat diubah (immutable).
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Waktu
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Aksi
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Pengubah
                  </th>
                  <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Rincian Perubahan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white text-sm">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-zinc-400 text-sm">
                      Belum ada catatan perubahan konfigurasi.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/50">
                      <td className="px-5 py-3 text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                      <td className="px-5 py-3 font-semibold text-zinc-900 text-xs">
                        {log.action}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-700">
                        {log.actor_name}
                        <span className="ml-1 text-[10px] text-zinc-400">({log.actor_role})</span>
                      </td>
                      <td className="px-5 py-3 text-xs font-mono text-zinc-600 max-w-md truncate">
                        {log.new_values ? JSON.stringify(log.new_values) : log.notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH KANAL */}
      {showAddChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-base font-bold text-zinc-900">Tambah Kanal Penerimaan</h3>
              <button
                type="button"
                onClick={() => setShowAddChannelModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Kode Kanal
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: qris_dana"
                  value={newChannel.code}
                  onChange={(e) => setNewChannel({ ...newChannel, code: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-mono text-zinc-900 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Kanal
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: QRIS DANA BAZNAS"
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Kategori
                </label>
                <select
                  value={newChannel.category}
                  onChange={(e) => setNewChannel({ ...newChannel, category: e.target.value as any })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                >
                  <option value="digital">Digital (Online / Payment Gateway)</option>
                  <option value="manual">Manual (Counter Kasir / Tunai)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Provider / Gateway (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="contoh: DANA Indonesia"
                  value={newChannel.provider_name}
                  onChange={(e) => setNewChannel({ ...newChannel, provider_name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Tipe Settlement
                </label>
                <select
                  value={newChannel.settlement_type}
                  onChange={(e) => setNewChannel({ ...newChannel, settlement_type: e.target.value as any })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                >
                  <option value="realtime">Realtime (Langsung Masuk)</option>
                  <option value="batch_d1">Batch H+1</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddChannelModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSubmittingModal ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span>Simpan Kanal</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH REKENING */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-base font-bold text-zinc-900">Tambah Rekening Bank & Kasir</h3>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Bank / Entitas Kasir
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Bank Syariah Indonesia (BSI)"
                  value={newAccount.bank_name}
                  onChange={(e) => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: 7001122334"
                  value={newAccount.account_number}
                  onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-mono text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Atas Nama (Pemilik Rekening)
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: BAZNAS KOTA TANGERANG"
                  value={newAccount.account_name}
                  onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Kanal Terkait
                </label>
                <select
                  value={newAccount.channel}
                  onChange={(e) => setNewAccount({ ...newAccount, channel: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                >
                  <option value="bank_transfer">Transfer Bank (Manual & VA)</option>
                  <option value="qris">QRIS</option>
                  <option value="counter_kasir">Counter Kasir</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSubmittingModal ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span>Simpan Rekening</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH KATEGORI DANA */}
      {showAddFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-base font-bold text-zinc-900">Tambah Kategori Dana</h3>
              <button
                type="button"
                onClick={() => setShowAddFundModal(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFundCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Kode Kategori Dana
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: fidyah"
                  value={newFund.code}
                  onChange={(e) => setNewFund({ ...newFund, code: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-mono text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Kategori Dana
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Fidyah & Kafarat"
                  value={newFund.name}
                  onChange={(e) => setNewFund({ ...newFund, name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Deskripsi (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="contoh: Penerimaan fidyah dan kafarat syar'i"
                  value={newFund.description}
                  onChange={(e) => setNewFund({ ...newFund, description: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddFundModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSubmittingModal ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span>Simpan Kategori</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UBAH KONFIGURASI PROVIDER (WRITE-ONLY ROTATION) */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Ubah Konfigurasi Provider</h3>
                <p className="text-xs font-mono text-zinc-500">{editingProvider.provider_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProviderConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Nama Tampilan Provider
                </label>
                <input
                  type="text"
                  required
                  value={providerDisplayName}
                  onChange={(e) => setProviderDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-sm font-semibold text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 mb-1">
                  Webhook Secret / API Key
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Key className="size-4 text-zinc-400" />
                  </div>
                  <input
                    type="password"
                    placeholder="Biarkan kosong jika tidak diubah"
                    value={providerSecretInput}
                    onChange={(e) => setProviderSecretInput(e.target.value)}
                    className="block w-full rounded-xl border border-zinc-200 pl-10 pr-3 py-2 text-sm font-mono text-zinc-900 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Kosongkan untuk mempertahankan secret saat ini (••••••••)
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="provider-is-active"
                  type="checkbox"
                  checked={providerIsActive}
                  onChange={(e) => setProviderIsActive(e.target.checked)}
                  className="size-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="provider-is-active" className="text-sm font-bold text-zinc-800 cursor-pointer">
                  Provider Aktif
                </label>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="font-bold">Keamanan Terjamin:</span> Nilai secret tidak akan ditampilkan kembali, terenkripsi di database, dan tidak pernah disimpan dalam log audit.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setEditingProvider(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSubmittingModal ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span>Simpan Konfigurasi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
