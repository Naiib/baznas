import { PublicApplicationTracking } from '@/components/public-portal/PublicApplicationTracking';

export const metadata = {
  title: 'Lacak Pengajuan Bantuan | BAZNAS Kota Tangerang',
  description:
    'Lacak status permohonan bantuan zakat, infak, dan sedekah BAZNAS Kota Tangerang.',
};

export default function CekPengajuanPage() {
  return (
    <main className="min-h-screen bg-slate-50/60 px-4 py-8 sm:px-6 sm:py-12">
      <PublicApplicationTracking />
    </main>
  );
}