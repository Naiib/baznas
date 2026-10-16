import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ZAKAT_FITRAH } from '../data/dashboardData';
import { formatRupiah } from '../utils/format';

export default function ZakatFitriProgress({ delay = 0 }) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const percent = Math.round((ZAKAT_FITRAH.collectedMuzakki / ZAKAT_FITRAH.targetMuzakki) * 100);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const gradientId = `zakatGradient-${delay}`;
  const offset = circumference - (animatedPercent / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(percent), 400 + delay);
    return () => clearTimeout(timer);
  }, [percent, delay]);

  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up py-0 gap-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 h-full"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardHeader className="pb-0.5 pt-3 sm:pt-4">
        <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
          <span className="text-amber-500">🌙</span>
          Zakat Fitrah
        </CardTitle>
      </CardHeader>
      <CardContent className="py-0 pb-2 sm:pb-2 flex-1 flex flex-col justify-center">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative size-[80px] sm:size-[100px] shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} stroke="var(--border)" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r={radius}
                stroke={`url(#${gradientId})`}
                strokeWidth="8" fill="none" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{animatedPercent}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
            <div className="hover:translate-x-1 transition-transform duration-300">
              <div className="text-xs sm:text-sm font-bold text-foreground truncate">
                {ZAKAT_FITRAH.collectedMuzakki.toLocaleString('id-ID')} / {ZAKAT_FITRAH.targetMuzakki.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Muzakki Terkumpul</div>
            </div>
            <div className="hover:translate-x-1 transition-transform duration-300">
              <div className="text-xs sm:text-sm font-bold text-foreground truncate">{formatRupiah(ZAKAT_FITRAH.totalAmount, true)}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Total Terkumpul</div>
            </div>
            <div className="hover:translate-x-1 transition-transform duration-300">
              <div className="text-xs sm:text-sm font-bold text-amber-500 truncate">{ZAKAT_FITRAH.daysRemaining} hari lagi</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Menuju akhir Ramadhan</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
