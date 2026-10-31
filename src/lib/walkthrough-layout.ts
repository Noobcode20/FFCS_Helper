type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Size = { width: number; height: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Keep the popup beside the spotlight, or dock it below on narrow screens. */
export function positionWalkthrough(target: Rect, viewport: Size, card: Size) {
  const margin = 16;
  const gap = 22;
  const leftRoom = target.left - gap - card.width >= margin;
  const rightRoom = target.right + gap + card.width <= viewport.width - margin;
  const side = leftRoom ? 'left' : rightRoom ? 'right' : 'bottom';
  const left = side === 'left' ? target.left - gap - card.width : side === 'right' ? target.right + gap : (viewport.width - card.width) / 2;
  const top = side === 'bottom' ? viewport.height - card.height - margin : clamp(target.top + Math.min(target.height, 320) / 2 - card.height / 2, margin, viewport.height - card.height - margin);
  const holeLeft = clamp(target.left - 8, 8, viewport.width - 8);
  const holeTop = clamp(target.top - 8, 8, viewport.height - 8);
  const holeRight = clamp(target.right + 8, holeLeft, viewport.width - 8);
  const holeBottom = clamp(target.bottom + 8, holeTop, side === 'bottom' ? Math.max(holeTop, top - gap) : viewport.height - 8);
  return { side, left: clamp(left, margin, viewport.width - card.width - margin), top: Math.max(margin, top), hole: { left: holeLeft, top: holeTop, width: holeRight - holeLeft, height: holeBottom - holeTop } };
}
