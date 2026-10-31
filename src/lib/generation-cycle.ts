import { generateSchedules } from './engine';
import type { BlockedWindow, Offering } from './types';

export function calendarGenerationConstraints(useCalendar: boolean, pins: Offering[], blocks: BlockedWindow[]) {
  const pinnedOfferings = useCalendar ? pins : [];
  return {
    pinnedOfferings,
    pinnedChoices: Object.fromEntries(pinnedOfferings.map(offering => [offering.courseId, [offering.id]])),
    blockedTimes: useCalendar ? blocks : [],
  };
}

/** Each caller owns its cursor; only returned schedules advance that cursor. */
export function nextGenerationCycle(
  history: string[][],
  generate: (excluded: string[][]) => ReturnType<typeof generateSchedules>,
) {
  let result = generate(history);
  let restarted = false;
  if (!result.schedules.length && history.length) {
    result = generate([]);
    if (result.schedules.length) restarted = true;
  }
  return {
    result,
    restarted,
    history: [...(restarted ? [] : history), ...result.schedules.map(schedule => schedule.offeringIds)],
  };
}
