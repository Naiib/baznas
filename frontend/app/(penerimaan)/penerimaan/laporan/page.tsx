import { Metadata } from 'next';
import { ReportWorkspace } from '@/components/penerimaan/laporan/ReportWorkspace';

export const metadata: Metadata = {
  title: 'Laporan & Ekspor Penerimaan ZIS | BAZNAS',
  description: 'Laporan agregasi, rekapitulasi penerimaan dana ZIS, dan ekspor dokumen resmi PDF/Excel.',
};

export default function PenerimaanLaporanPage() {
  return <ReportWorkspace />;
}
