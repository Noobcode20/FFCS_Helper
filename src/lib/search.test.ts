import { describe, expect, it } from 'vitest';
import type { Catalog } from './types';
import { searchCourses } from './search';
const catalog: Catalog = {
  version: 1, campus: 'Vellore', semester: 'synthetic', provenance: { source: 'test', importedAt: '', status: 'imported' },
  courses: [
    { id: 'net', code: 'TEST1001', title: 'Network Theory', aliases: ['NT', 'Circuit Networks'], credits: 3 },
    { id: 'ds', code: 'TEST2001', title: 'Data Structures', aliases: ['DSA'], credits: 4 },
    { id: 'advanced', code: 'TEST3001', title: 'Advanced Network Analysis', credits: 3 },
  ],
  faculty: [{ id: 'f1', name: 'Élodie Raman' }, { id: 'f2', name: 'Synthetic Lab Instructor' }],
  offerings: [{ id: 's1', courseId: 'net', facultyId: 'f1', section: 'A', components: [{ type: 'lab', facultyId: 'f2', slots: ['L'], meetings: [{ day: 0, start: 540, end: 600, slot: 'L' }] }] }],
  reviews: [],
};
const ids = (query: string) => searchCourses(catalog, query).map(c => c.id);

describe('course search', () => {
  it('finds full or partial titles and normalized codes', () => {
    expect(ids('Network Theory')[0]).toBe('net');
    expect(ids('NETWORK')).toEqual(['net', 'advanced']);
    expect(ids('test 1001')).toEqual(['net']);
    expect(ids('test-200')).toContain('ds');
  });
  it('matches aliases and short abbreviations without over-fuzzy matching', () => {
    expect(ids('nt')[0]).toBe('net');
    expect(ids('dsa')).toEqual(['ds']);
    expect(ids('Circuit')).toEqual(['net']);
    expect(ids('zz')).toEqual([]);
  });
  it('searches primary and component faculty, accents, and combined fields', () => {
    expect(ids('elodie raman')).toEqual(['net']);
    expect(ids('Lab Instructor')).toEqual(['net']);
    expect(ids('network raman')).toEqual(['net']);
  });
  it('tolerates typos, transpositions and longer two-edit words', () => {
    expect(ids('netwrok thery')[0]).toBe('net');
    expect(ids('strcturs')).toEqual(['ds']);
    expect(ids('ramna')).toEqual(['net']);
    expect(ids('qzxqzxqzxqzx')).toEqual([]);
  });
  it('ranks exact matches above fuzzy matches, and returns stable empty-query order', () => {
    expect(ids('Network Theory')[0]).toBe('net');
    expect(ids('   ')).toEqual(['net', 'ds', 'advanced']);
    expect(searchCourses({ ...catalog, courses: [...catalog.courses].reverse() }, 'network')).toEqual(searchCourses(catalog, 'network'));
  });
  it('returns original records once even if aliases or offerings repeat', () => {
    const results = searchCourses({ ...catalog, courses: [...catalog.courses, catalog.courses[0]], offerings: [...catalog.offerings, catalog.offerings[0]] }, 'raman');
    expect(results).toEqual([catalog.courses[0]]);
    expect(results[0]).toBe(catalog.courses[0]);
  });
});

it('searches title acronyms without requiring manually populated aliases', () => {
  const c: Catalog = { version: 1, campus: 'Vellore', semester: 'Test', provenance: { source: 'Test fixture', importedAt: '2026-01-01', status: 'imported' }, courses: [{ id: 'dsa', code: 'TEST101', title: 'Data Structures and Algorithms', credits: 3 }], faculty: [], offerings: [], reviews: [] };
  expect(searchCourses(c, 'dsa').map(course => course.id)).toEqual(['dsa']);
});

it('treats an exact course code as a precise lookup instead of flooding results with similar codes', () => {
 expect(searchCourses(catalog,'TEST1001').map(c=>c.id)).toEqual(['net']);
});
