import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  FileSearch,
  UserPlus,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Users,
  Building2,
  Clock,
  PhoneCall,
  MapPin,
} from 'lucide-react';

export const metadata = {
  title: 'Portal Publik Mustahik - BAZNAS Kota Tangerang',
  description:
    'Layanan resmi pengajuan permohonan bantuan mustahik dan pelacakan status ZIS Badan Amil Zakat Nasional Kota Tangerang.',
};

export default function PublicPortalPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 font-sans flex flex-col justify-between text-slate-800">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-xs">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-emerald-50 border border-emerald-100 p-1 flex items-center justify-center">
              <img
                src="/baznas-logo.png"
                alt="BAZNAS Kota Tangerang"
                className="size-full object-contain"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black tracking-tight text-emerald-950">
                BAZNAS
              </span>
              <span className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase">
                Kota Tangerang
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 shadow-xs transition-colors"
            >
              <span>Portal Amil SIM</span>
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16 space-y-12">
        {/* Intro */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-200 text-xs font-bold text-emerald-900">
            <ShieldCheck className="size-4 text-emerald-700" />
            <span>Lembaga Pemerintah Nonstruktural Pengelola ZIS Kota Tangerang</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Layanan Bantuan Mustahik & Transparansi Penyaluran ZIS
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Cek status permohonan bantuan secara mandiri menggunakan NIK atau ajukan permohonan bantuan Program 5 Pilar BAZNAS Kota Tangerang.
          </p>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
          {/* Card 1: Lacak Pengajuan */}
          <Link
            href="/cek-pengajuan"
            className="group relative flex flex-col justify-between p-6 rounded-2xl border border-slate-200 bg-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-900/5 transition-all duration-200"
          >
            <div className="space-y-3">
              <div className="size-12 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-100 flex items-center justify-center font-bold">
                <FileSearch className="size-6 text-emerald-700" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                Cek Status Pengajuan
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Lacak perkembangan verifikasi berkas dan jadwal pencairan dana bantuan dengan NIK KTP Anda.
              </p>
            </div>
            <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 group-hover:text-emerald-800">
                Cek status pengajuan
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          {/* Card 2: Permohonan Bantuan */}
          <Link
            href="/pengajuan"
            className="group relative flex flex-col justify-between p-6 rounded-2xl border border-slate-200 bg-white hover:border-emerald-600 hover:shadow-lg hover:shadow-emerald-900/5 transition-all duration-200"
          >
            <div className="space-y-3">
              <div className="size-12 rounded-xl bg-amber-50 text-amber-800 border border-amber-200/60 flex items-center justify-center font-bold">
                <UserPlus className="size-6 text-amber-700" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-800 transition-colors">
                Permohonan Bantuan
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Ajukan permohonan bantuan biaya pendidikan, kesehatan darurat, modal usaha, dan santunan sosial.
              </p>
            </div>
            <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 group-hover:text-emerald-800">
                Ajukan bantuan
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </div>

        {/* 5 Pilar Program BAZNAS */}
        <section className="pt-8 border-t border-slate-200">
          <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900">
              5 Pilar Program BAZNAS Kota Tangerang
            </h2>
            <p className="text-xs text-slate-500">
              Penyaluran dana zakat, infak, dan sedekah disalurkan tepat sasaran kepada asnaf yang berhak.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-2">
              <div className="mx-auto size-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <GraduationCap className="size-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tangerang Cerdas</h3>
              <p className="text-[11px] text-slate-500 leading-tight">Beasiswa & tunggakan biaya sekolah</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-2">
              <div className="mx-auto size-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <HeartPulse className="size-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tangerang Sehat</h3>
              <p className="text-[11px] text-slate-500 leading-tight">Biaya pengobatan darurat & alkes</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-2">
              <div className="mx-auto size-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Briefcase className="size-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tangerang Makmur</h3>
              <p className="text-[11px] text-slate-500 leading-tight">Modal usaha mustahik & UMKM</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-2">
              <div className="mx-auto size-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Users className="size-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tangerang Peduli</h3>
              <p className="text-[11px] text-slate-500 leading-tight">Santunan sembako & musibah darurat</p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-2">
              <div className="mx-auto size-9 rounded-lg bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Building2 className="size-5" />
              </div>
              <h3 className="text-xs font-bold text-slate-900">Tangerang Taqwa</h3>
              <p className="text-[11px] text-slate-500 leading-tight">Bantuan marbot, guru ngaji, & sarana ibadah</p>
            </div>
          </div>
        </section>

        {/* Warning / Integrity Notice */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 flex items-start gap-3.5 text-left">
          <ShieldCheck className="size-5 text-amber-800 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-amber-950">
            <p className="font-bold">Layanan Bebas Biaya (Gratis)</p>
            <p className="text-amber-900/90 leading-relaxed">
              Seluruh proses pendaftaran, verifikasi berkas, dan survei lapangan BAZNAS Kota Tangerang tidak dipungut biaya apa pun. Waspadai segala bentuk penipuan yang meminta imbalan mengatasnamakan amil BAZNAS.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <p className="font-bold text-slate-700">
              Badan Amil Zakat Nasional (BAZNAS) Kota Tangerang
            </p>
            <p className="flex items-center justify-center sm:justify-start gap-1 text-slate-500">
              <MapPin className="size-3.5" />
              Gedung Cisadane Lt. 2, Jl. Benteng Jaya No. 1, Kota Tangerang, Banten 15111
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1 text-[11px] text-slate-400">
            <p className="flex items-center gap-1 justify-center sm:justify-end">
              <Clock className="size-3.5" /> Jam Operasional: Senin – Jumat, 08.00 – 16.00 WIB
            </p>
            <p>© 2026 BAZNAS Kota Tangerang. Seluruh hak cipta dilindungi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}