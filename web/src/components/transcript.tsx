import { memo, useEffect, useMemo, useState } from "react";
import { ChevronRight, CircleX, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Markdown } from "@/components/markdown";
import { clock, ms } from "@/lib/format";
import { isRecord, shortPath, str, toolIcon, toolSummary } from "@/lib/tools";
import { buildTurns, chunkItems, type ToolItem, type Turn } from "@/lib/turns";
import { cn } from "@/lib/utils";
import type { StoredEvent } from "@/lib/types";

export type Dim = { fromSeq: number; toSeq: number } | null;

type Props = {
  events: StoredEvent[];               // already filtered to what should be visible
  results: Map<string, StoredEvent>;   // visible tool results by tool_use id
  agent: string;
  ended: boolean;
  toolsOpen: boolean | null;           // header toggle: true/false override, null = per-row
  compact?: boolean;
  dimOutside?: Dim;
};

export const Transcript = memo(function Transcript({ events, results, agent, ended, toolsOpen, compact, dimOutside }: Props) {
  const { turns, start, end } = useMemo(() => buildTurns(events, results), [events, results]);
  return (
    <div className={cn("divide-y divide-border/70", compact ? "text-[13px]" : "text-[15px]")}>
      {start && (
        <SystemLine ev={start} text={`Started ${clock(start.ts)}${start.data.project ? ` in ${String(start.data.project)}` : ""}`}>
          {typeof start.data.continues === "string" && (
            <> · continues <a className="underline underline-offset-2 hover:text-foreground" href={`/s/${encodeURIComponent(String(start.data.continues))}`}>an earlier session</a></>
          )}
        </SystemLine>
      )}
      {turns.map((t) => <TurnView key={t.key} turn={t} agent={agent} ended={ended} toolsOpen={toolsOpen} compact={compact} dim={dimOutside ?? null} />)}
      {end && <SystemLine ev={end} text={`Ended ${clock(end.ts)}`} />}
    </div>
  );
});

function isDim(seq: number, dim: Dim) {
  return !!dim && (seq < dim.fromSeq || seq > dim.toSeq);
}

function TurnView({ turn, agent, ended, toolsOpen, compact, dim }: { turn: Turn; agent: string; ended: boolean; toolsOpen: boolean | null; compact?: boolean; dim: Dim }) {
  const chunks = chunkItems(turn.items);
  const firstTs = turn.items[0]?.ev.ts;
  return (
    <section className={cn(compact ? "py-3" : "py-6", "space-y-5")}>
      {turn.user && (
        <Block id={`ev-${turn.user.seq}`} who="You" ts={turn.user.ts} glyph={<UserGlyph />} dim={isDim(turn.user.seq, dim)} compact={compact}>
          <Markdown text={String(turn.user.data.text ?? "")} className="font-medium text-foreground" />
        </Block>
      )}
      {chunks.length > 0 && (
        <Block who={agent} ts={firstTs} glyph={<AgentGlyph />} compact={compact}>
          <div className="space-y-3">
            {chunks.map((c, i) =>
              c.kind === "text" ? (
                <div key={c.ev.seq} id={`ev-${c.ev.seq}`} className={cn("scroll-mt-28 transition-opacity", isDim(c.ev.seq, dim) && "opacity-30")}>
                  <Markdown text={String(c.ev.data.text ?? "")} />
                </div>
              ) : c.kind === "notice" ? (
                <p key={c.ev.seq} id={`ev-${c.ev.seq}`} className="text-xs text-muted-foreground italic">{String(c.ev.data.text ?? "")}</p>
              ) : (
                <ToolGroup key={`g${i}`} tools={c.tools} ended={ended} toolsOpen={toolsOpen} compact={compact} dim={dim} />
              ),
            )}
          </div>
        </Block>
      )}
    </section>
  );
}

function Block({ id, who, ts, glyph, children, dim, compact }: { id?: string; who: string; ts?: string; glyph: React.ReactNode; children: React.ReactNode; dim?: boolean; compact?: boolean }) {
  return (
    <div id={id} className={cn("grid scroll-mt-28 gap-x-3 transition-opacity", compact ? "grid-cols-[24px_1fr]" : "grid-cols-[28px_1fr]", dim && "opacity-30")}>
      <div className="pt-0.5">{glyph}</div>
      <div className="min-w-0">
        <div className="mb-1 flex items-baseline gap-2 text-xs">
          <span className="font-semibold text-foreground">{who}</span>
          {ts && <time className="text-muted-foreground tabular-nums" title={new Date(ts).toLocaleString()}>{clock(ts)}</time>}
        </div>
        {children}
      </div>
    </div>
  );
}

function UserGlyph() {
  return <span className="grid size-6 place-items-center rounded-md bg-foreground text-background"><UserRound className="size-3.5" /></span>;
}
function AgentGlyph() {
  return <span className="grid size-6 place-items-center rounded-md border bg-card text-brand"><Sparkles className="size-3.5" /></span>;
}

function SystemLine({ ev, text, children }: { ev: StoredEvent; text: string; children?: React.ReactNode }) {
  return <p className="py-2 text-xs text-muted-foreground" title={new Date(ev.ts).toLocaleString()}>{text}{children}</p>;
}

// ---------- tools ----------

function ToolGroup({ tools, ended, toolsOpen, compact, dim }: { tools: ToolItem[]; ended: boolean; toolsOpen: boolean | null; compact?: boolean; dim: Dim }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-surface/70 divide-y divide-border/70">
      {tools.map((t) => <ToolRow key={t.ev.seq} item={t} ended={ended} forceOpen={toolsOpen} compact={compact} dim={isDim(t.ev.seq, dim)} />)}
    </div>
  );
}

const ToolRow = memo(function ToolRow({ item, ended, forceOpen, compact, dim }: { item: ToolItem; ended: boolean; forceOpen: boolean | null; compact?: boolean; dim: boolean }) {
  const { ev, result, durationMs } = item;
  const name = String(ev.data.name ?? "tool");
  const input = ev.data.input;
  const Icon = toolIcon(name);
  const [open, setOpen] = useState(forceOpen ?? false);
  useEffect(() => { if (forceOpen !== null) setOpen(forceOpen); }, [forceOpen]);
  const summary = toolSummary(name, input);
  const shown = ["Edit", "Read", "Write", "MultiEdit"].includes(name) ? shortPath(summary) : summary;
  const state: "pending" | "ok" | "error" | "none" = result ? (result.data.is_error ? "error" : "ok") : ended ? "none" : "pending";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("group transition-opacity", dim && "opacity-30")}>
      <CollapsibleTrigger id={`ev-${ev.seq}`} className={cn("flex w-full scroll-mt-28 items-center gap-2.5 text-left outline-none hover:bg-muted/40 focus-visible:bg-muted/40", compact ? "px-2.5 py-1.5" : "px-3 py-2")}>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono text-[12.5px] font-medium">{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted-foreground">{shown}</span>
        <Status state={state} />
        <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{ms(durationMs)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t bg-background/50 px-3 py-3">
        <Section label="Input"><InputView name={name} input={input} /></Section>
        <Section label="Result">
          {result ? (
            <Pre className={cn(Boolean(result.data.is_error) && "border-bad/40 text-bad/90")}>{str(result.data.content) || "(empty)"}</Pre>
          ) : (
            <p className="text-xs text-muted-foreground">{state === "none" ? "No result recorded." : "Running…"}</p>
          )}
        </Section>
      </CollapsibleContent>
    </Collapsible>
  );
});

function Status({ state }: { state: "pending" | "ok" | "error" | "none" }) {
  if (state === "pending") return <LoaderCircle className="size-3.5 shrink-0 animate-spin text-warn" />;
  if (state === "error") return <CircleX className="size-3.5 shrink-0 text-bad" />;
  if (state === "ok") return <span className="size-1.5 shrink-0 rounded-full bg-live" />;
  return <span className="size-1.5 shrink-0 rounded-full border border-dashed border-muted-foreground/60" />;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  );
}

function Pre({ children, className }: { children: React.ReactNode; className?: string }) {
  return <pre className={cn("max-h-[420px] overflow-auto rounded-md border bg-background p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap", className)}>{children}</pre>;
}

function InputView({ name, input }: { name: string; input: unknown }) {
  if (!isRecord(input)) return <Pre>{str(input)}</Pre>;
  if (name === "Bash" && typeof input.command === "string") return <Pre><span className="text-muted-foreground select-none">$ </span>{input.command}</Pre>;
  if (name === "Edit" && (input.old_string != null || input.new_string != null)) {
    return (
      <Pre>
        <div className="mb-1 text-muted-foreground">{String(input.file_path ?? "")}</div>
        {str(input.old_string).split("\n").map((l, i) => <div key={`d${i}`} className="bg-bad/10 text-bad">- {l}</div>)}
        {str(input.new_string).split("\n").map((l, i) => <div key={`a${i}`} className="bg-live/10 text-live">+ {l}</div>)}
      </Pre>
    );
  }
  if (name === "Write" && input.content != null) return <Pre><div className="mb-1 text-muted-foreground">{String(input.file_path ?? "")}</div>{str(input.content)}</Pre>;
  return <Pre>{str(input)}</Pre>;
}
