# VIT FFCS Helper

## Project idea

Build a modern, course-first FFCS (Fully Flexible Credit System) planning website for VIT students, initially focused on VIT Vellore. The product should provide the timetable-building utility of existing FFCS planners while making it easier to **find a course by name** and **choose a professor using relevant ratings and reviews**.

Reference products:
- https://ffcs.codechefvit.com/
- https://www.ultimateffcs.in/

These are product and data-discovery references, not a requirement to duplicate their visual design or scrape protected services.

## Goal

A student should be able to type a course name (for example, "Network Theory"), see matching courses and all currently available sections, compare the professors teaching them using trustworthy review information, and build a clash-free, preference-aware timetable with alternatives and backups.

The planner must clearly distinguish **verified current semester data**, **older/imported data**, and **unavailable information**. It should remain useful even when a third-party provider or rating source is unavailable.

## Target users and scope

- Primary users: VIT Vellore students choosing courses during FFCS registration.
- Initial scope: Vellore campus, with an architecture that can expand to other VIT campuses.
- Primary use: planning and comparing registration options; **not** automating VTOP registration, collecting VTOP credentials, or claiming to reserve seats.

## Core user experience

1. **Search first:** Search all available courses by full/partial title, code, aliases, common abbreviations, and professor. Show relevant results without forcing users through school/category navigation.
2. **See actual offerings:** For a course, show the semester, faculty assigned, section identifier, theory/lab components, slots, credits, and any other fields present in validated source data.
3. **Compare faculty:** Display course-specific and overall professor ratings, rating categories (such as teaching, workload, grading, and attendance-policy clarity), review count, review date, and source. Explicitly mark missing or low-sample information; never invent ratings.
4. **Build a timetable:** Add preferred or acceptable offerings, detect overlaps, handle applicable VIT slot rules and linked theory/lab components, and generate valid schedule options.
5. **Rank and compare:** Filter and rank valid schedules by user-selected priorities: faculty preferences, morning/afternoon preference, free days, compactness, and fewer gaps. Explain why each recommendation ranks highly.
6. **Save backups:** Let users save, compare, edit, export, and revisit multiple timetable plans. Support manual changes if faculty or slots change.
7. **Stay current:** Show source, semester and last-updated timestamps. Warn when data is stale, incomplete, or not yet verified.

## Data strategy

Obtaining accurate data is a first-class part of the project, not a detail to improvise later.

### Candidate sources to investigate

- CodeChef VIT FFCS (website and any public, appropriately licensed repository/data).
- Ultimate FFCS (publicly documented offerings, exports, or APIs if permission allows).
- Public VIT course/slot information and student-supplied course-offering exports.
- Faculty-review websites (such as VITor) **only if** access and reuse are permitted, or by linking out where appropriate.
- Opt-in student-submitted faculty reviews stored by this application.

### Import and integrity requirements

- Audit each source's actual availability, license, terms, API/export format, update frequency, and attribution requirements before reuse.
- Prefer official/public exports, permitted APIs, open datasets, and user-provided files over fragile scraping.
- No login-wall bypasses, credential collection, CAPTCHA bypasses, or undocumented assumptions that third-party APIs are available.
- Normalize courses, faculty, offerings, slots, semesters and reviews into separate records; deduplicate with stable identifiers and careful name matching.
- Preserve provenance and import timestamps per record. Flag discrepancies between sources; never silently merge conflicting professor identities or overwrite newer verified data with old data.
- Provide a practical CSV/XLSX/JSON import workflow and an administrator preview/validation step so the website works even without third-party integrations.
- Make failure of external providers nonfatal: show the last verified catalog and mark its age.

## Reviews and trust

- Course-specific reviews are preferable to a single global faculty ranking.
- Show rating distribution and sample size; separate overall rating from metrics such as teaching quality and workload.
- If gathering original reviews, provide abuse reporting, moderation, rate limiting, anti-spam controls, and reasonable verification without publicly exposing student identities.
- Do not present unverified claims or a very small sample as established fact. Allow a professor-name correction and review-reporting flow.
- Protect student privacy; do not expose enrollment records or collect unnecessary personal data.

## Timetable correctness

- Represent actual time intervals and campus-specific slot mappings, rather than assuming two differently named slots never clash.
- Validate theory/lab pairing and other course-specific constraints where applicable.
- Treat conflicts, duplicate selections, impossible combinations and missing slot information explicitly.
- Generate multiple valid alternatives, not just one result; explain unmet preferences when no valid schedule exists.
- Rating information affects ranking, **not** the correctness of clash detection.

## Design principles

- Fast and simple: search bar as the primary navigation, prominent course results, faculty comparison and readable weekly calendar.
- Mobile-friendly and accessible; keyboard navigation, clear contrast and informative empty/error states.
- Transparent: identify what is sourced, estimated, user-reported or unavailable.
- Useful without signing in for basic exploration; sign-in only where needed for sync, reviews or saved plans.

## Implementation approach

Investigate the existing repository before choosing or replacing a stack. For a new project, a reasonable default is Next.js + TypeScript, a clean component library, PostgreSQL for persistent data and full-text/fuzzy search, and a deterministic timetable engine. Prefer a straightforward design that can actually be tested and deployed. Do not require AI to generate schedules.

Suggested components:
- Search and course catalog
- Faculty profiles and reviews
- Offerings/semester import and validation
- Constraint-based timetable engine and schedule ranking
- Saved plans and exports
- Admin/source health tools

## Delivery priorities

### MVP — working FFCS planner
- Responsive course-first search across a real imported catalog (not hardcoded demo-only courses).
- Course detail and all known semester offerings, with faculty/slot information.
- Manual course selection and correct clash detection.
- Multiple generated schedules, preferences, calendar view, and saved backups.
- Repeatable validated import workflow with data provenance and freshness status.

### Next — faculty intelligence
- Faculty profiles, rating and review browsing with clear source/sample counts.
- Course-specific faculty comparison and filters.
- Moderated student-contributed review submission when authentication and abuse controls are ready.

### Later — refinement
- Personalized timetable scoring, improved review quality signals, change comparisons, notifications where useful, and additional campuses.

## Definition of done

The MVP is complete when a student can import or use a validated semester catalog, find a course by name or code, inspect its real offerings, select sections, generate multiple conflict-free timetables, save/compare/export a plan, and see clear warnings wherever the underlying data is missing or stale.

The faculty-intelligence milestone is complete when available real ratings and reviews are displayed with source/date/sample size and missing information is honestly labeled; ratings do not need to be fabricated or supplied by an unavailable third party.

Verify the experience with automated tests for search matching, import validation, slot collision detection, theory/lab combinations and ranking, plus an end-to-end user flow in the interface. Deliver working features instead of placeholder screens. Document verified data sources, remaining limitations and local setup.
