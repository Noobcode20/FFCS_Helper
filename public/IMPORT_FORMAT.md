# Import and backup formats

See [Privacy](./PRIVACY.md) for how imported schedules and plans are handled.

Catalog JSON uses `version: 1`, campus `Vellore`, a nonempty semester, provenance (`source`, `url`, `importedAt`, optional `updatedAt`, `status`), and separate arrays `courses`, `faculty`, `offerings`, `reviews`. See `src/lib/types.ts` and download the loaded catalog in the interface for a complete real example.

CSV and XLSX use the **first worksheet**, one row per meeting, with these case-sensitive headers:

```
course_id,code,title,credits,faculty_id,faculty,offering_id,section,component,slot,day,start,end,venue
```

`venue` is optional. Keep `credits` blank or use `unknown` when the source does not provide credits; JSON uses `null`. Do not infer credits from contact hours. `component` is `theory`, `lab`, `tutorial` or `project`. `day` is Mon–Sun; times are HH:MM in local campus time. IDs must be stable and nonempty. Repeated course/faculty IDs must have identical metadata. Repeated offering IDs must refer to the same course, faculty and section. Use the **same offering_id** for theory/lab only when the source explicitly links those components; every linked component is selected together. Separate L/P course codes remain separate courses. Do not infer professor identity from a similar name. No implicit slot-to-time lookup is performed on imported files: enter every real meeting interval, including tutorial hours.

Enter a source and semester before CSV/XLSX upload. These imports are marked `imported`, never independently verified. The preview is all-or-nothing: duplicate IDs, broken references, missing times, overlapping linked components, conflicting identities, invalid ratings and unsafe URLs are rejected. Applying a preview replaces the local catalog; it does not write to an external server. Export the previous catalog and plan backup before switching semesters. Limits: 20 MB and bounded record counts. XLSX formulas are not evaluated.

Review JSON records require a source, date, rating 1–5, sample size and valid faculty/course references. Individual review records normally have sampleSize 1. A provider's aggregate is one record with its actual sampleSize, and must not be duplicated alongside its underlying individual reviews. Imported reviews are user supplied; no claim of authenticity or moderation is made. Native public review submission is intentionally unavailable until authentication, moderation and abuse controls exist.

## Move to another device

Open **Import / export timetable** at the bottom of the planner and choose **Export timetable backup**. Transfer the JSON file to your other device, open the same menu, and choose **Import timetable backup**. Review the summary, then choose **Replace device data and import**. If the practice walkthrough is open, skip it first.

The full backup (`format: "ffcs-helper-backup"`, `version: 1`) includes the catalog and reviews currently loaded in the app, all calendars and their pins, registered classes and FFCS original selections, the active calendar, saved plans, shortlist, alternatives, global and calendar-specific blocked times, branch, teacher/building choices, all ranking settings, building colors, FFCS rejections, and the use-current-calendar setting. It works even without saved plans. Import replaces this device's planner data and applies it immediately; settings also survive reloads. Export the destination's current setup first if you want to keep it. Invalid or unsupported files are rejected before any data changes. Only FFCS Helper storage is changed. Maximum full-backup file size: 100 MB; your browser must have room to store the imported data.

## Legacy saved-plan backups

Plan backup JSON is an array of saved plans (or `{ "plans": [...] }`). Restore requires the same catalog fingerprint and semester, rejects unknown offerings, repeated courses and timetable clashes. These legacy plan-only backups do not include the catalog: export both, or use the full timetable backup above. Saved plans and imported data live in this browser. Clearing browser data removes them; export backups for portability. No cloud sync or VTOP integration is used.

CSV timetable export is a readable report, not the catalog import format. ICS export contains one explicit Monday–Sunday week in Asia/Kolkata; no semester duration is guessed. Use the browser print dialog to save the weekly timetable as PDF.
