import { useEffect, useRef, useState } from 'react';
import type { BlockedWindow, Day } from '../lib/types';
import { formatClock as time } from '../lib/blocked';

type Mode = 'move' | 'start' | 'end';
const STEP = 30;
const snap = (value: number) => Math.round(value / STEP) * STEP;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function CalendarBlock({ block, day, scale, origin = 0, onCommit, onDelete }: {
  block: BlockedWindow; day: Day; scale: number; origin?: number;
  onCommit: (next: BlockedWindow, sourceDay: Day) => void; onDelete: () => void;
}) {
  const [announcement, setAnnouncement] = useState('');
  const active = useRef<null | { mode: Mode; x: number; y: number; element: HTMLDivElement; pointer: number; scroll: HTMLElement; scrollTop: number; scrollLeft: number; columns: HTMLElement[]; next: BlockedWindow; frame: number; draw?: () => void }>(null);
  const cleanup = () => {
    const a = active.current;
    if (!a) return;
    cancelAnimationFrame(a.frame);
    a.element.style.transform = '';
    a.element.style.height = `${(block.end - block.start) * scale}px`;
    a.element.classList.remove('dragging');
    active.current = null;
  };
  useEffect(() => () => cleanup(), []);
  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const element = event.currentTarget;
    const scroll = element.closest('.week-scroll') as HTMLElement;
    const columns = Array.from(scroll.querySelectorAll<HTMLElement>('.day-events'));
    const mode = (event.target as HTMLElement).dataset.edge as Mode || 'move';
    (event.target as HTMLElement).closest<HTMLElement>('[tabindex]')?.focus({preventScroll:true});
    active.current = { mode, x: event.clientX, y: event.clientY, element, pointer: event.pointerId, scroll, scrollTop: scroll.scrollTop, scrollLeft: scroll.scrollLeft, columns, next: block, frame: 0 };
    element.setPointerCapture(event.pointerId);
    element.classList.add('dragging');
    const draw = () => {
      const a = active.current;
      if (!a) return;
      const viewport = scroll.getBoundingClientRect();
      if (a.y < viewport.top + 44) scroll.scrollTop -= 10;
      else if (a.y > viewport.bottom - 40) scroll.scrollTop += 10;
      if (a.x < viewport.left + 25) scroll.scrollLeft -= 8;
      else if (a.x > viewport.right - 25) scroll.scrollLeft += 8;
      const delta = (a.y - event.clientY + scroll.scrollTop - a.scrollTop) / scale;
      let start = block.start, end = block.end;
      let targetDay = day;
      if (mode === 'move') {
        start = clamp(block.start + snap(delta), 0, 1440 - (block.end - block.start));
        end = start + block.end - block.start;
        const nearest = columns.reduce((best, column, i) => Math.abs(a.x - (column.getBoundingClientRect().left + column.clientWidth / 2)) < Math.abs(a.x - (columns[best].getBoundingClientRect().left + columns[best].clientWidth / 2)) ? i : best, 0);
        targetDay = nearest as Day;
      } else if (mode === 'start') start = clamp(snap(block.start + delta), 0, block.end - STEP);
      else end = clamp(snap(block.end + delta), block.start + STEP, 1440);
      a.next = { ...block, start, end, days: [targetDay] };
      const dx = mode === 'move' ? columns[targetDay].getBoundingClientRect().left - columns[day].getBoundingClientRect().left : 0;
      element.style.transform = `translate3d(${dx}px, ${(start - block.start) * scale}px, 0)`;
      element.style.height = `${(end - start) * scale}px`;
      const label = element.querySelector('small');
      if (label) label.textContent = `${time(start)}–${time(end)}`;
      a.frame = requestAnimationFrame(draw);
    };
    active.current.draw = draw;
    active.current.frame = requestAnimationFrame(draw);
  };
  const finish = (cancel = false) => {
    const a = active.current;
    if (!a) return;
    if (!cancel) { cancelAnimationFrame(a.frame); a.draw?.(); }
    const next = a.next;
    cleanup();
    if (!cancel) { onCommit(next, day); setAnnouncement(`${time(next.start)} to ${time(next.end)}`); }
    const label = a.element.querySelector('small');
    if (label) label.textContent = `${time(cancel ? block.start : next.start)}–${time(cancel ? block.end : next.end)}`;
  };
  return <div className="blocked-slot direct-block" style={{top: (block.start - origin) * scale, height: (block.end - block.start) * scale}} onPointerDown={begin} onPointerMove={event => { const a = active.current; if (a?.pointer === event.pointerId) { a.x = event.clientX; a.y = event.clientY; } }} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}>
    <div className="block-resize block-resize-top" data-edge="start" role="slider" tabIndex={0} aria-label="Block start time" aria-valuemin={0} aria-valuemax={block.end - STEP} aria-valuenow={block.start} aria-valuetext={time(block.start)} onKeyDown={event => { if (['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); onCommit({...block, start:clamp(block.start + (event.key === 'ArrowUp' ? -STEP : STEP), 0, block.end - STEP)}, day); } }} />
    <div className="block-center" tabIndex={0} role="button" aria-label={`Move blocked time, ${time(block.start)} to ${time(block.end)}. Use arrow keys to move; Delete to remove.`} onKeyDown={event => {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); onDelete(); }
      if (event.key === 'Escape') finish(true);
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const start = clamp(block.start + (event.key === 'ArrowUp' ? -STEP : event.key === 'ArrowDown' ? STEP : 0), 0, 1440 - (block.end - block.start));
      onCommit({...block, start, end:start + block.end - block.start, days:[clamp(day + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0),0,4) as Day]}, day);
    }}><span title={block.calendarId ? "Only this timetable" : "All timetables"}>Blocked · {block.calendarId ? "This" : "All"}</span><small>{time(block.start)}–{time(block.end)}</small></div>
    <button type="button" className="block-delete" aria-label="Delete blocked time" onClick={onDelete}>×</button>
    <div className="block-resize block-resize-bottom" data-edge="end" role="slider" tabIndex={0} aria-label="Block end time" aria-valuemin={block.start + STEP} aria-valuemax={1440} aria-valuenow={block.end} aria-valuetext={time(block.end)} onKeyDown={event => { if (['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); onCommit({...block, end:clamp(block.end + (event.key === 'ArrowUp' ? -STEP : STEP), block.start + STEP, 1440)}, day); } }} />
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </div>;
}
