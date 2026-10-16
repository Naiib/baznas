import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRupiah } from '../utils/format';

export default function BudgetProgress({ delay = 0 }) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const percent = 68;
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedPercent / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(percent), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Realisasi Anggaran</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="relative size-[90px] shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={radius} stroke="var(--border)" strokeWidth="10" fill="none" />
              <circle
                cx="50" cy="50" r={radius}
                stroke="url(#progressGradient)"
                strokeWidth="10" fill="none" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor="#16a34a" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">{animatedPercent}%</span>
            </div>
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            <div className="hover:translate-x-1 transition-transform duration-300">
              <div className="text-sm font-bold text-foreground truncate">{formatRupiah(3_400_000_000, true)}</div>
              <div className="text-xs text-muted-foreground">Realisasi</div>
            </div>
            <div className="hover:translate-x-1 transition-transform duration-300">
              <div className="text-sm font-bold text-foreground truncate">{formatRupiah(5_000_000_000, true)}</div>
              <div className="text-xs text-muted-foreground">Anggaran</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
