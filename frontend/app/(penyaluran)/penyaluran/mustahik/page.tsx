import { MustahikWorkspace } from '@/components/penyaluran/mustahik/MustahikWorkspace';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Data Mustahik | Penyaluran BAZNAS',
};

export default function MustahikPage() {
  const isP0Enabled = process.env.NEXT_PUBLIC_PENYALURAN_P0_ENABLED !== 'false';
  return <MustahikWorkspace isP0Enabled={isP0Enabled} />;
}
