import { GraduationCap, Heart, TrendingUp, Home } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PROGRAMS } from '../data/dashboardData';

const iconMap = {
  Pendidikan: GraduationCap,
  Kesehatan: Heart,
  Ekonomi: TrendingUp,
  Sosial: Home,
};

export default function ProgramImpact({ delay = 0 }) {
  const totalBeneficiaries = PROGRAMS.reduce((sum, p) => sum + p.value, 0);

  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up py-0 gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-full"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardHeader className="pb-0.5 pt-3 sm:pt-4">
        <CardTitle className="text-xs sm:text-sm font-semibold">Dampak Program</CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-2 sm:pb-2 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          {PROGRAMS.map((program) => {
            const Icon = iconMap[program.name] || Home;
            return (
              <div key={program.name}
                className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-all duration-300 cursor-pointer group/item">
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/item:scale-110"
                  style={{ backgroundColor: `${program.color}15`, color: program.color }}>
                  <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-foreground truncate">{program.value.toLocaleString('id-ID')}</div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground">{program.name}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border text-center">
          <span className="text-xs text-muted-foreground">
            Total Penerima Manfaat:{' '}
            <span className="font-bold text-foreground">{totalBeneficiaries.toLocaleString('id-ID')}</span>{' '}
            <span className="text-emerald-500 font-semibold">Jiwa</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
