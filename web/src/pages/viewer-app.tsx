import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Ghost } from "lucide-react";
import { toast } from "sonner";
import { AskPanel } from "@/components/ask-panel";
import { ClipBanner } from "@/components/clip-banner";
import { DocHeader } from "@/components/doc-header";
import { GateDialog } from "@/components/gate-dialog";
import { Outline } from "@/components/outline";
import { ReplayDock, type Range } from "@/components/replay-dock";
import { SessionHeader } from "@/components/session-header";
import { Transcript } from "@/components/transcript";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { clipUrl, useClip } from "@/hooks/use-clip";
import { useReplay } from "@/hooks/use-replay";
import { useSession } from "@/hooks/use-session";
import { downloadText, exportFilename, sessionJson, sessionMarkdown } from "@/lib/export";
import type { Answer, StoredEvent } from "@/lib/types";

export function ViewerApp() {
  const id = useMemo(() => location.pathname.split("/")[2] ?? "", []);
  const s = useSession(id);
  const ended = !!s.meta?.endedAt || s.status === "expired";
  const { clip, setClip } = useClip();
  const [toolsOpen, setToolsOpen] = useState<boolean | null>(location.hash === "#tools" ? true : null);
  const [preview, setPreview] = useState<Range | null>(null);
  const [askOpen, setAskOpen] = useState(() => new URLSearchParams(location.search).has("ask"));
  const [askInitial, setAskInitial] = useState<string | null>(() => new URLSearchParams(location.search).get("ask"));
  const canAsk = !!s.meta && s.meta.ai !== false && s.events.length > 0 && s.status !== "gone" && s.status !== "expired";
  const askLoading = !canAsk && s.status !== "gone" && s.status !== "expired" && (!s.meta || s.events.length === 0) && s.meta?.ai !== false;
  const openAsk = useCallback((q?: string) => { if (q) setAskInitial(q); setAskOpen(true); }, []);
  const ask = useCallback(async (q: string): Promise<Answer> => {
    const key = sessionStorage.getItem(`agentcast:key:${id}`);
    const res = await fetch(`/api/sessions/${id}/ask`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "x-agentcast-key": key } : {}) }, body: JSON.stringify({ question: q }) });
    const j = (await res.json().catch(() => null)) as (Answer & { error?: string }) | null;
    if (!res.ok || !j) throw new Error(j?.error ?? (res.status === 429 ? "Too many questions, try again in a minute." : "Could not get an answer."));
    return j;
  }, [id]);

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

  // Reveal the title in the sticky bar once the document header scrolls away.
  const docRef = useRef<HTMLDivElement>(null);
  const [showTitle, setShowTitle] = useState(false);
  useEffect(() => {
    const el = docRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowTitle(!e.isIntersecting), { rootMargin: "-48px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [s.status]);

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
  const countOf = (evs: StoredEvent[]) => evs.filter((e) => e.kind !== "tool_result").length;

  const onCreateClip = useCallback(async (r: Range) => {
    const c = { from: r.fromSeq, to: r.toSeq };
    setClip(c);
    try { await navigator.clipboard.writeText(clipUrl(c)); toast.success("Clip link copied", { description: "Anyone opening it sees just this range." }); }
    catch { toast.message("Clip created", { description: "Copy the address bar to share it." }); }
  }, [setClip]);

  const onExport = useCallback(async (kind: "md" | "md-copy" | "json" | "html") => {
    if (!s.meta) return;
    const url = location.href.split("#")[0];
    if (kind === "html") {
      const key = sessionStorage.getItem(`agentcast:key:${id}`);
      toast.message("Preparing standalone file…");
      const res = await fetch(`/api/sessions/${id}/export.html`, { headers: key ? { "x-agentcast-key": key } : {} });
      if (!res.ok) { toast.error("Could not export"); return; }
      downloadText(exportFilename(s.meta, "html", false), await res.text(), "text/html");
      toast.success("Standalone HTML downloaded", { description: "Opens offline, replay included." });
      return;
    }
    if (kind === "json") { downloadText(exportFilename(s.meta, "json", !!clip), sessionJson(s.meta, baseEvents), "application/json"); toast.success("JSON downloaded"); return; }
    const md = sessionMarkdown(s.meta, baseEvents, allResults, url, !!clip);
    if (kind === "md") { downloadText(exportFilename(s.meta, "md", !!clip), md, "text/markdown"); toast.success("Markdown downloaded"); }
    else { try { await navigator.clipboard.writeText(md); toast.success("Markdown copied"); } catch { toast.error("Could not copy"); } }
  }, [s.meta, baseEvents, allResults, clip, id]);

  return (
    <TooltipProvider>
      <div className="min-h-dvh overflow-x-clip bg-background">
        <SessionHeader
          meta={s.meta} events={baseEvents} hiddenAfter={hiddenAfter} showTitle={showTitle}
          toolsOpen={toolsOpen} onToggleTools={() => setToolsOpen((v) => (v === true ? false : true))}
          onExport={onExport} canExport={!!s.meta && baseEvents.length > 0}
          onAsk={() => openAsk()} canAsk={canAsk}
        />

        <div className="mx-auto flex max-w-[1120px] gap-12 px-5 pt-10 pb-32">
          <main className="min-w-0 max-w-[760px] flex-1">
            <DocHeader ref={docRef} meta={s.meta} status={s.status} viewers={s.viewers} clipLabel={clip ? `Clip · ${countOf(baseEvents)} of ${countOf(s.events)} events` : null} />
            <div className="pt-2">
              {clip && <div className="pt-4"><ClipBanner count={countOf(baseEvents)} total={countOf(s.events)} onClear={() => setClip(null)} /></div>}
              {s.status === "gone" || s.status === "expired" ? (
                <EmptyState reason={s.goneReason ?? "missing"} />
              ) : s.events.length === 0 ? (
                <LoadingState locked={s.needsKey} />
              ) : baseEvents.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">This clip range has no events. <button className="underline" onClick={() => setClip(null)}>Show the full session.</button></p>
              ) : (
                <Transcript events={visible} results={results} agent={s.meta?.agent ?? "Agent"} ended={ended} toolsOpen={toolsOpen} dimOutside={preview} />
              )}
            </div>
          </main>
          <aside className="hidden w-[220px] shrink-0 lg:block">
            <div className="sticky top-20"><Outline events={baseEvents} hiddenAfter={hiddenAfter} meta={s.meta} onAsk={(q) => openAsk(q)} canAsk={canAsk} askLoading={askLoading} /></div>
          </aside>
        </div>

        {pending && (
          <Button onClick={jump} size="sm" className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full shadow-lg"><ArrowDown /> New events</Button>
        )}
        {ended && baseEvents.length > 0 && <ReplayDock replay={replay} events={baseEvents} ended={ended} onPreviewRange={setPreview} onCreateClip={onCreateClip} />}
        <AskPanel open={askOpen} onOpenChange={setAskOpen} initialQuestion={askInitial} ask={ask} enabled={canAsk} loading={askLoading} />
        <GateDialog open={s.needsKey} error={s.gateError} onSubmit={s.submitKey} />
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

function LoadingState({ locked }: { locked: boolean }) {
  return (
    <div className="space-y-4 pt-6" aria-busy>
      {locked ? null : <p className="text-xs text-muted-foreground">Waiting for the first event…</p>}
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="mt-6 h-9 w-full rounded-lg" />
    </div>
  );
}

function EmptyState({ reason }: { reason: "expired" | "deleted" | "missing" }) {
  const text = reason === "deleted"
    ? "The owner deleted this session. Its events were removed from the server."
    : reason === "expired"
      ? "This session reached its expiry and deleted itself."
      : "The link has expired, was deleted, or never existed.";
  return (
    <div className="mt-10 max-w-md">
      <div className="mb-4 grid size-10 place-items-center rounded-lg border bg-card text-muted-foreground"><Ghost className="size-5" /></div>
      <h2 className="text-lg font-semibold">{reason === "deleted" ? "This session was deleted" : "This session is gone"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <Button asChild variant="outline" size="sm" className="mt-5"><a href="/">About agentcast</a></Button>
    </div>
  );
}
