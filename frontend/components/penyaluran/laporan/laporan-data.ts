export type ReportCategory =
  | 'Ringkasan'
  | 'Per Program'
  | 'Per Asnaf'
  | 'Per Kecamatan'
  | 'Audit & LPJ';

export type ReportStatus = 'Siap diekspor' | 'Perlu pembaruan' | 'Arsip';

export interface ReportRecord {
  id: string;
  title: string;
  category: ReportCategory;
  period: string;
  updatedAt: string;
  scope: string;
  status: ReportStatus;
  description: string;
}

export interface ReportKpi {
  label: string;
  value: string;
  detail: string;
  trend: string;
}

export interface ReportCategoryOption {
  name: ReportCategory;
  description: string;
  reportCount: number;
}

export interface ReportDistribution {
  label: string;
  value: string;
  percentage: number;
  tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';
}

export interface ReportReadinessItem {
  title: string;
  detail: string;
  status: 'Selesai' | 'Perlu ditinjau' | 'Menunggu data';
}

export const REPORT_CATEGORIES: ReportCategoryOption[] = [
  { name: 'Ringkasan', description: 'Gambaran realisasi periode aktif', reportCount: 1 },
  { name: 'Per Program', description: 'Alokasi dan dampak 5 pilar', reportCount: 1 },
  { name: 'Per Asnaf', description: 'Komposisi penyaluran per penerima', reportCount: 1 },
  { name: 'Per Kecamatan', description: 'Cakupan dan realisasi wilayah', reportCount: 1 },
  { name: 'Audit & LPJ', description: 'Dokumen pertanggungjawaban', reportCount: 1 },
];

export const REPORT_RECORDS: ReportRecord[] = [
  {
    id: 'lap-2026-08-summary',
    title: 'Rekapitulasi Penyaluran ZIS',
    category: 'Ringkasan',
    period: 'Agustus 2026',
    updatedAt: '28 Agustus 2026, 09.30',
    scope: '13 kecamatan · seluruh program',
    status: 'Siap diekspor',
    description: 'Ringkasan dana, mustahik, dan capaian penyaluran periode aktif.',
  },
  {
    id: 'lap-2026-08-program',
    title: 'Realisasi & Dampak Program 5 Pilar',
    category: 'Per Program',
    period: 'Agustus 2026',
    updatedAt: '28 Agustus 2026, 09.12',
    scope: '5 pilar · 128 program aktif',
    status: 'Siap diekspor',
    description: 'Perbandingan alokasi, realisasi, dan dampak tiap program.',
  },
  {
    id: 'lap-2026-08-asnaf',
    title: 'Distribusi Penyaluran per Asnaf',
    category: 'Per Asnaf',
    period: 'Agustus 2026',
    updatedAt: '28 Agustus 2026, 08.48',
    scope: '8 asnaf · 6.842 mustahik',
    status: 'Siap diekspor',
    description: 'Komposisi penerima manfaat dan nilai penyaluran per asnaf.',
  },
  {
    id: 'lap-2026-08-kecamatan',
    title: 'Cakupan Penyaluran per Kecamatan',
    category: 'Per Kecamatan',
    period: 'Agustus 2026',
    updatedAt: '28 Agustus 2026, 08.20',
    scope: '13 kecamatan · 104 kelurahan',
    status: 'Siap diekspor',
    description: 'Sebaran nominal, mustahik, dan titik layanan per wilayah.',
  },
  {
    id: 'lap-2026-08-lpj',
    title: 'LPJ Penyaluran & Kelengkapan Dokumen',
    category: 'Audit & LPJ',
    period: 'Agustus 2026',
    updatedAt: '27 Agustus 2026, 16.45',
    scope: '246 transaksi · 12 dokumen ditinjau',
    status: 'Perlu pembaruan',
    description: 'Daftar kelengkapan dokumen dan catatan pertanggungjawaban.',
  },
];

export const REPORT_KPIS: ReportKpi[] = [
  {
    label: 'Dana tersalurkan',
    value: 'Rp 1,94 M',
    detail: 'Realisasi Agustus 2026',
    trend: '+18,7% dari periode lalu',
  },
  {
    label: 'Mustahik terbantu',
    value: '6.842 jiwa',
    detail: 'Penerima manfaat terverifikasi',
    trend: '+12,4% dari periode lalu',
  },
  {
    label: 'Program aktif',
    value: '128 program',
    detail: 'Dalam 5 pilar penyaluran',
    trend: '246 transaksi tercatat',
  },
  {
    label: 'Kecamatan terjangkau',
    value: '13 / 13',
    detail: 'Seluruh wilayah Kota Tangerang',
    trend: '100% cakupan wilayah',
  },
];

export const PROGRAM_ALLOCATION: ReportDistribution[] = [
  { label: 'Tangerang Cerdas', value: 'Rp 684,25 Jt', percentage: 35.2, tone: 'emerald' },
  { label: 'Tangerang Peduli', value: 'Rp 498,30 Jt', percentage: 25.6, tone: 'amber' },
  { label: 'Tangerang Sehat', value: 'Rp 412,98 Jt', percentage: 21.3, tone: 'sky' },
  { label: 'Tangerang Makmur', value: 'Rp 234,13 Jt', percentage: 12.1, tone: 'violet' },
  { label: 'Tangerang Takwa', value: 'Rp 107,35 Jt', percentage: 5.8, tone: 'rose' },
];

export const ASNAF_DISTRIBUTION: ReportDistribution[] = [
  { label: 'Miskin', value: 'Rp 660 Jt · 2.326 jiwa', percentage: 34, tone: 'emerald' },
  { label: 'Fakir', value: 'Rp 563 Jt · 1.984 jiwa', percentage: 29, tone: 'sky' },
  { label: 'Fisabilillah', value: 'Rp 252 Jt · 876 jiwa', percentage: 13, tone: 'violet' },
  { label: 'Gharim', value: 'Rp 194 Jt · 648 jiwa', percentage: 10, tone: 'amber' },
  { label: 'Asnaf lainnya', value: 'Rp 271 Jt · 1.008 jiwa', percentage: 14, tone: 'rose' },
];

export const REPORT_READINESS: ReportReadinessItem[] = [
  { title: 'Realisasi penyaluran', detail: '246 transaksi telah tersinkronisasi.', status: 'Selesai' },
  { title: 'Validasi mustahik', detail: '6.842 penerima manfaat telah tervalidasi.', status: 'Selesai' },
  { title: 'Dokumen LPJ', detail: '3 dokumen masih menunggu pembaruan.', status: 'Perlu ditinjau' },
  { title: 'Tanda tangan pejabat', detail: 'Dihubungkan saat layanan export tersedia.', status: 'Menunggu data' },
];
