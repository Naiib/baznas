import { PublicApplicationForm } from '@/components/public-portal/PublicApplicationForm';

export const metadata = {
  title: 'Formulir Permohonan Bantuan | BAZNAS Kota Tangerang',
  description:
    'Formulir pendaftaran permohonan bantuan mustahik Program 5 Pilar BAZNAS Kota Tangerang.',
};

export default function PengajuanPage() {
  return (
    <main className="min-h-screen bg-slate-50/60 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto mb-8 max-w-4xl text-center space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 inline-block px-3 py-1 rounded-full">
          Layanan Resmi BAZNAS Kota Tangerang
        </p>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          Formulir Permohonan Bantuan Mustahik
        </h1>
        <p className="mx-auto max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-600">
          Lengkapi data sesuai dokumen Anda. Setelah dikirim, BAZNAS akan melakukan verifikasi administrasi dan survey bila diperlukan.
        </p>
      </div>
      <PublicApplicationForm />
    </main>
  );
}