import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { AuthProvider } from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: {
    template: '%s - BAZNAS Kota Tangerang',
    default: 'Data Center BAZNAS Kota Tangerang',
  },
  description: 'Sistem Informasi Manajemen & Data Center Penyaluran BAZNAS Kota Tangerang',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full bg-white">
      <body className="min-h-full font-sans tabular-nums antialiased bg-white text-zinc-900 selection:bg-emerald-100 selection:text-emerald-900">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
