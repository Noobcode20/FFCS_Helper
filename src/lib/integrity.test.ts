import { describe, expect, it } from 'vitest';
import { catalogFromRows, parseCsv, validateCatalog } from './importer';
import { fixture } from './test-fixture';
import { catalogFingerprint, restorePlans, scheduleCsv, scheduleIcs } from './storage';
import { generateSchedules, defaultPreferences } from './engine';
import type { Plan } from './types';

describe('import integrity edge cases', () => {
  it('rejects malformed nested catalog entries without throwing', () => {
    const c = fixture();
    c.offerings[0].components = [null as never];
    expect(() => validateCatalog(c)).not.toThrow();
    expect(validateCatalog(c).catalog).toBeUndefined();
  });

  it('requires complete theory and lab component meeting sets', () => {
    const c = fixture();
    c.offerings[0].components.push({ type: 'lab', slots: ['L1', 'L2'], meetings: [{ day: 1, start: 600, end: 650, slot: 'L1' }] });
    expect(validateCatalog(c).catalog).toBeUndefined();
  });

  it('rejects course code collisions after whitespace and case normalization', () => {
    const c = fixture();
    c.courses.push({ id: 'other', code: ' test 1 ', title: 'Another fixture course', credits: 3 });
    expect(validateCatalog(c).catalog).toBeUndefined();
  });

  it('allows equal codes in different account/category scopes but rejects duplicates within one scope', () => {
    const c = fixture();
    Object.assign(c.courses[0], { account: 'ECE', category: 'UCC' });
    c.courses.push({ id: 'other', code: 'TEST1', title: 'ECM course', credits: 3, account: 'ECM', category: 'UCC' });
    expect(validateCatalog(c).errors).toEqual([]);
    c.courses.push({ id: 'same-scope', code: 'TEST1', title: 'Duplicate ECE course', credits: 3, account: 'ECE', category: 'UCC' });
    expect(validateCatalog(c).errors.join(' ')).toContain('same account/category');
  });

  it('accepts explicit browse-only source rows but still rejects malformed data and excludes them from schedules', () => {
    const c = fixture();
    c.offerings[0].components[0].meetings = [];
    c.offerings[0].scheduleStatus = 'browse-only';
    c.offerings[0].scheduleNote = 'The source has no weekday or clock-time mapping.';
    c.offerings[0].scheduleBlockers = ['missing-times'];
    const result = validateCatalog(c);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(' ')).toContain('browse-only');
    expect(generateSchedules(c, ['c'], defaultPreferences).schedules).toEqual([]);

    const missingStatus = structuredClone(c);
    delete missingStatus.offerings[0].scheduleStatus;
    delete missingStatus.offerings[0].scheduleNote;
    delete missingStatus.offerings[0].scheduleBlockers;
    expect(validateCatalog(missingStatus).errors.join(' ')).toContain('explicit meeting intervals required');
    const malformed = structuredClone(c);
    malformed.offerings[0].components[0].slots = [];
    expect(validateCatalog(malformed).errors.join(' ')).toContain('component slots required');
    const invalidTime = structuredClone(c);
    invalidTime.offerings[0].components[0].meetings = [{ day: 0, start: Number.NaN, end: 600, slot: 'A' }];
    expect(validateCatalog(invalidTime).errors.join(' ')).toContain('invalid meeting day/time/slot');
    const unjustified = fixture();
    unjustified.offerings[0].scheduleStatus = 'browse-only';
    unjustified.offerings[0].scheduleNote = 'This note does not match a timing issue.';
    unjustified.offerings[0].scheduleBlockers = ['missing-times'];
    expect(validateCatalog(unjustified).errors.join(' ')).toContain('blocker reasons must match');
  });

  it('accepts explicitly browse-only overlapping supplied intervals without hiding them from the record', () => {
    const c = fixture();
    c.offerings[0].components.push({ type: 'lab', slots: ['L'], meetings: [{ day: 0, start: 520, end: 620, slot: 'L' }] });
    c.offerings[0].scheduleStatus = 'browse-only';
    c.offerings[0].scheduleNote = 'The supplied component intervals overlap; confirm in the source.';
    c.offerings[0].scheduleBlockers = ['overlapping-times'];
    expect(validateCatalog(c).errors).toEqual([]);
    expect(validateCatalog(c).catalog?.offerings[0].components[1].meetings[0]).toEqual({ day: 0, start: 520, end: 620, slot: 'L' });
    expect(generateSchedules(c, ['c'], defaultPreferences).schedules).toEqual([]);
  });

  it('retains row metadata containing CSV commas and escaped quotes', () => {
    const csv = 'course_id,code,title,credits,faculty_id,faculty,offering_id,section,component,slot,day,start,end\n' +
      'c,C1,"Circuits, ""Advanced""",3,f,"Dr. Fixture, A.",o,S,theory,A,Mon,08:00,08:50';
    const row = parseCsv(csv)[0];
    expect(row.title).toBe('Circuits, "Advanced"');
    expect(row.faculty).toBe('Dr. Fixture, A.');
    const result = catalogFromRows([row], { source: 'Test fixture', semester: 'Test' });
    expect(result.catalog?.courses[0].title).toBe('Circuits, "Advanced"');
  });

  it('rejects same-ID conflicting faculty names in row imports', () => {
    const base = { course_id: 'c', code: 'C1', title: 'Fixture', credits: '3', faculty_id: 'f', faculty: 'Faculty One', offering_id: 'o', section: 'S', component: 'theory', slot: 'A', day: 'Mon', start: '08:00', end: '08:50' };
    const result = catalogFromRows([base, { ...base, faculty: 'Faculty Two', component: 'lab', slot: 'L', start: '10:00', end: '10:50' }], { source: 'Fixture', semester: 'Test' });
    expect(result.catalog).toBeUndefined();
    expect(result.errors.join()).toContain('conflicting faculty identity');
  });
});

describe('backup and export edge cases', () => {
  it('blocks CSV and ICS export for browse-only or unresolved allocations', () => {
    const c = fixture();
    c.offerings[0].scheduleStatus = 'browse-only';
    c.offerings[0].scheduleNote = 'No complete source timing.';
    expect(() => scheduleCsv(c, ['o'])).toThrow('Cannot export');
    expect(() => scheduleIcs(c, ['o'], '2026-10-26')).toThrow('Cannot export');
    delete c.offerings[0].scheduleStatus;
    delete c.offerings[0].scheduleNote;
    c.offerings[0].pairingStatus = 'unresolved';
    expect(() => scheduleCsv(c, ['o'])).toThrow('unresolved components');
  });

  it('rejects a backup catalog with duplicate offering IDs instead of ambiguously matching', () => {
    const c = fixture();
    c.offerings.push({ ...c.offerings[0], courseId: 'c', section: 'other section' });
    const p: Plan = { id: 'p', name: 'Fixture plan', offeringIds: ['o'], savedAt: '2026-01-01', semester: c.semester, catalogFingerprint: catalogFingerprint(c) };
    expect(() => restorePlans([p], c)).toThrow();
  });

  it('rejects duplicate selection IDs in a plan backup', () => {
    const c = fixture();
    const p: Plan = { id: 'p', name: 'Fixture plan', offeringIds: ['o', 'o'], savedAt: '2026-01-01', semester: c.semester, catalogFingerprint: catalogFingerprint(c) };
    expect(() => restorePlans([p], c)).toThrow();
  });

  it('keeps calendar dates on the chosen India-time Monday across the year boundary', () => {
    const c = fixture();
    const ics = scheduleIcs(c, ['o'], '2027-01-04');
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20270104T080000');
    expect(ics).not.toContain('DTSTART:20270103');
  });

  it('quotes leading whitespace before formula-like CSV values safely', () => {
    const c = fixture();
    c.courses[0].title = '  =HYPERLINK("x")';
    expect(scheduleCsv(c, ['o'])).toContain('"\'  =HYPERLINK(""x"")"');
  });
});

