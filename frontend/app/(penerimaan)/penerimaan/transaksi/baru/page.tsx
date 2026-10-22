import { Metadata } from 'next';
import { TransactionForm } from '@/components/penerimaan/transaksi/TransactionForm';

export const metadata: Metadata = {
  title: 'Input Transaksi Manual - Divisi Penerimaan BAZNAS',
  description: 'Formulir pencatatan manual penerimaan dana ZIS melalui loket kantor, jemput zakat, atau transfer bank.',
};

export default function TransaksiBaruPage() {
  return <TransactionForm />;
}
