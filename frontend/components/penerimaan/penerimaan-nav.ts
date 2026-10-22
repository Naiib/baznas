import {
  FileText,
  LayoutDashboard,
  Scale,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

export interface PenerimaanNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const PENERIMAAN_NAV_ITEMS: PenerimaanNavItem[] = [
  { id: 'beranda', label: 'Beranda', href: '/penerimaan', icon: LayoutDashboard, exact: true },
  { id: 'transaksi', label: 'Transaksi', href: '/penerimaan/transaksi', icon: WalletCards },
  { id: 'muzakki', label: 'Muzakki', href: '/penerimaan/muzakki', icon: Users },
  { id: 'rekonsiliasi', label: 'Rekonsiliasi', href: '/penerimaan/rekonsiliasi', icon: Scale },
  { id: 'laporan', label: 'Laporan', href: '/penerimaan/laporan', icon: FileText },
];
