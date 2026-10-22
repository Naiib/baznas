import React from 'react';

export function getStatusMeta(status: string) {
  switch (status) {
    case 'Diajukan':
      return {
        label: 'Tahap 1: Pengajuan Masuk',
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
    case 'Verifikasi Administrasi':
      return {
        label: 'Tahap 2: Verifikasi Syarat',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'Survey':
      return {
        label: 'Tahap 3: Survey Faktual',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'Persetujuan MPZIS':
      return {
        label: 'Tahap 4: Sidang MPZIS',
        className: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    case 'Pengajuan Dana (FPD)':
    case 'Pengajuan Dana (PPD)':
      return {
        label: 'Tahap 5: Pencairan PPD',
        className: 'bg-orange-50 text-orange-700 border-orange-200',
      };
    case 'Penyaluran Selesai':
      return {
        label: 'Tersalurkan (Selesai)',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'Ditolak':
      return {
        label: 'Ditolak',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    default:
      return {
        label: status,
        className: 'bg-zinc-100 text-zinc-700 border-zinc-200',
      };
  }
}

export function StatusBadge({
  status,
  priority,
}: {
  status: string;
  priority?: string;
}) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${meta.className}`}
    >
      <span>{meta.label}</span>
      {priority && (
        <span className="font-medium opacity-80">
          · Prioritas {priority.toLowerCase()}
        </span>
      )}
    </span>
  );
}
