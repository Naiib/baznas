import { Megaphone, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const items = [
  {
    icon: Megaphone, bg: '#ecfdf5', color: '#059669',
    text: 'Laporan penerimaan bulan Juni 2024 telah tersedia.',
    time: '2 jam yang lalu', priority: 'info', category: 'Pengumuman',
  },
  {
    icon: AlertTriangle, bg: '#fffbeb', color: '#d97706',
    text: 'Program beasiswa pendidikan tahap 2 akan ditutup 7 hari lagi.',
    time: '1 hari yang lalu', priority: 'important', category: 'Program',
  },
  {
    icon: Calendar, bg: '#fef2f2', color: '#dc2626',
    text: 'Reminder: Input RKAT Triwulan III sebelum 31 Juli 2024.',
    time: '2 hari yang lalu', priority: 'urgent', category: 'Penting',
  },
];

const priorityConfig = {
  urgent: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  important: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function Announcements() {
  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover animate-fade-in-up gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Pengumuman</CardTitle>
        <Button variant="link" size="sm" className="text-xs h-auto p-0 text-emerald-600 hover:text-emerald-700">
          Lihat Semua
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const priority = priorityConfig[item.priority];
            return (
              <div key={idx} className="flex items-start gap-2 sm:gap-3 group/item cursor-pointer rounded-lg sm:rounded-xl p-2 sm:p-2.5 -mx-2 hover:bg-secondary transition-all duration-300 animate-slide-in-right"
                style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}>
                <div
                  className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300 group-hover/item:scale-110"
                  style={{ backgroundColor: item.bg, color: item.color }}
                >
                  <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${priority.dot} shrink-0`} />
                    <Badge variant="outline" className={`text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0 font-medium ${priority.badge}`}>
                      {item.category}
                    </Badge>
                  </div>
                  <div className="text-xs sm:text-sm text-foreground leading-snug">{item.text}</div>
                  <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 group-hover/item:text-emerald-500 transition-colors duration-300">{item.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
