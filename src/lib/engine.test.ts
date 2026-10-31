import { describe, expect, it } from 'vitest';
import type { Catalog, Component, Offering, Preferences } from './types';
import { conflicts, defaultPreferences, generateSchedules, getConflicts } from './engine';

// Synthetic fixtures only; these are not production course or slot records.
const component = (start = 540, end = 600, day: 0 | 1 = 0, slot = 'A', type: Component['type'] = 'theory'): Component => ({ type, slots: [slot], meetings: [{ day, start, end, slot }] });
const offering = (id: string, courseId = id, components = [component()], facultyId = 'f1'): Offering => ({ id, courseId, section: id, facultyId, components });
function catalog(offerings: Offering[]): Catalog {
  return {
    version: 1, campus: 'Vellore', semester: 'test', provenance: { source: 'synthetic test', importedAt: '', status: 'imported' },
    courses: [...new Set(offerings.map(o => o.courseId))].map(id => ({ id, code: id, title: id, credits: 1 })),
    faculty: [{ id: 'f1', name: 'Test One' }, { id: 'f2', name: 'Test Two' }], offerings, reviews: [],
  };
}
const prefs = (patch: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, ...patch });

describe('actual meeting collisions', () => {
  it('detects overlap across different slot names, including contained intervals', () => {
    expect(conflicts(offering('a'), offering('b', 'b', [component(550, 570, 0, 'Z')]))).toBe(true);
  });
  it('uses half-open intervals and distinct days', () => {
    expect(conflicts(offering('a'), offering('b', 'b', [component(600, 660)]))).toBe(false);
    expect(conflicts(offering('a'), offering('b', 'b', [component(540, 600, 1)]))).toBe(false);
  });
  it('requires a ten-minute gap between offerings on the same day', () => {
    const a = offering('a');
    for (const gap of [0, 5, 9]) {
      const b = offering('b', 'b', [component(600 + gap, 660 + gap)]);
      expect(conflicts(a, b)).toBe(false);
      expect(generateSchedules(catalog([a, b]), ['a', 'b'], prefs()).schedules).toHaveLength(0);
    }
    const b = offering('b', 'b', [component(610, 670)]);
    expect(generateSchedules(catalog([a, b]), ['a', 'b'], prefs()).schedules).toHaveLength(1);
    expect(generateSchedules(catalog([a, offering('b', 'b', [component(600, 660, 1)])]), ['a', 'b'], prefs()).schedules).toHaveLength(1);
  });
  it('allows consecutive slots within a single offering', () => {
    const lab = offering('lab', 'lab', [component(540, 600, 0, 'L1', 'lab'), component(600, 660, 0, 'L2', 'lab')]);
    expect(generateSchedules(catalog([lab]), ['lab'], prefs()).schedules).toHaveLength(1);
  });
  it('checks lab and tutorial meetings as well as theory, returning one pair', () => {
    const a = offering('a', 'a', [component(), component(780, 840, 1, 'L1', 'lab')]);
    const b = offering('b', 'b', [component(800, 850, 1, 'T1', 'tutorial')]);
    expect(conflicts(a, b)).toBe(true);
    expect(getConflicts([a, b, offering('c', 'c', [component(900, 960)])])).toEqual([{ a: 'a', b: 'b' }]);
  });
});

describe('schedule generation', () => {
  it('returns multiple alternatives with each course once, independent of input order', () => {
    const data = catalog([offering('a2', 'a'), offering('b1', 'b', [component(610, 670)]), offering('a1', 'a')]);
    const result = generateSchedules(data, ['b', 'a', 'a'], prefs());
    expect(result.schedules.map(s => s.offeringIds)).toEqual([['a1', 'b1'], ['a2', 'b1']]);
    expect(result.message).toContain('Duplicate');
    expect(result.truncated).toBe(false);
    expect(generateSchedules({ ...data, offerings: [...data.offerings].reverse() }, ['a', 'b'], prefs()).schedules).toEqual(result.schedules);
  });
  it('returns explicit empty and missing-course diagnostics', () => {
    expect(generateSchedules(catalog([]), [], prefs()).message).toContain('Select');
    expect(generateSchedules(catalog([]), ['unknown'], prefs()).message).toContain('missing');
  });
  it('reports impossible combinations without pretending soft preferences are constraints', () => {
    const result = generateSchedules(catalog([offering('a'), offering('b')]), ['a', 'b'], prefs({ freeDays: [0], timeOfDay: 'afternoon' }));
    expect(result.schedules).toEqual([]);
    expect(result.message).toContain('No clash-free');
    expect(result.explored).toBe(2);
  });
  it('honors explicit allowed offerings, including an empty allowed set', () => {
    const data = catalog([offering('a1', 'a'), offering('a2', 'a')]);
    expect(generateSchedules(data, ['a'], prefs(), { a: ['a2'] }).schedules[0].offeringIds).toEqual(['a2']);
    expect(generateSchedules(data, ['a'], prefs(), { a: [] }).message).toContain('No complete allowed');
    expect(generateSchedules(data, ['a'], prefs(), { a: ['unknown'] }).schedules).toEqual([]);
  });
  it('rejects missing components, partial slots, invalid intervals, and internal collisions', () => {
    const invalid = [
      offering('empty', 'a', []),
      offering('missing', 'a', [{ type: 'lab', slots: ['L'], meetings: [] }]),
      offering('partial', 'a', [{ ...component(), slots: ['A', 'B'] }]),
      offering('nan', 'a', [component(NaN, 600)]),
      offering('zero', 'a', [component(600, 600)]),
      offering('negative', 'a', [component(-1, 600)]),
      offering('late', 'a', [component(1400, 1500)]),
      offering('unknown-slot', 'a', [{ ...component(), slots: ['B'] }]),
      offering('bad-day', 'a', [{ ...component(), meetings: [{ day: 7, start: 540, end: 600, slot: 'A' }] } as unknown as Component]),
      offering('internal', 'a', [component(), component(550, 620, 0, 'L', 'lab')]),
    ];
    for (const bad of invalid) {
      const result = generateSchedules(catalog([bad]), ['a'], prefs());
      expect(result.schedules, bad.id).toEqual([]);
      expect(result.message, bad.id).toContain('malformed');
    }
  });
  it('keeps linked theory/lab offerings indivisible', () => {
    const data = catalog([
      offering('linked', 'a', [component(), component(780, 840, 1, 'L', 'lab')]),
      offering('b', 'b', [component(800, 830, 1)]),
    ]);
    expect(generateSchedules(data, ['a', 'b'], prefs()).schedules).toEqual([]);
  });
  it('rejects theory and lab components in the same half even with any batch preference', () => {
    const invalidPair = offering('same-half', 'a', [
      component(540, 590, 0, 'T', 'theory'),
      component(600, 660, 1, 'L', 'lab'),
    ]);
    expect(generateSchedules(catalog([invalidPair]), ['a'], prefs({ theoryBatch: 'any' })).schedules).toEqual([]);
  });
  it('rejects ambiguous offering and course identifiers', () => {
    const data = catalog([offering('same', 'a'), offering('same', 'a')]);
    expect(generateSchedules(data, ['a'], prefs()).schedules).toEqual([]);
    data.courses.push(data.courses[0]);
    expect(generateSchedules(data, ['a'], prefs()).message).toContain('ambiguous');
  });
  it('ranks morning and afternoon choices and explains unmet preferences', () => {
    const data = catalog([offering('am', 'a'), offering('pm', 'a', [component(780, 840)])]);
    expect(generateSchedules(data, ['a'], prefs({ timeOfDay: 'morning' })).schedules[0].offeringIds).toEqual(['am']);
    const result = generateSchedules(data, ['a'], prefs({ timeOfDay: 'afternoon' }));
    expect(result.schedules[0].offeringIds).toEqual(['pm']);
    expect(result.schedules[1].reasons.join(' ')).toContain('partly unmet');
  });
  it('ranks free days and gap compactness', () => {
    const data = catalog([offering('day0', 'a'), offering('day1', 'a', [component(540, 600, 1)])]);
    expect(generateSchedules(data, ['a'], prefs({ freeDays: [0] })).schedules[0].offeringIds).toEqual(['day1']);
    const gaps = catalog([offering('a'), offering('far', 'b', [component(840, 900)]), offering('near', 'b', [component(610, 670)])]);
    const result = generateSchedules(gaps, ['a', 'b'], prefs({ minClassGap: 0 }));
    expect(result.schedules[0].offeringIds).toEqual(['a', 'near']);
    expect(result.schedules[0].reasons).toContain('10 minutes of gaps between meetings; compactness preference partly unmet.');
    expect(result.schedules[0].score).toBeGreaterThan(result.schedules[1].score);
  });
  it('treats the requested class gap as a ranking preference, not a feasibility rule', () => {
    const data = catalog([offering('a'), offering('short-gap', 'b', [component(610, 670)])]);
    const defaultGap = generateSchedules(data, ['a', 'b'], prefs({ compactness: 0 }));
    expect(defaultGap.schedules).toHaveLength(1);
    const longerGap = generateSchedules(data, ['a', 'b'], prefs({ compactness: 0, minClassGap: 30 }));
    expect(longerGap.schedules).toHaveLength(1);
    expect(longerGap.schedules[0].reasons).toContain('20 minutes short of your requested between-class gap.');
  });
  it('ranks faculty including component faculty and ignores source ratings for validity and scores', () => {
    const data = catalog([offering('f1-section', 'a'), offering('f2-section', 'a', [component()], 'f2')]);
    const preference = prefs({ facultyOrder: ['f2', 'f1'] });
    const before = generateSchedules(data, ['a'], preference);
    expect(before.schedules[0].offeringIds).toEqual(['f2-section']);
    data.reviews.push({ id: 'review', facultyId: 'f1', rating: 999, date: '', source: 'test', sampleSize: 1 });
    expect(generateSchedules(data, ['a'], preference)).toEqual(before);
    data.offerings[0].components[0].facultyId = 'f2';
    expect(generateSchedules(data, ['a'], preference).schedules.find(s => s.offeringIds[0] === 'f1-section')?.reasons.join(' ')).toContain('2/2 faculty');
  });
  it('searches beyond maxResults to retain the best, and caps malformed limits', () => {
    const data = catalog([offering('a-am', 'a'), offering('z-pm', 'a', [component(780, 840)])]);
    const result = generateSchedules(data, ['a'], prefs({ timeOfDay: 'afternoon', maxResults: 1 }));
    expect(result.schedules[0].offeringIds).toEqual(['z-pm']);
    expect(result.truncated).toBe(false);
    expect(result.message).toContain('best 1 of 2');
    expect(generateSchedules(data, ['a'], prefs({ maxResults: 0 })).schedules).toHaveLength(1);
    expect(generateSchedules(data, ['a'], prefs({ maxResults: NaN })).schedules).toHaveLength(2);
  });
  it('bounds search deterministically and reports incomplete ranking', () => {
    const offerings = Array.from({ length: 8 }, (_, day) => Array.from({ length: 5 }, (_, section) => offering(`${day}-${section}`, `course-${day}`, [component(480 + day * 70, 540 + day * 70)]))).flat();
    const data = catalog(offerings);
    const ids = data.courses.map(c => c.id);
    const result = generateSchedules(data, ids, prefs({ maxResults: 3 }));
    expect(result.truncated).toBe(true);
    expect(result.explored).toBe(50_000);
    expect(result.schedules).toHaveLength(3);
    expect(result.message).toContain('only explored');
    expect(generateSchedules(data, ids.reverse(), prefs({ maxResults: 3 }))).toEqual(result);
    result.schedules.forEach(s => expect(getConflicts(s.offeringIds.map(id => offerings.find(o => o.id === id)!))).toEqual([]));
  });
  it('does not report truncation when exactly the node bound completes the search', () => {
    const data = catalog(Array.from({ length: 50_000 }, (_, i) => offering(`a-${i}`, 'a')));
    const result = generateSchedules(data, ['a'], prefs({ maxResults: 1 }));
    expect(result.explored).toBe(50_000);
    expect(result.truncated).toBe(false);
  });
});

it('returns fresh alternatives when previous schedules are excluded', () => {
  const data = catalog([offering('a1', 'a'), offering('a2', 'a')]);
  const first = generateSchedules(data, ['a'], { ...defaultPreferences, maxResults: 1 });
  const next = generateSchedules(data, ['a'], { ...defaultPreferences, maxResults: 1 }, undefined, [], first.schedules.map(s => s.offeringIds));
  expect(next.schedules).toHaveLength(1);
  expect(next.schedules[0].offeringIds).not.toEqual(first.schedules[0].offeringIds);
});

it('offers different calendar layouts rather than duplicate faculty sections', () => {
  const data = catalog([
    offering('a1', 'a'), offering('a2', 'a'),
    offering('a3', 'a', [component(840, 900)]),
  ]);
  const first = generateSchedules(data, ['a'], prefs({ maxResults: 1 }), undefined, [], [], true);
  const next = generateSchedules(data, ['a'], prefs({ maxResults: 1 }), undefined, [], first.schedules.map(s => s.offeringIds), true);
  expect(first.schedules[0].offeringIds).toEqual(['a1']);
  expect(next.schedules[0].offeringIds).toEqual(['a3']);
  expect(generateSchedules(data, ['a'], prefs(), undefined, [], [], true).schedules).toHaveLength(2);
});


it('spreads alternatives across course times instead of changing only the last course', () => {
  const offerings = ['a', 'b', 'c'].flatMap((course, index) => [
    offering(`${course}1`, course, [component(540 + index * 70, 600 + index * 70)]),
    offering(`${course}2`, course, [component(840 + index * 70, 900 + index * 70)]),
  ]);
  const data = catalog(offerings);
  const result = generateSchedules(data, ['a', 'b', 'c'], prefs({ compactness: 0, minClassGap: 0, maxResults: 3 }), undefined, [], [], true);
  expect(result.schedules[0].offeringIds).toEqual(['a1', 'b1', 'c1']);
  expect(result.schedules[1].offeringIds).toEqual(['a2', 'b2', 'c2']);
  expect(result.schedules).toHaveLength(3);
  expect(new Set(result.schedules.map(s => s.offeringIds.join(','))).size).toBe(3);
  result.schedules.forEach(s => expect(getConflicts(s.offeringIds.map(id => offerings.find(o => o.id === id)!))).toEqual([]));
  const next = generateSchedules(data, ['a', 'b', 'c'], prefs({ compactness: 0, minClassGap: 0, maxResults: 1 }), undefined, [], [result.schedules[0].offeringIds], true);
  expect(next.schedules[0].offeringIds).toEqual(['a2', 'b2', 'c2']);
  expect(generateSchedules({ ...data, offerings: [...offerings].reverse() }, ['c', 'b', 'a'], prefs({ compactness: 0, minClassGap: 0, maxResults: 3 }), undefined, [], [], true)).toEqual(result);
});


it.each(['morning', 'evening'] as const)('keeps standalone labs in either half for %s theory', theoryBatch => {
  const data = catalog([
    offering('theory', 't', [component(theoryBatch === 'morning' ? 540 : 900, theoryBatch === 'morning' ? 600 : 960)]),
    offering('lab-am', 'l', [component(600, 660, 1, 'L1', 'lab')]),
    offering('lab-pm', 'l', [component(840, 900, 1, 'L2', 'lab')]),
  ]);
  const result = generateSchedules(data, ['t', 'l'], prefs({ theoryBatch }), undefined, [], [], true);
  expect(result.schedules).toHaveLength(2);
  expect(result.schedules.flatMap(s => s.offeringIds)).toContain('lab-am');
  expect(result.schedules.flatMap(s => s.offeringIds)).toContain('lab-pm');
  expect(result.message).toContain('only one available time layout');
});

it('keeps a pinned theory/lab offering together across generated alternatives', () => {
  const pinned = offering('pinned', 'a', [component(540, 600), component(840, 900, 1, 'L1', 'lab')]);
  const data = catalog([pinned, offering('replacement', 'a'), offering('b1', 'b', [component(610, 670)]), offering('b2', 'b', [component(900, 960)])]);
  const result = generateSchedules(data, ['a', 'b'], prefs(), { a: [pinned.id] }, [], [], true);
  expect(result.schedules).toHaveLength(2);
  result.schedules.forEach(schedule => {
    expect(schedule.offeringIds).toContain('pinned');
    expect(schedule.offeringIds).not.toContain('replacement');
  });
});


it('prefers a different period over a tiny time shift when course-change counts tie', () => {
  const data = catalog([
    offering('original', 'a', [component(540, 600)]),
    offering('small-shift', 'a', [component(545, 605)]),
    offering('different-period', 'a', [component(900, 960)]),
  ]);
  const result = generateSchedules(data, ['a'], prefs({ maxResults: 1, compactness: 0 }),
    undefined, [], [['original']], true);
  expect(result.schedules[0].offeringIds).toEqual(['different-period']);
});
