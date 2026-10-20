import { useCallback, useEffect, useState } from "react";
import type { StoredEvent } from "@/lib/types";

/**
 * Replay cursor over an ordered event list. `idx` is how many events are visible.
 * When not scrubbing (cursor null) everything is visible and new events show as they arrive.
 */
export function useReplay(events: StoredEvent[], enabled: boolean) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  const total = events.length;
  const idx = cursor === null ? total : Math.min(cursor, total);
  const cursorSeq = cursor === null || idx >= total ? Infinity : idx === 0 ? 0 : events[idx - 1].seq;

  useEffect(() => {
    if (!enabled) { setCursor(null); setPlaying(false); }
  }, [enabled]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= total) { setPlaying(false); return; }
    const cur = idx > 0 ? events[idx - 1] : null;
    const next = events[idx];
    const dt = cur && next ? Math.max(0, Date.parse(next.ts) - Date.parse(cur.ts)) : 400;
    const delay = Math.min(Math.max(dt / speed, 150), 1500);
    const t = setTimeout(() => setCursor(idx + 1), delay);
    return () => clearTimeout(t);
  }, [playing, idx, total, events, speed]);

  const seek = useCallback((i: number) => { setPlaying(false); setCursor(Math.max(0, Math.min(i, total))); }, [total]);
  const step = useCallback((d: number) => { setPlaying(false); setCursor((c) => Math.max(0, Math.min((c ?? total) + d, total))); }, [total]);
  const play = useCallback(() => { setCursor((c) => (c === null || c >= total ? 0 : c)); setPlaying(true); }, [total]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const live = useCallback(() => { setPlaying(false); setCursor(null); }, []);

  return { idx, total, cursorSeq, playing, speed, setSpeed, seek, step, play, pause, toggle, live, scrubbed: cursor !== null && idx < total };
}
