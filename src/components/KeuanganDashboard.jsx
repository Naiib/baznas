import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import StatCard from './StatCard';
import {
  Coins,
  Wallet,
  Landmark,
  TrendingUp,
  Download,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  X
} from 'lucide-react';
import {
  FINANCE_METRICS,
  FINANCIAL_LEDGER,
  PENERIMAAN_CHART_12M,
  PENYALURAN_CHART_12M
} from '../data/penerimaanData';
import { formatRupiah, formatRupiahChart } from '../utils/format';
import useCountUp from '../hooks/useCountUp';

const chartConfig = {
  penerimaan: { label: 'Total Penerimaan', color: '#10b981' },
  penyaluran: { label: 'Total Penyaluran', color: '#3b82f6' }
};

const periods = [
  { label: '12 Bulan', months: 12 },
  { label: '6 Bulan', months: 6 },
  { label: '3 Bulan', months: 3 }
];

export default function KeuanganDashboard() {
  const [period, setPeriod] = useState(0);
  const monthsToShow = periods[period].months;

  // State for ledger transactions
  const [ledger, setLedger] = useState(FINANCIAL_LEDGER);
  const [showAddSheet, setShowAddSheet] = useState(false);

  // Form states
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('Debet');
  const [formAmount, setFormAmount] = useState('');
  const [formAccount, setFormAccount] = useState('Kas Bank BSI');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);

  // Custom Toast State
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  // Merge Penerimaan and Penyaluran datasets for AreaChart dynamically
  const mergedChartData = useMemo(() => {
    return PENERIMAAN_CHART_12M.slice(-monthsToShow).map((pTrx) => {
      const pTotal = pTrx.zakatMaal + pTrx.zakatFitrah + pTrx.infak + pTrx.sedekah;
      
      // Find matching month in Penyaluran chart
      const yTrx = PENYALURAN_CHART_12M.find(y => y.month === pTrx.month) || {
        pendidikan: 0, kesehatan: 0, sosial: 0, ekonomi: 0, dakwah: 0
      };
      const yTotal = yTrx.pendidikan + yTrx.kesehatan + yTrx.sosial + yTrx.ekonomi + yTrx.dakwah;

      return {
        month: pTrx.month,
        penerimaan: pTotal,
        penyaluran: yTotal
      };
    });
  }, [monthsToShow]);

  // Recalculate metrics based on ledger transactions
  const metrics = useMemo(() => {
    const addedAmount = ledger.slice(FINANCIAL_LEDGER.length).reduce((sum, trx) => {
      if (trx.type === 'Debet') return sum + trx.amount;
      return sum - trx.amount;
    }, 0);

    return {
      totalAssets: FINANCE_METRICS.totalAssets + addedAmount,
      cashAndBank: FINANCE_METRICS.cashAndBank + addedAmount,
      amilRatio: FINANCE_METRICS.amilRatio,
      rkatRealization: FINANCE_METRICS.rkatRealization,
      totalOperational: FINANCE_METRICS.totalOperational
    };
  }, [ledger]);

  const animatedAssets = useCountUp(metrics.totalAssets, 1500, '', '', true);
  const animatedCash = useCountUp(metrics.cashAndBank, 1500, '', '', true);
  const animatedOperational = useCountUp(metrics.totalOperational, 1200, '', '', true);
  const animatedRatio = useCountUp(metrics.amilRatio, 1000, '', '%');
  const animatedRkat = useCountUp(metrics.rkatRealization, 1000, '', '%');

  // Distribution chart of bank accounts / assets
  const accountDistribution = [
    { name: 'Kas Bank BSI', value: 240_000_000_000, color: '#0f766e' },
    { name: 'Kas Bank BJB', value: 180_000_000_000, color: '#1d4ed8' },
    { name: 'Kas Bank Mandiri', value: 110_000_000_000, color: '#d97706' },
    { name: 'Kas Tunai & Lainnya', value: 30_000_000_000, color: '#4b5563' }
  ];

  const totalAccountFunds = accountDistribution.reduce((sum, item) => sum + item.value, 0);

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!formDesc || !formAmount) {
      showToast('Harap lengkapi semua kolom!', 'error');
      return;
    }

    const newTrx = {
      date: formDate,
      desc: formDesc,
      type: formType,
      amount: parseFloat(formAmount),
      account: formAccount
    };

    setLedger([newTrx, ...ledger]);
    setShowAddSheet(false);
    showToast(`Transaksi "${formDesc}" berhasil dicatat ke buku besar!`);

    // Reset Form
    setFormDesc('');
    setFormAmount('');
    setFormType('Debet');
    setFormAccount('Kas Bank BSI');
  };

  const handleExportPDF = () => {
    showToast('Mengekspor laporan neraca lajur ke format PDF...');
    setTimeout(() => {
      showToast('Neraca Lajur PDF Berhasil diunduh!', 'success');
    }, 2000);
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5 sm:space-y-6 md:space-y-8 relative">
      
      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border border-border shadow-2xl rounded-xl p-4 animate-fade-in pr-10 min-w-[300px]">
          <CheckCircle2 className={`size-5 shrink-0 ${toast.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`} />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-foreground">
              {toast.type === 'success' ? 'Berhasil' : 'Pemberitahuan'}
            </span>
            <span className="text-[11px] text-muted-foreground">{toast.message}</span>
          </div>
          <button 
            onClick={() => setToast(prev => ({ ...prev, show: false }))}
            className="absolute top-2 right-2 text-muted-foreground/60 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard Keuangan & Anggaran</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Monitoring arus kas penerimaan vs penyaluran, rasio kepatuhan amil, dan realisasi anggaran
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExportPDF}>
            <Download className="size-3.5" /> Cetak Neraca
          </Button>
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setShowAddSheet(true)}>
            <Plus className="size-3.5" /> Catat Transaksi
          </Button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        <StatCard
          icon={Landmark}
          iconBg="#ecfdf5"
          iconColor="#059669"
          label="Aset Kelolaan"
          value={animatedAssets}
          rawValue={metrics.totalAssets}
          change="+10,5%"
          delay={0}
        />
        <StatCard
          icon={Wallet}
          iconBg="#eff6ff"
          iconColor="#3b82f6"
          label="Saldo Kas & Bank"
          value={animatedCash}
          rawValue={metrics.cashAndBank}
          change="+5,2%"
          delay={100}
        />
        <StatCard
          icon={Coins}
          iconBg="#f5f3ff"
          iconColor="#7c3aed"
          label="Biaya Operasional"
          value={animatedOperational}
          rawValue={metrics.totalOperational}
          change="-2,1%"
          delay={200}
        />
        <StatCard
          icon={TrendingUp}
          iconBg="#fffbeb"
          iconColor="#d97706"
          label="Rasio Amil"
          value={animatedRatio}
          rawValue={metrics.amilRatio}
          change="Regulasi < 12.5%"
          delay={300}
        />
        <StatCard
          icon={TrendingUp}
          iconBg="#f0fdfa"
          iconColor="#14b8a6"
          label="Realisasi RKAT"
          value={animatedRkat}
          rawValue={metrics.rkatRealization}
          change="On Track"
          trend="up"
          delay={400}
        />
      </div>

      {/* Row 2: Cashflow Trend Chart & Account Pie Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3 sm:gap-4">
        {/* Trend Area Chart */}
        <Card className="card-spotlight shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-semibold">Tren Arus Kas (Penerimaan vs Penyaluran)</CardTitle>
            <div className="flex gap-1">
              {periods.map((p, idx) => (
                <Button
                  key={p.label}
                  variant={idx === period ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 sm:h-7 text-[10px] sm:text-[11px] px-1.5 sm:px-2"
                  onClick={() => setPeriod(idx)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] sm:h-[260px] md:h-[300px] w-full">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <AreaChart data={mergedChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorPenerimaan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorPenyaluran" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    tickFormatter={formatRupiahChart}
                    width={45}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) =>
                          new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            maximumFractionDigits: 0,
                          }).format(value)
                        }
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="left" />
                  <Area type="monotone" dataKey="penerimaan" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPenerimaan)" dot={false} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2, fill: '#10b981' }} />
                  <Area type="monotone" dataKey="penyaluran" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPenyaluran)" dot={false} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2, fill: '#3b82f6' }} />
                </AreaChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>

        {/* Account Funds distribution */}
        <Card className="card-spotlight shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs sm:text-sm font-semibold">Alokasi Rekening Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full relative">
              <PieChart width={260} height={200} className="mx-auto">
                <Pie
                  data={accountDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {accountDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-xs font-bold text-foreground">{formatRupiah(totalAccountFunds, true)}</p>
                <p className="text-[10px] text-muted-foreground">Total Kas</p>
              </div>
            </div>
            <div className="space-y-1.5 mt-3">
              {accountDistribution.map((item) => {
                const percent = Math.round((item.value / totalAccountFunds) * 100);
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-muted-foreground">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold text-foreground">{formatRupiah(item.value, true)}</span>
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Transactions Ledger */}
      <Card className="card-spotlight shadow-card flex flex-col">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-xs sm:text-sm font-semibold">Buku Besar Transaksi Keuangan Terbaru</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-semibold text-muted-foreground">Tanggal</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Deskripsi Transaksi</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground">Alokasi Rekening</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-center">Mutasi</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Nominal Mutasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.map((trx, idx) => (
                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{trx.date}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{trx.desc}</td>
                  <td className="px-4 py-3 text-muted-foreground font-semibold">{trx.account}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      trx.type === 'Debet' 
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' 
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                    }`}>
                      {trx.type === 'Debet' ? (
                        <span className="flex items-center gap-0.5"><ArrowUpRight className="size-3" /> Debet (Masuk)</span>
                      ) : (
                        <span className="flex items-center gap-0.5"><ArrowDownRight className="size-3" /> Kredit (Keluar)</span>
                      )}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-black ${trx.type === 'Debet' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {trx.type === 'Debet' ? '+' : '-'}{formatRupiah(trx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Sheet: Catat Transaksi Buku Besar */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="right" className="sm:max-w-md bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">Catat Mutasi Buku Besar</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1">
              Catat mutasi debet atau kredit kas BAZNAS secara manual ke dalam buku besar
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Deskripsi / Keterangan Transaksi</label>
              <Input
                placeholder="Contoh: Pembayaran Listrik Kantor Bulanan"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Jenis Mutasi</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Debet">Debet (Penerimaan / Kas Masuk)</option>
                <option value="Kredit">Kredit (Pengeluaran / Kas Keluar)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Alokasi Kas / Rekening Bank</label>
              <select
                value={formAccount}
                onChange={(e) => setFormAccount(e.target.value)}
                className="w-full h-9 text-xs rounded-md border border-border bg-background px-3 py-1 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <option value="Kas Bank BSI">Kas Bank BSI</option>
                <option value="Kas Bank BJB">Kas Bank BJB</option>
                <option value="Kas Bank Mandiri">Kas Bank Mandiri</option>
                <option value="Kas Tunai & Lainnya">Kas Tunai & Lainnya</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Jumlah Mutasi (IDR)</label>
              <Input
                type="number"
                placeholder="Contoh: 15000000"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Tanggal Transaksi</label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-9 text-xs focus-visible:ring-emerald-500 border-border"
                required
              />
            </div>

            <div className="pt-4 flex gap-2 border-t border-border mt-6">
              <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={() => setShowAddSheet(false)}>
                Batal
              </Button>
              <Button type="submit" className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                Simpan Transaksi
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
