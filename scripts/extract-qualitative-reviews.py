#!/usr/bin/env python3
"""Extract assigned qualitative PDFs; no network, identity joins, ratings or votes.

Requires Poppler (pdfinfo, pdftotext, pdftoppm). Default manifest is private and
external to the repository. Embedded scan transcriptions were visually checked
against all seven 150-DPI renders. --render reproduces those private QA images.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSIGNED = (2, 3, 4, 5, 6, 8, 10)
AVOID = 'The supplied document lists this name under its avoid category; an unverified student recommendation.'
# Visual transcription of outlined scan text. Page-leading continuations are
# deliberately omitted rather than silently attached across a page boundary.
SCAN = {
1: [
('TAMAS KUMAR PANDA','Tamas is very good; Friendly lecturer; Excellent teaching; Good in correction; If anyone ask for cancellation for class tamas sir will accept; Easy way to get minimum 90 marks in fat,and both quizs in online,take him'),
('SUPRIYA KUMAR PAUL','Supriya is one of the nice staff; Friendly teacher; Tells 10 questions for fat also; And both the quiz will be online; Easy way to get minimum 90 marks in fat; Take him if he is available don’t miss him'),
('NIRMALADEVI S','avg in teaching; Very strict; bad correction; don’t take her'),
('PRATHAP T','avg teaching; full loose in class but,class average is very high; if you take him,confirm pass'),
('NIYAZ AHMED','niyaz is good; friendly in class; tells 10 questions for fat also; but, quiz is tough')],
2: [
('SRIPRIYANKA G','she is so cool in class; avg teaching; but,confirm u will pass in her subject; friendly in class; if you want to pass in course,take her,for learning not worth'),
('ARPAN GARAI','he is soo good; good teaching; best correction; u will confirm'),
('EZHIL ARASI','she is good; moderate teaching; she will make pass every one; even,she will give a grade also'),
('PRATHEEPKUMAR ANNAMALAI','he is best; good in teaching; best in evaluation,and class average is too high'),
('SWATI G','good teaching; moderate in evaluation; she gives imp questions; mostly,she try to pass every one'),
('TAPAS GATAK','avg teaching; bad in evaluation; strict in class and even in lab also.........full support for north indians,and friendly with north indians')],
3: [
('ARYA J5','strict in class; worst in evaluation; she fails half of the class'),
('KANNADHASAN S','teaching good and internals also easy to score; he is very strict; strict evaluation in cat and fat; and very strict in lab'),
('SHEEJA RAJAGOPAL','She is soo god; friendly teacher; she give permission,if u want to go out; good evaluation; don’t miss her'),
('MOHANA CM','avg teaching; linient correction; but,class avg is high'),
('EVAANGELINA','she is the one; she don’t take classes; may be 4-5 classes for entire semester; good correction; friendly with students,never see this type of lecturer'),
('BLESSY SHARMON','avg teaching; friendly with students; but,some what strict')],
4: [
('PALLAVI MISHRA','she is soo cool in class; friendly with students; evaluation also good; some times she cancel the classes; if u req to put that quiz want in online,she will accept it; easy to pass'),
('KAARTHIKEYAN S','teaching good; friendly with students; he teaches only what is imp for exam; evaluation also good'),
('VIDHYA B','she is avg in class; teaching ok; evaluation good'),
('TABINDA NAHID','not good in teaching; strict in class; very good correction; for teaching she bring some papers and written it on the board'),
('NALLAIH M','teaching is worst; step wise evaluation')],
5: [
('ANINDITA KUNDU','she is soo good; excellent teaching; genuine correction; friendly with students; she try to pass every one'),
('NITHYA KS','avg teaching; good evaluation; friendly with students'),
('NITHYA NS','avg teaching; moderate evaluation'),
('GOPINATH MP','avg teaching; friendly teaching; he gives good marks; in lab we will easyly pass'),
('LIJO VP','doesn’t teach well; strict correct; strict in class and lab also; but,he left from clg'),
('MURALI S','good teaching; good evaluation; but some what strict')],
6: [
('VIJAYALAKSHMI.U','good in teaching; best evaluation; friendly with students,but some wt strict'),
('SWARNALATHA P','she is good; avg teaching; good evaluation; some times strict; she passes every one'),
('SRINIVASAN LATHA','she is strict; she wont give marks; avg teaching'),
('SATYANARAYANI','he is soft; good teaching; he will pass every one; evaluation is good'),
('K SANTHAKUMAR','he is the one,I have never seen; friendly with students; he takes class 20 mins only....if you want to leave the class we can leave,he accept it; one of the best evaluator; 30/30 internals confirm; He tells important questions for fat,cat; One of the best lecturer(don’t miss him)'),
('GOPI R','Avg teaching; good evaluation')],
7: [
('THIRUMOORTHY','avg teaching; good evaluation; he pass every one; and he give good marks in internals'),
('ANITHA R','she is good; hexcellent in teaching; but very very rod; strict evaluation...even lab also; step by step correction; rod correction,wt u written in exam she gives marks for that only.....she doest give 0.5 marks also....pass or fail she didn’t care that'),
('RAVI S','he is good; avg teaching; very very strict; strict evaluation; strict in internals also')]
}
# Source 03/04 prose pages: short quotations or faithful category descriptions;
# context is the document's heading, never an inferred course code.
PROSE = {
5: [
('ENGLISH','Evangeline','Listed under BEST LIST FACULTY / ENGLISH.'),
('Engineering Physics','John Kennedy','Really awesome teacher. You will have fun inhis class and he’ll also tell you about his research'),
('ECE Lab','Vinitha','Vinitha Ma’am is really good.( I’m not sure sure if I spelled it right, Good notes and all)'),
('ECE Lab','Jagannath M','Marks chala baga vesthadu chillBut one backlog. Copy kottina Late submission aina marks teesestahdu atleast font style and lopala mattermarchali'),
('Calculus for Engineers','Mohana','Simply she is the BEST, very friendly and sheteaches well too'),
*[( 'Differential Calculas',n,'Listed as a recommended option: Kalyani Desikan, Pankaj Shukla, Mohana N lekapothey BALAJI SIRunthey tgeeskondi') for n in ['Kalyani Desikan','Pankaj Shukla','Mohana N','BALAJI SIR']]],
6: [
('Problem-solving and Programming','Maheswari R','Not really sure about this but I’m going to suggest youmy teacher, she was really good at teaching us.'),
('C++ and C','RICHA','she is good'),('C++ and C','Janaki Meena', 'she is pretty good'),
('Computer Science','MUTHUKUMAR','strict for marks…teaches well'),
*[(None,n,'Listed among faculties the source says you should definitely take if offering any subject.') for n in ['Abdul Quidar','Khadar Nawas','Sakarrvarti','Anosouya','Geeta S','Nisha','Dhanashaker','David Maxim','Abhishek Kumar Singh']]],
7: [
*[( 'English Theory',n,'Listed as a recommended option under English Theory.') for n in ['Alan G','Luke Gerard Cristie']],
*[( 'English Theory / Lab',n,AVOID) for n in ['Saradha Rajkumar','Evangeline','Mary Chandini','Shivakumari']],
('English Lab','Alan G','He would give you marks if you do well, but for sure he will be really strict and you may have to face a little embarrassment if you are not very good with the subject. A really helpful faculty and would see to it that you get the subject well!'),
('English Lab','Luke','Luke sir is not that good for Lab.'),('English Lab','Mary Chandini','Mary Chandini is not good for Lab.'),
*[( 'Physics Theory',n,'Listed as a recommended option under Physics Theory.') for n in ['Vinitha','Kennedy','Punithavelan','Atanu dutta','Arun Kumar']],
*[( 'Physics Theory',n,'not good for the subject and your marks.') for n in ['Bornali','Kavi Yarsan','Manikanandan']],
('Physics Theory','Vigneshwaran Swaminathan','gives good'),
*[( 'Physics Lab',n,'Listed as a recommended option under Physics Lab.') for n in ['Vinitha','Kennedy','Punithavelan','Atanu dutta','Arun Kumar']],
('Physics Lab','Bornali','Bornali is not at all good for the subject. I am saying so because though she will give you marks (a lot of it), but she knows nothing about the subject!'),
*[( 'Physics Lab',n,'would also be fine for Lab!') for n in ['Kavi Yarsan','Manikanandan']],
('Physics Lab','Vigneshwaran Swaminathan','gives good')],
8: [
*[( 'Electrical Theory',n,'Listed as a recommended option under Electrical Theory.') for n in ['Gunabalan R','Krithiga','Gannaswathika']],
*[( 'Electrical Theory',n,AVOID) for n in ['Lavanya','Meera P. S.','C. Umayil','T. Deepa']],
('Electrical Theory','Kritiga','few people liked her way of teaching but a majority did not but still, I’d say she is a good teacher. At least she knows her subject well!'),
*[( 'Engineering Physics',n,AVOID) for n in ['DR.NIRMAL THYAGU','MANIKANDAN']],
*[( 'Physics',n,'Go for Sanjit Das or Punithavelan') for n in ['Sanjit Das','Punithavelan']],
('English','RASHMI REKHA BORAH',AVOID),
*[( 'Maths',n,'Mohana, Pankaj shukla and S. Radha or BRENI GRENI are the best, u can go for anyone of the rest.') for n in ['Mohana','Pankaj shukla','S. Radha','BRENI GRENI']]]
}


def clean(s):
    return re.sub(r'\s+', ' ', s.replace('\u200b','')).strip()


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--manifest',default='/tmp/ffcs-reviews/manifest.json')
    ap.add_argument('--render',type=Path,help='Private directory for representative and all scan page PNGs')
    args=ap.parse_args()
    manifest=json.loads(Path(args.manifest).read_text())
    sources={n: next(s for s in manifest if s['id']==f'attachment-{n:02}') for n in ASSIGNED}
    pages={}; hashes={}; records=[]; excluded=[]
    for n,s in sources.items():
        path=Path(s['path']); hashes[n]=hashlib.sha256(path.read_bytes()).hexdigest()
        info=subprocess.check_output(['pdfinfo',str(path)],text=True)
        count=int(re.search(r'^Pages:\s+(\d+)',info,re.M)[1])
        txt=subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True)
        pages[n]=txt.split('\f')[:count]
        assert len(pages[n])==count==s['pages'], (n,count,s['pages'])
        if args.render:
            args.render.mkdir(parents=True,exist_ok=True)
            cmd=['pdftoppm','-png','-r','150'] if n==6 else ['pdftoppm','-png','-f','1','-singlefile','-scale-to','1400']
            subprocess.run(cmd+[str(path),str(args.render/f'{n:02}')],check=True)
    def add(n,page,name,text,context=None,row=None,ocr=False,warnings=None):
        name=clean(name);text=clean(text)
        assert name and text
        s=sources[n]
        rec=dict(id='',facultyName=name,rating=None,sampleSize=None,text=text,sourceId=s['id'],sourceName=s['name'],page=page,kind='qualitative',extraction='ocr' if ocr else 'text',date=None,
                 warnings=['Unverified student opinion; source spelling preserved; no identity resolution.']+(warnings or []))
        if context:rec['context']=context
        if row:rec['sourceRow']=clean(row)
        key=json.dumps([name,text,context],ensure_ascii=False)
        same=next((r for r in records if r['_key']==key),None)
        citation=dict(sourceId=s['id'],sourceName=s['name'],page=page)
        if row:citation['sourceRow']=clean(row)
        if same:
            same.setdefault('sourceCitations',[dict(sourceId=same['sourceId'],sourceName=same['sourceName'],page=same['page'],**({'sourceRow':same['sourceRow']} if 'sourceRow' in same else {}))]).append(citation)
            same['duplicateGroup']='qual-'+hashlib.sha256(key.encode()).hexdigest()[:16]
            return
        rec['_key']=key
        rec['id']='qual-'+hashlib.sha256((str(n)+'|'+str(page)+'|'+key).encode()).hexdigest()[:16]
        records.append(rec)
    # 02: each heading ends in colon; following bullet block belongs to it.
    for p,body in enumerate(pages[2],1):
        if p==1:continue
        heads=list(re.finditer(r'^([^\n•]{1,70}?)\s*:\s*$',body,re.M))
        for i,h in enumerate(heads):
            text=body[h.end():heads[i+1].start() if i+1<len(heads) else len(body)]
            text=re.sub(r'\s*•\s*','; ',text).strip(' ;\n')
            add(2,p,h[1], 'The supplied student feedback states: '+text,row=h[0].strip())
    # 03/04 pages 1-4: heading-aware category lists, retaining their course context.
    headings={'AOD','Stats:','Chemistry','Applied Linear Algebra','Human Computer Interaction','Physics','Artificial Intelligence','DSA','Materials:','Manufacturing Process:','Blockchain','Natural Language Processing','Fluid:','SOM :','BEEE:','OOPS:','Thermodynamics','Image Processing','Network Theory :','Network and communication','Not to take teachers❌❌','Most blacklisted -',"Don't ever take these...",'Database management','Good-','Black listed☠'}
    ambiguous={'Rajashekaran G Prakash M','Sureshkumar N Divya','lakshmi K','All babus'}
    for n in (3,4):
        context=None; good=False
        for p,body in enumerate(pages[n][:4],1):
            for raw in body.splitlines():
                line=clean(raw)
                if not line or line in {'Blacklist Updated list','Blacklist(updated)'} or not re.search(r'[A-Za-z]',line):continue
                line=re.sub(r'[^A-Za-z0-9 .,:()\-–…’]+', '', line).strip()
                if line=='AOD:':line='AOD'
                if line=='Dont ever take these...':line="Don't ever take these..."
                if line=='Not to take teachers':line='Not to take teachers❌❌'
                if line=='Black listed':line='Black listed☠'
                if line=='DEVENDRANATH':line='DEVENDRANATH'
                if line in headings:
                    if line=='Good-':good=True
                    elif line=='Black listed☠':good=False
                    elif line in {'Not to take teachers❌❌','Most blacklisted -',"Don't ever take these..."}:context=line;good=False
                    else:context=line;good=False
                    continue
                if line in ambiguous:
                    excluded.append(f'{sources[n]["id"]} p{p}: ambiguous/group name: {line}');continue
                name=re.split(r'\(|\s+[Ff]ailed\s+|-[ ]?failed',line)[0].strip()
                text=('The supplied document lists this name under its Good category; an unverified student recommendation.' if good else AVOID)
                if name!=line:text+=' Source annotation: '+line[len(name):].strip()
                add(n,p,name,text,context,row=line)
        for p,items in PROSE.items():
            for context,name,text in items:
                add(n,p,name,'The supplied student recommendation states: '+text if text!=AVOID else text,context)
    # 05: carry a heading across page breaks; keep category as source opinion.
    context=None;category=None
    for p,body in enumerate(pages[5],1):
        lines=body.replace('\u200b','').splitlines();i=0
        while i<len(lines):
            l=clean(lines[i]);i+=1
            if l.startswith('🟦'):context=l.removeprefix('🟦').strip();continue
            if l in ['Good Teachers:','Teachers to Avoid:','Other Teachers (Neutral/Unknown):']:category=l.rstrip(':');continue
            if not l.startswith('●'):continue
            content=l.removeprefix('●').strip()
            while i<len(lines) and lines[i].strip() and not clean(lines[i]).startswith(('●','🟦')):
                content+=' '+clean(lines[i]);i+=1
            name=content.split(' (')[0]
            if category=='Other Teachers (Neutral/Unknown)':
                excluded.append(f'attachment-05 p{p}: neutral/unknown listing without opinion: {name}');continue
            text=f'The supplied document lists this name under "{category}"; an unverified student recommendation.'
            warnings=[]
            if '(' in content:
                text+=' Source note: '+content[len(name):].strip()
                warnings=['Source makes its own overlap/identity or prior-list assumption; not adopted by extraction.']
            add(5,p,name,text,context,row=content,warnings=warnings)
    # 06: visually verified transcription; extraction=ocr includes manual correction.
    for p,items in SCAN.items():
        for name,text in items:
            add(6,p,name,'The supplied student feedback states: '+text,ocr=True,warnings=['Manual visual transcription of outlined scan text; punctuation normalized; selected clearly associated comments.'])
    # 08: only explicit faculty-cell parenthetical opinions, not provider (APT).
    context=None
    contexts={1:'Information Security Management',11:'Software Engineering',16:'Embedded Systems',19:'- Artificial Intelligence',22:'Cryptography and Network Security',27:'Spanish I',28:'French I',29:'German I'}
    for p,body in enumerate(pages[8],1):
        context=contexts.get(p,context)
        for raw in body.splitlines():
            match=re.match(r'^\s*(\S+)\s{2,}(\S+)\s{2,}(.+?)\s*\(([^)]+)\)\s*$',raw)
            if match and match[4]!='APT':
                add(8,p,match[3], 'The supplied document annotates this faculty as "'+match[4]+'"; an unverified student opinion.',context,row=raw)
    # Stable output and generated audit; no private paths/PDF copies in output.
    for r in records:r.pop('_key')
    out=ROOT/'src/data/review-sources/qualitative.json';out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    counts=collections.Counter(r['sourceId'] for r in records)
    citations=collections.Counter()
    for r in records:
        for c in r.get('sourceCitations',[r]):citations[c['sourceId']]+=1
    audit=['# Qualitative review extraction audit','',
        'Run: `python3 scripts/extract-qualitative-reviews.py --manifest /tmp/ffcs-reviews/manifest.json`.',
        'Requires Poppler. Optional `--render /tmp/ffcs-review-qa` renders representative pages and all seven scanned pages outside the repository. All assigned PDFs are read directly from manifest paths; hashes and actual page counts are checked on each run. No raw PDF is copied into public assets.', '',
        '## Coverage','', '| Source | Pages | Primary records | Citations including duplicates | SHA-256 |','| --- | ---: | ---: | ---: | --- |']
    for n,s in sources.items():audit.append(f'| {s["id"]}: {s["name"]} | {len(pages[n])} | {counts[s["id"]]} | {citations[s["id"]]} | `{hashes[n]}` |')
    audit+=['','## Interpretation and deduplication','',
        f'- {len(records)} distinct records; {sum(citations.values())} retained source/page citations. Exact faculty spelling + text + context repetitions collapse into one record with `sourceCitations` and `duplicateGroup`. Duplicate citations are provenance, not independent votes.',
        '- Attachments 03 and 04 overlap substantially but differ. Only exact name/text/context records collapse, retaining both citations. Different faculty spellings and unique entries remain separate.',
        '- Every rating, sampleSize and date is null. Course headings are preserved as written. No course codes or faculty identity joins are inferred. Contradictory source opinions remain separate.',
        '- Blacklist membership uses the requested avoid-category disclaimer. Source annotations are attributed student statements, never verified faculty facts. Profanity/claims in source text are unverified quotations, not endorsed descriptions.',
        '- 02: all named feedback blocks on pages 2-21 extracted; page 1 is introductory guidance, not a review. Bullet wrapping is normalized.',
        '- 03/04: pages 1-4 category lists parsed; pages 5-8 clearly attributed prose/categories curated. General advice for unnamed English teachers is excluded. Computer Science list Kannadasan/Narayanamoorthy/Krishnamoorthy/Naresh is excluded because it only speculates who might teach freshers, without a clear evaluative statement.',
        '- 05: Good Teachers and Teachers to Avoid retained as opinions. Neutral/Unknown names excluded. Parenthetical source assumptions about shared identity are retained as source notes and explicitly not adopted.',
        '- 06: all seven pages rendered at 150 DPI and visually inspected. Tesseract 5 default extraction returned empty text for the outlined font. Embedded manual visual transcriptions are reproducible curated data, labeled extraction=ocr because the raw enum has no visual option; warnings distinguish manual transcription. Selected legible comments are transcribed, not an assertion of exhaustive verbatim OCR.',
        '- 06 limitations: p4 outlined name resembling EASWARAMOOETHY excluded because spelling uncertain. Page-leading continuation bullets on p2 (minimum 90 marks), p3 (north-Indian correction claims), p4 (average marks), p5 (confirm pass), p6 (VIJAYALAKSHMI.U continuation is explicitly joined from p5 heading), p7 (somewhat strict) are excluded except the unambiguous p5-to-p6 heading continuation. No unattached bullet is assigned to an uncertain name.',
        '- 06 ARYA J5 preserves the visible source spelling (not corrected to a presumed faculty name); treat as identity-uncertain. No matching performed here.',
        '- 08: only explicit parenthetical faculty comments retained. (APT) denotes provider/type, not an opinion. Plain offering rows, colored/highlighted rows without verbal evaluation, room/slot lists, and language offerings are excluded. Context is carried only within the explicit section boundaries.',
        '- 10: all eight pages of text inspected; no evaluative faculty annotations found. These are offering tables. (APT), TH, LO and SS are classifications, not reviews. No review records emitted. Representative first page visually checked; no claim of exhaustive image annotation detection across all eight pages.',
        '- Visual QA recorded by extraction worker: first pages of 02/03/05/08/10 and all seven pages of 06 inspected. Sources 03 and 04 are overlapping revisions, not identical copies. Shared prose pages are curated; unique early-page entries are parsed separately.','',
        '## Explicit row exclusions','']
    audit.extend('- '+x for x in excluded)
    (ROOT/'docs/QUALITATIVE_REVIEW_AUDIT.md').write_text('\n'.join(audit)+'\n')
    print(json.dumps({'records':len(records),'citations':sum(citations.values()),'primaryCounts':counts,'citationCounts':citations},indent=2))

if __name__=='__main__':main()
