import { describe, expect, it } from 'vitest';
import { defaultCatalog } from '../data/catalog';
import { defaultPreferences, generateSchedules, isSchedulableOffering } from './engine';

describe('skill course generation', () => {
  it('generates the reported MCA selection using its source slots', () => {
    const picks = [
      ['MCA-UCC-PASTS602', 'G1+TG1', 'vtop-faculty-face-apt-', 'SJTG14'],
      ['MCA-OEC-PASTS501', 'G2+TG2', 'vtop-faculty-face-apt-', 'SJT113'],
      ['MCA-PFCC-PAMCA504', 'D2+TD2', 'vtop-faculty-suganya-a'],
      ['MCA-PFCC-PAMCA505', 'A2+TA2+TAA2', 'vtop-faculty-karthikeyan-j'],
      ['MCA-PFCC-PAMCA506', 'E2+TE2', 'vtop-faculty-bala-ganesh-n'],
      ['MCA-PFEC-PAMCA608', 'C2+TC2+TCC2', 'vtop-faculty-jagannathan-j'],
      ['MCA-PFEC-PAMCA606', 'B2+TB2', 'vtop-faculty-nivedita-s'],
    ];
    const choices = picks.map(([courseId, section, facultyId, venue]) => {
      const offering = defaultCatalog.offerings.find(o => o.courseId === courseId && o.section.split(" / ")[0] === section && o.facultyId === facultyId && (!venue || o.components.some(c => c.venue === venue)));
      expect(offering, `${courseId} ${section}`).toBeDefined();
      expect(isSchedulableOffering(offering!)).toBe(true);
      return offering!;
    });
    const selected = Object.fromEntries(choices.map(o => [o.courseId, [o.id]]));
    const result = generateSchedules(defaultCatalog, choices.map(o => o.courseId), defaultPreferences, selected);
    expect(result.schedules).toHaveLength(1);
    expect(new Set(result.schedules[0].offeringIds)).toEqual(new Set(choices.map(o => o.id)));
  });
});
