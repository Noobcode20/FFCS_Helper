import type { Catalog, ImportResult, Provenance } from './types';

const MAX_BYTES = 20 * 1024 * 1024;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validDate = (v: unknown) => string(v) && !Number.isNaN(Date.parse(v));
const validUrl = (v: unknown) => { try { return typeof v === 'string' && ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } };

export function validateCatalog(input: unknown): ImportResult {
  const errors: string[] = [], warnings: string[] = [];
  const fail = (s: string) => { if (errors.length < 100) errors.push(s); };
  if (!isObject(input)) return { errors: ['Catalog must be a JSON object.'], warnings };
  if (input.version !== 1) fail('Unsupported catalog version. Expected version 1.');
  if (input.campus !== 'Vellore') fail('Only the Vellore campus is supported by this slot model.');
  if (!string(input.semester)) fail('Semester is required; use an explicit unknown/historical label if needed.');
  const provenance = (p: unknown, label: string, required = false) => {
    if (p === undefined && !required) return;
    if (!isObject(p)) { fail(`${label}: source provenance is required.`); return; }
    if (!string(p.source) || !validDate(p.importedAt) || !['historical','imported','verified'].includes(String(p.status))) fail(`${label}: provenance needs source, importedAt date and historical/imported/verified status.`);
    if (p.license !== undefined && !string(p.license)) fail(`${label}: license must be a nonempty string.`);
    if (p.updatedAt !== undefined && !validDate(p.updatedAt)) fail(`${label}: invalid source update date.`);
    if (p.url !== undefined && !validUrl(p.url)) fail(`${label}: source URL must use http or https.`);
    if (p.status === 'verified') warnings.push(`${label}: verification is claimed by this file, not independently established by FFCS Helper.`);
  };
  provenance(input.provenance, 'Catalog', true);
  if(input.warnings!==undefined && (!Array.isArray(input.warnings)||input.warnings.length>50||!input.warnings.every(string))) fail('Catalog warnings must be a bounded list of strings.');
  if(Array.isArray(input.warnings)) warnings.push(...input.warnings.filter(string));
  for (const key of ['courses','faculty','offerings','reviews']) if (!Array.isArray(input[key])) fail(`${key} must be an array.`);
  if (errors.length && !['courses','faculty','offerings','reviews'].every(k => Array.isArray(input[k]))) return { errors, warnings };
  const courses = input.courses as unknown[], faculty = input.faculty as unknown[], offerings = input.offerings as unknown[], reviews = input.reviews as unknown[];
  if (!courses.length) fail('Catalog contains no courses.');
  if (courses.length > 20000 || faculty.length > 30000 || offerings.length > 100000 || reviews.length > 50000) return { errors: ['Catalog exceeds safe record limits.'], warnings };
  const ids = (records: unknown[], label: string) => {
    const set = new Set<string>();
    records.forEach((r,i) => {
      if (!isObject(r) || !string(r.id)) { fail(`${label} row ${i+1}: nonempty id is required.`); return; }
      if (set.has(r.id)) fail(`${label}: duplicate id ${r.id}.`);
      set.add(r.id); provenance(r.provenance, `${label} ${r.id}`);
    }); return set;
  };
  const courseIds = ids(courses, 'Course'), facultyIds = ids(faculty, 'Faculty'); ids(offerings, 'Offering'); ids(reviews, 'Review');
  const codes = new Set<string>();
  courses.forEach(c => {
    if (!isObject(c)) return;
    if (!string(c.code) || !string(c.title)) fail(`Course ${c.id}: code and title required.`);
    if (c.account !== undefined && !string(c.account)) fail(`Course ${c.id}: account must be a nonempty string.`);
    if (c.category !== undefined && !string(c.category)) fail(`Course ${c.id}: category must be a nonempty string.`);
    if (c.credits !== null && (!finite(c.credits) || c.credits < 0 || c.credits > 30)) fail(`Course ${c.id}: credits must be a number from 0 to 30 or null when unavailable.`);
    if (c.aliases !== undefined && (!Array.isArray(c.aliases) || !c.aliases.every(string))) fail(`Course ${c.id}: aliases must be strings.`);
    const code = String(c.code).toUpperCase().replace(/\s/g,'');
    const scope = JSON.stringify([typeof c.account === 'string' ? c.account : '', typeof c.category === 'string' ? c.category : '', code]);
    if (codes.has(scope)) fail(`Duplicate course code ${c.code} in the same account/category; normalize the course identity before import.`); codes.add(scope);
  });
  faculty.forEach(f => { if (!isObject(f)) return; if (!string(f.name)) fail(`Faculty ${f.id}: name required.`); if (f.reviewOnly !== undefined && typeof f.reviewOnly !== 'boolean') fail(`Faculty ${f.id}: reviewOnly must be boolean.`); if (f.department !== undefined && !string(f.department)) fail(`Faculty ${f.id}: department must be a string.`); });
  const facultyNames = new Map<string,string>();
  faculty.forEach(f => { if (!isObject(f) || !string(f.name)) return; const key=f.name.toLowerCase().replace(/\s+/g,' ').trim(); if (facultyNames.has(key)) warnings.push(`Faculty name "${f.name}" has multiple IDs; identities were kept separate.`); facultyNames.set(key,String(f.id)); });
  const offeringCounts = new Map<string,number>();
  offerings.forEach(o => {
    if (!isObject(o)) return;
    if (o.pairingStatus !== undefined && o.pairingStatus !== 'unresolved') fail(`Offering ${o.id}: invalid pairing status.`);
    if (o.scheduleStatus !== undefined && o.scheduleStatus !== 'browse-only') fail(`Offering ${o.id}: invalid schedule status.`);
    if (o.scheduleNote !== undefined && !string(o.scheduleNote)) fail(`Offering ${o.id}: schedule note must be a nonempty string.`);
    if (o.scheduleStatus === 'browse-only' && !string(o.scheduleNote)) fail(`Offering ${o.id}: browse-only status needs a reason.`);
    const blockerKinds = ['missing-times','overlapping-times','unmapped-source-type'];
    if (o.scheduleBlockers !== undefined && (!Array.isArray(o.scheduleBlockers) || !o.scheduleBlockers.length || !o.scheduleBlockers.every((reason: unknown) => blockerKinds.includes(String(reason))) || new Set(o.scheduleBlockers).size !== o.scheduleBlockers.length)) fail(`Offering ${o.id}: invalid browse-only blocker list.`);
    if (o.scheduleStatus === 'browse-only' && (!Array.isArray(o.scheduleBlockers) || !o.scheduleBlockers.length)) fail(`Offering ${o.id}: browse-only status needs explicit blocker reasons.`);
    if (o.scheduleStatus !== 'browse-only' && o.scheduleBlockers !== undefined) fail(`Offering ${o.id}: blocker reasons require browse-only status.`);
    if (!courseIds.has(String(o.courseId))) fail(`Offering ${o.id}: unknown course ${o.courseId}.`);
    if (!facultyIds.has(String(o.facultyId))) fail(`Offering ${o.id}: unknown faculty ${o.facultyId}.`);
    if (!string(o.section)) fail(`Offering ${o.id}: section identifier required.`);
    offeringCounts.set(String(o.courseId),(offeringCounts.get(String(o.courseId))||0)+1);
    if (!Array.isArray(o.components) || !o.components.length) { fail(`Offering ${o.id}: at least one complete component is required.`); return; }
    const allMeetings: {day:number;start:number;end:number}[] = [];
    const observedBlockers = new Set<string>();
    o.components.forEach((c: unknown) => {
      if (!isObject(c) || !['theory','lab','tutorial','project'].includes(String(c.type))) { fail(`Offering ${o.id}: invalid component type.`); return; }
      if (c.sourceType !== undefined && !string(c.sourceType)) fail(`Offering ${o.id}: source component type must be a nonempty string.`);
      if (typeof c.sourceType === 'string' && !['ETH','ELA','TH','LO'].includes(c.sourceType)) observedBlockers.add('unmapped-source-type');
      if (c.venue !== undefined && !string(c.venue)) fail(`Offering ${o.id}: venue must be a string.`);
      if (c.facultyId !== undefined && !facultyIds.has(String(c.facultyId))) fail(`Offering ${o.id}: unknown component faculty.`);
      if (!Array.isArray(c.slots) || !c.slots.length || !c.slots.every(string)) fail(`Offering ${o.id}: component slots required.`);
      if (!Array.isArray(c.meetings)) { fail(`Offering ${o.id}: meetings must be an array.`); return; }
      if (!c.meetings.length) {
        if (o.scheduleStatus === 'browse-only') observedBlockers.add('missing-times');
        else fail(`Offering ${o.id}: explicit meeting intervals required; unknown slots cannot be scheduled.`);
        return;
      }
      c.meetings.forEach((m: unknown) => {
        if (!isObject(m) || !Number.isInteger(m.day) || Number(m.day)<0 || Number(m.day)>6 || !finite(m.start) || !finite(m.end) || !Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start<0 || m.end>1440 || m.start>=m.end || !string(m.slot)) { fail(`Offering ${o.id}: invalid meeting day/time/slot (minutes from midnight, Monday=0).`); return; }
        if (Array.isArray(c.slots) && !c.slots.includes(m.slot)) fail(`Offering ${o.id}: meeting slot ${m.slot} is absent from its component slots.`);
        const meeting={day:Number(m.day),start:m.start,end:m.end};
        if (allMeetings.some(a=>a.day===meeting.day && a.start<meeting.end && meeting.start<a.end)) {
          if (o.scheduleStatus === 'browse-only') observedBlockers.add('overlapping-times');
          else fail(`Offering ${o.id}: linked components contain overlapping meetings.`);
        }
        allMeetings.push(meeting);
      });
      if (Array.isArray(c.slots) && Array.isArray(c.meetings)) for (const slot of c.slots) if (!c.meetings.some(m=>isObject(m)&&m.slot===slot)) fail(`Offering ${o.id}: slot ${slot} has no time interval.`);
    });
    if (o.scheduleStatus === 'browse-only') {
      const declared = Array.isArray(o.scheduleBlockers) ? o.scheduleBlockers.map(String) : [];
      if (!observedBlockers.size || [...observedBlockers].some(reason => !declared.includes(reason)) || declared.some(reason => !observedBlockers.has(reason))) fail(`Offering ${o.id}: browse-only blocker reasons must match missing times, overlapping supplied intervals, or unmapped source component types.`);
      else warnings.push(`Offering ${o.id} is browse-only: ${String(o.scheduleNote)}`);
    } else if (observedBlockers.size) {
      fail(`Offering ${o.id}: missing times, overlaps, or unmapped source component types require browse-only status.`);
    }
  });
  const noOfferings=courses.filter(c=>isObject(c)&&!offeringCounts.has(String(c.id))).length;
  if(noOfferings) warnings.push(`${noOfferings} courses have no known offerings; no registration availability is implied.`);
  reviews.forEach(r=>{
    if(!isObject(r)) return;
    if(!facultyIds.has(String(r.facultyId)) || (r.courseId!==undefined&&!courseIds.has(String(r.courseId)))) fail(`Review ${r.id}: unknown faculty/course.`);
    for(const key of ['rating','teaching','workload','grading','attendance']) {
      if(key==='rating'&&r[key]===null) continue;
      if((key==='rating'||r[key]!==undefined)&&(!finite(r[key])||Number(r[key])<0||Number(r[key])>5)) fail(`Review ${r.id}: ${key} must be between 0 and 5, or a null rating for qualitative feedback.`);
    }
    if(r.sampleSize!==null&&(!Number.isSafeInteger(r.sampleSize)||Number(r.sampleSize)<1)) fail(`Review ${r.id}: sampleSize must be a positive safe integer or null when unknown.`);
    if((r.date!==null&&!validDate(r.date))||!string(r.source)) fail(`Review ${r.id}: source and a valid date (or null when unknown) required.`);
    if(r.rating===null&&!string(r.text)) fail(`Review ${r.id}: qualitative feedback needs text.`);
    if(r.kind!==undefined&&!['aggregate','individual','qualitative'].includes(String(r.kind))) fail(`Review ${r.id}: invalid review kind.`);
    if(r.kind==='qualitative'&&r.rating!==null) fail(`Review ${r.id}: qualitative feedback cannot carry a numeric rating.`);
    if(r.kind==='individual'&&r.sampleSize!==1) fail(`Review ${r.id}: an individual review must have sampleSize 1.`);
    if(r.sourceUrl!==undefined&&!validUrl(r.sourceUrl)) fail(`Review ${r.id}: invalid source URL.`);
    if(r.text!==undefined&&(typeof r.text!=='string'||r.text.length>10000)) fail(`Review ${r.id}: review text is too long.`);
    for(const key of ['context','sourceFacultyName']) if(r[key]!==undefined&&!string(r[key])) fail(`Review ${r.id}: ${key} must be a string.`);
    if(r.notes!==undefined&&(!Array.isArray(r.notes)||r.notes.length>30||!r.notes.every(string)))fail(`Review ${r.id}: notes must be bounded strings.`);
    if(r.importedAt!==undefined&&!validDate(r.importedAt)) fail(`Review ${r.id}: invalid import date.`);
    if(r.verification!==undefined&&r.verification!=='user-supplied') fail(`Review ${r.id}: invalid verification label.`);
    if(r.evidence!==undefined) {
      if(!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>30) fail(`Review ${r.id}: evidence must be a bounded nonempty array.`);
      else for(const e of r.evidence){
        if(!isObject(e)||!string(e.sourceId)||!string(e.sourceName)){fail(`Review ${r.id}: evidence needs source ID and filename.`);continue;}
        if(e.page!==undefined&&(!Number.isInteger(e.page)||Number(e.page)<1)) fail(`Review ${r.id}: evidence page must be positive.`);
        if(e.sourceRow!==undefined&&!string(e.sourceRow))fail(`Review ${r.id}: invalid source row.`);
        if(e.sha256!==undefined&&(typeof e.sha256!=='string'||!(/^[a-f0-9]{64}$/i.test(e.sha256))))fail(`Review ${r.id}: invalid evidence hash.`);
        if(e.extraction!==undefined&&!['text','ocr'].includes(String(e.extraction)))fail(`Review ${r.id}: invalid extraction method.`);
      }
    }
  });
  if(isObject(input.provenance)) {
    if(input.provenance.status!=='verified') warnings.push('Imported/historical data is not verified current semester availability. Confirm all sections manually in VTOP.');
    const date=input.provenance.updatedAt||input.provenance.importedAt;
    if(validDate(date)&&Date.now()-Date.parse(String(date))>1000*60*60*24*90) warnings.push('Source data is older than 90 days. Check for a newer semester export.');
  }
  return {catalog: errors.length ? undefined : structuredClone(input) as unknown as Catalog,errors,warnings:[...new Set(warnings)]};
}

// RFC 4180 quoted-field parser; rejects ambiguous row widths instead of guessing.
export function parseCsv(text: string): Record<string,string>[] {
  const rows: string[][] = []; let row: string[]=[], value='', quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) { if(ch==='"') {if(text[i+1]==='"'){value+='"';i++;} else quoted=false;} else value+=ch; }
    else if(ch==='"') {if(value) throw new Error('Unexpected quote in CSV field.'); quoted=true;}
    else if(ch===','){row.push(value);value='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}
    else value+=ch;
  }
  if(quoted)throw new Error('Unclosed quoted CSV field.');
  row.push(value);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw new Error('CSV needs a header and at least one data row.');
  const headers=rows.shift()!.map(h=>h.trim());
  if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV headers.');
  return rows.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV row ${i+2}: expected ${headers.length} columns, found ${r.length}.`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
}

export interface ImportMetadata { semester: string; source: string; url?: string; }
const requiredHeaders=['course_id','code','title','credits','faculty_id','faculty','offering_id','section','component','slot','day','start','end'];
function minute(s:string) {if(!/^\d{1,2}:\d{2}$/.test(s))throw new Error(`Invalid time "${s}"; use HH:MM.`); const [h,m]=s.split(':').map(Number);if(h>23||m>59)throw new Error(`Invalid time "${s}".`);return h*60+m;}
export function catalogFromRows(rows:Record<string,string>[],metadata:ImportMetadata):ImportResult {
  if(!rows.length) return {errors:['No data rows found.'],warnings:[]};
  const missing=requiredHeaders.filter(h=>!(h in rows[0]));
  if(missing.length)return {errors:[`Missing columns: ${missing.join(', ')}.`],warnings:[]};
  const p:Provenance={source:metadata.source, url:metadata.url||undefined, importedAt:new Date().toISOString(),status:'imported'};
  const catalog:Catalog={version:1,campus:'Vellore',semester:metadata.semester,provenance:p,courses:[],faculty:[],offerings:[],reviews:[]};
  try {
    rows.forEach((r,index)=>{
      const line=`Row ${index+2}`;
      if(requiredHeaders.some(h=>h!=='credits'&&!r[h]?.trim()))throw new Error(`${line}: every required field needs a value.`);
      const credits=r.credits.trim()===''||r.credits.toLowerCase()==='unknown'?null:Number(r.credits);
      let c=catalog.courses.find(c=>c.id===r.course_id);
      if(!c){c={id:r.course_id,code:r.code,title:r.title,credits,provenance:p};catalog.courses.push(c);}
      else if(c.code!==r.code||c.title!==r.title||c.credits!==credits)throw new Error(`${line}: conflicting course identity ${r.course_id}.`);
      let f=catalog.faculty.find(f=>f.id===r.faculty_id);
      if(!f){f={id:r.faculty_id,name:r.faculty,provenance:p};catalog.faculty.push(f);} else if(f.name!==r.faculty)throw new Error(`${line}: conflicting faculty identity ${r.faculty_id}.`);
      let o=catalog.offerings.find(o=>o.id===r.offering_id);
      if(!o){o={id:r.offering_id,courseId:c.id,facultyId:f.id,section:r.section,components:[],provenance:p};catalog.offerings.push(o);}
      else if(o.courseId!==c.id||o.facultyId!==f.id||o.section!==r.section)throw new Error(`${line}: conflicting offering ${r.offering_id}; pair components with the same offering_id only when explicitly linked by the source.`);
      if(!['theory','lab','tutorial','project'].includes(r.component))throw new Error(`${line}: component must be theory, lab, tutorial or project.`);
      let component=o.components.find(c=>c.type===r.component&&c.venue===(r.venue||undefined));
      if(!component){component={type:r.component as 'theory',slots:[],meetings:[],venue:r.venue||undefined};o.components.push(component);}
      if(!component.slots.includes(r.slot))component.slots.push(r.slot);
      const day=['mon','tue','wed','thu','fri','sat','sun'].indexOf(r.day.toLowerCase().slice(0,3));
      if(day<0)throw new Error(`${line}: day must be Mon, Tue, Wed, Thu, Fri, Sat or Sun.`);
      component.meetings.push({day:day as 0,start:minute(r.start),end:minute(r.end),slot:r.slot});
    });
  } catch(e) {return {errors:[e instanceof Error?e.message:'Invalid rows.'],warnings:[]};}
  return validateCatalog(catalog);
}
export async function parseImportFile(file:File,metadata?:ImportMetadata):Promise<ImportResult> {
  try {
    if(file.size>MAX_BYTES)throw new Error('File exceeds the 20 MB import limit.');
    if(/\.json$/i.test(file.name))return validateCatalog(JSON.parse(await file.text()));
    if(!metadata?.source.trim()||!metadata.semester.trim())throw new Error('Enter the source and semester before importing CSV/XLSX.');
    let rows:Record<string,string>[];
    if(/\.csv$/i.test(file.name))rows=parseCsv(await file.text());
    else if(/\.xlsx$/i.test(file.name)) {
      const {default: ExcelJS}=await import('exceljs');
      const book=new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer());
      const sheet=book.worksheets[0];
      if(!sheet)throw new Error('Workbook has no sheets.');
      if(sheet.rowCount>100001||sheet.columnCount>100)throw new Error('Workbook exceeds the 100,000 row / 100 column limit.');
      const cellText=(cell: import('exceljs').Cell)=>{
        if(cell.type===ExcelJS.ValueType.Formula)throw new Error('Formula cells are not accepted. Export plain values before importing.');
        return cell.text.trim();
      };
      const headers:string[]=[];
      sheet.getRow(1).eachCell({includeEmpty:true},cell=>headers.push(cellText(cell)));
      if(new Set(headers).size!==headers.length)throw new Error('Duplicate XLSX headers.');
      rows=[];
      sheet.eachRow((row,index)=>{if(index===1)return;const record:Record<string,string>={};headers.forEach((h,i)=>record[h]=cellText(row.getCell(i+1)));rows.push(record);});
    }else throw new Error('Choose a .json, .csv or .xlsx file.');
    return catalogFromRows(rows,metadata);
  }catch(e){return {errors:[e instanceof Error?e.message:'Import could not be read.'],warnings:[]};}
}
