import { Metadata } from 'next';
import { MuzakkiWorkspace } from '@/components/penerimaan/muzakki/MuzakkiWorkspace';

export const metadata: Metadata = {
  title: 'Direktori Muzakki & Donatur',
  description: 'Manajemen direktori muzakki, profil donatur, privasi anonim, dan riwayat kontribusi BAZNAS Kota Tangerang',
};

export default function MuzakkiPage() {
  return <MuzakkiWorkspace />;
}
