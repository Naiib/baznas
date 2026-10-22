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
  MapPin,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export const metadata = {
  title: 'Portal Publik Mustahik - BAZNAS Kota Tangerang',
  description:
    'Layanan resmi pengajuan permohonan bantuan mustahik dan pelacakan status ZIS Badan Amil Zakat Nasional Kota Tangerang.',
};

export default function PublicPortalPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col justify-between text-slate-800 selection:bg-emerald-600 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3.5">
            <div className="size-11 shrink-0 overflow-hidden rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs">
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
              <span className="text-[11px] font-extrabold text-emerald-700 tracking-wider uppercase">
                Kota Tangerang
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-800 text-xs font-bold text-white hover:bg-emerald-900 shadow-xs hover:shadow-md transition-all duration-200"
            >
              <span>Portal Amil SIM</span>
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16 space-y-14">
        {/* Intro */}
        <div className="mx-auto max-w-4xl space-y-5 text-center">
          <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-emerald-300 bg-emerald-100/90 px-4 py-1.5 text-xs font-black text-emerald-950 shadow-xs">
            <ShieldCheck className="size-4 text-emerald-800 shrink-0" />
            <span>Lembaga Pemerintah Nonstruktural Pengelola ZIS Kota Tangerang</span>
          </div>

          <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Layanan Bantuan Mustahik & Transparansi Penyaluran ZIS
          </h1>

          <p className="mx-auto max-w-3xl text-sm leading-relaxed text-slate-700 font-medium sm:text-base">
            Cek status permohonan bantuan secara mandiri menggunakan NIK atau ajukan permohonan bantuan Program 5 Pilar BAZNAS Kota Tangerang secara cepat, transparan, dan akuntabel.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-bold text-slate-800">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-300 shadow-xs hover:border-emerald-500 hover:text-emerald-900 transition-colors">
              <CheckCircle2 className="size-4 text-emerald-700" /> Layanan 100% Bebas Biaya
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-300 shadow-xs hover:border-emerald-500 hover:text-emerald-900 transition-colors">
              <CheckCircle2 className="size-4 text-emerald-700" /> Tracking Mandiri Berbasis NIK
            </span>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-300 shadow-xs hover:border-emerald-500 hover:text-emerald-900 transition-colors">
              <CheckCircle2 className="size-4 text-emerald-700" /> Penyaluran Tepat Sasaran
            </span>
          </div>
        </div>

        {/* Quick Action Cards with Elevated Modern Hover Effect */}
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 text-left sm:grid-cols-2 lg:gap-8">
          {/* Card 1: Lacak Pengajuan */}
          <Link
            href="/cek-pengajuan"
            className="group relative flex min-h-64 flex-col justify-between overflow-hidden rounded-3xl border-2 border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-emerald-600 hover:shadow-2xl hover:shadow-emerald-950/15 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            {/* Top Hover Gradient Bar */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/0 via-transparent to-emerald-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="size-14 rounded-2xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center font-bold shadow-xs group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                  <FileSearch className="size-7" />
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-[11px] font-black tracking-wide uppercase shadow-xs">
                  <Sparkles className="size-3 text-emerald-700" />
                  Verifikasi Cepat
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-950 group-hover:text-emerald-950 transition-colors">
                Cek Status Pengajuan
              </h2>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Lacak perkembangan verifikasi berkas, survei faktual lapangan, dan jadwal pencairan dana bantuan secara real-time dengan NIK KTP Anda.
              </p>
            </div>

            <div className="relative pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-black text-emerald-800 group-hover:text-emerald-950 transition-colors">
                Cek status pengajuan
              </span>
              <div className="size-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md group-hover:translate-x-1 transition-all duration-300">
                <ArrowRight className="size-5" />
              </div>
            </div>
          </Link>

          {/* Card 2: Permohonan Bantuan */}
          <Link
            href="/pengajuan"
            className="group relative flex min-h-64 flex-col justify-between overflow-hidden rounded-3xl border-2 border-slate-200/90 bg-white p-7 sm:p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-amber-600 hover:shadow-2xl hover:shadow-amber-950/15 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
          >
            {/* Top Hover Gradient Bar */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/0 via-transparent to-amber-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="size-14 rounded-2xl bg-amber-50 text-amber-800 border-2 border-amber-200 flex items-center justify-center font-bold shadow-xs group-hover:scale-110 group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600 group-hover:shadow-md transition-all duration-300">
                  <UserPlus className="size-7" />
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100/80 border border-amber-300 text-amber-950 text-[11px] font-black tracking-wide uppercase shadow-xs">
                  <Sparkles className="size-3 text-amber-700" />
                  5 Pilar Program
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-950 group-hover:text-amber-950 transition-colors">
                Permohonan Bantuan
              </h2>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Ajukan permohonan bantuan biaya pendidikan, kesehatan darurat, modal usaha mustahik, dan santunan sosial terpadu secara langsung.
              </p>
            </div>

            <div className="relative pt-5 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-sm font-black text-amber-900 group-hover:text-amber-950 transition-colors">
                Ajukan bantuan
              </span>
              <div className="size-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600 group-hover:shadow-md group-hover:translate-x-1 transition-all duration-300">
                <ArrowRight className="size-5" />
              </div>
            </div>
          </Link>
        </div>

        {/* 5 Pilar Program BAZNAS */}
        <section className="border-t border-slate-200/90 pt-12 sm:pt-14">
          <div className="mx-auto mb-10 max-w-2xl space-y-2 text-center">
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">
              5 Pilar Program BAZNAS Kota Tangerang
            </h2>
            <p className="text-sm text-slate-600 font-medium">
              Penyaluran dana zakat, infak, dan sedekah disalurkan tepat sasaran kepada 8 asnaf yang berhak.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
            {/* Pilar 1 */}
            <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-5 text-center shadow-xs transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-950/10 hover:border-emerald-600 hover:bg-gradient-to-b hover:from-white hover:to-emerald-50/30 cursor-pointer">
              <div className="mx-auto size-12 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                <GraduationCap className="size-6" />
              </div>
              <h3 className="text-sm font-black text-slate-950 group-hover:text-emerald-900 transition-colors">
                Tangerang Cerdas
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                Beasiswa & pelunasan tunggakan biaya sekolah mustahik
              </p>
            </div>

            {/* Pilar 2 */}
            <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-5 text-center shadow-xs transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-950/10 hover:border-emerald-600 hover:bg-gradient-to-b hover:from-white hover:to-emerald-50/30 cursor-pointer">
              <div className="mx-auto size-12 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                <HeartPulse className="size-6" />
              </div>
              <h3 className="text-sm font-black text-slate-950 group-hover:text-emerald-900 transition-colors">
                Tangerang Sehat
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                Biaya pengobatan darurat, rawat inap & alat bantu kesehatan
              </p>
            </div>

            {/* Pilar 3 */}
            <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-5 text-center shadow-xs transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-950/10 hover:border-emerald-600 hover:bg-gradient-to-b hover:from-white hover:to-emerald-50/30 cursor-pointer">
              <div className="mx-auto size-12 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                <Briefcase className="size-6" />
              </div>
              <h3 className="text-sm font-black text-slate-950 group-hover:text-emerald-900 transition-colors">
                Tangerang Makmur
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                Modal usaha produktif, sarana dagang & pembinaan UMKM
              </p>
            </div>

            {/* Pilar 4 */}
            <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-5 text-center shadow-xs transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-950/10 hover:border-emerald-600 hover:bg-gradient-to-b hover:from-white hover:to-emerald-50/30 cursor-pointer">
              <div className="mx-auto size-12 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                <Users className="size-6" />
              </div>
              <h3 className="text-sm font-black text-slate-950 group-hover:text-emerald-900 transition-colors">
                Tangerang Peduli
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                Santunan sembako, tanggap bencana & bantuan musibah darurat
              </p>
            </div>

            {/* Pilar 5 */}
            <div className="group relative rounded-2xl border-2 border-slate-200 bg-white p-5 text-center shadow-xs transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-950/10 hover:border-emerald-600 hover:bg-gradient-to-b hover:from-white hover:to-emerald-50/30 cursor-pointer col-span-2 sm:col-span-1 lg:col-span-1">
              <div className="mx-auto size-12 rounded-xl bg-emerald-50 text-emerald-800 border-2 border-emerald-200 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-emerald-700 group-hover:text-white group-hover:border-emerald-700 group-hover:shadow-md transition-all duration-300">
                <Building2 className="size-6" />
              </div>
              <h3 className="text-sm font-black text-slate-950 group-hover:text-emerald-900 transition-colors">
                Tangerang Taqwa
              </h3>
              <p className="text-xs font-medium text-slate-600 mt-1.5 leading-relaxed">
                Honor guru ngaji, marbot masjid & renovasi sarana ibadah
              </p>
            </div>
          </div>
        </section>

        {/* Warning / Integrity Notice */}
        <div className="mx-auto flex max-w-5xl items-start gap-4 rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-5 sm:p-6 text-left shadow-xs">
          <ShieldCheck className="size-6 text-amber-800 shrink-0 mt-0.5" />
          <div className="space-y-1 text-amber-950">
            <p className="text-sm sm:text-base font-black">Layanan 100% Bebas Biaya (Gratis)</p>
            <p className="text-xs sm:text-sm text-amber-900 font-medium leading-relaxed">
              Seluruh proses pendaftaran, verifikasi berkas, dan survei faktual lapangan BAZNAS Kota Tangerang tidak dipungut biaya apa pun. Waspadai segala bentuk penipuan yang meminta imbalan mengatasnamakan petugas amil BAZNAS.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-600 mt-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 text-center sm:text-left sm:flex-row">
          <div className="flex items-center gap-3">
            <img src="/baznas-logo.png" alt="Logo resmi BAZNAS" className="size-12 shrink-0 object-contain" />
            <div className="space-y-1">
              <p className="font-black text-slate-800">
                Badan Amil Zakat Nasional (BAZNAS) Kota Tangerang
              </p>
              <p className="flex items-center justify-center gap-1.5 text-slate-700 font-medium sm:justify-start">
                <MapPin className="size-3.5 text-emerald-700" />
                Gedung Cisadane Lt. 2, Jl. Benteng Jaya No. 1, Kota Tangerang, Banten 15111
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:items-end gap-1 text-[11px] text-slate-600 font-medium">
            <p className="flex items-center gap-1.5 justify-center sm:justify-end">
              <Clock className="size-3.5 text-emerald-700" /> Jam Operasional: Senin – Jumat, 08.00 – 16.00 WIB
            </p>
            <p>© 2026 BAZNAS Kota Tangerang. Seluruh hak cipta dilindungi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
