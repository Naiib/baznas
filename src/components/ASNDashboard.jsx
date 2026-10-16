import { BarChart, Bar, XAxis } from 'recharts';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer } from '@/components/ui/chart';
import { ASN_DATA } from '../data/dashboardData';
import { formatRupiah } from '../utils/format';

const chartConfig = {
  value: { label: 'ASN Kontributor', color: 'var(--chart-2)' },
};

export default function ASNDashboard({ delay = 0 }) {
  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up py-0 gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-full"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardHeader className="pb-0.5 pt-3 sm:pt-4">
        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
          <Building2 className="size-4 text-blue-500" />
          ASN Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-2 sm:pb-2 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3 mb-2 sm:mb-3">
          <div className="text-center p-1.5 sm:p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-300">
            <div className="text-xs sm:text-lg font-bold text-foreground truncate">{ASN_DATA.totalContributors.toLocaleString('id-ID')}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground">Kontributor</div>
          </div>
          <div className="text-center p-1.5 sm:p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-300">
            <div className="text-xs sm:text-lg font-bold text-foreground truncate">{formatRupiah(ASN_DATA.totalCollection, true)}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground">Terkumpul</div>
          </div>
          <div className="text-center p-1.5 sm:p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-300">
            <div className="text-xs sm:text-lg font-bold text-foreground truncate">{ASN_DATA.upzUnits.toLocaleString('id-ID')}</div>
            <div className="text-[9px] sm:text-[10px] text-muted-foreground">UPZ Unit</div>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-[60px] w-full">
          <BarChart data={ASN_DATA.trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" hide />
            <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} barSize={8} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
