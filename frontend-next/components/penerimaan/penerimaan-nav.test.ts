import { describe, expect, it } from 'vitest';
import { PENERIMAAN_NAV_ITEMS } from './penerimaan-nav';

describe('Penerimaan navigation information architecture', () => {
  it('implements exactly five destinations in the primary navigation', () => {
    const labels = PENERIMAAN_NAV_ITEMS.map((item) => item.label);
    expect(labels).toEqual([
      'Beranda',
      'Transaksi',
      'Muzakki',
      'Rekonsiliasi',
      'Laporan',
    ]);
    expect(PENERIMAAN_NAV_ITEMS).toHaveLength(5);
  });

  it('maps to canonical Penerimaan routes', () => {
    expect(PENERIMAAN_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/penerimaan',
      '/penerimaan/transaksi',
      '/penerimaan/muzakki',
      '/penerimaan/rekonsiliasi',
      '/penerimaan/laporan',
    ]);
  });

  it('ensures Beranda requires exact route matching while feature sections match prefixes', () => {
    const beranda = PENERIMAAN_NAV_ITEMS.find((item) => item.id === 'beranda');
    const transaksi = PENERIMAAN_NAV_ITEMS.find((item) => item.id === 'transaksi');
    expect(beranda?.exact).toBe(true);
    expect(transaksi?.exact).toBeFalsy();
  });
});
