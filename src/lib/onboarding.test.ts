import { afterEach, expect, it, vi } from 'vitest';
import { browserStorage, createDemoStorage, demoCatalog, markOnboardingSeen, ONBOARDING_KEY, onboardingSeen } from './onboarding';
import { conflicts, defaultPreferences, generateSchedules, isSchedulableOffering } from './engine';

afterEach(() => vi.unstubAllGlobals());
it('isolates every demo write and starts replay from a fresh sample schedule', () => {
  const real = new Map([['ffcs-helper:calendars:v1', 'personal calendar']]);
  const setItem = vi.fn((key: string, value: string) => real.set(key, value));
  vi.stubGlobal('localStorage', { getItem: (key: string) => real.get(key) ?? null, setItem });
  const practice = createDemoStorage();
  practice.setItem('ffcs-helper:calendars:v1', 'edited demo');
  practice.setItem('ffcs-helper:faculty-preferences:v1', 'demo teacher');
  practice.removeItem('ffcs-helper:shortlist:v1');
  expect(real.get('ffcs-helper:calendars:v1')).toBe('personal calendar');
  expect(setItem).not.toHaveBeenCalled();
  expect(createDemoStorage().getItem('ffcs-helper:calendars:v1')).toContain('Practice timetable');
  expect(createDemoStorage().getItem('ffcs-helper:shortlist:v1')).toContain('demo-1');
});
it('remembers completion without storing any demo data', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  expect(onboardingSeen()).toBe(false);
  markOnboardingSeen();
  expect(onboardingSeen()).toBe(true);
  expect([...values.entries()]).toEqual([[ONBOARDING_KEY, 'complete']]);
});
it('supports blocked browser storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
  expect(onboardingSeen()).toBe(false);
  expect(() => markOnboardingSeen()).not.toThrow();
  expect(browserStorage()).toBeDefined();
});
it('provides working fictional sections and generates around a pinned practice class', () => {
  expect(demoCatalog.offerings.every(isSchedulableOffering)).toBe(true);
  expect(conflicts(demoCatalog.offerings[0], demoCatalog.offerings[2])).toBe(false);
  const result = generateSchedules(demoCatalog, ['demo-1', 'demo-2', 'demo-3'], defaultPreferences, { 'demo-1': ['demo-1-a'] });
  expect(result.schedules.length).toBeGreaterThan(0);
  expect(result.schedules.every(schedule => schedule.offeringIds.includes('demo-1-a'))).toBe(true);
});
