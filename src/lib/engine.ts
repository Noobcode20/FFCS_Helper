import type { BlockedWindow, Catalog, Meeting, Offering, Preferences, Schedule } from './types';
import { offeringBlockedBy } from './blocked.ts';
import { buildingFromVenue } from './buildings';

export const defaultPreferences: Preferences = {
  theoryBatch: 'any', timeOfDay: 'any', freeDays: [], compactness: 1, minClassGap: 9, facultyOrder: [], maxResults: 3,
};

// A node is one attempted offering assignment. Search and retained results have
// independent bounds: maxResults never means that the first results are best.
const MAX_EXPLORED = 50_000;
const MAX_RESULTS = 5;
const meetings = (offering: Offering): Meeting[] =>
  (offering.components ?? []).flatMap(component => component.meetings ?? []);
const overlaps = (a: Meeting, b: Meeting): boolean =>
  a.day === b.day && a.start < b.end && b.start < a.end;
type DayHalf = 'morning' | 'afternoon';
function componentDayHalf(component: Offering['components'][number]): DayHalf | undefined {
  const meetings = component.meetings ?? [];
  if (!meetings.length) return undefined;
  if (meetings.every(meeting => meeting.start >= 480 && meeting.start < 840 && meeting.end <= 840)) return 'morning';
  if (meetings.every(meeting => meeting.start >= 840 && meeting.end <= 1190)) return 'afternoon';
  return undefined;
}

/** Slot names are metadata; real half-open time intervals determine clashes. */
export function conflicts(a: Offering, b: Offering): boolean {
  return meetings(a).some(left => meetings(b).some(right => overlaps(left, right)));
}

export function getConflicts(offerings: Offering[]): { a: string; b: string }[] {
  const result: { a: string; b: string }[] = [];
  for (let i = 0; i < offerings.length; i++) {
    for (let j = i + 1; j < offerings.length; j++) {
      if (conflicts(offerings[i], offerings[j])) {
        result.push({ a: offerings[i].id, b: offerings[j].id });
      }
    }
  }
  return result;
}

function validOffering(offering: Offering): boolean {
  if (offering.pairingStatus === 'unresolved' || offering.scheduleStatus === 'browse-only' || !offering.id || !offering.courseId || !offering.facultyId ||
      !Array.isArray(offering.components) || !offering.components.length) return false;
  for (const component of offering.components) {
    if (!component || !['theory', 'lab', 'tutorial', 'project'].includes(component.type) ||
        !Array.isArray(component.slots) || !component.slots.length ||
        component.slots.some(slot => typeof slot !== 'string' || !slot.trim()) ||
        !Array.isArray(component.meetings) || !component.meetings.length) return false;
    for (const meeting of component.meetings) {
      if (!meeting || !Number.isInteger(meeting.day) || meeting.day < 0 || meeting.day > 6 ||
          !Number.isFinite(meeting.start) || !Number.isFinite(meeting.end) ||
          meeting.start < 0 || meeting.end > 1440 || meeting.start >= meeting.end ||
          !component.slots.includes(meeting.slot)) return false;
    }
    // Every declared slot needs a resolved interval; a partial lab is not valid.
    if (component.slots.some(slot => !component.meetings.some(m => m.slot === slot))) return false;
  }
  const all = meetings(offering);
  if (all.some((a, i) => all.slice(i + 1).some(b => overlaps(a, b)))) return false;
  const theories = offering.components.filter(component => component.type === 'theory');
  const labs = offering.components.filter(component => component.type === 'lab');
  if (theories.length && labs.length) {
    const theoryHalves = theories.map(componentDayHalf);
    const labHalves = labs.map(componentDayHalf);
    if (theoryHalves.some(half => !half) || labHalves.some(half => !half)) return false;
    if (theoryHalves.some(theory => labHalves.some(lab => lab === theory))) return false;
  }
  return true;
}

/** Whether an offering has complete, nonambiguous meeting data for scheduling. */
export function isSchedulableOffering(offering: Offering): boolean {
  return validOffering(offering);
}

/** VIT theory batches pair theory and lab components in opposite halves of the day. */
function fitsTheoryBatch(offering: Offering, batch: Preferences['theoryBatch']): boolean {
  if (batch === 'any' || !offering.components.some(component => component.type === 'theory')) return true;
  return offering.components.every(component => {
    if (component.type !== 'theory' && component.type !== 'lab') return true;
    const morning = component.type === 'theory' ? batch === 'morning' : batch === 'evening';
    const start = morning ? 480 : 840;
    const end = morning ? 800 : 1190;
    return component.meetings.every(meeting => meeting.start >= start && meeting.end <= end);
  });
}

function rank(offerings: Offering[], preferences: Preferences, blockedTimes: BlockedWindow[] = []): Schedule {
  const all = offerings.flatMap(meetings);
  const reasons: string[] = [];
  let score = 0;
  const blockedMeetings = all.filter(m => blockedTimes.some(w => w.days.includes(m.day) && m.start < w.end && w.start < m.end)).length;
  score -= blockedMeetings * 10000;
  if (blockedMeetings) reasons.push(`${blockedMeetings} meetings overlap blocked time.`);
  if (preferences.timeOfDay !== 'any') {
    const preferred = all.filter(m => preferences.timeOfDay === 'morning' ? m.end <= 720 : m.start >= 720).length;
    score += 100 * preferred / all.length;
    reasons.push(`${preferred}/${all.length} meetings match ${preferences.timeOfDay} preference${preferred < all.length ? '; time preference partly unmet' : ''}.`);
  }
  const freeDays = [...new Set(preferences.freeDays)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  if (freeDays.length) {
    const met = freeDays.filter(day => !all.some(m => m.day === day)).length;
    score += 100 * met / freeDays.length;
    reasons.push(`${met}/${freeDays.length} requested free days preserved${met < freeDays.length ? '; free-day preference partly unmet' : ''}.`);
  }
  let gaps = 0;
  let gapShortfall = 0;
  for (let day = 0; day <= 6; day++) {
    const daily = all.filter(m => m.day === day).sort((a, b) => a.start - b.start);
    for (let i = 1; i < daily.length; i++) {
      const gap = daily[i].start - daily[i - 1].end;
      gaps += gap;
      const samePeriod = (daily[i - 1].end <= 840 && daily[i].start < 840) || (daily[i - 1].end >= 840 && daily[i].start >= 840);
      if (samePeriod) gapShortfall += Math.max(0, (preferences.minClassGap ?? 0) - gap);
    }
  }
  score -= gapShortfall * 100;
  if (gapShortfall) reasons.push(`${gapShortfall} minutes short of your requested between-class gap.`);
  // compactness is a nonnegative weight; gaps are measured in hours.
  const weight = Number.isFinite(preferences.compactness) ? Math.max(0, preferences.compactness) : 0;
  score -= weight * gaps / 60;
  reasons.push(`${gaps} minutes of gaps between meetings${weight > 0 && gaps > 0 ? '; compactness preference partly unmet' : ''}.`);
  const order = [...new Set(preferences.facultyOrder)];
  if (order.length) {
    const ids = offerings.flatMap(o => [...new Set([o.facultyId, ...o.components.map(c => c.facultyId).filter((id): id is string => !!id)])]);
    let matched = 0;
    for (const id of ids) {
      const index = order.indexOf(id);
      if (index >= 0) { matched++; score += 100 * (order.length - index) / order.length / ids.length; }
    }
    reasons.push(`${matched}/${ids.length} faculty assignments match your preference list${matched < ids.length ? '; faculty preference partly unmet' : ''}.`);
  }
  const preferred = new Set(preferences.preferredFaculty ?? []);
  const blocked = new Set(preferences.blockedFaculty ?? []);
  const facultyIds = offerings.flatMap(o => [o.facultyId, ...o.components.map(c => c.facultyId).filter((id): id is string => !!id)]);
  if (preferred.size) score += 100 * facultyIds.filter(id => preferred.has(id)).length / facultyIds.length;
  score -= 100 * facultyIds.filter(id => blocked.has(id)).length / facultyIds.length;
  const buildings = new Set((preferences.preferredBuildings ?? []).map(value => buildingFromVenue(value)).filter(Boolean));
  if (buildings.size) {
    const venues = offerings.flatMap(o => o.components.map(c => c.venue).filter((v): v is string => !!v));
    const matched = venues.filter(v => buildings.has(buildingFromVenue(v))).length;
    score += 100 * matched / Math.max(1, venues.length);
    reasons.push(`${matched}/${venues.length} rooms are in preferred buildings.`);
  }
  return { offeringIds: offerings.map(o => o.id), score, reasons };
}

const compare = (a: Schedule, b: Schedule): number =>
  b.score - a.score || compareText(JSON.stringify(a.offeringIds), JSON.stringify(b.offeringIds));
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Preferences are soft ranking criteria. Only valid complete offerings enter DFS.
 * The contract cannot express an absent required component (e.g. a lab omitted
 * entirely by an importer); declared components/slots must all be resolved.
 */
export function generateSchedules(
  catalog: Catalog, courseIds: string[], preferences: Preferences,
  allowedOfferingIds?: Record<string, string[]>,
  blockedTimes: BlockedWindow[] = [],
  excludedSchedules: string[][] = [],
  distinctLayouts = false,
): { schedules: Schedule[]; truncated: boolean; explored: number; message?: string } {
  const notes: string[] = [];
  const ids = [...new Set(courseIds)].sort(compareText);
  const empty = (message: string) => ({ schedules: [], truncated: false, explored: 0, message });
  if (!ids.length) return empty('Select at least one course.');
  if (ids.length !== courseIds.length) notes.push('Duplicate course selections were removed.');
  if (ids.some(id => catalog.courses.filter(c => c.id === id).length !== 1)) return empty('Selected courses are missing or have ambiguous catalog IDs.');
  const counts = new Map<string, number>();
  catalog.offerings.forEach(o => counts.set(o.id, (counts.get(o.id) ?? 0) + 1));
  let rejected = 0;
  let batchExcluded = 0;
  let blockedExcluded = 0;
  const choices = ids.map(id => {
    const allowed = allowedOfferingIds && Object.prototype.hasOwnProperty.call(allowedOfferingIds, id) ? allowedOfferingIds[id] : undefined;
    return { id, allowed, offerings: catalog.offerings.filter(o => {
      if (o.courseId !== id || (allowed !== undefined && !allowed.includes(o.id))) return false;
      if (counts.get(o.id) !== 1 || !validOffering(o)) { rejected++; return false; }
      if (!fitsTheoryBatch(o, preferences.theoryBatch ?? 'any')) { batchExcluded++; return false; }
      return true;
    }).sort((a, b) => compareText(a.id, b.id)) };
  });
  if (rejected) notes.push(`${rejected} malformed or ambiguous offerings excluded; missing meeting components/slots must be resolved.`);
  choices.forEach(choice => {
    const available = choice.offerings.filter(o => !offeringBlockedBy(o, blockedTimes));
    blockedExcluded += choice.offerings.length - available.length;
    if (available.length) choice.offerings = available;
  });
  if (blockedExcluded) notes.push(`${blockedExcluded} offerings overlap blocked time; they are used only when a course has no unblocked option.`);
  const unavailable = choices.filter(c => !c.offerings.length);
  if (unavailable.length) return empty([...notes, `${unavailable.every(c => c.allowed !== undefined) ? 'No complete allowed offerings' : 'No complete offerings'} for: ${unavailable.map(c => c.id).join(', ')}.${batchExcluded ? ` ${batchExcluded} offerings did not fit the ${preferences.theoryBatch} theory batch.` : ''}${blockedExcluded ? ` ${blockedExcluded} offerings fell inside your blocked times.` : ''} Preferences cannot repair missing offerings.`].join(' '));
  choices.sort((a, b) => a.offerings.length - b.offerings.length || compareText(a.id, b.id));
  const limit = Number.isFinite(preferences.maxResults) ? Math.min(MAX_RESULTS, Math.max(1, Math.floor(preferences.maxResults))) : defaultPreferences.maxResults;
  const schedules: Schedule[] = [];
  const offeringLayouts = new Map(catalog.offerings.map(o => [o.id,
    JSON.stringify([o.courseId, meetings(o).map(m => `${m.day}:${m.start}:${m.end}`).sort()]),
  ]));
  const layoutParts = (ids: string[]) => ids.map(id => offeringLayouts.get(id)).filter((key): key is string => !!key).sort(compareText);
  const layoutKey = (ids: string[]) => JSON.stringify(layoutParts(ids));
  const excludedLayouts = new Set(distinctLayouts ? excludedSchedules.map(layoutKey) : []);
  // Explore time layouts before faculty duplicates so a large faculty roster
  // cannot consume the search budget before other timetable shapes are visited.
  if (distinctLayouts) {
    const seenParts = new Set(excludedSchedules.flatMap(layoutParts));
    for (const choice of choices) {
      const groups = new Map<string, Offering[]>();
      for (const offering of choice.offerings) {
        const key = offeringLayouts.get(offering.id)!;
        const group = groups.get(key) ?? [];
        group.push(offering);
        groups.set(key, group);
      }
      const layouts = [...groups.entries()].sort(([a], [b]) =>
        Number(seenParts.has(a)) - Number(seenParts.has(b)) || compareText(a, b));
      choice.offerings = [];
      for (let row = 0; layouts.some(([, group]) => row < group.length); row++) {
        for (const [, group] of layouts) if (group[row]) choice.offerings.push(group[row]);
      }
    }
  }
  const candidates = new Map<string, Schedule>();
  const selected: Offering[] = [];
  let explored = 0;
  let truncated = false;
  let found = 0;
  function visit(depth: number): void {
    if (depth === choices.length) {
      const selectedIds = selected.map(o => o.id);
      if (excludedSchedules.some(ids => ids.length === selectedIds.length && ids.every(id => selectedIds.includes(id)))) return;
      if (distinctLayouts && excludedLayouts.has(layoutKey(selectedIds))) return;
      found++;
      const schedule = rank([...selected].sort((a, b) => compareText(a.courseId, b.courseId)), preferences, blockedTimes);
      if (distinctLayouts) {
        const key = layoutKey(schedule.offeringIds);
        const existing = candidates.get(key);
        if (!existing || compare(schedule, existing) < 0) candidates.set(key, schedule);
        return;
      }
      schedules.push(schedule);
      schedules.sort(compare);
      if (schedules.length > limit) schedules.pop();
      return;
    }
    for (const offering of choices[depth].offerings) {
      if (explored >= MAX_EXPLORED) { truncated = true; return; }
      explored++;
      if (selected.some(o => conflicts(o, offering))) continue;
      selected.push(offering);
      visit(depth + 1);
      selected.pop();
      if (truncated) return;
    }
  }
  // Avoid unbounded recursive depth with unusually large imported selections.
  if (choices.length > 200) return empty('Select at most 200 distinct courses per search.');
  visit(0);
  if (distinctLayouts) {
    const remaining = [...candidates.values()].sort(compare);
    const references = excludedSchedules.map(ids => new Set(layoutParts(ids)));
    const meetingIndex = new Map(catalog.offerings.map(offering => [offering.id, meetings(offering)]));
    const timetableMeetings = (schedule: Schedule) => schedule.offeringIds.flatMap(id => meetingIndex.get(id) ?? []);
    const candidateMeetingsIndex = new Map(remaining.map(schedule => [schedule, timetableMeetings(schedule)]));
    const referenceMeetings = excludedSchedules.map(ids => ids.flatMap(id => {
      const offering = catalog.offerings.find(offering => offering.id === id);
      return offering ? meetings(offering) : [];
    }));
    // Measure actual occupied time too: moving a class by five minutes should
    // not tie with moving it to an entirely different period or weekday.
    const occupiedDistance = (a: Meeting[], b: Meeting[]) => {
      const duration = (items: Meeting[]) => items.reduce((total, m) => total + m.end - m.start, 0);
      const intersection = a.reduce((total, m) => total + b.reduce((overlap, n) => overlap +
        (m.day === n.day ? Math.max(0, Math.min(m.end, n.end) - Math.max(m.start, n.start)) : 0), 0), 0);
      return duration(a) + duration(b) - 2 * intersection;
    };
    // Maximise the minimum number of changed course layouts against every
    // displayed/previous alternative. Faculty-only changes do not add variety.
    while (schedules.length < limit && remaining.length) {
      let best = 0;
      let bestDistance = -1;
      let bestTimeDistance = -1;
      for (let i = 0; i < remaining.length; i++) {
        const parts = layoutParts(remaining[i].offeringIds);
        const distance = references.length
          ? Math.min(...references.map(reference => parts.filter(part => !reference.has(part)).length))
          : 0;
        const candidateMeetings = candidateMeetingsIndex.get(remaining[i])!;
        const timeDistance = referenceMeetings.length
          ? Math.min(...referenceMeetings.map(reference => occupiedDistance(candidateMeetings, reference))) : 0;
        if (distance > bestDistance || (distance === bestDistance && timeDistance > bestTimeDistance)) {
          best = i; bestDistance = distance; bestTimeDistance = timeDistance;
        }
      }
      const [next] = remaining.splice(best, 1);
      if (references.length) next.reasons.push(`${bestDistance}/${ids.length} course time layouts differ from the closest alternative.`);
      schedules.push(next);
      references.push(new Set(layoutParts(next.offeringIds)));
      referenceMeetings.push(timetableMeetings(next));
    }
  }
  if (truncated) notes.push(`Search stopped after ${MAX_EXPLORED} attempted assignments; returned rankings cover only explored schedules.`);
  else if (distinctLayouts && candidates.size > schedules.length) notes.push(`Showing ${schedules.length} varied alternatives from ${candidates.size} distinct valid layouts; preferences break ties in variety.`);
  else if (!distinctLayouts && found > limit) notes.push(`Showing the best ${limit} of ${found} valid schedules.`);
  if (distinctLayouts && preferences.theoryBatch !== 'any' && !truncated) {
    const fixed = choices.filter(choice => new Set(choice.offerings.map(o => offeringLayouts.get(o.id))).size === 1);
    if (fixed.length) notes.push(`${fixed.length}/${ids.length} courses have only one available time layout in this theory batch: ${fixed.map(choice => catalog.courses.find(c => c.id === choice.id)!.code).join(', ')}. Different faculty at the same times do not create a new calendar layout.`);
    if (schedules.length < limit && schedules.length) notes.push(`Only ${candidates.size} new distinct clash-free layouts are available with these selections.`);
  }
  if (!schedules.length) notes.push(truncated ? 'No valid schedule found within the search bound.' : 'No clash-free combination exists among the allowed offerings. Soft preferences were not used to exclude schedules.');
  return { schedules, truncated, explored, ...(notes.length ? { message: notes.join(' ') } : {}) };
}
