# Verification record — 2026-10-27

The application was built from the initially empty workspace and verified after integrating isolated implementation worktrees. Tests below were run by the supervisor against the integrated checkout, rather than relying only on delegated summaries.

## Automated checks

- `npm test`: **55 tests across seven files pass**. Includes search titles/codes/partial names/faculty, transpositions/typos/acronyms, precise code lookup, malformed imports, real XLSX/formula rejection, CSV quoting, unknown credits, source caveats, duplicate identities, missing meetings, overlapping linked components, half-open intervals, multiple alternatives, impossible combinations, soft preference ranking, deterministic bounded generation, saved-plan compatibility, backup corruption and calendar dates.
- Faculty rendering tests verify missing ratings, source/date/sample-size context, separate course/overall groups, and no invented aggregate distribution. Synthetic reviews exist only in the test fixture, never the bundled catalog.
- `python3 scripts/refresh-catalog.py --fetch --check`: all **15** immutable public source files match their pinned SHA-256 hashes, byte lengths, expected counts and regenerated outputs. No source changes were written by this check.
- `python3 -m unittest discover -s scripts -p 'test_*.py' -v`: **six tests pass**. Includes malicious-source rejection, row accounting, real cross-name slot collisions, complete paired labs and exclusion of ambiguous embedded courses.
- `node scripts/validate-catalog.mjs`: **0 importer errors**, all **913** offerings accepted by the production engine, seven preserved caveats, **20** valid alternatives for BCSE202L + BCSE202P + BCSE302L, 396 attempted assignments, no truncation.
- `npm run build`: TypeScript and Vite production build pass. Vite reports large chunks: bundled catalog/application ~163 kB gzip; XLSX reader ~271 kB gzip and loaded only on XLSX import. This is a performance optimization opportunity, not a build failure.
- `npm audit`: **0 vulnerabilities**. `git diff --check`: clean.

## Browser checks

T3 collaborative Chromium preview, desktop 1280×800 and mobile CSS viewports 390×844 and 320×780:

1. Loaded the real historical catalog and confirmed the prominent semester/timing warnings.
2. Queried `data strctures`, found Data Structures and Algorithms plus its lab; exact `BCSE202L` returns the precise course. Source faculty-name search is also covered by the real-catalog integration test.
3. Selected a theory section. An overlapping differently named lab block was visibly flagged and its selection disabled. Selected a non-overlapping lab instead.
4. Generated ranked alternatives with a morning preference, applied alternatives and saved two distinct plans.
5. Reloaded the page, loaded a plan, compared the theory/lab sections in the two saved plans, exported a JSON backup, and restored it without duplicate plans.
6. Downloaded CSV and ICS through the UI. Read the downloaded files independently: two plans in JSON, four selected meetings in CSV with 13 columns, and four VEVENTs in the selected Monday week with Asia/Kolkata timing in ICS.
7. Uploaded the bundled JSON, reviewed its full validation preview and applied it. Created CSV and XLSX files from a real source subset (no invented offerings), previewed both with zero errors, applied the XLSX, and observed the active two-course imported catalog. Restored the bundled JSON through the same UI.
8. Uploaded a deliberately corrupted JSON catalog with faculty records removed: validation errors displayed and no apply action was offered.
9. Opened faculty directory, searched IYAPPAN, and confirmed “No review data” rather than a fabricated score. VITor links to the verified external platform; there is no protected data fetch or public review-write endpoint.
10. Found and fixed an intrinsic-width mobile navigation overflow. Rechecked document width equals 320 and 390 pixels. The timetable has intentional internal horizontal scrolling. Mobile jump links reach the calendar below the sticky section navigation.
11. Inspected a populated hourly calendar: theory/tutorial/lab blocks are positioned by their start and duration, with India-time hour labels and full accessible meeting descriptions.
12. Served `dist/` with `npm run preview` on port 5176. Verified the production app loads, searches BCSE202L, selects sections and generates 12 alternatives for two real courses.

The main development server is available at `http://127.0.0.1:5175/` (`npm run dev -- --port 5175 --strictPort`). No public deployment was created.

## Independent review and limits

The requested Beam coding model hit a provider free-usage limit before producing changes, so implementation fell back to available Codex agents. Nemotron reviewed the core; its concrete ambiguous-ID backup concern was already fixed in the integrated checkout. Its maxResults=0 clamping and blank-query catalog observations are intentional behavior. A final Luna review of the integrated app reported no concrete reproducible findings.

These checks establish planner behavior **against supplied intervals**, not current VTOP correctness. The MIT CodeChef SCOPE snapshot has an unknown semester, null credits and derived planning IDs, and its grid geometry differs from another public planner's timing chart. Five unlinked embedded theory/lab courses are omitted. No current enrollment eligibility, seat availability, official section ID, registration outcome or third-party rating dataset was verified. Exact-name faculty records do not establish cross-platform employee identity.

Native public review submission and cloud synchronization are unavailable by design in this static local app. Browser print/PDF is wired to the native print dialog; an actual OS PDF save was not independently exercised. Mobile checks change CSS viewport sizes and do not prove behavior on physical iOS/Android hardware. No live university registration was attempted or automated.

## Review-document update — 2026-10-28

The supplied 12 documents are now incorporated as a separately attributed library. The current suite passes **63 tests**. `npm run reviews:validate` confirms 1,284 displayed records (701 numeric, 583 written-only), all 608 primary PDF rating rows, 172 matched catalog faculty names, preserved citations and an unchanged saved-plan fingerprint. Browser checks cover numeric and qualitative profiles, actual section rating badges, source references, unknown dates/counts, directory filtering/sorting and mobile width. The production build passes; application/data chunk is now approximately 249 kB gzip. See `docs/REVIEW_SOURCES.md` for exact scope, exclusions and matching rules. This supersedes the earlier statement that no supplied review dataset was available; the historical offering/timing limitations remain unchanged.

## Public release audit — 2026-10-30

Four GPT-6 Luna Low reviewers audited privacy, production size, browser flows and scheduler regressions. Clean `npm ci`, all 92 tests, TypeScript/Vite production build and `npm audit` pass (zero reported vulnerabilities). Review validation retains 1,284 displayed records and unchanged plan fingerprints. VTOP export consistency retains 149 course entries and 1,014 allocation rows. Account identifiers were scrubbed from source data and generated output; old local Git history must never be pushed.

Production initially transfers approximately 137.5 kB gzipped JavaScript and 16.6 kB CSS. Reviews (85.3 kB gzip) and XLSX support (269.3 kB gzip) are separate on-demand chunks. Source/reproducibility assets stay outside the deployed dist directory. Remote fonts were removed; the app contains no analytics or upload request code. CSP meta blocks connect APIs. GitHub Pages does not apply the optional `_headers` file; its HTTP-only protections therefore are not claimed on Pages.

Ego-browser verified current course browsing, faculty allocation selection, shortlist persistence, generation, calendar persistence after reload, FFCS mode/reset, faculty directory, active-calendar plan save/load, CSV download and JSON backup. A 390px viewport had no document overflow. Saved plans/data and faculty navigation were restored, including active calendar save/export controls. T3 preview snapshot/evaluation both timed out; these browser observations came from ego-browser instead. Physical mobile devices, live seat availability and native OS PDF saving are not verified.

Clock-time caveat remains visible: current Winter allocations use a generic VTOP template displayed for Fall; students must verify Winter timings and registration in VTOP. This is a planning aid, not registration automation.
