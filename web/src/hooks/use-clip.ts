import { useCallback, useEffect, useState } from "react";

export type Clip = { from: number; to: number } | null;

function parse(search: string): Clip {
  const p = new URLSearchParams(search);
  const from = Number(p.get("from"));
  const to = Number(p.get("to"));
  return Number.isInteger(from) && Number.isInteger(to) && from > 0 && to >= from ? { from, to } : null;
}

export function clipUrl(clip: Clip): string {
  const u = new URL(location.href);
  u.hash = "";
  if (clip) { u.searchParams.set("from", String(clip.from)); u.searchParams.set("to", String(clip.to)); }
  else { u.searchParams.delete("from"); u.searchParams.delete("to"); }
  return u.toString();
}

/** Clip range from the URL (?from=SEQ&to=SEQ), kept in sync with history. */
export function useClip() {
  const [clip, setClipState] = useState<Clip>(() => parse(location.search));
  const setClip = useCallback((c: Clip) => {
    history.replaceState(null, "", clipUrl(c));
    setClipState(c);
  }, []);
  useEffect(() => {
    const onPop = () => setClipState(parse(location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return { clip, setClip };
}
