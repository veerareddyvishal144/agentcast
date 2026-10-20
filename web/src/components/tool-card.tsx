import { memo, useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, CircleCheck, CircleX } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isRecord, shortPath, str, toolIcon, toolSummary } from "@/lib/tools";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoredEvent } from "@/lib/types";

type Props = {
  ev: StoredEvent;
  result: StoredEvent | null;      // visible result, or null if pending/hidden
  ended: boolean;                  // session over: a missing result is "not recorded"
  forceOpen: boolean | null;       // header toggle: true/false override, null = user controlled
  compact?: boolean;
};

export const ToolCard = memo(function ToolCard({ ev, result, ended, forceOpen, compact }: Props) {
  const name = String(ev.data.name ?? "tool");
  const input = ev.data.input;
  const Icon = toolIcon(name);
  const [open, setOpen] = useState(forceOpen ?? false);
  useEffect(() => { if (forceOpen !== null) setOpen(forceOpen); }, [forceOpen]);

  const state: "pending" | "ok" | "error" | "none" = result ? (result.data.is_error ? "error" : "ok") : ended ? "none" : "pending";
  const summary = toolSummary(name, input);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("animate-rise group rounded-xl border bg-surface-2/60 transition-colors hover:bg-surface-2", open && "bg-surface-2")}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border bg-background/60", state === "error" && "border-bad/40", state === "ok" && "border-live/30")}>
          <Icon className="size-3.5" />
        </span>
        <span className="font-mono text-[13px] font-semibold">{name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{name === "Edit" || name === "Read" || name === "Write" ? shortPath(summary) : summary}</span>
        <StateIcon state={state} />
        {!compact && <time className="hidden font-mono text-[11px] text-muted-foreground tabular-nums sm:block">{time(ev.ts)}</time>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-3 pt-3 pb-3">
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

function StateIcon({ state }: { state: "pending" | "ok" | "error" | "none" }) {
  if (state === "pending") return <LoaderCircle className="size-3.5 animate-spin text-warn" />;
  if (state === "ok") return <CircleCheck className="size-3.5 text-live" />;
  if (state === "error") return <CircleX className="size-3.5 text-bad" />;
  return <span className="size-3.5 rounded-full border border-dashed border-muted-foreground/50" />;
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
  return <pre className={cn("max-h-[420px] overflow-auto rounded-lg border bg-background/70 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap", className)}>{children}</pre>;
}

function InputView({ name, input }: { name: string; input: unknown }) {
  if (!isRecord(input)) return <Pre>{str(input)}</Pre>;
  if (name === "Bash" && typeof input.command === "string") {
    return <Pre><span className="text-muted-foreground select-none">$ </span>{input.command}</Pre>;
  }
  if (name === "Edit" && (input.old_string != null || input.new_string != null)) {
    return (
      <Pre>
        <div className="mb-1 text-muted-foreground">{String(input.file_path ?? "")}</div>
        {lines(str(input.old_string), "-").map((l, i) => <div key={`d${i}`} className="bg-bad/10 text-bad">{l}</div>)}
        {lines(str(input.new_string), "+").map((l, i) => <div key={`a${i}`} className="bg-live/10 text-live">{l}</div>)}
      </Pre>
    );
  }
  if (name === "Write" && input.content != null) {
    return <Pre><div className="mb-1 text-muted-foreground">{String(input.file_path ?? "")}</div>{str(input.content)}</Pre>;
  }
  return <Pre>{str(input)}</Pre>;
}

function lines(s: string, prefix: string): string[] {
  return s.split("\n").map((l) => `${prefix} ${l}`);
}
