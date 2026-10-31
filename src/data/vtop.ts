import snapshot from '../../data/vtop-schedules-winter-2026-27.json';
import slotTemplate from '../../data/vtop-slot-template-vellore-2026-10-30.json';
import type { Offering } from '../lib/types';

type Allocation = { slotDetail: string; venue: string; faculty: string; courseType: string; scheduleGroup: string };
type Snapshot = {
  snapshot: { semester: string; extractedAt: string; slotTimingStatus: string; accounts: { label: string }[] };
  courses: { account: string; category: string; categoryName: string; courseCode: string; courseTitle: string; allocations: Allocation[] }[];
};

const data = snapshot as Snapshot;
export const allocationSnapshot = data.snapshot;
export const vtopCourses = [...new Map(data.courses.map((course) => {
  const id = `${course.account}-${course.category}-${course.courseCode}`;
  return [id, { id, code: course.courseCode, title: course.courseTitle, category: course.category, categoryName: course.categoryName, account: course.account, credits: null as number | null }];
})).values()].sort((a, b) => (a.account ?? '').localeCompare(b.account ?? '') || a.category.localeCompare(b.category) || a.code.localeCompare(b.code));
const normalizeFacultyWhitespace = (name: string) => name.trim().replace(/\s+/g, ' ');
export const vtopFaculty = (() => {
  const names = new Set(data.courses.flatMap((course) => course.allocations.map((allocation) => normalizeFacultyWhitespace(allocation.faculty)).filter(Boolean)));
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({
    id: `vtop-faculty-${name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
  }));
})();
const facultyIdByName = new Map(vtopFaculty.map((faculty) => [normalizeFacultyWhitespace(faculty.name), faculty.id]));
const typeByCode: Record<string, 'theory' | 'lab' | 'tutorial' | 'project'> = { ETH: 'theory', TH: 'theory', ELA: 'lab', LO: 'lab', OC: 'project', SS: 'project' };
// VTOP's generic template was displayed for Fall 2026-27. It establishes the
// slot clock grid, not Winter registration or Winter-specific availability.
type TemplateSlot = { slot: string | null; start: string; end: string };
type TemplateDay = { day: string; theory: TemplateSlot[]; lab: TemplateSlot[] };
const template = slotTemplate as { displayedSemester: string; capturedAt: string; sourceUrl: string; days: TemplateDay[] };
export const vtopSlotTemplateProvenance = { source: 'VTOP generic slot template', displayedSemester: template.displayedSemester, capturedAt: template.capturedAt, sourceUrl: template.sourceUrl };
const clockMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const asDay = (day: number) => day as 0 | 1 | 2 | 3 | 4 | 5 | 6;
const grid = new Map<string, { day: number; column: number; start: number; end: number }[]>();
for (const [day, record] of template.days.entries()) for (const kind of ['theory', 'lab'] as const) {
  record[kind].forEach((row, column) => {
    if (!row.slot || !/^\d\d:\d\d$/.test(row.start) || !/^\d\d:\d\d$/.test(row.end)) return;
    grid.set(`${kind}:${row.slot}`, [...(grid.get(`${kind}:${row.slot}`) ?? []), { day, column, start: clockMinutes(row.start), end: clockMinutes(row.end) }]);
  });
}
const meetingsFor = (slotDetail: string, type: 'theory' | 'lab' | 'tutorial' | 'project') => {
  const slots = slotDetail.split('+');
  const kind = type === 'lab' ? 'lab' : 'theory';
  const mapped = slots.map(slot => ({ slot, timing: grid.get(`${kind}:${slot}`) }));
  if (mapped.some(({ timing }) => !timing?.length)) return [];
  const periods = mapped.flatMap(({ slot, timing }) => timing!.map(value => ({ ...value, slot })));
  if (type !== 'lab') return periods.map(period => ({ day: asDay(period.day), start: period.start, end: period.end, slot: period.slot }));
  periods.sort((a, b) => a.day - b.day || a.column - b.column);
  const blocks: typeof periods[] = [];
  for (const period of periods) {
    const block = blocks.at(-1);
    const previous = block?.at(-1);
    if (block && previous && previous.day === period.day && previous.column + 1 === period.column) block.push(period);
    else blocks.push([period]);
  }
  return blocks.map(block => ({ day: asDay(block[0].day), start: Math.min(...block.map(period => period.start)), end: Math.max(...block.map(period => period.end)), slot: block.map(period => period.slot).join('+') }));
};
type DayHalf = 'morning' | 'afternoon';
const halfFor = (allocation: Allocation): DayHalf | undefined => {
  const type = typeByCode[allocation.courseType];
  if (type !== 'theory' && type !== 'lab') return undefined;
  const meetings = meetingsFor(allocation.slotDetail, type);
  if (!meetings.length) return undefined;
  if (meetings.every(meeting => meeting.start >= 480 && meeting.start < 840 && meeting.end <= 840)) return 'morning';
  if (meetings.every(meeting => meeting.start >= 840 && meeting.end <= 1190)) return 'afternoon';
  return undefined;
};
const markBrowseOnly = (offering: Offering): Offering => {
  const missingTimes = offering.components.some(component => !component.meetings.length || component.slots.some(slot => !component.meetings.some(meeting => meeting.slot === slot)));
  const meetings = offering.components.flatMap(component => component.meetings);
  const overlappingTimes = meetings.some((left, index) => meetings.slice(index + 1).some(right => left.day === right.day && left.start < right.end && right.start < left.end));
  const unmappedTypes = offering.components.map(component => component.sourceType).filter((type): type is string => !!type && !['ETH', 'ELA', 'TH', 'LO', 'SS'].includes(type));
  if (!missingTimes && !overlappingTimes && !unmappedTypes.length) return offering;
  const blockers = [
    ...(missingTimes ? ['missing-times' as const] : []),
    ...(overlappingTimes ? ['overlapping-times' as const] : []),
    ...(unmappedTypes.length ? ['unmapped-source-type' as const] : []),
  ];
  const notes = [
    ...(missingTimes ? ['One or more component slot times are unavailable.'] : []),
    ...(overlappingTimes ? ['The VTOP generic slot template maps components to overlapping times.'] : []),
    ...(unmappedTypes.length ? [`Source course type ${[...new Set(unmappedTypes)].join(', ')} has no confirmed scheduler component mapping.`] : []),
  ];
  return { ...offering, scheduleStatus: 'browse-only', scheduleNote: notes.join(' '), scheduleBlockers: blockers };
};
export const vtopOfferings = data.courses.flatMap((course) => {
  const courseId = `${course.account}-${course.category}-${course.courseCode}`;
  const used = new Set<number>();
  const hasTheoryAndLab = course.allocations.some(a => a.courseType === 'ETH') && course.allocations.some(a => a.courseType === 'ELA');
  const components = (allocation: Allocation) => {
    const type = typeByCode[allocation.courseType] ?? 'project';
    const labBlocks = type === 'lab' ? meetingsFor(allocation.slotDetail, 'lab') : [];
    return [{
    type,
    sourceType: allocation.courseType,
    slots: type === 'lab' && labBlocks.length ? labBlocks.map(meeting => meeting.slot) : allocation.slotDetail.split('+'),
    meetings: type === 'lab' ? labBlocks : meetingsFor(allocation.slotDetail, type),
    facultyId: facultyIdByName.get(normalizeFacultyWhitespace(allocation.faculty)),
    venue: allocation.venue === 'NIL' ? undefined : allocation.venue,
  }];
  };
  const offerings: Offering[] = [];
  // Source rows identify same-faculty allocations. The user confirmed theory
  // and lab must be opposite halves of the day; a unique theory in a half can
  // therefore pair with each lab option in the other half. Multiple theories
  // in one half or unknown halves stay unresolved rather than cross-producted.
  const byFaculty = new Map<string, number[]>();
  course.allocations.forEach((allocation, index) => {
    if (allocation.courseType !== 'ETH' && allocation.courseType !== 'ELA') return;
    const facultyKey = normalizeFacultyWhitespace(allocation.faculty);
    const group = byFaculty.get(facultyKey) ?? [];
    group.push(index);
    byFaculty.set(facultyKey, group);
  });
  for (const [faculty, indices] of byFaculty) {
    const theoryIndices = indices.filter(index => course.allocations[index].courseType === 'ETH');
    const labIndices = indices.filter(index => course.allocations[index].courseType === 'ELA');
    const theoryHalves = theoryIndices.map(index => halfFor(course.allocations[index]));
    const labHalves = new Map(labIndices.map(index => [index, halfFor(course.allocations[index])]));
    const makePair = (theoryIndex: number, labIndex: number) => {
      const theory = course.allocations[theoryIndex], lab = course.allocations[labIndex];
      used.add(theoryIndex); used.add(labIndex);
      offerings.push({
        id: `vtop-${courseId}-${theoryIndex + 1}-${labIndex + 1}`,
        courseId, facultyId: facultyIdByName.get(normalizeFacultyWhitespace(faculty))!,
        section: `${theory.slotDetail} / ${lab.slotDetail}`,
        components: [...components(theory), ...components(lab)],
      });
    };
    const distinctTheoryHalves = theoryHalves.every((half): half is DayHalf => !!half) && new Set(theoryHalves).size === theoryIndices.length;
    if (!distinctTheoryHalves) continue;
    for (const theoryIndex of theoryIndices) {
      const theoryHalf = halfFor(course.allocations[theoryIndex])!;
      for (const labIndex of labIndices) {
        const labHalf = labHalves.get(labIndex);
        if (labHalf && labHalf !== theoryHalf) makePair(theoryIndex, labIndex);
      }
    }
  }
  course.allocations.forEach((allocation, index) => {
    if (used.has(index)) return;
    offerings.push({
      id: `vtop-${courseId}-${index + 1}`, courseId,
      facultyId: facultyIdByName.get(normalizeFacultyWhitespace(allocation.faculty))!, section: allocation.slotDetail,
      components: components(allocation),
      ...(hasTheoryAndLab && ['ETH', 'ELA'].includes(allocation.courseType) ? { pairingStatus: 'unresolved' as const } : {}),
    });
  });
  return offerings.map(markBrowseOnly);
});
export const facultyAllocations = (() => {
  const byName = new Map<string, { name: string; assignments: { account: string; category: string; categoryName: string; code: string; title: string; slot: string; venue: string; type: string; group: string }[] }>();
  for (const course of data.courses) for (const allocation of course.allocations) {
    const rawName = (allocation as Allocation & { faculty?: string }).faculty;
    const name = rawName?.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const record = byName.get(name) ?? { name, assignments: [] };
    record.assignments.push({ account: course.account, category: course.category, categoryName: course.categoryName, code: course.courseCode, title: course.courseTitle, slot: allocation.slotDetail, venue: allocation.venue, type: allocation.courseType, group: allocation.scheduleGroup });
    byName.set(name, record);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
})();
