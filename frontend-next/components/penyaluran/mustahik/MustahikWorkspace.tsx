'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { normalizeAccessActor } from '@/components/auth/access';
import { api } from '@/lib/api/client';
import type { CurrentUser, Mustahik } from '@/lib/api/types';
import type { P0CaseWorkspace, P0IntakePayload } from '@/lib/api/penyaluran-p0-types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Filter,
  Loader2,
  Lock,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { CaseWorkflowPanel } from './case/CaseWorkflowPanel';
import { FieldErrorSummary } from './shared/FieldErrorSummary';

export type StageId = 'all' | 'diajukan' | 'verifikasi' | 'survey' | 'mpzis' | 'ppd' | 'selesai';
export type MobileView = 'queue' | 'profile';

export type DecisionCapabilities = {
  canApprove: boolean;
  canReject: boolean;
  approveLabel: string;
  notice?: string;
};

/** UI hint only; the API remains the source of truth for authorization. */
export function getDecisionCapabilities(
  user: Pick<CurrentUser, 'role' | 'division' | 'level'> | null | undefined,
  status: string
): DecisionCapabilities {
  const actor = normalizeAccessActor(user);
  const isAdmin = actor.isAdmin;
  const inPenyaluran = isAdmin || actor.isPenyaluran || actor.role === 'penyaluran' || actor.division.includes('penyaluran') || actor.division.includes('pendistribusian');
  if (!inPenyaluran) {
    return {
      canApprove: false,
      canReject: false,
      approveLabel: 'Simpan keputusan',
      notice: 'Anda tidak memiliki akses keputusan pada Divisi Penyaluran.',
    };
  }
  if (isAdmin) {
    return { canApprove: true, canReject: true, approveLabel: 'Setujui & Lanjutkan' };
  }
  if (status === 'Persetujuan MPZIS') {
    if (actor.level === 'leader') {
      return {
        canApprove: true,
        canReject: true,
        approveLabel: 'Setujui MPZIS',
        notice: 'Sebagai Kepala Bagian, Anda memegang persetujuan akhir tahap MPZIS.',
      };
    }
    return {
      canApprove: false,
      canReject: false,
      approveLabel: 'Menunggu persetujuan',
      notice:
        'Tahap ini menunggu persetujuan Kepala Bagian Penyaluran. Staff tidak dapat menyetujui MPZIS.',
    };
  }
  if (actor.level === 'leader') {
    return {
      canApprove: false,
      canReject: false,
      approveLabel: 'Menunggu tahap berikutnya',
      notice: 'Tahap ini dikerjakan Staff Penyaluran. Anda dapat meninjau hasilnya.',
    };
  }
  return { canApprove: true, canReject: true, approveLabel: 'Setujui & Lanjutkan' };
}

const DEFAULT_STAGES: Array<{ id: StageId; stepNum: string; label: string; description: string; count: number; statuses?: string[] }> = [
  { id: 'all', stepNum: '★', label: 'Semua Data', description: 'Master 60-Kolom', count: 0 },
  { id: 'diajukan', stepNum: '1', label: 'Pengajuan Masuk', description: 'Antrean Baru', count: 0, statuses: ['Diajukan'] },
  { id: 'verifikasi', stepNum: '2', label: 'Verifikasi Syarat', description: 'Cek Dokumen', count: 0, statuses: ['Verifikasi Administrasi', 'Verifikasi'] },
  { id: 'survey', stepNum: '3', label: 'Survey Lapangan', description: 'Form F-BPP/04', count: 0, statuses: ['Survey'] },
  { id: 'mpzis', stepNum: '4', label: 'Sidang MPZIS', description: 'Persetujuan Pimpinan', count: 0, statuses: ['Persetujuan MPZIS'] },
  { id: 'ppd', stepNum: '5', label: 'Pencairan PPD', description: 'Dana Siap Salur', count: 0, statuses: ['Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'] },
  { id: 'selesai', stepNum: '✓', label: 'Penyaluran Selesai', description: 'Tersalurkan & LPJ', count: 0, statuses: ['Penyaluran Selesai'] },
];

const initials = (name: string) =>
  name ? name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() : '??';

const maskNik = (nik: string) =>
  nik && nik.length >= 8 ? `${nik.slice(0, 4)} •••• •••• ${nik.slice(-4)}` : (nik || '-');

function StageRail({
  value,
  onChange,
  stages,
}: {
  value: StageId;
  onChange: (id: StageId) => void;
  stages: typeof DEFAULT_STAGES;
}) {
  return (
    <section
      aria-label="Tahapan pengajuan Mustahik"
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
    >
      <div className="mustahik-stage-scroll flex snap-x overflow-x-auto lg:grid lg:grid-cols-7 lg:overflow-visible">
        {stages.map((stage, index) => {
          const active = value === stage.id;
          return (
            <button
              type="button"
              key={stage.id}
              aria-label={`${stage.label} ${stage.count}`}
              aria-pressed={active}
              onClick={() => onChange(stage.id)}
              className={`group relative flex min-h-[92px] min-w-[170px] snap-start items-center gap-2.5 px-3 text-left transition lg:min-w-0 ${
                index ? 'border-l border-zinc-100' : ''
              } ${active ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold ${active ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-zinc-300 bg-white text-zinc-600'}`}>
                {stage.stepNum}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-xs font-bold ${active ? 'text-emerald-800' : 'text-zinc-700'}`}>{stage.label}</span>
                <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{stage.description}</span>
                <span className="mt-1 block text-sm font-bold text-zinc-900">{stage.count} berkas</span>
              </span>
              {stage.id !== 'all' && <ChevronRight className={`size-4 shrink-0 ${active ? 'text-emerald-700' : 'text-zinc-300'}`} />}
              <span
                className={`absolute inset-x-0 bottom-0 h-0.5 bg-emerald-700 transition-transform ${
                  active ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Queue({
  items,
  allItems,
  totalCount,
  selected,
  query,
  quickFilter,
  onQuery,
  onSelect,
  onFilterQuick,
}: {
  items: Mustahik[];
  allItems: Mustahik[];
  totalCount: number;
  selected?: Mustahik;
  query: string;
  quickFilter: 'all' | 'Perlu tindakan' | 'Persetujuan' | 'Selesai';
  onQuery: (value: string) => void;
  onSelect: (item: Mustahik) => void;
  onFilterQuick: (filter: 'all' | 'Perlu tindakan' | 'Persetujuan' | 'Selesai') => void;
}) {
  const perluTindakanCount = allItems.filter(
    (i) =>
      i.status === 'Diajukan' ||
      i.status === 'Verifikasi Administrasi' ||
      i.status === 'Verifikasi' ||
      i.status === 'Survey'
  ).length;
  const persetujuanCount = allItems.filter(
    (i) =>
      i.status === 'Persetujuan MPZIS' ||
      i.status === 'Pengajuan Dana (FPD)' ||
      i.status === 'Pengajuan Dana (PPD)'
  ).length;
  const selesaiCount = allItems.filter((i) => i.status === 'Penyaluran Selesai').length;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-extrabold">Antrean verifikasi</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {items.length} ditampilkan · {totalCount} total data
            </p>
          </div>
          <button
            type="button"
            aria-label="Reset filter antrean"
            onClick={() => onFilterQuick('all')}
            className={`grid size-10 place-items-center rounded-xl border transition ${
              quickFilter !== 'all'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            <Filter className="size-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Filter antrean"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Cari nama, NIK, atau no. pengajuan…"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
          />
          {query && (
            <button
              type="button"
              aria-label="Kosongkan kata kunci"
              onClick={() => onQuery('')}
              className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            aria-label="Filter antrean perlu tindakan"
            onClick={() => onFilterQuick(quickFilter === 'Perlu tindakan' ? 'all' : 'Perlu tindakan')}
            className={`min-h-14 rounded-xl border px-1 py-2 text-xs font-bold leading-tight transition ${
              quickFilter === 'Perlu tindakan'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/30'
                : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
            }`}
          >
            Perlu tindakan
            <span className="mt-1 block text-sm font-extrabold text-slate-950">{perluTindakanCount}</span>
          </button>
          <button
            type="button"
            aria-label="Filter antrean persetujuan"
            onClick={() => onFilterQuick(quickFilter === 'Persetujuan' ? 'all' : 'Persetujuan')}
            className={`min-h-14 rounded-xl border px-1 py-2 text-xs font-bold leading-tight transition ${
              quickFilter === 'Persetujuan'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/30'
                : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
            }`}
          >
            Persetujuan
            <span className="mt-1 block text-sm font-extrabold text-emerald-800">{persetujuanCount}</span>
          </button>
          <button
            type="button"
            aria-label="Filter antrean selesai"
            onClick={() => onFilterQuick(quickFilter === 'Selesai' ? 'all' : 'Selesai')}
            className={`min-h-14 rounded-xl border px-1 py-2 text-xs font-bold leading-tight transition ${
              quickFilter === 'Selesai'
                ? 'border-slate-800 bg-slate-100 text-slate-900 ring-2 ring-slate-400/30'
                : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50/50'
            }`}
          >
            Selesai
            <span className="mt-1 block text-sm font-extrabold text-slate-700">{selesaiCount}</span>
          </button>
        </div>
      </div>
      <div className="queue-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pr-2">
        {items.length === 0 ? (
          <div className="grid min-h-64 place-items-center text-center">
            <div>
              <Search className="mx-auto size-5 text-slate-400" />
              <p className="mt-3 text-sm font-extrabold">Data tidak ditemukan</p>
              <p className="mt-1 text-xs text-slate-500">Coba kata kunci lain atau hapus pencarian.</p>
              <button
                type="button"
                onClick={() => onQuery('')}
                className="mt-3 min-h-10 px-3 text-xs font-bold text-emerald-700 hover:underline"
              >
                Hapus pencarian
              </button>
            </div>
          </div>
        ) : (
          items.map((item, index) => {
            const active = Boolean(selected && String(item.id) === String(selected.id));
            return (
              <button
                type="button"
                key={item.id}
                aria-label={`Pilih ${item.name}`}
                onClick={() => onSelect(item)}
                style={{ animationDelay: `${index * 45}ms` }}
                className={`mustahik-row relative w-full rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 ${
                  active
                    ? 'border-emerald-300 bg-emerald-50/75 shadow-sm'
                    : 'border-transparent bg-white hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md'
                }`}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                      active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {initials(item.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm text-slate-900">{item.name}</strong>
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500 font-mono">
                      NIK {maskNik(item.nik)}
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-600">
                        Kec. {item.subdistrict || item.kecamatan || '-'}
                      </span>
                      <span className="max-w-32 truncate rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-700">
                        {item.status}
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export const KECAMATAN_KELURAHAN_MAP: Record<string, string[]> = {
  Batuceper: ['Batuceper', 'Batujaya', 'Batusari', 'Kebon Besar', 'Poris Gaga', 'Poris Gaga Baru', 'Poris Jaya'],
  Benda: ['Belendung', 'Benda', 'Jurumudi', 'Jurumudi Baru', 'Pajang'],
  Cibodas: ['Cibodas', 'Cibodasari', 'Cibodas Baru', 'Jatiuwung', 'Panunggangan Barat', 'Uwung Jaya'],
  Ciledug: ['Paninggilan', 'Paninggilan Utara', 'Parung Serab', 'Sudimara Barat', 'Sudimara Jaya', 'Sudimara Selatan', 'Sudimara Timur', 'Tajur'],
  Cipondoh: ['Cipondoh', 'Cipondoh Indah', 'Cipondoh Makmur', 'Gondrong', 'Kenanga', 'Petir', 'Poris Plawad', 'Poris Plawad Indah', 'Poris Plawad Utara', 'Ketapang'],
  Jatiuwung: ['Alam Jaya', 'Gandasari', 'Jatake', 'Keroncong', 'Manis Jaya', 'Pasir Jaya'],
  'Karang Tengah': ['Karang Mulya', 'Karang Tengah', 'Karang Timur', 'Parung Jaya', 'Pedurenan', 'Pondok Bahar', 'Pondok Pucung'],
  Karawaci: ['Bojong Jaya', 'Bugel', 'Cimone', 'Cimone Jaya', 'Gerendeng', 'Karawaci', 'Karawaci Baru', 'Koang Jaya', 'Margasari', 'Nambo Jaya', 'Nusa Jaya', 'Pabuaran', 'Pabuaran Tumpeng', 'Pasar Baru', 'Sukajadi', 'Sumur Pacing'],
  Larangan: ['Cipadu', 'Cipadu Jaya', 'Gaga', 'Kreo', 'Kreo Selatan', 'Larangan Indah', 'Larangan Selatan', 'Larangan Utara'],
  Neglasari: ['Karang Anyar', 'Karangsari', 'Kedaung Baru', 'Kedaung Wetan', 'Mekar Sari', 'Neglasari', 'Selapajang Jaya'],
  Periuk: ['Gebang Raya', 'Gembor', 'Periuk', 'Periuk Jaya', 'Sangiang Jaya'],
  Pinang: ['Cipete', 'Kunciran', 'Kunciran Indah', 'Kunciran Jaya', 'Nerogtog', 'Pakojan', 'Panunggangan', 'Panunggangan Timur', 'Panunggangan Utara', 'Pinang', 'Sudimara Pinang'],
  Tangerang: ['Babakan', 'Buaran Indah', 'Cikokol', 'Kelapa Indah', 'Sukarasa', 'Sukasari', 'Tanah Tinggi'],
};

export interface MustahikWorkspaceProps {
  isP0Enabled?: boolean;
}

export function MustahikWorkspace({ isP0Enabled: propP0Enabled }: MustahikWorkspaceProps = {}) {
  const isP0Enabled = propP0Enabled ?? (process.env.NEXT_PUBLIC_PENYALURAN_P0_ENABLED !== 'false');
  const { user } = useAuth();
  const isFinance = normalizeAccessActor(user).role === 'keuangan';
  const financeStage = DEFAULT_STAGES.find((item) => item.id === 'ppd')!;
  const [items, setItems] = useState<Mustahik[]>([]);
  const [stages, setStages] = useState(isFinance ? [financeStage] : DEFAULT_STAGES);
  const [stage, setStage] = useState<StageId>(isFinance ? 'ppd' : 'all');
  const [query, setQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'Perlu tindakan' | 'Persetujuan' | 'Selesai'>('all');
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('queue');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // Canonical Case Workspace State (Server-Truth)
  const [workspace, setWorkspace] = useState<P0CaseWorkspace | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState<boolean>(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Form states for Add Mustahik (P0 Intake) - Consequential fields start unselected
  const initialFormData = {
    name: '',
    nik: '',
    phone: '',
    kecamatan: '',
    kelurahan: '',
    address: '',
    asnaf: '',
    program: '',
  };
  const [formData, setFormData] = useState(initialFormData);
  const [intakeErrors, setIntakeErrors] = useState<Record<string, string> | null>(null);

  const resetForm = () => {
    setFormData(initialFormData);
    setIntakeErrors(null);
  };

  // Import State
  const [importText, setImportText] = useState('');

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const loadWorkspace = useCallback(async (id: number | string) => {
    setIsWorkspaceLoading(true);
    setWorkspaceError(null);
    try {
      const data = await api.getP0CaseWorkspace(id);
      setWorkspace(data);
    } catch (err: any) {
      setWorkspaceError(err.message || 'Gagal memuat ruang kerja kasus');
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, []);

  const loadData = useCallback(() => {
    setIsLoading(true);
    api.getMustahikList()
      .then((response) => {
        const rawList: Mustahik[] = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
          ? (response as unknown as Mustahik[])
          : [];
        const roleScopedList = isFinance
          ? rawList.filter((item) => ['Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'].includes(item.status))
          : rawList;
        setItems(roleScopedList);

        if (roleScopedList.length > 0) {
          const firstId = roleScopedList[0]!.id;
          setSelectedId((prev) => {
            if (prev && roleScopedList.some((item) => String(item.id) === String(prev))) {
              return prev;
            }
            return firstId;
          });
        }

        // Dynamically compute stages counts from loaded records
        const countAll = roleScopedList.length;
        const countDiajukan = roleScopedList.filter((a) => a.status === 'Diajukan').length;
        const countVerifikasi = roleScopedList.filter(
          (a) => a.status === 'Verifikasi Administrasi' || a.status === 'Verifikasi'
        ).length;
        const countSurvey = roleScopedList.filter((a) => a.status === 'Survey').length;
        const countMpzis = roleScopedList.filter((a) => a.status === 'Persetujuan MPZIS').length;
        const countPpd = roleScopedList.filter(
          (a) => a.status === 'Pengajuan Dana (FPD)' || a.status === 'Pengajuan Dana (PPD)'
        ).length;
        const countSelesai = roleScopedList.filter((a) => a.status === 'Penyaluran Selesai').length;

        const loadedStages: typeof DEFAULT_STAGES = [
          { id: 'all', stepNum: '★', label: 'Semua Data', description: 'Master 60-Kolom', count: countAll },
          { id: 'diajukan', stepNum: '1', label: 'Pengajuan Masuk', description: 'Antrean Baru', count: countDiajukan, statuses: ['Diajukan'] },
          {
            id: 'verifikasi',
            stepNum: '2',
            label: 'Verifikasi Syarat',
            description: 'Cek Dokumen',
            count: countVerifikasi,
            statuses: ['Verifikasi Administrasi', 'Verifikasi'],
          },
          { id: 'survey', stepNum: '3', label: 'Survey Lapangan', description: 'Form F-BPP/04', count: countSurvey, statuses: ['Survey'] },
          { id: 'mpzis', stepNum: '4', label: 'Sidang MPZIS', description: 'Persetujuan Pimpinan', count: countMpzis, statuses: ['Persetujuan MPZIS'] },
          {
            id: 'ppd',
            stepNum: '5',
            label: 'Pencairan PPD',
            description: 'Dana Siap Salur',
            count: countPpd,
            statuses: ['Pengajuan Dana (FPD)', 'Pengajuan Dana (PPD)'],
          },
          { id: 'selesai', stepNum: '✓', label: 'Penyaluran Selesai', description: 'Tersalurkan & LPJ', count: countSelesai, statuses: ['Penyaluran Selesai'] },
        ];
        setStages(isFinance ? [loadedStages.find((item) => item.id === 'ppd')!] : loadedStages);
      })
      .catch((err) => {
        console.error('Failed to load mustahik data:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isFinance]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selectedId changes, load the corresponding P0CaseWorkspace
  useEffect(() => {
    if (selectedId != null) {
      loadWorkspace(selectedId);
    }
  }, [selectedId, loadWorkspace]);

  // Modal keyboard listeners
  useEffect(() => {
    if (!addModalOpen && !importModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAddModalOpen(false);
        setImportModalOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', close);
    };
  }, [addModalOpen, importModalOpen]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const activeStage = stages.find((item) => item.id === stage);
    return items.filter((item) => {
      const matchSearch =
        !needle ||
        [item.name, item.nik, item.file_no, item.subdistrict, item.kecamatan, item.program, item.asnaf]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(needle));

      const matchStage = !activeStage?.statuses || activeStage.statuses.includes(item.status);

      let matchQuick = true;
      if (quickFilter === 'Perlu tindakan') {
        matchQuick =
          item.status === 'Diajukan' ||
          item.status === 'Verifikasi Administrasi' ||
          item.status === 'Verifikasi' ||
          item.status === 'Survey';
      } else if (quickFilter === 'Persetujuan') {
        matchQuick =
          item.status === 'Persetujuan MPZIS' ||
          item.status === 'Pengajuan Dana (FPD)' ||
          item.status === 'Pengajuan Dana (PPD)';
      } else if (quickFilter === 'Selesai') {
        matchQuick = item.status === 'Penyaluran Selesai';
      }

      return matchSearch && matchStage && matchQuick;
    });
  }, [items, query, stage, stages, quickFilter]);

  const selected = items.find((item) => String(item.id) === String(selectedId)) ?? items[0];

  const chooseStage = (id: StageId) => {
    setStage(id);
    const active = stages.find((item) => item.id === id);
    if (!active?.statuses || (selected && active.statuses.includes(selected.status))) return;
    const first = items.find((item) => active.statuses?.includes(item.status));
    if (first) setSelectedId(first.id);
  };

  const choosePerson = (item: Mustahik) => {
    setSelectedId(item.id);
    setMobileView('profile');
    if (window.innerWidth < 768) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const backButton = document.querySelector<HTMLButtonElement>('[aria-label="Kembali ke antrean"]');
          backButton?.closest('main')?.scrollIntoView({ block: 'start' });
          window.scrollBy({ top: -64, behavior: 'auto' });
          backButton?.focus({ preventScroll: true });
        })
      );
    }
  };

  const handleCreateMustahik = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isP0Enabled) {
      toast('Pendaftaran mustahik dinonaktifkan (P0 rollout read-only).');
      return;
    }

    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Nama lengkap wajib diisi.';
    if (!formData.nik.trim()) {
      errors.nik = 'NIK kependudukan wajib diisi.';
    } else if (!/^\d{16}$/.test(formData.nik.trim())) {
      errors.nik = 'NIK harus tepat 16 digit angka.';
    }
    if (!formData.kecamatan) errors.kecamatan = 'Kecamatan domisili wajib dipilih.';
    if (!formData.kelurahan.trim()) errors.kelurahan = 'Kelurahan domisili wajib dipilih atau diisi.';
    if (!formData.asnaf) errors.asnaf = 'Kategori asnaf wajib dipilih.';
    if (!formData.program) errors.program = 'Program bantuan wajib dipilih.';

    if (Object.keys(errors).length > 0) {
      setIntakeErrors(errors);
      return;
    }
    setIntakeErrors(null);
    setIsSubmitting(true);

    try {
      const payload: P0IntakePayload = {
        name: formData.name.trim(),
        nik: formData.nik.trim(),
        phone: formData.phone.trim() || undefined,
        kecamatan: formData.kecamatan,
        kelurahan: formData.kelurahan.trim(),
        address: formData.address.trim() || undefined,
        asnaf: formData.asnaf,
        program: formData.program,
        distribution_purpose: `Bantuan program ${formData.program}`,
      };

      await api.createP0MustahikIntake(payload);
      toast(`Pendaftaran Mustahik berhasil disimpan secara digital.`);
      setAddModalOpen(false);
      resetForm();
      loadData();
    } catch (err: any) {
      if (err.code === 'P0_WORKFLOW_DISABLED' || err.status === 503) {
        toast('Workflow P0 sedang dinonaktifkan oleh server (503 P0_WORKFLOW_DISABLED).');
      } else {
        toast(`Gagal menambahkan mustahik: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportSubmit = async () => {
    if (!importText.trim()) {
      toast('Silakan masukkan data JSON / CSV untuk diimpor');
      return;
    }
    setIsSubmitting(true);
    try {
      let parsedItems: any[] = [];
      if (importText.trim().startsWith('[')) {
        parsedItems = JSON.parse(importText);
      } else {
        const lines = importText.trim().split('\n');
        parsedItems = lines.slice(1).map((line) => {
          const [name, nik, phone, kecamatan, asnaf, program] = line
            .split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''));
          return {
            name: name || 'Mustahik Baru',
            nik: nik || '3671000000000000',
            phone: phone || '',
            kecamatan: kecamatan || 'Tangerang',
            asnaf: asnaf || 'Miskin',
            program: program || 'Tangerang Cerdas',
          };
        });
      }

      let successCount = 0;
      for (const item of parsedItems) {
        await api.createP0MustahikIntake({
          name: item.name,
          nik: item.nik,
          phone: item.phone,
          kecamatan: item.kecamatan,
          asnaf: item.asnaf,
          program: item.program,
        });
        successCount++;
      }

      toast(`Berhasil mendaftarkan ${successCount} data intake mustahik.`);
      setImportModalOpen(false);
      setImportText('');
      loadData();
    } catch (err: any) {
      toast(`Gagal mengimpor: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1880px] space-y-4 pb-8 text-slate-950">
      {!isP0Enabled && (
        <div
          role="status"
          aria-label="Status Rollout P0"
          className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 shadow-sm"
        >
          <Lock className="size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <strong className="font-bold">Mode Baca P0 (Rollout Terbatas): </strong>
            Pendaftaran berkas intake baru P0 sedang dinonaktifkan. Data arsip dan riwayat kasus tetap dapat ditinjau.
          </div>
        </div>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Data Mustahik</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Kelola pengajuan, verifikasi, dan progres penyaluran dalam satu ruang kerja digital P0.
          </p>
        </div>
        {!isFinance && <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex h-11 whitespace-nowrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold sm:px-4 sm:text-sm hover:bg-slate-50"
          >
            <Upload className="size-4" />
            Impor data
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isP0Enabled) {
                toast('Pendaftaran mustahik dinonaktifkan (P0 rollout read-only).');
                return;
              }
              setAddModalOpen(true);
            }}
            disabled={!isP0Enabled}
            aria-disabled={!isP0Enabled}
            title={!isP0Enabled ? 'Pendaftaran kasus baru dinonaktifkan (mode baca)' : undefined}
            className={`flex h-11 whitespace-nowrap items-center gap-2 rounded-xl px-3 text-xs font-bold sm:px-4 sm:text-sm ${
              !isP0Enabled
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-emerald-700 text-white hover:bg-emerald-800'
            }`}
          >
            <Plus className="size-4" />
            Tambah Mustahik
          </button>
        </div>}
      </header>

      <StageRail value={stage} onChange={chooseStage} stages={stages} />

      <section className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="relative min-h-[600px]">
          {/* Queue Aside */}
          <div
            className={`${
              mobileView === 'queue' ? 'flex flex-col' : 'hidden'
            } md:flex md:flex-col md:absolute md:inset-y-0 md:left-0 md:w-[310px] lg:w-[330px] border-r border-slate-200 bg-white z-10`}
          >
            <Queue
              items={filtered}
              allItems={items}
              totalCount={items.length}
              selected={selected || items[0]}
              query={query}
              quickFilter={quickFilter}
              onQuery={setQuery}
              onSelect={choosePerson}
              onFilterQuick={setQuickFilter}
            />
          </div>

          {/* Case Detail Main Panel */}
          <div
            className={`${
              mobileView === 'profile' ? 'block' : 'hidden'
            } md:block md:pl-[310px] lg:pl-[330px] min-w-0 bg-white`}
          >
            {/* Mobile Back Button */}
            <div className="flex md:hidden items-center border-b border-slate-200 bg-white px-4 py-2">
              <button
                type="button"
                onClick={() => setMobileView('queue')}
                aria-label="Kembali ke antrean"
                className="inline-flex items-center gap-1 rounded-xl p-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft className="size-4" />
                <span>Kembali ke antrean</span>
              </button>
            </div>

            {isWorkspaceLoading && !workspace ? (
              <div
                role="status"
                aria-label="Memuat ruang kerja kasus..."
                className="flex min-h-[500px] flex-col items-center justify-center p-8 text-center"
              >
                <Loader2 className="size-8 animate-spin text-emerald-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  Memuat ruang kerja kasus...
                </p>
              </div>
            ) : workspaceError ? (
              <div role="alert" className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
                <AlertTriangle className="size-8 text-rose-500" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-rose-800">{workspaceError}</p>
                {selectedId && (
                  <button
                    type="button"
                    onClick={() => loadWorkspace(selectedId)}
                    className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Coba Lagi
                  </button>
                )}
              </div>
            ) : workspace ? (
              <CaseWorkflowPanel
                workspace={workspace}
                onRefresh={() => loadWorkspace(workspace.case.id)}
                isRefreshing={isWorkspaceLoading}
              />
            ) : (
              <div className="grid min-h-[400px] place-items-center p-8 text-center text-slate-400">
                Pilih mustahik dari antrean.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Add Mustahik Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs backdrop-fade"
            onClick={() => {
              setAddModalOpen(false);
              resetForm();
            }}
          />
          <div className="modal-pop relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900">Pendaftaran Intake Mustahik Baru</h2>
              <button
                type="button"
                onClick={() => {
                  setAddModalOpen(false);
                  resetForm();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>

            {intakeErrors && (
              <div className="mt-3">
                <FieldErrorSummary errors={intakeErrors} />
              </div>
            )}

            <form onSubmit={handleCreateMustahik} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="intake-name" className="text-xs font-bold text-slate-600">
                    Nama Lengkap *
                  </label>
                  <input
                    id="intake-name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Siti Aminah"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="intake-nik" className="text-xs font-bold text-slate-600">
                    NIK (16 Digit) *
                  </label>
                  <input
                    id="intake-nik"
                    required
                    value={formData.nik}
                    maxLength={16}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="3671012345678901"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="intake-phone" className="text-xs font-bold text-slate-600">
                    No. WhatsApp
                  </label>
                  <input
                    id="intake-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="08123456789"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label htmlFor="intake-kecamatan" className="text-xs font-bold text-slate-600">
                    Kecamatan <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="intake-kecamatan"
                    value={formData.kecamatan}
                    onChange={(e) => {
                      const selectedKec = e.target.value;
                      setFormData({
                        ...formData,
                        kecamatan: selectedKec,
                        kelurahan: '',
                      });
                      if (intakeErrors?.kecamatan) {
                        setIntakeErrors((prev) => {
                          if (!prev) return null;
                          const next = { ...prev };
                          delete next.kecamatan;
                          return next;
                        });
                      }
                    }}
                    className={`mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 ${
                      intakeErrors?.kecamatan ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">-- Pilih Kecamatan --</option>
                    {Object.keys(KECAMATAN_KELURAHAN_MAP).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  {intakeErrors?.kecamatan && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600">{intakeErrors.kecamatan}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="intake-kelurahan" className="text-xs font-bold text-slate-600">
                    Kelurahan <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="intake-kelurahan"
                    value={formData.kelurahan}
                    disabled={!formData.kecamatan}
                    onChange={(e) => {
                      setFormData({ ...formData, kelurahan: e.target.value });
                      if (intakeErrors?.kelurahan) {
                        setIntakeErrors((prev) => {
                          if (!prev) return null;
                          const next = { ...prev };
                          delete next.kelurahan;
                          return next;
                        });
                      }
                    }}
                    className={`mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 ${
                      intakeErrors?.kelurahan ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">
                      {formData.kecamatan ? '-- Pilih Kelurahan --' : '-- Pilih Kecamatan Dahulu --'}
                    </option>
                    {formData.kecamatan &&
                      (KECAMATAN_KELURAHAN_MAP[formData.kecamatan] || []).map((kel) => (
                        <option key={kel} value={kel}>
                          {kel}
                        </option>
                      ))}
                  </select>
                  {intakeErrors?.kelurahan && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600">{intakeErrors.kelurahan}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="intake-asnaf" className="text-xs font-bold text-slate-600">
                    Asnaf <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="intake-asnaf"
                    value={formData.asnaf}
                    onChange={(e) => {
                      setFormData({ ...formData, asnaf: e.target.value });
                      if (intakeErrors?.asnaf) {
                        setIntakeErrors((prev) => {
                          if (!prev) return null;
                          const next = { ...prev };
                          delete next.asnaf;
                          return next;
                        });
                      }
                    }}
                    className={`mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 ${
                      intakeErrors?.asnaf ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">-- Pilih Asnaf --</option>
                    {[
                      'Fakir',
                      'Miskin',
                      'Fisabilillah',
                      'Ibnu Sabil',
                      'Gharimin',
                      'Muallaf',
                      'Riqab',
                      'Amil',
                    ].map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  {intakeErrors?.asnaf && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600">{intakeErrors.asnaf}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label htmlFor="intake-program" className="text-xs font-bold text-slate-600">
                    Program 5 Pilar <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="intake-program"
                    value={formData.program}
                    onChange={(e) => {
                      setFormData({ ...formData, program: e.target.value });
                      if (intakeErrors?.program) {
                        setIntakeErrors((prev) => {
                          if (!prev) return null;
                          const next = { ...prev };
                          delete next.program;
                          return next;
                        });
                      }
                    }}
                    className={`mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-500 ${
                      intakeErrors?.program ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200'
                    }`}
                  >
                    <option value="">-- Pilih Program 5 Pilar --</option>
                    {[
                      'Tangerang Cerdas',
                      'Tangerang Makmur',
                      'Tangerang Sehat',
                      'Tangerang Peduli',
                      'Tangerang Takwa',
                    ].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {intakeErrors?.program && (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600">{intakeErrors.program}</p>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="intake-address" className="text-xs font-bold text-slate-600">
                  Alamat Lengkap
                </label>
                <textarea
                  id="intake-address"
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Jl. Melati RT 01/RW 02..."
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalOpen(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span>Simpan Intake</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Data Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs backdrop-fade"
            onClick={() => setImportModalOpen(false)}
          />
          <div className="modal-pop relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900">Impor Data Mustahik Massal</h2>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-600">
                Tempel format JSON array atau CSV (Kolom: Nama, NIK, No HP, Kecamatan, Asnaf, Program):
              </p>
              <textarea
                rows={6}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`"Nama Lengkap","3671012345678901","08123456789","Cipondoh","Miskin","Tangerang Cerdas"\n"Budi Santoso","3671098765432109","08129876543","Karawaci","Fakir","Tangerang Makmur"`}
                className="font-mono w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleImportSubmit}
                  className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span>Mulai Impor Data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mustahik-toast fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl"
        >
          <CheckCircle2 className="size-4 text-emerald-400" />
          {notice}
        </div>
      )}
    </div>
  );
}

export default MustahikWorkspace;
