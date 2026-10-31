import type { Catalog, Day } from './types';

export const ONBOARDING_KEY = 'ffcs-helper:onboarding:v1';
export function onboardingSeen(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === 'complete'; }
  catch { return false; }
}
export function markOnboardingSeen(): void {
  try { localStorage.setItem(ONBOARDING_KEY, 'complete'); }
  catch { /* Completion still applies for this visit. */ }
}

export function browserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try { return localStorage; }
  catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }
}

// Each practice session owns a fresh store. No demo write reaches browser storage.
export function createDemoStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>([
    ['ffcs-helper:calendars:v1', JSON.stringify([{ id: 'demo-calendar', name: 'Practice timetable', offeringIds: ['demo-1-a', 'demo-2-a'], pinnedOfferingIds: [] }])],
    ['ffcs-helper:shortlist:v1', JSON.stringify(['demo-1', 'demo-2', 'demo-3'])],
    ['ffcs-helper:alternative-courses:v1', JSON.stringify(['demo-4'])],
  ]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

export const demoCatalog: Catalog = {
  version: 1, campus: 'Vellore', semester: 'Practice only · fictional data',
  provenance: { source: 'Fictional walkthrough examples', importedAt: '2026-10-31', status: 'imported' },
  courses: ['Programming basics', 'Engineering mathematics', 'Digital systems', 'Creative thinking'].map((title, index) => ({ id: `demo-${index + 1}`, code: `DEMO${101 + index}`, title, credits: 3, category: 'Practice courses' })),
  faculty: [{ id: 'demo-f1', name: 'Sample teacher A' }, { id: 'demo-f2', name: 'Sample teacher B' }],
  offerings: Array.from({ length: 4 }, (_, index) => ['a', 'b'].map((section, choice) => ({
    id: `demo-${index + 1}-${section}`, courseId: `demo-${index + 1}`, facultyId: `demo-f${choice + 1}`, section: `Practice ${section.toUpperCase()}`,
    components: [{ type: 'theory' as const, sourceType: 'TH', slots: [`${String.fromCharCode(65 + index)}${choice + 1}`], venue: 'Sample classroom', meetings: [index % 5, (index + 2) % 5].map(day => ({ day: day as Day, start: 480 + index * 60 + choice * 360, end: 530 + index * 60 + choice * 360, slot: `${String.fromCharCode(65 + index)}${choice + 1}` })) }],
  }))).flat(), reviews: [],
};
