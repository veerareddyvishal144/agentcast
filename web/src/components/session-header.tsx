import { useEffect, useState } from "react";
import { Check, Copy, Cpu, Download, FileJson, FileText, FolderOpen, List, PanelsTopLeft, Timer, Users } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { StatusPill } from "@/components/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { Outline } from "@/components/outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ago, duration } from "@/lib/format";
import type { Meta, Status, StoredEvent } from "@/lib/types";

type Props = {
  meta: Meta | null;
  status: Status;
  viewers: number;
  events: StoredEvent[];
  hiddenAfter: number;
  toolsOpen: boolean | null;
  onToggleTools: () => void;
  onExport: (kind: "md" | "md-copy" | "json") => void;
  canExport: boolean;
};

export function SessionHeader({ meta, status, viewers, events, hiddenAfter, toolsOpen, onToggleTools, onExport, canExport }: Props) {
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href.split("#")[0]);
      setCopied(true); toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy"); }
  };

  const title = status === "gone" ? "Session not found" : status === "locked" ? "Private session" : meta?.title || "Loading session…";

  return (
    <header className="glass sticky top-0 z-20 border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-4">
        <Brand className="hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <StatusPill status={status} />
            {meta?.project && <Badge variant="outline" className="gap-1 font-mono"><FolderOpen className="size-3" />{meta.project}</Badge>}
            {meta?.model && <Badge variant="outline" className="hidden gap-1 font-mono sm:inline-flex"><Cpu className="size-3" />{meta.model}</Badge>}
            {meta && <span className="hidden items-center gap-1 sm:inline-flex"><Timer className="size-3" />{meta.endedAt ? `ran ${duration(meta.createdAt, meta.endedAt)}` : `started ${ago(meta.createdAt)}`}</span>}
            {viewers > 0 && <span className="inline-flex items-center gap-1"><Users className="size-3" />{viewers}</span>}
          </div>
          {meta?.summary && <p className="mt-1 line-clamp-2 max-w-3xl text-xs text-muted-foreground/90">{meta.summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Sheet>
            <Tooltip><TooltipTrigger asChild><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Turns"><List /></Button></SheetTrigger></TooltipTrigger><TooltipContent>Turns</TooltipContent></Tooltip>
            <SheetContent side="right" className="w-80">
              <SheetHeader><SheetTitle>Turns</SheetTitle></SheetHeader>
              <div className="px-4 pb-4"><Outline events={events} hiddenAfter={hiddenAfter} /></div>
            </SheetContent>
          </Sheet>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Toggle tool details" aria-pressed={toolsOpen === true} onClick={onToggleTools}><PanelsTopLeft /></Button></TooltipTrigger><TooltipContent>{toolsOpen ? "Collapse all tools" : "Expand all tools"}</TooltipContent></Tooltip>
          <DropdownMenu>
            <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Export" disabled={!canExport}><Download /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>Export</TooltipContent></Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export this view</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onExport("md")}><FileText /> Download Markdown</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("md-copy")}><Copy /> Copy as Markdown</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onExport("json")}><FileJson /> Download JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={copy} className="gap-1.5">{copied ? <Check className="text-live" /> : <Copy />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span></Button></TooltipTrigger><TooltipContent>Copy share link</TooltipContent></Tooltip>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
