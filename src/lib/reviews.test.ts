import {describe,it,expect} from 'vitest';
import {normalizeFacultyName,attachReviewLibrary,preferredRating} from './reviews';
import type {ReviewLibrary,RawReview} from './reviews';
import {fixture} from './test-fixture';
import {defaultCatalog,loadReviewLibrary,withBundledReviews} from '../data/catalog';
import {vtopOfferings} from '../data/vtop';
import {validateCatalog} from './importer';
import {catalogFingerprint} from './storage';
const raw=(patch:Partial<RawReview>={}):RawReview=>({id:'a',facultyName:'Fixture faculty',rating:4,sampleSize:12,text:'Test only',sourceId:'source',sourceName:'Test fixture.pdf',page:1,date:null,kind:'aggregate',evidence:[{sourceId:'source',sourceName:'Test fixture.pdf',page:1}],...patch});
const library=(records:RawReview[]):ReviewLibrary=>({importedAt:'2026-10-28T00:00:00Z',records,sources:[]});
describe('source-attributed review integration',()=>{
 it('normalizes punctuation and honorifics, preserving real name prefixes',()=>{expect(normalizeFacultyName('Dr. IYAPPAN P')).toBe(normalizeFacultyName('Iyappan P'));expect(normalizeFacultyName('Drew Smith')).toBe('DREWSMITH');expect(normalizeFacultyName('Mrinal')).toBe('MRINAL');});
 it('matches exact names, keeps fuzzy candidates separate and never invents an offering',()=>{const c=fixture();const output=attachReviewLibrary(c,library([raw(),raw({id:'b',facultyName:'Fixture faculties'})]));expect(output.reviews[0].facultyId).toBe('f');expect(output.faculty.filter(f=>f.reviewOnly)).toHaveLength(1);expect(output.offerings).toEqual(c.offerings);});
 it('refuses ambiguous normalized catalog identities',()=>{const c=fixture();c.faculty.push({id:'different',name:'Dr. Fixture faculty'});const result=attachReviewLibrary(c,library([raw()]));expect(result.faculty.find(f=>f.id===result.reviews[0].facultyId)?.reviewOnly).toBe(true);});
 it('collapses duplicate content while retaining both source citations and one source sample size',()=>{const result=attachReviewLibrary(fixture(),library([raw(),raw({id:'b',sourceId:'other',sourceName:'Other.pdf',evidence:[{sourceId:'other',sourceName:'Other.pdf',page:2}]})]));expect(result.reviews).toHaveLength(1);expect(result.reviews[0].evidence).toHaveLength(2);expect(result.reviews[0].sampleSize).toBe(12);});
 it('preserves conflicting scores as separate source records and prefers the clean snapshot without averaging',()=>{const result=attachReviewLibrary(fixture(),library([raw({rating:1}),raw({id:'b',rating:4.5,evidence:[{sourceId:'attachment-12',sourceName:'Clean.pdf',page:1}]})]));expect(result.reviews).toHaveLength(2);expect(preferredRating(result,'f')?.rating).toBe(4.5);});
 it('preserves unknown date/sample size and qualitative feedback without synthesizing scores',()=>{const result=attachReviewLibrary(fixture(),library([raw({rating:null,sampleSize:null,kind:'qualitative'})]));expect(result.reviews[0].date).toBeNull();expect(result.reviews[0].sampleSize).toBeNull();expect(preferredRating(result,'f')).toBeUndefined();expect(validateCatalog(result).errors).toEqual([]);});
 it('is idempotent and review-only identities do not change the current allocation fingerprint',async()=>{
  const bare={...defaultCatalog,reviews:[],faculty:defaultCatalog.faculty.filter(f=>!f.reviewOnly)};
  const attached=await withBundledReviews(bare);
  expect(await withBundledReviews(attached)).toEqual(attached);
  expect(attached.offerings).toEqual(vtopOfferings);
  expect(attached.courses).toEqual(defaultCatalog.courses);
  expect(catalogFingerprint(attached)).toBe(catalogFingerprint(bare));
  expect(catalogFingerprint(attached)).toBe(catalogFingerprint(defaultCatalog));
 });
 it('validates the complete library, keeps all 608 explicit primary ratings and retains every source reference',async()=>{const reviewLibrary=await loadReviewLibrary();const complete=await withBundledReviews(defaultCatalog);expect(reviewLibrary.sources).toHaveLength(12);expect(reviewLibrary.records.filter(r=>r.sourceId==='attachment-12')).toHaveLength(608);expect(validateCatalog(defaultCatalog).errors).toEqual([]);expect(complete.reviews.length).toBeGreaterThan(1200);expect(complete.reviews.every(r=>r.date===null&&r.verification==='user-supplied'&&r.evidence?.length)).toBe(true);expect(complete.offerings).toEqual(vtopOfferings);});
});
