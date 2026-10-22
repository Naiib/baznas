import { Metadata } from 'next';
import { SettingsWorkspace } from '@/components/penerimaan/pengaturan/SettingsWorkspace';

export const metadata: Metadata = {
  title: 'Pengaturan Operasional Penerimaan | BAZNAS',
  description: 'Konfigurasi threshold otorisasi, master kanal penerimaan, rekening bank, dan audit konfigurasi.',
};

export default function PenerimaanPengaturanPage() {
  return <SettingsWorkspace />;
}
