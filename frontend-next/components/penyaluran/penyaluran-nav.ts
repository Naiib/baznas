import { Compass, Layers, LayoutDashboard, Users, type LucideIcon } from 'lucide-react';

export interface PenyaluranNavItem {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: Array<{ id: string; label: string; href: string; icon: LucideIcon }>;
}

export const PENYALURAN_NAV_ITEMS: PenyaluranNavItem[] = [
  { id: 'beranda', label: 'Beranda', href: '/penyaluran', icon: LayoutDashboard, exact: true },
  { id: 'mustahik', label: 'Data Mustahik', href: '/penyaluran/mustahik', icon: Users },
  { id: 'program', label: 'Program 5 Pilar', href: '/penyaluran/program', icon: Layers },
  { id: 'peta', label: 'Peta Sebaran (GIS)', href: '/penyaluran/peta', icon: Compass },
];
