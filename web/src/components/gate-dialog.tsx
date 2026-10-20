import { useState } from "react";
import { Lock, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function GateDialog({ open, error, onSubmit }: { open: boolean; error: string | null; onSubmit: (key: string) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl border bg-warn/10 text-warn"><Lock className="size-5" /></div>
          <DialogTitle>This session is private</DialogTitle>
          <DialogDescription>Enter the passphrase the sharer gave you. Nothing loads until it matches.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!value || busy) return;
            setBusy(true);
            const ok = await onSubmit(value);
            setBusy(false);
            if (!ok) setValue("");
          }}
        >
          <Input type="password" autoFocus autoComplete="off" placeholder="Passphrase" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          {error && <p className="text-xs text-bad">{error}</p>}
          <Button type="submit" disabled={!value || busy}>{busy && <LoaderCircle className="animate-spin" />} View session</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
