import { useMemo, useRef, useState } from "react";
import { ExternalLink, PanelsTopLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { DocHeader } from "@/components/doc-header";
import { Outline } from "@/components/outline";
import { ReplayDock } from "@/components/replay-dock";
import { ThemeToggle } from "@/components/theme-toggle";
import { Transcript } from "@/components/transcript";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReplay } from "@/hooks/use-replay";
import { dateTime } from "@/lib/format";
import type { Meta, StoredEvent } from "@/lib/types";

type Payload = { exportedAt: string; url: string; meta: Meta; events: StoredEvent[] };

function readPayload(): Payload | null {
  const el = document.getElementById("agentcast-data");
  if (!el || !el.textContent || el.textContent.startsWith("__")) return null;
  try { return JSON.parse(el.textContent) as Payload; } catch { return null; }
}

/** Offline replay of one exported session. No network: the data is inlined in the file. */
export function StandaloneApp() {
  const data = useMemo(readPayload, []);
  if (!data) {
    return <div className="grid min-h-dvh place-items-center p-8 text-center text-sm text-muted-foreground">This file has no session data. Export a session from agentcast to create one.</div>;
  }
  return <Replay data={data} />;
}

function Replay({ data }: { data: Payload }) {
  const { meta, events, url, exportedAt } = data;
  const ended = true;
  const replay = useReplay(events, ended);
  const [toolsOpen, setToolsOpen] = useState<boolean | null>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => (replay.cursorSeq === Infinity ? events : events.filter((e) => e.seq <= replay.cursorSeq)), [events, replay.cursorSeq]);
  const results = useMemo(() => {
    const m = new Map<string, StoredEvent>();
    for (const e of events) {
      if (e.kind !== "tool_result") continue;
      if (replay.cursorSeq !== Infinity && e.seq > replay.cursorSeq) continue;
      m.set(String(e.data.tool_use_id), e);
    }
    return m;
  }, [events, replay.cursorSeq]);
  const hiddenAfter = replay.cursorSeq === Infinity ? Number.POSITIVE_INFINITY : replay.cursorSeq;

  return (
    <TooltipProvider>
      <div className="min-h-dvh overflow-x-clip bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-[1120px] items-center gap-4 px-5">
            <Brand />
            <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Exported {dateTime(exportedAt)} · works offline</div>
            <nav className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Toggle tool details" onClick={() => setToolsOpen((v) => (v === true ? false : true))}><PanelsTopLeft /></Button></TooltipTrigger>
                <TooltipContent>{toolsOpen ? "Collapse all tool calls" : "Expand all tool calls"}</TooltipContent>
              </Tooltip>
              {url && <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={url} target="_blank" rel="noopener"><ExternalLink /><span className="hidden sm:inline">Open online</span></a></Button>}
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <div className="mx-auto flex max-w-[1120px] gap-12 px-5 pt-10 pb-32">
          <main className="min-w-0 max-w-[760px] flex-1">
            <DocHeader ref={docRef} meta={meta} status={meta.endedAt ? "ended" : "live"} viewers={0} clipLabel="Exported copy" />
            <div className="pt-2">
              <Transcript events={visible} results={results} agent={meta.agent} ended={ended} toolsOpen={toolsOpen} />
            </div>
          </main>
          <aside className="hidden w-[220px] shrink-0 lg:block">
            <div className="sticky top-20"><Outline events={events} hiddenAfter={hiddenAfter} meta={meta} /></div>
          </aside>
        </div>
        {events.length > 0 && <ReplayDock replay={replay} events={events} ended={ended} onPreviewRange={() => {}} onCreateClip={() => {}} canClip={false} />}
      </div>
    </TooltipProvider>
  );
}
