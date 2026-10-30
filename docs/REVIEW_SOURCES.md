# Supplied faculty reviews — integration audit

The 12 attachments supplied in this conversation were inspected on 2026-10-27/28. They are user-provided snapshots, not a live, authenticated or independently verified faculty-rating service. Original files were not copied into public assets. The app displays extracted records and file/page or worksheet-cell references. Exact SHA-256 hashes and per-source coverage are in `src/data/review-sources/manifest.json` and `src/data/review-library.json`.

## Included data

- All **608** explicitly numbered rating rows from `VIT_Faculty_Ratings_Clean.pdf`, pages 1–19. The PDF names ratemyvitprofs as its source; that claim is attributed to the PDF, not independently verified. Scores and the Reviews column are transcribed as supplied. Unknown counts stay null. Comments already truncated in the PDF are not completed.
- **267** records under 266 faculty-heading blocks in `3.pdf`, pages 1–39: 93 explicit numeric ratings and 174 written-only entries. Multiple conflicting numbers stay separate. The source artwork names WhatsApp Chat. Bullets are not counted as respondents; all numeric entries remain source averages rather than reconstructed individual votes.
- Qualitative records from the general feedback PDF, both overlapping avoid/recommendation lists, the categorized faculty list, seven visually transcribed pages of `FACULTY REVIEW 1.pdf`, and explicit parenthetical comments in `ffcs.pdf`.
- **10** written notes from `ffcs sem 3.xlsx`, including source course headings and cell ranges. Slot-clash notes are not evaluations. Neither unlabelled cell colors nor ordinary faculty/slot listings are converted into ratings.
- `FFCS.xlsx`, `SMEC list.pdf` and `Teacher list.docx` were inspected but contain no sufficiently explicit written faculty evaluations in the checked content. They contribute no invented scores. Review-specific extraction coverage and image limitations are recorded in `QUALITATIVE_REVIEW_AUDIT.md`.

After extraction and identity-independent duplicate handling, the library contains 1,285 retained raw records. The app deduplicates one additional exact repeated opinion after name normalization: **1,284 displayed records**, comprising **701 numeric source records and 583 qualitative records**. Numeric scores cover **671 normalized names**. Duplicate citations remain attached; sample counts are never added across documents.

## Matching and scheduling integrity

Feedback is linked to **172** faculty names in the existing catalog. Matching removes honorifics, punctuation, case differences and whitespace only. There is no fuzzy matching, initial reordering, guessed name expansion, spelling correction, campus inference or employee-ID verification. Ambiguous normalized catalog names do not receive an automatic join.

The remaining **877** source-only name groups are available in Faculty & reviews and explicitly labeled as having no verified catalog offering or campus link. A source-only entry is not a new course offering. Different spellings or incomplete names can therefore remain separate; for example, a one-word `Vinitha` is not automatically treated as `Dr. G Vinitha`.

No course code is guessed from a document's informal subject heading. Headings such as DSA or Complex appear as **Document context**, not as a verified course-specific rating. Numeric cards prefer the clean PDF snapshot if present, otherwise a single explicit source score. Sorting and displayed counts use that one source record, never a cross-document average.

Review dates are absent in these sources and remain **null / Review date unknown**. Import time is separately labeled. Unknown sample sizes remain **null / Sample size unknown**. “Good”, “avoid” and “blacklisted” classifications remain attributed, unverified opinions and never turn into invented stars. Average scores, even with one reported review, are not used to fabricate individual vote distributions.

The overlay does not modify courses, sections, slots or meeting times. Review-only identities are excluded from the schedule fingerprint; the original default-catalog fingerprint is unchanged. Existing cached catalogs are enriched at load time without replacing course data. Applying a different valid catalog rematches reviews to its faculty IDs and preserves user-imported review records.

## Extraction corrections and exclusions

- The interrupted worker's initial statement that the two avoid lists were identical was incorrect. They are different revisions. Unique entries remain separate; only exact repeated name/text/context content is deduplicated with both citations.
- Category headings and decorative symbols are not faculty. The `Don't ever take these...` heading was removed after independent review found it emitted as a name.
- One uncertain scanned name, `ARYA J5`, is excluded from the application library and retained in the raw extraction/audit for inspection. Other scan uncertainties and unattached continuation bullets are documented by the extraction worker. This is not a claim of exhaustive verbatim OCR.
- The independent review also suggested a missing `Arunachalam V (avoid)` entry in `ffcs.pdf` page 2. That claim was not reproducible in the source's extracted text, so no extra opinion was invented. The separately supplied avoid list does contain Arunachalam V, with its own attribution.
- Incidental nonacademic allegations and a slur in selected numeric-table comments were omitted/redacted by the numeric extraction script. Explicit scores/counts were retained; extraction notes accompany affected records.
- No inferred review dates, respondent totals, faculty aliases or course registrations were added. No native public review submission endpoint was enabled.

## Reproduce

The original attachments stay outside the repository. An external manifest has entries `{id,name,path,kind,pages}` with the attachment IDs used here; `/tmp/ffcs-reviews/manifest.json` was used during this run. Requires Poppler for PDFs and the existing ExcelJS dependency for spreadsheet reading.

```sh
python3 scripts/extract-numeric-reviews.py --manifest /path/to/private-manifest.json
python3 scripts/extract-qualitative-reviews.py --manifest /path/to/private-manifest.json
node scripts/extract-spreadsheet-reviews.mjs /path/to/private-manifest.json
node scripts/build-review-library.mjs /path/to/private-manifest.json
npm run reviews:validate
npm test
npm run build
```

After extraction, `npm run reviews:build` rebuilds the application library from checked-in extracted records and the hashed source manifest without requiring original files. Its timestamp is an import timestamp, not a review date. The compiled library includes source hashes and retained citations; the PDFs, workbook files and DOCX are not public downloads.

The MIT license on the CodeChef offering dataset does not license these user-supplied review documents. No redistribution permission is inferred for the original documents or an external rating platform. No public deployment was performed.

## Verification

`npm test`: 63 tests pass, including complete-library validation, all 608 primary numeric rows, duplicate-citation retention, ambiguous/fuzzy name separation, preservation of null dates/counts, exact-source score preference without averaging, repeated-load idempotence and unchanged saved-plan fingerprints. TypeScript and production build pass.

Browser checks verify a 5.00/5, 12-reported-review profile with PDF/page/row references and an unknown review date; a written-only IYAPPAN P profile; rating badges on actual RANJITH KUMAR M course sections; and no page overflow at a 390px viewport. The rating/filter controls and old-cache enrichment are also covered by the integration code/tests. These checks verify extraction/display, not the truth of student opinions or current teaching allocations.
