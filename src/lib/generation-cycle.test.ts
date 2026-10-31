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
