import { useRef, useState } from 'react';
import { downloadJson } from '../lib/storage';
import { parseBackup, type AppBackup } from '../lib/backup';

export function TimetableBackup({ createBackup, restore }: { createBackup: () => AppBackup; restore: (backup: AppBackup) => void }) {
  const [pending, setPending] = useState<AppBackup>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function read(file?: File) {
    setPending(undefined); setMessage('');
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error('Backup is too large (maximum 100 MB).');
      setPending(parseBackup(JSON.parse(await file.text())));
    } catch (error) { setMessage(error instanceof SyntaxError ? 'This file is not valid JSON. Choose an FFCS Helper backup.' : error instanceof Error ? error.message : 'Could not read backup.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return <details className="timetable-backup panel">
    <summary>Import / export timetable</summary>
    <p>Move your entire setup between devices: all timetables, pinned and registered classes, saved plans, courses, alternatives, blocked times, teacher and building choices, ranking preferences, FFCS rejections, and the course catalog.</p>
    <div className="backup-actions">
      <button type="button" className="secondary" onClick={() => {
        try { downloadJson(`ffcs-helper-backup-${new Date().toISOString().slice(0,10)}.json`, createBackup()); setMessage('Backup exported. Import this JSON file on your other device.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed.'); }
      }}>Export timetable backup</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Reading backup…' : 'Import timetable backup'}</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label="Choose timetable backup" hidden onChange={event => void read(event.target.files?.[0])} />
    </div>
    {pending && <section className="backup-review" aria-label="Review timetable import">
      <h3>Restore this setup?</h3>
      <p>{pending.catalog.semester} · {pending.calendars.length} timetables · {pending.plans.length} saved plans · {pending.shortlist.length} shortlisted courses · {pending.blockedTimes.length} time blocks</p>
      <p>Exported {new Date(pending.exportedAt).toLocaleString()}. This replaces all planner data and preferences on this device. Export your current setup first if you want to keep it.</p>
      <div className="backup-actions"><button type="button" onClick={() => {
        try { restore(pending); setPending(undefined); setMessage('Timetables and preferences imported and saved on this device.'); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.'); }
      }}>Replace device data and import</button><button type="button" className="secondary" onClick={() => setPending(undefined)}>Cancel</button></div>
    </section>}
    {message && <p role="status">{message}</p>}
  </details>;
}
