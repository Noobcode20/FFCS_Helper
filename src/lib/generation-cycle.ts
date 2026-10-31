import { generateSchedules } from './engine';

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
