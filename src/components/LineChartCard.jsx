import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { CHART_DATA_12M } from '../data/dashboardData';
import { formatRupiahChart, formatRupiah } from '../utils/format';

const chartConfig = {
  penerimaan: { label: 'Penerimaan', color: 'var(--chart-1)' },
  penyaluran: { label: 'Penyaluran', color: 'var(--chart-2)' },
};

const periods = [
  { label: '12 Bulan', months: 12 },
  { label: '6 Bulan', months: 6 },
  { label: '3 Bulan', months: 3 },
];

export default function LineChartCard() {
  const [period, setPeriod] = useState(0);
  const monthsToShow = periods[period].months;
  const data = CHART_DATA_12M.slice(-monthsToShow);

  const summary = useMemo(() => {
    const totalPenerimaan = data.reduce((sum, d) => sum + d.penerimaan, 0);
    const totalPenyaluran = data.reduce((sum, d) => sum + d.penyaluran, 0);
    const avgPenerimaan = totalPenerimaan / data.length;
    const maxPenerimaan = Math.max(...data.map(d => d.penerimaan));
    const maxMonth = data.find(d => d.penerimaan === maxPenerimaan)?.month || '';
    return { totalPenerimaan, totalPenyaluran, avgPenerimaan, maxPenerimaan, maxMonth };
  }, [data]);

  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Grafik Penerimaan & Penyaluran</CardTitle>
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
        <div className="h-[200px] sm:h-[250px] md:h-[300px] w-full">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart data={data} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="penerimaanGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-penerimaan)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--color-penerimaan)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="penyaluranGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-penyaluran)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--color-penyaluran)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeOpacity={0.4} />
              <XAxis dataKey="month" axisLine={false} tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} dy={8}
                interval={monthsToShow > 6 ? 1 : 0} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickFormatter={formatRupiahChart}
                domain={[0, 'auto']}
                width={45} />
              <ChartTooltip content={
                <ChartTooltipContent
                  formatter={(value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)}
                />
              } />
              <ChartLegend content={<ChartLegendContent />} verticalAlign="top" align="left" />
              <Area type="monotone" dataKey="penerimaan" name="penerimaan"
                stroke="var(--color-penerimaan)" strokeWidth={2.5}
                fill="url(#penerimaanGrad)"
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2, fill: 'var(--color-penerimaan)' }} />
              <Area type="monotone" dataKey="penyaluran" name="penyaluran"
                stroke="var(--color-penyaluran)" strokeWidth={2.5}
                fill="url(#penyaluranGrad)"
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2, fill: 'var(--color-penyaluran)' }} />
            </AreaChart>
          </ChartContainer>
        </div>

        {/* Summary stats below chart */}
        <div className="border-t border-border mt-3 sm:mt-4 pt-3 sm:pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-[9px] text-muted-foreground">Total Penerimaan</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-600">{formatRupiah(summary.totalPenerimaan, true)}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-muted-foreground">Total Penyaluran</div>
              <div className="text-xs sm:text-sm font-bold text-blue-600">{formatRupiah(summary.totalPenyaluran, true)}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-muted-foreground">Rata-rata/Bulan</div>
              <div className="text-xs sm:text-sm font-bold text-foreground">{formatRupiah(summary.avgPenerimaan, true)}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-muted-foreground">Puncak</div>
              <div className="text-xs sm:text-sm font-bold text-amber-600 truncate">{summary.maxMonth}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
