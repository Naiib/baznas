import { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import { api } from '@/services/api';
import { resolveLegacyPenerimaanPath } from './legacyRoutePolicy';

// Dynamic Code-Splitting & React.lazy() for All Pages & Views
const LoginPage = lazy(() => import('./components/LoginPage'));
const DashboardUtama = lazy(() => import('./components/DashboardUtama'));
const PublicPortalPage = lazy(() => import('./components/PublicPortalPage'));
const MustahikPage = lazy(() => import('./components/MustahikPage'));
const PenyaluranDashboard = lazy(() => import('./components/PenyaluranDashboard'));
const ProgramBantuanPage = lazy(() => import('./components/ProgramBantuanPage'));
const LaporanPenyaluranPage = lazy(() => import('./components/LaporanPenyaluranPage'));
const UPZPage = lazy(() => import('./components/UPZPage'));
const LaporanUPZPage = lazy(() => import('./components/LaporanUPZPage'));
const KerjasamaPage = lazy(() => import('./components/KerjasamaPage'));
const KeuanganDashboard = lazy(() => import('./components/KeuanganDashboard'));
const RKATPage = lazy(() => import('./components/RKATPage'));
const RealisasiAnggaranPage = lazy(() => import('./components/RealisasiAnggaranPage'));
const LaporanKeuanganPage = lazy(() => import('./components/LaporanKeuanganPage'));
const PegawaiPage = lazy(() => import('./components/PegawaiPage'));
const AbsensiPage = lazy(() => import('./components/AbsensiPage'));
const KinerjaPage = lazy(() => import('./components/KinerjaPage'));
const AIDataEntryPage = lazy(() => import('./components/AIDataEntryPage'));
const PetaSebaranPage = lazy(() => import('./components/PetaSebaranPage'));

function PageFallbackSkeleton() {
  return (
    <div className="w-full space-y-6 animate-pulse py-2">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border/40">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-lg" />
          <div className="h-4 w-72 bg-muted/60 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded-md" />
          <div className="h-9 w-28 bg-emerald-500/20 rounded-md" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-muted/40 rounded-xl p-4 border border-border/40 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10" />
            </div>
            <div className="h-7 w-32 bg-muted rounded" />
          </div>
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div className="h-96 w-full bg-muted/30 rounded-xl border border-border/40 p-6 flex flex-col items-center justify-center gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-600 animate-spin" />
          <div className="absolute w-5 h-5 rounded-full bg-emerald-500/10 animate-ping" />
        </div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">Memuat modul data BAZNAS...</p>
      </div>
    </div>
  );
}

function PortalFallbackSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center mb-4">
        <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-400 animate-spin" />
        <div className="absolute w-6 h-6 rounded-full bg-emerald-400/20 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-emerald-400/90 animate-pulse tracking-wide">
        Memuat Portal Layanan Publik BAZNAS...
      </p>
    </div>
  );
}

function getInitialUser() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('baznas_auth_token');
  const userStr = localStorage.getItem('baznas_auth_user');
  if (token && userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }
  return null;
}

const ROUTE_MAP = {
  utama: '/',
  dashboard: '/',
  mustahik: '/mustahik',
  program_bantuan: '/program-5-pilar',
  peta_sebaran: '/peta-sebaran',
  penyaluran: '/penyaluran',
  data_upz: '/data-upz',
  laporan_upz: '/laporan-upz',
  kerjasama: '/kerjasama',
  keuangan_dashboard: '/keuangan',
  rkat: '/rkat',
  realisasi_anggaran: '/realisasi-anggaran',
  laporan_keuangan: '/laporan-keuangan',
  pegawai: '/pegawai',
  absensi: '/absensi',
  kinerja: '/kinerja',
  ai_entry: '/ai-data-entry',
  portal: '/portal',
  login: '/login',
};

const PATH_TO_PAGE = {
  '/': 'utama',
  '/beranda': 'utama',
  '/dashboard': 'utama',
  '/mustahik': 'mustahik',
  '/program-5-pilar': 'program_bantuan',
  '/program-bantuan': 'program_bantuan',
  '/peta-sebaran': 'peta_sebaran',
  '/penyaluran': 'penyaluran',
  '/data-upz': 'data_upz',
  '/upz': 'data_upz',
  '/laporan-upz': 'laporan_upz',
  '/kerjasama': 'kerjasama',
  '/keuangan': 'keuangan_dashboard',
  '/rkat': 'rkat',
  '/realisasi-anggaran': 'realisasi_anggaran',
  '/laporan-keuangan': 'laporan_keuangan',
  '/pegawai': 'pegawai',
  '/absensi': 'absensi',
  '/kinerja': 'kinerja',
  '/ai-data-entry': 'ai_entry',
  '/ai-entry': 'ai_entry',
  '/portal': 'portal',
  '/login': 'login',
};

function getInitialPage() {
  if (typeof window === 'undefined') return 'utama';
  const hostname = window.location.hostname.toLowerCase();
  const rawPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const searchParams = new URLSearchParams(window.location.search);
  
  if (searchParams.get('page')) {
    return searchParams.get('page');
  }
  if (hostname.startsWith('portal.') || rawPath === '/portal') {
    return 'portal';
  }
  if (rawPath === '/login') {
    return 'login';
  }
  if (resolveLegacyPenerimaanPath(rawPath) === 'retired') {
    return 'legacy_cutover';
  }
  return PATH_TO_PAGE[rawPath] || 'utama';
}

function App() {
  const [activePage, setActivePage] = useState(getInitialPage);
  const [currentUser, setCurrentUser] = useState(getInitialUser);

  // Synchronize state changes to browser URL & history
  const navigateTo = (page, replace = false) => {
    setActivePage(page);
    if (typeof window !== 'undefined') {
      const targetPath = ROUTE_MAP[page] || `/${page}`;
      if (window.location.pathname !== targetPath) {
        if (replace) {
          window.history.replaceState({ page }, '', targetPath);
        } else {
          window.history.pushState({ page }, '', targetPath);
        }
      }
    }
  };

  // Sync initial URL on mount if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initialPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const expectedPage = PATH_TO_PAGE[initialPath] || 'utama';
      if (expectedPage !== activePage) {
        setActivePage(expectedPage);
      }
    }
  }, []);

  // Listen to browser Back / Forward (popstate)
  useEffect(() => {
    const handlePopState = (e) => {
      const currentPath = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const targetPage = e.state?.page || PATH_TO_PAGE[currentPath] || 'utama';
      setActivePage(targetPage);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check auth session validity on mount
  useEffect(() => {
    const token = localStorage.getItem('baznas_auth_token');
    if (token) {
      api.getMe()
        .then((res) => {
          if (res?.success && res?.user) {
            setCurrentUser(res.user);
            localStorage.setItem('baznas_auth_user', JSON.stringify(res.user));
          }
        })
        .catch(() => {
          // Token invalid or expired
          localStorage.removeItem('baznas_auth_token');
          localStorage.removeItem('baznas_auth_user');
          setCurrentUser(null);
        });
    }
  }, []);

  const handleLoginSuccess = (user, token) => {
    setCurrentUser(user);
    if (user.role === 'penyaluran' || user.role === 'surveyor') {
      navigateTo('mustahik');
    } else if (user.role === 'penerimaan') {
      window.location.assign('/penerimaan');
    } else {
      navigateTo('utama');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('baznas_auth_token');
    localStorage.removeItem('baznas_auth_user');
    setCurrentUser(null);
    navigateTo('utama', true);
  };

  // Update document title dynamically
  if (typeof document !== 'undefined') {
    if (activePage === 'portal' || activePage === 'portal_publik') {
      document.title = "Portal Layanan Mustahik - BAZNAS Kota Tangerang";
    } else if (activePage === 'mustahik') {
      document.title = "Data Mustahik - BAZNAS Kota Tangerang";
    } else if (activePage === 'program_bantuan') {
      document.title = "Program 5 Pilar & RKAT - BAZNAS Kota Tangerang";
    } else if (activePage === 'peta_sebaran') {
      document.title = "Peta Sebaran GIS - BAZNAS Kota Tangerang";
    } else {
      document.title = "Data Center & Dashboard Internal - BAZNAS Kota Tangerang";
    }
  }

  // If in portal mode, show standalone public portal view without login requirement
  if (activePage === 'portal' || activePage === 'portal_publik') {
    return (
      <Suspense fallback={<PortalFallbackSkeleton />}>
        <PublicPortalPage 
          onNavigateToDashboard={(page) => {
            const hostname = window.location.hostname.toLowerCase();
            if (hostname.startsWith('portal.')) {
              window.location.href = 'https://muhammadrofiq.my.id/';
            } else {
              navigateTo(page || 'utama');
            }
          }} 
          onNavigate={navigateTo} 
        />
      </Suspense>
    );
  }

  // If not logged in and trying to access internal dashboard, show Login Page
  if (!currentUser) {
    return (
      <Suspense fallback={<PortalFallbackSkeleton />}>
        <LoginPage 
          onLoginSuccess={handleLoginSuccess}
          onNavigateToPortal={() => navigateTo('portal')}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50/60 dark:bg-slate-950 flex flex-col font-sans">
      <Navbar 
        activePage={activePage} 
        onNavigate={navigateTo} 
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-[1920px] mx-auto p-3 sm:p-5 md:p-6 lg:p-8 overflow-x-hidden">
        <div key={activePage} className="animate-page-enter w-full min-h-[80vh] flex flex-col">
          <Suspense fallback={<PageFallbackSkeleton />}>
            {activePage === 'legacy_cutover' && (
              <section className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-950">
                <h1 className="text-lg font-bold">Halaman Penerimaan telah dipindahkan</h1>
                <p className="mt-2 text-sm">Gunakan aplikasi Penerimaan terbaru untuk mengakses data ini.</p>
              </section>
            )}
            {(activePage === 'utama' || activePage === 'dashboard') && (
              currentUser?.role === 'penyaluran' || currentUser?.role === 'surveyor' ? (
                <PenyaluranDashboard currentUser={currentUser} onNavigate={navigateTo} />
              ) : (
                <DashboardUtama currentUser={currentUser} onNavigate={navigateTo} />
              )
            )}
            {activePage === 'penyaluran' && <PenyaluranDashboard currentUser={currentUser} onNavigate={navigateTo} />}
            {activePage === 'mustahik' && <MustahikPage onNavigate={navigateTo} />}
            {activePage === 'program_bantuan' && <ProgramBantuanPage onNavigate={navigateTo} />}
            {activePage === 'peta_sebaran' && <PetaSebaranPage onNavigate={navigateTo} />}
            {activePage === 'laporan_penyaluran' && <LaporanPenyaluranPage onNavigate={navigateTo} />}
            {activePage === 'data_upz' && <UPZPage onNavigate={navigateTo} />}
            {activePage === 'laporan_upz' && <LaporanUPZPage onNavigate={navigateTo} />}
            {activePage === 'kerjasama' && <KerjasamaPage onNavigate={navigateTo} />}
            {activePage === 'keuangan_dashboard' && <KeuanganDashboard onNavigate={navigateTo} />}
            {activePage === 'rkat' && <RKATPage onNavigate={navigateTo} />}
            {activePage === 'realisasi_anggaran' && <RealisasiAnggaranPage onNavigate={navigateTo} />}
            {activePage === 'laporan_keuangan' && <LaporanKeuanganPage onNavigate={navigateTo} />}
            {activePage === 'pegawai' && <PegawaiPage onNavigate={navigateTo} />}
            {activePage === 'absensi' && <AbsensiPage onNavigate={navigateTo} />}
            {activePage === 'kinerja' && <KinerjaPage onNavigate={navigateTo} />}
            {activePage === 'ai_entry' && <AIDataEntryPage onNavigate={navigateTo} />}
            {!['utama', 'dashboard', 'penyaluran', 'mustahik', 'program_bantuan', 'peta_sebaran', 'laporan_penyaluran', 'data_upz', 'laporan_upz', 'kerjasama', 'keuangan_dashboard', 'rkat', 'realisasi_anggaran', 'laporan_keuangan', 'pegawai', 'absensi', 'kinerja', 'ai_entry'].includes(activePage) && (
              <div className="flex flex-col items-center justify-center min-h-[400px] gap-2 text-center">
                <h2 className="text-lg font-bold text-foreground">Halaman Belum Tersedia</h2>
                <p className="text-xs text-muted-foreground">Modul "{activePage}" sedang dalam tahap pengembangan.</p>
                <button 
                  onClick={() => navigateTo('utama')} 
                  className="px-3 py-1.5 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold cursor-pointer"
                >
                  Kembali ke Utama
                </button>
              </div>
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;

