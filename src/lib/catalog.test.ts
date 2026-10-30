import { describe, it, expect } from 'vitest';
import { defaultCatalog } from '../data/catalog';
import { vtopOfferings } from '../data/vtop';
import { validateCatalog } from './importer';
import { searchCourses } from './search';
import { generateSchedules, defaultPreferences } from './engine';

describe('current VTOP allocation catalog', () => {
  it('validates the account-scoped snapshot and reports browse-only timing honestly', () => {
    const result = validateCatalog(defaultCatalog);
    expect(result.errors).toEqual([]);
    expect(defaultCatalog.courses).toHaveLength(149);
    expect(defaultCatalog.offerings).toEqual(vtopOfferings);
    expect(defaultCatalog.offerings.length).toBeGreaterThan(700);
    expect(defaultCatalog.provenance.status).toBe('imported');
    expect(defaultCatalog.semester).toContain('2026-27');
    expect(defaultCatalog.courses.every(c => c.credits === null && c.account && c.category)).toBe(true);
    expect(new Set(defaultCatalog.faculty.map(f => f.id)).size).toBe(defaultCatalog.faculty.length);
    const facultyIds = new Set(defaultCatalog.faculty.map(f => f.id));
    expect(defaultCatalog.faculty.filter(f => !f.reviewOnly).every(f => f.name === f.name.trim().replace(/\s+/g, ' '))).toBe(true);
    expect(defaultCatalog.offerings.every(o => facultyIds.has(o.facultyId) && o.components.every(c => !c.facultyId || facultyIds.has(c.facultyId)))).toBe(true);
    expect(defaultCatalog.reviews).toEqual([]);
    expect(result.warnings.some(w => w.includes('browse-only'))).toBe(true);
    expect(result.warnings.some(w => w.includes('generic slot template') && w.includes('Fall Semester 2026-27') && w.includes('does not verify Winter'))).toBe(true);
    expect(defaultCatalog.offerings.some(o => o.scheduleStatus === 'browse-only')).toBe(true);
  });

  it('finds current source titles, course codes, and faculty names', () => {
    expect(searchCourses(defaultCatalog, 'BAARB101').some(c => c.id === 'ECE-UCC-BAARB101')).toBe(true);
    expect(searchCourses(defaultCatalog, 'Arabic Level I').some(c => c.id === 'ECE-UCC-BAARB101')).toBe(true);
    expect(searchCourses(defaultCatalog, 'MOHD SAQIB').some(c => c.id === 'ECE-UCC-BAARB101')).toBe(true);
  });

  it('generates each confirmed single-theory lab alternative as a complete option', () => {
    const courseId = 'ECE-PCC-BAECE204';
    const choices = defaultCatalog.offerings.filter(o => o.courseId === courseId && o.facultyId === 'vtop-faculty-elakkiya-p');
    expect(choices).toHaveLength(2);
    expect(choices.every(o => o.components.map(c => c.type).join('+') === 'theory+lab')).toBe(true);
    expect(choices.every(o => o.components.every(c => c.meetings.length > 0) && !o.scheduleStatus && !o.pairingStatus)).toBe(true);
    const result = generateSchedules(defaultCatalog, [courseId], defaultPreferences, { [courseId]: choices.map(o => o.id) });
    expect(result.schedules).toHaveLength(2);
    expect(result.schedules.every(s => s.offeringIds.length === 1 && choices.some(o => o.id === s.offeringIds[0]))).toBe(true);
    for (const schedule of result.schedules) {
      const offering = choices.find(o => o.id === schedule.offeringIds[0])!;
      const meetings = offering.components.flatMap(c => c.meetings);
      for (let i = 0; i < meetings.length; i++) for (let j = i + 1; j < meetings.length; j++) {
        const a = meetings[i], b = meetings[j];
        expect(a.day === b.day && Math.max(a.start, b.start) < Math.min(a.end, b.end)).toBe(false);
      }
    }
  });
});
