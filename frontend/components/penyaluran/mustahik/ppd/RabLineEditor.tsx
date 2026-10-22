'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { RabLine } from '@/lib/api/penyaluran-p0-types';
import { formatRupiah, numberToTerbilang } from '../shared/MoneyInput';

export interface RabLineEditorProps {
  lines: RabLine[];
  onChange?: (lines: RabLine[]) => void;
  mpzisCeilingAmount?: number | null;
  mpzisCeiling?: number | null;
  readOnly?: boolean;
  errors?: Record<string, string>;
  className?: string;
}

export function RabLineEditor({
  lines,
  onChange,
  mpzisCeilingAmount,
  mpzisCeiling,
  readOnly = false,
  errors = {},
  className = '',
}: RabLineEditorProps) {
  const ceiling = mpzisCeilingAmount ?? mpzisCeiling ?? null;

  // Ensure there's always at least one row if empty and not readonly
  const effectiveLines: RabLine[] = useMemo(() => {
    if (Array.isArray(lines) && lines.length > 0) {
      return lines;
    }
    return [
      {
        line_no: 1,
        register_number: 'RAB-01',
        description: '',
        deskripsi: '',
        jumlah: 1,
        harga_satuan: 0,
        total: 0,
        amount: 0,
      },
    ];
  }, [lines]);

  const grandTotal = useMemo(() => {
    return effectiveLines.reduce((sum, line) => {
      const vol = Number(line.jumlah ?? 1) || 1;
      const unit = Number(line.harga_satuan ?? 0) || 0;
      const rowTotal = line.total !== undefined && line.total !== null ? Number(line.total) : vol * unit;
      return sum + rowTotal;
    }, 0);
  }, [effectiveLines]);

  const isExceeded = useMemo(() => {
    if (ceiling === null || ceiling === undefined) return false;
    return grandTotal > ceiling;
  }, [grandTotal, ceiling]);

  const selisih = useMemo(() => {
    if (ceiling === null || ceiling === undefined) return null;
    return ceiling - grandTotal;
  }, [grandTotal, ceiling]);

  const handleAddLine = () => {
    if (readOnly || effectiveLines.length >= 3) return;
    const nextLineNo = effectiveLines.length + 1;
    const newLine: RabLine = {
      line_no: nextLineNo,
      register_number: `RAB-0${nextLineNo}`,
      description: '',
      deskripsi: '',
      jumlah: 1,
      harga_satuan: 0,
      total: 0,
      amount: 0,
    };
    onChange?.([...effectiveLines, newLine]);
  };

  const handleDeleteLine = (index: number) => {
    if (readOnly || effectiveLines.length <= 1) return;
    const filtered = effectiveLines.filter((_, idx) => idx !== index);
    const renumbered = filtered.map((line, idx) => ({
      ...line,
      line_no: idx + 1,
      register_number: line.register_number?.startsWith('RAB-') ? `RAB-0${idx + 1}` : line.register_number || `RAB-0${idx + 1}`,
    }));
    onChange?.(renumbered);
  };

  const handleFieldChange = (index: number, field: keyof RabLine, value: unknown) => {
    if (readOnly) return;
    const updated = effectiveLines.map((line, idx) => {
      if (idx !== index) return line;

      const nextLine = { ...line };
      if (field === 'description' || field === 'deskripsi') {
        const textVal = String(value ?? '');
        nextLine.description = textVal;
        nextLine.deskripsi = textVal;
      } else if (field === 'register_number') {
        nextLine.register_number = String(value ?? '');
      } else if (field === 'jumlah') {
        const parsed = parseInt(String(value ?? '1'), 10);
        const qty = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
        nextLine.jumlah = qty;
        const unitPrice = Number(nextLine.harga_satuan ?? 0) || 0;
        const total = qty * unitPrice;
        nextLine.total = total;
        nextLine.amount = total;
      } else if (field === 'harga_satuan') {
        let parsed = 0;
        if (typeof value === 'number') {
          parsed = Number.isNaN(value) ? 0 : value;
        } else {
          const digits = String(value ?? '').replace(/\D/g, '');
          parsed = digits ? parseInt(digits, 10) : 0;
        }
        nextLine.harga_satuan = parsed;
        const qty = Number(nextLine.jumlah ?? 1) || 1;
        const total = qty * parsed;
        nextLine.total = total;
        nextLine.amount = total;
      }
      return nextLine;
    });

    onChange?.(updated);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-extrabold text-slate-900">
            Rencana Anggaran Biaya (RAB)
          </h4>
          <p className="text-xs text-slate-500">
            Rincian alokasi dana 1–3 baris sesuai standar formulir F-PKP/03.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleAddLine}
            disabled={effectiveLines.length >= 3}
            aria-label="Tambah Baris RAB"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            Tambah Baris RAB ({effectiveLines.length}/3)
          </button>
        )}
      </div>

      {errors.rab_lines && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
          {errors.rab_lines}
        </div>
      )}

      {/* RAB Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs" aria-label="Tabel Rencana Anggaran Biaya">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-extrabold">
            <tr>
              <th scope="col" className="p-3 w-12 text-center">No</th>
              <th scope="col" className="p-3 w-28">No. Reg</th>
              <th scope="col" className="p-3 min-w-[200px]">Uraian Kebutuhan</th>
              <th scope="col" className="p-3 w-20 text-right">Volume</th>
              <th scope="col" className="p-3 w-40 text-right">Harga Satuan (Rp)</th>
              <th scope="col" className="p-3 w-40 text-right">Total (Rp)</th>
              {!readOnly && <th scope="col" className="p-3 w-16 text-center">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {effectiveLines.map((line, index) => {
              const lineNo = line.line_no || index + 1;
              const vol = Number(line.jumlah ?? 1) || 1;
              const unit = Number(line.harga_satuan ?? 0) || 0;
              const lineTotal = line.total !== undefined && line.total !== null ? Number(line.total) : vol * unit;
              const descError = errors[`rab_lines.${index}.description`] || errors[`rab_lines.${index}.deskripsi`];
              const amountError = errors[`rab_lines.${index}.amount`] || errors[`rab_lines.${index}.harga_satuan`];

              return (
                <tr key={line.id || `rab-line-${index}`} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 text-center font-mono font-bold text-slate-700">
                    {lineNo}
                  </td>
                  <td className="p-3">
                    {readOnly ? (
                      <span className="font-mono text-slate-700">{line.register_number}</span>
                    ) : (
                      <input
                        type="text"
                        value={line.register_number || `RAB-0${lineNo}`}
                        onChange={(e) => handleFieldChange(index, 'register_number', e.target.value)}
                        aria-label={`Nomor Register Baris ${lineNo}`}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[38px]"
                      />
                    )}
                  </td>
                  <td className="p-3">
                    {readOnly ? (
                      <span className="font-medium text-slate-900">{line.description || line.deskripsi || '-'}</span>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={line.description || line.deskripsi || ''}
                          onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                          placeholder="Misal: Bantuan Biaya Berobat / Modal Usaha"
                          aria-label={`Uraian Kebutuhan Baris ${lineNo}`}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 min-h-[38px] ${
                            descError
                              ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                          }`}
                        />
                        {(line.description || line.deskripsi) && (
                          <span className="sr-only">{line.description || line.deskripsi}</span>
                        )}
                        {descError && (
                          <p className="text-[11px] font-semibold text-rose-600">{descError}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {readOnly ? (
                      <span className="font-mono text-slate-800">{vol}</span>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={vol}
                        onChange={(e) => handleFieldChange(index, 'jumlah', e.target.value)}
                        aria-label={`Volume Baris ${lineNo}`}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 min-h-[38px]"
                      />
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {readOnly ? (
                      <span className="font-mono text-slate-800">{formatRupiah(unit)}</span>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={unit > 0 ? unit.toLocaleString('id-ID') : ''}
                          onChange={(e) => handleFieldChange(index, 'harga_satuan', e.target.value)}
                          placeholder="0"
                          aria-label={`Harga Satuan Baris ${lineNo}`}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-right font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 min-h-[38px] ${
                            amountError
                              ? 'border-rose-400 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                          }`}
                        />
                        {amountError && (
                          <p className="text-[11px] font-semibold text-rose-600">{amountError}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatRupiah(lineTotal)}
                  </td>
                  {!readOnly && (
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteLine(index)}
                        disabled={effectiveLines.length <= 1}
                        aria-label={`Hapus Baris RAB ${lineNo}`}
                        title={effectiveLines.length <= 1 ? 'Minimal 1 baris RAB' : `Hapus baris ${lineNo}`}
                        className="inline-flex size-9 min-h-[36px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
            <tr>
              <td colSpan={readOnly ? 5 : 5} className="p-3 text-right text-xs uppercase tracking-wider text-slate-600">
                Grand Total RAB:
              </td>
              <td className={`p-3 text-right font-mono text-sm font-black ${isExceeded ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatRupiah(grandTotal)}
              </td>
              {!readOnly && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Terbilang Grand Total */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
        <span className="font-bold text-slate-600">Terbilang Total: </span>
        <span className="font-semibold italic text-slate-900">
          {numberToTerbilang(grandTotal)}
        </span>
      </div>

      {/* MPZIS Ceiling Reconciliation Banner */}
      {ceiling !== null && ceiling !== undefined && ceiling > 0 && (
        <div
          role={isExceeded ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-2xl border p-4 text-xs ${
            isExceeded
              ? 'border-rose-300 bg-rose-50/80 text-rose-900'
              : 'border-emerald-300 bg-emerald-50/80 text-emerald-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {isExceeded ? (
              <AlertTriangle className="size-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="space-y-1">
              <p className="font-extrabold">
                {isExceeded
                  ? 'Peringatan: Total RAB Melebihi Pagu MPZIS yang Disetujui'
                  : 'Rekonsiliasi Pagu MPZIS Sesuai'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span>
                  Batas Pagu MPZIS: <strong className="font-mono">{formatRupiah(ceiling)}</strong>
                </span>
                <span>
                  Total RAB Pengajuan: <strong className="font-mono">{formatRupiah(grandTotal)}</strong>
                </span>
                {selisih !== null && (
                  <span>
                    {isExceeded ? (
                      <>Kelebihan: <strong className="font-mono text-rose-700">+{formatRupiah(Math.abs(selisih))}</strong></>
                    ) : (
                      <>Sisa Pagu: <strong className="font-mono text-emerald-700">{formatRupiah(selisih)}</strong></>
                    )}
                  </span>
                )}
              </div>
              {isExceeded && (
                <p className="font-semibold text-rose-800">
                  Pengajuan PPD tidak dapat dikirim selama nominal RAB melebihi pagu yang telah disetujui pada tahap MPZIS.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RabLineEditor;
