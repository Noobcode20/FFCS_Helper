# Data source audit and refresh procedure

Audited 2026-10-27. This is a real public repository snapshot, **not current semester availability**. No VTOP login, credentials, seat requests, authenticated service, review database, or restricted scraping was used.

## Bundled source

[CodeChefVIT/ffcs](https://github.com/CodeChefVIT/ffcs), production branch, pinned commit **b2bafadec44c8cdbf55a7b61292c779ef9b521fc**, committed 2026-10-25T11:50:23Z. [Exact MIT license](https://github.com/CodeChefVIT/ffcs/blob/b2bafadec44c8cdbf55a7b61292c779ef9b521fc/LICENSE): copyright (c) 2025 CodeChef-VIT. The license grants copying/modification/distribution, subject to retaining its notice. No separate data-specific license or restriction was found in these source files. The original complete license is retained as `src/data/upstream/codechef/LICENSE.txt` and in THIRD_PARTY_NOTICES.md. The transformations are modifications, not upstream output.

Only the **SCOPE** dataset selection is bundled: 11 source files, plus LICENSE, slots.ts, TimeTable.tsx and faq.ts (15 files). The FAQ describes the planner as optimized for Vellore. Other school selections and `_F` datasets were inspected but are not combined with SCOPE: their offering semesters cannot be established reliably. The SCOPE selection contains shared foundation and elective courses beyond CSE. Source data is literal public TypeScript, not a live provider integration. The deployed [CodeChef site](https://ffcs.codechefvit.com/) returned a loading shell in the read-only web check; this does not establish its dynamic backend availability. Its public repo and all 15 pinned raw URLs were fetched successfully without credentials. No independent deployed-site data reuse permission was assumed; the bundled material comes from the MIT repository.

`src/data/source-lock.json` is the exact URL allowlist, source commit, actual import timestamp, original byte lengths, SHA-256 of every raw file, and expected transform counts. Originals have **.txt suffixes** to keep Next.js imports and upstream TypeScript out of this app's compilation. The byte contents are unchanged. The refresh command independently verifies the remote bytes against these hashes.

## Counts and scope

| Measure | Count |
| --- | ---: |
| Input course codes | 119 |
| Input rows | 939 |
| Included courses | 114 |
| Exact faculty name records | 328 |
| Complete included offerings | 913 |
| Duplicate source rows collapsed | 2 |
| Excluded ambiguous courses | 5 |
| Excluded source rows | 24 |
| Slot labels in decoded grid | 64 |
| Reviews | 0 |

Accounting is exact: 939 = 913 + 2 + 24. Each included row retains course, faculty, venue, and the entire slot combination. `catalog-audit.json` records the input path and original row for each offering, including all duplicate origins; omissions identify reasons and source paths. `slot-map.json` retains the decoded minute intervals and source links. No random or sample offerings are generated.

## Missing information and pairing policy

- **Semester unknown, status historical.** The repository commit date is not a semester or per-row update date. `updatedAt` is the snapshot commit date only. Import time is separately recorded. No current term, seat availability, capacity, or registration success is asserted.
- **All credits null.** CodeChef's data does not publish credits. Course codes/contact hours do not prove credits. The official [Vellore CSE 2022–2023 curriculum](https://vit.ac.in/sites/default/files/scope/B.Tech_CSE_2022_2023.pdf) was downloaded and its credit/type table inspected as a possible future exact-code enrichment source, but is not bundled, relicensed, or joined: historical curriculum versions do not establish the unknown offering term. No zero/default credit substitution is used. The shared Course contract must permit `number | null`.
- **Planning IDs, not class IDs.** No official section/registration IDs are supplied. Offering IDs are stable SHA-256 prefixes over exact code, faculty string, original slots, and venue. The section display explicitly says `Planning ID`. These IDs must never be presented as VTOP registration identifiers.
- **Never invent a theory/lab link.** BCSE101E, BCSE103E, BCSE203E, BCSE432E, BHUM102E are excluded in full (24 rows). They contain separate theory and lab rows under one code with no explicit pairing relation. Sharing a professor is insufficient proof. The transformer also excludes an E-suffix course lacking complete pairing if encountered. It never produces a Cartesian product of possible links.
- **Separate codes stay separate.** For example, BCSE202L and BCSE202P are distinct source courses. Each included offering contains its complete source row; the planner does not assert a mandatory link or same-professor requirement between these separately coded courses. Theory and T-prefixed tutorial periods in one row become two components of that same offering.
- **Lab labels stay paired.** A sourced `L45+L46` block has `component.slots: ['L45+L46']` and one meeting whose slot is also `L45+L46`. It is not split into invented individual periods. Multiple paired blocks remain in one component/offering. Invalid/unknown slots and overlapping components fail validation or are explicitly omitted.
- Faculty IDs correspond to **exact source name strings**, preserving spelling/case/spacing. They do not prove employee identity; two people sharing a name cannot be separated without source IDs. No fuzzy cross-platform identity merge or department guess is performed.
- Reviews are exactly `[]`; zero reviews means unavailable information, not a zero rating. Source linkouts below do not establish a matching faculty profile.

## Prominent timing limitation

**TIMING WARNING: these minute intervals encode CodeChef's public grid and are NOT verified current Vellore times.** [slots.ts](https://github.com/CodeChefVIT/ffcs/blob/b2bafadec44c8cdbf55a7b61292c779ef9b521fc/src/lib/slots.ts) contains grid coordinates, not clock strings. Its [TimeTable.tsx](https://github.com/CodeChefVIT/ffcs/blob/b2bafadec44c8cdbf55a7b61292c779ef9b521fc/src/components/ui/TimeTable.tsx) labels column 2 as 08:00, column 8 as 09:00, through column 38 as 14:00 and column 62 as 18:00. Thus each grid column encodes 10 minutes: `minute = 480 + (column - 2) * 10`. Grid ends are exclusive. Theory day = `(rowStart - 4)/3`; lab day = `(rowStart - 5)/3`; Monday=0. Fifty-minute theory cells and 100-minute paired lab cells follow directly from those coordinates. These are source-derived intervals, not inferred from credit counts or slot names.

Examples: A1 = Monday 08:00–08:50 and Wednesday 09:00–09:50; TB1 = Monday 11:00–11:50; L1+L2 = Monday 08:00–09:40; L3+L4 = Monday 09:50–11:30; L5+L6 = Monday 11:40–13:20. A1 overlaps L1+L2 and TB1 overlaps both L3+L4 and L5+L6. Different slot names are not evidence of non-overlap.

[Ultimate FFCS's Vellore chart](https://www.ultimateffcs.in/vellore) instead shows A1 Wednesday 08:55–09:45 and TB1 Monday 10:45–11:35. Its displayed lab starts also differ for some blocks from CodeChef's grid. We do not silently replace one source's timetable with the other's. This may reflect stale grid geometry rather than actual historic teaching times: the source's offering term and authoritative semester chart are unknown. Use this catalog for historical exploration, not current registration correctness. Confirm a permitted official semester export before treating generated schedules as current. The catalog embeds all warnings in `warnings` so export/import preserves them. `catalog.ts` additionally exports `catalogWarnings` for prominent UI display. No App or engine edits are included in this data-only change.

## Other sources and review linkouts

| Source | Availability and permission check | Decision |
| --- | --- | --- |
| [Ultimate FFCS](https://www.ultimateffcs.in/) / [mrRR7/ffcsmaker](https://github.com/mrRR7/ffcsmaker) | Public site and repo accessible. Audited repo commit `f5caebd2c497516e02ba53504391625a51418390`. [Terms](https://www.ultimateffcs.in/terms) link this repo and make reuse subject to its applicable license. No LICENSE file or explicit reuse grant found in checkout. Public slot page is available; term availability is not verified. Repo has runtime Supabase catalog machinery, not a licensed static offering dump. | Research/linkout only. No code, catalog, review, or slot table copied; no Supabase queries or hidden API scraping. Seek explicit dataset permission before reuse. |
| [VITor repo](https://github.com/anantgupta001/VITor) / [Vellore view](https://vitor-facultyranker.vercel.app/vit-v) | Public repo at `ecfaa597d768cc02fe49fd22deb1b60ee814b578`. Home accessible with campus selector. README describes Firebase-backed faculty/reviews and college authentication for submissions. No LICENSE or public redistribution grant found; code accessibility does not license reviews. | Link to Vellore page only. No database requests, credentials, ratings, names or review dumps copied. No fabricated per-professor URL matching. |
| [FacultyCC](https://github.com/PVER-Programz/faculty-cc) | Public repository accessible; describes Chennai faculty profile scraping and user reviews. README License section says educational/informational purpose, not an explicit reusable data license. Wrong campus for initial catalog. | Linkout/research only; no scraper run or review ingestion. |
| [VITverse](https://vitv.vercel.app/) | Read-only fetch returned HTTP 402 Payment Required during audit. No accessible licensed review export established. | Unavailable provider, no dependency or data copied. |
| [Faculty Review Vellore](https://faculty-review-vit-vellore-dun.vercel.app/) | Public reference discovered; read-only fetch timed out. License/export access not established. | Availability unverified; no dependency or data copied. |
| [FFCSonTheGo](https://github.com/vatz88/FFCSonTheGo) | Public repo at `7bc00c8d3437af6df72147ebc51490d96cde2d10`, explicit GPL-3.0 license; campus schemas and historical XLSX exports exist. Vellore schema is a different historic slot revision. | Not mixed into MIT dataset. No code/schema/spreadsheet bundled; provenance and license require a separate ingestion decision. |

No source promises a refresh frequency for these bundled rows. New repository activity can change code without updating allocations. Public access and permissive code licensing do not prove official academic accuracy or establish review redistribution rights.

## Reproduce and refresh

Python 3.9+ standard library only; no package.json changes or external Python dependencies.

```sh
python3 scripts/refresh-catalog.py --check
python3 scripts/refresh-catalog.py --fetch --check
python3 -m unittest discover -s scripts -p 'test_*.py' -v
```

The first command checks local raw SHA-256, byte lengths, expected counts, stable IDs, foreign keys, slot coverage, minutes, and source-accounted omissions, then compares byte-for-byte generated output. `--fetch --check` additionally downloads only the 15 immutable raw URLs listed in source-lock.json, verifies them, and changes no files. Default regeneration is offline (`python3 scripts/refresh-catalog.py`); `--fetch` regenerates from verified remote bytes. No crawling, upstream application execution, database connection, environment secret, or network call from the frontend is involved. Failure stops the refresh; the checked-in catalog stays available.

For an actual new revision, first audit its license and changed files/semester/slot semantics manually, then update the pinned commit allowlist in the script and lock, source hashes/lengths, actual import timestamp, original files and expected counts. Do not merely change a URL or relabel the old snapshot current. Review full output/omission diff, rerun checks, and run the application's `validateCatalog` and schedule checks before committing. New source formats or unresolved links should fail closed. Commit data, originals, lock, audit, notices and docs together. A new curriculum credit join needs exact-code and version evidence, separate provenance, and separate documented permission checks.

The unit checks cover malicious/executable literal rejection, unknown/unpaired lab periods, real cross-name clashes, all five ambiguous courses, absence of invented credits/reviews/IDs, matching component/meeting slot labels, and complete row accounting. They do not prove live VTOP allocations, provider runtimes, browser layout, or semester correctness.

## Validation evidence for this snapshot

Production importer/engine from the supervisor worktree were executed against this data with:

```sh
node scripts/validate-catalog.mjs "src/lib"
```

After integration, run `node scripts/validate-catalog.mjs` (Node 22.18+). The check exercises the real `validateCatalog`, JSON export/reimport warning preservation, engine acceptance of each of 913 offerings individually, and clash-free alternatives for BCSE202L + BCSE202P + BCSE302L. Historical timing caveats still apply.

Generated SHA-256 hashes (source file hashes are individually listed in source-lock.json):

- `src/data/catalog.json`: `a93642a9dabf3de985a6f5820e8ea8f090de9fd420b9f8c4b7c35066d60a8ce8`
- `src/data/catalog-audit.json`: `064d71daabf9e06408861514bd0bc4cd6786435955de1192e481afac46b89876`
- `src/data/slot-map.json`: `029e25b99681a4cc4dbaee898dd2bb13388279aba120f0e0268e22a2ec98c7b9`
