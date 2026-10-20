import { MessageSquareText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoredEvent } from "@/lib/types";

export function Outline({ events, hiddenAfter, onJump, className }: { events: StoredEvent[]; hiddenAfter: number; onJump?: () => void; className?: string }) {
  const turns = events.filter((e) => e.kind === "user");
  if (turns.length === 0) return <p className={cn("text-xs text-muted-foreground", className)}>Turns will appear here as prompts arrive.</p>;
  return (
    <ScrollArea className={cn("max-h-[calc(100dvh-10rem)]", className)}>
      <ol className="space-y-1 pr-3">
        {turns.map((t, i) => {
          const hidden = t.seq > hiddenAfter;
          return (
            <li key={t.seq}>
              <a
                href={`#ev-${t.seq}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(`ev-${t.seq}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); onJump?.(); }}
                className={cn("group flex gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted/60", hidden && "opacity-40")}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border bg-background font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-foreground/90">{String(t.data.text ?? "").replace(/\s+/g, " ")}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground tabular-nums">{time(t.ts)}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground"><MessageSquareText className="size-3" /> {turns.length} {turns.length === 1 ? "turn" : "turns"}</div>
    </ScrollArea>
  );
}
