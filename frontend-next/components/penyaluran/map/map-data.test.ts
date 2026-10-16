import { describe, expect, it } from 'vitest';
import {
  getKecamatanInsight,
  getKecamatanMapValue,
  getMapMetricPresentation,
  getMapMetricValue,
} from './map-data';

describe('peta metric helpers', () => {
  it('uses API realization for the funds metric', () => {
    expect(
      getKecamatanMapValue('Cipondoh', 'funds', [
        {
          id: 'cipondoh',
          name: 'Cipondoh',
          totalDisalurkan: 2_900_000_000,
          totalMustahik: 1_500,
          desil1Count: 600,
        },
      ]),
    ).toBe(2_900_000_000);
  });

  it('uses fallback beneficiary data when demo mode is enabled and API data is unavailable', () => {
    const original = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    try {
      expect(getKecamatanMapValue('Cipondoh', 'beneficiaries')).toBe(1_480);
    } finally {
      process.env.NEXT_PUBLIC_DEMO_MODE = original;
    }
  });

  it('returns a known kecamatan insight', () => {
    expect(getKecamatanInsight('Karawaci')).toMatchObject({
      topProgram: 'Tangerang Sehat',
      dominantAsnaf: 'Miskin',
    });
  });

  it('provides a readable legend label for asnaf need', () => {
    expect(getMapMetricPresentation('asnafNeed')).toMatchObject({
      label: 'Kebutuhan asnaf',
      unit: 'KK prioritas',
    });
  });

  it('keeps API values ahead of dashboard period data', () => {
    expect(getMapMetricValue('Cipondoh', 'funds', [{
      id: 'cipondoh', name: 'Cipondoh', totalDisalurkan: 2_900_000_000, totalMustahik: 1_500, desil1Count: 600,
    }], { Cipondoh: { amount: 1_000_000_000, beneficiaries: 500 } })).toBe(2_900_000_000);
  });

  it('uses desil one fallback for the asnaf need metric when demo mode is enabled', () => {
    const original = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    try {
      expect(getKecamatanMapValue('Cipondoh', 'asnafNeed')).toBe(560);
    } finally {
      process.env.NEXT_PUBLIC_DEMO_MODE = original;
    }
  });

  it('returns 0 when demo mode is disabled and API data is unavailable', () => {
    const original = process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    try {
      expect(getKecamatanMapValue('Cipondoh', 'beneficiaries')).toBe(0);
      expect(getKecamatanMapValue('Cipondoh', 'funds')).toBe(0);
      expect(getKecamatanMapValue('Cipondoh', 'asnafNeed')).toBe(0);
    } finally {
      process.env.NEXT_PUBLIC_DEMO_MODE = original;
    }
  });

  it('does not use demo kecamatan values when the API has no record', () => {
    expect(getMapMetricValue('Cipondoh', 'funds', [], undefined)).toBe(0);
  });

  it('does not use demo values in production even when the demo flag is enabled', () => {
    const originalDemo = process.env.NEXT_PUBLIC_DEMO_MODE;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true';
    process.env.NODE_ENV = 'production';
    try {
      expect(getKecamatanMapValue('Cipondoh', 'beneficiaries')).toBe(0);
      expect(getKecamatanMapValue('Cipondoh', 'funds')).toBe(0);
      expect(getKecamatanMapValue('Cipondoh', 'asnafNeed')).toBe(0);
    } finally {
      process.env.NEXT_PUBLIC_DEMO_MODE = originalDemo;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
