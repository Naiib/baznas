import { Metadata } from 'next';
import { TransactionDetailDrawer } from '@/components/penerimaan/transaksi/TransactionDetailDrawer';

export const metadata: Metadata = {
  title: 'Detail Transaksi Penerimaan ZIS',
  description: 'Detail berkas, validasi, dan riwayat transaksi penerimaan ZIS BAZNAS Kota Tangerang',
};

interface TransactionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({ params }: TransactionDetailPageProps) {
  const { id } = await params;

  return (
    <div className="w-full max-w-4xl mx-auto py-4 sm:py-6">
      <TransactionDetailDrawer
        transactionId={id}
        isOpen={true}
        isMobilePage={true}
      />
    </div>
  );
}
