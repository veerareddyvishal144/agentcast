import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Copy, History, Lock, Radio, Scissors, ShieldCheck, Sparkles, Timer, Users, Terminal, Link2, Play } from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { StatusPill } from "@/components/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { Transcript } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { sampleEvents, sampleMeta } from "@/lib/sample-session";
import type { StoredEvent } from "@/lib/types";

const INSTALL = "curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh";

export function LandingApp() {
  return (
    <TooltipProvider>
      <div className="relative min-h-dvh overflow-x-clip bg-background">
        <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-60" />
        <Nav />
        <Hero />
        <HowItWorks />
        <Features />
        <Privacy />
        <Footer />
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

function Nav() {
  return (
    <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Brand size="lg" />
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><a href="#how">How it works</a></Button>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><a href="#privacy">Privacy</a></Button>
        <Button asChild size="sm"><a href="#install">Install <ArrowRight /></a></Button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
      <div>
        <Badge variant="outline" className="mb-5 gap-1.5 rounded-full px-3 py-1 font-mono text-[11px]"><span className="size-1.5 animate-pulse-dot rounded-full bg-live" /> Works with Claude Code today</Badge>
        <h1 className="text-balance text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">
          Watch a coding agent work. <span className="text-gradient">Live, from a link.</span>
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
          agentcast streams your Claude Code session to a page anyone can open: prompts, replies, tool calls, diffs and results as they happen. When the session ends, the link becomes a replay.
        </p>
        <div id="install" className="mt-8 scroll-mt-24"><InstallBox /></div>
        <p className="mt-3 text-xs text-muted-foreground">One command, Node 18+. Nothing to sign up for. Remove it just as easily with <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono">--uninstall</code>. Prefer plugins? agentcast also ships as a Claude Code plugin with <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono">/agentcast:link</code>, <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono">:title</code>, <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono">:pause</code> and <code className="rounded border bg-muted/60 px-1 py-0.5 font-mono">:end</code> commands.</p>
      </div>
      <DemoPlayer />
    </section>
  );
}

function InstallBox() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(INSTALL); setCopied(true); toast.success("Install command copied"); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Could not copy"); }
  };
  return (
    <div className="glass flex items-center gap-2 rounded-xl border p-1.5 pl-4 shadow-lg shadow-black/10">
      <Terminal className="size-4 shrink-0 text-muted-foreground" />
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{INSTALL}</code>
      <Button size="sm" onClick={copy} className="shrink-0 gap-1.5">{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy"}</Button>
    </div>
  );
}

function DemoPlayer() {
  const [n, setN] = useState(2);
  const [viewers, setViewers] = useState(4);
  const total = sampleEvents.length;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const done = n >= total;
    const t = setTimeout(() => setN((k) => (k >= total ? 1 : k + 1)), done ? 4000 : 1000);
    return () => clearTimeout(t);
  }, [n, total]);
  useEffect(() => {
    const t = setInterval(() => setViewers((v) => Math.max(2, Math.min(14, v + (Math.random() > 0.45 ? 1 : -1)))), 3500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [n]);

  const visible = useMemo(() => sampleEvents.slice(0, n), [n]);
  const results = useMemo(() => {
    const m = new Map<string, StoredEvent>();
    for (const e of visible) if (e.kind === "tool_result") m.set(String(e.data.tool_use_id), e);
    return m;
  }, [visible]);
  const done = n >= total;

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/25">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-bad/80" /><span className="size-2.5 rounded-full bg-warn/80" /><span className="size-2.5 rounded-full bg-live/80" /></div>
          <div className="min-w-0 flex-1 truncate text-xs font-medium">{sampleMeta.title}</div>
          <StatusPill status={done ? "ended" : "live"} />
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex"><Users className="size-3" />{viewers}</span>
        </div>
        <div ref={scroller} className="h-[400px] overflow-y-auto px-4 sm:h-[440px]">
          <Transcript events={visible} results={results} agent={sampleMeta.agent} ended={done} toolsOpen={null} compact />
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">{done ? <History className="size-3.5" /> : <Play className="size-3.5" />}</span>
          <Progress value={(n / total) * 100} className="h-1.5 flex-1" />
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{n} / {total}</span>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Install the hook", body: "Run the one-liner. It downloads a small Node script into ~/.agentcast and registers it as a Claude Code hook, globally or for one project." },
    { n: "02", title: "Start a session", body: "Open Claude Code as usual. The share link appears as a system message the moment the session starts." },
    { n: "03", title: "Share the link", body: "Anyone with the link watches live. Once the session ends it becomes a replay with a scrubber, step controls and speed." },
  ];
  return (
    <section id="how" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
      <h2 className="text-3xl font-semibold tracking-tight">Three steps, no accounts</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.n} className="relative overflow-hidden">
            <span className="absolute top-4 right-5 font-mono text-4xl font-bold text-foreground/5">{s.n}</span>
            <CardHeader><CardTitle>{s.title}</CardTitle><CardDescription className="text-pretty">{s.body}</CardDescription></CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { Icon: Radio, title: "Live over WebSockets", body: "Events fan out from a Durable Object the instant the hook posts them. Viewers reconnect and resume automatically.", span: "md:col-span-2" },
    { Icon: History, title: "Replay when it ends", body: "A timeline scrubber with play, step and 1× to 8× speed. Tool results stay hidden until their moment." },
    { Icon: Lock, title: "Private links", body: "Set a passphrase and viewers must enter it before anything loads. Stored as a salted PBKDF2 hash." },
    { Icon: Sparkles, title: "Titles that read well", body: "When a session ends, a model running on Cloudflare writes a short title and summary, so links look good in Slack and X.", span: "md:col-span-2" },
    { Icon: Timer, title: "24-hour expiry", body: "Sessions delete themselves a day after they start. Nothing is indexed." },
    { Icon: Scissors, title: "Clips and export", body: "Share just the interesting range with a clip link, or export any view as Markdown or JSON." },
    { Icon: Link2, title: "Deep links", body: "Append #tools to open every tool call expanded. Jump between turns from the outline." },
    { Icon: ShieldCheck, title: "Redaction built in", body: "API keys, tokens, JWTs and private keys are scrubbed on your machine before upload, then again on the server." },
  ];
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5 py-16">
      <h2 className="text-3xl font-semibold tracking-tight">Built for showing your work</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map(({ Icon, title, body, span }) => (
          <Card key={title} className={span}>
            <CardHeader>
              <div className="mb-2 grid size-9 place-items-center rounded-xl border bg-muted/40 text-brand"><Icon className="size-4" /></div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="text-pretty">{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
      <Card className="overflow-hidden">
        <CardContent className="grid gap-8 p-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Privacy defaults you do not have to configure</h2>
            <p className="mt-3 text-pretty text-muted-foreground">The agent's private thinking is never read from the transcript. Subagent chatter and injected system reminders are dropped. Only your project folder name is sent, never the full path.</p>
          </div>
          <ul className="space-y-2 font-mono text-[13px]">
            <li className="flex items-center gap-3"><Kbd>AGENTCAST_PASSPHRASE</Kbd><span className="text-muted-foreground">require a passphrase to view</span></li>
            <li className="flex items-center gap-3"><Kbd>AGENTCAST_NO_AI=1</Kbd><span className="text-muted-foreground">skip the generated title</span></li>
            <li className="flex items-center gap-3"><Kbd>AGENTCAST_DISABLE=1</Kbd><span className="text-muted-foreground">pause streaming</span></li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-10 text-xs text-muted-foreground sm:flex-row">
      <Brand />
      <p>Runs on Cloudflare Workers, Durable Objects and Workers AI. Free to use while in preview.</p>
    </footer>
  );
}
