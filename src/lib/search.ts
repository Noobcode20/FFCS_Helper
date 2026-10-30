import type { Catalog, Course } from './types';

const normalize = (text: string): string => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (text: string): string => text.replace(/ /g, '');

// Bounded Damerau-Levenshtein, including adjacent transpositions.
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previousPrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], previousPrevious[j - 2] + 1);
    }
    previousPrevious = previous;
    previous = row;
  }
  return previous[b.length];
}

export function searchCourses(catalog: Catalog, query: string): Course[] {
  const needle = normalize(query);
  const exactCode = catalog.courses.filter(course => compact(normalize(course.code)) === compact(needle));
  if (needle && exactCode.length) return exactCode;
  if (/^[a-z]{2,}\d{2,}[a-z]?$/.test(compact(needle))) {
    const codePrefix = catalog.courses.filter(course => compact(normalize(course.code)).startsWith(compact(needle)));
    if (codePrefix.length) return codePrefix.sort((a,b) => a.code.localeCompare(b.code));
  }
  const faculty = new Map(catalog.faculty.map(f => [f.id, f.name]));
  const names = new Map<string, Set<string>>();
  for (const offering of catalog.offerings) {
    const set = names.get(offering.courseId) ?? new Set<string>();
    for (const id of [offering.facultyId, ...offering.components.map(c => c.facultyId)]) {
      if (id && faculty.has(id)) set.add(faculty.get(id)!);
    }
    names.set(offering.courseId, set);
  }
  const ranked = catalog.courses.map(course => {
    const titleWords = normalize(course.title).split(' ');
    const initials = titleWords.map(word => word[0] || '').join('');
    const acronym = titleWords.filter(word => !['and','of','the','in','to','for','a','an'].includes(word)).map(word => word[0] || '').join('');
    const fields = [course.code, course.title, ...(titleWords.length > 1 ? [initials, acronym] : []), ...(course.aliases ?? []), ...(names.get(course.id) ?? [])].map(normalize);
    let score = needle ? 0 : 1;
    if (needle) {
      for (const field of fields) {
        if (compact(field) === compact(needle)) score = Math.max(score, 100);
        else if (field.includes(needle) || compact(field).includes(compact(needle))) score = Math.max(score, 80);
      }
      // Each query token may match a different field (e.g. code + faculty).
      const words = fields.flatMap(field => [...field.split(' '), compact(field)]);
      const tokens = needle.split(' ');
      let fuzzyScore = 0;
      const matches = tokens.every(token => {
        if (words.some(word => word.includes(token))) { fuzzyScore += 60; return true; }
        const tolerance = token.length >= 8 ? 2 : token.length >= 4 ? 1 : 0;
        if (tolerance && words.some(word => distance(token, word, tolerance) <= tolerance)) { fuzzyScore += 30; return true; }
        return false;
      });
      if (matches) score = Math.max(score, fuzzyScore / tokens.length);
    }
    return { course, score };
  }).filter(result => result.score > 0);
  const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  ranked.sort((a, b) => b.score - a.score || textOrder(a.course.code, b.course.code) || textOrder(a.course.id, b.course.id));
  return ranked.filter((result, index) => ranked.findIndex(other => other.course.id === result.course.id) === index).map(result => result.course);
}
