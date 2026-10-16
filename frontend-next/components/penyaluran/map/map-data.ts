import type { PenyaluranByKecamatan } from '@/lib/api/types';

export type MapMetric = 'funds' | 'beneficiaries' | 'asnafNeed';

export function isExplicitDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

export interface KecamatanInsight {
  topProgram: string;
  dominantAsnaf: string;
  priorityNote: string;
  trendPercent: number;
}

export interface MapMetricPresentation {
  label: string;
  unit: string;
}

export type PeriodMetricData = Record<string, { amount: number; beneficiaries: number }>;

export const DEMO_KECAMATAN_DATA: Record<string, Partial<PenyaluranByKecamatan>> = {
  Batuceper: { totalMustahik: 840, totalDisalurkan: 1250000000, desil1Count: 310, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Peduli' },
  Benda: { totalMustahik: 620, totalDisalurkan: 890000000, desil1Count: 240, urgencyLevel: 'Sedang', topProgram: 'Tangerang Cerdas' },
  Cibodas: { totalMustahik: 1120, totalDisalurkan: 1840000000, desil1Count: 420, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Sehat' },
  Ciledug: { totalMustahik: 1350, totalDisalurkan: 2100000000, desil1Count: 510, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Makmur' },
  Cipondoh: { totalMustahik: 1480, totalDisalurkan: 2450000000, desil1Count: 560, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Peduli' },
  Jatiuwung: { totalMustahik: 780, totalDisalurkan: 1150000000, desil1Count: 290, urgencyLevel: 'Sedang', topProgram: 'Tangerang Makmur' },
  Karangtengah: { totalMustahik: 920, totalDisalurkan: 1420000000, desil1Count: 340, urgencyLevel: 'Sedang', topProgram: 'Tangerang Cerdas' },
  Karawaci: { totalMustahik: 1290, totalDisalurkan: 1980000000, desil1Count: 470, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Sehat' },
  Larangan: { totalMustahik: 810, totalDisalurkan: 1210000000, desil1Count: 280, urgencyLevel: 'Sedang', topProgram: 'Tangerang Peduli' },
  Neglasari: { totalMustahik: 950, totalDisalurkan: 1380000000, desil1Count: 380, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Peduli' },
  Periuk: { totalMustahik: 890, totalDisalurkan: 1310000000, desil1Count: 320, urgencyLevel: 'Sedang', topProgram: 'Tangerang Cerdas' },
  Pinang: { totalMustahik: 1050, totalDisalurkan: 1620000000, desil1Count: 390, urgencyLevel: 'Sedang', topProgram: 'Tangerang Makmur' },
  Tangerang: { totalMustahik: 1240, totalDisalurkan: 1950000000, desil1Count: 450, urgencyLevel: 'Tinggi', topProgram: 'Tangerang Peduli' },
};

export const KECAMATAN_INSIGHTS: Record<string, KecamatanInsight> = {
  Batuceper: { topProgram: 'Tangerang Peduli', dominantAsnaf: 'Miskin', priorityNote: 'Percepat verifikasi bantuan sosial untuk keluarga rentan.', trendPercent: 8.4 },
  Benda: { topProgram: 'Tangerang Cerdas', dominantAsnaf: 'Fisabilillah', priorityNote: 'Lengkapi tindak lanjut pendidikan bagi penerima prioritas.', trendPercent: 6.2 },
  Cibodas: { topProgram: 'Tangerang Sehat', dominantAsnaf: 'Miskin', priorityNote: 'Pastikan pendampingan kesehatan lansia berjalan sesuai jadwal.', trendPercent: 11.8 },
  Ciledug: { topProgram: 'Tangerang Makmur', dominantAsnaf: 'Miskin', priorityNote: 'Validasi antrean modal usaha keluarga produktif.', trendPercent: 12.6 },
  Cipondoh: { topProgram: 'Tangerang Peduli', dominantAsnaf: 'Fakir', priorityNote: 'Prioritaskan pencairan bantuan kebutuhan dasar.', trendPercent: 14.2 },
  Jatiuwung: { topProgram: 'Tangerang Makmur', dominantAsnaf: 'Miskin', priorityNote: 'Jadwalkan survei lanjutan untuk pelaku usaha mikro.', trendPercent: 7.5 },
  Karangtengah: { topProgram: 'Tangerang Cerdas', dominantAsnaf: 'Fisabilillah', priorityNote: 'Pantau kelengkapan dokumen program pendidikan.', trendPercent: 9.1 },
  Karawaci: { topProgram: 'Tangerang Sehat', dominantAsnaf: 'Miskin', priorityNote: 'Perkuat bantuan kesehatan bagi lansia miskin.', trendPercent: 14.2 },
  Larangan: { topProgram: 'Tangerang Peduli', dominantAsnaf: 'Fakir', priorityNote: 'Tinjau kembali cakupan bantuan kebutuhan dasar.', trendPercent: 6.8 },
  Neglasari: { topProgram: 'Tangerang Peduli', dominantAsnaf: 'Miskin', priorityNote: 'Validasi prioritas keluarga dengan kebutuhan tertinggi.', trendPercent: 10.3 },
  Periuk: { topProgram: 'Tangerang Cerdas', dominantAsnaf: 'Fisabilillah', priorityNote: 'Konfirmasi penerima bantuan pendidikan yang belum aktif.', trendPercent: 7.9 },
  Pinang: { topProgram: 'Tangerang Makmur', dominantAsnaf: 'Miskin', priorityNote: 'Percepat pendampingan ekonomi untuk keluarga produktif.', trendPercent: 9.7 },
  Tangerang: { topProgram: 'Tangerang Peduli', dominantAsnaf: 'Miskin', priorityNote: 'Selaraskan penyaluran dengan antrean bantuan prioritas.', trendPercent: 13.4 },
};

export const PROGRAM_ALLOCATION = [
  { name: 'Tangerang Sehat', amount: 492_000_000 },
  { name: 'Tangerang Peduli', amount: 394_000_000 },
  { name: 'Tangerang Makmur', amount: 291_000_000 },
  { name: 'Tangerang Cerdas', amount: 214_000_000 },
  { name: 'Tangerang Takwa', amount: 149_000_000 },
];

export const ASNAF_DISTRIBUTION = [
  { name: 'Miskin', count: 490, percentage: 38 },
  { name: 'Fakir', count: 310, percentage: 24 },
  { name: 'Fisabilillah', count: 245, percentage: 19 },
  { name: 'Ibnu Sabil', count: 142, percentage: 11 },
];

const DEFAULT_KECAMATAN_INSIGHT: KecamatanInsight = {
  topProgram: 'Tangerang Peduli',
  dominantAsnaf: 'Miskin',
  priorityNote: 'Tinjau kembali kebutuhan penerima di wilayah ini.',
  trendPercent: 0,
};

const METRIC_PRESENTATIONS: Record<MapMetric, MapMetricPresentation> = {
  funds: { label: 'Realisasi dana', unit: 'Rupiah' },
  beneficiaries: { label: 'Jumlah mustahik', unit: 'jiwa' },
  asnafNeed: { label: 'Kebutuhan asnaf', unit: 'KK prioritas' },
};

export function getKecamatanMapValue(
  name: string,
  metric: MapMetric,
  liveData?: PenyaluranByKecamatan[],
): number {
  if (liveData !== undefined) {
    const data = liveData.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (metric === 'funds') return data?.totalDisalurkan ?? 0;
    if (metric === 'beneficiaries') return data?.totalMustahik ?? 0;
    return data?.desil1Count ?? 0;
  }

  // Demo fallback is only allowed in a non-production build with an explicit flag.
  const data = isExplicitDemoMode() ? DEMO_KECAMATAN_DATA[name] : undefined;

  if (metric === 'funds') return data?.totalDisalurkan ?? 0;
  if (metric === 'beneficiaries') return data?.totalMustahik ?? 0;
  return data?.desil1Count ?? 0;
}

/**
 * Resolves the value shown on the map with a deliberate precedence order:
 * live API response, period dashboard snapshot, then explicit demo fallback.
 */
export function getMapMetricValue(
  name: string,
  metric: MapMetric,
  liveData?: PenyaluranByKecamatan[],
  periodData?: PeriodMetricData,
): number {
  if (liveData !== undefined) {
    const liveValue = liveData.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (liveValue) return getKecamatanMapValue(name, metric, [liveValue]);
    return 0;
  }

  const periodValue = periodData?.[name];
  if (periodValue) {
    if (metric === 'funds') return periodValue.amount;
    if (metric === 'beneficiaries') return periodValue.beneficiaries;
  }

  if (periodData !== undefined) {
    return 0;
  }

  return getKecamatanMapValue(name, metric);
}

export function getKecamatanInsight(name: string): KecamatanInsight {
  return KECAMATAN_INSIGHTS[name] ?? DEFAULT_KECAMATAN_INSIGHT;
}

export function getMapMetricPresentation(metric: MapMetric): MapMetricPresentation {
  return METRIC_PRESENTATIONS[metric];
}

export function getChoroplethColor(count: number): string {
  if (count > 1200) return '#00663d'; // Deep Emerald
  if (count > 900) return '#008B5A';  // Primary BAZNAS Emerald
  if (count > 700) return '#10b981';  // Light Emerald
  if (count > 500) return '#6ee7b7';  // Mint Emerald
  return '#a7f3d0';                   // Soft Tint
}
