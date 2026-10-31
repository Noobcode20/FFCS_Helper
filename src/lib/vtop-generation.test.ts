import { expect, it } from 'vitest';
import { defaultCatalog } from '../data/catalog';
import { defaultPreferences, generateSchedules } from './engine';
import { vtopOfferings } from '../data/vtop';
import allocationSnapshot from '../../data/vtop-schedules-winter-2026-27.json';

const halfOf = (component: { meetings: { start: number; end: number }[] }) => {
  if (component.meetings.length && component.meetings.every(m => m.start >= 480 && m.start < 840 && m.end <= 840)) return 'morning';
  if (component.meetings.length && component.meetings.every(m => m.start >= 840 && m.end <= 1190)) return 'afternoon';
  return undefined;
};

it('generates current theory allocations with every recurring chart period', () => {
  const result = generateSchedules(defaultCatalog, ['ECE-PCC-BAECE101'], defaultPreferences);
  expect(result.schedules.length).toBeGreaterThan(0);
  const offering = defaultCatalog.offerings.find(o => o.id === result.schedules[0].offeringIds[0])!;
  const component = offering.components[0];
  expect(component.slots.every(slot => component.meetings.some(m => m.slot === slot))).toBe(true);
  const a1 = defaultCatalog.offerings.find(o => o.courseId === 'ECE-PCC-BAECE101' && o.section === 'A1+TA1+TAA1')!;
  expect(a1.components[0].meetings.filter(m => m.slot === 'A1').map(m => m.day).sort()).toEqual([0, 2]);
});

it('pairs a unique theory and lab allocation while keeping their slots, venues, and meetings component-specific', () => {
  const paired = vtopOfferings.find(o => o.courseId === 'ECE-UCC-BAARB101' && o.components.length === 2)!;
  expect(paired.section).toBe('TAA1 / L31+L32');
  expect(paired.components.map(c => [c.type, c.slots, c.venue])).toEqual([
    ['theory', ['TAA1'], 'PRP134'], ['lab', ['L31+L32'], 'PRP555'],
  ]);
  expect(paired.components[0].meetings.every(m => m.slot === 'TAA1')).toBe(true);
  expect(paired.components[1].meetings).toEqual([{ day: 0, start: 840, end: 940, slot: 'L31+L32' }]);
  expect(paired.components[0].meetings.every(m => m.day !== 0 || m.start !== 840)).toBe(true);
});

it('pairs repeated same-faculty rows only across opposite chart halves', () => {
  const rows = vtopOfferings.filter(o => o.courseId === 'ECE-UCC-BACHI101' && o.facultyId === 'vtop-faculty-khana-baidya');
  expect(rows).toHaveLength(2);
  expect(rows.map(o => o.components.map(c => [c.type, c.slots, c.venue]))).toEqual([
    [[ 'theory', ['TAA2'], 'TT204' ], [ 'lab', ['L27+L28'], 'PRP555' ]],
    [[ 'theory', ['TAA1'], 'TT630' ], [ 'lab', ['L47+L48'], 'TT318' ]],
  ]);
  const ambiguous = vtopOfferings.filter(o => o.courseId === 'ECE-UCC-BAGER101' && o.facultyId === 'vtop-faculty-arati-kumari');
  expect(ambiguous).toHaveLength(4);
  expect(ambiguous.every(o => o.components.length === 1)).toBe(true);
  expect(ambiguous.every(o => o.pairingStatus === 'unresolved')).toBe(true);
});

it('offers each lab as an alternative for a single theory allocation and excludes unresolved rows from generation', () => {
  const choices = vtopOfferings.filter(o => o.courseId === 'ECE-PCC-BAECE204' && o.facultyId === 'vtop-faculty-elakkiya-p');
  expect(choices).toHaveLength(2);
  expect(choices.map(o => o.components.map(c => [c.type, c.slots, c.venue]))).toEqual([
    [[ 'theory', ['G1', 'TG1'], 'TT524' ], [ 'lab', ['L43+L44'], 'TT601' ]],
    [[ 'theory', ['G1', 'TG1'], 'TT524' ], [ 'lab', ['L53+L54'], 'TT601' ]],
  ]);
  expect(choices.every(o => !o.pairingStatus)).toBe(true);

  const unresolved = vtopOfferings.find(o => o.courseId === 'ECE-UCC-BAGER101' && o.facultyId === 'vtop-faculty-arati-kumari' && o.pairingStatus === 'unresolved')!;
  const result = generateSchedules({ ...defaultCatalog, offerings: [unresolved] }, [unresolved.courseId], defaultPreferences);
  expect(result.schedules).toEqual([]);
});

it('pairs RAVI S BAECE102 labs to the opposite-half theory and offers each lab separately', () => {
  const courseId = 'ECE-PCC-BAECE102';
  const facultyId = 'vtop-faculty-ravi-s';
  const choices = vtopOfferings.filter(o => o.courseId === courseId && o.facultyId === facultyId && o.components.length === 2);
  expect(choices).toHaveLength(4);
  expect(choices.map(o => [o.components[0].slots.join('+'), o.components[0].venue, o.components[1].slots[0], o.components[1].venue])).toEqual([
    ['E1+TE1', 'TT302', 'L35+L36', 'SJT203'],
    ['E1+TE1', 'TT302', 'L49+L50', 'SJT203'],
    ['E2+TE2', 'TT301', 'L5+L6', 'SJT203'],
    ['E2+TE2', 'TT301', 'L27+L28', 'SJT203'],
  ]);
  expect(choices.every(o => !o.pairingStatus && !o.scheduleStatus && halfOf(o.components[0]) !== halfOf(o.components[1]))).toBe(true);
  const generated = generateSchedules(defaultCatalog, [courseId], { ...defaultPreferences, maxResults: 5 }, { [courseId]: choices.map(o => o.id) });
  expect(generated.schedules).toHaveLength(4);
  expect(vtopOfferings.filter(o => o.components.some(c => c.type === 'theory') && o.components.some(c => c.type === 'lab'))
    .every(o => o.pairingStatus === 'unresolved' || o.scheduleStatus === 'browse-only' || halfOf(o.components.find(c => c.type === 'theory')!) !== halfOf(o.components.find(c => c.type === 'lab')!))).toBe(true);
});

it('maps Lab Only allocations into exact same-day blocks without collapsing separate days', () => {
  const offering = vtopOfferings.find(o => o.courseId === 'ECE-UCC-BACSE102' && o.section === 'L3+L4+L19+L20')!;
  expect(offering.components).toHaveLength(1);
  expect(offering.components[0].type).toBe('lab');
  expect(offering.components[0].sourceType).toBe('LO');
  expect(offering.section).toBe('L3+L4+L19+L20');
  expect(offering.components[0].slots).toEqual(['L3+L4', 'L19+L20']);
  expect(offering.components[0].meetings).toEqual([
    { day: 0, start: 591, end: 690, slot: 'L3+L4' },
    { day: 3, start: 480, end: 580, slot: 'L19+L20' },
  ]);
  expect(offering.scheduleStatus).toBeUndefined();
  for (const lo of vtopOfferings.flatMap(o => o.components.filter(c => c.sourceType === 'LO').map(c => ({ o, c })))) {
    if (lo.o.scheduleStatus === 'browse-only') continue;
    expect(lo.c.meetings.flatMap(meeting => meeting.slot.split('+')).sort()).toEqual(lo.o.section.split('+').sort());
  }
});

it('maps all four ECM Structured and Object-Oriented Programming lab slots to their grid periods', () => {
  const labs = vtopOfferings.filter(o => o.courseId === 'ECM-PCC-BACSE104').flatMap(o => o.components.filter(c => c.sourceType === 'ELA'));
  expect(labs.length).toBeGreaterThan(0);
  const source = allocationSnapshot.courses.find(c => c.account === 'ECM' && c.category === 'PCC' && c.courseCode === 'BACSE104')!;
  const sourceSlots = source.allocations.filter(a => a.courseType === 'ELA').map(a => a.slotDetail.split('+').sort().join('+'));
  expect(new Set(labs.map(lab => lab.meetings.flatMap(m => m.slot.split('+')).sort().join('+')))).toEqual(new Set(sourceSlots));
  for (const lab of labs) {
    expect(lab.meetings.flatMap(m => m.slot.split('+')).sort()).toEqual(lab.slots.flatMap(s => s.split('+')).sort());
    expect(lab.meetings.flatMap(m => m.slot.split('+'))).toHaveLength(4);
  }
  const jenila = vtopOfferings.find(o => o.courseId === 'ECM-PCC-BACSE104' && o.facultyId === 'vtop-faculty-jenila-vincent-m' && o.components.some(c => c.sourceType === 'ELA'))!;
  expect(jenila.components.find(c => c.sourceType === 'ELA')!.meetings).toEqual([
    { day: 0, start: 1060, end: 1160, slot: 'L35+L36' },
    { day: 4, start: 840, end: 940, slot: 'L55+L56' },
  ]);
});

it('uses official lab intervals and source type to distinguish theory clocks', () => {
  const theory = vtopOfferings.find(o => o.courseId === 'ECE-UCC-BAARB101' && o.components.length === 2)!.components[0];
  const lab = vtopOfferings.find(o => o.courseId === 'ECE-UCC-BAARB101' && o.components.length === 2)!.components[1];
  expect(theory.meetings).toEqual([{ day: 1, start: 720, end: 770, slot: 'TAA1' }]);
  expect(lab.meetings).toEqual([{ day: 0, start: 840, end: 940, slot: 'L31+L32' }]);
});
