import { forwardRef } from "react";
import { StatusPill } from "@/components/status-pill";
import { ago, duration } from "@/lib/format";
import type { Meta, Status } from "@/lib/types";

type Props = { meta: Meta | null; status: Status; viewers: number; clipLabel?: string | null };

/** Document-style title block at the top of the transcript. */
export const DocHeader = forwardRef<HTMLDivElement, Props>(function DocHeader({ meta, status, viewers, clipLabel }, ref) {
  const title = status === "gone" ? "Session not found" : status === "locked" ? "Private session" : meta?.title || "Loading session…";
  const parts: string[] = [];
  if (meta?.project) parts.push(meta.project);
  if (meta?.model) parts.push(meta.model);
  if (meta) parts.push(meta.endedAt ? `ran ${duration(meta.createdAt, meta.endedAt)}` : `started ${ago(meta.createdAt)}`);
  if (viewers > 0) parts.push(viewers === 1 ? "1 watching" : `${viewers} watching`);
  if (meta?.kept) parts.push("kept");
  return (
    <div ref={ref} className="border-b pb-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <StatusPill status={status} />
        {parts.length > 0 && <span className="truncate">{parts.join(" · ")}</span>}
        {clipLabel && <span className="rounded-md border border-brand/30 bg-brand/8 px-1.5 py-0.5 text-[11px] font-medium text-brand">{clipLabel}</span>}
      </div>
      <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-tight">{title}</h1>
      {meta?.summary && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{meta.summary}</p>}
    </div>
  );
});
