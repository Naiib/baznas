'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X,
  User,
  Building,
  Shield,
  Phone,
  Mail,
  MapPin,
  FileText,
  CreditCard,
  Calendar,
  History,
  TrendingUp,
  Clock,
  ExternalLink,
  Edit2,
  Lock,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type {
  MuzakkiDetail,
  PenerimaanAuditLogItem,
  PenerimaanTransaction,
} from '@/lib/api/types';

interface MuzakkiDetailDrawerProps {
  muzakkiId: number | string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (muzakki: MuzakkiDetail) => void;
}

function formatRupiah(amount: string | null | undefined): string {
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

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function MuzakkiDetailDrawer({
  muzakkiId,
  isOpen,
  onClose,
  onEdit,
}: MuzakkiDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'ringkasan' | 'riwayat' | 'audit'>('ringkasan');
  const [detail, setDetail] = useState<MuzakkiDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<PenerimaanAuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !muzakkiId) {
      setDetail(null);
      setAuditLogs([]);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    penerimaanApi
      .getMuzakkiById(muzakkiId)
      .then((res) => {
        if (isMounted) {
          if (res.success && res.data) {
            setDetail(res.data);
          } else {
            setError(res.message || 'Gagal memuat profil muzakki.');
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Terjadi kesalahan sistem.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, muzakkiId]);

  useEffect(() => {
    if (!isOpen || !muzakkiId || activeTab !== 'audit') return;

    let isMounted = true;
    setAuditLoading(true);

    penerimaanApi
      .getAuditLogs({ entity_type: 'muzakki', entity_id: String(muzakkiId), limit: 30 })
      .then((res) => {
        if (isMounted && res.success && res.data) {
          setAuditLogs(res.data.items || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setAuditLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, muzakkiId, activeTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAnonymous =
    detail?.type === 'anonim' ||
    detail?.name?.toLowerCase().includes('hamba allah') ||
    detail?.name?.toLowerCase().includes('anonim');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-muzakki-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-200 bg-zinc-50/70 flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                isAnonymous
                  ? 'bg-amber-100 text-amber-700'
                  : detail?.type === 'lembaga'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isAnonymous ? (
                  <Shield className="w-6 h-6" />
                ) : detail?.type === 'lembaga' ? (
                  <Building className="w-6 h-6" />
                ) : (
                  <User className="w-6 h-6" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 id="drawer-muzakki-title" className="text-xl font-bold text-zinc-900">
                    {detail?.name || 'Memuat...'}
                  </h2>
                  {detail && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      isAnonymous
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : detail.type === 'lembaga'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {isAnonymous ? 'Anonim' : detail.type === 'lembaga' ? 'Lembaga' : 'Individu'}
                    </span>
                  )}
                </div>
                <p className="text-sm font-mono text-zinc-500 mt-0.5">
                  {detail?.npwz ? `NPWZ: ${detail.npwz}` : 'NPWZ: Belum terdaftar'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {detail && (
                <button
                  type="button"
                  onClick={() => onEdit(detail)}
                  className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors"
                aria-label="Tutup laci detail"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 border-b border-zinc-200 flex space-x-6">
            <button
              type="button"
              onClick={() => setActiveTab('ringkasan')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
                activeTab === 'ringkasan'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profil & Ringkasan</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
                activeTab === 'riwayat'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Riwayat Donasi ({detail?.recent_transactions?.length || 0})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center space-x-2 ${
                activeTab === 'audit'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Log Audit</span>
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="space-y-4 py-8 animate-pulse">
                <div className="h-24 bg-zinc-100 rounded-xl" />
                <div className="h-36 bg-zinc-100 rounded-xl" />
                <div className="h-48 bg-zinc-100 rounded-xl" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600 font-medium mb-2">{error}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
                >
                  Tutup
                </button>
              </div>
            ) : detail ? (
              <>
                {/* TAB 1: Profil & Ringkasan */}
                {activeTab === 'ringkasan' && (
                  <div className="space-y-6">
                    {/* Ringkasan Donasi Metrics Grid */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                        Ringkasan Kontribusi & Donasi
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                          <p className="text-xs font-medium text-emerald-800 flex items-center">
                            <TrendingUp className="w-3.5 h-3.5 mr-1" />
                            Total Kontribusi
                          </p>
                          <p className="text-base font-bold text-emerald-950 mt-1">
                            {formatRupiah(detail.donation_summary?.total_amount || detail.total_donations_amount || '0')}
                          </p>
                        </div>
                        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <p className="text-xs font-medium text-zinc-600 flex items-center">
                            <History className="w-3.5 h-3.5 mr-1" />
                            Frekuensi Donasi
                          </p>
                          <p className="text-base font-bold text-zinc-900 mt-1">
                            {detail.donation_summary?.total_count || detail.total_donations_count || 0} kali
                          </p>
                        </div>
                        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <p className="text-xs font-medium text-zinc-600 flex items-center">
                            <CreditCard className="w-3.5 h-3.5 mr-1" />
                            Rata-rata Donasi
                          </p>
                          <p className="text-base font-bold text-zinc-900 mt-1">
                            {formatRupiah(detail.donation_summary?.avg_amount || '0')}
                          </p>
                        </div>
                        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl col-span-2 sm:col-span-1">
                          <p className="text-xs font-medium text-zinc-600 flex items-center">
                            <CreditCard className="w-3.5 h-3.5 mr-1" />
                            Kanal Terfavorit
                          </p>
                          <p className="text-sm font-semibold text-zinc-900 mt-1 capitalize">
                            {(detail.donation_summary?.preferred_channel || detail.preferred_channel || '-').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <p className="text-xs font-medium text-zinc-600 flex items-center">
                            <Calendar className="w-3.5 h-3.5 mr-1" />
                            Donasi Terakhir
                          </p>
                          <p className="text-sm font-semibold text-zinc-900 mt-1">
                            {formatDate(detail.donation_summary?.last_donation || detail.last_donation_date)}
                          </p>
                        </div>
                        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <p className="text-xs font-medium text-zinc-600 flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            Terdaftar Sejak
                          </p>
                          <p className="text-sm font-semibold text-zinc-900 mt-1">
                            {formatDate(detail.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Informasi Identitas & Kontak */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                        Identitas & Kontak Donatur
                      </h3>
                      <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center">
                            <User className="w-3.5 h-3.5 mr-1.5" />
                            Jenis Identitas
                          </span>
                          <span className="text-xs font-semibold text-zinc-800 uppercase">
                            {detail.identity_type || '-'}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center">
                            <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                            Nomor Identitas
                          </span>
                          <span className="text-xs font-mono font-medium text-zinc-800 flex items-center">
                            {detail.identity_number?.includes('*') && (
                              <Lock className="w-3 h-3 mr-1 text-amber-600" />
                            )}
                            {detail.identity_number || '-'}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center">
                            <Phone className="w-3.5 h-3.5 mr-1.5" />
                            Nomor Telepon / WA
                          </span>
                          <span className="text-xs font-mono font-medium text-zinc-800 flex items-center">
                            {detail.phone?.includes('*') && (
                              <Lock className="w-3 h-3 mr-1 text-amber-600" />
                            )}
                            {detail.phone || '-'}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center">
                            <Mail className="w-3.5 h-3.5 mr-1.5" />
                            Alamat Email
                          </span>
                          <span className="text-xs font-medium text-zinc-800 flex items-center">
                            {detail.email?.includes('*') && (
                              <Lock className="w-3 h-3 mr-1 text-amber-600" />
                            )}
                            {detail.email || '-'}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center">
                            <MapPin className="w-3.5 h-3.5 mr-1.5" />
                            Kota / Wilayah
                          </span>
                          <span className="text-xs font-medium text-zinc-800">
                            {detail.city || 'Kota Tangerang'}
                          </span>
                        </div>
                        <div className="px-4 py-3 flex items-start justify-between">
                          <span className="text-xs font-medium text-zinc-500 flex items-center mt-0.5">
                            <MapPin className="w-3.5 h-3.5 mr-1.5" />
                            Alamat Lengkap
                          </span>
                          <span className="text-xs text-zinc-800 max-w-xs text-right">
                            {detail.address || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Catatan Internal Penerimaan */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                        Catatan Internal Divisi Penerimaan
                      </h3>
                      <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                          {detail.notes || 'Tidak ada catatan internal untuk muzakki ini.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Riwayat Donasi / Transaksi */}
                {activeTab === 'riwayat' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-500">
                        Menampilkan transaksi penerimaan terbaru yang tercatat untuk profil ini.
                      </p>
                      <Link
                        href="/penerimaan/transaksi"
                        className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        Buka Ruang Transaksi
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Link>
                    </div>

                    {(!detail.recent_transactions || detail.recent_transactions.length === 0) ? (
                      <div className="p-8 text-center bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
                        <History className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
                        <p className="text-xs font-medium text-zinc-600">Belum ada transaksi donasi yang tercatat.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {detail.recent_transactions.map((tx: PenerimaanTransaction) => (
                          <div
                            key={tx.id}
                            className="p-3.5 bg-white border border-zinc-200 rounded-xl hover:border-zinc-300 transition-colors shadow-sm flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-mono font-bold text-zinc-900">
                                  {tx.transaction_number}
                                </span>
                                <span className="text-xs text-zinc-400">•</span>
                                <span className="text-xs font-medium text-zinc-600">
                                  {formatDate(tx.created_at)}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className="text-xs font-medium text-zinc-500 capitalize">
                                  {tx.channel?.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs text-zinc-300">•</span>
                                <span className="text-xs font-medium text-emerald-700 capitalize">
                                  {tx.fund_type?.replace(/_/g, ' ')}
                                </span>
                                {tx.receipt_number && (
                                  <>
                                    <span className="text-xs text-zinc-300">•</span>
                                    <span className="text-xs font-mono text-zinc-500">
                                      {tx.receipt_number}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-sm font-bold text-zinc-900">
                                {formatRupiah(tx.amount)}
                              </p>
                              <span className={`inline-block px-2 py-0.5 mt-0.5 rounded text-[10px] font-semibold ${
                                tx.status === 'Posted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : tx.status === 'Terverifikasi'
                                  ? 'bg-blue-100 text-blue-800'
                                  : tx.status === 'Ditolak'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {tx.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Log Audit */}
                {activeTab === 'audit' && (
                  <div className="space-y-4">
                    <p className="text-xs text-zinc-500">
                      Riwayat audit perubahan data muzakki bersifat permanen dan tidak dapat dimanipulasi.
                    </p>

                    {auditLoading ? (
                      <div className="space-y-3 py-4 animate-pulse">
                        <div className="h-16 bg-zinc-100 rounded-lg" />
                        <div className="h-16 bg-zinc-100 rounded-lg" />
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <div className="p-8 text-center bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
                        <FileText className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
                        <p className="text-xs font-medium text-zinc-600">Belum ada catatan log audit.</p>
                      </div>
                    ) : (
                      <div className="relative border-l-2 border-zinc-200 ml-3 space-y-4 pl-4 py-2">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="relative">
                            <div className="absolute -left-[23px] top-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white" />
                            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-900 uppercase">
                                  {log.action}
                                </span>
                                <span className="text-[11px] text-zinc-400">
                                  {formatDateTime(log.created_at)}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-600 mt-1">
                                Oleh: <strong className="text-zinc-800">{log.actor_name}</strong> ({log.actor_role})
                              </p>
                              {log.notes && (
                                <p className="text-xs text-zinc-500 mt-1 italic">
                                  "{log.notes}"
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
