import { Bell, ChevronDown, LogOut, Settings, UserCircle, Search, ExternalLink, Globe, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import baznasLogo from '@/assets/baznas-logo.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Header({ activePage = 'utama', onNavigate, currentUser = null, onLogout = () => {} }) {
  const userName = currentUser?.name || 'Ahmad Naufal';
  const userDivision = currentUser?.division || 'Divisi Penyaluran';
  const userEmail = currentUser?.email || 'admin@baznas.go.id';
  const userRole = currentUser?.role || 'admin';
  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sticky top-0 z-20">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
      
      {/* Brand Logo & Name */}
      <div 
        className="flex items-center gap-2 cursor-pointer group"
        onClick={() => onNavigate && onNavigate('utama')}
        title="Menuju Dashboard Utama"
      >
        <div className="bg-white/90 dark:bg-white p-0.5 rounded-lg border border-border/50 shadow-2xs">
          <img
            src={baznasLogo}
            alt="BAZNAS Kota Tangerang"
            className="h-7 w-auto object-contain transition-transform group-hover:scale-105"
          />
        </div>
        <div className="hidden md:flex flex-col leading-none">
          <span className="text-[11px] font-black tracking-tight text-foreground uppercase">BAZNAS</span>
          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">Kota Tangerang</span>
        </div>
      </div>

      <Separator orientation="vertical" className="h-4" />

      {/* Breadcrumb */}
      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="text-foreground font-medium">Dashboard</span>
        <span className="text-muted-foreground/50">/</span>
        {(() => {
          switch (activePage) {
            case 'portal':
              return (
                <>
                  <span className="text-emerald-600 font-semibold">Portal Publik Mustahik</span>
                </>
              );
            case 'penyaluran':
              return (
                <>
                  <span>Penyaluran</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Dashboard</span>
                </>
              );
            case 'mustahik':
              return (
                <>
                  <span>Penyaluran</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground font-semibold text-emerald-600">Data Mustahik Terpadu</span>
                </>
              );
            case 'program_bantuan':
              return (
                <>
                  <span>Penyaluran</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Program Bantuan</span>
                </>
              );
            case 'laporan_penyaluran':
              return (
                <>
                  <span>Penyaluran</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Laporan</span>
                </>
              );
            case 'data_upz':
              return (
                <>
                  <span>UPZ & Mitra</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Data UPZ</span>
                </>
              );
            case 'laporan_upz':
              return (
                <>
                  <span>UPZ & Mitra</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Laporan UPZ</span>
                </>
              );
            case 'kerjasama':
              return (
                <>
                  <span>UPZ & Mitra</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Kerja Sama</span>
                </>
              );
            case 'keuangan_dashboard':
              return (
                <>
                  <span>Keuangan</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Dashboard</span>
                </>
              );
            case 'rkat':
              return (
                <>
                  <span>Keuangan</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">RKAT</span>
                </>
              );
            case 'realisasi_anggaran':
              return (
                <>
                  <span>Keuangan</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Realisasi</span>
                </>
              );
            case 'laporan_keuangan':
              return (
                <>
                  <span>Keuangan</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Laporan</span>
                </>
              );
            case 'pegawai':
              return (
                <>
                  <span>SDM</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Data Pegawai</span>
                </>
              );
            case 'absensi':
              return (
                <>
                  <span>SDM</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Presensi</span>
                </>
              );
            case 'kinerja':
              return (
                <>
                  <span>SDM</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground">Kinerja</span>
                </>
              );
            case 'ai_data_entry':
              return (
                <>
                  <span>AI Tools</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-emerald-600 font-semibold">Smart OCR Data Entry</span>
                </>
              );
            case 'utama':
            default:
              return <span className="text-foreground">Utama</span>;
          }
        })()}
      </div>

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden lg:block w-56 xl:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Cari menu atau data..."
            className="pl-8 h-9 text-xs bg-muted/50 focus-visible:bg-background transition-colors"
          />
        </div>

        {/* Shortcut to Public Portal */}
        {activePage !== 'portal' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 shadow-xs shadow-emerald-600/20 transition-all duration-200 cursor-pointer"
            onClick={() => onNavigate('portal')}
            title="Buka Portal Publik Layanan Mustahik"
          >
            <Globe className="size-3.5" />
            <span className="hidden sm:inline">Portal Publik</span>
            <span className="sm:hidden">Portal</span>
          </Button>
        )}

        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"></span>
            <span className="relative inline-flex size-2 rounded-full bg-destructive"></span>
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 pl-1 pr-2 h-auto cursor-pointer">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/20">
                  {initials || 'AN'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start text-sm">
                <span className="font-semibold text-xs leading-tight">{userName}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{userDivision}</span>
              </div>
              <ChevronDown className="hidden sm:block size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold leading-none">{userName}</p>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    {userRole}
                  </span>
                </div>
                <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <UserCircle className="size-4" />
              <span>Profil Pengguna</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Settings className="size-4" />
              <span>Pengaturan Akun</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onLogout}
              className="text-destructive focus:text-destructive cursor-pointer font-bold"
            >
              <LogOut className="size-4 text-destructive" />
              <span>Keluar (Logout)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

