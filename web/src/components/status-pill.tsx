import { Lock, Radio, Wifi, WifiOff, Flag, Hourglass, Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/types";

const map: Record<Status, { label: string; cls: string; dot: string; Icon: typeof Radio; pulse?: boolean }> = {
  live: { label: "Live", cls: "border-live/40 text-live bg-live/10", dot: "bg-live", Icon: Radio, pulse: true },
  ended: { label: "Ended", cls: "border-border text-muted-foreground bg-muted/40", dot: "bg-muted-foreground", Icon: Flag },
  expired: { label: "Expired", cls: "border-bad/40 text-bad bg-bad/10", dot: "bg-bad", Icon: Hourglass },
  gone: { label: "Not found", cls: "border-bad/40 text-bad bg-bad/10", dot: "bg-bad", Icon: Ghost },
  locked: { label: "Private", cls: "border-warn/40 text-warn bg-warn/10", dot: "bg-warn", Icon: Lock },
  connecting: { label: "Connecting", cls: "border-warn/40 text-warn bg-warn/10", dot: "bg-warn", Icon: Wifi, pulse: true },
  reconnecting: { label: "Reconnecting", cls: "border-warn/40 text-warn bg-warn/10", dot: "bg-warn", Icon: WifiOff, pulse: true },
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = map[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold tracking-wide uppercase", s.cls, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot, s.pulse && "animate-pulse-dot")} />
      {s.label}
    </span>
  );
}
