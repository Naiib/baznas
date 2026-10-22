'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, BarChart3, Download, HeartHandshake, MapPinned, UsersRound } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { PenyaluranByKecamatan } from '@/lib/api/types';
import {
  ASNAF_DISTRIBUTION,
  getKecamatanInsight,
  getKecamatanMapValue,
  PROGRAM_ALLOCATION,
  isExplicitDemoMode,
  type MapMetric,
} from '../map/map-data';

const RealKecamatanMap = dynamic(() => import('../map/RealKecamatanMap'), {
  ssr: false,
  loading: () => <div className="flex h-[430px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400">Memuat peta Kota Tangerang...</div>,
});

const METRIC_OPTIONS: Array<{ id: MapMetric; label: string; detailLabel: string }> = [
  { id: 'funds', label: 'Realisasi dana', detailLabel: 'Realisasi penyaluran' },
  { id: 'beneficiaries', label: 'Jumlah mustahik', detailLabel: 'Mustahik terbantu' },
  { id: 'asnafNeed', label: 'Kebutuhan asnaf', detailLabel: 'Keluarga prioritas asnaf' },
];

function formatMetricValue(value: number, metric: MapMetric) {
  if (metric === 'funds') return `Rp ${(value / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M`;
  return `${value.toLocaleString('id-ID')} ${metric === 'beneficiaries' ? 'jiwa' : 'KK'}`;
}

export function PetaSebaranWorkspace({ mapboxAccessToken }: { mapboxAccessToken?: string }) {
  const isDemo = isExplicitDemoMode();
  const [selectedKecamatan, setSelectedKecamatan] = useState('Cipondoh');
  const [metric, setMetric] = useState<MapMetric>('funds');
  const [kecamatanList, setKecamatanList] = useState<PenyaluranByKecamatan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataUnavailable, setDataUnavailable] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getPenyaluranByKecamatan().then((res) => {
      if (res.data && res.data.length > 0) {
        setKecamatanList(res.data);
        setDataUnavailable(false);
      } else setDataUnavailable(true);
    }).catch(() => setDataUnavailable(true)).finally(() => setLoading(false));
  }, []);

  const selectedData = useMemo(
    () => kecamatanList.find((item) => item.name.toLowerCase() === selectedKecamatan.toLowerCase()),
    [kecamatanList, selectedKecamatan],
  );
  const showDemoInsights = isDemo && !loading && kecamatanList.length === 0;
  const showPriorityBadge = Boolean(selectedData) || showDemoInsights;
  const selectedInsight = showDemoInsights
    ? getKecamatanInsight(selectedKecamatan)
    : { dominantAsnaf: 'Belum ada data', priorityNote: 'Belum ada data tindak lanjut untuk wilayah ini.', trendPercent: null };
  const selectedTopProgram = selectedData?.topProgram ?? (showDemoInsights ? getKecamatanInsight(selectedKecamatan).topProgram : 'Belum ada data');
  const activeMetric = METRIC_OPTIONS.find((option) => option.id === metric) ?? METRIC_OPTIONS[0]!;
  const activeMetricValue = getKecamatanMapValue(selectedKecamatan, metric, kecamatanList);
  const maxProgramAllocation = Math.max(...PROGRAM_ALLOCATION.map((program) => program.amount));
  const aggregateMessage = loading
    ? 'Memuat data peta…'
    : kecamatanList.length > 0
      ? 'Data agregat program belum tersedia untuk periode ini.'
      : 'Data agregat program belum tersedia karena data peta tidak tersedia.';

  const [notice, setNotice] = useState<string | null>(null);

  const handleExportMap = () => {
    const exportUrl = api.getExportUrl('peta-sebaran-13-kecamatan', 'csv');
    window.open(exportUrl, '_blank');
    setNotice('Data sebaran 13 kecamatan berhasil diekspor.');
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 pb-8 text-slate-950">
      <header className="grid gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-emerald-800"><MapPinned className="size-4" />Sistem Informasi Geospasial</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Peta Sebaran Penyaluran</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Pantau besaran dana, mustahik terbantu, serta kebutuhan asnaf di 13 kecamatan Kota Tangerang.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${dataUnavailable ? 'bg-amber-50 text-amber-800' : loading ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}><span className={`relative inline-flex size-2.5 rounded-full ${dataUnavailable ? 'bg-amber-500' : loading ? 'bg-slate-400' : 'bg-emerald-600'}`} />{loading ? 'Memuat data peta…' : dataUnavailable ? 'Data peta tidak tersedia' : 'Data peta tersinkron'}</span>
          <button
            type="button"
            onClick={handleExportMap}
            className="flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 sm:px-4 cursor-pointer"
          >
            <Download className="size-4" />
            Ekspor peta
          </button>
        </div>
      </header>

      {notice && (
        <div role="status" className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl">
          <Download className="size-4 text-emerald-400" />
          {notice}
        </div>
      )}

      {dataUnavailable && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">Data peta tidak tersedia. Coba muat ulang setelah layanan data kembali aktif.</div>}

      <section aria-labelledby="peta-utama-title" className="space-y-3">
        <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 id="peta-utama-title" className="text-base font-extrabold tracking-tight">Dampak penyaluran per kecamatan</h2><p className="mt-1 text-sm text-slate-500">Pilih metrik lalu klik wilayah pada peta untuk melihat konteks tindak lanjut.</p></div>
          <div role="group" aria-label="Metrik peta" className="flex flex-wrap items-center gap-2">
            {METRIC_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={metric === option.id} onClick={() => setMetric(option.id)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${metric === option.id ? 'border-emerald-600 bg-emerald-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'}`}>{option.label}</button>)}
          </div>
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(290px,.72fr)]">
          <RealKecamatanMap metric={metric} selectedKecamatan={selectedKecamatan} onSelectKecamatan={setSelectedKecamatan} liveData={kecamatanList} mapboxAccessToken={mapboxAccessToken} />
          <aside aria-label="Detail wilayah terpilih" aria-live="polite" className="flex min-h-[430px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
            <div key={`${selectedKecamatan}-${metric}`} className="map-detail-enter flex min-h-0 flex-1 flex-col"><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-emerald-700">Wilayah terpilih</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">{selectedKecamatan}</h2><p className="mt-1 text-xs text-slate-500">Pembaruan data hari ini</p></div>{showPriorityBadge && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700">PRIORITAS</span>}</div>
            <div className="py-5"><p className="text-xs font-bold text-slate-500">{activeMetric.detailLabel}</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-emerald-700">{formatMetricValue(activeMetricValue, metric)}</p><p className="mt-2 text-xs font-bold text-emerald-700">{selectedInsight.trendPercent === null ? 'Tren belum tersedia' : `↑ ${selectedInsight.trendPercent.toLocaleString('id-ID')}% dari periode sebelumnya`}</p></div>
            <dl className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 text-sm"><div className="rounded-xl bg-slate-50 px-3 py-3"><dt className="text-[11px] font-bold text-slate-500">Mustahik terbantu</dt><dd className="mt-1 font-extrabold tracking-tight">{(selectedData?.totalMustahik ?? 0).toLocaleString('id-ID')} jiwa</dd></div><div className="rounded-xl bg-slate-50 px-3 py-3"><dt className="text-[11px] font-bold text-slate-500">Program dominan</dt><dd className="mt-1 font-extrabold tracking-tight">{selectedTopProgram}</dd></div><div className="col-span-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-3"><dt className="text-[11px] font-extrabold uppercase tracking-wide text-amber-700">Fokus tindak lanjut · {selectedInsight.dominantAsnaf}</dt><dd className="mt-1 text-xs font-semibold leading-5 text-amber-950">{selectedInsight.priorityNote}</dd></div></dl>
            <Link href={`/penyaluran/mustahik?kecamatan=${encodeURIComponent(selectedKecamatan)}`} className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition hover:bg-emerald-800">Buka daftar mustahik <ArrowRight className="size-4" /></Link></div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,.88fr)]">
        <article aria-labelledby="program-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.03)]"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-700"><BarChart3 className="size-4" /><h2 id="program-title" className="text-base font-extrabold tracking-tight text-slate-950">Besaran penyaluran berdasarkan program</h2></div><p className="mt-1 text-sm text-slate-500">Alokasi nominal 5 pilar pada periode aktif.</p></div><span className="text-xs font-bold text-emerald-700">5 pilar</span></div>{showDemoInsights ? <div className="mt-5 space-y-3">{PROGRAM_ALLOCATION.map((program) => <div key={program.name} className="grid grid-cols-[minmax(106px,.72fr)_minmax(0,1.5fr)_78px] items-center gap-3 text-xs"><span className="font-bold text-slate-600">{program.name}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(program.amount / maxProgramAllocation) * 100}%` }} /></div><strong className="text-right font-extrabold text-slate-900">Rp {(program.amount / 1_000_000).toLocaleString('id-ID')} jt</strong></div>)}</div> : <p className="mt-5 py-6 text-center text-xs font-semibold text-slate-500">{aggregateMessage}</p>}</article>
        <article aria-labelledby="asnaf-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.03)]"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-emerald-700"><HeartHandshake className="size-4" /><h2 id="asnaf-title" className="text-base font-extrabold tracking-tight text-slate-950">Sebaran mustahik per asnaf</h2></div><p className="mt-1 text-sm text-slate-500">Komposisi penerima untuk wilayah terpilih.</p></div><UsersRound className="size-5 text-emerald-600" /></div>{showDemoInsights ? <dl className="mt-5 grid grid-cols-2 gap-3">{ASNAF_DISTRIBUTION.map((asnaf) => <div key={asnaf.name} className="rounded-xl bg-slate-50 px-3 py-3"><dt className="text-xs font-bold text-slate-500">{asnaf.name}</dt><dd className="mt-1 flex items-baseline gap-1"><span className="text-lg font-extrabold tracking-tight">{asnaf.count}</span><span className="text-[11px] font-bold text-emerald-700">· {asnaf.percentage}%</span></dd></div>)}</dl> : <p className="mt-5 py-6 text-center text-xs font-semibold text-slate-500">{aggregateMessage.replace('program', 'komposisi asnaf')}</p>}</article>
      </section>
    </div>
  );
}
