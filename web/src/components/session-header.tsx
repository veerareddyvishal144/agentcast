import { useState } from "react";
import { Check, ChevronDown, Copy, Download, FileJson, FileText, List, PanelsTopLeft } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Outline } from "@/components/outline";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Meta, StoredEvent } from "@/lib/types";

type Props = {
  meta: Meta | null;
  events: StoredEvent[];
  hiddenAfter: number;
  showTitle: boolean;                 // true once the document header has scrolled away
  toolsOpen: boolean | null;
  onToggleTools: () => void;
  onExport: (kind: "md" | "md-copy" | "json") => void;
  canExport: boolean;
};

/** Slim sticky bar: brand, the title once you scroll, and labeled actions. */
export function SessionHeader({ meta, events, hiddenAfter, showTitle, toolsOpen, onToggleTools, onExport, canExport }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href.split("#")[0]);
      setCopied(true); toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy"); }
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-[1120px] items-center gap-4 px-5">
        <Brand />
        <div className={cn("min-w-0 flex-1 truncate text-sm font-medium transition-opacity duration-200", showTitle ? "opacity-100" : "opacity-0")} aria-hidden={!showTitle}>
          {meta?.title}
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Outline"><List /></Button></SheetTrigger>
            <SheetContent side="right" className="w-80">
              <SheetHeader><SheetTitle>Outline</SheetTitle></SheetHeader>
              <div className="px-4 pb-4"><Outline events={events} hiddenAfter={hiddenAfter} meta={meta} /></div>
            </SheetContent>
          </Sheet>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Toggle tool details" aria-pressed={toolsOpen === true} onClick={onToggleTools}><PanelsTopLeft /></Button></TooltipTrigger>
            <TooltipContent>{toolsOpen ? "Collapse all tool calls" : "Expand all tool calls"}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" disabled={!canExport} className="gap-1.5"><Download /><span className="hidden sm:inline">Export</span><ChevronDown className="size-3 opacity-60" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export this view</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onExport("md")}><FileText /> Download Markdown</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport("md-copy")}><Copy /> Copy as Markdown</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onExport("json")}><FileJson /> Download JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">{copied ? <Check className="text-live" /> : <Copy />}<span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span></Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
