import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import useCountUp from '../hooks/useCountUp';

export default function StatCard({ icon: Icon, iconBg, iconColor, label, value, change, delay = 0, rawValue, trend = 'up' }) {
  const numericValue = rawValue || 0;
  const animatedValue = useCountUp(numericValue, 1500, '', '', true);
  const displayValue = rawValue ? animatedValue : value;
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;

  return (
    <Card className="group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up py-0 gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardContent className="p-3 sm:p-4">
        {/* Top row: icon + label */}
        <div className="flex items-center gap-1.5 mb-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${iconBg}`, color: iconColor }}
          >
            <Icon className="w-3 h-3" />
          </div>
          <span className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {label}
          </span>
        </div>

        {/* Value — hero */}
        <div className="text-2xl sm:text-3xl font-bold text-foreground truncate tracking-[-0.04em] leading-none">
          {displayValue}
        </div>

        {/* Trend */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: `${iconColor}0d` }}>
            <TrendIcon className="w-3 h-3" style={{ color: iconColor }} />
            <span className="text-[11px] font-semibold" style={{ color: iconColor }}>{change}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">vs bulan lalu</span>
        </div>
      </CardContent>
    </Card>
  );
}
