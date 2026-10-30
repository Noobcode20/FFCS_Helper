import type { Catalog, Review } from '../lib/types';
import { preferredRating } from '../lib/reviews';
export function FacultyRatingBadge({catalog,facultyId,courseId}:{catalog:Catalog;facultyId:string;courseId?:string}) {
 const score=preferredRating(catalog,facultyId,courseId);
 const records=catalog.reviews.filter(r=>r.facultyId===facultyId);
 return <span className="tag faculty-rating" title={score?'Reported rating; feedback is not independently verified':'No numeric rating available'}>{score?`${score.rating!.toFixed(2)}/5 · ${score.sampleSize===null?'sample size unknown':`${score.sampleSize} reported review${score.sampleSize===1?'':'s'}`}`:records.length?'Written feedback · no numeric rating':'No review data'}</span>;
}
export function FacultyReviews({catalog,facultyId,courseId}:{catalog:Catalog;facultyId:string;courseId?:string}) {
 const faculty=catalog.faculty.find(f=>f.id===facultyId);
 const reviews=catalog.reviews.filter(r=>r.facultyId===facultyId&&(!courseId||!r.courseId||r.courseId===courseId));
 const groups=new Map<string,Review[]>();
 for(const r of reviews){const key=JSON.stringify([r.courseId||null,r.context||null]);groups.set(key,[...(groups.get(key)||[]),r]);}
 return <div className="faculty-review">
  <div className="row spread"><strong>{faculty?.name||'Faculty not recorded'}</strong><FacultyRatingBadge catalog={catalog} facultyId={facultyId} courseId={courseId}/></div>
  {faculty?.department&&<small>{faculty.department}</small>}
  {faculty?.reviewOnly&&<p className="muted small">Review-only name. No verified catalog offering or campus link; similar names are kept separate.</p>}
  {reviews.some(r=>r.verification==='user-supplied')&&<p className="review-trust">Student feedback is unverified and may overlap. Scores from different reports are not combined.</p>}
  {reviews.length>1&&<p className="muted small">Review sources are shown separately; no combined average is calculated.</p>}
  {courseId&&!reviews.some(r=>r.courseId===courseId)&&<p className="muted small">No explicitly linked course-specific rating for this course. Overall feedback and document context are shown separately.</p>}
  {!reviews.length&&<p className="muted">No feedback is available.</p>}
  {[...groups.entries()].map(([key,records])=>{
   const first=records[0];const individual=records.filter(r=>r.kind==='individual'&&r.sampleSize===1&&r.rating!==null);
   const context=first.courseId?`${catalog.courses.find(c=>c.id===first.courseId)?.code||first.courseId} · course-specific`:'Overall faculty context';
   return <section className="review-group" key={key}>
    <h4>{context}</h4>{first.context&&<p className="small">Document context: {first.context}</p>}
    {records.map(r=><article className="review" key={r.id}>
     <div className="row spread"><strong>{r.rating===null?'Written student feedback':`${r.rating}/5${r.kind==='aggregate'||(r.sampleSize!==null&&r.sampleSize>1)?' reported average':''}`}</strong><small>{r.date||'Review date unknown'} · {r.sampleSize===null?'Sample size unknown':`${r.sampleSize} reported ${r.sampleSize===1?'review':'reviews'}`}</small></div>
     {r.sampleSize!==null&&r.sampleSize<5&&<p className="muted small">Small sample; consider the source context before comparing.</p>}
     {r.text&&<><small>Student feedback</small><p className="review-text">{r.text}</p></>}
     <div className="metric-list">{(['teaching','workload','grading','attendance'] as const).map(k=>r[k]!==undefined?<span key={k}>{k}: {r[k]}/5</span>:null)}</div>
    </article>)}
    {individual.length>0?<details><summary>Distribution of {individual.length} individual records only</summary>{[5,4,3,2,1,0].map(n=><div className="distribution" key={n}><span>{n}/5</span><meter min={0} max={individual.length} value={individual.filter(r=>r.rating===n).length}/><span>{individual.filter(r=>r.rating===n).length}</span></div>)}<p className="small muted">Only explicitly individual records are counted. Source averages and written-only records are excluded.</p></details>:<p className="muted small">Rating distribution unavailable: the source provides averages or written feedback, not individual vote data.</p>}
   </section>;
  })}
 </div>;
}
