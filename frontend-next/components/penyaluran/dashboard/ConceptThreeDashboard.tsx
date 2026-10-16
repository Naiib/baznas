'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Activity, Award, FileText, Layers, MapPinned, Plus, Users } from 'lucide-react';
import { ImpactMetrics } from './ImpactMetrics';
import { TrendPanel } from './TrendPanel';
import { AsnafBreakdown } from './AsnafBreakdown';
import { ProgramImpactGrid } from './ProgramImpactGrid';
import { getDashboardData, getEmptyDashboardData, adaptBackendOverviewToDashboardData, type DashboardPeriod, type DashboardData } from './dashboard-data';
import { useAuth } from '@/components/auth/AuthProvider';
import { api } from '@/lib/api/client';
import type { PenyaluranByKecamatan, PenyaluranTransaction } from '@/lib/api/types';
import { isExplicitDemoMode } from '../map/map-data';
import { ArrowRight } from 'lucide-react';

const RealKecamatanMap = dynamic(
  () => import('../map/RealKecamatanMap'),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[360px] w-full place-items-center rounded-lg bg-zinc-100 text-xs text-zinc-500">
        Memuat Peta Geospasial Tangerang...
      </div>
    ),
  }
);

const DASHBOARD_TABS = [
  { id: 'ringkasan', label: 'Ringkasan Eksekutif', icon: Activity },
  { id: 'pilar', label: 'Analisis 5 Pilar', icon: Layers },
  { id: 'asnaf', label: 'Syariat 8 Asnaf', icon: Award },
  { id: 'buku-kas', label: 'Buku Kas Realisasi', icon: FileText },
] as const;

function getGreeting(hour: number) {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

export function ConceptThreeDashboard({ mapboxAccessToken }: { mapboxAccessToken?: string }) {
  const { user } = useAuth();
  const period: DashboardPeriod = '30d';
  const [activeTab, setActiveTab] = useState<(typeof DASHBOARD_TABS)[number]['id']>('ringkasan');
  const [selectedKecamatan, setSelectedKecamatan] = useState<string | null>(null);
  const [kecamatanData, setKecamatanData] = useState<PenyaluranByKecamatan[]>([]);
  const [liveOverview, setLiveOverview] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<PenyaluranTransaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [kecamatanError, setKecamatanError] = useState<string | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const today = new Date();
  const hijriDate = new Intl.DateTimeFormat('id-ID-u-ca-islamic', { day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  const gregorianDate = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(today);

  useEffect(() => {
    setOverviewLoading(true);
    setLoadError(null);
    api.getPenyaluranOverview(period)
      .then((res) => {
        if (res.data) setLiveOverview(adaptBackendOverviewToDashboardData(res.data, period));
      })
      .catch((err) => setLoadError(err?.message || 'Gagal memuat data ringkasan operasional.'))
      .finally(() => setOverviewLoading(false));
  }, [period]);

  useEffect(() => {
    setKecamatanError(null);
    api.getPenyaluranByKecamatan()
      .then((res) => setKecamatanData(res.data || []))
      .catch((err) => setKecamatanError(err?.message || 'Data wilayah belum dapat dimuat.'));
  }, []);

  useEffect(() => {
    let active = true;
    api.getPenyaluranTransactions()
      .then((res) => { if (active) setTransactions(res.data || []); })
      .catch((err) => { if (active) setTransactionsError(err?.message || 'Jurnal transaksi belum dapat dimuat.'); })
      .finally(() => { if (active) setTransactionsLoading(false); });
    return () => { active = false; };
  }, []);

  const data = liveOverview || (isExplicitDemoMode() ? getDashboardData(period) : getEmptyDashboardData(period));
  const selectedData = selectedKecamatan
    ? kecamatanData.find((k) => k.name.toLowerCase() === selectedKecamatan.toLowerCase())
    : null;
  const selectedFallback = selectedKecamatan ? data.map[selectedKecamatan] : null;
  const activeTabLabel = DASHBOARD_TABS.find((tab) => tab.id === activeTab)?.label;

  return (
    <div className="mx-auto max-w-[1540px] space-y-5 pb-10">
      <header className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">Penyaluran & Asesmen Program</h1><span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">{hijriDate} H</span></div>
          <p className="mt-1.5 text-sm text-zinc-600">{getGreeting(today.getHours())}, <span className="font-semibold text-zinc-900">{user?.name || 'Amil Penyaluran'}</span> · {gregorianDate} · Kota Tangerang</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/penyaluran/peta" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"><MapPinned className="size-4 text-emerald-700" />Peta Sebaran 13 Kec.</Link>
          <Link href="/penyaluran/mustahik" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"><Users className="size-4 text-emerald-700" />Master Mustahik</Link>
          <Link href="/penyaluran/transaksi/baru" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"><Plus className="size-4" />Catat Penyaluran Baru</Link>
        </div>
      </header>

      <div className="flex min-h-5 justify-end">
        {overviewLoading ? <p role="status" className="text-xs font-semibold text-zinc-500">Memuat ringkasan operasional…</p> : loadError ? <p className="text-xs font-semibold text-rose-700">{loadError}</p> : data.dataStatus === 'empty' ? <p className="text-xs font-semibold text-zinc-500">Belum ada transaksi tervalidasi untuk periode ini.</p> : null}
      </div>

      {overviewLoading ? (
        <div role="status" className="grid min-h-[420px] place-items-center rounded-xl border border-zinc-200 bg-white p-8 text-sm font-semibold text-zinc-500">Memuat ringkasan operasional…</div>
      ) : <>
        <ImpactMetrics data={data} />
        <div role="tablist" aria-label="Modul ringkasan penyaluran" className="flex gap-1 overflow-x-auto border-b border-zinc-200">
          {DASHBOARD_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return <button key={tab.id} type="button" role="tab" id={`dashboard-tab-${tab.id}`} aria-selected={selected} aria-controls="dashboard-tab-panel" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold sm:px-4 sm:text-sm ${selected ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-zinc-600 hover:text-zinc-900'}`}><Icon className="size-4" />{tab.label}</button>;
          })}
        </div>

        <section role="tabpanel" id="dashboard-tab-panel" aria-labelledby={`dashboard-tab-${activeTab}`} aria-label={activeTabLabel}>
          {activeTab === 'ringkasan' && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0 space-y-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]"><TrendPanel data={data} /><AsnafBreakdown data={data} /></div>
              <ProgramImpactGrid data={data} />
              <section className="rounded-xl border border-zinc-200 bg-white p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900"><MapPinned className="size-4 text-emerald-700" />Peta Sebaran Penyaluran</h2><p className="mt-1 text-sm text-zinc-500">Pilih kecamatan untuk melihat cakupan penerima.</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">13 kecamatan</span></div>
                {kecamatanError && <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{kecamatanError}</p>}
                <RealKecamatanMap selectedKecamatan={selectedKecamatan} onSelectKecamatan={setSelectedKecamatan} liveData={kecamatanData} periodData={data.map} mapboxAccessToken={mapboxAccessToken} />
                {selectedKecamatan && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Kecamatan terpilih</p><h3 className="mt-1 text-base font-bold text-zinc-900">{selectedKecamatan}</h3><p className="mt-1 text-sm text-zinc-600">{(selectedData?.totalMustahik ?? selectedFallback?.beneficiaries ?? 0).toLocaleString('id-ID')} mustahik · {selectedData?.topProgram ?? selectedFallback?.program ?? 'Belum ada data'}</p></div><Link href={`/penyaluran/mustahik?kecamatan=${encodeURIComponent(selectedKecamatan)}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-950">Lihat detail mustahik <ArrowRight className="size-4" /></Link></div>}
              </section>
            </div>
            <aside className="rounded-xl border border-zinc-200 bg-white p-5 xl:sticky xl:top-20"><h2 className="mb-4 border-b border-zinc-200 pb-3 text-sm font-bold text-zinc-900">Prioritas Tindakan</h2><ul className="space-y-3">{data.actions.map((item) => <li key={item.title}><Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50"><span><strong className="block text-zinc-800">{item.title}</strong><small className="mt-1 block text-zinc-500">{item.description}</small></span><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">{item.count}</span></Link></li>)}</ul></aside>
          </div>}
          {activeTab === 'pilar' && <ProgramImpactGrid data={data} />}
          {activeTab === 'asnaf' && <AsnafBreakdown data={data} />}
          {activeTab === 'buku-kas' && <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><header className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="text-base font-bold text-zinc-900">Buku Kas Realisasi Penyaluran</h2><p className="mt-1 text-sm text-zinc-500">Riwayat transaksi yang tercatat pada sistem.</p></div><Link href="/penyaluran/transaksi" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">Buka jurnal lengkap</Link></header>
            {transactionsLoading ? <p role="status" className="p-6 text-sm text-zinc-500">Memuat buku kas…</p> : transactionsError ? <p role="alert" className="p-6 text-sm font-semibold text-rose-700">{transactionsError}</p> : transactions.length === 0 ? <p className="p-8 text-center text-sm text-zinc-500">Belum ada transaksi penyaluran.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-4 py-3">Nomor / Tanggal</th><th className="px-4 py-3">Mustahik</th><th className="px-4 py-3">Program</th><th className="px-4 py-3">Kecamatan</th><th className="px-4 py-3 text-right">Nominal</th></tr></thead><tbody className="divide-y divide-zinc-100">{transactions.slice(0, 8).map((transaction) => <tr key={transaction.id}><td className="px-4 py-3"><span className="block font-semibold text-emerald-800">{transaction.transaction_number || transaction.ppd_number || transaction.form_number || '—'}</span><span className="text-xs text-zinc-500">{transaction.disbursement_date ? new Date(transaction.disbursement_date).toLocaleDateString('id-ID') : 'Tanggal tidak tersedia'}</span></td><td className="px-4 py-3 font-semibold text-zinc-800">{transaction.recipient_name}</td><td className="px-4 py-3 text-zinc-600">{transaction.program || '—'}</td><td className="px-4 py-3 text-zinc-600">{transaction.kecamatan || '—'}</td><td className="px-4 py-3 text-right font-bold text-zinc-900">{formatRupiah(transaction.amount)}</td></tr>)}</tbody></table></div>}
          </section>}
        </section>
      </>}
    </div>
  );
}
