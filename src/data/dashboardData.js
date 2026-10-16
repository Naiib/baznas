// Realistic BAZNAS national-scale mock data

export const METRICS = {
  totalPenerimaan: 2_450_000_000_000,   // 2.45 Triliun
  totalPenyaluran: 1_890_000_000_000,   // 1.89 Triliun
  saldoDana: 560_000_000_000,            // 560 Miliar
  totalMuzakki: 2_345_000,               // 2.345.000 orang
  totalMustahik: 5_678_000,              // 5.678.000 orang
};

export const INSTITUTION_PROFILE = {
  activePrograms: 24,
  registeredUpz: 500,
  totalEmployees: 87,
  partners: 42,
};

export const ZAKAT_FITRAH = {
  targetMuzakki: 500_000,
  collectedMuzakki: 387_000,
  totalAmount: 77_400_000_000,           // Rp 77,4 Miliar
  daysRemaining: 12,
};

export const ASN_DATA = {
  totalContributors: 42_000,
  totalCollection: 210_000_000_000,      // Rp 210 Miliar
  upzUnits: 1_247,
  trendData: [
    { month: 'Agu', value: 14_000 },
    { month: 'Sep', value: 16_500 },
    { month: 'Okt', value: 18_200 },
    { month: 'Nov', value: 22_000 },
    { month: 'Des', value: 28_000 },
    { month: 'Jan', value: 32_000 },
    { month: 'Feb', value: 35_000 },
    { month: 'Mar', value: 38_000 },
    { month: 'Apr', value: 42_000 },
  ],
};

export const PROGRAMS = [
  { name: 'Pendidikan', value: 1_234_000, color: '#059669' },
  { name: 'Kesehatan', value: 890_000, color: '#3b82f6' },
  { name: 'Ekonomi', value: 567_000, color: '#f59e0b' },
  { name: 'Sosial', value: 2_345_000, color: '#8b5cf6' },
];

export const TRANSACTIONS = [
  { date: '2026-07-04', muzakki: 'PT Sejahtera Abadi', jenis: 'Zakat Maal', amount: 150_000_000, status: 'Diterima' },
  { date: '2026-07-04', muzakki: 'Ahmad Naufal', jenis: 'Zakat Fitrah', amount: 45_000, status: 'Diterima' },
  { date: '2026-07-03', muzakki: 'Bank Syariah Mandiri', jenis: 'Zakat Maal', amount: 275_000_000, status: 'Diterima' },
  { date: '2026-07-03', muzakki: 'Siti Nurhaliza', jenis: 'Infak', amount: 2_500_000, status: 'Diterima' },
  { date: '2026-07-02', muzakki: 'PT Bumi Resources', jenis: 'Zakat Maal', amount: 500_000_000, status: 'Diproses' },
  { date: '2026-07-02', muzakki: 'Yayasan Pendidikan Islam', jenis: 'Zakat Maal', amount: 85_000_000, status: 'Diterima' },
  { date: '2026-07-01', muzakki: 'H. Abdul Rahman', jenis: 'Zakat Maal', amount: 25_000_000, status: 'Diterima' },
  { date: '2026-07-01', muzakki: 'PT Telkom Indonesia', jenis: 'Zakat Maal', amount: 1_200_000_000, status: 'Tersalurkan' },
  { date: '2026-06-30', muzakki: 'Dewi Sartika', jenis: 'Sedekah', amount: 500_000, status: 'Diterima' },
  { date: '2026-06-30', muzakki: 'Kementerian Keuangan RI', jenis: 'Zakat Maal', amount: 750_000_000, status: 'Tersalurkan' },
  { date: '2026-06-29', muzakki: 'RS Islam Jakarta', jenis: 'Zakat Maal', amount: 120_000_000, status: 'Diterima' },
  { date: '2026-06-29', muzakki: 'Muhammad Iqbal', jenis: 'Zakat Fitrah', amount: 45_000, status: 'Diterima' },
  { date: '2026-06-28', muzakki: 'PT Pertamina EP', jenis: 'Zakat Maal', amount: 950_000_000, status: 'Tersalurkan' },
  { date: '2026-06-28', muzakki: 'Aisyah Putri', jenis: 'Infak', amount: 1_000_000, status: 'Diterima' },
  { date: '2026-06-27', muzakki: 'Universitas Indonesia', jenis: 'Zakat Maal', amount: 65_000_000, status: 'Diproses' },
];

// 12-month chart data with Ramadhan spike (Mar-Apr 2026)
export const CHART_DATA_12M = [
  { month: 'Jul 2025', penerimaan: 180_000_000_000, penyaluran: 140_000_000_000 },
  { month: 'Agu 2025', penerimaan: 165_000_000_000, penyaluran: 130_000_000_000 },
  { month: 'Sep 2025', penerimaan: 190_000_000_000, penyaluran: 155_000_000_000 },
  { month: 'Okt 2025', penerimaan: 175_000_000_000, penyaluran: 145_000_000_000 },
  { month: 'Nov 2025', penerimaan: 200_000_000_000, penyaluran: 160_000_000_000 },
  { month: 'Des 2025', penerimaan: 250_000_000_000, penyaluran: 210_000_000_000 },
  { month: 'Jan 2026', penerimaan: 195_000_000_000, penyaluran: 170_000_000_000 },
  { month: 'Feb 2026', penerimaan: 210_000_000_000, penyaluran: 180_000_000_000 },
  { month: 'Mar 2026', penerimaan: 380_000_000_000, penyaluran: 310_000_000_000 }, // Ramadhan spike
  { month: 'Apr 2026', penerimaan: 420_000_000_000, penyaluran: 380_000_000_000 }, // Ramadhan spike
  { month: 'Mei 2026', penerimaan: 220_000_000_000, penyaluran: 190_000_000_000 },
  { month: 'Jun 2026', penerimaan: 240_000_000_000, penyaluran: 200_000_000_000 },
];

// Previous year for YoY comparison
export const CHART_DATA_12M_PREV = [
  { month: 'Jul 2024', penerimaan: 150_000_000_000, penyaluran: 120_000_000_000 },
  { month: 'Agu 2024', penerimaan: 140_000_000_000, penyaluran: 110_000_000_000 },
  { month: 'Sep 2024', penerimaan: 160_000_000_000, penyaluran: 130_000_000_000 },
  { month: 'Okt 2024', penerimaan: 145_000_000_000, penyaluran: 120_000_000_000 },
  { month: 'Nov 2024', penerimaan: 170_000_000_000, penyaluran: 140_000_000_000 },
  { month: 'Des 2024', penerimaan: 210_000_000_000, penyaluran: 180_000_000_000 },
  { month: 'Jan 2025', penerimaan: 160_000_000_000, penyaluran: 140_000_000_000 },
  { month: 'Feb 2025', penerimaan: 175_000_000_000, penyaluran: 150_000_000_000 },
  { month: 'Mar 2025', penerimaan: 320_000_000_000, penyaluran: 260_000_000_000 },
  { month: 'Apr 2025', penerimaan: 350_000_000_000, penyaluran: 320_000_000_000 },
  { month: 'Mei 2025', penerimaan: 185_000_000_000, penyaluran: 160_000_000_000 },
  { month: 'Jun 2025', penerimaan: 200_000_000_000, penyaluran: 170_000_000_000 },
];

// Donut chart data - 7 categories
export const DISTRIBUSI_DATA = [
  { name: 'Pendidikan', fullName: 'Pendidikan', value: 25 },
  { name: 'Kesehatan', fullName: 'Kesehatan', value: 18 },
  { name: 'Ekonomi', fullName: 'Ekonomi', value: 17 },
  { name: 'Dakwah', fullName: 'Dakwah & Syiar', value: 12 },
  { name: 'Sosial', fullName: 'Sosial Kemanusiaan', value: 14 },
  { name: 'Infak', fullName: 'Infak', value: 8 },
  { name: 'Sedekah', fullName: 'Sedekah', value: 6 },
];

export const DISTRIBUSI_COLORS = [
  '#2563eb', // Pendidikan - Sapphire Blue
  '#059669', // Kesehatan - Emerald
  '#d97706', // Ekonomi - Warm Gold
  '#7c3aed', // Dakwah - Violet
  '#e11d48', // Sosial - Rose Carmine
  '#0d9488', // Infak - Teal
  '#6366f1', // Sedekah - Indigo
];

// Daily data generator for mini charts
const generateDays = (seedBase, min, max) => {
  return Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    const pseudo = Math.sin(day * seedBase) * 0.5 + 0.5;
    const value = Math.round(min + pseudo * (max - min));
    return { day, value };
  });
};

export const penerimaanBulanIni = generateDays(0.7, 8_000_000_000, 52_000_000_000);
export const penyaluranBulanIni = generateDays(1.3, 5_000_000_000, 42_000_000_000);

// Time-based greeting
export const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Selamat Pagi';
  if (hour >= 12 && hour < 15) return 'Selamat Siang';
  if (hour >= 15 && hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
};

// Format date in Indonesian
export const getFormattedDate = () => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const now = new Date();
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
};

// Approximate Hijri date (static for mock)
export const getHijriDate = () => {
  return '26 Dzulhijjah 1447 H';
};
