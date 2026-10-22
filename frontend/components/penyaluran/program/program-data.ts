export interface PilarSummary {
  id: string;
  name: string;
  category: string;
  budgetFormatted: string;
  rawBudget: number;
  percentage: number;
  beneficiariesFormatted: string;
  rawBeneficiaries: number;
  color: string;
  iconType: 'education' | 'economy' | 'health' | 'faith' | 'social';
  sparkline: number[];
}

export interface ValueChainStep {
  label: string;
  primaryVal: string;
  subVal: string;
  type: 'budget' | 'program' | 'activity' | 'output' | 'impact';
}

export interface ImpactMetricItem {
  title: string;
  value: string;
  subtitle: string;
  trend?: string;
  icon: 'stethoscope' | 'checkCircle' | 'money' | 'document' | 'pin' | 'users';
}

export interface MonthlyTrendItem {
  month: string;
  realization: number; // in Millions
  target: number;      // in Millions
}

export interface FunnelItem {
  label: string;
  count: number;
  color: string;
}

export interface AsnafCompositionItem {
  name: string;
  countFormatted: string;
  percentage: number;
  color: string;
}

export interface TopKecamatanItem {
  rank: number;
  name: string;
  countFormatted: string;
  percentage: number;
}

export interface TimelineMilestone {
  date: string;
  title: string;
}

export interface InitiativeItem {
  programName: string;
  subName: string;
  pic: string;
  status: 'Berjalan' | 'Perlu perhatian' | 'Selesai';
  nextMilestoneDate: string;
  nextMilestoneTitle: string;
  beneficiaries: string;
  absorbedAmount: string;
  percentage: number;
}

export interface RecommendationItem {
  num: number;
  text: string;
  colorBg: string;
  colorText: string;
  href?: string;
}

export interface PilarDetailedData {
  pilarId: string;
  pilarName: string;
  valueChain: ValueChainStep[];
  impactMetrics: ImpactMetricItem[];
  monthlyTrends: MonthlyTrendItem[];
  projection: {
    realizationEst: string;
    percentage: number;
    targetYear: string;
    remainingBudget: string;
  };
  funnelOutcome: FunnelItem[];
  asnafComposition: AsnafCompositionItem[];
  topKecamatan: TopKecamatanItem[];
  targetVsRealization: {
    distribution: { label: string; currentFormatted: string; targetFormatted: string; percentage: number };
    beneficiaries: { label: string; currentFormatted: string; targetFormatted: string; percentage: number };
    activePrograms: { label: string; currentFormatted: string; percentage: number };
    budgetEfficiency: { distributedPercentage: number; operationalPercentage: number; maxAllowed: number };
  };
  timelineMilestones: TimelineMilestone[];
  initiatives: InitiativeItem[];
  recommendations: RecommendationItem[];
}

export const TOP_PILAR_LIST: PilarSummary[] = [
  {
    id: 'cerdas',
    name: 'Tangerang Cerdas',
    category: 'Pendidikan',
    budgetFormatted: 'Rp 8,62 M',
    rawBudget: 8620000000,
    percentage: 73,
    beneficiariesFormatted: '9.842 penerima manfaat',
    rawBeneficiaries: 9842,
    color: '#059669', // Emerald
    iconType: 'education',
    sparkline: [35, 42, 50, 58, 65, 70, 73],
  },
  {
    id: 'makmur',
    name: 'Tangerang Makmur',
    category: 'Ekonomi',
    budgetFormatted: 'Rp 7,48 M',
    rawBudget: 7480000000,
    percentage: 66,
    beneficiariesFormatted: '8.306 penerima manfaat',
    rawBeneficiaries: 8306,
    color: '#d97706', // Amber / Orange
    iconType: 'economy',
    sparkline: [28, 35, 42, 48, 55, 60, 66],
  },
  {
    id: 'sehat',
    name: 'Tangerang Sehat',
    category: 'Kesehatan',
    budgetFormatted: 'Rp 9,21 M',
    rawBudget: 9210000000,
    percentage: 82,
    beneficiariesFormatted: '12.374 penerima manfaat',
    rawBeneficiaries: 12374,
    color: '#008B5A', // BAZNAS Deep Emerald
    iconType: 'health',
    sparkline: [40, 50, 62, 70, 75, 78, 82],
  },
  {
    id: 'beriman',
    name: 'Tangerang Beriman',
    category: 'Dakwah & Advokasi',
    budgetFormatted: 'Rp 6,17 M',
    rawBudget: 6170000000,
    percentage: 61,
    beneficiariesFormatted: '6.501 penerima manfaat',
    rawBeneficiaries: 6501,
    color: '#7c3aed', // Purple
    iconType: 'faith',
    sparkline: [25, 32, 40, 48, 52, 58, 61],
  },
  {
    id: 'peduli',
    name: 'Tangerang Peduli',
    category: 'Kemanusiaan',
    budgetFormatted: 'Rp 5,86 M',
    rawBudget: 5860000000,
    percentage: 78,
    beneficiariesFormatted: '5.423 penerima manfaat',
    rawBeneficiaries: 5423,
    color: '#2563eb', // Blue
    iconType: 'social',
    sparkline: [30, 42, 55, 62, 68, 72, 78],
  },
];

export const PILAR_DETAILS_MAP: Record<string, PilarDetailedData> = {
  sehat: {
    pilarId: 'sehat',
    pilarName: 'Tangerang Sehat',
    valueChain: [
      { label: 'Anggaran', primaryVal: 'Rp 9,21 M', subVal: '82% dari target', type: 'budget' },
      { label: 'Program & Intervensi', primaryVal: '18 Program', subVal: '6 Layanan Utama', type: 'program' },
      { label: 'Aktivitas', primaryVal: '63.842 Kegiatan', subVal: 'Jan–Agu 2026', type: 'activity' },
      { label: 'Output', primaryVal: '12.374 Penerima', subVal: '82% dari target', type: 'output' },
      { label: 'Dampak', primaryVal: 'Kesehatan meningkat,', subVal: 'beban biaya berkurang, kualitas hidup lebih baik.', type: 'impact' },
    ],
    impactMetrics: [
      { title: 'Pasien dilayani', value: '12.374', subtitle: '18,6% dari periode sebelumnya', trend: '+18,6%', icon: 'stethoscope' },
      { title: 'Intervensi berhasil', value: '8.921', subtitle: 'Tingkat keberhasilan 72%', icon: 'checkCircle' },
      { title: 'Rata-rata bantuan', value: 'Rp 744 rb', subtitle: 'Per penerima manfaat', icon: 'money' },
      { title: 'Program aktif', value: '18', subtitle: '6 layanan utama', icon: 'document' },
      { title: 'Kecamatan terjangkau', value: '13 / 13', subtitle: '100% wilayah tercakup', icon: 'pin' },
      { title: 'Mustahik baru', value: '3.214', subtitle: 'Jan–Agu 2026', icon: 'users' },
    ],
    monthlyTrends: [
      { month: 'Jan', realization: 750, target: 800 },
      { month: 'Feb', realization: 880, target: 900 },
      { month: 'Mar', realization: 1050, target: 1000 },
      { month: 'Apr', realization: 1120, target: 1100 },
      { month: 'Mei', realization: 1240, target: 1200 },
      { month: 'Jun', realization: 1380, target: 1300 },
      { month: 'Jul', realization: 1420, target: 1400 },
      { month: 'Agu', realization: 1550, target: 1500 },
      { month: 'Sep', realization: 0, target: 1600 },
      { month: 'Okt', realization: 0, target: 1700 },
      { month: 'Nov', realization: 0, target: 1800 },
      { month: 'Des', realization: 0, target: 1900 },
    ],
    projection: {
      realizationEst: 'Rp 11,23 M',
      percentage: 102,
      targetYear: 'Rp 11,00 M',
      remainingBudget: 'Rp 1,79 M',
    },
    funnelOutcome: [
      { label: 'Proposal diterima', count: 42, color: '#10b981' },
      { label: 'Verifikasi kelayakan', count: 36, color: '#6ee7b7' },
      { label: 'Disetujui', count: 28, color: '#38bdf8' },
      { label: 'Dalam pelaksanaan', count: 22, color: '#fbbf24' },
      { label: 'Bantuan tersalurkan', count: 18, color: '#a78bfa' },
    ],
    asnafComposition: [
      { name: 'Fakir', countFormatted: '4.128', percentage: 33, color: '#047857' },
      { name: 'Miskin', countFormatted: '4.046', percentage: 33, color: '#10b981' },
      { name: 'Amil', countFormatted: '1.511', percentage: 12, color: '#a7f3d0' },
      { name: 'Mualaf', countFormatted: '1.187', percentage: 10, color: '#38bdf8' },
      { name: 'Gharimin', countFormatted: '769', percentage: 6, color: '#fbbf24' },
      { name: 'Lainnya', countFormatted: '733', percentage: 6, color: '#c084fc' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Karawaci', countFormatted: '2.186', percentage: 18 },
      { rank: 2, name: 'Ciledug', countFormatted: '1.846', percentage: 15 },
      { rank: 3, name: 'Cipondoh', countFormatted: '1.672', percentage: 14 },
      { rank: 4, name: 'Batuceper', countFormatted: '1.435', percentage: 12 },
      { rank: 5, name: 'Periuk', countFormatted: '1.221', percentage: 10 },
    ],
    targetVsRealization: {
      distribution: { label: 'Penyaluran', currentFormatted: 'Rp 9,21 M', targetFormatted: 'Rp 11,00 M', percentage: 82 },
      beneficiaries: { label: 'Penerima manfaat', currentFormatted: '12.374', targetFormatted: '15.000', percentage: 82 },
      activePrograms: { label: 'Program aktif', currentFormatted: '18 / 22', percentage: 82 },
      budgetEfficiency: { distributedPercentage: 92.4, operationalPercentage: 7.6, maxAllowed: 12 },
    },
    timelineMilestones: [
      { date: 'Jan 2026', title: 'Kick-off program kesehatan' },
      { date: 'Mar 2026', title: 'Peluncuran layanan mobile klinik' },
      { date: 'Mei 2026', title: 'Penambahan mitra fasilitas kesehatan' },
      { date: 'Jul 2026', title: 'Program gizi ibu & anak diperluas' },
      { date: 'Agu 2026', title: 'Review capaian & optimasi program' },
    ],
    initiatives: [
      {
        programName: 'Klinik Mustahik',
        subName: '(Layanan Kesehatan Primer)',
        pic: 'UPZ Kesehatan & Klinik Mitra',
        status: 'Berjalan',
        nextMilestoneDate: '30 Agu 2026',
        nextMilestoneTitle: 'Evaluasi kunjungan Q3',
        beneficiaries: '4.982',
        absorbedAmount: 'Rp 3,42 M',
        percentage: 82,
      },
      {
        programName: 'Bantuan Pengobatan Mustahik',
        subName: '',
        pic: 'UPZ Kesehatan',
        status: 'Berjalan',
        nextMilestoneDate: '5 Sep 2026',
        nextMilestoneTitle: 'Penyaluran batch berikutnya',
        beneficiaries: '3.765',
        absorbedAmount: 'Rp 2,68 M',
        percentage: 84,
      },
      {
        programName: 'Gizi Ibu & Anak',
        subName: '',
        pic: 'UPZ Kesehatan & PKK Kota',
        status: 'Berjalan',
        nextMilestoneDate: '12 Sep 2026',
        nextMilestoneTitle: 'Monitoring pertumbuhan',
        beneficiaries: '2.143',
        absorbedAmount: 'Rp 1,56 M',
        percentage: 79,
      },
      {
        programName: 'Ambulans Gratis Mustahik',
        subName: '',
        pic: 'UPZ Kesehatan & Lazismu',
        status: 'Berjalan',
        nextMilestoneDate: '1 Sep 2026',
        nextMilestoneTitle: 'Rapat evaluasi layanan',
        beneficiaries: '1.484',
        absorbedAmount: 'Rp 0,89 M',
        percentage: 91,
      },
      {
        programName: 'Edukasi & Deteksi Dini Kesehatan',
        subName: '',
        pic: 'UPZ Kesehatan & Puskesmas',
        status: 'Perlu perhatian',
        nextMilestoneDate: '28 Agu 2026',
        nextMilestoneTitle: 'Perluas jangkauan kegiatan',
        beneficiaries: '1.021',
        absorbedAmount: 'Rp 0,66 M',
        percentage: 61,
      },
    ],
    recommendations: [
      {
        num: 1,
        text: 'Perluas intervensi gizi ibu & anak ke 3 kecamatan prioritas untuk percepat capaian target penerima.',
        colorBg: 'bg-emerald-600',
        colorText: 'text-white',
      },
      {
        num: 2,
        text: 'Tingkatkan verifikasi & follow-up bantuan pengobatan agar rasio keberhasilan intervensi naik >75%.',
        colorBg: 'bg-amber-500',
        colorText: 'text-white',
      },
      {
        num: 3,
        text: 'Optimalkan kolaborasi fasilitas kesehatan agar layanan klinik lebih merata di wilayah timur kota.',
        colorBg: 'bg-purple-600',
        colorText: 'text-white',
      },
    ],
  },
};

// Fill in other pillars with dynamic fallback
TOP_PILAR_LIST.forEach((p) => {
  if (!PILAR_DETAILS_MAP[p.id]) {
    PILAR_DETAILS_MAP[p.id] = {
      ...PILAR_DETAILS_MAP['sehat']!,
      pilarId: p.id,
      pilarName: p.name,
      valueChain: [
        { label: 'Anggaran', primaryVal: p.budgetFormatted, subVal: `${p.percentage}% dari target`, type: 'budget' },
        { label: 'Program & Intervensi', primaryVal: '14 Program', subVal: '4 Layanan Utama', type: 'program' },
        { label: 'Aktivitas', primaryVal: '42.180 Kegiatan', subVal: 'Jan–Agu 2026', type: 'activity' },
        { label: 'Output', primaryVal: p.beneficiariesFormatted.split(' ')[0]! + ' Penerima', subVal: `${p.percentage}% dari target`, type: 'output' },
        { label: 'Dampak', primaryVal: 'Pemberdayaan terukur,', subVal: 'kemandirian mustahik tercapai secara berkelanjutan.', type: 'impact' },
      ],
      targetVsRealization: {
        distribution: { label: 'Penyaluran', currentFormatted: p.budgetFormatted, targetFormatted: 'Rp 10,00 M', percentage: p.percentage },
        beneficiaries: { label: 'Penerima manfaat', currentFormatted: p.beneficiariesFormatted.split(' ')[0]!, targetFormatted: '12.000', percentage: p.percentage },
        activePrograms: { label: 'Program aktif', currentFormatted: '14 / 18', percentage: p.percentage },
        budgetEfficiency: { distributedPercentage: 91.8, operationalPercentage: 8.2, maxAllowed: 12 },
      },
    };
  }
});
