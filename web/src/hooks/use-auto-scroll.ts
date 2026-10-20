import { useEffect, useRef, useState } from "react";

/** Keeps the page pinned to the bottom while the reader is already there; otherwise offers a jump button. */
export function useAutoScroll(count: number, active: boolean) {
  const atBottom = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      atBottom.current = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 120;
      if (atBottom.current) setPending(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!active || count === 0) return;
    if (atBottom.current) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
    else setPending(true);
  }, [count, active]);

  const jump = () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); setPending(false); };
  return { pending, jump };
}
