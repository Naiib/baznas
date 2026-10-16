import { useState } from 'react';
import {
  LayoutDashboard,
  HeartHandshake,
  Wallet,
  Building2,
  FileSpreadsheet,
  Users,
  FileText,
  UserCheck,
  Calendar,
  Star,
  Bot,
  Globe,
  Bell,
  ChevronDown,
  UserCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList,
  Printer,
  Compass,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import baznasLogo from '@/assets/baznas-logo.png';
import ExportPDFModal from './ExportPDFModal';

export default function Navbar({
  activePage = 'utama',
  onNavigate = () => {},
  currentUser = null,
  onLogout = () => {},
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const userName = currentUser?.name || 'Amil BAZNAS';
  const userEmail = currentUser?.email || 'amil@baznas.go.id';
  const userRole = currentUser?.role || 'penyaluran';
  const userDivision = currentUser?.division || 'Bidang Penyaluran & Pendistribusian';

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  // Define Top-Level Menus (Strictly Maximum 5 Items per Role)
  const getNavItems = () => {
    if (userRole === 'penyaluran' || userRole === 'surveyor') {
      return [
        {
          id: 'home',
          label: 'Beranda',
          icon: LayoutDashboard,
          page: 'utama',
          type: 'link',
        },
        {
          id: 'mustahik',
          label: 'Data Mustahik',
          icon: Users,
          page: 'mustahik',
          type: 'link',
        },
        {
          id: 'program_bantuan',
          label: 'Program 5 Pilar',
          icon: ClipboardList,
          page: 'program_bantuan',
          type: 'link',
        },
        {
          id: 'peta_sebaran',
          label: 'Peta Sebaran (GIS)',
          icon: Compass,
          page: 'peta_sebaran',
          type: 'link',
        },
        {
          id: 'export_pdf',
          label: 'Export PDF',
          icon: Printer,
          type: 'action',
          action: () => setShowExportModal(true),
        },
      ];
    }

    if (userRole === 'penerimaan') {
      return [
        {
          id: 'home',
          label: 'Beranda',
          icon: LayoutDashboard,
          page: 'utama',
          type: 'link',
        },
        {
          id: 'upz_group',
          label: 'UPZ & Mitra',
          icon: Building2,
          type: 'dropdown',
          activeKeys: ['data_upz', 'laporan_upz', 'kerjasama'],
          items: [
            { label: 'Data Unit Pengumpul Zakat', page: 'data_upz', icon: Users, desc: 'Database UPZ Masjid, Dinas & BUMD' },
            { label: 'Laporan Setoran UPZ', page: 'laporan_upz', icon: FileText, desc: 'Monitoring setoran & kepatuhan UPZ' },
            { label: 'Kerjasama Lembaga & CSR', page: 'kerjasama', icon: ClipboardList, desc: 'MoU & PKS kemitraan strategis' },
          ],
        },
        {
          id: 'export_pdf',
          label: 'Export PDF',
          icon: Printer,
          type: 'action',
          action: () => setShowExportModal(true),
        },
      ];
    }

    // Default / Super Admin: Strictly 5 Groups
    return [
      {
        id: 'home',
        label: 'Beranda',
        icon: LayoutDashboard,
        page: 'utama',
        type: 'link',
      },
      {
        id: 'penyaluran_group',
        label: 'Penyaluran',
        icon: HeartHandshake,
        type: 'dropdown',
        activeKeys: ['penyaluran', 'mustahik', 'program_bantuan', 'laporan_penyaluran', 'portal'],
        items: [
          { label: 'Dashboard Penyaluran', page: 'penyaluran', icon: LayoutDashboard, desc: 'Ikhtisar penyaluran & realisasi program' },
          { label: 'Data Mustahik 60-Kolom', page: 'mustahik', icon: Users, desc: 'Master database mustahik & formulir asesmen' },
          { label: 'Program Bantuan 5 Pilar', page: 'program_bantuan', icon: ClipboardList, desc: 'Pendidikan, Kesehatan, Ekonomi, Dakwah, Kemanusiaan' },
          { label: 'Laporan Penyaluran & LPJ', page: 'laporan_penyaluran', icon: FileText, desc: 'Laporan audit distribusi & ekspor dokumen' },
          { label: 'Portal Publik Mustahik', page: 'portal', icon: Globe, desc: 'Preview portal permohonan publik online' },
        ],
      },
      {
        id: 'penerimaan_group',
        label: 'Penerimaan & UPZ',
        icon: Wallet,
        type: 'dropdown',
        activeKeys: ['data_upz', 'laporan_upz', 'kerjasama'],
        items: [
          { label: 'Data Unit Pengumpul Zakat', page: 'data_upz', icon: Building2, desc: 'UPZ Masjid, Instansi, Dinas & BUMD' },
          { label: 'Laporan Setoran UPZ', page: 'laporan_upz', icon: FileText, desc: 'Target vs realisasi setoran UPZ' },
          { label: 'Kerjasama Lembaga & Mitra', page: 'kerjasama', icon: ClipboardList, desc: 'Kemitraan CSR perusahaan & perbankan syariah' },
        ],
      },
      {
        id: 'keuangan_sdm_group',
        label: 'Keuangan & SDM',
        icon: FileSpreadsheet,
        type: 'dropdown',
        activeKeys: ['keuangan_dashboard', 'rkat', 'realisasi_anggaran', 'laporan_keuangan', 'pegawai', 'absensi', 'kinerja'],
        items: [
          { label: 'Dashboard Keuangan', page: 'keuangan_dashboard', icon: LayoutDashboard, desc: 'Neraca saldo, kas bank & kesehatan keuangan' },
          { label: 'RKAT Anggaran Tahunan', page: 'rkat', icon: FileSpreadsheet, desc: 'Pagu target & alokasi belanja divisi' },
          { label: 'Realisasi Anggaran & Kas', page: 'realisasi_anggaran', icon: Wallet, desc: 'Monitoring serapan & pengeluaran kas' },
          { label: 'Laporan Keuangan PSAK 109', page: 'laporan_keuangan', icon: FileText, desc: 'Laporan Posisi Keuangan, Perubahan Dana & Arus Kas' },
          { label: 'Data Pegawai & Personalia', page: 'pegawai', icon: UserCheck, desc: 'Database amil, SK jabatan & sertifikasi' },
          { label: 'Presensi & Cuti Amil', page: 'absensi', icon: Calendar, desc: 'Rekap kehadiran & pengajuan izin/cuti' },
          { label: 'Penilaian Kinerja (KPI)', page: 'kinerja', icon: Star, desc: 'Evaluasi 4 kriteria capaian target amil' },
        ],
      },
      {
        id: 'export_pdf',
        label: 'Export PDF',
        icon: Printer,
        type: 'action',
        action: () => setShowExportModal(true),
      },
    ];
  };

  const navItems = getNavItems();

  const handleNavClick = (page) => {
    if (page) {
      onNavigate(page);
      setMobileMenuOpen(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-5 lg:px-6">
          <div className="flex flex-nowrap items-center justify-between h-14 sm:h-15 gap-2 sm:gap-4 overflow-hidden">
            
            {/* 1. Left: Official Brand Logo & Identity */}
            <div
              onClick={() => handleNavClick('utama')}
              className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group shrink-0 select-none"
              title="Kembali ke Beranda BAZNAS"
            >
              <img
                src={baznasLogo}
                alt="BAZNAS Kota Tangerang"
                className="h-8 sm:h-9 w-auto object-contain transition-transform group-hover:scale-105"
              />
              <div className="flex flex-col leading-none shrink-0">
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white tracking-tight uppercase">
                    BAZNAS
                  </span>
                  <span className="text-[8px] sm:text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
                    KOTA TANGERANG
                  </span>
                </div>
                <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Data Center v2.0
                </span>
              </div>
            </div>

            {/* 2. Center: Max 5 Clean Top-Level Menus (Guaranteed Single Row) */}
            <nav className="hidden lg:flex flex-nowrap items-center gap-1 xl:gap-1.5 shrink-0">
              {navItems.map((item) => {
                const ItemIcon = item.icon;

                if (item.type === 'action') {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.action}
                      className="flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 shadow-2xs"
                      title="Buka Pusat Cetak & Export Laporan PDF"
                    >
                      <ItemIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400 group-hover:text-white" />
                      <span>{item.label}</span>
                    </button>
                  );
                }

                if (item.type === 'link') {
                  const isActive = activePage === item.page;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.page)}
                      className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-700 dark:hover:text-emerald-400'
                      }`}
                    >
                      <ItemIcon className={`size-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                }

                // Dropdown Group
                const isGroupActive = item.activeKeys?.includes(activePage);

                return (
                  <DropdownMenu key={item.id}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={`flex items-center gap-1 px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer outline-hidden ${
                          isGroupActive
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-700 dark:hover:text-emerald-400'
                        }`}
                      >
                        <ItemIcon className={`size-3.5 shrink-0 ${isGroupActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                        <span>{item.label}</span>
                        <ChevronDown className="size-3 opacity-60 ml-0.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="w-68 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl animate-scale-in z-50"
                    >
                      <div className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80 mb-1">
                        Menu {item.label}
                      </div>
                      <div className="space-y-0.5">
                        {item.items.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive = activePage === subItem.page;
                          return (
                            <DropdownMenuItem
                              key={subItem.page}
                              onClick={() => handleNavClick(subItem.page)}
                              className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                                isSubActive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-500/20'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className={`p-1 rounded-md mt-0.5 shrink-0 ${isSubActive ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                <SubIcon className="size-3" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold leading-tight">{subItem.label}</p>
                                {subItem.desc && (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5 leading-snug">
                                    {subItem.desc}
                                  </p>
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </nav>

            {/* 3. Right: Amil Profile Badge & Logout (Ultra Compact) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* Notification Bell */}
              <button
                type="button"
                className="relative p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Notifikasi Sistem"
              >
                <Bell className="size-4" />
                <span className="absolute top-1.5 right-1.5 flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                </span>
              </button>

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-all cursor-pointer border border-slate-200/80 dark:border-slate-700/80 shrink-0"
                  >
                    <Avatar className="size-6.5 shrink-0">
                      <AvatarFallback className="text-[10px] bg-emerald-600 text-white font-black">
                        {initials || 'AN'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:flex flex-col items-start text-left leading-none">
                      <span className="font-bold text-[11px] text-slate-800 dark:text-slate-100 truncate max-w-[110px]">
                        {userName}
                      </span>
                      <span className="text-[8.5px] text-emerald-700 dark:text-emerald-400 font-semibold truncate max-w-[110px] mt-0.5">
                        {userDivision}
                      </span>
                    </div>
                    <ChevronDown className="size-3 text-slate-400 ml-0.5 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={6}
                  className="w-56 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl z-50"
                >
                  <DropdownMenuLabel className="font-normal p-2">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{userName}</p>
                        <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          {userRole}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleNavClick('portal')}
                    className="gap-2 p-1.5 rounded-lg text-xs cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <Globe className="size-3.5 text-emerald-600" />
                    <span>Buka Portal Publik</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setShowExportModal(true)}
                    className="gap-2 p-1.5 rounded-lg text-xs cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <Printer className="size-3.5 text-emerald-600" />
                    <span>Export / Cetak PDF</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2 p-1.5 rounded-lg text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                    <UserCircle className="size-3.5 text-slate-400" />
                    <span>Profil Akun</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="gap-2 p-1.5 rounded-lg text-xs cursor-pointer text-rose-600 dark:text-rose-400 font-bold focus:bg-rose-50 dark:focus:bg-rose-950/50"
                  >
                    <LogOut className="size-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Keluar (Logout)</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile Hamburger Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>

            </div>

          </div>
        </div>

        {/* 4. Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 space-y-2 animate-slide-down shadow-xl max-h-[80vh] overflow-y-auto">
            {navItems.map((item) => {
              const ItemIcon = item.icon;
              
              if (item.type === 'action') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      item.action();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-xs font-bold transition-all text-left bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
                  >
                    <ItemIcon className="size-4 shrink-0 text-emerald-600" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              if (item.type === 'link') {
                const isActive = activePage === item.page;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.page)}
                    className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg text-xs font-bold transition-all text-left ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60'
                    }`}
                  >
                    <ItemIcon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              }

              return (
                <div key={item.id} className="space-y-1 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800 dark:text-emerald-400 px-1">
                    <ItemIcon className="size-3.5" />
                    <span>{item.label}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 pt-1">
                    {item.items.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = activePage === subItem.page;
                      return (
                        <button
                          key={subItem.page}
                          type="button"
                          onClick={() => handleNavClick(subItem.page)}
                          className={`flex items-center gap-2 p-1.5 rounded-lg text-xs text-left transition-all ${
                            isSubActive
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                        >
                          <SubIcon className="size-3 shrink-0" />
                          <span className="truncate">{subItem.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </header>

      {/* Official Export PDF Modal */}
      <ExportPDFModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        currentUser={currentUser}
      />
    </>
  );
}
