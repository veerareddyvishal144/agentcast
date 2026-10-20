import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, Ghost, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ClipBanner } from "@/components/clip-banner";
import { GateDialog } from "@/components/gate-dialog";
import { Outline } from "@/components/outline";
import { ReplayDock, type Range } from "@/components/replay-dock";
import { SessionHeader } from "@/components/session-header";
import { Timeline } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { clipUrl, useClip } from "@/hooks/use-clip";
import { useReplay } from "@/hooks/use-replay";
import { useSession } from "@/hooks/use-session";
import { downloadText, exportFilename, sessionJson, sessionMarkdown } from "@/lib/export";
import { dateTime } from "@/lib/format";
import type { StoredEvent } from "@/lib/types";

export function ViewerApp() {
  const id = useMemo(() => location.pathname.split("/")[2] ?? "", []);
  const s = useSession(id);
  const ended = !!s.meta?.endedAt || s.status === "expired";
  const { clip, setClip } = useClip();
  const [toolsOpen, setToolsOpen] = useState<boolean | null>(location.hash === "#tools" ? true : null);
  const [preview, setPreview] = useState<Range | null>(null);

  // Events in the current view: the whole session, or the clipped range.
  const baseEvents = useMemo(
    () => (clip ? s.events.filter((e) => e.seq >= clip.from && e.seq <= clip.to) : s.events),
    [s.events, clip],
  );
  const replay = useReplay(baseEvents, ended);
  useEffect(() => { replay.live(); }, [clip]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => (replay.cursorSeq === Infinity ? baseEvents : baseEvents.filter((e) => e.seq <= replay.cursorSeq)),
    [baseEvents, replay.cursorSeq],
  );
  // Tool results come from the whole session so a clip that ends on a tool call still shows its outcome.
  const results = useMemo(() => {
    const m = new Map<string, StoredEvent>();
    for (const e of s.events) {
      if (e.kind !== "tool_result") continue;
      if (replay.cursorSeq !== Infinity && e.seq > replay.cursorSeq) continue;
      m.set(String(e.data.tool_use_id), e);
    }
    return m;
  }, [s.events, replay.cursorSeq]);
  const allResults = useMemo(() => {
    const m = new Map<string, StoredEvent>();
    for (const e of s.events) if (e.kind === "tool_result") m.set(String(e.data.tool_use_id), e);
    return m;
  }, [s.events]);
  const toolSeqById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of s.events) if (e.kind === "tool_use") m.set(String(e.data.id), e.seq);
    return m;
  }, [s.events]);

  const { pending, jump } = useAutoScroll(s.events.length, replay.cursorSeq === Infinity && !ended && !clip);

  useEffect(() => {
    const prefix = s.status === "live" ? "● " : "";
    document.title = `${prefix}${clip ? "Clip · " : ""}${s.meta?.title ?? "session"} · agentcast`;
  }, [s.meta?.title, s.status, clip]);

  // Follow the cursor while scrubbing or playing.
  useEffect(() => {
    if (!replay.scrubbed && !replay.playing) return;
    const last = visible[visible.length - 1];
    if (!last) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const seq = last.kind === "tool_result" ? toolSeqById.get(String(last.data.tool_use_id)) ?? last.seq : last.seq;
    document.getElementById(`ev-${seq}`)?.scrollIntoView({ block: "end", behavior: replay.playing ? "auto" : "smooth" });
  }, [visible, replay.scrubbed, replay.playing, toolSeqById]);

  const hiddenAfter = replay.cursorSeq === Infinity ? Number.POSITIVE_INFINITY : replay.cursorSeq;

  const onCreateClip = useCallback(async (r: Range) => {
    const c = { from: r.fromSeq, to: r.toSeq };
    setClip(c);
    try { await navigator.clipboard.writeText(clipUrl(c)); toast.success("Clip link copied", { description: "Anyone opening it sees just this range." }); }
    catch { toast.message("Clip created", { description: "Copy the address bar to share it." }); }
  }, [setClip]);

  const onExport = useCallback(async (kind: "md" | "md-copy" | "json") => {
    if (!s.meta) return;
    const url = location.href.split("#")[0];
    if (kind === "json") { downloadText(exportFilename(s.meta, "json", !!clip), sessionJson(s.meta, baseEvents), "application/json"); toast.success("JSON downloaded"); return; }
    const md = sessionMarkdown(s.meta, baseEvents, allResults, url, !!clip);
    if (kind === "md") { downloadText(exportFilename(s.meta, "md", !!clip), md, "text/markdown"); toast.success("Markdown downloaded"); }
    else { try { await navigator.clipboard.writeText(md); toast.success("Markdown copied"); } catch { toast.error("Could not copy"); } }
  }, [s.meta, baseEvents, allResults, clip]);

  return (
    <TooltipProvider>
      <div className="min-h-dvh overflow-x-clip bg-background">
        <div className="bg-grid pointer-events-none fixed inset-x-0 top-0 h-[480px]" />
        <SessionHeader
          meta={s.meta} status={s.status} viewers={s.viewers} events={baseEvents} hiddenAfter={hiddenAfter}
          toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen((v) => (v === true ? false : true))}
          onExport={onExport} canExport={!!s.meta && baseEvents.length > 0}
        />

        <div className="relative mx-auto flex max-w-6xl gap-8 px-4 pt-6 pb-32">
          <main className="min-w-0 flex-1">
            {clip && <ClipBanner count={baseEvents.filter((e) => e.kind !== "tool_result").length} total={s.events.filter((e) => e.kind !== "tool_result").length} onClear={() => setClip(null)} />}
            {s.status === "gone" ? (
              <EmptyState />
            ) : s.events.length === 0 ? (
              <LoadingState locked={s.needsKey} />
            ) : baseEvents.length === 0 ? (
              <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">This clip range has no events. <button className="underline" onClick={() => setClip(null)}>Show the full session.</button></p>
            ) : (
              <Timeline events={visible} results={results} agent={s.meta?.agent ?? "Agent"} ended={ended} toolsOpen={toolsOpen} dimOutside={preview} />
            )}
            {s.meta && (
              <p className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> Thinking is never uploaded. Secrets are redacted on the sender's machine.</span>
                <span>Link expires {dateTime(s.meta.expiresAt)}.</span>
              </p>
            )}
          </main>
          <aside className="hidden w-64 shrink-0 lg:block">
            <div className="sticky top-24">
              <div className="mb-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Turns</div>
              <Outline events={baseEvents} hiddenAfter={hiddenAfter} />
            </div>
          </aside>
        </div>

        {pending && (
          <Button onClick={jump} size="sm" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full shadow-lg"><ArrowDown /> New events</Button>
        )}
        {ended && baseEvents.length > 0 && <ReplayDock replay={replay} events={baseEvents} ended={ended} onPreviewRange={setPreview} onCreateClip={onCreateClip} />}
        <GateDialog open={s.needsKey} error={s.gateError} onSubmit={s.submitKey} />
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

function LoadingState({ locked }: { locked: boolean }) {
  return (
    <div className="space-y-3" aria-busy>
      {locked ? null : <p className="px-1 text-xs text-muted-foreground">Waiting for the first event…</p>}
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-5/6 rounded-xl" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border bg-muted/50 text-muted-foreground"><Ghost className="size-6" /></div>
      <h2 className="text-lg font-semibold">This session is gone</h2>
      <p className="mt-2 text-sm text-muted-foreground">The link has expired or never existed. agentcast sessions delete themselves 24 hours after they start.</p>
      <Button asChild variant="outline" className="mt-6"><a href="/">Learn about agentcast</a></Button>
    </div>
  );
}
