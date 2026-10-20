import { memo } from "react";
import { AssistantCard, SystemLine, UserCard } from "@/components/event-card";
import { ToolCard } from "@/components/tool-card";
import { toolIcon } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { StoredEvent } from "@/lib/types";

type Props = {
  events: StoredEvent[];               // already filtered to what should be visible
  results: Map<string, StoredEvent>;   // visible tool results by tool_use id
  agent: string;
  ended: boolean;
  toolsOpen: boolean | null;
  compact?: boolean;
  dimOutside?: { fromSeq: number; toSeq: number } | null;
};

export const Timeline = memo(function Timeline({ events, results, agent, ended, toolsOpen, compact, dimOutside }: Props) {
  return (
    <ol className={cn("relative", compact ? "space-y-2 pl-7" : "space-y-3 pl-9 sm:pl-10", "before:absolute before:inset-y-2 before:left-[11px] before:w-px before:bg-border")}>
      {events.map((ev) => {
        if (ev.kind === "tool_result") return null;
        return (
          <li key={ev.seq} id={`ev-${ev.seq}`} className={cn("relative scroll-mt-32 transition-opacity", dimOutside && (ev.seq < dimOutside.fromSeq || ev.seq > dimOutside.toSeq) && "opacity-30")}>
            <Node ev={ev} compact={compact} />
            {ev.kind === "user" && <UserCard ev={ev} compact={compact} />}
            {ev.kind === "assistant_text" && <AssistantCard ev={ev} agent={agent} compact={compact} />}
            {ev.kind === "tool_use" && <ToolCard ev={ev} result={results.get(String(ev.data.id)) ?? null} ended={ended} forceOpen={toolsOpen} compact={compact} />}
            {ev.kind === "session_start" && <SystemLine ev={ev} text={`Session started${ev.data.project ? ` in ${String(ev.data.project)}` : ""}`} />}
            {ev.kind === "session_end" && <SystemLine ev={ev} text="Session ended" />}
            {ev.kind === "notice" && <SystemLine ev={ev} text={String(ev.data.text ?? "")} />}
          </li>
        );
      })}
    </ol>
  );
});

function Node({ ev, compact }: { ev: StoredEvent; compact?: boolean }) {
  const left = compact ? "-left-7" : "-left-9 sm:-left-10";
  if (ev.kind === "tool_use") {
    const Icon = toolIcon(String(ev.data.name ?? ""));
    return (
      <span className={cn("absolute top-2.5 grid size-6 place-items-center rounded-full border bg-background text-muted-foreground", left)}>
        <Icon className="size-3" />
      </span>
    );
  }
  const color = ev.kind === "user" ? "bg-brand" : ev.kind === "assistant_text" ? "bg-live" : "bg-muted-foreground/60";
  return <span className={cn("absolute top-4 ml-1.5 size-3 rounded-full border-2 border-background", color, left)} />;
}
