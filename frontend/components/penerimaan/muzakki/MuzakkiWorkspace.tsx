'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  User,
  Building,
  Shield,
  Plus,
  GitMerge,
  RefreshCw,
  Phone,
  Mail,
  Lock,
  ChevronRight,
  TrendingUp,
  History,
  AlertCircle,
  Clock,
  ArrowRight,
  Users,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import { useAuth } from '@/components/auth/AuthProvider';
import { MuzakkiDetailDrawer } from './MuzakkiDetailDrawer';
import { MuzakkiFormModal } from './MuzakkiFormModal';
import { MuzakkiMergeModal } from './MuzakkiMergeModal';
import type { Muzakki, MuzakkiDetail } from '@/lib/api/types';

function formatRupiah(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'Rp 0';
  const clean = String(amount).replace(/[^0-9-]/g, '');
  if (!clean || clean === '-') return 'Rp 0';
  const negative = clean.startsWith('-');
  const digits = negative ? clean.slice(1) : clean;
  return `${negative ? '-Rp ' : 'Rp '}${BigInt(digits || '0').toLocaleString('id-ID')}`;
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

export function MuzakkiWorkspace() {
  const { user } = useAuth();

  // State
  const [items, setItems] = useState<Muzakki[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Duplicates badge
  const [duplicateCount, setDuplicateCount] = useState<number>(0);

  // Modals & Drawer
  const [selectedMuzakkiId, setSelectedMuzakkiId] = useState<number | string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMuzakki, setEditingMuzakki] = useState<MuzakkiDetail | null>(null);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load duplicate count
  const checkDuplicates = useCallback(() => {
    penerimaanApi
      .getDuplicateMuzakkiSuggestions()
      .then((res) => {
        if (res.success && res.data) {
          setDuplicateCount(res.data.length);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkDuplicates();
  }, [checkDuplicates]);

  // Fetch muzakki list
  const fetchList = useCallback(
    async (cursor?: string | null, isInitial = false) => {
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const res = await penerimaanApi.getMuzakkiList({
          search: debouncedSearch || undefined,
          type: (typeFilter as any) || undefined,
          cursor: cursor || undefined,
          limit: 20,
        });

        if (res.success && res.data) {
          const responseData = res.data;
          if (isInitial || !cursor) {
            setItems(responseData.items || []);
          } else {
            setItems((prev) => [...prev, ...(responseData.items || [])]);
          }
          setNextCursor(responseData.next_cursor || null);
          setHasMore(Boolean(responseData.has_more));
          if (responseData.total_count !== undefined) {
            setTotalCount(responseData.total_count);
          }
        } else {
          setError(res.message || 'Gagal memuat daftar muzakki.');
        }
      } catch (err: any) {
        setError(err.message || 'Terjadi kesalahan sistem saat memuat data.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, typeFilter]
  );

  useEffect(() => {
    fetchList(null, true);
  }, [fetchList]);

  // Handle Create / Edit Success
  const handleFormSuccess = () => {
    fetchList(null, true);
    checkDuplicates();
  };

  // Handle Merge Success
  const handleMergeSuccess = () => {
    fetchList(null, true);
    checkDuplicates();
  };

  // Metrics breakdown
  const stats = useMemo(() => {
    const individu = items.filter((m) => m.type === 'individu').length;
    const lembaga = items.filter((m) => m.type === 'lembaga').length;
    const anonim = items.filter((m) => m.type === 'anonim' || m.name?.toLowerCase().includes('hamba allah')).length;
    return { individu, lembaga, anonim };
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center">
            <Users className="w-6 h-6 mr-2.5 text-emerald-600" />
            Direktori Muzakki & Donatur
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Pencatatan profil muzakki, riwayat kontribusi donasi, privasi donatur anonim, dan konsolidasi entri ganda
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Duplicate Suggestions Button */}
          <button
            type="button"
            onClick={() => setIsMergeOpen(true)}
            className={`relative inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shadow-sm ${
              duplicateCount > 0
                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 ring-1 ring-amber-300'
                : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
            <span>Saran Penggabungan</span>
            {duplicateCount > 0 && (
              <span className="ml-2 px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                {duplicateCount}
              </span>
            )}
          </button>

          {/* Add Muzakki Button */}
          <button
            type="button"
            onClick={() => {
              setEditingMuzakki(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Tambah Muzakki</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
          <p className="text-xs font-medium text-zinc-500">Total Terdaftar</p>
          <p className="text-xl font-bold text-zinc-900 mt-1">{totalCount || items.length}</p>
          <span className="text-[11px] text-zinc-400">Semua entitas muzakki</span>
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
          <p className="text-xs font-medium text-blue-600 flex items-center">
            <User className="w-3.5 h-3.5 mr-1" />
            Individu
          </p>
          <p className="text-xl font-bold text-zinc-900 mt-1">{stats.individu}</p>
          <span className="text-[11px] text-zinc-400">Profil perorangan</span>
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
          <p className="text-xs font-medium text-purple-600 flex items-center">
            <Building className="w-3.5 h-3.5 mr-1" />
            Lembaga / Korporasi
          </p>
          <p className="text-xl font-bold text-zinc-900 mt-1">{stats.lembaga}</p>
          <span className="text-[11px] text-zinc-400">Instansi / Perusahaan</span>
        </div>
        <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
          <p className="text-xs font-medium text-amber-600 flex items-center">
            <Shield className="w-3.5 h-3.5 mr-1" />
            Anonim
          </p>
          <p className="text-xl font-bold text-zinc-900 mt-1">{stats.anonim}</p>
          <span className="text-[11px] text-zinc-400">Privasi PII dilindungi</span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="p-3 bg-white border border-zinc-200 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama, NPWZ, telepon, atau NIK..."
            className="w-full pl-9 pr-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        {/* Type Filter Tabs */}
        <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
          {[
            { label: 'Semua', value: '' },
            { label: 'Individu', value: 'individu' },
            { label: 'Lembaga', value: 'lembaga' },
            { label: 'Anonim', value: 'anonim' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setTypeFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                typeFilter === tab.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => fetchList(null, true)}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 ml-1"
            title="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {error ? (
        <div className="p-8 text-center bg-white border border-red-200 rounded-2xl">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-bold text-zinc-900">Gagal Memuat Data Muzakki</p>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => fetchList(null, true)}
            className="mt-4 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100"
          >
            Coba Lagi
          </button>
        </div>
      ) : loading ? (
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-4 animate-pulse">
          <div className="h-8 bg-zinc-100 rounded-xl w-1/3" />
          <div className="h-12 bg-zinc-100 rounded-xl" />
          <div className="h-12 bg-zinc-100 rounded-xl" />
          <div className="h-12 bg-zinc-100 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center bg-white border border-zinc-200 rounded-2xl shadow-sm">
          <User className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-zinc-900">Tidak Ada Muzakki Ditemukan</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
            {searchTerm || typeFilter
              ? 'Tidak ada data muzakki yang cocok dengan kriteria pencarian dan filter.'
              : 'Belum ada muzakki yang terdaftar di sistem. Daftarkan muzakki baru sekarang.'}
          </p>
          <div className="mt-4 flex items-center justify-center space-x-2">
            {(searchTerm || typeFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200"
              >
                Reset Filter
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingMuzakki(null);
                setIsFormOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700"
            >
              Tambah Muzakki Baru
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden md:block bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Donatur & NPWZ</th>
                  <th className="px-4 py-3.5">Tipe</th>
                  <th className="px-4 py-3.5">Kontak & Identitas</th>
                  <th className="px-4 py-3.5 text-right">Total Donasi</th>
                  <th className="px-4 py-3.5">Donasi Terakhir</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {items.map((muzakki) => {
                  const isAnon =
                    muzakki.type === 'anonim' ||
                    muzakki.name?.toLowerCase().includes('hamba allah') ||
                    muzakki.name?.toLowerCase().includes('anonim');

                  return (
                    <tr
                      key={muzakki.id}
                      onClick={() => setSelectedMuzakkiId(muzakki.id)}
                      className="hover:bg-zinc-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isAnon
                                ? 'bg-amber-100 text-amber-700'
                                : muzakki.type === 'lembaga'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isAnon ? (
                              <Shield className="w-4 h-4" />
                            ) : muzakki.type === 'lembaga' ? (
                              <Building className="w-4 h-4" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-zinc-900 group-hover:text-emerald-700 transition-colors">
                              {muzakki.name}
                            </span>
                            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                              {muzakki.npwz || 'Tanpa NPWZ'} • {muzakki.city || 'Kota Tangerang'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            isAnon
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : muzakki.type === 'lembaga'
                              ? 'bg-purple-50 text-purple-800 border border-purple-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isAnon ? 'Anonim' : muzakki.type === 'lembaga' ? 'Lembaga' : 'Individu'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="space-y-0.5 text-zinc-600">
                          {muzakki.phone ? (
                            <p className="font-mono flex items-center text-[11px]">
                              {muzakki.phone.includes('*') && (
                                <Lock className="w-3 h-3 mr-1 text-amber-600 shrink-0" />
                              )}
                              {muzakki.phone}
                            </p>
                          ) : (
                            <p className="text-zinc-400 text-[11px]">-</p>
                          )}
                          {muzakki.identity_number && (
                            <p className="font-mono text-zinc-400 text-[10px]">
                              {muzakki.identity_type?.toUpperCase() || 'ID'}: {muzakki.identity_number}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <span className="font-bold text-zinc-900">
                          {formatRupiah(muzakki.total_donations_amount || '0')}
                        </span>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {muzakki.total_donations_count || 0} donasi
                        </p>
                      </td>

                      <td className="px-4 py-4 text-zinc-600 text-[11px]">
                        {formatDate(muzakki.last_donation_date)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMuzakkiId(muzakki.id);
                          }}
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          Detail
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {items.map((muzakki) => {
              const isAnon =
                muzakki.type === 'anonim' ||
                muzakki.name?.toLowerCase().includes('hamba allah') ||
                muzakki.name?.toLowerCase().includes('anonim');

              return (
                <div
                  key={muzakki.id}
                  onClick={() => setSelectedMuzakkiId(muzakki.id)}
                  className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-3 cursor-pointer active:bg-zinc-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isAnon
                            ? 'bg-amber-100 text-amber-700'
                            : muzakki.type === 'lembaga'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isAnon ? (
                          <Shield className="w-4 h-4" />
                        ) : muzakki.type === 'lembaga' ? (
                          <Building className="w-4 h-4" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-zinc-900">{muzakki.name}</h4>
                        <p className="text-xs font-mono text-zinc-500 mt-0.5">
                          {muzakki.npwz || 'Tanpa NPWZ'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                        isAnon
                          ? 'bg-amber-100 text-amber-800'
                          : muzakki.type === 'lembaga'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {isAnon ? 'Anonim' : muzakki.type === 'lembaga' ? 'Lembaga' : 'Individu'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-100">
                    <div>
                      <span className="text-zinc-400 text-[11px]">Total Donasi:</span>
                      <p className="font-bold text-zinc-900">
                        {formatRupiah(muzakki.total_donations_amount || '0')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 text-[11px]">Frekuensi:</span>
                      <p className="font-medium text-zinc-700">
                        {muzakki.total_donations_count || 0} kali
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => fetchList(nextCursor, false)}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-xl text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
              >
                {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak Donatur'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      <MuzakkiDetailDrawer
        muzakkiId={selectedMuzakkiId}
        isOpen={Boolean(selectedMuzakkiId)}
        onClose={() => setSelectedMuzakkiId(null)}
        onEdit={(muzakki) => {
          setSelectedMuzakkiId(null);
          setEditingMuzakki(muzakki);
          setIsFormOpen(true);
        }}
      />

      {/* Form Modal (Create / Edit) */}
      <MuzakkiFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingMuzakki(null);
        }}
        onSuccess={handleFormSuccess}
        initialData={editingMuzakki}
      />

      {/* Merge Modal (Duplicates) */}
      <MuzakkiMergeModal
        isOpen={isMergeOpen}
        onClose={() => setIsMergeOpen(false)}
        onMergeSuccess={handleMergeSuccess}
      />
    </div>
  );
}
