import type { BlockedWindow, Day, Meeting, Offering } from './types';

export const BLOCKED_KEY = 'ffcs-helper:blocked-times:v1';
export const MAX_BLOCKED_WINDOWS = 50;

const isDay = (value: unknown): value is Day =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;

/** Blocks are half-open intervals in minutes from midnight, like meetings. */
export function isBlockedWindow(input: unknown): input is BlockedWindow {
  if (!input || typeof input !== 'object') return false;
  const window = input as BlockedWindow;
  return (window.calendarId === undefined || (typeof window.calendarId === 'string' && window.calendarId.length > 0)) &&
    typeof window.id === 'string' && window.id.length > 0 && window.id.length <= 100 &&
    Array.isArray(window.days) && window.days.length > 0 && window.days.every(isDay) &&
    new Set(window.days).size === window.days.length &&
    Number.isInteger(window.start) && Number.isInteger(window.end) &&
    window.start >= 0 && window.end <= 1440 && window.start < window.end;
}

export function meetingBlockedBy(meeting: Meeting, windows: BlockedWindow[]): BlockedWindow | undefined {
  return windows.find(window =>
    window.days.includes(meeting.day) && meeting.start < window.end && window.start < meeting.end,
  );
}

export function offeringBlockedBy(offering: Offering, windows: BlockedWindow[]): BlockedWindow | undefined {
  for (const component of offering.components ?? []) {
    for (const meeting of component.meetings ?? []) {
      const window = meetingBlockedBy(meeting, windows);
      if (window) return window;
    }
  }
  return undefined;
}

/** Parse an <input type="time"> value into minutes; returns null for invalid input. */
export function parseClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function loadBlockedWindows(): BlockedWindow[] {
  const raw = localStorage.getItem(BLOCKED_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 5000 || !parsed.every(isBlockedWindow)) {
    throw new Error('Saved blocked times are damaged. Clear them and add the times again.');
  }
  return parsed;
}

export function saveBlockedWindows(windows: BlockedWindow[]): void {
  if (windows.length > 5000 || !windows.every(isBlockedWindow)) {
    throw new Error('Cannot save invalid blocked times.');
  }
  localStorage.setItem(BLOCKED_KEY, JSON.stringify(windows));
}
