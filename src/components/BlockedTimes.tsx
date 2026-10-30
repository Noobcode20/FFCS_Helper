import { useEffect, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import type { BlockedWindow, Day } from "../lib/types";
import { formatClock, MAX_BLOCKED_WINDOWS, parseClock } from "../lib/blocked";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const allDays: Day[] = [0, 1, 2, 3, 4];

function daySummary(days: Day[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && sorted.join() === "0,1,2,3,4") return "Weekdays";
  if (sorted.join() === "1,2,3,4,5") return "Weekdays";
  return sorted.map((day) => dayLabels[day]).join(", ");
}

export function BlockedTimes({
  windows,
  onChange,
}: {
  windows: BlockedWindow[];
  onChange: (next: BlockedWindow[]) => void;
}) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [selectedDays, setSelectedDays] = useState<Day[]>(allDays);
  const [editingId, setEditingId] = useState<string | null>(null);
  function reportError(text: string) {
    window.dispatchEvent(new CustomEvent("ffcs-toast", { detail: text }));
  }

  useEffect(() => {
    const edit = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      const window = windows.find(item => item.id === id);
      if (!window) return;
      setEditingId(id);
      setStart(formatClock(window.start));
      setEnd(formatClock(window.end));
      setSelectedDays(window.days);
      document.getElementById("blocked-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("ffcs-edit-block", edit);
    return () => window.removeEventListener("ffcs-edit-block", edit);
  }, [windows]);

  function toggleDay(day: Day) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  function addBlock() {
    const startMinutes = parseClock(start);
    const endMinutes = parseClock(end);
    if (startMinutes === null || endMinutes === null) {
      reportError("Choose a valid start and end time.");
      return;
    }
    if (startMinutes >= endMinutes) {
      reportError("The end time must be after the start time.");
      return;
    }
    if (!selectedDays.length) {
      reportError("Pick at least one day to block.");
      return;
    }
    if (!editingId && windows.length >= MAX_BLOCKED_WINDOWS) {
      reportError(`Keep up to ${MAX_BLOCKED_WINDOWS} blocked times.`);
      return;
    }
    const days = [...selectedDays].sort((a, b) => a - b);
    const duplicate = windows.some(
      (item) => item.id !== editingId &&
        item.start === startMinutes &&
        item.end === endMinutes &&
        item.days.length === days.length &&
        item.days.every((day) => days.includes(day)),
    );
    if (duplicate) {
      reportError("That blocked time is already in the list.");
      return;
    }
    const nextWindow = { id: editingId ?? crypto.randomUUID(), days, start: startMinutes, end: endMinutes };
    onChange(editingId ? windows.map(item => item.id === editingId ? nextWindow : item) : [...windows, nextWindow]);
    setEditingId(null);
  }

  return (
    <section className="panel blocked-panel" aria-labelledby="blocked-title">
      <div className="blocked-head">
        <div>
          <span className="eyebrow">KEEP TIME FREE</span>
          <h2 id="blocked-title">Blocked times</h2>
          <p>Classes in these windows appear greyed out on the calendar and are skipped by the scheduler.</p>
        </div>
        <span className="tag">{windows.length ? `${windows.length} block${windows.length === 1 ? "" : "s"}` : "None"}</span>
      </div>
      <div className="blocked-controls">
        <label>
          From
          <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          To
          <input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <div className="blocked-days" role="group" aria-label="Days to block">
          {dayLabels.map((label, day) => (
            <button
              type="button"
              key={label}
              className={selectedDays.includes(day as Day) ? "active" : "secondary"}
              aria-pressed={selectedDays.includes(day as Day)}
              aria-label={label}
              onClick={() => toggleDay(day as Day)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="compact blocked-add" onClick={addBlock}>
          <Plus size={15} />
          {editingId ? "Save" : "Block"}
        </button>
        {editingId && <button type="button" className="compact secondary" onClick={() => setEditingId(null)}>Cancel</button>}
      </div>
      {windows.length > 0 && (
        <ul className="blocked-list">
          {windows.map((window) => (
            <li className="blocked-chip" key={window.id}>
              <span>{daySummary(window.days)} · {formatClock(window.start)}–{formatClock(window.end)}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove block ${daySummary(window.days)} ${formatClock(window.start)} to ${formatClock(window.end)}`}
                onClick={() => onChange(windows.filter((item) => item.id !== window.id))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
