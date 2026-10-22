import { isExplicitDemoMode } from '../map/map-data';

export type DashboardPeriod = '7d' | '30d' | '1y';

export type DashboardSummary = {
  totalDisbursed: number;
  totalPenyaluran: number;
  beneficiaries: number;
  activePrograms: number;
  averageAssistance: number;
  change: number;
  transactions: number;
  target: number;
  effectiveness?: number;
};

export type AsnafAllocation = {
  id: string;
  name: string;
  percentage: number;
  amount: number;
  beneficiaries: number;
  color: string;
};

export type ProgramImpact = {
  id: string;
  name: string;
  category: string;
  amount: number;
  percentage: number;
  beneficiaries: number;
  progress: number;
  change: number;
  accent: string;
};

export type TrendPoint = {
  label: string;
  current: number;
  previous: number;
  target: number;
};

export type MapPeriodData = Record<string, { amount: number; beneficiaries: number; program: string }>;

export type DashboardAction = {
  title: string;
  count: number;
  description: string;
  href: string;
  tone: 'rose' | 'amber' | 'emerald';
};

export type DashboardActivity = {
  title: string;
  detail: string;
  time: string;
  tone: 'emerald' | 'violet' | 'amber';
};

export type DashboardData = {
  periodLabel: string;
  comparisonLabel: string;
  dataStatus: 'ready' | 'empty' | 'demo';
  source?: 'real' | 'empty' | 'demo';
  summary: DashboardSummary;
  trend: TrendPoint[];
  asnaf: AsnafAllocation[];
  programs: ProgramImpact[];
  map: MapPeriodData;
  actions: DashboardAction[];
  activities: DashboardActivity[];
};

const PROGRAM_BLUEPRINT = [
  { id: 'cerdas', name: 'Tangerang Cerdas', category: 'Pendidikan', percentage: 35.2, accent: '#059669' },
  { id: 'sehat', name: 'Tangerang Sehat', category: 'Kesehatan', percentage: 21.3, accent: '#2563eb' },
  { id: 'peduli', name: 'Tangerang Peduli', category: 'Sosial kemanusiaan', percentage: 25.6, accent: '#f97316' },
  { id: 'makmur', name: 'Tangerang Makmur', category: 'Pemberdayaan ekonomi', percentage: 12.4, accent: '#7c3aed' },
  { id: 'takwa', name: 'Tangerang Takwa', category: 'Dakwah & advokasi', percentage: 5.5, accent: '#ef4444' },
] as const;

const ASNAF_BLUEPRINT = [
  { id: 'fakir', name: 'Fakir', percentage: 29, color: '#166534' },
  { id: 'miskin', name: 'Miskin', percentage: 34, color: '#4ade80' },
  { id: 'amil', name: 'Amil', percentage: 9, color: '#f59e0b' },
  { id: 'muallaf', name: 'Muallaf', percentage: 6, color: '#8b5cf6' },
  { id: 'riqab', name: 'Riqab', percentage: 3, color: '#60a5fa' },
  { id: 'gharimin', name: 'Gharimin', percentage: 8, color: '#f97316' },
  { id: 'fisabilillah', name: 'Fisabilillah', percentage: 7, color: '#a16207' },
  { id: 'ibnu-sabil', name: 'Ibnu Sabil', percentage: 4, color: '#94a3b8' },
] as const;

const MAP_SHARES: Record<string, number> = {
  Batuceper: 0.04,
  Benda: 0.045,
  Cibodas: 0.07,
  Ciledug: 0.09,
  Cipondoh: 0.12,
  Jatiuwung: 0.055,
  Karangtengah: 0.06,
  Karawaci: 0.11,
  Larangan: 0.06,
  Neglasari: 0.065,
  Periuk: 0.065,
  Pinang: 0.08,
  Tangerang: 0.14,
};

const PROGRAM_BY_INDEX = ['Tangerang Cerdas', 'Tangerang Sehat', 'Tangerang Peduli', 'Tangerang Makmur', 'Tangerang Takwa'];

function allocateMapData(total: number, beneficiaries: number): MapPeriodData {
  return Object.fromEntries(
    Object.entries(MAP_SHARES).map(([name, share], index) => [
      name,
      {
        amount: Math.round(total * share),
        beneficiaries: Math.round(beneficiaries * share),
        program: PROGRAM_BY_INDEX[index % PROGRAM_BY_INDEX.length] ?? 'Tangerang Peduli',
      },
    ])
  );
}

function makeAsnaf(total: number, beneficiaries: number): AsnafAllocation[] {
  return ASNAF_BLUEPRINT.map((item) => ({
    ...item,
    amount: Math.round(total * (item.percentage / 100)),
    beneficiaries: Math.max(1, Math.round(beneficiaries * (item.percentage / 100))),
  }));
}

function makePrograms(total: number, beneficiaries: number, scale: number): ProgramImpact[] {
  return PROGRAM_BLUEPRINT.map((item, index) => ({
    ...item,
    amount: Math.round(total * (item.percentage / 100)),
    beneficiaries: Math.max(1, Math.round(beneficiaries * (item.percentage / 100))),
    progress: Math.min(98, Math.round((58 + index * 7) * scale)),
    change: [14.2, 8.6, 20.1, 6.3, -2.1][index] ?? 0,
  }));
}

function makeTrend(labels: string[], current: number[], previous: number[], target: number[]): TrendPoint[] {
  return labels.map((label, index) => ({
    label,
    current: current[index] ?? 0,
    previous: previous[index] ?? 0,
    target: target[index] ?? 0,
  }));
}

function makeDashboard(
  periodLabel: string,
  comparisonLabel: string,
  summary: Omit<DashboardSummary, 'totalPenyaluran'>,
  trend: TrendPoint[],
  scale: number,
  actionCounts: [number, number, number]
): DashboardData {
  return {
    periodLabel,
    comparisonLabel,
    dataStatus: 'demo',
    source: 'demo',
    summary: {
      ...summary,
      totalPenyaluran: summary.totalDisbursed,
    },
    trend,
    asnaf: makeAsnaf(summary.totalDisbursed, summary.beneficiaries),
    programs: makePrograms(summary.totalDisbursed, summary.beneficiaries, scale),
    map: allocateMapData(summary.totalDisbursed, summary.beneficiaries),
    actions: [
      { title: 'Verifikasi pengajuan prioritas', count: actionCounts[0], description: 'Berkas menunggu validasi dan keputusan', href: '/penyaluran/mustahik?tab=diajukan', tone: 'rose' },
      { title: 'Survey lapangan terjadwal', count: actionCounts[1], description: 'Kunjungan perlu dikonfirmasi hari ini', href: '/penyaluran/mustahik?tab=survey', tone: 'amber' },
      { title: 'Pencairan PPD siap proses', count: actionCounts[2], description: 'Dokumen pencairan telah lengkap', href: '/penyaluran/mustahik?tab=ppd', tone: 'emerald' },
    ],
    activities: [
      { title: 'Verifikasi disetujui', detail: 'Bantuan pendidikan a.n. Siti Aisyah', time: '2 menit lalu', tone: 'emerald' },
      { title: 'Survey lapangan selesai', detail: 'Tangerang Peduli · Kec. Pinang', time: '1 jam lalu', tone: 'violet' },
      { title: 'PPD dicairkan', detail: 'PPD-260824-017 · Rp 25.000.000', time: '3 jam lalu', tone: 'amber' },
      { title: 'Penyaluran diterima', detail: 'Bantuan modal usaha a.n. Ahmad Yani', time: '5 jam lalu', tone: 'emerald' },
    ],
  };
}

const DASHBOARD_BY_PERIOD: Record<DashboardPeriod, DashboardData> = {
  '7d': makeDashboard(
    '7 Hari',
    '7 hari sebelumnya',
    { totalDisbursed: 455000000, beneficiaries: 1648, activePrograms: 34, averageAssistance: 276000, change: 12.8, transactions: 58, target: 520000000 },
    makeTrend(['18 Agu', '19 Agu', '20 Agu', '21 Agu', '22 Agu', '23 Agu', '24 Agu'], [48, 104, 167, 230, 292, 374, 455], [42, 82, 131, 188, 240, 299, 358], [65, 135, 210, 280, 355, 435, 520]),
    0.93,
    [12, 7, 4]
  ),
  '30d': makeDashboard(
    '30 Hari',
    '30 hari sebelumnya',
    { totalDisbursed: 1940000000, beneficiaries: 6842, activePrograms: 128, averageAssistance: 284000, change: 18.7, transactions: 246, target: 2350000000 },
    makeTrend(['26 Jul', '2 Agu', '9 Agu', '16 Agu', '23 Agu', '24 Agu'], [120, 420, 780, 1160, 1620, 1940], [90, 315, 610, 905, 1260, 1485], [210, 500, 860, 1240, 1830, 2350]),
    1,
    [21, 8, 5]
  ),
  '1y': makeDashboard(
    '1 Tahun',
    'tahun sebelumnya',
    { totalDisbursed: 18450000000, beneficiaries: 62315, activePrograms: 486, averageAssistance: 296000, change: 14.2, transactions: 2186, target: 22000000000 },
    makeTrend(['Sep', 'Nov', 'Jan', 'Mar', 'Mei', 'Jul', 'Agu'], [2050, 4800, 7210, 10140, 13020, 16180, 18450], [1750, 4000, 6150, 8520, 11100, 14120, 16180], [2800, 5600, 8700, 12000, 15100, 18500, 22000]),
    1.12,
    [37, 18, 12]
  ),
};

export function getEmptyDashboardData(period: DashboardPeriod = '30d'): DashboardData {
  return {
    periodLabel: period === '7d' ? '7 Hari' : period === '1y' ? '1 Tahun' : '30 Hari',
    comparisonLabel: period === '7d' ? '7 hari sebelumnya' : period === '1y' ? 'tahun sebelumnya' : '30 hari sebelumnya',
    dataStatus: 'empty',
    source: 'empty',
    summary: {
      totalDisbursed: 0,
      totalPenyaluran: 0,
      beneficiaries: 0,
      activePrograms: 0,
      averageAssistance: 0,
      change: 0,
      transactions: 0,
      target: 0,
    },
    trend: [],
    asnaf: [],
    programs: [],
    map: {},
    actions: [
      { title: 'Verifikasi pengajuan prioritas', count: 0, description: 'Belum ada berkas menunggu verifikasi', href: '/penyaluran/mustahik?tab=diajukan', tone: 'rose' },
      { title: 'Survey lapangan terjadwal', count: 0, description: 'Belum ada jadwal survei', href: '/penyaluran/mustahik?tab=survey', tone: 'amber' },
      { title: 'Pencairan PPD siap proses', count: 0, description: 'Belum ada pencairan siap proses', href: '/penyaluran/mustahik?tab=ppd', tone: 'emerald' },
    ],
    activities: [],
  };
}

export function getDashboardData(period: DashboardPeriod): DashboardData {
  return DASHBOARD_BY_PERIOD[period];
}

export function adaptBackendOverviewToDashboardData(overview: any, period: DashboardPeriod = '30d'): DashboardData {
  const isDemo = isExplicitDemoMode();
  if (!overview) {
    return isDemo ? getDashboardData(period) : getEmptyDashboardData(period);
  }

  const periodLabel = period === '7d' ? '7 Hari' : period === '1y' ? '1 Tahun' : '30 Hari';
  const comparisonLabel = period === '7d' ? '7 hari sebelumnya' : period === '1y' ? 'tahun sebelumnya' : '30 hari sebelumnya';

  const isEmpty = overview.dataStatus === 'empty' || (!overview.metrics && (!overview.monthlyTrend || overview.monthlyTrend.length === 0));

  if (isEmpty) {
    const emptyBase = getEmptyDashboardData(period);
    const m = overview.metrics || {};
    const totalPenyaluran = Number(m.totalPenyaluran || 0);
    const totalMustahik = Number(m.totalMustahik || 0);

    const actions: DashboardAction[] = overview.actionRail?.slaCounts
      ? [
          {
            title: 'Verifikasi pengajuan prioritas',
            count: Number(overview.actionRail.slaCounts.perluTindakan || 0),
            description: 'Berkas menunggu validasi dan keputusan',
            href: '/penyaluran/mustahik?tab=diajukan',
            tone: 'rose',
          },
          {
            title: 'Survey lapangan terjadwal',
            count: Number(overview.actionRail.slaCounts.lewatSla || 0),
            description: 'Kunjungan perlu dikonfirmasi hari ini',
            href: '/penyaluran/mustahik?tab=survey',
            tone: 'amber',
          },
          {
            title: 'Pencairan PPD siap proses',
            count: Number(overview.actionRail.slaCounts.dokumenKurang || 0),
            description: 'Dokumen pencairan telah lengkap',
            href: '/penyaluran/mustahik?tab=ppd',
            tone: 'emerald',
          },
        ]
      : emptyBase.actions;

    return {
      ...emptyBase,
      periodLabel,
      comparisonLabel,
      dataStatus: 'empty',
      source: 'empty',
      summary: {
        totalDisbursed: totalPenyaluran,
        totalPenyaluran,
        beneficiaries: totalMustahik,
        activePrograms: 0,
        averageAssistance: totalMustahik > 0 ? Math.round(totalPenyaluran / totalMustahik) : 0,
        change: 0,
        transactions: totalMustahik,
        target: 0,
      },
      actions,
      activities: [],
    };
  }

  const m = overview.metrics || {};
  const totalDisbursed = Number(m.totalPenyaluran ?? 0);
  const beneficiaries = Number(m.totalMustahik ?? 0);

  const asnafList: AsnafAllocation[] = Array.isArray(overview.asnafBreakdown)
    ? overview.asnafBreakdown.map((a: any) => ({
        id: String(a.name || '').toLowerCase().replace(/\s+/g, '-'),
        name: a.name,
        percentage: Number(a.percentage || 0),
        amount: Number(a.amount || 0),
        beneficiaries: Number(a.count ?? a.beneficiaries ?? 0),
        color: a.color || '#10b981',
      }))
    : [];

  const programsList: ProgramImpact[] = Array.isArray(overview.programImpact)
    ? overview.programImpact.map((p: any) => ({
        id: String(p.id || p.name || '').toLowerCase().replace(/\s+/g, '-'),
        name: p.name,
        category: p.category || 'Program',
        amount: Number(p.realizedAmount ?? p.amount ?? 0),
        percentage: Number(p.percentage || 0),
        beneficiaries: Number(p.beneficiariesCount ?? p.beneficiaries ?? 0),
        progress: Number(p.progress ?? p.percentage ?? 0),
        change: Number(p.change || 0),
        accent: p.accent || p.color || '#059669',
      }))
    : [];

  const trend: TrendPoint[] = Array.isArray(overview.monthlyTrend)
    ? overview.monthlyTrend.map((t: any) => ({
        label: t.month || t.label || '',
        current: Math.round(Number(t.realisasi || 0) * 1000),
        previous: Number(t.previous || 0),
        target: Number(t.target || 0),
      }))
    : [];

  const actions: DashboardAction[] = overview.actionRail?.slaCounts
    ? [
        {
          title: 'Verifikasi pengajuan prioritas',
          count: Number(overview.actionRail.slaCounts.perluTindakan || 0),
          description: 'Berkas menunggu validasi dan keputusan',
          href: '/penyaluran/mustahik?tab=diajukan',
          tone: 'rose',
        },
        {
          title: 'Survey lapangan terjadwal',
          count: Number(overview.actionRail.slaCounts.lewatSla || 0),
          description: 'Kunjungan perlu dikonfirmasi hari ini',
          href: '/penyaluran/mustahik?tab=survey',
          tone: 'amber',
        },
        {
          title: 'Pencairan PPD siap proses',
          count: Number(overview.actionRail.slaCounts.dokumenKurang || 0),
          description: 'Dokumen pencairan telah lengkap',
          href: '/penyaluran/mustahik?tab=ppd',
          tone: 'emerald',
        },
      ]
    : [
        { title: 'Verifikasi pengajuan prioritas', count: 0, description: 'Berkas menunggu validasi dan keputusan', href: '/penyaluran/mustahik?tab=diajukan', tone: 'rose' },
        { title: 'Survey lapangan terjadwal', count: 0, description: 'Kunjungan perlu dikonfirmasi hari ini', href: '/penyaluran/mustahik?tab=survey', tone: 'amber' },
        { title: 'Pencairan PPD siap proses', count: 0, description: 'Dokumen pencairan telah lengkap', href: '/penyaluran/mustahik?tab=ppd', tone: 'emerald' },
      ];

  const activities: DashboardActivity[] = Array.isArray(overview.actionRail?.recentActivities)
    ? overview.actionRail.recentActivities.slice(0, 4).map((act: any) => ({
        title: act.title || 'Aktivitas Penyaluran',
        detail: act.description || `Aktor: ${act.actor_name || 'Sistem'}`,
        time: act.created_at || act.time || 'Baru saja',
        tone: act.action_type === 'DISBURSED' ? 'emerald' : act.action_type === 'REJECTED' ? 'amber' : 'violet',
      }))
    : [];

  return {
    periodLabel,
    comparisonLabel,
    dataStatus: 'ready',
    source: 'real',
    summary: {
      totalDisbursed,
      totalPenyaluran: totalDisbursed,
      beneficiaries,
      activePrograms: programsList.length,
      averageAssistance: beneficiaries > 0 ? Math.round(totalDisbursed / beneficiaries) : 0,
      change: Number(m.growthRate || 0),
      transactions: beneficiaries,
      target: Number(m.targetRkat || 0),
      effectiveness: Number(m.efektivitasPenyaluran || 0),
    },
    trend,
    asnaf: asnafList,
    programs: programsList,
    map: overview.map || {},
    actions,
    activities,
  };
}
