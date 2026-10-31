import { expect, it } from 'vitest';
import { fixture } from './test-fixture';
import { defaultCatalog } from '../data/catalog';
import { defaultPreferences } from './engine';
import { catalogFingerprint } from './storage';
import { loadPreferences, parseBackup, persistBackup, type AppBackup } from './backup';
import { createDemoStorage } from './onboarding';
function backup(): AppBackup {
  const catalog = fixture();
  return {
    format: 'ffcs-helper-backup', version: 1, exportedAt: '2026-10-31T00:00:00Z', catalog,
    calendars: [{ id: 'a', name: 'First', offeringIds: ['o'], pinnedOfferingIds: ['o'], registeredOfferingIds: ['o'], ffcsOriginalOfferingIds: ['o'] }, { id: 'b', name: 'Second', offeringIds: [] }],
    activeCalendarId: 'b', plans: [{ id: 'p', name: 'Old plan', offeringIds: ['o'], savedAt: '2026-10-30', semester: catalog.semester, catalogFingerprint: catalogFingerprint(catalog) }],
    shortlist: ['c'], alternativeCourses: ['alternative'], blockedTimes: [{ id: 'block', calendarId: 'b', days: [0,2], start: 600, end: 660 }],
    preferences: { ...defaultPreferences, colorByBuilding: true, theoryBatch: 'morning', compactness: -1, minClassGap: 30, preferredFaculty: ['f'], blockedFaculty: ['other'], preferredBuildings: ['SJT'], facultyMode: 'preferred', ratingThreshold: 4 },
    branch: 'ECE', ffcsRejections: { a: ['f'] }, useCurrentCalendar: true,
  };
}
it('round trips a complete setup and persists settings for a fresh device', () => {
  const source = backup(), restored = parseBackup(JSON.parse(JSON.stringify(source)));
  expect(restored).toEqual(source);
  const storage = createDemoStorage();
  storage.setItem('other-app', 'untouched');
  persistBackup(restored, storage);
  expect(loadPreferences(storage)).toEqual(source.preferences);
  expect(JSON.parse(storage.getItem('ffcs-helper:calendars:v1')!)).toEqual(source.calendars);
  expect(JSON.parse(storage.getItem('ffcs-helper-catalog')!)).toEqual(source.catalog);
  expect(JSON.parse(storage.getItem('ffcs-helper:blocked-times:v1')!)).toEqual(source.blockedTimes);
  expect(storage.getItem('ffcs-helper:active-calendar:v1')).toBe('b');
  expect(storage.getItem('other-app')).toBe('untouched');
});
it('accepts an empty setup with the bundled catalog and no saved plans', () => {
  expect(parseBackup({ ...backup(), catalog: defaultCatalog, plans: [], shortlist: [], alternativeCourses: [], blockedTimes: [] }).plans).toEqual([]);
});
it('rejects unsupported, corrupted, or inconsistent backups before any writes', () => {
  for (const change of [{ version: 2 }, { preferences: { ...defaultPreferences, maxResults: 0 } }, { preferences: { ...defaultPreferences, preferredFaculty: [42] } }, { activeCalendarId: 'missing' }, { calendars: [] }, { plans: [{}] }, { catalog: {} }, { blockedTimes: [{ id: 'bad', days: [0], start: 700, end: 600 }] }, { ffcsRejections: { a: [null] } }]) {
    expect(() => parseBackup({ ...backup(), ...change })).toThrow();
  }
});
it('rolls back partial writes on quota failure and preserves unrelated data', () => {
  const storage = createDemoStorage();
  storage.setItem('ffcs-helper-catalog', 'old catalog');
  const oldCalendars = storage.getItem('ffcs-helper:calendars:v1');
  const failing = { ...storage, setItem: (key: string, value: string) => { if (key === 'ffcs-helper:plans:v1') throw new Error('quota'); storage.setItem(key, value); } };
  expect(() => persistBackup(backup(), failing)).toThrow('preserved');
  expect(storage.getItem('ffcs-helper-catalog')).toBe('old catalog');
  expect(storage.getItem('ffcs-helper:calendars:v1')).toBe(oldCalendars);
  expect(storage.getItem('ffcs-helper:active-calendar:v1')).toBeNull();
});
it('migrates legacy teacher settings and saves full generation preferences', () => {
  const storage = createDemoStorage();
  storage.setItem('ffcs-helper:faculty-preferences:v1', JSON.stringify({ preferredFaculty: ['f'], preferredBuildings: ['SJT'] }));
  expect(loadPreferences(storage)).toMatchObject({ preferredFaculty: ['f'], preferredBuildings: ['SJT'], theoryBatch: 'any' });
});

it('does not report success when browser storage silently discards writes', () => {
  expect(() => persistBackup(backup(), { getItem: () => null, setItem: () => {}, removeItem: () => {} })).toThrow('preserved');
});
