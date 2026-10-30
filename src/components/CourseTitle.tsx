import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Reveal long titles within the existing course-code footprint. */
export function CourseTitle({ title }: { title: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (viewport.current && text.current) {
        setOverflow(Math.max(0, text.current.scrollWidth - viewport.current.clientWidth + 16));
      }
    };
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (text.current) observer.observe(text.current);
    measure();
    return () => observer.disconnect();
  }, [title]);

  return <span ref={viewport} className={`course-title-viewport${overflow > 0 ? " is-overflowing" : ""}`} title={title} style={{
    "--title-travel": `${-overflow}px`,
    "--title-duration": `${Math.max(4, overflow / 28 + 2.4)}s`,
  } as CSSProperties}><i ref={text} className="course-title-text">{title}</i></span>;
}
