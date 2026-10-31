import { expect, it } from 'vitest';
import { positionWalkthrough } from './walkthrough-layout';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
it('places the popup beside a desktop target without covering it', () => {
  const layout = positionWalkthrough(rect(500, 100, 800, 600), { width: 1440, height: 900 }, { width: 380, height: 350 });
  expect(layout.side).toBe('left');
  expect(layout.left + 380).toBeLessThan(layout.hole.left);
});
it('uses the right side for controls on the left', () => {
  const layout = positionWalkthrough(rect(40, 100, 350, 300), { width: 1440, height: 900 }, { width: 380, height: 350 });
  expect(layout.side).toBe('right');
  expect(layout.left).toBeGreaterThan(layout.hole.left + layout.hole.width);
});
it('docks on mobile and leaves the highlighted area above the popup', () => {
  const layout = positionWalkthrough(rect(14, 36, 362, 600), { width: 390, height: 844 }, { width: 358, height: 360 });
  expect(layout.side).toBe('bottom');
  expect(layout.left).toBe(16);
  expect(layout.top + 360).toBeLessThanOrEqual(844);
  expect(layout.hole.top + layout.hole.height).toBeLessThan(layout.top);
});
it('clips oversized or partially scrolled targets to the viewport', () => {
  const layout = positionWalkthrough(rect(-100, -200, 1700, 1400), { width: 1280, height: 800 }, { width: 380, height: 350 });
  expect(layout.hole.left).toBeGreaterThanOrEqual(0);
  expect(layout.hole.top).toBeGreaterThanOrEqual(0);
  expect(layout.hole.left + layout.hole.width).toBeLessThanOrEqual(1280);
  expect(layout.hole.top + layout.hole.height).toBeLessThan(layout.top);
});
