import { expect, it } from 'vitest';
import { repairFfcs } from './ffcs';
import { fixture } from './test-fixture';
import type { Offering } from './types';
const o = (id:string, courseId:string, start:number, facultyId=id):Offering => ({id,courseId,facultyId,section:id,components:[{type:'theory',slots:['A'],meetings:[{day:0,start,end:start+50,slot:'A'}]}]});
const setup = (offerings:Offering[]) => ({...fixture(),offerings});
it('reuses a same-time teacher while preserving other courses',()=>{
 const a=o('a','c',480), b=o('b','d',600), alt=o('alt','c',480);
 expect(repairFfcs(setup([a,b,alt]),[a,b],'c',[],{}).offeringIds).toEqual(['alt','b']);
});
it('moves only unregistered courses when a replacement clashes',()=>{
 const a=o('a','c',480), b=o('b','d',600), alt=o('alt','c',600), move=o('move','d',720);
 const data=setup([a,b,alt,move]);
 expect(repairFfcs(data,[a,b],'c',[],{}).offeringIds).toEqual(['alt','move']);
 expect(repairFfcs(data,[a,b],'c',['d'],{}).offeringIds).toBeUndefined();
});
it('never resurrects rejected faculty on other courses',()=>{
 const a=o('a','c',480), b=o('b','d',600), alt=o('alt','c',600), move=o('move','d',720);
 expect(repairFfcs(setup([a,b,alt,move]),[a,b],'c',[],{d:['move']}).offeringIds).toBeUndefined();
});
it('prefers preserving all other sections over same-time target swaps requiring repairs',()=>{
 const a=o('a','c',480), b=o('b','d',600), alt=o('alt','c',720);
 expect(repairFfcs(setup([a,b,alt]),[a,b],'c',[],{}).offeringIds).toEqual(['alt','b']);
});
it('favors preferred faculty among equally small repairs',()=>{
 const a=o('a','c',480), first=o('first','c',600), preferred=o('preferred','c',600);
 expect(repairFfcs(setup([a,first,preferred]),[a],'c',[],{}, {preferredFaculty:['preferred']}).offeringIds).toEqual(['preferred']);
});
it('substitutes an explicit backup only after the original has no usable section',()=>{
 const a=o('a','c',480), backup=o('backup','e',600);
 expect(repairFfcs(setup([a,backup]),[a],'c',[],{}, {}, ['e'])).toMatchObject({offeringIds:['backup'],substitutedCourseId:'e'});
 const alt=o('alt','c',720);
 expect(repairFfcs(setup([a,backup,alt]),[a],'c',[],{}, {preferredFaculty:['backup']}, ['e']).offeringIds).toEqual(['alt']);
});
it('backup substitution keeps registered sections fixed and excludes rejected backups',()=>{
 const a=o('a','c',480), b=o('b','d',600), backup=o('backup','e',600), next=o('next','f',720);
 const data=setup([a,b,backup,next]);
 expect(repairFfcs(data,[a,b],'c',['d'],{}, {}, ['e','f']).offeringIds).toEqual(['next','b']);
 expect(repairFfcs(data,[a,b],'c',['d'],{f:['next']}, {}, ['e','f']).offeringIds).toBeUndefined();
});
