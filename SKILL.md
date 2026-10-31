---
name: vtop-faculty-allocation
description: Capture and repair this FFCS Helper directory’s ECE and ECM VTOP allocation data, including embedded theory and lab pairings.
---

# VTOP Faculty Allocation Scrape (Local)

This directory-local guide documents the Winter 2026–27 VTOP allocation capture. Keep it updated when VTOP changes its screens or fields.

## Browser

Use **Eco Browser** (the installed `ego-browser` CLI) for VTOP. The user’s saved-account dropdown and autofill are in that browser; the T3 preview default profile does not have them. Read the ego-browser skill and run `ego-browser skill`, create one task space for the capture, then reuse it. Select the saved username entry through the browser UI; do not print credentials or save them in this repository.

## Source and accounts

Use VTOP → Academics → Course Registration Allocation. Confirm **Winter Semester 2026-27** for this dataset. Capture each student account separately; do not combine or infer account identity from course codes.

- Select the saved account for the target dataset label (ECE or ECM) using credentials already stored in the browser. Verify the expected student ID locally before capture; never write usernames or student IDs into committed examples or exports.

Other form fields are auto-filled. Select the complete saved credential entry when switching accounts; editing only the username can retain the previous account’s password. Confirm the visible student ID after every switch. Do not request repeated permission to scrape. If the saved credential popup cannot be operated, or a human image challenge appears, hand off the same task space for that exact login step and resume after the user confirms. Never retry guessed passwords. Navigate each curriculum category and preserve every course and every faculty allocation row, including repeated courses and repeated faculty.

## Required row fields

For every faculty row, record all four displayed columns exactly as shown:

1. `slotDetail` — complete slot text (including `+` combinations)
2. `venue`
3. `faculty`
4. `courseType` — the separate **Course Type** column; never derive this from slot text or course title

Retain course ID/name, category/category name, account, source URL, semester, capture date, and campus as context. Do not deduplicate rows. Preserve exact VTOP labels and capitalization; use an empty value only if the website itself is empty, and report that omission.

## Files and format

- `data/vtop-faculty-list-ece-winter-2026-27.json` and `data/vtop-faculty-list-ecm-winter-2026-27.json`: per-account source captures, nested by category/course, with rows in `allocations`.
- `data/vtop-allocation-winter-2026-27.json`: combined account-separated snapshot.
- `data/vtop-allocation-winter-2026-27.csv`: flattened row export; includes account, category, course ID/name, faculty, slot detail, venue, and course type.
- `data/vtop-faculty-explorer.html`: searchable viewer derived from the CSV/snapshot.
- `data/vtop-schedules-winter-2026-27.json` and `src/data/vtop.ts`: planner-facing derived data. Keep source captures authoritative.

## Embedded theory and lab selections

Keep raw ETH and ELA rows separate in source captures, in their displayed order. One selection must include both components when the source associates them with the same faculty and section. Each component retains its own slot label, course type, and venue. For example, ECE / UCC / BAARB101 / MOHD SAQIB has ETH `TAA1` in `PRP134` and ELA `L31+L32` in `PRP555` in the existing capture. Component slot labels can differ; requiring identical slot text would fail to pair this section.

The user explicitly requires **theory and lab in opposite halves of the day**, even with “Mixed / any” selected. Group only within the same account/category/course and faculty (normalize whitespace for derived identity; keep source text exact). For a half with exactly one theory option, each same-faculty lab in the opposite half creates a separate complete card. Reuse the theory component across these cards; each card has one lab and its own room. Do not merge the lab alternatives into one card. If multiple theories in the same half or unmapped slots leave the association ambiguous, preserve the source rows with `pairingStatus: unresolved` and exclude them from generation, addition, and timetable export. Never infer a link merely from adjacency.

Verified example: BAECE102 / RAVI S has theories E1+TE1 (TT302) and E2+TE2 (TT301), plus four labs in SJT203. The opposite-half rule gives E1 with L35+L36 or L49+L50, and E2 with L5+L6 or L27+L28: four cards, each theory plus one lab. Recheck the source rows rather than treating these examples as a permanent faculty allocation.

## Observed source structure

On 2026-10-30, VTOP returned four separate cells per faculty row; `Course Type` is a real fourth column. BACHI101 rows have no rowspan or explicit section-link key. Preserve `sourceRowIndex`, cell spans, and allocation-only row HTML in source captures for future audits. The user confirmed on 2026-10-30 that one ETH with multiple ELA rows for the same faculty means lab alternatives: create one theory+one-lab choice per ELA row, retaining each lab’s venue. BAECE204 / ELAKKIYA P is the verified example: ETH G1+TG1, with ELA L43+L44 or L53+L54. Never offer either component alone as a complete embedded course.

## Capture and update procedure

1. Inspect VTOP’s current page and confirm the visible student identity before capturing; choose the account dropdown entry above.
2. For each account, capture every category displayed in the live curriculum selector and every returned course. Undergraduate accounts displayed `NC`, `UCC`, `PCC`, `CON`, `OEC`; the MCA account on 2026-10-31 displayed `UCC`, `OEC`, `PFCC`, `PFEC`. The script reads the selector rather than assuming undergraduate categories. Use the tested `scripts/capture-vtop-account.mjs` through `ego-browser nodejs`; its configuration and invocation are in `data/README.md`. It verifies account/semester/headings, captures bounded category calls, preserves original row HTML, and replaces a source file only after every category completes. Treat login/error HTML as a failure, never an empty course result. Preserve actual empty categories and course results.
3. Save the two account files independently. Run `node scripts/rebuild-vtop-exports.mjs` to rebuild combined JSON, CSV, explorer, and planner-derived JSON, preserving row order and duplicates. The planner expects `courses` containing grouped `allocations`; never replace that key with a flattened `allocations` root. Run `node scripts/rebuild-vtop-exports.mjs --check` to detect stale exports without writing. Run `npm test` and `npm run build` after rebuilding.
4. Reconcile totals: course-entry and faculty-row totals in each JSON summary must equal a direct count of nested data and corresponding CSV account rows. Verify every row has slot, venue, faculty, and course type; print/report missing cells rather than silently dropping them.
5. Independently compare the four parsed cells of every saved `sourceRowHtml` against its allocation fields, then reconcile ordered tuples with planner JSON, CSV, and explorer. Spot-check representative theory and lab rows against live VTOP, especially `ETH` versus `ELA`. `TH`, `LO`, `OC`, and `SS` are valid observed values too; do not coerce them into ETH/ELA.
6. Test the actual website in both branches: repeated ETH/ELA pairs, shared-theory lab alternatives as separate cards, each component’s preview/calendar venue, and generation/export conflicts. Keep source captures exact; normalize whitespace only for derived faculty identity. Rows with unresolved pairing or missing/conflicting template times stay visible but cannot be added/generated/exported as complete classes. Update `data/README.md` with capture date, account/course/row totals, files, and limitations. The raw capture does not encode weekday/clock mappings. The live generic VTOP clock template is captured in `data/vtop-slot-template-vellore-2026-10-30.json`. It was displayed for registered **Fall Semester 2026-27**; it does not prove Winter registration or independently confirm Winter-specific timings. Keep that distinction visible. Theory and lab have separate start/end rows: never apply theory starts to lab slots or invent a fixed 100-minute end. Preserve every listed lab slot and split blocks across different days or nonadjacent template columns.

## Troubleshooting and provenance

- If **Course Type** is absent, inspect horizontal scroll, hidden columns, and table headings; do not infer it. Re-capture affected rows from the site.
- If rows are missing, check pagination, category tabs, lazy-loaded content, and scroll position before deciding a course has no allocation.
- If UI layout or labels change, update this guide with the observed navigation and revised extraction selectors/steps. Keep a note of the VTOP URL and capture date.
- Preserve existing uncommitted work. Do not replace prior course datasets with a partial scrape.
- Previous workflow context: T3 thread `7101b465-38e3-4768-af60-24798d8b41b1` (“Add Missing VTOP Courses”).
- Latest verified 2026-10-30 live totals: ECE **79 course entries / 538 rows**; ECM **70 / 476**. Both accounts have full four-column row evidence. ECE repeat passes matched exactly; fresh data changed 10 ECE and 6 ECM course records versus earlier local captures (totals unchanged). Use `data/README.md` and per-account capture timestamps for provenance; counts alone never prove freshness.

- Browser prerequisite: the T3 default profile on 2026-10-30 reached an empty login form without saved accounts. If this recurs, locate the user’s saved-account browser/profile; do not request credentials in chat or claim a live capture from local JSON.

- Course-type semantics: live VTOP explicitly labeled `LO` as **Lab Only**. Preserve raw type in `Component.sourceType`; keep other unverified type meanings (such as `SS`) explicit instead of guessing.

- MCA capture on 2026-10-31: **10 course entries / 58 rows**, using live categories UCC 2/12, OEC 1/10, PFCC 3/20, PFEC 4/16. `PFCC` is Professional Core Courses and `PFEC` is Professional Elective Courses. Source: `data/vtop-faculty-list-mca-winter-2026-27.json`; personal account identifiers omitted.
