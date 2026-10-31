# VTOP Winter 2026–27 faculty lists

The prior shared allocation snapshot has been replaced with two separate student-account captures from **VTOP > Academics > Course Registration Allocation**:

- `vtop-faculty-list-ece-winter-2026-27.json` — ECE account capture; personal identifiers are omitted.
- `vtop-faculty-list-ecm-winter-2026-27.json` — ECM account capture; personal identifiers are omitted.
- `vtop-allocation-winter-2026-27.json` — combined source snapshot with both accounts nested separately and every course retained under its VTOP category.
- `vtop-allocation-winter-2026-27.csv` — one row per VTOP faculty allocation, with account, category, course ID/name, faculty, exact slot label, venue, and course type.
- `vtop-schedules-winter-2026-27.json` — account-tagged course groups used by the planner. Account is included in course identity so same-code courses from ECE and ECM remain distinct.
- `vtop-faculty-explorer.html` — searchable table with separate account and category filters.

Capture totals: **ECE 79 course entries / 538 faculty rows**; **ECM 70 course entries / 476 faculty rows**. NC returned no courses for either account. The combined files retain all **1,014** faculty rows, including repeated courses and allocation rows. The two accounts share 58 category/course pairs; six course codes appear in different categories between the accounts. See each account file for the exact rows.

Slots are recorded exactly as VTOP displays them. This snapshot does not translate slot labels into weekdays or clock times. Confirm timetable timing and current availability in VTOP before registration.

The initial T3 browser profile lacked saved accounts. The live recapture below uses Eco Browser (`ego-browser`), as requested by the user.

## Live recapture — 2026-10-30

Both account source files were recaptured from **VTOP > Academics > Course Registration Allocation** in Eco Browser. The expected account identity and Winter Semester 2026-27 were checked in the live browser before each capture; account identifiers are not retained in the public artifacts.

- ECE: latest capture at **14:07 UTC**, **79 courses / 538 allocation rows**. Category counts: NC 0/0, UCC 24/294, PCC 10/90, CON 4/39, OEC 41/115. A second live pass matched the first row-for-row and in order. Compared with the older local capture, 10 courses differ in at least one tuple/order, with unchanged row counts.
- ECM: capture at **14:14 UTC**, **70 courses / 476 allocation rows**. Category counts: NC 0/0, UCC 17/270, PCC 8/52, CON 2/22, OEC 43/132. Compared with the older local capture, 6 courses differ in at least one tuple/order, with unchanged row counts.

The combined source contains **149 course entries / 1,014 allocation rows**. No required cell was empty. Both source files retain the exact four displayed allocation values, row order, cell spans, and raw allocation table row HTML. Account usernames, student IDs, and login names are intentionally omitted. The inspected rows do not provide an explicit lab pairing/group ID; keep their source order intact. Slot labels remain untranslated.

Navigation: **Academics → Course Registration Allocation**. The page displays Winter Semester 2026-27 and category select `curriculumCategory` (`NC`, `UCC`, `PCC`, `CON`, `OEC`); course select is `courseId`. Observed read endpoints:

- `academics/common/getCoursesListForCurriculmCategory` — POST fields `cccategory`, `authorizedID`, `_csrf`, `x`.
- `academics/common/getCoursesDetailForRegistration` — POST fields `courseCode`, `authorizedID`, `_csrf`, `x`.

The detail table headings are `Slot Detail`, `Venue`, `Faculty`, and `Course Type`. The capture script validates these headings and visible account/semester, captures one category per bounded page call, and only replaces a source file after every category validates. It stores no credentials or CSRF tokens.

To reuse `scripts/capture-vtop-account.mjs`, first log in through the browser and open the allocation page. Then pass an account-specific config through `ego-browser nodejs -e`:

```js
globalThis.VTOP_CAPTURE_CONFIG = {
  taskSpaceId: 2,
  pageLabel: 'p1',
  account: {
    label: 'ECM',
    // Supply expectedStudentId from a private local configuration at runtime.
    expectedStudentId: process.env.VTOP_EXPECTED_STUDENT_ID,
  },
  outputPath: '/absolute/path/to/data/vtop-faculty-list-ecm-winter-2026-27.json',
};
await import('file:///absolute/path/to/scripts/capture-vtop-account.mjs');
```

The script was run against the live ECM page to a temporary output. It produced 70 courses / 476 rows, zero missing cells, and an exact category/course/tuple sequence match with the saved fresh ECM source. A heading-selector issue found during this run was corrected before the final comparison.

## Calendar template evidence

`vtop-slot-template-vellore-2026-10-30.json` contains the generic Vellore slot grid read directly from VTOP → Time Table. Its displayed registered semester was **Fall Semester 2026-27**; Winter was not available in that registered-semester selector. The artifact contains generic slot labels and clocks only, with registered course details removed. It does not establish Winter registrations or independently verify Winter-specific times.

The grid has distinct THEORY and LAB clock rows. The earlier conversion incorrectly reused theory starts for lab cells. For example, lab L27+L28 is Friday 09:51–11:30 in this template, while L35+L36 is Monday 17:40–19:20. Calendar conversion must retain that source provenance, exact end values, and all slots across multi-block lab allocations. The user explicitly requires theory/lab pairs to occupy opposite halves of the day.

## Planner verification

The refreshed data was checked independently: all 1,014 saved allocation-row HTML fragments parse to their exact four captured cells, and every ordered account/category/course/slot/venue/faculty/type tuple matches the planner export, CSV, and explorer. `node scripts/rebuild-vtop-exports.mjs --check` verifies derived-file consistency without changing files.

Theory/lab combinations now obey the user’s opposite-half rule for every batch preference. Each lab alternative is a separate card containing its shared theory and that one lab. For RAVI S / BAECE102, E1+TE1 pairs with L35+L36 or L49+L50, and E2+TE2 with L5+L6 or L27+L28. Raw allocations remain separate and unchanged. Associations not resolved by the source faculty and unique opposite-half theory stay flagged; missing times, conflicting times, and unmapped course-type semantics remain visible but cannot enter a complete timetable.

Browser QA verified the four RAVI S cards, separate component rooms, and correct theory/lab calendar preview blocks. The final regression suite passes 78 tests and the production build succeeds (with Vite’s existing bundle-size warning).

## MCA live capture — 2026-10-31

`vtop-faculty-list-mca-winter-2026-27.json` was captured at **04:52 UTC** from authenticated VTOP → Academics → Course Registration Allocation after confirming the requested saved account identity privately and **Winter Semester 2026-27**. It contains **10 course entries / 58 allocation rows**, with zero empty required cells. Personal account identifiers and credentials are omitted.

The live MCA category selector differs from the undergraduate accounts: **UCC 2 courses / 12 rows; OEC 1 / 10; PFCC (Professional Core Courses) 3 / 20; PFEC (Professional Elective Courses) 4 / 16**. The capture script now reads every nonempty category option directly from the page, retaining the displayed category order and names. No undergraduate-only empty categories are invented for MCA.

All 58 original allocation-row HTML fragments independently parse to the exact captured slot, venue, faculty, and Course Type fields; no identity/token markers occur in those fragments. A live UI spot-check of PAMCA504 confirmed its eight ETH/ELA rows, including separate theory/lab venues. Source ordering, duplicates, row spans, and cell spans are preserved. This allocation snapshot records slot labels only; the existing Fall generic timetable-template provenance limitation still applies to derived calendar times.

## CSE CORE live capture — 2026-10-31

`vtop-faculty-list-cse-core-winter-2026-27.json` was captured at **05:12 UTC** from authenticated VTOP → Academics → Course Registration Allocation after privately verifying the requested account identity and **Winter Semester 2026-27**. The user-selected branch label is **CSE CORE**; VTOP curriculum categories remain separate and retain their exact labels.

The source contains **66 course entries / 1,115 allocation rows**, with zero missing required cells: **NC 0/0; UCC 23/375; PCC 8/588; CON 2/50; OEC 33/102**. Every category displayed by the live selector was captured, including the empty NC category. Course order, duplicate rows, exact faculty text, cell spans, and original allocation-row HTML are preserved.

An independent HTML parser verified all 1,115 row fragments against their four saved slot/venue/faculty/Course Type fields; summary totals match nested records. A fresh live UI comparison of **BACSE103 — Computation Structures** matched all **94 ordered rows**, including separate ETH/ELA entries and venues. No supplied login credentials, student identity, or CSRF markers occur in this source artifact. The existing Fall generic timetable-template provenance limitation still applies to derived calendar times.
