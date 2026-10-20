import { useEffect, useState } from "react";
import { Pause, Play, Radio, Scissors, SkipBack, SkipForward, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { useReplay } from "@/hooks/use-replay";
import { time } from "@/lib/format";
import type { StoredEvent } from "@/lib/types";

type Replay = ReturnType<typeof useReplay>;
export type Range = { fromSeq: number; toSeq: number };

type Props = {
  replay: Replay;
  events: StoredEvent[];
  ended: boolean;
  onPreviewRange: (r: Range | null) => void;
  onCreateClip: (r: Range) => void;
};

export function ReplayDock({ replay, events, ended, onPreviewRange, onCreateClip }: Props) {
  const { idx, total, playing, speed, setSpeed, seek, step, toggle, live, scrubbed } = replay;
  const current = idx > 0 ? events[idx - 1] : null;
  const [clipping, setClipping] = useState(false);
  const [range, setRange] = useState<[number, number]>([0, Math.max(total - 1, 0)]);

  useEffect(() => {
    if (!clipping) { onPreviewRange(null); return; }
    const a = events[range[0]], b = events[range[1]];
    if (a && b) onPreviewRange({ fromSeq: a.seq, toSeq: b.seq });
  }, [clipping, range, events, onPreviewRange]);

  const startClip = () => { replay.pause(); replay.live(); setRange([0, Math.max(total - 1, 0)]); setClipping(true); };
  const cancelClip = () => setClipping(false);
  const createClip = () => {
    const a = events[range[0]], b = events[range[1]];
    if (a && b) onCreateClip({ fromSeq: a.seq, toSeq: b.seq });
    setClipping(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.isContentEditable)) return;
      if (clipping) { if (e.key === "Escape") cancelClip(); if (e.key === "Enter") createClip(); return; }
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Home") seek(0);
      else if (e.key === "End") seek(total);
      else if (e.key.toLowerCase() === "c" && total > 1) startClip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
      <div className="glass flex w-full max-w-3xl items-center gap-2 rounded-2xl border px-3 py-2 shadow-xl shadow-black/20">
        {clipping ? (
          <>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand"><Scissors className="size-4" /></span>
            <Slider className="mx-2 flex-1" value={range} min={0} max={Math.max(total - 1, 0)} step={1} minStepsBetweenThumbs={0} onValueChange={(v) => setRange([v[0] ?? 0, v[1] ?? v[0] ?? 0])} aria-label="Clip range" />
            <div className="hidden min-w-[150px] text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
              {range[0] + 1}–{range[1] + 1} <span className="opacity-70">· {range[1] - range[0] + 1} events</span>
            </div>
            <Button size="sm" onClick={createClip} className="gap-1.5"><Copy /> Copy clip link</Button>
            <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={cancelClip} aria-label="Cancel clip"><X /></Button></TooltipTrigger><TooltipContent>Cancel <Kbd>Esc</Kbd></TooltipContent></Tooltip>
          </>
        ) : (
          <>
            <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label="Previous event"><SkipBack /></Button></TooltipTrigger><TooltipContent>Previous <Kbd>←</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button></TooltipTrigger><TooltipContent>{playing ? "Pause" : "Play"} <Kbd>Space</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label="Next event"><SkipForward /></Button></TooltipTrigger><TooltipContent>Next <Kbd>→</Kbd></TooltipContent></Tooltip>
            <Slider className="mx-2 flex-1" value={[idx]} min={0} max={Math.max(total, 1)} step={1} onValueChange={(v) => seek(v[0] ?? 0)} aria-label="Timeline" />
            <div className="hidden min-w-[132px] text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:block">
              {idx} / {total}{current ? <span className="opacity-70"> · {time(current.ts)}</span> : null}
            </div>
            <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
              <SelectTrigger size="sm" className="w-[72px] font-mono" aria-label="Speed"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 4, 8].map((s) => <SelectItem key={s} value={String(s)} className="font-mono">{s}×</SelectItem>)}</SelectContent>
            </Select>
            {(scrubbed || !ended) && (
              <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={live} aria-label="Show everything"><Radio className="text-live" /></Button></TooltipTrigger><TooltipContent>Show everything <KbdGroup><Kbd>End</Kbd></KbdGroup></TooltipContent></Tooltip>
            )}
            {total > 1 && (
              <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={startClip} aria-label="Create a clip"><Scissors /></Button></TooltipTrigger><TooltipContent>Create a clip <Kbd>C</Kbd></TooltipContent></Tooltip>
            )}
          </>
        )}
      </div>
    </div>
  );
}
