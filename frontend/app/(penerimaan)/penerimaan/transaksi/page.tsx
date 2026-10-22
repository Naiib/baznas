import { Metadata } from 'next';
import { TransactionWorkspace } from '@/components/penerimaan/transaksi/TransactionWorkspace';

export const metadata: Metadata = {
  title: 'Daftar Transaksi Penerimaan ZIS',
  description: 'Manajemen berkas, pencarian, validasi, dan monitoring transaksi penerimaan ZIS BAZNAS Kota Tangerang',
};

export default function TransaksiPage() {
  return <TransactionWorkspace />;
}
