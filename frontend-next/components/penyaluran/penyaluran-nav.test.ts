import { describe, expect, it } from 'vitest';
import { PENYALURAN_NAV_ITEMS } from './penyaluran-nav';

describe('penyaluran navigation information architecture', () => {
  it('keeps the four flat destinations from the BAZNAS V1 navigation', () => {
    expect(PENYALURAN_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Beranda', 'Data Mustahik', 'Program 5 Pilar', 'Peta Sebaran (GIS)',
    ]);
    expect(PENYALURAN_NAV_ITEMS).toHaveLength(4);
    expect(PENYALURAN_NAV_ITEMS.every((item) => item.href && !item.children)).toBe(true);
  });
});
