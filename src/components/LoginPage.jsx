import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  HeartHandshake,
  Wallet,
  ClipboardList,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import baznasLogo from '@/assets/baznas-logo.png';

const DEMO_ACCOUNTS = [
  {
    id: 'admin',
    label: 'Super Admin',
    desc: 'Semua Fitur & Manajemen',
    email: 'admin@baznas.go.id',
    password: 'admin123',
    role: 'admin',
    icon: ShieldCheck,
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'penyaluran',
    label: 'Divisi Penyaluran',
    desc: 'Master Mustahik & Asesmen',
    email: 'penyaluran@baznas.go.id',
    password: 'penyaluran123',
    role: 'penyaluran',
    icon: HeartHandshake,
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  },
  {
    id: 'penerimaan',
    label: 'Divisi Penerimaan',
    desc: 'Muzakki, ZIS & UPZ',
    email: 'penerimaan@baznas.go.id',
    password: 'penerimaan123',
    role: 'penerimaan',
    icon: Wallet,
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  {
    id: 'surveyor',
    label: 'Petugas Surveyor',
    desc: 'Input Survey Lapangan',
    email: 'surveyor@baznas.go.id',
    password: 'surveyor123',
    role: 'surveyor',
    icon: ClipboardList,
    color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
  },
];

export default function LoginPage({ onLoginSuccess, onNavigateToPortal }) {
  const [email, setEmail] = useState('admin@baznas.go.id');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSelectDemo = (acc) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setErrorMsg('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Mohon isi alamat email dan kata sandi.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await api.login({ email, password });
      if (res.success && res.token && res.user) {
        localStorage.setItem('baznas_auth_token', res.token);
        localStorage.setItem('baznas_auth_user', JSON.stringify(res.user));
        if (onLoginSuccess) {
          onLoginSuccess(res.user, res.token);
        }
      } else {
        setErrorMsg(res.message || 'Login gagal. Silakan periksa kembali email & password.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Gagal terhubung ke server autentikasi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-950 text-slate-100 relative overflow-hidden select-none font-sans">
      {/* Background Islamic Geometric Ambient Glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-emerald-600/10 blur-[130px] pointer-events-none -top-40 -left-40" />
      <div className="absolute w-[600px] h-[600px] rounded-full bg-teal-500/10 blur-[140px] pointer-events-none -bottom-40 -right-40" />

      {/* Top Navbar Brand */}
      <header className="relative z-10 px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1 shadow-sm flex items-center justify-center">
            <img src={baznasLogo} alt="BAZNAS Kota Tangerang" className="h-8 w-auto object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-white tracking-wide">BAZNAS</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                KOTA TANGERANG
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Sistem Informasi Manajemen & Data Center Terpadu</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateToPortal}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 border border-slate-700/60 transition-colors cursor-pointer"
        >
          <ExternalLink className="size-3.5" />
          <span>Buka Portal Publik</span>
        </button>
      </header>

      {/* Main Login Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md space-y-6">
          
          {/* Main Card */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
            
            {/* Header Title */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <Lock className="size-6" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Masuk ke Sistem BAZNAS
              </h2>
              <p className="text-xs text-slate-400">
                Gunakan kredensial resmi amil untuk mengakses modul kerja Anda.
              </p>
            </div>

            {/* Error Alert */}
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-fade-in">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Mail className="size-3.5 text-emerald-400" />
                  <span>Alamat Email</span>
                </label>
                <Input
                  type="email"
                  placeholder="nama@baznas.go.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-600 rounded-xl focus-visible:ring-emerald-500 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Lock className="size-3.5 text-emerald-400" />
                  <span>Kata Sandi</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-600 rounded-xl focus-visible:ring-emerald-500 text-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/50 cursor-pointer gap-2 mt-2"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                <span>{isLoading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}</span>
              </Button>
            </form>

            {/* Quick Demo Role Selector Pills */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Sparkles className="size-3.5 text-amber-400" />
                  <span>Pilih Akun Demo Instan</span>
                </span>
                <span className="text-[10px] text-slate-500">Klik untuk auto-fill</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => {
                  const IconComp = acc.icon;
                  const isSelected = email === acc.email;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => handleSelectDemo(acc)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? `${acc.color} ring-2 ring-emerald-400/50 font-bold`
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <IconComp className="size-3.5 shrink-0" />
                        <span className="text-[11px] font-bold truncate">{acc.label}</span>
                      </div>
                      <span className="text-[9px] text-slate-500 truncate">{acc.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Bottom Security Badge */}
          <div className="flex items-center justify-center gap-2 text-center text-slate-500 text-[11px]">
            <ShieldCheck className="size-4 text-emerald-500/80" />
            <span>Terproteksi Enkripsi SSL/TLS & JWT Token Standar Keamanan BAZNAS</span>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-3 text-center border-t border-slate-800/80 bg-slate-950 text-[11px] text-slate-500">
        &copy; 2026 Badan Amil Zakat Nasional (BAZNAS) Kota Tangerang. Hak Cipta Dilindungi.
      </footer>
    </div>
  );
}
