#!/usr/bin/env python3
"""Rebuild the pinned public CodeChef catalog. No dependencies; never executes source TS.
Default: offline integrity check + regeneration. --fetch: fetch only pinned allowlisted URLs.
--check: compare outputs without writing. --fetch --check also verifies remote bytes.
"""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / 'src/data/source-lock.json'
# A single source UI selection; do not mix _F and non-_F snapshots/semesters.
PREFIX = 'src/data/SCOPE/'
WARNINGS = [
    'Historical public repository snapshot; offering semester is UNKNOWN. Not verified for current FFCS or seat availability.',
    'TIMING WARNING: minutes are decoded from CodeChef grid (hourly theory starts), which differs from Ultimate FFCS Vellore (55-minute spacing). Confirm the official semester slot chart before use; these intervals are not verified current times.',
    'Credits are unknown (null). Source does not provide credit values; totals are incomplete.',
    'Section labels are derived Planning IDs (faculty + slots + venue), not official VTOP class/section identifiers.',
    'Courses containing unlinked theory and lab rows are excluded, never offered as alternative complete registrations.',
    'Faculty IDs identify exact source name strings only; same-name people cannot be disambiguated. No external identity/review joins.',
    'No permitted review dataset was found. reviews is empty; external platforms are linkouts only.',
]


def digest(b):
    return hashlib.sha256(b).hexdigest()


# Constrained literal grammar: comments, strings, numbers, objects, arrays only.
# Deliberately rejects executable expressions, calls, spreads, imports, templates.
TOKEN = re.compile(r'''\s+|//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?|[{}\[\]:,]''', re.S)


def literal(text):
    tokens = []
    pos = 0
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m:
            raise ValueError(f'Unsupported source syntax near {text[pos:pos+70]!r}')
        token = m.group()
        pos = m.end()
        if token.isspace() or token.startswith(('//', '/*')):
            continue
        tokens.append(token)
    i = 0

    def parse():
        nonlocal i
        t = tokens[i]
        i += 1
        if t in ('{', '['):
            end = '}' if t == '{' else ']'
            value = {} if t == '{' else []
            while tokens[i] != end:
                if t == '{':
                    key = tokens[i]
                    i += 1
                    key = ast.literal_eval(key) if key[0] in '\"\'' else key
                    assert tokens[i] == ':'
                    i += 1
                    assert key not in value, f'duplicate literal key: {key}'
                    value[key] = parse()
                else:
                    value.append(parse())
                if tokens[i] == ',':
                    i += 1
                else:
                    assert tokens[i] == end
            i += 1
            return value
        if t[0] in '\"\'':
            return ast.literal_eval(t)
        if re.fullmatch(r'-?\d+(\.\d+)?', t):
            return float(t) if '.' in t else int(t)
        raise ValueError(f'Unsupported literal: {t}')
    result = parse()
    assert i == len(tokens), 'Unexpected trailing source'
    return result


def course_object(text):
    m = re.fullmatch(r'\s*export const \w+\s*=\s*(\{.*\})\s*;?\s*', text, re.S)
    assert m, 'Expected single exported course object'
    obj = literal(m[1])
    assert isinstance(obj, dict)
    for title, rows in obj.items():
        assert ' - ' in title and isinstance(rows, list), title
        for row in rows:
            assert set(row) == {'slot', 'venue', 'faculty'}, row
            assert all(isinstance(v, str) for v in row.values()), row
    return obj


def grid_slots(text, table):
    # Verify the source UI's absolute clock anchors: each 6 columns = 60 minutes.
    for col, hour in [(2, '8'), (8, '9'), (14, '10'), (20, '11'), (26, '12'),
                      (38, '2'), (44, '3'), (50, '4'), (56, '5'), (62, '6')]:
        assert re.search(rf"colStart: {col}, colEnd: {col+1}, rowStart: 1, rowEnd: 2, slotName: '{hour}'", table)
    m = re.search(r'const slotMap:[^=]+=(\s*\{.*?\n\});', text, re.S)
    assert m, 'slotMap missing'
    source = literal(m[1])
    slots = {}
    for name, cells in source.items():
        for cell in cells:
            day = (cell['rowStart'] - (5 if name.startswith('L') else 4)) // 3
            assert day in range(5)
            start = 480 + (cell['colStart'] - 2) * 10
            end = 480 + (cell['colEnd'] - 2) * 10
            assert 0 <= start < end <= 1440
            label = cell['slotName']
            slots.setdefault(label, []).append(dict(day=day, start=start, end=end, slot=label))
    assert slots['A1'] == [dict(day=0, start=480, end=530, slot='A1'), dict(day=2, start=540, end=590, slot='A1')]
    assert slots['L1+L2'] == [dict(day=0, start=480, end=580, slot='L1+L2')]
    return slots


def resolve(names, slots):
    result = []
    i = 0
    while i < len(names):
        name = names[i]
        if re.fullmatch(r'L\d+', name):
            assert i + 1 < len(names), f'Unpaired lab period: {names}'
            name += '+' + names[i + 1]
            i += 1
        assert name in slots, f'Unknown slot {name}'
        result.extend(slots[name])
        i += 1
    for a, x in enumerate(result):
        for y in result[a + 1:]:
            assert x['day'] != y['day'] or x['end'] <= y['start'] or y['end'] <= x['start'], 'Internal component overlap'
    return sorted(result, key=lambda m: (m['day'], m['start'], m['slot']))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fetch', action='store_true')
    p.add_argument('--check', action='store_true')
    args = p.parse_args()
    lock = json.loads(LOCK_PATH.read_text())
    assert lock['commit'] == 'b2bafadec44c8cdbf55a7b61292c779ef9b521fc', 'New commit requires a fresh audit'
    prefix = f"https://raw.githubusercontent.com/CodeChefVIT/ffcs/{lock['commit']}/"
    source = {}
    downloaded = {}
    for f in lock['files']:
        assert f['url'] == prefix + f['path'], 'URL not in pinned public allowlist'
        local = ROOT / f['localPath']
        assert local.resolve().is_relative_to((ROOT / 'src/data/upstream/codechef').resolve())
        if args.fetch:
            req = urllib.request.Request(f['url'], headers={'User-Agent': 'FFCS-Helper-public-data-audit/1'})
            with urllib.request.urlopen(req, timeout=45) as response:
                assert response.url == f['url'], 'Unexpected redirect'
                b = response.read(2_000_001)
            downloaded[local] = b
        else:
            b = local.read_bytes()
        assert len(b) == f['bytes'] and digest(b) == f['sha256'], f"Source integrity mismatch: {f['path']}"
        source[f['path']] = b.decode('utf-8')
    assert 'MIT License' in source['LICENSE'] and 'Copyright (c) 2025 CodeChef-VIT' in source['LICENSE']
    slots = grid_slots(source['src/lib/slots.ts'], source['src/components/ui/TimeTable.tsx'])
    entries = {}
    raw_rows = 0
    for path, text in source.items():
        if not path.startswith(PREFIX):
            continue
        for full_title, rows in course_object(text).items():
            code, title = full_title.split(' - ', 1)
            code = code.strip()
            assert re.fullmatch(r'[A-Z0-9]+', code), code
            data = entries.setdefault(code, dict(titles=set(), rows=[], paths=set()))
            data['titles'].add(title.strip())
            data['paths'].add(path)
            for row in rows:
                data['rows'].append((row, path))
                raw_rows += 1
    prov = dict(source='CodeChef-VIT FFCS public SCOPE snapshot; semester unknown; see docs/DATA_SOURCES.md',
                url=f"{lock['repository']}/tree/{lock['commit']}/src/data/SCOPE", importedAt=lock['importedAt'],
                updatedAt=lock['commitDate'], status='historical', license='MIT')
    courses, faculty, offerings, omitted, record_sources = [], {}, {}, [], {}
    duplicate_rows = 0
    for code, data in sorted(entries.items()):
        # No invented pairings: mixed theory/lab under one code is not a registration.
        kinds = {'lab' if re.fullmatch(r'L\d+(?:\+L\d+)*', row['slot'].replace(' ', '')) else 'theory' for row, _ in data['rows']}
        reason = None
        if len(data['titles']) != 1:
            reason = 'Conflicting source titles; identity not merged'
        elif len(kinds) > 1:
            reason = 'Unlinked theory/lab rows under same course code'
        # E suffix explicitly denotes embedded in this source's own course mapping.
        elif code.endswith('E'):
            reason = 'Embedded course without explicit complete theory/lab pairing'
        if reason:
            omitted.append(dict(code=code, reason=reason, rows=len(data['rows']), titles=sorted(data['titles']), paths=sorted(data['paths'])))
            continue
        accepted = []
        for row, path in data['rows']:
            names = [s.strip() for s in row['slot'].split('+')]
            try:
                meetings = resolve(names, slots)
                assert row['faculty'].strip() and row['venue'].strip(), 'Missing faculty or venue'
            except AssertionError as error:
                omitted.append(dict(code=code, reason=str(error), row=row, path=path))
                continue
            # Preserve exact faculty spelling; no speculative fuzzy identity merging.
            name = row['faculty']
            fid = 'cc-name-' + digest(name.encode())[:16]
            key = [code, name, names, row['venue']]
            oid = 'cc-offering-' + digest(json.dumps(key, ensure_ascii=False).encode())[:20]
            record_sources.setdefault(oid, []).append(dict(path=path, sourceCourse=code+' - '+next(iter(data['titles'])), row=row))
            if oid in offerings:
                duplicate_rows += 1
                continue
            rp = {**prov, 'url': prefix + path}
            faculty.setdefault(fid, dict(id=fid, name=name, provenance=rp))
            lab = kinds == {'lab'}
            components = []
            for typ, selected in [('lab', names)] if lab else [('theory', [s for s in names if not s.startswith('T')]), ('tutorial', [s for s in names if s.startswith('T')])]:
                if selected:
                    components.append(dict(type=typ, slots=[selected[i]+'+'+selected[i+1] for i in range(0, len(selected), 2)] if typ == 'lab' else selected, meetings=resolve(selected, slots), facultyId=fid, venue=row['venue']))
            offerings[oid] = dict(id=oid, courseId=code, facultyId=fid,
                section=f"Planning ID · {row['slot']} · {row['venue']} · {oid[-8:]}", components=components, provenance=rp)
            accepted.append(oid)
        if accepted:
            courses.append(dict(id=code, code=code, title=next(iter(data['titles'])), credits=None, provenance={**prov, 'url': prefix + sorted(data['paths'])[0]}))
    catalog = dict(version=1, campus='Vellore', semester='Unknown semester · historical CodeChef SCOPE snapshot',
                   provenance=prov, warnings=WARNINGS, courses=courses, faculty=sorted(faculty.values(), key=lambda f: f['id']),
                   offerings=sorted(offerings.values(), key=lambda o: o['id']), reviews=[])
    counts = dict(sourceFiles=len(source), scopeCourseCodes=len(entries), sourceRows=raw_rows,
                  courses=len(courses), faculty=len(faculty), offerings=len(offerings), reviews=0,
                  duplicateRows=duplicate_rows, omittedCourses=sum('rows' in o for o in omitted),
                  omittedRows=sum(o.get('rows', 1) for o in omitted), slotLabels=len(slots))
    # Locked expected counts turn accidental truncation/parser/policy drift into failure.
    if 'expectedCounts' in lock:
        assert counts == lock['expectedCounts'], f'Count drift: {counts}'
    assert len(courses) >= 40 and len(offerings) >= 300, f'Unexpectedly small dataset: {counts}'
    for o in offerings.values():
        for c in o['components']:
            assert set(c['slots']) == {m['slot'] for m in c['meetings']}, 'Slot/meeting labels must match'
    assert len({x['id'] for x in courses}) == len(courses)
    assert all(o['courseId'] in {c['id'] for c in courses} and o['facultyId'] in faculty for o in offerings.values())
    audit = dict(repository=lock['repository'], commit=lock['commit'], importedAt=lock['importedAt'],
                 scope=PREFIX, counts=counts, warnings=WARNINGS, omissions=omitted, recordSources=record_sources)
    outputs = {
        'src/data/catalog.json': json.dumps(catalog, ensure_ascii=False, indent=2)+'\n',
        'src/data/catalog-audit.json': json.dumps(audit, ensure_ascii=False, indent=2)+'\n',
        'src/data/slot-map.json': json.dumps(dict(source=prefix+'src/lib/slots.ts', clockSource=prefix+'src/components/ui/TimeTable.tsx', warning=WARNINGS[1], dayConvention='Monday=0 through Friday=4', slots=slots), indent=2)+'\n',
    }
    for path, content in outputs.items():
        out = ROOT / path
        if args.check:
            assert out.read_text() == content, f'Generated output differs: {path}'
        else:
            out.write_text(content)
    if not args.check:
        for local, b in downloaded.items():
            local.write_bytes(b)
    print(json.dumps(counts, indent=2))
    print('Validated source SHA-256 hashes, counts, references, unique IDs, paired lab periods, minute ranges and internal overlaps.')


if __name__ == '__main__':
    main()
