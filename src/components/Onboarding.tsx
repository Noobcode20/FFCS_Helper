import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CursorClick, X } from '@phosphor-icons/react';
import { positionWalkthrough } from '../lib/walkthrough-layout';

export const tourSteps = [
  { title: 'A little practice first', target: '.timetable', text: 'This is your sample timetable. Try things out here before building your own.', task: 'All sample data disappears when you finish or skip.' },
  { title: 'Start with your shortlist', target: '#shortlist', text: 'Add the courses you want to study. The generator finds a section for each one.', task: 'Tap a course to see its teachers, or × to remove it.' },
  { title: 'Choose your teachers', target: '.preference-faculty-list', text: 'Pick one or more teachers you prefer. Leave everyone unselected if you have no preference.', task: 'Try selecting a sample teacher.' },
  { title: 'Have a backup ready', target: '.alternative-courses', text: 'Alternative courses are your backups. FFCS mode can use one if no replacement section is available.', task: 'Creative thinking is your sample backup course.' },
  { title: 'Choose a section', target: '.faculty-option[data-offering-id="demo-1-b"]', text: 'Tap a teacher to preview their class times. Choose Add to calendar to use that section.', task: 'Try Add to calendar. Clashing sections are checked for you.' },
  { title: 'Make time for yourself', target: '.timetable', text: 'Use + Time block to keep time free. Apply it to this timetable or all timetables.', task: 'Add a block, then drag or resize it on the calendar.' },
  { title: 'Keep a class you like', target: '.meeting:has(.meeting-pin)', text: 'Tap the pin to keep this exact section and its related classes when generating around your calendar.', task: 'Try the pin in the corner of this class.' },
  { title: 'Build around this calendar', target: '.calendar-generate-button', text: 'Find another schedule while keeping pinned classes and blocked times. Unpinned sections can change.', task: 'Try Generate around this calendar.' },
  { title: 'Or start fresh', target: '.scheduler-panel', text: 'Keep Use current calendar state off, then Generate alternatives. This ignores calendar pins and time blocks.', task: 'Choose your ranking preferences, then generate a new timetable.' },
  { title: 'Ready for FFCS day', target: '.ffcs-course-list', text: 'After registering in VTOP, check the course to keep it fixed. Use × to reject a teacher and find a replacement.', task: 'Try it here. Finish clears the demo; registration itself happens in VTOP.' },
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
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        const rect = target.getBoundingClientRect();
        window.scrollBy({ top: rect.top - 36, behavior: 'instant' });
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
        <p id="walkthrough-description">{current.text}{step === 0 && <span className="walkthrough-mobile-tip"> On your phone, use Find courses, Timetable, and Shortlist to switch between planner sections after the tour.</span>}</p>
        <div className="walkthrough-task"><CursorClick size={19} /><p>{current.task}</p></div>
      </div>
      <div className="walkthrough-progress" aria-label={`Step ${step + 1} of ${tourSteps.length}`}>{tourSteps.map((_, index) => <span key={index} className={index <= step ? 'complete' : ''} />)}</div>
      <footer className="walkthrough-controls"><button type="button" className="walkthrough-skip" onClick={onFinish}>Skip tour</button><div><button type="button" className="secondary" aria-label="Previous step" disabled={step === 0} onClick={() => onStep(step - 1)}><ArrowLeft size={17} /></button><button type="button" onClick={() => step === tourSteps.length - 1 ? onFinish() : onStep(step + 1)}>{step === tourSteps.length - 1 ? 'Finish tour' : 'Next'}{step === tourSteps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></footer>
    </section>
  </div>, document.body);
}
