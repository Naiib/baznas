import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramPilarWorkspace } from './ProgramPilarWorkspace';

const readAppSource = (relativePath: string) => {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const sourcePath = sourceUrl.protocol === 'file:'
    ? fileURLToPath(sourceUrl)
    : resolve(process.cwd(), relativePath.replace('../../../', ''));
  return readFileSync(sourcePath, 'utf8');
};

const layoutSource = readAppSource('../../../app/layout.tsx');
const globalsSource = readAppSource('../../../app/globals.css');

describe('ProgramPilarWorkspace', () => {
  it('menetapkan policy sans global tanpa override Manrope', () => {
    expect(layoutSource).not.toContain("next/font/local");
    expect(layoutSource).not.toContain('--font-manrope');
    expect(layoutSource).toMatch(/<body\b[^>]*className="[^"]*\bfont-sans\b[^\"]*\btabular-nums\b[^\"]*\bantialiased\b/);
    expect(globalsSource).not.toContain('var(--font-manrope)');
  });

  it('menggunakan sans untuk nominal dan KPI yang dibaca pengguna', () => {
    render(<ProgramPilarWorkspace />);

    const nominal = screen.getByText('Rp 8,62 M');
    const kpi = screen.getByText('12.374');

    expect(nominal).not.toHaveClass('font-mono');
    expect(nominal).toHaveClass('font-black', 'tracking-tight');
    expect(kpi).not.toHaveClass('font-mono');
    expect(kpi).toHaveClass('font-black', 'tracking-tight');
  });

  it('uses tight tracking for every Kinerja financial and reach value', () => {
    render(<ProgramPilarWorkspace />);

    const insights = within(
      screen.getByRole('region', { name: /kinerja program terpadu/i }),
    ).getByRole('group', { name: /ringkasan proyeksi dan jangkauan/i });
    const values = [
      within(insights).getByText(/proyeksi serapan 2026/i).parentElement?.querySelector('strong'),
      within(insights).getByText(/pagu tahunan/i).parentElement?.querySelector('p.mt-2'),
      within(insights).getByText(/sisa kuota/i).parentElement?.querySelector('p.mt-2'),
      within(insights).getByText(/kecamatan terjangkau/i).parentElement?.querySelector('p.mt-2'),
      within(insights).getByText(/penerima baru/i).parentElement?.querySelector('p.mt-2'),
    ];

    values.forEach((value) => {
      expect(value).not.toBeNull();
      expect(value).toHaveClass('tracking-tight');
    });
  });

  it('membuka halaman dengan konteks Lima Pilar yang mudah dipahami', () => {
    render(<ProgramPilarWorkspace />);

    expect(
      screen.getByRole('heading', { level: 1, name: /lima pilar, satu dampak untuk kota tangerang/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/transformasi akuntabel dana zakat/i)).toBeInTheDocument();
  });

  it('menyajikan kelima pilar sebagai tab dengan Tangerang Sehat aktif', () => {
    render(<ProgramPilarWorkspace />);

    const navigation = screen.getByTestId('pilar-tablist');
    const tabs = within(navigation).getAllByRole('tab');

    expect(tabs).toHaveLength(5);
    expect(navigation).toHaveClass('overflow-x-auto');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringMatching(/tangerang cerdas/i),
      expect.stringMatching(/tangerang makmur/i),
      expect.stringMatching(/tangerang sehat/i),
      expect.stringMatching(/tangerang takwa/i),
      expect.stringMatching(/tangerang peduli/i),
    ]);

    const nonSelectedTabs = tabs.filter((tab) => tab.getAttribute('aria-selected') !== 'true');
    expect(nonSelectedTabs).toHaveLength(4);
    nonSelectedTabs.forEach((tab) => expect(tab).toHaveClass('lg:flex-1'));

    expect(within(navigation).getByRole('tab', { name: /tangerang sehat/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(navigation).getByRole('tab', { name: /tangerang sehat/i })).toHaveClass('lg:flex-[1.15]');
  });

  it('menyatukan strip desktop sebagai segmen kartu yang kohesif', () => {
    render(<ProgramPilarWorkspace />);

    const navigation = screen.getByTestId('pilar-tablist');
    const tabs = within(navigation).getAllByRole('tab');
    const sehat = within(navigation).getByRole('tab', { name: /tangerang sehat/i });

    expect(navigation).toHaveClass('lg:gap-0');
    expect(tabs[0]).toHaveClass('first:lg:border-l-0');
    tabs
      .filter((tab) => tab !== sehat)
      .forEach((tab) => {
        expect(tab).toHaveClass(
          'lg:rounded-none',
          'lg:bg-transparent',
          'lg:border-l',
          'lg:border-y-0',
          'lg:border-r-0',
        );
      });
    expect(sehat).toHaveClass('rounded-xl', 'border-[#008B5A]', 'shadow-md');
  });

  it('memperbarui data terpadu saat pilar lain dipilih', () => {
    render(<ProgramPilarWorkspace />);

    const makmurTab = screen.getByRole('tab', { name: /tangerang makmur/i });
    fireEvent.click(makmurTab);

    const panel = screen.getByRole('tabpanel');
    const insights = within(panel).getByRole('group', { name: /ringkasan proyeksi dan jangkauan/i });

    expect(
      screen.getByRole('heading', { name: /dari anggaran ke dampak sosial — tangerang makmur/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /kinerja program terpadu/i })).getByRole('heading', {
        name: /kinerja tangerang makmur/i,
      }),
    ).toBeInTheDocument();
    expect(makmurTab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', makmurTab.id);
    expect(within(insights).getByText('Rp 9,13 M')).toBeInTheDocument();
    expect(within(insights).getByText('Rp 11,30 M')).toBeInTheDocument();
    expect(within(insights).getByText('Rp 3,82 M')).toBeInTheDocument();
    expect(within(insights).getByText('81% target')).toBeInTheDocument();
  });

  it('mendukung perpindahan pilar dengan tombol panah keyboard', () => {
    render(<ProgramPilarWorkspace />);

    const sehat = screen.getByRole('tab', { name: /tangerang sehat/i });
    fireEvent.keyDown(sehat, { key: 'ArrowRight' });

    const takwa = screen.getByRole('tab', { name: /tangerang takwa/i });
    expect(takwa).toHaveAttribute('aria-selected', 'true');
    expect(takwa).toHaveFocus();
  });

  it('menggabungkan grafik dan tepat empat KPI utama tanpa panel dampak terpisah', () => {
    render(<ProgramPilarWorkspace />);

    const region = screen.getByRole('region', { name: /kinerja program terpadu/i });
    const metrics = within(region).getByRole('list', { name: /empat indikator dampak utama/i });

    expect(within(region).getByRole('heading', { name: /tren penyaluran bulanan/i })).toBeInTheDocument();
    expect(within(metrics).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('heading', { name: /^dampak utama/i })).not.toBeInTheDocument();
  });

  it('menempatkan proyeksi dan indikator sekunder dalam satu insight strip', () => {
    render(<ProgramPilarWorkspace />);

    const insights = within(
      screen.getByRole('region', { name: /kinerja program terpadu/i }),
    ).getByRole('group', { name: /ringkasan proyeksi dan jangkauan/i });

    expect(within(insights).getByText(/proyeksi serapan 2026/i)).toBeInTheDocument();
    expect(within(insights).getByText(/pagu tahunan/i)).toBeInTheDocument();
    expect(within(insights).getByText(/sisa kuota/i)).toBeInTheDocument();
    expect(within(insights).getByText(/kecamatan terjangkau/i)).toBeInTheDocument();
    expect(within(insights).getByText(/penerima baru/i)).toBeInTheDocument();
  });

  it('menjaga komposisi tablet dan mobile tetap padat tanpa sel kosong paksa', () => {
    render(<ProgramPilarWorkspace />);

    const navigation = screen.getByTestId('pilar-tablist');
    const tabs = within(navigation).getAllByRole('tab');
    const region = screen.getByRole('region', { name: /kinerja program terpadu/i });
    const metrics = within(region).getByRole('list', { name: /empat indikator dampak utama/i });
    const insights = within(region).getByRole('group', { name: /ringkasan proyeksi dan jangkauan/i });
    const analytics = screen.getByRole('region', { name: /analitik penyaluran program/i });

    expect(navigation).toHaveClass('overflow-x-auto');
    tabs.forEach((tab) => expect(tab).toHaveClass('min-w-[17rem]', 'shrink-0'));
    expect(metrics).toHaveClass('grid-cols-2');
    expect(insights.firstElementChild).toHaveClass('sm:col-span-2', 'xl:col-span-1');
    expect(within(region).getByRole('article').parentElement).toHaveClass('items-start');
    expect(analytics).toHaveClass('items-start');
    expect(analytics).not.toHaveClass('xl:items-stretch');
  });

  it('menyediakan portofolio berbentuk kartu yang mudah dipindai pada layar kecil', () => {
    render(<ProgramPilarWorkspace />);

    const mobilePortfolio = screen.getByRole('list', {
      name: /portofolio sub-program untuk layar kecil/i,
    });

    expect(within(mobilePortfolio).getAllByRole('listitem')).toHaveLength(4);
    expect(within(mobilePortfolio).getByText(/klinik mustahik/i)).toBeInTheDocument();
  });
});
