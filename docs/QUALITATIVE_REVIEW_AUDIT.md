# Qualitative review extraction audit

Run: `python3 scripts/extract-qualitative-reviews.py --manifest /tmp/ffcs-reviews/manifest.json`.
Requires Poppler. Optional `--render /tmp/ffcs-review-qa` renders representative pages and all seven scanned pages outside the repository. All assigned PDFs are read directly from manifest paths; hashes and actual page counts are checked on each run. No raw PDF is copied into public assets.

## Coverage

| Source | Pages | Primary records | Citations including duplicates | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| attachment-02: 56a2ec12-8397-4591-b17a-8cb9b3334dbc.pdf | 21 | 125 | 125 | `883f3869b86e2d77c652aece17eb2531f2b51020f48e46fa50755dea0fe1ec85` |
| attachment-03: BLACKLISTED FACULTY LIST Winter.pdf | 8 | 163 | 164 | `29dc7afe254ab9b7e1f56bb2979969b65a97a32c4ffb9d877a5e98d9b2e503b5` |
| attachment-04: BLACKLISTED FACULTY LIST.pdf | 8 | 8 | 164 | `5fbcaf7a0bc787f4ef014d4cccdd0c2e60719cefc6a3cc521b68d8a3d223bcce` |
| attachment-05: Faculty List .pdf | 4 | 41 | 41 | `b6af12efcfcf31a43306019d38bfe9ddb711ee7175c2b963790decaa2d009ea5` |
| attachment-06: FACULTY REVIEW 1.pdf | 7 | 37 | 37 | `720b8a215a619e7a6e9243829f23eb138f492190e8490e174ba0ed2b7b281952` |
| attachment-08: ffcs.pdf | 29 | 27 | 27 | `9fac58665cd25241988f537ad5d61c0015926ce7f089c62a15698a30163b63a6` |
| attachment-10: SMEC list.pdf | 8 | 0 | 0 | `95ee50b25ecb1f9a016e441555b96622d771872d7bba9c3847c2a1cba28c48ce` |

## Interpretation and deduplication

- 401 distinct records; 558 retained source/page citations. Exact faculty spelling + text + context repetitions collapse into one record with `sourceCitations` and `duplicateGroup`. Duplicate citations are provenance, not independent votes.
- Attachments 03 and 04 overlap substantially but differ. Only exact name/text/context records collapse, retaining both citations. Different faculty spellings and unique entries remain separate.
- Every rating, sampleSize and date is null. Course headings are preserved as written. No course codes or faculty identity joins are inferred. Contradictory source opinions remain separate.
- Blacklist membership uses the requested avoid-category disclaimer. Source annotations are attributed student statements, never verified faculty facts. Profanity/claims in source text are unverified quotations, not endorsed descriptions.
- 02: all named feedback blocks on pages 2-21 extracted; page 1 is introductory guidance, not a review. Bullet wrapping is normalized.
- 03/04: pages 1-4 category lists parsed; pages 5-8 clearly attributed prose/categories curated. General advice for unnamed English teachers is excluded. Computer Science list Kannadasan/Narayanamoorthy/Krishnamoorthy/Naresh is excluded because it only speculates who might teach freshers, without a clear evaluative statement.
- 05: Good Teachers and Teachers to Avoid retained as opinions. Neutral/Unknown names excluded. Parenthetical source assumptions about shared identity are retained as source notes and explicitly not adopted.
- 06: all seven pages rendered at 150 DPI and visually inspected. Tesseract 5 default extraction returned empty text for the outlined font. Embedded manual visual transcriptions are reproducible curated data, labeled extraction=ocr because the raw enum has no visual option; warnings distinguish manual transcription. Selected legible comments are transcribed, not an assertion of exhaustive verbatim OCR.
- 06 limitations: p4 outlined name resembling EASWARAMOOETHY excluded because spelling uncertain. Page-leading continuation bullets on p2 (minimum 90 marks), p3 (north-Indian correction claims), p4 (average marks), p5 (confirm pass), p6 (VIJAYALAKSHMI.U continuation is explicitly joined from p5 heading), p7 (somewhat strict) are excluded except the unambiguous p5-to-p6 heading continuation. No unattached bullet is assigned to an uncertain name.
- 06 ARYA J5 preserves the visible source spelling (not corrected to a presumed faculty name); treat as identity-uncertain. No matching performed here.
- 08: only explicit parenthetical faculty comments retained. (APT) denotes provider/type, not an opinion. Plain offering rows, colored/highlighted rows without verbal evaluation, room/slot lists, and language offerings are excluded. Context is carried only within the explicit section boundaries.
- 10: all eight pages of text inspected; no evaluative faculty annotations found. These are offering tables. (APT), TH, LO and SS are classifications, not reviews. No review records emitted. Representative first page visually checked; no claim of exhaustive image annotation detection across all eight pages.
- Visual QA recorded by extraction worker: first pages of 02/03/05/08/10 and all seven pages of 06 inspected. Sources 03 and 04 are overlapping revisions, not identical copies. Shared prose pages are curated; unique early-page entries are parsed separately.

## Explicit row exclusions

- attachment-03 p1: ambiguous/group name: Rajashekaran G Prakash M
- attachment-03 p3: ambiguous/group name: Sureshkumar N Divya
- attachment-03 p3: ambiguous/group name: lakshmi K
- attachment-03 p3: ambiguous/group name: All babus
- attachment-04 p3: ambiguous/group name: All babus
- attachment-05 p2: neutral/unknown listing without opinion: Dibashi Bash
- attachment-05 p2: neutral/unknown listing without opinion: Siddarth Gowtam
