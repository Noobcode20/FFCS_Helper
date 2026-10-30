# FFCS Helper

A course-first FFCS planning website for VIT Vellore. Basic planning runs entirely in the browser: no account, database, VTOP credentials, registration automation or external provider is needed.

## Run locally

Requires a current Node.js LTS release (Node 22.12+ or Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To create a static deployment:

```sh
npm test
npm run build
npm run preview
```

Public planner: **https://noobcode20.github.io/FFCS_Helper/**

Deploy the `dist/` directory to a static web host. No environment variables or secrets are required. Pushes to `master` run tests and build, then publish through GitHub Pages.

Plans, preferences and imported catalogs stay in browser storage. There are no analytics, remote fonts, accounts or upload endpoints. The host receives normal page/asset requests (including your IP address); opening an external source link contacts that site. See [privacy details](public/PRIVACY.md). Export a backup before clearing browser data or switching browsers.

## What it does

- Searches courses by name, code, aliases and professor, including typo tolerance.
- Shows all known catalog sections, component slots and explicit meeting times.
- Lets students select sections, reject clashes, include courses for generation and constrain acceptable sections.
- Generates bounded deterministic alternatives and ranks soft time-of-day, free-day, faculty and gap preferences.
- Saves named plans locally, compares alternatives, restores backups and exports JSON, CSV and a chosen calendar week as ICS. Browser print supports PDF.
- Previews and validates JSON/CSV/XLSX catalog replacements before applying them.
- Preserves source metadata and distinguishes historical/imported data from provider claims of verification.
- Includes the supplied professor rating/review documents, matches faculty conservatively, and preserves explicit missing-data states.

See [review source audit](docs/REVIEW_SOURCES.md), [verification evidence](docs/VERIFICATION.md), [data sources](docs/DATA_SOURCES.md), [import and backup formats](docs/IMPORT_FORMAT.md) and [third-party attribution](THIRD_PARTY_NOTICES.md).

## Architecture

React + TypeScript + Vite is a static application. `src/lib/types.ts` defines normalized courses, faculty, offerings, linked components, minute-based meetings, reviews and provenance. `search.ts` and `engine.ts` are pure deterministic functions. The scheduler uses actual half-open time intervals; differently named slots can clash, and adjacent periods do not. An offering is an atomic explicitly linked component bundle. Separate theory/lab course codes are not silently paired.

`importer.ts` validates referential integrity, unique IDs, consistent course/faculty identities, interval completeness and internal clashes. CSV/XLSX imports require explicit source/semester metadata and meeting times; it does not guess slot mappings. ExcelJS is dynamically loaded only for XLSX. Formula cells are rejected. The full catalog is validated before replacing local state.

`storage.ts` fingerprints the catalog including section times. Plans from another semester/catalog require their original dataset. Backups reject missing sections, duplicate courses and clashes. CSV exports neutralize spreadsheet formulas. Calendar exports use the selected Monday week and Asia/Kolkata, without guessing semester duration.

## Boundaries

Source data can be historical or incomplete. The planner does not know current registration eligibility, seat counts, room changes or whether a professor is assigned to a student's program. Confirm the selected plan in VTOP manually. No generated schedule promises registration success.

All saved plans and imported catalogs are stored in this browser. Export both the catalog and the plan backup for portability. There is no cloud synchronization. Public native reviews remain unavailable until authentication, moderation, rate limits and abuse reporting can be operated responsibly; no unmoderated review endpoint is exposed. Imported review data is user supplied, not independently authenticated.

A source refresh is a deliberate maintainer/import action, not an automatic background scrape. If a provider is offline the bundled or locally imported catalog remains available, with its provenance and age.

## VTOP data maintenance

For account selection, complete faculty-table capture, ETH/ELA pairing, and troubleshooting, read the directory-local [VTOP scraping skill](SKILL.md). Update that guide when the source workflow changes. Capture provenance and current dataset totals are in [data/README.md](data/README.md).

### During FFCS registration

Start with your planned calendar, then turn on **FFCS mode**. Press ✓ only after
VTOP confirms registration; that exact section stays fixed, including after a
refresh. Press × when a teacher is unavailable. Recovery tries the same meeting
times first, then changes as few unregistered sections as possible, keeping every
course and reporting any other courses changed. Planning preferences and saved
calendar exclusions do not constrain this recovery. Rejected teachers are remembered
per course across repairs. Testing mode clears and stops remembering rejections.
Seat availability is entered by you; the app does not read live seats or register
courses in VTOP. Incomplete or ambiguous allocations cannot be used for recovery.

In normal mode, **Alternative classes** lets you assign ordered backup courses
for each shortlisted or timetabled course. FFCS uses them only after no usable
replacement for the original course can be found; backups already in the timetable
are skipped. Remaining backups carry forward when a course is substituted. Faculty
marked Prefer, plus the ranked faculty list, break ties between equally small
repairs. Registered courses disappear from the FFCS list but remain fixed in the
saved timetable.
