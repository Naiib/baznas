import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TRANSACTIONS } from '../data/dashboardData';
import { formatRupiah } from '../utils/format';

const statusColors = {
  Diterima: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Diproses: 'bg-amber-50 text-amber-700 border-amber-200',
  Tersalurkan: 'bg-blue-50 text-blue-700 border-blue-200',
};

const statusDots = {
  Diterima: 'bg-emerald-500',
  Diproses: 'bg-amber-500',
  Tersalurkan: 'bg-blue-500',
};

const jenisColors = {
  'Zakat Maal': 'text-emerald-600',
  'Zakat Fitrah': 'text-amber-600',
  Infak: 'text-blue-600',
  Sedekah: 'text-purple-600',
};

export default function RecentTransactions() {
  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Transaksi Terbaru</CardTitle>
        <Button variant="ghost" size="sm" className="text-xs h-auto p-0 text-emerald-600 hover:text-emerald-700 gap-1">
          Lihat Semua
          <ArrowRight className="size-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-0 flex flex-col flex-1 min-h-0">
        <div className="overflow-x-auto flex-1 min-h-0">
          <div className="overflow-y-auto max-h-full pb-3 sm:pb-4">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky top-0 bg-card text-left text-[10px] sm:text-xs font-medium text-muted-foreground px-2 sm:px-4 py-2 sm:py-2.5 z-10">Tanggal</th>
                  <th className="sticky top-0 bg-card text-left text-[10px] sm:text-xs font-medium text-muted-foreground px-2 sm:px-4 py-2 sm:py-2.5 z-10">Muzakki</th>
                  <th className="sticky top-0 bg-card text-left text-[10px] sm:text-xs font-medium text-muted-foreground px-2 sm:px-4 py-2 sm:py-2.5 hidden sm:table-cell z-10">Jenis</th>
                  <th className="sticky top-0 bg-card text-right text-[10px] sm:text-xs font-medium text-muted-foreground px-2 sm:px-4 py-2 sm:py-2.5 z-10">Jumlah</th>
                  <th className="sticky top-0 bg-card text-center text-[10px] sm:text-xs font-medium text-muted-foreground px-2 sm:px-4 py-2 sm:py-2.5 hidden md:table-cell z-10">Status</th>
                </tr>
              </thead>
              <tbody>
                {TRANSACTIONS.slice(0, 10).map((tx, idx) => (
                  <tr key={idx}
                    className="border-b border-border/50 hover:bg-secondary/50 transition-colors duration-200 animate-fade-in-up"
                    style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
                    <td className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full md:hidden ${statusDots[tx.status] || 'bg-gray-400'}`} />
                        {tx.date.slice(5)}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                      {tx.muzakki}
                    </td>
                    <td className={`px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium whitespace-nowrap hidden sm:table-cell ${jenisColors[tx.jenis] || ''}`}>
                      {tx.jenis}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-foreground text-right whitespace-nowrap">
                      {formatRupiah(tx.amount, true)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-2.5 text-center hidden md:table-cell">
                      <Badge variant="outline" className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 font-medium ${statusColors[tx.status] || ''}`}>
                        {tx.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
