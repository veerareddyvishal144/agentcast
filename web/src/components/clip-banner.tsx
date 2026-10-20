import { Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ClipBanner({ count, total, onClear }: { count: number; total: number; onClear: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
      <Scissors className="size-3.5 text-brand" />
      <span>Showing a clip, <span className="text-foreground">{count} of {total}</span> events.</span>
      <Button size="xs" variant="ghost" onClick={onClear} className="ml-auto gap-1"><X /> Show full session</Button>
    </div>
  );
}
