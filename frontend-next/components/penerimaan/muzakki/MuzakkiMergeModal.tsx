'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  GitMerge,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  User,
  History,
  TrendingUp,
} from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { DuplicateMuzakkiSuggestion, Muzakki } from '@/lib/api/types';

interface MuzakkiMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMergeSuccess: () => void;
}

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

export function MuzakkiMergeModal({
  isOpen,
  onClose,
  onMergeSuccess,
}: MuzakkiMergeModalProps) {
  const [suggestions, setSuggestions] = useState<DuplicateMuzakkiSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [mergingIndex, setMergingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSuggestions = () => {
    setLoading(true);
    setError(null);
    penerimaanApi
      .getDuplicateMuzakkiSuggestions()
      .then((res) => {
        if (res.success && res.data) {
          setSuggestions(res.data);
        } else {
          setError(res.message || 'Gagal memuat saran duplikat.');
        }
      })
      .catch((err) => {
        setError(err.message || 'Terjadi kesalahan sistem.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMerge = async (suggestion: DuplicateMuzakkiSuggestion, index: number) => {
    setError(null);
    setSuccessMsg(null);
    setMergingIndex(index);

    try {
      const primaryId = suggestion.primary.id;
      const duplicateIds = suggestion.duplicates.map((d) => d.id);

      const res = await penerimaanApi.mergeMuzakki(primaryId, duplicateIds);
      if (res.success) {
        setSuccessMsg(
          `Berhasil menggabungkan ${duplicateIds.length} profil duplikat ke dalam profil "${suggestion.primary.name}".`
        );
        // Remove merged suggestion from list
        setSuggestions((prev) => prev.filter((_, i) => i !== index));
        onMergeSuccess();
      } else {
        setError(res.message || 'Gagal menggabungkan profil muzakki.');
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat penggabungan profil.');
    } finally {
      setMergingIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-merge-title">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all border border-zinc-200 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/80">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <GitMerge className="w-5 h-5" />
              </div>
              <div>
                <h3 id="modal-merge-title" className="text-lg font-bold text-zinc-900">
                  Saran Penggabungan Profil Duplikat
                </h3>
                <p className="text-xs text-zinc-500">
                  Deteksi otomatis entri berulang berdasarkan kesamaan telepon, NIK/NPWP, email, atau nama
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100"
              aria-label="Tutup saran penggabungan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Notifications */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="space-y-4 py-8 animate-pulse">
                <div className="h-28 bg-zinc-100 rounded-xl" />
                <div className="h-28 bg-zinc-100 rounded-xl" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 border border-dashed border-zinc-200 rounded-2xl">
                <ShieldCheck className="w-10 h-10 mx-auto text-emerald-600 mb-2" />
                <h4 className="text-sm font-bold text-zinc-800">Tidak Ditemukan Duplikasi Data</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                  Database muzakki dalam kondisi bersih. Tidak ada kesamaan identitas, nomor telepon, atau profil ganda yang terdeteksi.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Peringatan Penggabungan:</strong> Semua riwayat donasi dari profil duplikat akan dialihkan ke profil utama. Profil duplikat akan dihapus secara permanen dan dicatat dalam log audit akuntabilitas.
                  </span>
                </div>

                {suggestions.map((suggestion, idx) => {
                  const isMergingThis = mergingIndex === idx;

                  return (
                    <div
                      key={idx}
                      className="p-5 bg-white border border-zinc-200 rounded-2xl shadow-sm hover:border-zinc-300 transition-all space-y-4"
                    >
                      {/* Reason & Confidence Badge */}
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                          {suggestion.match_reason}
                        </span>
                        <span className="text-xs font-mono font-medium text-zinc-500">
                          Tingkat Keyakinan: {suggestion.confidence}%
                        </span>
                      </div>

                      {/* Comparison Columns */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Primary Record */}
                        <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl relative">
                          <span className="absolute -top-2.5 left-3 px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                            Profil Utama (Pertahankan)
                          </span>
                          <div className="mt-1">
                            <h5 className="text-sm font-bold text-zinc-900">
                              {suggestion.primary.name}
                            </h5>
                            <p className="text-xs font-mono text-zinc-500 mt-0.5">
                              {suggestion.primary.npwz || 'Tanpa NPWZ'} • {suggestion.primary.city || 'Kota Tangerang'}
                            </p>
                            <div className="mt-3 flex items-center space-x-3 text-xs text-zinc-700">
                              <span className="flex items-center">
                                <TrendingUp className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                <strong>{formatRupiah(suggestion.primary.total_donations_amount || '0')}</strong>
                              </span>
                              <span className="flex items-center">
                                <History className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                                {suggestion.primary.total_donations_count || 0} donasi
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-2">
                              Kontak: {suggestion.primary.phone || '-'} • {suggestion.primary.email || '-'}
                            </p>
                          </div>
                        </div>

                        {/* Duplicates to merge */}
                        <div className="p-4 bg-red-50/30 border border-red-200 rounded-xl relative">
                          <span className="absolute -top-2.5 left-3 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                            Duplikat ({suggestion.duplicates.length})
                          </span>
                          <div className="mt-1 space-y-3 divide-y divide-red-100">
                            {suggestion.duplicates.map((dup) => (
                              <div key={dup.id} className="pt-2 first:pt-0">
                                <h5 className="text-sm font-bold text-zinc-900">{dup.name}</h5>
                                <p className="text-xs font-mono text-zinc-500 mt-0.5">
                                  {dup.npwz || 'Tanpa NPWZ'} • {dup.city || 'Kota Tangerang'}
                                </p>
                                <div className="mt-2 flex items-center space-x-3 text-xs text-zinc-700">
                                  <span className="flex items-center">
                                    <TrendingUp className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                                    <strong>{formatRupiah(dup.total_donations_amount || '0')}</strong>
                                  </span>
                                  <span className="flex items-center">
                                    <History className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                                    {dup.total_donations_count || 0} donasi
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-1">
                                  Kontak: {dup.phone || '-'} • {dup.email || '-'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="pt-2 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleMerge(suggestion, idx)}
                          disabled={isMergingThis}
                          className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                        >
                          {isMergingThis ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Menggabungkan...
                            </>
                          ) : (
                            <>
                              <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                              Konfirmasi & Gabungkan Profil
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {suggestions.length} saran penggabungan tersisa
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
