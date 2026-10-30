import type { Catalog, Faculty, Review, ReviewEvidence } from './types';
export interface RawReview {
 id:string; facultyName:string; rating:number|null; sampleSize:number|null; text:string|null;
 sourceId:string; sourceName:string; page?:number; sourceRow?:string; date:null;
 kind:'aggregate'|'individual'|'qualitative'; context?:string; warnings?:string[]; evidence:ReviewEvidence[];
}
export interface ReviewLibrary { importedAt:string; records:RawReview[]; sources:{id:string;name:string;sha256:string;retainedRecords:number}[]; }
/** Orthographic matching only: honorifics, punctuation, case and whitespace. No fuzzy identities. */
export function normalizeFacultyName(name:string):string {
 return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/^(?:(?:dr|mr|mrs|ms|prof|professor)(?:\.\s*|\s+))+/i,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
const textKey=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/^[•\s]+/gm,'').replace(/\s+/g,' ').trim();

export function attachReviewLibrary(catalog:Catalog,library:ReviewLibrary):Catalog {
 // Rebuild this overlay by prefix to make repeated load/import idempotent; retain user-imported reviews.
 const reviews=catalog.reviews.filter(r=>!r.id.startsWith('attachment-review-'));
 const referencedNames=new Set(reviews.map(r=>r.facultyId));
 const faculty=catalog.faculty.filter(f=>!f.reviewOnly);
 const names=new Map<string,Faculty[]>();
 for(const f of faculty){const key=normalizeFacultyName(f.name);names.set(key,[...(names.get(key)||[]),f]);}
 const sourceOnly=new Map<string,Faculty>(catalog.faculty.filter(f=>f.reviewOnly&&(referencedNames.has(f.id)||!f.id.startsWith('review-only-'))).map(f=>[normalizeFacultyName(f.name),f]));
 const groups=new Map<string,Review>();
 for(const raw of library.records){
  const key=normalizeFacultyName(raw.facultyName);if(!key)continue;
  const matches=names.get(key)||[];
  let person=matches.length===1?matches[0]:sourceOnly.get(key);
  if(!person){person={id:`review-only-${key.toLowerCase()}`,name:raw.facultyName,reviewOnly:true,provenance:{source:'User-supplied review documents; identity not linked to catalog',importedAt:library.importedAt,status:'imported'}};sourceOnly.set(key,person);}
  const context=raw.context?.trim();
  const dedupe=JSON.stringify([person.id,raw.rating,raw.sampleSize,raw.kind,textKey(raw.text||''),textKey(context||'')]);
  const current=groups.get(dedupe);
  if(current){
   for(const e of raw.evidence)if(!current.evidence!.some(x=>JSON.stringify(x)===JSON.stringify(e)))current.evidence!.push(e);
   continue;
  }
  groups.set(dedupe,{id:`attachment-review-${raw.id}`,facultyId:person.id,rating:raw.rating,sampleSize:raw.sampleSize,text:raw.text||undefined,date:null,source:raw.sourceName,kind:raw.kind,context,sourceFacultyName:raw.facultyName,evidence:raw.evidence.map(e=>({...e})),importedAt:library.importedAt,verification:'user-supplied',notes:raw.warnings});
 }
 return {...catalog,warnings:[...(catalog.warnings||[]).filter(w=>!w.startsWith('No permitted review dataset was found.')&&!w.startsWith('Review library:')),'Review library: user-supplied document snapshots, not independently verified faculty identities or current course allocations. Review reuse rights are separate from the MIT offering dataset.'],faculty:[...faculty,...sourceOnly.values()],reviews:[...reviews,...groups.values()]};
}
/** A single source-reported score, not an average of overlapping documents. */
export function preferredRating(catalog:Catalog,facultyId:string,courseId?:string):Review|undefined {
 return catalog.reviews.filter(r=>r.facultyId===facultyId&&r.rating!==null&&(!courseId||!r.courseId||r.courseId===courseId)).sort((a,b)=>{
  const courseA=Number(!!courseId&&a.courseId===courseId),courseB=Number(!!courseId&&b.courseId===courseId);
  const cleanA=Number(a.evidence?.some(e=>e.sourceId==='attachment-12')),cleanB=Number(b.evidence?.some(e=>e.sourceId==='attachment-12'));
  return courseB-courseA||cleanB-cleanA||(b.sampleSize||0)-(a.sampleSize||0)||a.id.localeCompare(b.id);
 })[0];
}
