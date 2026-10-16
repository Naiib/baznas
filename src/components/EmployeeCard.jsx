import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EmployeeCard({ delay = 0 }) {
  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Pegawai Aktif</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-200/50 transition-all duration-300 group-hover:scale-110 group-hover:shadow-emerald-300/50">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">42</div>
            <div className="text-sm text-muted-foreground">Orang</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary p-3 transition-all duration-300 hover:bg-emerald-50/50 cursor-pointer">
            <div className="text-xs text-muted-foreground mb-1">Hadir Hari Ini</div>
            <div className="text-lg font-bold text-emerald-600">38</div>
          </div>
          <div className="rounded-lg bg-secondary p-3 transition-all duration-300 hover:bg-red-50/50 cursor-pointer">
            <div className="text-xs text-muted-foreground mb-1">Tidak Hadir</div>
            <div className="text-lg font-bold text-red-500">4</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
