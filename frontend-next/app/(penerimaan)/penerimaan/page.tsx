import { Metadata } from 'next';
import { PenerimaanDashboard } from '@/components/penerimaan/dashboard/PenerimaanDashboard';

export const metadata: Metadata = {
  title: 'Dashboard Penerimaan ZIS',
  description: 'Ringkasan penghimpunan, verifikasi, approval, dan rekonsiliasi penerimaan ZIS BAZNAS Kota Tangerang',
};

export default function PenerimaanPage() {
  return <PenerimaanDashboard />;
}
