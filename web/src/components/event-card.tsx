import { memo } from "react";
import { Bot, UserRound } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { time } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StoredEvent } from "@/lib/types";

export const UserCard = memo(function UserCard({ ev, compact }: { ev: StoredEvent; compact?: boolean }) {
  return (
    <article className={cn("animate-rise rounded-2xl border border-brand/25 bg-brand/8 shadow-sm", compact ? "p-3" : "p-4 sm:p-5")}>
      <header className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <UserRound className="size-3.5 text-brand" />
        <span className="font-semibold text-foreground">You</span>
        <time className="ml-auto font-mono tabular-nums">{time(ev.ts)}</time>
      </header>
      <Markdown text={String(ev.data.text ?? "")} />
    </article>
  );
});

export const AssistantCard = memo(function AssistantCard({ ev, agent, compact }: { ev: StoredEvent; agent: string; compact?: boolean }) {
  return (
    <article className={cn("animate-rise rounded-2xl border bg-card shadow-sm", compact ? "p-3" : "p-4 sm:p-5")}>
      <header className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <Bot className="size-3.5 text-live" />
        <span className="font-semibold text-foreground">{agent}</span>
        <time className="ml-auto font-mono tabular-nums">{time(ev.ts)}</time>
      </header>
      <Markdown text={String(ev.data.text ?? "")} />
    </article>
  );
});

export const SystemLine = memo(function SystemLine({ ev, text }: { ev: StoredEvent; text: string }) {
  return (
    <div className="animate-rise flex items-center gap-3 px-1 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span>{text}</span>
      <time className="font-mono tabular-nums">{time(ev.ts)}</time>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
});
