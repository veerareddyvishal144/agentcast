import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, MessageCircleQuestion, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { clock } from "@/lib/format";
import { toolIcon } from "@/lib/tools";
import { cn } from "@/lib/utils";
import type { Answer, Citation } from "@/lib/types";

type QA = { q: string; a?: Answer; error?: string; pending: boolean };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialQuestion?: string | null;
  ask: (q: string) => Promise<Answer>;
  enabled: boolean;
};

/** Scroll to an event and flash it. */
export function jumpTo(seq: number) {
  const el = document.getElementById(`ev-${seq}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1700);
}

export function AskPanel({ open, onOpenChange, initialQuestion, ask, enabled }: Props) {
  const [items, setItems] = useState<QA[]>([]);
  const [value, setValue] = useState("");
  const asked = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question || !enabled) return;
    setValue("");
    setItems((xs) => [...xs, { q: question, pending: true }]);
    try {
      const a = await ask(question);
      setItems((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, a, pending: false } : x)));
    } catch (err) {
      setItems((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, error: err instanceof Error ? err.message : "Something went wrong", pending: false } : x)));
    }
  };

  // Fire a deep-linked question once the session has loaded enough to be asked.
  useEffect(() => {
    if (open && enabled && initialQuestion && asked.current !== initialQuestion) { asked.current = initialQuestion; void submit(initialQuestion); }
  }, [open, enabled, initialQuestion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [items]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[420px] max-w-[92vw] flex-col gap-0 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base"><MessageCircleQuestion className="size-4 text-brand" /> Ask this session</SheetTitle>
          <SheetDescription>Answers come only from what happened here and cite the events they rely on.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!enabled && <p className="text-sm text-muted-foreground">AI features are turned off for this session.</p>}
          {enabled && items.length === 0 && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Try one of these:</p>
              {["What did the agent change, and why?", "Which commands failed?", "Summarize what happened in the last few steps."].map((s) => (
                <button key={s} onClick={() => submit(s)} className="block w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/60">{s}</button>
              ))}
            </div>
          )}
          <ol className="space-y-5">
            {items.map((it, i) => (
              <li key={i} className="space-y-2">
                <p className="text-sm font-medium">{it.q}</p>
                {it.pending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Reading the session…</p>}
                {it.error && <p className="text-sm text-bad">{it.error}</p>}
                {it.a && <AnswerView a={it.a} />}
              </li>
            ))}
          </ol>
          <div ref={bottom} />
        </div>
        <form
          className="flex items-center gap-2 border-t px-4 py-3"
          onSubmit={(e) => { e.preventDefault(); void submit(value); }}
        >
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={enabled ? "Ask about this session…" : "Unavailable"} disabled={!enabled} autoFocus maxLength={500} />
          <Button type="submit" size="icon" disabled={!enabled || !value.trim()} aria-label="Ask"><ArrowUp /></Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AnswerView({ a }: { a: Answer }) {
  // Turn "[12]" markers into clickable chips inline.
  const parts = a.answer.split(/(\[\d+\])/g);
  const bySeq = new Map(a.citations.map((c) => [c.seq, c]));
  return (
    <div className="space-y-3">
      <p className="text-[14px] leading-relaxed">
        {parts.map((p, i) => {
          const m = /^\[(\d+)\]$/.exec(p);
          if (!m) return <span key={i}>{p}</span>;
          const seq = Number(m[1]);
          const c = bySeq.get(seq);
          return (
            <button key={i} onClick={() => jumpTo(seq)} title={c?.label} className="mx-0.5 inline-flex h-5 items-center rounded-md border border-brand/40 bg-brand/10 px-1.5 align-middle font-mono text-[11px] text-brand hover:bg-brand/20">
              {seq}
            </button>
          );
        })}
      </p>
      {a.citations.length > 0 && (
        <ul className="space-y-1">
          {a.citations.map((c) => <CitationRow key={c.seq} c={c} />)}
        </ul>
      )}
      {!a.indexed && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="size-3" /> Still indexing the newest events; answers may miss the latest steps.</p>}
    </div>
  );
}

function CitationRow({ c }: { c: Citation }) {
  const Icon = c.kind === "tool_use" ? toolIcon(c.label.replace(/^TOOL\s+/, "").split(" ")[0]) : null;
  const label = c.label.replace(/^(USER|AGENT|TOOL):?\s*/, "");
  return (
    <li>
      <button onClick={() => jumpTo(c.seq)} className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground")}>
        <span className="mt-px w-6 shrink-0 font-mono text-[11px] text-brand tabular-nums">{c.seq}</span>
        {Icon && <Icon className="mt-0.5 size-3 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <time className="shrink-0 font-mono text-[10px] tabular-nums">{clock(c.ts)}</time>
      </button>
    </li>
  );
}
