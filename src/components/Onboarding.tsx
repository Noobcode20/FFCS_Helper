import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CursorClick, X } from '@phosphor-icons/react';
import { positionWalkthrough } from '../lib/walkthrough-layout';

export const tourSteps = [
  { title: 'Choose your branch', target: '#branch-filter', text: 'Start with the branch whose courses you want to browse.', task: 'Choose ECE from the branch menu.' },
  { title: 'Choose a category', target: '[aria-label="Curriculum category"]', text: 'Categories narrow the course list.', task: 'Choose Practice courses.' },
  { title: 'Choose a course', target: '[aria-label="Course"]', text: 'Choose a course to see its available faculty.', task: 'Choose Creative thinking.' },
  { title: 'Available faculty', target: '.course-detail', text: 'These are the teachers and sections available for the selected course. Each card shows its class details.', task: 'Select Next to explore the course actions.' },
  { title: 'Add to your shortlist', target: '.course-selection-actions .shortlist-course-button:first-child', text: 'Shortlist adds a course to your planned courses. Alternative saves a backup for replacements. The practice shortlist already contains several courses.', task: 'Select Shortlist to add Creative thinking.' },
  { title: 'Your shortlist', target: '#shortlist', text: 'Creative thinking now appears alongside your other shortlisted courses.', task: 'Select Next to continue.' },
  { title: 'Preview faculty', target: '.faculty-option[data-offering-id="demo-4-b"] .faculty-preview', text: 'Preview a teacher’s class times on the timetable.', task: 'Select Sample teacher B.' },
  { title: 'Your faculty preview', target: '.timetable', text: 'The highlighted classes show where this teacher’s section would appear on your calendar.', task: 'Select Next to add this section.' },
  { title: 'Select a section', target: '.faculty-option[data-offering-id="demo-4-b"] .faculty-action.calendar', text: 'Add the section you want to your timetable.', task: 'Select Add to calendar.' },
  { title: 'Pin a course', target: '.meeting:has(.meeting-pin)', text: 'A pinned section stays fixed when you generate around the timetable.', task: 'Select the pin on a class.' },
  { title: 'Generate around your timetable', target: '.calendar-generate-button', text: 'Generation keeps pinned classes and respects blocked times.', task: 'Select Generate around this calendar.' },
  { title: 'Your generated timetable', target: '.timetable', text: 'Review the timetable and generation feedback after the search.', task: 'Select Next to continue.' },
  { title: 'Add a time block', target: '.timetable', text: 'Time blocks reserve time you want to keep free.', task: 'Select + Time block, place it on the timetable, and save it.' },
  { title: 'Adjust your time blocks', target: '.timetable', text: 'Drag a block to move it, use its edges to resize it, or use its delete control to remove it. Select + Time block again to add more blocks.', task: 'Select Next to generate with your block.' },
  { title: 'Generate with your time block', target: '.calendar-generate-button', text: 'The saved block reserves this time when the planner searches for a schedule.', task: 'Select Generate around this calendar again.' },
  { title: 'See the result', target: '.timetable', text: 'Review the generated timetable and the feedback. Available schedules avoid the time block while keeping pinned classes fixed.', task: 'Select Next to continue.' },
  { title: 'Preferred teachers', target: '.preference-toggle', text: 'Teacher preferences guide timetable generation and replacements.', task: 'Select Teacher preferences.' },
  { title: 'Choose a course', target: '.preference-course-nav', text: 'Your shortlisted and timetable courses appear here. Select a course to see its teachers.', task: 'Select Next to see teacher controls.' },
  { title: 'Find a teacher', target: '.preference-filters', text: 'Search, filter by rating, or sort the teachers for the selected course.', task: 'Select Next to see how preferences work.' },
  { title: 'Set your preferences', target: '.preference-faculty-list', text: 'Select teachers you prefer; your choices are saved automatically and guide generation and replacements.', task: 'Select Next to return to the planner.' },
  { title: 'Add an alternative course', target: '.course-selection-actions .shortlist-course-button:nth-child(2)', text: 'Alternative courses can be used when a replacement section is unavailable.', task: 'Select Alternative to add Design thinking.' },
  { title: 'Go to FFCS mode', target: '.ffcs-toggle:not(.preference-toggle)', text: 'Use FFCS mode to track registrations and find replacements.', task: 'Turn on FFCS mode.' },
  { title: 'Your FFCS courses', target: '.ffcs-course-list', text: 'Each row shows a course, its faculty and slot for registration.', task: 'Select Next to see how to mark registration.' },
  { title: 'Mark a course registered', target: '.ffcs-check', text: 'After registering in VTOP, use the check to keep that course fixed.', task: 'Select Next to see replacements.' },
  { title: 'Find a replacement', target: '.ffcs-replace', text: 'Use the cross to reject an unavailable teacher and find a replacement. Registered courses remain fixed.', task: 'Select Next to finish.' },
  { title: 'FFCS mode is ready', target: '.ffcs-course-list', text: 'Your timetable courses appear here for registration tracking and replacements.', task: 'Select Finish tour to return to your planner.' },
];

type Layout = ReturnType<typeof positionWalkthrough>;
const focusable = 'button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Onboarding({ step, onStep, onFinish }: { step: number; onStep: (step: number) => void; onFinish: () => void }) {
  const card = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const current = tourSteps[step];

  useLayoutEffect(() => {
    let frame = 0;
    let scrollTimer = 0;
    const measure = () => {
      const target = document.querySelector(current.target);
      if (!card.current) return;
      if (!target?.getClientRects().length) {
        setLayout(positionWalkthrough({ left: 8, right: innerWidth - 8, top: 8, bottom: 8, width: innerWidth - 16, height: 0 }, { width: innerWidth, height: innerHeight }, { width: card.current.offsetWidth, height: card.current.offsetHeight }));
        return;
      }
      const bounds = target.getBoundingClientRect();
      setLayout(positionWalkthrough(bounds, { width: innerWidth, height: innerHeight }, { width: card.current.offsetWidth, height: card.current.offsetHeight }));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    // Wait for the practice planner to open the section for this step.
    scrollTimer = window.setTimeout(() => {
      const target = document.querySelector(current.target);
      if (target) {
        const rect = target.getBoundingClientRect();
        const safeBottom = layout?.side === 'bottom' ? Math.max(120, innerHeight - (card.current?.offsetHeight ?? 0) - 40) : innerHeight - 40;
        if (rect.top < 32 || rect.top > safeBottom - 48) {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollBy({ top: rect.top - Math.min(100, safeBottom / 3), behavior: reduceMotion ? 'instant' : 'smooth' });
        }
      }
      schedule();
    }, 120);
    const resize = new ResizeObserver(schedule);
    if (card.current) resize.observe(card.current);
    const app = document.querySelector('.app-shell');
    const changes = new MutationObserver(schedule);
    if (app) { changes.observe(app, { childList: true, subtree: true, attributes: true }); resize.observe(app); }
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    app?.addEventListener('animationend', schedule, true);
    measure();
    return () => {
      clearTimeout(scrollTimer); cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect();
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
      app?.removeEventListener('animationend', schedule, true);
    };
  }, [current]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); onFinish(); }
      if (event.key !== 'Tab') return;
      const target = document.querySelector(current.target);
      const controls = [
        ...(target?.matches(focusable) ? [target as HTMLElement] : []),
        ...Array.from(target?.querySelectorAll<HTMLElement>(focusable) ?? []),
        ...Array.from(card.current?.querySelectorAll<HTMLElement>(focusable) ?? []),
      ].filter(node => {
        if (!node.getClientRects().length) return false;
        if (card.current?.contains(node) || !layout) return true;
        const rect = node.getBoundingClientRect();
        const { hole } = layout;
        return rect.bottom > hole.top && rect.top < hole.top + hole.height && rect.right > hole.left && rect.left < hole.left + hole.width;
      });
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault(); controls[next].focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [current, onFinish, layout]);

  const hole = layout?.hole;
  return createPortal(<div className="walkthrough-layer">
    {hole ? <>
      <div className="walkthrough-shade" style={{ inset: `0 0 auto 0`, height: hole.top }} />
      <div className="walkthrough-shade" style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
      <div className="walkthrough-shade" style={{ left: hole.left + hole.width, right: 0, top: hole.top, height: hole.height }} />
      <div className="walkthrough-shade" style={{ left: 0, right: 0, top: hole.top + hole.height, bottom: 0 }} />
      <div className="walkthrough-spotlight" style={{ transform: `translate3d(${hole.left}px, ${hole.top}px, 0)`, width: hole.width, height: hole.height }} />
    </> : <div className="walkthrough-shade" style={{ inset: 0 }} />}
    <section ref={card} className="walkthrough" role="dialog" aria-label="Practice walkthrough" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-description" data-side={layout?.side ?? 'bottom'} style={{ transform: `translate3d(${layout?.left ?? 16}px, ${layout?.top ?? 16}px, 0)`, visibility: layout ? 'visible' : 'hidden' }}>
      <header className="walkthrough-header"><span className="walkthrough-badge">Practice walkthrough</span><button type="button" className="walkthrough-close" aria-label="Skip tour and clear demo" onClick={onFinish}><X size={18} /></button></header>
      <div className="walkthrough-copy" key={step}>
        <span className="walkthrough-count">STEP {String(step + 1).padStart(2, '0')} <span>/ {String(tourSteps.length).padStart(2, '0')}</span></span>
        <h2 id="walkthrough-title" ref={heading} tabIndex={-1}>{current.title}</h2>
        <p id="walkthrough-description">{current.text}{step === 0 && <span className="walkthrough-mobile-tip"> On your phone, scroll through the planner sections after the tour.</span>}</p>
        <div className="walkthrough-task"><CursorClick size={19} /><p>{current.task}</p></div>
      </div>
      <div className="walkthrough-progress" aria-label={`Step ${step + 1} of ${tourSteps.length}`}>{tourSteps.map((_, index) => <span key={index} className={index <= step ? 'complete' : ''} />)}</div>
      <footer className="walkthrough-controls"><button type="button" className="walkthrough-skip" onClick={onFinish}>Skip tour</button><div><button type="button" className="secondary" aria-label="Previous step" disabled={step === 0} onClick={() => window.dispatchEvent(new Event('walkthrough-back'))}><ArrowLeft size={17} /></button><button type="button" onClick={() => step === tourSteps.length - 1 ? onFinish() : window.dispatchEvent(new Event('walkthrough-next'))}>{step === tourSteps.length - 1 ? 'Finish tour' : 'Next'}{step === tourSteps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></footer>
    </section>
  </div>, document.body);
}
