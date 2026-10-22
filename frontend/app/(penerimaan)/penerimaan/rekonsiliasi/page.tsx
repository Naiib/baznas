import { Metadata } from 'next';
import { ReconciliationWorkspace } from '@/components/penerimaan/rekonsiliasi/ReconciliationWorkspace';

export const metadata: Metadata = {
  title: 'Rekonsiliasi Bank & QRIS',
  description: 'Rekonsiliasi mutasi rekening koran bank, QRIS, dan serah-terima fisik kas dengan transaksi penerimaan BAZNAS Kota Tangerang',
};

export default function RekonsiliasiPage() {
  return <ReconciliationWorkspace />;
}
