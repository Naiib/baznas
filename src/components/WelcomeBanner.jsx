import { getGreeting, getFormattedDate, getHijriDate, METRICS, INSTITUTION_PROFILE } from '../data/dashboardData';
import useCountUp from '../hooks/useCountUp';
import { Users, HeartHandshake, GraduationCap, Building2 } from 'lucide-react';

const formatCompact = (num) => {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'jt';
  if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'rb';
  return num.toLocaleString('id-ID');
};

export default function WelcomeBanner({ currentUser }) {
  let user = currentUser;
  if (!user && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('baznas_auth_user');
      if (stored) user = JSON.parse(stored);
    } catch (e) {}
  }
  const userName = user?.name || 'Ahmad Naufal';

  const greeting = getGreeting();
  const date = getFormattedDate();
  const hijri = getHijriDate();
  const animatedMuzakki = useCountUp(METRICS.totalMuzakki, 1500, '', '', true);
  const animatedMustahik = useCountUp(METRICS.totalMustahik, 1500, '', '', true);
  const animatedPrograms = useCountUp(INSTITUTION_PROFILE.activePrograms, 1000, '', '', true);
  const animatedUpz = useCountUp(INSTITUTION_PROFILE.registeredUpz, 1200, '', '', true);

  const quickStats = [
    { label: 'Muzakki', value: animatedMuzakki, icon: Users, raw: METRICS.totalMuzakki },
    { label: 'Mustahik', value: animatedMustahik, icon: HeartHandshake, raw: METRICS.totalMustahik },
    { label: 'Program', value: animatedPrograms, icon: GraduationCap, raw: INSTITUTION_PROFILE.activePrograms },
    { label: 'UPZ', value: animatedUpz, icon: Building2, raw: INSTITUTION_PROFILE.registeredUpz },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-500 text-white animate-slide-down">
      {/* Geometric pattern overlay */}
      <div className="absolute inset-0 bg-geometric opacity-50" />

      {/* Decorative gold accent line */}
      <div className="absolute top-0 left-8 right-8 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

      {/* Content */}
      <div className="relative px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
          {/* Left: Greeting */}
          <div className="min-w-0">
            <p className="text-emerald-100/80 text-[11px] sm:text-sm font-medium tracking-wide truncate">
              {date}
            </p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mt-1 leading-tight">
              {greeting}, <span className="text-amber-300 whitespace-nowrap">{userName}</span>
            </h1>
            <p className="text-emerald-100/70 text-[11px] sm:text-sm mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
              <span className="truncate">{hijri}</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
              BAZNAS Kota Tangerang
            </p>
          </div>

          {/* Right: Soft stat pills */}
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-3 shrink-0">
            {quickStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="group flex items-center gap-2 sm:gap-2.5 rounded-full bg-emerald-950/25 border border-white/10 pl-1.5 pr-3 sm:pl-2 sm:pr-3.5 py-1.5 sm:py-2 backdrop-blur-sm transition-all hover:bg-emerald-950/40 hover:border-white/20"
                >
                  <div className="flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-emerald-700 transition-transform group-hover:scale-105">
                    <Icon className="size-3 sm:size-3.5" />
                  </div>
                  <div className="leading-none min-w-0">
                    <p className="text-white text-xs sm:text-sm font-semibold truncate">
                      {stat.raw >= 1_000 ? formatCompact(stat.raw) : stat.value}
                    </p>
                    <p className="text-emerald-100/80 text-[9px] sm:text-[10px] font-medium truncate mt-0.5">{stat.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
