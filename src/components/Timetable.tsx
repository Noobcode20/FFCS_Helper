import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PushPin } from "@phosphor-icons/react";
import { CalendarBlock } from "./CalendarBlock";

import type { BlockedWindow, Catalog, Day, Offering } from "../lib/types";
import { MAX_BLOCKED_WINDOWS } from "../lib/blocked";
import { meetingBlockedBy } from "../lib/blocked";
export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];
export const time = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function Timetable({
  title = "Weekly timetable",
  catalog,
  offerings,
  previewOfferingId = "",
  blockedTimes = [],
  onChangeBlockedTimes,
  onSelectClass,
  onAddBlock,
  pinnedOfferingIds = [],
  onTogglePin,
  onGenerateAround,
  onError,
  generating = false,
  canGenerate = true,
}: {
  title?: string;
  catalog: Catalog;
  offerings: Offering[];
  previewOfferingId?: string;
  blockedTimes?: BlockedWindow[];
  onChangeBlockedTimes?: (next: BlockedWindow[]) => void;
  onAddBlock?: (block: BlockedWindow, scope: 'this' | 'all') => void;
  pinnedOfferingIds?: string[];
  onTogglePin?: (offeringId: string) => void;
  onGenerateAround?: () => void;
  onError?: (message: string) => void;
  generating?: boolean;
  canGenerate?: boolean;
  onSelectClass?: (courseId: string, offeringId: string) => void;
}) {
  const preview = catalog.offerings.find((o) => o.id === previewOfferingId && !offerings.some((x) => x.id === o.id));
  const allMeetings = [...offerings, ...(preview ? [preview] : [])].flatMap((o) =>
    o.components.flatMap((c, componentIndex) =>
      c.meetings.map((m, i) => ({
        ...m,
        key: `${o.id}-${componentIndex}-${i}`,
        offeringId: o.id,
        courseId: o.courseId,
        course: catalog.courses.find((x) => x.id === o.courseId),
        section: o.section,
        type: c.type,
        venue: c.venue,
        preview: o.id === preview?.id,
      })),
    ),
  );
  const meetings = allMeetings;
  const blockedCount = allMeetings.filter((m) => meetingBlockedBy(m, blockedTimes)).length;
  // Keep a consistent full-day timeline so the calendar does not shrink to
  // only the hours occupied by the current classes.
  const first = 7 * 60;
  const last = 22 * 60;
  const scale = 0.9;
  const [pendingBlock, setPendingBlock] = useState<BlockedWindow | null>(null);
  const scopeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pendingBlock) scopeDialog.current?.showModal();
    else scopeDialog.current?.close();
  }, [pendingBlock]);
  const savePendingBlock = (scope: 'this' | 'all') => {
    if (!pendingBlock) return;
    if (onAddBlock) onAddBlock(pendingBlock, scope);
    else onChangeBlockedTimes?.([...blockedTimes, pendingBlock]);
    setPendingBlock(null);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, []);
  const commitBlock = (next: BlockedWindow, sourceDay: Day) => {
    // A weekday block can be adjusted independently without moving its other days.
    const original = blockedTimes.find(item => item.id === next.id);
    if (!original) return;
    const remainingDays = original.days.filter(day => day !== sourceDay);
    if (remainingDays.length && blockedTimes.length >= MAX_BLOCKED_WINDOWS) { onError?.("Delete a block before adjusting one day of a repeated block (50-block limit)."); return; }
    onError?.('');
    onChangeBlockedTimes?.(blockedTimes.flatMap(item => item.id !== next.id ? [item] : [
      ...(remainingDays.length ? [{...original, days:remainingDays}] : []),
      {...next, id: remainingDays.length ? crypto.randomUUID() : next.id, days:[next.days.includes(sourceDay) ? sourceDay : next.days[0]]},
    ]));
  };
  const addBlock = () => {
    if (blockedTimes.length >= MAX_BLOCKED_WINDOWS) return;
    const start = Math.min(21 * 60, Math.max(first, Math.round((scrollRef.current?.scrollTop ?? 0) / scale / 30) * 30 + first + 60));
    setPendingBlock({id:crypto.randomUUID(), days:[0], start, end:start + 60});
  };
  const height = (last - first) * scale;
  const hours = Array.from({length: (last - first) / 60}, (_, i) => first + i * 60);
  return (
    <section className="panel timetable" aria-labelledby="week-title">
      <div className="panel-heading">
        <div>
          <h2 id="week-title">{title}</h2>
        </div>
          <div className="timetable-tags">
            <span className="tag">{meetings.length} class{meetings.length === 1 ? "" : "es"}</span>
            {onGenerateAround && <button type="button" className="button-secondary calendar-generate-button" disabled={generating || !canGenerate} title="Build schedules from shortlisted courses, keeping this calendar’s pinned classes fixed and respecting its blocked times." onClick={onGenerateAround}>{generating ? "Generating alternatives…" : "Generate around this calendar"}</button>}
            {onChangeBlockedTimes && <button type="button" className="compact time-block-add" disabled={blockedTimes.length >= MAX_BLOCKED_WINDOWS} onClick={addBlock}>+ Time block</button>}
          </div>
      </div>
      {blockedCount > 0 && <div className="blocked-summary"><span className="tag blocked-tag">{blockedCount} class{blockedCount === 1 ? "" : "es"} inside blocked times</span></div>}
      <dialog ref={scopeDialog} className="block-scope-dialog" aria-labelledby="block-scope-title" onCancel={() => setPendingBlock(null)}>
        <h3 id="block-scope-title">Where should this time block apply?</h3>
        <p>Choose which timetables should keep this time free.</p>
        <div className="block-scope-actions">
          <button type="button" onClick={() => savePendingBlock('this')}>Only this timetable</button>
          <button type="button" onClick={() => savePendingBlock('all')}>All timetables</button>
          <button type="button" className="secondary" onClick={() => setPendingBlock(null)}>Cancel</button>
        </div>
      </dialog>
      <div
        className="week-scroll direct-calendar-scroll"
        ref={scrollRef}
        tabIndex={0}
        aria-label="Weekly timetable, scroll horizontally for all days"
      >
        <div className="week-grid timeline-grid">
          <div className="time-column"><h3>IST</h3><div className="hour-labels" style={{height}}>{hours.map(hour => <span key={hour} style={{top: (hour - first) * scale}}>{time(hour)}</span>)}</div></div>
          {days.map((day, index) => (
            <div className="day" key={day}>
              <h3>
                {day.slice(0, 3)}
                <span>
                  {meetings.filter((m) => m.day === index).length || "—"}
                </span>
              </h3>
              <div className="day-events" style={{height}}>
                {blockedTimes
                  .filter((w) => w.days.includes(index as Day))
                  .map((w) => (
                    <CalendarBlock key={w.id} block={w} day={index as Day} scale={scale} origin={first} onCommit={commitBlock} onDelete={() => onChangeBlockedTimes?.(blockedTimes.flatMap(item => item.id !== w.id ? [item] : item.days.length > 1 ? [{...item, days:item.days.filter(day => day !== index)}] : []))} />
                  ))}
                {meetings
                  .filter((m) => m.day === index)
                  .sort((a, b) => a.start - b.start)
                  .map((m) => {
                    const blocked = !!meetingBlockedBy(m, blockedTimes);
                    return (
                    <div className={`meeting ${m.preview ? "meeting-preview" : ""} ${blocked ? "meeting-blocked" : ""} ${pinnedOfferingIds.includes(m.offeringId) ? "meeting-pinned" : ""}`} key={m.key} role="group" aria-label={`${m.preview ? "Preview: " : ""}${blocked ? "Inside blocked time: " : ""}${m.course?.code} ${m.course?.title}, ${day} ${time(m.start)} to ${time(m.end)}, ${m.type} ${m.slot}, ${m.venue || 'venue unavailable'}. Open subject and faculty`} title={`${m.preview ? "Preview · " : ""}${blocked ? "Inside blocked time · " : ""}${m.course?.title} | ${m.section} | ${m.type} | ${m.venue || 'Venue unavailable'}`} style={{top: (m.start-first)*scale, height: (m.end-m.start)*scale}}>
                      <button type="button" className="meeting-open" onClick={() => onSelectClass?.(m.courseId, m.offeringId)} aria-label={`Open ${m.course?.code} subject and faculty`}>
                      <span className="meeting-time">
                        {m.preview ? "Preview · " : ""}{time(m.start)}–{time(m.end)}
                      </span>
                      <strong>{m.course?.code}</strong>
                      <small>{m.venue || m.type}</small>
                      </button>
                      {!m.preview && onTogglePin && <button type="button" className="meeting-pin" aria-label={`${pinnedOfferingIds.includes(m.offeringId) ? 'Unpin' : 'Pin'} ${m.course?.code} and all related classes`} aria-pressed={pinnedOfferingIds.includes(m.offeringId)} title={pinnedOfferingIds.includes(m.offeringId) ? 'Unpin all related classes' : 'Pin all related classes'} onClick={() => onTogglePin(m.offeringId)}><PushPin size={14} weight={pinnedOfferingIds.includes(m.offeringId) ? 'fill' : 'regular'} /></button>}
                    </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
