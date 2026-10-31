import type { BlockedWindow, Catalog, Plan, Preferences } from './types';
import { validateCatalog } from './importer';
import { isBlockedWindow, BLOCKED_KEY } from './blocked';
import { planShape } from './storage';
import { defaultPreferences } from './engine';
import { buildingFromVenue } from './buildings';

export const PREFERENCES_KEY = 'ffcs-helper:preferences:v1';
export type CalendarChoice = { id: string; name: string; offeringIds: string[]; pinnedOfferingIds?: string[]; registeredOfferingIds?: string[]; ffcsOriginalOfferingIds?: string[]; priority?: 1 | 2 | 3 | 4; ffcsPriorities?: Record<string, 1 | 2 | 3 | 4> };
export interface AppBackup {
  format: 'ffcs-helper-backup';
  version: 1;
  exportedAt: string;
  catalog: Catalog;
  calendars: CalendarChoice[];
  activeCalendarId: string;
  plans: Plan[];
  shortlist: string[];
  alternativeCourses: string[];
  blockedTimes: BlockedWindow[];
  preferences: Preferences;
  branch: '' | 'ECE' | 'ECM' | 'MCA' | 'CSE CORE';
  ffcsRejections: Record<string, string[]>;
  useCurrentCalendar: boolean;
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 2000;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100000 && v.every(text) && new Set(v).size === v.length;
const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const validFfcsPriorities = (v: unknown): v is Record<string, 1 | 2 | 3 | 4> =>
  object(v) && Object.entries(v).every(([key, value]) => text(key) && [1, 2, 3, 4].includes(value as number));
export function validPreferences(v: unknown): v is Preferences {
  return object(v) && (v.colorByBuilding === undefined || typeof v.colorByBuilding === 'boolean') && ['any','morning','evening'].includes(String(v.theoryBatch)) && ['any','morning','afternoon'].includes(String(v.timeOfDay)) &&
    Array.isArray(v.freeDays) && v.freeDays.length <= 7 && v.freeDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
    number(v.compactness,-1,3) && (v.minClassGap === undefined || number(v.minClassGap,0,1440)) && strings(v.facultyOrder) &&
    Number.isInteger(v.maxResults) && number(v.maxResults,1,5) && (v.ratingThreshold === undefined || number(v.ratingThreshold,0,5)) &&
    (v.facultyMode === undefined || ['preferred','rated'].includes(String(v.facultyMode))) &&
    ['preferredFaculty','blockedFaculty','preferredBuildings'].every(key => v[key] === undefined || strings(v[key]));
}
export function loadPreferences(storage: Store): Preferences {
  try {
    const saved: unknown = JSON.parse(storage.getItem(PREFERENCES_KEY) || 'null');
    if (validPreferences(saved)) return { ...saved, preferredBuildings: [...new Set((saved.preferredBuildings || []).map(buildingFromVenue).filter(Boolean))] };
    const legacy: unknown = JSON.parse(storage.getItem('ffcs-helper:faculty-preferences:v1') || '{}');
    const merged = { ...defaultPreferences, facultyMode: 'preferred', ratingThreshold: 3, ...(object(legacy) ? legacy : {}) };
    if (validPreferences(merged)) return { ...merged, preferredBuildings: [...new Set((merged.preferredBuildings || []).map(buildingFromVenue).filter(Boolean))] };
  } catch { /* Defaults remain usable if storage is unavailable. */ }
  return structuredClone(defaultPreferences);
}
export function parseBackup(input: unknown): AppBackup {
  if (!object(input) || input.format !== 'ffcs-helper-backup') throw new Error('Choose a full FFCS Helper backup exported from Import / export timetable.');
  if (input.version !== 1) throw new Error('This backup version is not supported. Update FFCS Helper and try again.');
  if (!text(input.exportedAt) || Number.isNaN(Date.parse(input.exportedAt))) throw new Error('Invalid backup date.');
  const result = validateCatalog(input.catalog);
  if (!result.catalog || result.errors.length) throw new Error(`Invalid backup catalog: ${result.errors[0]}`);
  const calendars = input.calendars;
  if (!Array.isArray(calendars) || !calendars.length || calendars.length > 500 || !calendars.every(c => object(c) && text(c.id) && text(c.name) && strings(c.offeringIds) && ['pinnedOfferingIds','registeredOfferingIds','ffcsOriginalOfferingIds'].every(k => c[k] === undefined || strings(c[k])) && (c.ffcsPriorities === undefined || validFfcsPriorities(c.ffcsPriorities)) && (c.priority === undefined || [1, 2, 3, 4].includes(c.priority as number)))) throw new Error('Invalid calendars in backup.');
  const ids = new Set(calendars.map(c => c.id));
  if (ids.size !== calendars.length || !ids.has(input.activeCalendarId)) throw new Error('Invalid active calendar or duplicate calendar IDs.');
  for (const c of calendars) for (const key of ['pinnedOfferingIds','registeredOfferingIds']) if (c[key]?.some((id: string) => !c.offeringIds.includes(id))) throw new Error('Pinned and registered classes must belong to their calendar.');
  if (!Array.isArray(input.plans) || input.plans.length > 500 || !input.plans.every(planShape) || new Set(input.plans.map(p => p.id)).size !== input.plans.length) throw new Error('Invalid saved plans in backup.');
  if (!strings(input.shortlist) || !strings(input.alternativeCourses)) throw new Error('Invalid course lists in backup.');
  if (!Array.isArray(input.blockedTimes) || input.blockedTimes.length > 5000 || !input.blockedTimes.every(isBlockedWindow) || input.blockedTimes.some(b => b.calendarId && !ids.has(b.calendarId))) throw new Error('Invalid blocked times in backup.');
  for (const c of calendars) {
    const blocks = input.blockedTimes.filter(b => !b.calendarId || b.calendarId === c.id);
    if (blocks.length > 50 || new Set(blocks.map(b => b.id)).size !== blocks.length) throw new Error('Invalid or too many time blocks in a calendar.');
  }
  if (!validPreferences(input.preferences)) throw new Error('Invalid preferences in backup.');
  if (!['','ECE','ECM','MCA','CSE CORE'].includes(String(input.branch)) || typeof input.useCurrentCalendar !== 'boolean') throw new Error('Invalid planner settings in backup.');
  if (!object(input.ffcsRejections) || !Object.values(input.ffcsRejections).every(strings)) throw new Error('Invalid FFCS rejections in backup.');
  return structuredClone(input) as unknown as AppBackup;
}

/** Write only app-owned keys; roll back every key if quota or storage access fails. */
export function persistBackup(backup: AppBackup, storage: Store): void {
  const entries: Record<string, string> = {
    'ffcs-helper-catalog': JSON.stringify(backup.catalog),
    'ffcs-helper:calendars:v1': JSON.stringify(backup.calendars),
    'ffcs-helper:active-calendar:v1': backup.activeCalendarId,
    'ffcs-helper:plans:v1': JSON.stringify(backup.plans),
    'ffcs-helper:shortlist:v1': JSON.stringify(backup.shortlist),
    'ffcs-helper:alternative-courses:v1': JSON.stringify(backup.alternativeCourses),
    [BLOCKED_KEY]: JSON.stringify(backup.blockedTimes),
    [PREFERENCES_KEY]: JSON.stringify(backup.preferences),
    'ffcs-helper:faculty-preferences:v1': JSON.stringify(backup.preferences),
    'ffcs-helper:branch': backup.branch,
    'ffcs-helper:ffcs-rejected-faculty:v1': JSON.stringify(backup.ffcsRejections),
    'ffcs-helper:use-current-calendar:v1': JSON.stringify(backup.useCurrentCalendar),
    'ffcs-helper:onboarding:v1': 'complete',
  };
  const previous = Object.fromEntries(Object.keys(entries).map(key => [key, storage.getItem(key)]));
  const written: string[] = [];
  try {
    for (const [key, value] of Object.entries(entries)) { storage.setItem(key, value); written.push(key); if (storage.getItem(key) !== value) throw new Error('Storage did not save the import.'); }
  } catch {
    let rollbackFailed = false;
    for (const key of written.reverse()) try { if (previous[key] === null) storage.removeItem(key); else storage.setItem(key, previous[key]!); } catch { rollbackFailed = true; }
    throw new Error(rollbackFailed ? 'Storage failed and could not be fully restored. Keep your backup and free browser storage before retrying.' : 'Browser storage is unavailable or full. Your existing data was preserved. Free storage and try again.');
  }
}
