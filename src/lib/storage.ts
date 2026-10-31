import type { Catalog, Plan } from './types';
import { isSchedulableOffering } from './engine.ts';
const KEY='ffcs-helper:plans:v1';
export function catalogFingerprint(catalog:Catalog):string {
  // Includes intervals and faculty identity, so a same-ID source update cannot silently reuse a plan.
  const data=JSON.stringify([catalog.campus,catalog.semester,catalog.courses.map(c=>[c.id,c.code,c.credits]),catalog.faculty.filter(f=>!f.reviewOnly).map(f=>[f.id,f.name]),catalog.offerings]);
  let hash=2166136261;for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,16777619);}return `v1-${(hash>>>0).toString(16)}`;
}
export function planShape(input:unknown):input is Plan {
  if(!input||typeof input!=='object')return false;
  const p=input as Plan;
  return typeof p.id==='string'&&p.id.length>0&&typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=200&&typeof p.semester==='string'&&typeof p.catalogFingerprint==='string'&&typeof p.savedAt==='string'&&!Number.isNaN(Date.parse(p.savedAt))&&Array.isArray(p.offeringIds)&&p.offeringIds.length<=100&&p.offeringIds.every(id=>typeof id==='string')&&new Set(p.offeringIds).size===p.offeringIds.length;
}
export function loadPlans():Plan[] {
  const raw=localStorage.getItem(KEY);if(!raw)return [];
  const plans:unknown=JSON.parse(raw);if(!Array.isArray(plans)||!plans.every(planShape))throw new Error('Saved plans are damaged. Restore a backup or clear only FFCS Helper saved plans.');return plans;
}
export function savePlans(plans:Plan[]):void {
  if(!plans.every(planShape))throw new Error('Cannot save invalid plans.');
  try{localStorage.setItem(KEY,JSON.stringify(plans));}catch{throw new Error('Browser storage is unavailable or full. Export a JSON backup to keep your plans.');}
}
export function restorePlans(input:unknown,catalog:Catalog):Plan[] {
  const list=Array.isArray(input)?input:input&&typeof input==='object'&&'plans' in input?(input as {plans:unknown}).plans:undefined;
  if(!Array.isArray(list)||!list.length||list.length>500||!list.every(planShape))throw new Error('Backup must contain a valid array of saved plans.');
  if(new Set(list.map(p=>p.id)).size!==list.length)throw new Error('Backup contains duplicate plan IDs.');
  const fingerprint=catalogFingerprint(catalog), ids=new Set(catalog.offerings.map(o=>o.id));
  if(ids.size!==catalog.offerings.length)throw new Error('Catalog contains ambiguous offering IDs; import a validated catalog first.');
  for(const p of list) {
    if(p.catalogFingerprint!==fingerprint||p.semester!==catalog.semester)throw new Error(`Plan "${p.name}" belongs to a different catalog. Import its original catalog first.`);
    if(p.offeringIds.some((id:string)=>!ids.has(id)))throw new Error(`Plan "${p.name}" refers to missing sections.`);
    const selected=catalog.offerings.filter(o=>p.offeringIds.includes(o.id));
    if(new Set(selected.map(o=>o.courseId)).size!==selected.length)throw new Error(`Plan "${p.name}" repeats a course.`);
    for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++)for(const a of selected[i].components.flatMap(c=>c.meetings))for(const b of selected[j].components.flatMap(c=>c.meetings))if(a.day===b.day&&a.start<b.end&&b.start<a.end)throw new Error(`Plan "${p.name}" contains clashing sections.`);
  }
  return structuredClone(list);
}
export function downloadText(filename:string,text:string,type:string):void {
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadJson(filename:string,data:unknown):void{downloadText(filename,JSON.stringify(data,null,2),'application/json');}
// Prevent spreadsheet formula execution when the exported CSV is opened in Excel.
const csv=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
const clock=(minute:number)=>`${Math.floor(minute/60).toString().padStart(2,'0')}:${(minute%60).toString().padStart(2,'0')}`;
function exportableOfferings(catalog:Catalog,offeringIds:string[]) {
  const selected=catalog.offerings.filter(o=>offeringIds.includes(o.id));
  for(const o of selected) {
    if(!isSchedulableOffering(o))throw new Error(`Cannot export ${o.section}: this allocation has unresolved components or incomplete/conflicting meeting data.`);
  }
  return selected;
}
export function scheduleCsv(catalog:Catalog,offeringIds:string[]):string {
  const rows:unknown[][]=[['Course code','Course','Credits','Faculty','Section','Component','Source course type','Slot','Day','Start','End','Venue','Semester','Source']];
  for(const o of exportableOfferings(catalog,offeringIds)) {
    const c=catalog.courses.find(c=>c.id===o.courseId);for(const part of o.components)for(const m of part.meetings)if(m.day>=0&&m.day<=4)rows.push([c?.code,c?.title,c?.credits,catalog.faculty.find(f=>f.id===(part.facultyId||o.facultyId))?.name,o.section,part.type,part.sourceType,m.slot,['Mon','Tue','Wed','Thu','Fri'][m.day],clock(m.start),clock(m.end),part.venue,catalog.semester,(o.provenance||catalog.provenance).source]);
  }return rows.map(r=>r.map(csv).join(',')).join('\r\n');
}
export function downloadCsv(catalog:Catalog,offeringIds:string[]):void{downloadText('ffcs-timetable.csv','\uFEFF'+scheduleCsv(catalog,offeringIds),'text/csv;charset=utf-8');}
const escapeIcs=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
function fold(line:string):string {let out='',part='',bytes=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(bytes+n>73){out+=part+'\r\n ';part='';bytes=1;}part+=ch;bytes+=n;}return out+part;}
export function scheduleIcs(catalog:Catalog,offeringIds:string[],startDate:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))throw new Error('Choose a valid Monday for calendar export.');
  const base=new Date(`${startDate}T00:00:00Z`);if(Number.isNaN(base.getTime())||base.toISOString().slice(0,10)!==startDate||base.getUTCDay()!==1)throw new Error('Calendar week must start on a Monday.');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FFCS Helper//Vellore planner//EN','CALSCALE:GREGORIAN','X-WR-TIMEZONE:Asia/Kolkata'];
  const timestamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const dateTime=(day:number,min:number)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+day);return d.toISOString().slice(0,10).replace(/-/g,'')+'T'+clock(min).replace(':','')+'00';};
  // One selected week only: no guessed semester end date or recurrence.
  for(const o of exportableOfferings(catalog,offeringIds)) {
    const course=catalog.courses.find(c=>c.id===o.courseId);let index=0;
    for(const c of o.components)for(const m of c.meetings)if(m.day>=0&&m.day<=4){const sourceType=c.sourceType?` (${c.sourceType})`:'';lines.push('BEGIN:VEVENT',`UID:${escapeIcs(o.id)}-${index++}-${startDate}@ffcs-helper.local`,`DTSTAMP:${timestamp}`,`DTSTART;TZID=Asia/Kolkata:${dateTime(m.day,m.start)}`,`DTEND;TZID=Asia/Kolkata:${dateTime(m.day,m.end)}`,`SUMMARY:${escapeIcs(`${course?.code||o.courseId} ${course?.title||''}`)}`,`DESCRIPTION:${escapeIcs(`${catalog.faculty.find(f=>f.id===(c.facultyId||o.facultyId))?.name||'Faculty unknown'} | ${o.section} | ${c.type}${sourceType} ${m.slot}\nPlanning data: ${catalog.semester}. Confirm manually in VTOP.`)}`,`LOCATION:${escapeIcs(c.venue||'Venue unavailable')}`,'END:VEVENT');}
  }lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export function downloadIcs(catalog:Catalog,offeringIds:string[],startDate:string):void{downloadText('ffcs-week.ics',scheduleIcs(catalog,offeringIds,startDate),'text/calendar;charset=utf-8');}
