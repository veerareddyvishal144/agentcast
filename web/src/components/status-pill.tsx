import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";

const map: Record<Status, { label: string; text: string; dot: string; pulse?: boolean }> = {
  live: { label: "Live", text: "text-live", dot: "bg-live", pulse: true },
  ended: { label: "Ended", text: "text-muted-foreground", dot: "bg-muted-foreground/70" },
  expired: { label: "Expired", text: "text-bad", dot: "bg-bad" },
  gone: { label: "Not found", text: "text-bad", dot: "bg-bad" },
  locked: { label: "Private", text: "text-warn", dot: "bg-warn" },
  connecting: { label: "Connecting", text: "text-muted-foreground", dot: "bg-warn", pulse: true },
  reconnecting: { label: "Reconnecting", text: "text-muted-foreground", dot: "bg-warn", pulse: true },
};

/** Quiet status indicator: a dot and a word. */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.text, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot, s.pulse && "animate-pulse-dot")} />
      {s.label}
    </span>
  );
}
