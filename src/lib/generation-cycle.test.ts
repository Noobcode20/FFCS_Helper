import { describe, expect, it } from 'vitest';
import { defaultPreferences, generateSchedules } from './engine';
import { fixture } from './test-fixture';
import { nextGenerationCycle } from './generation-cycle';

describe('independent generation cycles', () => {
  const data = fixture();
  data.offerings = ([0, 1, 2] as const).map(index => ({ ...data.offerings[0], id: `o${index}`, components: [{ type: 'theory', slots: ['A'], meetings: [{ day: index, start: 480, end: 530, slot: 'A' }] }] }));
  const generate = (count: number) => (excluded: string[][]) => generateSchedules(data, ['c'], { ...defaultPreferences, maxResults: count }, undefined, [], excluded, true);
  it('advances calendar one layout at a time without consuming alternatives', () => {
    const firstCalendar = nextGenerationCycle([], generate(1));
    const firstAlternatives = nextGenerationCycle([], generate(2));
    expect(firstAlternatives.result.schedules[0]).toEqual(firstCalendar.result.schedules[0]);
    const secondCalendar = nextGenerationCycle(firstCalendar.history, generate(1));
    expect(secondCalendar.result.schedules[0]).toEqual(firstAlternatives.result.schedules[1]);
    const secondAlternatives = nextGenerationCycle(firstAlternatives.history, generate(2));
    expect(secondAlternatives.result.schedules).toHaveLength(1);
    expect(secondAlternatives.result.schedules[0].offeringIds).not.toEqual(secondCalendar.result.schedules[0].offeringIds);
  });
  it('wraps and resets history so every layout is available on the next lap', () => {
    const first = nextGenerationCycle([], generate(1));
    const second = nextGenerationCycle(first.history, generate(1));
    const third = nextGenerationCycle(second.history, generate(1));
    const wrapped = nextGenerationCycle(third.history, generate(1));
    expect(wrapped.restarted).toBe(true);
    expect(wrapped.result.schedules).toEqual(first.result.schedules);
    expect(nextGenerationCycle(wrapped.history, generate(1)).result.schedules).toEqual(second.result.schedules);
  });
});

describe('calendar state opt-in', () => {
  it('holds pins and excludes blocked meetings only when enabled', async () => {
    const { calendarGenerationConstraints } = await import('./generation-cycle');
    const data = fixture();
    const pinned = data.offerings[0];
    data.offerings.push({ ...pinned, id: 'other', components: [{ type: 'theory', slots: ['B'], meetings: [{ day: 1, start: 480, end: 530, slot: 'B' }] }] });
    const blocks = [{ id: 'block', days: [0] as [0], start: 480, end: 540 }];
    const enabled = calendarGenerationConstraints(true, [pinned], blocks);
    expect(generateSchedules(data, ['c'], defaultPreferences, enabled.pinnedChoices, enabled.blockedTimes).schedules.map(schedule => schedule.offeringIds)).toEqual([['o']]);
    const blocksOnly = calendarGenerationConstraints(true, [], blocks);
    expect(generateSchedules(data, ['c'], defaultPreferences, blocksOnly.pinnedChoices, blocksOnly.blockedTimes).schedules.map(schedule => schedule.offeringIds)).toEqual([['other']]);
    const empty = calendarGenerationConstraints(false, [pinned], blocks);
    const alternatives = generateSchedules(data, ['c'], defaultPreferences, empty.pinnedChoices, empty.blockedTimes);
    expect(alternatives.schedules.map(schedule => schedule.offeringIds)).toEqual([['o'], ['other']]);
    expect(empty.pinnedOfferings).toHaveLength(0);
  });
});
