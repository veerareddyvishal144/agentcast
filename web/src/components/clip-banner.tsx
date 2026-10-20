import { Check, Copy, Scissors, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ClipBanner({ count, total, onClear }: { count: number; total: number; onClear: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href.split("#")[0]); setCopied(true); toast.success("Clip link copied"); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Could not copy"); }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/8 px-3 py-2 text-sm">
      <span className="grid size-7 place-items-center rounded-lg bg-brand/15 text-brand"><Scissors className="size-3.5" /></span>
      <span className="font-medium">Clip</span>
      <span className="text-muted-foreground">{count} of {total} events</span>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={copy} className="gap-1.5">{copied ? <Check className="text-live" /> : <Copy />} Copy clip link</Button>
        <Button size="sm" variant="outline" onClick={onClear} className="gap-1.5"><X /> Show full session</Button>
      </div>
    </div>
  );
}
