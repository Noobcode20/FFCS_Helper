import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {FacultyReviews} from './FacultyReviews';
import {fixture} from '../lib/test-fixture';
it('shows missing ratings as unavailable rather than a zero score',()=>{
 const html=renderToStaticMarkup(<FacultyReviews catalog={fixture()} facultyId="f" courseId="c"/>);
 expect(html).toContain('No review data');expect(html).toContain('No numeric rating available');expect(html).not.toContain('0/5');
});
it('separates course and overall sources and never invents an aggregate distribution',()=>{
 const c=fixture();c.reviews=[{id:'aggregate',facultyId:'f',courseId:'c',rating:4.3,date:'2026-01-01',source:'Synthetic test aggregate only',sourceUrl:'https://example.org/fixture',sampleSize:20,teaching:4},{id:'individual',facultyId:'f',rating:2,date:'2026-02-01',source:'Synthetic test individual only',sampleSize:1,text:'Test fixture content'}];
 const html=renderToStaticMarkup(<FacultyReviews catalog={c} facultyId="f" courseId="c"/>);
 expect(html).toContain('course-specific');expect(html).toContain('Overall faculty context');expect(html).toContain('20');expect(html).toContain('2026-01-01');expect(html).toContain('Rating distribution unavailable: the source provides averages or written feedback, not individual vote data.');expect(html).toContain('no combined average');
});
