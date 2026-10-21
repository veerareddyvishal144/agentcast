import { useState } from "react";
import { ArrowUp, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clock, dateTime, duration } from "@/lib/format";
import { sessionStats } from "@/lib/turns";
import { cn } from "@/lib/utils";
import type { Meta, StoredEvent } from "@/lib/types";

type Props = { events: StoredEvent[]; hiddenAfter: number; meta: Meta | null; onJump?: () => void; className?: string; onAsk?: (q: string) => void; canAsk?: boolean; askLoading?: boolean };

/** Sidebar: turn outline, a few numbers, and the fine print. */
export function Outline({ events, hiddenAfter, meta, onJump, className, onAsk, canAsk, askLoading }: Props) {
  const turns = events.filter((e) => e.kind === "user");
  const stats = sessionStats(events);
  const [q, setQ] = useState("");
  return (
    <div className={cn("space-y-7 text-sm", className)}>
      {onAsk && (
        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (q.trim() && canAsk) { onAsk(q.trim()); setQ(""); } }}>
          <div className="relative flex-1">
            <MessageCircleQuestion className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={canAsk ? "Ask this session…" : askLoading ? "Loading…" : "AI is off for this session"} disabled={!canAsk} className="h-8 pl-8 text-[13px]" maxLength={500} />
          </div>
          <Button type="submit" size="icon-sm" variant="outline" disabled={!canAsk || !q.trim()} aria-label="Ask"><ArrowUp /></Button>
        </form>
      )}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Outline</h2>
        {turns.length === 0 ? (
          <p className="text-xs text-muted-foreground">Turns appear here as prompts arrive.</p>
        ) : (
          <ol className="max-h-[50dvh] space-y-0.5 overflow-y-auto pr-1">
            {turns.map((t, i) => (
              <li key={t.seq}>
                <a
                  href={`#ev-${t.seq}`}
                  onClick={(e) => { e.preventDefault(); document.getElementById(`ev-${t.seq}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); onJump?.(); }}
                  className={cn("group flex gap-2 rounded-md py-1 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground", t.seq > hiddenAfter && "opacity-40")}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{String(t.data.text ?? "").replace(/\s+/g, " ")}</span>
                  <time className="shrink-0 font-mono text-[11px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{clock(t.ts)}</time>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

      {meta && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">Session</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Turns</dt><dd className="tabular-nums">{stats.turns}</dd>
            <dt className="text-muted-foreground">Tool calls</dt><dd className="tabular-nums">{stats.tools}{stats.errors ? <span className="text-bad"> · {stats.errors} failed</span> : null}</dd>
            {meta.endedAt && <><dt className="text-muted-foreground">Duration</dt><dd className="tabular-nums">{duration(meta.createdAt, meta.endedAt)}</dd></>}
            <dt className="text-muted-foreground">Expires</dt><dd className="tabular-nums">{meta.kept || !meta.expiresAt ? "Never (kept)" : dateTime(meta.expiresAt)}</dd>
          </dl>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Thinking is never uploaded. Secrets are redacted on the sender's machine. Shared with <a href="/" className="underline underline-offset-2 hover:text-foreground">agentcast</a>.
      </p>
    </div>
  );
}
