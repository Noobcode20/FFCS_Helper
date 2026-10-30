import {describe,it,expect} from 'vitest';
import {validateCatalog,parseCsv,catalogFromRows} from './importer';
import {fixture} from './test-fixture';
describe('catalog validation',()=>{
 it('accepts fully specified data and preserves provenance',()=>expect(validateCatalog(fixture()).catalog?.provenance.source).toBe('Automated test only'));
 it('rejects broken refs and duplicate identities',()=>{const c=fixture();c.offerings[0].facultyId='missing';c.courses.push({...c.courses[0]});expect(validateCatalog(c).errors.length).toBeGreaterThan(1);});
 it('rejects missing slots, unsafe urls and malformed reviews',()=>{const c=fixture();c.offerings[0].components[0].meetings=[];c.provenance.url='javascript:alert(1)';c.reviews=[{id:'r',facultyId:'f',rating:6,date:'yesterday',source:'x',sampleSize:0}];expect(validateCatalog(c).errors.length).toBeGreaterThan(2);});
 it('rejects internal theory/lab overlap',()=>{const c=fixture();c.offerings[0].components.push({type:'lab',slots:['L'],meetings:[{day:0,start:520,end:600,slot:'L'}]});expect(validateCatalog(c).catalog).toBeUndefined();});
 it('preserves separate same-name identities with warning',()=>{const c=fixture();c.faculty.push({id:'f2',name:'Fixture faculty'});expect(validateCatalog(c).warnings.join()).toContain('identities were kept separate');});
 it('handles nonobject and missing arrays without crash',()=>{expect(validateCatalog(null).errors.length).toBe(1);expect(validateCatalog({}).errors.length).toBeGreaterThan(0);});
});
describe('CSV',()=>{
 it('supports BOM, comma, escaped quotes and newlines',()=>expect(parseCsv('\uFEFFa,b\r\n"one, two","say ""hi""\nnext"')[0]).toEqual({a:'one, two',b:'say "hi"\nnext'}));
 it('rejects ambiguous row width and unclosed quotes',()=>{expect(()=>parseCsv('a,b\n1')).toThrow();expect(()=>parseCsv('a,b\n"1,2')).toThrow();});
 it('builds linked component records using explicit IDs',()=>{const row={course_id:'c',code:'C1',title:'Test course',credits:'3',faculty_id:'f',faculty:'Test faculty',offering_id:'o',section:'S',component:'theory',slot:'A',day:'Mon',start:'08:00',end:'08:50'};const result=catalogFromRows([row,{...row,component:'lab',slot:'L',start:'09:00',end:'10:40'}],{source:'Test only',semester:'Test'});expect(result.errors).toEqual([]);expect(result.catalog?.offerings[0].components.length).toBe(2);});
 it('rejects identity conflicts and bad clock values',()=>{const row={course_id:'c',code:'C1',title:'Test course',credits:'3',faculty_id:'f',faculty:'Test faculty',offering_id:'o',section:'S',component:'theory',slot:'A',day:'Mon',start:'08:99',end:'10:40'};expect(catalogFromRows([row],{source:'x',semester:'y'}).errors[0]).toContain('Invalid time');});
});

describe('file parsing',()=>{
 it('reads a real XLSX workbook and rejects formula cells',async()=>{
  const {default:ExcelJS}=await import('exceljs');
  const {parseImportFile}=await import('./importer');
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Offerings');
  sheet.addRow(['course_id','code','title','credits','faculty_id','faculty','offering_id','section','component','slot','day','start','end']);
  sheet.addRow(['c','C1','Fixture course',3,'f','Fixture faculty','o','S','theory','A','Mon','08:00','08:50']);
  let bytes=await book.xlsx.writeBuffer();
  let result=await parseImportFile(new File([bytes as BlobPart],'offering.xlsx'),{source:'Test fixture',semester:'Test'});
  expect(result.errors).toEqual([]);expect(result.catalog?.offerings).toHaveLength(1);
  sheet.getCell('D2').value={formula:'1+2',result:3};bytes=await book.xlsx.writeBuffer();
  result=await parseImportFile(new File([bytes as BlobPart],'formula.xlsx'),{source:'Test fixture',semester:'Test'});
  expect(result.errors.join()).toContain('Formula cells');
 });
 it('rejects malformed JSON and CSV without provenance metadata',async()=>{
  const {parseImportFile}=await import('./importer');
  expect((await parseImportFile(new File(['{broken'],'bad.json'))).errors.length).toBe(1);
  expect((await parseImportFile(new File(['a,b\n1,2'],'data.csv'))).errors.join()).toContain('source and semester');
 });
});

it('preserves unknown credits and source caveats across a JSON import',()=>{
 const c=fixture();c.courses[0].credits=null;c.warnings=['Historical timing model; confirm before registration.'];
 const result=validateCatalog(c);expect(result.errors).toEqual([]);expect(result.catalog?.courses[0].credits).toBeNull();expect(result.warnings).toContain(c.warnings[0]);
});
