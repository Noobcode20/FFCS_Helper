import { conflicts, isSchedulableOffering } from './engine';
import type { Catalog, Offering, Preferences } from './types';

const layout = (o: Offering) => JSON.stringify(o.components.flatMap(c => c.meetings).map(m => `${m.day}:${m.start}:${m.end}`).sort());
/** Registration recovery: preserve registered sections, then minimize changes.
 * Faculty preferences break ties; saved-layout exclusions do not apply.
 */
export function repairFfcs(catalog: Catalog, current: Offering[], target: string, registered: string[], rejected: Record<string, string[]>, preferences: Partial<Preferences> = {}, alternatives: string[] = []): { offeringIds?: string[]; truncated?: boolean; message?: string; substitutedCourseId?: string } {
  const previous = current.find(o => o.courseId === target);
  if (!previous || registered.includes(target)) return { message: 'Registered courses stay fixed.' };
  const unavailable = (o: Offering) => (rejected[o.courseId] || []).includes(o.facultyId) || (o.courseId === target && o.facultyId === previous.facultyId);
  const facultyScore = (o: Offering) => {
    const ids = [...new Set([o.facultyId, ...o.components.flatMap(c => c.facultyId ? [c.facultyId] : [])])];
    return ids.reduce((sum, id) => sum + ((preferences.preferredFaculty || []).includes(id) ? 2 : 0) +
      ((preferences.facultyOrder || []).includes(id) ? 1 + 1 / ((preferences.facultyOrder || []).indexOf(id) + 1) : 0) -
      ((preferences.blockedFaculty || []).includes(id) ? 4 : 0), 0) / ids.length;
  };
  const search = (replacementCourse: string | null) => {
  const choices = current.map(old => ({ old, options: catalog.offerings.filter(o => (old.courseId === target
    ? (replacementCourse ? o.courseId === replacementCourse : o.courseId !== target && !current.some(item => item.courseId === o.courseId))
    : o.courseId === old.courseId) &&
    (registered.includes(old.courseId) ? o.id === old.id : !unavailable(o)) && isSchedulableOffering(o))
    .sort((a,b) => Number(b.id === old.id) - Number(a.id === old.id) || Number(layout(b) === layout(old)) - Number(layout(a) === layout(old)) || facultyScore(b) - facultyScore(a) || a.id.localeCompare(b.id)) }));
  choices.sort((a,b) => Number(b.old.courseId === target) - Number(a.old.courseId === target) || a.options.length - b.options.length);
  let best: Offering[] | undefined;
  let bestCost = Infinity;
  let bestFaculty = -Infinity;
  let explored = 0;
  const visit = (index: number, picked: Offering[], cost: number) => {
    if (cost > bestCost || explored >= 100000) return;
    if (index === choices.length) {
      const score = picked.reduce((sum, o) => sum + facultyScore(o), 0);
      if (cost < bestCost || score > bestFaculty) { best = [...picked]; bestCost = cost; bestFaculty = score; }
      return;
    }
    const {old, options} = choices[index];
    for (const option of options) {
      if (++explored > 100000) break;
      if (picked.some(o => conflicts(o, option))) continue;
      // Any moved non-target course costs more than changing the target's time.
      const change = option.id === old.id ? 0 : old.courseId === target ? Number(layout(option) !== layout(old)) : 2;
      visit(index + 1, [...picked, option], cost + change);
    }
  };
  visit(0, [], 0);
  return { offeringIds: best?.map(o => o.id), truncated: explored >= 100000,
    message: best ? undefined : explored >= 100000 ? 'Search limit reached. No replacement found yet; registered courses remain fixed.' : 'No clash-free replacement is available with your registered courses fixed. Your timetable is unchanged.' };
  };
  const primary = search(target);
  if (primary.offeringIds || primary.truncated) return primary;
  for (const alternative of [...new Set(alternatives)]) {
    if (current.some(o => o.courseId === alternative)) continue;
    const result = search(alternative);
    if (result.offeringIds) return { ...result, substitutedCourseId: alternative };
    if (result.truncated) return result;
  }
  const fallback = search(null);
  if (fallback.offeringIds) {
    const substitutedCourseId = catalog.offerings.find(o => !current.some(item => item.courseId === o.courseId) && fallback.offeringIds!.includes(o.id))?.courseId;
    return { ...fallback, substitutedCourseId };
  }
  if (fallback.truncated) return fallback;
  return primary;
}
