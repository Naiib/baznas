import { useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Sector } from 'recharts';
import { Users, TrendingUp, LayoutGrid, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DISTRIBUSI_DATA, DISTRIBUSI_COLORS, PROGRAMS } from '../data/dashboardData';
import { formatRupiah } from '../utils/format';

const TOTAL_DISTRIBUSI = 1_890_000_000_000;
const TOTAL_BENEFICIARIES = PROGRAMS.reduce((sum, p) => sum + p.value, 0);
const TARGET_PENYALURAN = 2_500_000_000_000; // 2.5T target
const REALISASI_PERSEN = Math.round((TOTAL_DISTRIBUSI / TARGET_PENYALURAN) * 100);

export default function DonutChartCard() {
  const [activeIndex, setActiveIndex] = useState(null);
  const activeItem = activeIndex !== null ? DISTRIBUSI_DATA[activeIndex] : null;
  const activeAmount = activeItem ? Math.round(TOTAL_DISTRIBUSI * (activeItem.value / 100)) : 0;
  const activeColor = activeIndex !== null ? DISTRIBUSI_COLORS[activeIndex] : null;

  const handleLegendHover = useCallback((idx) => {
    setActiveIndex(idx);
  }, []);

  const handleLegendLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  return (
    <Card className="card-spotlight group shadow-card transition-all-smooth hover:shadow-card-hover hover:-translate-y-0.5 animate-fade-in-up focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs sm:text-sm font-semibold">Distribusi Penyaluran</CardTitle>
        <span className="text-[11px] text-muted-foreground font-medium">Tahun 2024</span>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
          <div className="relative w-[200px] h-[200px] mx-auto sm:mx-0 shrink-0">
            <PieChart width={200} height={200}>
              <Pie
                activeIndex={activeIndex !== null ? activeIndex : undefined}
                activeShape={(props) => {
                  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                  return (
                    <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 3}
                      startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.95} />
                  );
                }}
                data={DISTRIBUSI_DATA} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%"
                paddingAngle={2} dataKey="value" stroke="none"
              >
                {DISTRIBUSI_DATA.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={DISTRIBUSI_COLORS[index % DISTRIBUSI_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.5} />
                ))}
              </Pie>
            </PieChart>

            {/* HTML overlay — center content, always on top */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              {activeItem ? (
                <div className="bg-card/95 backdrop-blur-sm border-2 rounded-xl px-3 py-2 text-center shadow-lg animate-fade-in-scale"
                  style={{ borderColor: activeColor }}>
                  <div className="text-[10px] font-bold" style={{ color: activeColor }}>{activeItem.fullName}</div>
                  <div className="text-xs font-bold text-foreground mt-0.5">{formatRupiah(activeAmount, true)}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{activeItem.value}% dari total</div>
                </div>
              ) : (
                <>
                  <div className="text-xs font-bold text-foreground">{formatRupiah(TOTAL_DISTRIBUSI, true)}</div>
                  <div className="text-[10px] text-muted-foreground">Total Tersalurkan</div>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 w-full min-w-0 space-y-1">
            {DISTRIBUSI_DATA.map((item, idx) => {
              const amount = Math.round(TOTAL_DISTRIBUSI * (item.value / 100));
              const isActive = activeIndex === idx;
              return (
                <button key={item.name}
                  onMouseEnter={() => handleLegendHover(idx)}
                  onMouseLeave={handleLegendLeave}
                  className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-lg transition-all duration-300 ${
                    isActive ? 'bg-secondary shadow-sm' : 'hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="size-2 rounded-full shrink-0 transition-transform duration-300"
                      style={{ backgroundColor: DISTRIBUSI_COLORS[idx], transform: isActive ? 'scale(1.3)' : 'scale(1)' }} />
                    <span className={`truncate text-xs sm:text-sm transition-all duration-300 ${isActive ? 'font-semibold text-foreground' : 'text-foreground'}`}>{item.fullName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] sm:text-xs text-muted-foreground truncate max-w-[90px] sm:max-w-[110px]">{formatRupiah(amount, true)}</span>
                    <span className={`text-xs sm:text-sm font-semibold transition-all duration-300 ${isActive ? 'scale-110' : ''}`}>{item.value}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom section: Summary stats + Progress */}
        <div className="border-t border-border pt-3 sm:pt-4 space-y-3 sm:space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Users className="size-3 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground">Penerima</span>
              </div>
              <div className="text-sm font-bold text-foreground">{TOTAL_BENEFICIARIES.toLocaleString('id-ID')}</div>
              <div className="text-[9px] text-muted-foreground">Jiwa</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="size-3 text-blue-500" />
                <span className="text-[10px] text-muted-foreground">Rata-rata</span>
              </div>
              <div className="text-sm font-bold text-foreground">{formatRupiah(TOTAL_DISTRIBUSI / 12, true)}</div>
              <div className="text-[9px] text-muted-foreground">/Bulan</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <LayoutGrid className="size-3 text-amber-500" />
                <span className="text-[10px] text-muted-foreground">Program</span>
              </div>
              <div className="text-sm font-bold text-foreground">{PROGRAMS.length}</div>
              <div className="text-[9px] text-muted-foreground">Aktif</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Target className="size-3 text-emerald-500" />
                <span className="text-[10px] text-muted-foreground">Realisasi Target</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-600">{REALISASI_PERSEN}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${REALISASI_PERSEN}%` }} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>Tersalurkan: {formatRupiah(TOTAL_DISTRIBUSI, true)}</span>
              <span>Target: {formatRupiah(TARGET_PENYALURAN, true)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
