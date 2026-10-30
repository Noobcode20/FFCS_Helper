#!/usr/bin/env python3
"""Extract attachment 12 and 01 using Poppler's positioned text (no PDF vendoring).

Requires pdftotext on PATH; Python standard library only. No OCR is necessary for
these text PDFs. Re-run with --manifest PATH and --output-dir PATH as appropriate.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

NS = {'x': 'http://www.w3.org/1999/xhtml'}
RATING = re.compile(r'(?<![\d.])(\d+(?:\.\d+)?)\s*(?:/\s*5\b|out\s+of\s+5\b)', re.I)
COUNT = re.compile(r'\(\s*(\d+)\s*reviews?\s*\)', re.I)
ROOT = Path(__file__).resolve().parents[1]


def positioned_pages(source):
    result = subprocess.run(['pdftotext', '-bbox-layout', source['path'], '-'],
                            check=True, capture_output=True)
    root = ET.fromstring(result.stdout)
    pages = []
    for page in root.findall('.//x:page', NS):
        lines = []
        for line in page.findall('.//x:line', NS):
            lines.append({'x': float(line.get('xMin')), 'y': float(line.get('yMin')),
                          'text': ' '.join(w.text or '' for w in line)})
        pages.append(sorted(lines, key=lambda l: (l['y'], l['x'])))
    return pages


def base(source, identity, name, page):
    return dict(id=identity, facultyName=name, rating=None, sampleSize=None,
                text=None, sourceId=source['id'], sourceName=source['name'],
                page=page, date=None, extraction='text')


def join_lines(lines):
    text = ''
    for line in lines:
        text += ('\n' if line.startswith('•') and text else ' ' if text else '') + line
    return text.strip() or None


def clean_text(text, row=None):
    """Narrow, auditable omissions; numeric evidence is never removed."""
    warnings = []
    if row in (497, 518, 593):
        return None, ['Nonacademic personal allegation/insult omitted; numeric row retained.']
    if row == 112:
        text = text.replace('Sexy professor. ', '')
        warnings.append('Incidental appearance comment omitted.')
    if re.search(r'\bnigga\b', text, re.I):
        text = re.sub(r'\bnigga\b', '[slur omitted]', text, flags=re.I)
        warnings.append('Slur redacted; academic content retained.')
    if re.search(r'blacklist', text, re.I):
        text = re.sub(r'Already been blacklisted\.', '[Subjective label omitted.]', text, flags=re.I)
        text = re.sub(r'\bblacklisted\b', '[subjective label omitted]', text, flags=re.I)
        text = re.sub(r'(?m)^•\s*Blacklist\s*\(\s*2 reviews\)\s*\n?', '', text, flags=re.I)
        warnings.append('Subjective blacklist label omitted; not an institutional designation.')
    return text.strip() or None, warnings


def extract_clean(source, pages):
    records = []
    for pn, lines in enumerate(pages, 1):
        starts = [(int(l['text']), l['y']) for l in lines
                  if l['x'] < 60 and re.fullmatch(r'\d+', l['text'])]
        for i, (row, y) in enumerate(starts):
            end = starts[i + 1][1] if i + 1 < len(starts) else float('inf')
            cells = [[], [], [], []]
            for l in lines:
                if y - .1 <= l['y'] < end - .1 and l['x'] >= 60:
                    col = 0 if l['x'] < 207 else 1 if l['x'] < 248 else 2 if l['x'] < 290 else 3
                    cells[col].append(l['text'])
            name, rating, count = (' '.join(c) for c in cells[:3])
            assert re.fullmatch(r'\d\.\d{2}', rating), (pn, row, cells)
            assert count.isdigit() or count == '?', (pn, row, cells)
            r = base(source, f'attachment-12-row-{row:03}', name, pn)
            text, warnings = clean_text(join_lines(cells[3]) or '', row)
            r.update(rating=float(rating), sampleSize=int(count) if count.isdigit() else None, text=text,
                     sourceRow=str(row), kind='aggregate',
                     sourceClaim='PDF states: 608 faculty; source: ratemyvitprofs.',
                     context='Explicit table rating on 0-5 scale and Reviews column; comments are source excerpts.',
                     warnings=['Source opinions are unverified.',
                               'Table comments may be truncated in the original PDF; no completion inferred.'] + warnings)
            if count == '?':
                r['warnings'].append('Reviews column is ? in original PDF; count unknown.')
            if text and '■' in text:
                r['warnings'].append('Original PDF contains square replacement glyphs; not reconstructed.')
            assert 0 <= r['rating'] <= 5
            records.append(r)
    assert [r['sourceRow'] for r in records] == [str(i) for i in range(1, 609)]
    return records


def extract_reviews(source, pages):
    blocks = []
    current = None
    for pn, lines in enumerate(pages, 1):
        previous_y = None
        for l in lines:
            text, x, y = l['text'], l['x'], l['y']
            if text == 'FACULTY REVIEW':
                previous_y = None
                continue
            # Headings share the left paragraph margin with wrapped prose, but
            # have a >30pt vertical gap (or are first on a page). No case folding:
            # mixed-case headings on pages 20/22/23 are real source headings.
            heading = (abs(x - 72.024) < 1 and
                       (previous_y is None or y - previous_y > 30) and
                       re.fullmatch(r'[A-Za-z][A-Za-z .]*', text) is not None)
            if heading:
                current = {'name': text, 'page': pn, 'lines': [], 'endPage': pn}
                blocks.append(current)
            else:
                assert current is not None, (pn, text)
                current['lines'].append(text)
                current['endPage'] = pn
            previous_y = y
    records = []
    for index, b in enumerate(blocks, 1):
        original = join_lines(b['lines']) or ''
        text, warnings = clean_text(original)
        ratings = list(RATING.finditer(original))
        counts = list(COUNT.finditer(original))
        if b['name'] == 'SANTHI H':
            warnings.append('Final source sentence ends at "even if u write"; continuation absent in PDF.')
        if b['endPage'] > b['page']:
            warnings.append(f'Faculty block continues through page {b["endPage"]}; page is heading start page.')
        if b['name'] == 'CHRISTINA JOSEPHINE MALATHI A':
            warnings.append('Comparative answer mentions Lavanya; pronoun target ambiguous. Kept under source heading; no inferred reassignment.')
        for n, match in enumerate(ratings or [None], 1):
            r = base(source, f'attachment-01-block-{index:03}-evidence-{n}', b['name'], b['page'])
            count = None
            if match:
                # A parenthesized explicit count must immediately follow rating.
                attached = re.match(r'\s*\(\s*(\d+)\s*reviews?\s*\)', original[match.end():], re.I)
                if attached:
                    count = int(attached.group(1))
            elif counts and len({m.group(1) for m in counts}) == 1:
                count = int(counts[0].group(1))
            r.update(rating=float(match.group(1)) if match else None,
                     sampleSize=count, text=text, sourceRow=f'block-{index:03}',
                     kind='aggregate' if match else 'qualitative',
                     sourceClaim='Page artwork states: Source: WhatsApp Chat.',
                     context='Faculty-heading block; bullets have no reliable individual reviewer identities. Explicit ratings use /5 or out of 5.',
                     warnings=['Source opinions are unverified; bullet count is not a respondent count.'] + warnings)
            if len(ratings) > 1:
                r['kind'] = 'aggregate'
                r['warnings'].append('Conflicting individual ratings in same block retained separately; total block review count not assigned to either rating.')
            assert r['rating'] is None or 0 <= r['rating'] <= 5
            records.append(r)
    return records, blocks


def exact_duplicates(a, b):
    """Report literal text matches, plus literal matching bullet excerpts.

    Different names are never merged. Generic opinions can coincide by chance.
    """
    def index(records, bullets=False):
        result = defaultdict(list)
        for r in records:
            for t in (r['text'] or '').split('\n') if bullets else [r['text'] or '']:
                if t:
                    result[t].append(r['id'])
        return result
    result = {}
    for label, bullets in [('recordText', False), ('bulletText', True)]:
        x, y = index(a, bullets), index(b, bullets)
        result[label] = [{'text': t, 'attachment12': x[t], 'attachment01': y[t]}
                         for t in sorted(x.keys() & y.keys())]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path('/tmp/ffcs-reviews/manifest.json'))
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'src/data/review-sources')
    parser.add_argument('--report', type=Path, help='Optional local JSON audit details; not an attachment copy')
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    sources = {s['id']: s for s in manifest}
    facts, pages = {}, {}
    for sid in ('attachment-12', 'attachment-01'):
        source = sources[sid]
        pages[sid] = positioned_pages(source)
        facts[sid] = dict(name=source['name'], pages=len(pages[sid]),
                          sha256=hashlib.sha256(Path(source['path']).read_bytes()).hexdigest())
    assert len(pages['attachment-12']) == 19 and len(pages['attachment-01']) == 39
    clean = extract_clean(sources['attachment-12'], pages['attachment-12'])
    reviews, blocks = extract_reviews(sources['attachment-01'], pages['attachment-01'])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, data in [('numeric-clean.json', clean), ('reviews-3.json', reviews)]:
        (args.output_dir / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    report = dict(sources=facts, cleanRecords=len(clean), facultyBlocks=len(blocks),
                  reviewRecords=len(reviews), ratedReviewRecords=sum(r['rating'] is not None for r in reviews),
                  qualitativeReviewRecords=sum(r['rating'] is None for r in reviews),
                  kinds=dict(Counter(r['kind'] for r in reviews)),
                  cleanRatingRange=[min(r['rating'] for r in clean), max(r['rating'] for r in clean)],
                  cleanReviewCountSum=sum(r['sampleSize'] or 0 for r in clean),
                  duplicateHeadingNames={n: c for n, c in Counter(b['name'] for b in blocks).items() if c > 1},
                  exactCrossSourceDuplicates=exact_duplicates(clean, reviews))
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
