import { useEffect, useRef, useState } from "react";

// Native page scrolling supplies the distance; sticky keeps the scene in view.
// No wheel cancellation, nested scroller, timer, or circular playback.
export default function useScrollSequence(count, onProgress) {
  const section = useRef(null);
  const panel = useRef(null);
  const callback = useRef(onProgress);
  const [active, setActive] = useState(0);
  callback.current = onProgress;

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const outer = section.current;
      const inner = panel.current;
      if (!outer || !inner) return;
      const distance = Math.max(1, outer.offsetHeight - inner.offsetHeight);
      const phase = Math.max(0, Math.min(count, -outer.getBoundingClientRect().top / distance * count));
      const index = Math.min(count - 1, Math.floor(phase));
      const transition = Math.max(0, Math.min(1, (phase - index - 0.52) / 0.48));
      setActive(previous => previous === index ? previous : index);
      callback.current?.(Math.min(count - 1, index + transition));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(section.current);
    observer.observe(panel.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [count]);

  const goTo = index => {
    const outer = section.current;
    const inner = panel.current;
    if (!outer || !inner) return;
    const next = Math.max(0, Math.min(count - 1, index));
    const distance = Math.max(1, outer.offsetHeight - inner.offsetHeight);
    window.scrollTo({
      top: window.scrollY + outer.getBoundingClientRect().top + distance * (next + 0.12) / count,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  return { section, panel, active, goTo };
}
