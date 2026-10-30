/** Node 22.18+; independently validate the composed library without browser state. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {attachReviewLibrary,preferredRating} from '../src/lib/reviews.ts';
import {validateCatalog} from '../src/lib/importer.ts';
import {catalogFingerprint} from '../src/lib/storage.ts';
const base=JSON.parse(fs.readFileSync('src/data/catalog.json','utf8'));
const library=JSON.parse(fs.readFileSync('src/data/review-library.json','utf8'));
const result=attachReviewLibrary(base,library);
assert.deepEqual(validateCatalog(result).errors,[]);
assert.equal(catalogFingerprint(base),catalogFingerprint(result),'Review updates must preserve saved timetable compatibility');
assert.deepEqual(base.offerings,result.offerings);
assert.equal(library.records.filter(r=>r.sourceId==='attachment-12').length,608);
assert.equal(library.sources.length,12);
assert.ok(library.records.every(r=>r.date===null));
assert.ok(result.reviews.every(r=>r.verification==='user-supplied'&&r.evidence.length>0));
assert.ok(!library.records.some(r=>/^(?:dont ever|don't ever|blacklist|not to take teachers)/i.test(r.facultyName)));
assert.deepEqual(attachReviewLibrary(result,library),result,'Overlay must be idempotent');
for(const r of result.reviews)for(const e of r.evidence){const source=library.sources.find(s=>s.id===e.sourceId);assert.equal(source.name,e.sourceName);assert.equal(source.sha256,e.sha256);if(e.page)assert.ok(e.page>=1&&e.page<=source.pages);}
const matched=result.faculty.filter(f=>!f.reviewOnly&&result.reviews.some(r=>r.facultyId===f.id));
const counts={sources:12,extractedRecords:library.records.length,displayRecords:result.reviews.length,numericRecords:result.reviews.filter(r=>r.rating!==null).length,qualitativeRecords:result.reviews.filter(r=>r.rating===null).length,namesWithNumericScores:result.faculty.filter(f=>preferredRating(result,f.id)).length,matchedCatalogFaculty:matched.length,reviewOnlyNames:result.faculty.filter(f=>f.reviewOnly).length,sourceOnlyExcluded:library.excluded.length,savedPlanFingerprintUnchanged:true};
console.log(JSON.stringify(counts,null,2));
fs.writeFileSync('src/data/review-sources/integration-audit.json',JSON.stringify(counts,null,2)+'\n');
