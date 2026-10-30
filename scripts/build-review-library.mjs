/** Build a source-attributed library; never invent ratings, votes, dates or faculty IDs. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const directory='src/data/review-sources';
const names=['numeric-clean.json','reviews-3.json','qualitative.json','spreadsheet-notes.json'];
const input=names.flatMap(name=>JSON.parse(fs.readFileSync(`${directory}/${name}`,'utf8')));
let sources;
if(process.argv[2]){
 sources=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).map(s=>({id:s.id,name:s.name,kind:s.kind.replace('.',''),...(s.pages?{pages:s.pages}:{}),sha256:crypto.createHash('sha256').update(fs.readFileSync(s.path)).digest('hex')}));
 fs.writeFileSync(`${directory}/manifest.json`,JSON.stringify(sources,null,2)+'\n');
}else sources=JSON.parse(fs.readFileSync(`${directory}/manifest.json`,'utf8'));
const sourceMap=new Map(sources.map(s=>[s.id,s]));
const excluded=[],records=[];
for(const raw of input){
 const source=sourceMap.get(raw.sourceId);
 if(!source||source.name!==raw.sourceName)throw new Error(`Unknown or inconsistent source: ${raw.id}`);
 if(!raw.facultyName?.trim()||/\d/.test(raw.facultyName)){excluded.push({id:raw.id,name:raw.facultyName,reason:'Uncertain name or digit in source name; retained only in raw extraction.'});continue;}
 if(raw.rating!==null&&(!Number.isFinite(raw.rating)||raw.rating<0||raw.rating>5))throw new Error(`Invalid rating: ${raw.id}`);
 if(raw.sampleSize!==null&&(!Number.isSafeInteger(raw.sampleSize)||raw.sampleSize<1))throw new Error(`Invalid sample count: ${raw.id}`);
 if(raw.rating===null&&!raw.text)throw new Error(`Qualitative text missing: ${raw.id}`);
 const evidence=(raw.sourceCitations||[raw]).map(e=>({sourceId:e.sourceId,sourceName:e.sourceName,...(e.page?{page:e.page}:{}),...(e.sourceRow?{sourceRow:e.sourceRow}:{}),sha256:sourceMap.get(e.sourceId).sha256,extraction:raw.extraction}));
 const context=/^(Explicit table|Faculty-heading block)/.test(raw.context||'')?undefined:raw.context;
 records.push({...raw,context,kind:raw.rating===null?'qualitative':'aggregate',date:null,evidence});
}
const sourceStats=sources.map(s=>({...s,rawRecords:input.filter(r=>r.sourceId===s.id).length,retainedRecords:records.filter(r=>r.evidence.some(e=>e.sourceId===s.id)).length}));
const output={version:1,importedAt:new Date().toISOString(),sources:sourceStats,records,excluded};
fs.writeFileSync('src/data/review-library.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({raw:input.length,retained:records.length,numeric:records.filter(r=>r.rating!==null).length,qualitative:records.filter(r=>r.rating===null).length,excluded},null,2));
