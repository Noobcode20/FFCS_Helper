import { describe, expect, it } from 'vitest';
import { buildingFromVenue } from './buildings';

describe('buildingFromVenue', () => {
  it('groups room numbers and suffixes under their building', () => {
    for (const room of ['PRP350', 'PRP1234', 'PRP2001', 'PRP4001']) expect(buildingFromVenue(room)).toBe('PRP');
    for (const room of ['TT201', 'TT2001', 'TT5001', 'TT531A']) expect(buildingFromVenue(room)).toBe('TT');
    expect(buildingFromVenue(' SJT311A ')).toBe('SJT');
    expect(buildingFromVenue('MGB 401')).toBe('MGB');
    expect(buildingFromVenue('MB3')).toBe('MB');
    expect(buildingFromVenue('SJTG24')).toBe('SJT');
    expect(buildingFromVenue('PRPG01')).toBe('PRP');
    expect(buildingFromVenue('SMVG15')).toBe('SMV');
    expect(buildingFromVenue('GDNG07')).toBe('GDN');
    expect(buildingFromVenue('CDMM103')).toBe('CDMM');
    expect(buildingFromVenue(undefined)).toBe('');
  });
});
