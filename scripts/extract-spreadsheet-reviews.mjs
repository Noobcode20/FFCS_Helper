/** Read user supplied review attachments; never infer ratings from spreadsheet colors. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
const manifest=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/ffcs-reviews/manifest.json','utf8'));
const source=manifest.find(s=>s.id==='attachment-07');
const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(source.path);
const sheet=workbook.worksheets[0];
const records=[];
function add(name,note,row,range,context){
 if(!name?.trim()||!note?.trim())return;
 records.push({id:`xlsx-07-${range.replace(/[^a-z0-9]/gi,'-')}`,facultyName:name.trim(),rating:null,sampleSize:null,text:note.trim(),sourceId:source.id,sourceName:source.name,sourceRow:`${sheet.name}!${range}`,context,kind:'qualitative',extraction:'text',date:null});
}
// The sheet contains side-by-side course lists. Only explicit written opinion cells count.
for(let row=2;row<=15;row++)add(sheet.getCell(`A${row}`).text,sheet.getCell(`B${row}`).text,row,`A${row}:B${row}`,'Complex');
for(let row=18;row<=30;row++)add(sheet.getCell(`A${row}`).text,sheet.getCell(`B${row}`).text,row,`A${row}:B${row}`,'Discrete');
for(let row=2;row<=15;row++)add(sheet.getCell(`G${row}`).text,sheet.getCell(`I${row}`).text,row,`G${row}:I${row}`,'DSD');
// An explicitly parenthesized assessment in the name cell; slot/clash notes are not reviews.
for(let row=18;row<=30;row++){
 const cell=sheet.getCell(`D${row}`).text;const m=cell.match(/^(.+?)\s*\((difficult qns)\)$/i);
 if(m)add(m[1],m[2],row,`D${row}`,'Java');
}
const sources=[];
for(const entry of manifest.filter(s=>['attachment-07','attachment-09','attachment-11'].includes(s.id))){
 const bytes=fs.readFileSync(entry.path);let details={};
 if(entry.kind==='.xlsx'){
  const b=new ExcelJS.Workbook();await b.xlsx.readFile(entry.path);
  details={sheets:b.worksheets.map(s=>({name:s.name,rows:s.rowCount,columns:s.columnCount})),note:'Only written evaluations included. Slot, venue and name listings and unlabelled cell colors are not ratings.'};
 }else details={note:'Teacher list contains names, slots and course choices but no explicit faculty evaluation; no rating records created.'};
 sources.push({id:entry.id,name:entry.name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),records:records.filter(r=>r.sourceId===entry.id).length,...details});
}
fs.writeFileSync('src/data/review-sources/spreadsheet-notes.json',JSON.stringify(records,null,2)+'\n');
fs.writeFileSync('src/data/review-sources/spreadsheet-audit.json',JSON.stringify(sources,null,2)+'\n');
console.log(JSON.stringify({records:records.length,sources},null,2));
