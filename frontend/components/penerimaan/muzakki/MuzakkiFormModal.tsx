'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Building, Shield, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { penerimaanApi } from '@/lib/api/penerimaan';
import type { Muzakki, MuzakkiDetail } from '@/lib/api/types';

interface MuzakkiFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (muzakki: Muzakki) => void;
  initialData?: MuzakkiDetail | null;
}

export function MuzakkiFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: MuzakkiFormModalProps) {
  const [type, setType] = useState<'individu' | 'lembaga' | 'anonim'>('individu');
  const [name, setName] = useState('');
  const [npwz, setNpwz] = useState('');
  const [identityType, setIdentityType] = useState('ktp');
  const [identityNumber, setIdentityNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Kota Tangerang');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setType(initialData.type || 'individu');
      setName(initialData.name || '');
      setNpwz(initialData.npwz || '');
      setIdentityType(initialData.identity_type || 'ktp');
      setIdentityNumber(initialData.identity_number || '');
      setPhone(initialData.phone || '');
      setEmail(initialData.email || '');
      setAddress(initialData.address || '');
      setCity(initialData.city || 'Kota Tangerang');
      setNotes(initialData.notes || '');
    } else {
      setType('individu');
      setName('');
      setNpwz('');
      setIdentityType('ktp');
      setIdentityNumber('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCity('Kota Tangerang');
      setNotes('');
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName && type !== 'anonim') {
      setError('Nama muzakki wajib diisi.');
      return;
    }

    setSaving(true);

    try {
      const payload: Partial<Muzakki> = {
        type,
        name: type === 'anonim' && !trimmedName ? 'Hamba Allah' : trimmedName,
        npwz: npwz.trim() || undefined,
        identity_type: identityType,
        identity_number: identityNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || 'Kota Tangerang',
        notes: notes.trim() || undefined,
      };

      if (initialData?.id) {
        const res = await penerimaanApi.updateMuzakki(initialData.id, payload);
        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(res.message || 'Gagal memperbarui profil muzakki.');
        }
      } else {
        const res = await penerimaanApi.createMuzakki(payload);
        if (res.success && res.data) {
          onSuccess(res.data);
          onClose();
        } else {
          setError(res.message || 'Gagal mendaftarkan muzakki.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat menyimpan data muzakki.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="modal-muzakki-title">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all border border-zinc-200">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
            <div>
              <h3 id="modal-muzakki-title" className="text-lg font-bold text-zinc-900">
                {initialData ? 'Edit Profil Muzakki' : 'Tambah Muzakki Baru'}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Pencatatan profil donatur untuk akuntabilitas zakat, infak, dan sedekah
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100"
              aria-label="Tutup form muzakki"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Profile Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2">
                Tipe Profil Donatur
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setType('individu')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                    type === 'individu'
                      ? 'border-emerald-500 bg-emerald-50/60 text-emerald-900 ring-1 ring-emerald-500'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span className="text-xs font-semibold">Individu</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('lembaga')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                    type === 'lembaga'
                      ? 'border-purple-500 bg-purple-50/60 text-purple-900 ring-1 ring-purple-500'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span className="text-xs font-semibold">Lembaga</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType('anonim');
                    if (!name) setName('Hamba Allah');
                  }}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-center space-y-1 ${
                    type === 'anonim'
                      ? 'border-amber-500 bg-amber-50/60 text-amber-900 ring-1 ring-amber-500'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-xs font-semibold">Anonim</span>
                </button>
              </div>
            </div>

            {/* Nama Lengkap */}
            <div>
              <label htmlFor="muzakki-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                Nama Lengkap / Nama Entitas {type !== 'anonim' && <span className="text-red-500">*</span>}
              </label>
              <input
                id="muzakki-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'anonim' ? 'Hamba Allah' : 'Contoh: H. Ahmad Fauzi / PT Berkah Mandiri'}
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* NPWZ */}
            <div>
              <label htmlFor="muzakki-npwz" className="block text-xs font-semibold text-zinc-700 mb-1">
                NPWZ (Nomor Pokok Wajib Zakat)
              </label>
              <input
                id="muzakki-npwz"
                type="text"
                value={npwz}
                onChange={(e) => setNpwz(e.target.value)}
                placeholder="Kosongkan untuk penomoran otomatis (NPWZ-YYYY-XXXX)"
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Identitas (KTP / NPWP) */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="muzakki-id-type" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Jenis Identitas
                </label>
                <select
                  id="muzakki-id-type"
                  value={identityType}
                  onChange={(e) => setIdentityType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ktp">KTP</option>
                  <option value="npwp">NPWP</option>
                  <option value="nib">NIB</option>
                  <option value="paspor">Paspor</option>
                  <option value="sim">SIM</option>
                  <option value="lainnya">Lainnya</option>
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="muzakki-id-number" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Nomor Identitas (NIK/NPWP)
                </label>
                <input
                  id="muzakki-id-number"
                  type="text"
                  value={identityNumber}
                  onChange={(e) => setIdentityNumber(e.target.value)}
                  placeholder="Contoh: 3271012345670001"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Telepon & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="muzakki-phone" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  id="muzakki-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Contoh: 081234567890"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="muzakki-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Alamat Email
                </label>
                <input
                  id="muzakki-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Contoh: donatur@email.com"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Kota & Alamat */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label htmlFor="muzakki-city" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Kota / Kabupaten
                </label>
                <input
                  id="muzakki-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Kota Tangerang"
                  className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="muzakki-address" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Alamat Lengkap
                </label>
                <input
                  id="muzakki-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. Merdeka No. 12, RT 01/RW 02"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Catatan Internal */}
            <div>
              <label htmlFor="muzakki-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
                Catatan Internal (Divisi Penerimaan)
              </label>
              <textarea
                id="muzakki-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferensi zakat, waktu penyetoran, atau relasi kantor..."
                className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                    {initialData ? 'Simpan Perubahan' : 'Daftarkan Muzakki'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
