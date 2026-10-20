import { DurableObject } from "cloudflare:workers";
import { redactDeep, redactText } from "../plugin/shared/redact.mjs";

export interface Env {
  SESSIONS: DurableObjectNamespace<SessionDO>;
  ASSETS: Fetcher;
  AI?: Ai;
  CREATE_LIMITER?: RateLimit;
  SESSION_TTL_HOURS: string;
  MAX_EVENTS: string;
  AI_MODEL: string;
}

export type Meta = {
  id: string;
  title: string;
  summary: string | null;
  agent: string;
  project: string;
  model: string | null;
  protected: boolean;
  ai: boolean;
  titleLocked: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  expiresAt: string;
  eventCount: number;
};

/** What an unauthorized viewer of a protected session is allowed to see. */
export type PublicMeta = Pick<Meta, "id" | "protected" | "createdAt" | "expiresAt" | "endedAt">;

export type IncomingEvent = { ts?: string; kind: string; data: unknown };
export type StoredEvent = { seq: number; ts: string; kind: string; data: unknown };
export type MetaPatch = { title?: string; model?: string };
export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

type Attachment = { authed: boolean };

const KINDS = new Set(["session_start", "user", "assistant_text", "tool_use", "tool_result", "session_end", "notice"]);
const MAX_EVENT_BYTES = 64 * 1024;
const BATCH = 100;
const PBKDF2_ITERATIONS = 50_000;

export class SessionDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
         seq  INTEGER PRIMARY KEY,
         ts   TEXT NOT NULL,
         kind TEXT NOT NULL,
         data TEXT NOT NULL
       )`,
    );
  }

  // ---------- RPC: lifecycle ----------

  async create(
    input: { id: string; title?: string; agent?: string; project?: string; model?: string | null; passphrase?: string; ai?: boolean },
    token: string,
  ): Promise<Result<Meta>> {
    if (await this.meta()) return { ok: false, status: 409, error: "session exists" };
    const now = new Date();
    const ttlHours = Number(this.env.SESSION_TTL_HOURS || "24");
    const expires = new Date(now.getTime() + ttlHours * 3_600_000);
    const meta: Meta = {
      id: input.id,
      title: clip(redactText(input.title || "Untitled session"), 120),
      summary: null,
      agent: clip(input.agent || "unknown", 40),
      project: clip(redactText(input.project || ""), 80),
      model: input.model ? clip(input.model, 80) : null,
      protected: !!input.passphrase,
      ai: input.ai !== false && !!this.env.AI,
      titleLocked: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      endedAt: null,
      expiresAt: expires.toISOString(),
      eventCount: 0,
    };
    const toStore: Record<string, unknown> = { meta, tokenHash: await sha256(token) };
    if (input.passphrase) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      toStore.viewSalt = hex(salt);
      toStore.viewHash = await pbkdf2(input.passphrase, salt);
    }
    await this.ctx.storage.put(toStore);
    await this.ctx.storage.setAlarm(expires.getTime());
    return { ok: true, value: meta };
  }

  async append(token: string | null, incoming: IncomingEvent[], patch?: MetaPatch): Promise<Result<{ seq: number; count: number }>> {
    const meta = await this.meta();
    if (!meta) return { ok: false, status: 404, error: "no such session" };
    if (!(await this.authorizedWriter(token))) return { ok: false, status: 401, error: "bad token" };
    if (meta.endedAt) return { ok: false, status: 410, error: "session ended" };
    if (!Array.isArray(incoming)) return { ok: false, status: 400, error: "events must be an array" };

    const max = Number(this.env.MAX_EVENTS || "20000");
    let seq = meta.eventCount;
    const stored: StoredEvent[] = [];
    let hitLimit = false;

    for (const ev of incoming) {
      if (!ev || typeof ev.kind !== "string" || !KINDS.has(ev.kind)) continue;
      if (seq >= max) {
        hitLimit = true;
        break;
      }
      seq += 1;
      const ts = validIso(ev.ts) ?? new Date().toISOString();
      let data: unknown = redactDeep(ev.data ?? null);
      let json = JSON.stringify(data);
      if (json.length > MAX_EVENT_BYTES) {
        data = { truncated: true, bytes: json.length, preview: json.slice(0, 4000) };
        json = JSON.stringify(data);
      }
      this.sql.exec("INSERT INTO events (seq, ts, kind, data) VALUES (?, ?, ?, ?)", seq, ts, ev.kind, json);
      stored.push({ seq, ts, kind: ev.kind, data });
    }

    if (hitLimit && !(await this.ctx.storage.get("limitNoticed"))) {
      seq += 1;
      const ts = new Date().toISOString();
      const data = { text: `Event limit of ${max} reached. Later events were not recorded.` };
      this.sql.exec("INSERT INTO events (seq, ts, kind, data) VALUES (?, ?, ?, ?)", seq, ts, "notice", JSON.stringify(data));
      stored.push({ seq, ts, kind: "notice", data });
      await this.ctx.storage.put("limitNoticed", true);
    }

    meta.eventCount = seq;
    meta.updatedAt = new Date().toISOString();
    let metaChanged = false;
    const safePatch = (patch ? redactDeep(patch) : undefined) as MetaPatch | undefined;
    if (safePatch?.title && !meta.titleLocked && safePatch.title !== meta.title) {
      meta.title = clip(safePatch.title, 120);
      metaChanged = true;
    }
    if (safePatch?.model && safePatch.model !== meta.model) {
      meta.model = clip(safePatch.model, 80);
      metaChanged = true;
    }
    await this.ctx.storage.put("meta", meta);

    for (let i = 0; i < stored.length; i += BATCH) this.broadcast({ type: "events", events: stored.slice(i, i + BATCH) });
    if (metaChanged) this.broadcast({ type: "meta", meta });

    if (hitLimit) return { ok: false, status: 413, error: "event limit reached" };
    return { ok: true, value: { seq, count: stored.length } };
  }

  async end(token: string | null): Promise<Result<Meta>> {
    const meta = await this.meta();
    if (!meta) return { ok: false, status: 404, error: "no such session" };
    if (!(await this.authorizedWriter(token))) return { ok: false, status: 401, error: "bad token" };
    if (!meta.endedAt) {
      meta.endedAt = new Date().toISOString();
      meta.updatedAt = meta.endedAt;
      await this.ctx.storage.put("meta", meta);
      this.broadcast({ type: "meta", meta });
      // The summary runs from an alarm so it survives this object being evicted after the RPC returns.
      if (meta.ai) {
        await this.ctx.storage.put("summaryPending", 0);
        await this.ctx.storage.setAlarm(Date.now() + 500);
      }
    }
    return { ok: true, value: meta };
  }

  async rename(token: string | null, title: unknown): Promise<Result<Meta>> {
    const meta = await this.meta();
    if (!meta) return { ok: false, status: 404, error: "no such session" };
    if (!(await this.authorizedWriter(token))) return { ok: false, status: 401, error: "bad token" };
    if (meta.endedAt) return { ok: false, status: 410, error: "session ended" };
    const clean = typeof title === "string" ? redactText(title.replace(/\s+/g, " ").trim()) : "";
    if (clean.length < 1 || clean.length > 120) return { ok: false, status: 400, error: "title must be 1 to 120 characters" };
    meta.title = clean;
    meta.titleLocked = true;
    meta.updatedAt = new Date().toISOString();
    await this.ctx.storage.put("meta", meta);
    this.broadcast({ type: "meta", meta });
    return { ok: true, value: meta };
  }

  // ---------- RPC: reads ----------

  async getMeta(key: string | null): Promise<Result<{ meta: Meta | PublicMeta; authorized: boolean }>> {
    const meta = await this.meta();
    if (!meta) return { ok: false, status: 404, error: "no such session" };
    const authorized = await this.authorizedViewer(meta, key);
    return { ok: true, value: { meta: authorized ? meta : publicMeta(meta), authorized } };
  }

  async getState(after: number, limit: number, key: string | null): Promise<Result<{ meta: Meta; events: StoredEvent[]; viewers: number }>> {
    const meta = await this.meta();
    if (!meta) return { ok: false, status: 404, error: "no such session" };
    if (!(await this.authorizedViewer(meta, key))) return { ok: false, status: 401, error: "passphrase required" };
    const events = this.readEvents(after, Math.min(Math.max(limit, 1), 5000));
    return { ok: true, value: { meta, events, viewers: this.viewerCount() } };
  }

  // ---------- WebSocket viewers ----------

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const meta = await this.meta();
    if (!meta) return new Response("no such session", { status: 404 });

    const after = Number(new URL(req.url).searchParams.get("after") || "0") || 0;
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);

    if (meta.protected) {
      // Wait for an {type:"auth", key} message before sending anything.
      server.serializeAttachment({ authed: false, after } satisfies Attachment & { after: number });
      server.send(JSON.stringify({ type: "auth_required" }));
    } else {
      server.serializeAttachment({ authed: true } satisfies Attachment);
      this.sendSnapshot(server, meta, after);
      this.broadcastViewers();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") {
      ws.send("pong");
      return;
    }
    if (typeof message !== "string") return;
    const att = (ws.deserializeAttachment() ?? { authed: false }) as Attachment & { after?: number };
    if (att.authed) return;
    let msg: { type?: string; key?: string } | null = null;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg?.type !== "auth") return;
    const meta = await this.meta();
    if (!meta) {
      ws.close(1001, "gone");
      return;
    }
    if (await this.authorizedViewer(meta, msg.key ?? null)) {
      ws.serializeAttachment({ authed: true } satisfies Attachment);
      this.sendSnapshot(ws, meta, att.after ?? 0);
      this.broadcastViewers();
    } else {
      ws.send(JSON.stringify({ type: "auth_failed" }));
      ws.close(4001, "bad passphrase");
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {}
    this.broadcastViewers();
  }

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "error");
    } catch {}
    this.broadcastViewers();
  }

  async alarm() {
    const meta = await this.meta();
    if (!meta) return;
    const expiresAt = Date.parse(meta.expiresAt);
    if (Date.now() < expiresAt - 1_000) {
      // Early alarm: generate the summary, then re-arm the expiry alarm.
      const attempt = await this.ctx.storage.get<number>("summaryPending");
      if (attempt !== undefined) {
        try {
          await this.summarize();
          await this.ctx.storage.delete("summaryPending");
        } catch (err) {
          console.error("agentcast summary failed", meta.id, `attempt ${attempt + 1}`, String(err));
          if (attempt < 2) {
            await this.ctx.storage.put("summaryPending", attempt + 1);
            await this.ctx.storage.setAlarm(Math.min(Date.now() + 15_000 * (attempt + 1), expiresAt));
            return;
          }
          await this.ctx.storage.delete("summaryPending");
        }
      }
      await this.ctx.storage.setAlarm(expiresAt);
      return;
    }
    const msg = JSON.stringify({ type: "expired" });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
        ws.close(1001, "session expired");
      } catch {}
    }
    await this.ctx.storage.deleteAll();
  }

  // ---------- AI summary ----------

  private async summarize() {
    if (!this.env.AI) return;
    const meta = await this.meta();
    if (!meta || meta.summary) return;

    const rows = this.sql
      .exec<{ kind: string; data: string }>("SELECT kind, data FROM events WHERE kind IN ('user','assistant_text','tool_use') ORDER BY seq LIMIT 400")
      .toArray();
    const lines: string[] = [];
    const toolCounts = new Map<string, number>();
    let budget = 9000;
    for (const r of rows) {
      const d = safeParse(r.data) as { text?: string; name?: string } | null;
      if (r.kind === "tool_use") {
        if (d?.name) toolCounts.set(d.name, (toolCounts.get(d.name) ?? 0) + 1);
        continue;
      }
      const text = clip((d?.text ?? "").replace(/\s+/g, " ").trim(), 500);
      if (!text) continue;
      const line = `${r.kind === "user" ? "USER" : "AGENT"}: ${text}`;
      if (budget - line.length < 0) break;
      budget -= line.length;
      lines.push(line);
    }
    if (lines.length === 0) return;
    const tools = [...toolCounts.entries()].map(([n, c]) => `${n}×${c}`).join(", ");

    const prompt = `You summarize a transcript of a developer working with an AI coding agent.
Return ONLY a JSON object: {"title": "...", "summary": "..."}.
- title: at most 60 characters, specific, no quotes, no trailing period.
- summary: one or two sentences (max 220 characters) saying what was done and the outcome.
Tools used: ${tools || "none"}.

TRANSCRIPT:
${lines.join("\n")}`;

    const out = await this.env.AI.run(this.env.AI_MODEL as never, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
    } as never);
    const text = modelText(out);
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) {
      console.error("agentcast summary: no JSON in model output", meta.id, text.slice(0, 200));
      return;
    }
    let parsed: { title?: unknown; summary?: unknown };
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return;
    }
    const fresh = await this.meta();
    if (!fresh) return;
    let changed = false;
    if (!fresh.titleLocked && typeof parsed.title === "string" && parsed.title.trim().length >= 4) {
      fresh.title = clip(redactText(parsed.title.trim()), 120);
      changed = true;
    }
    if (typeof parsed.summary === "string" && parsed.summary.trim().length >= 8) {
      fresh.summary = clip(redactText(parsed.summary.trim()), 300);
      changed = true;
    }
    if (changed) {
      fresh.updatedAt = new Date().toISOString();
      await this.ctx.storage.put("meta", fresh);
      this.broadcast({ type: "meta", meta: fresh });
    }
  }

  // ---------- helpers ----------

  private async meta(): Promise<Meta | undefined> {
    return this.ctx.storage.get<Meta>("meta");
  }

  private async authorizedWriter(token: string | null): Promise<boolean> {
    if (!token) return false;
    const stored = await this.ctx.storage.get<string>("tokenHash");
    return !!stored && constantTimeEqual(stored, await sha256(token));
  }

  private async authorizedViewer(meta: Meta, key: string | null): Promise<boolean> {
    if (!meta.protected) return true;
    if (!key) return false;
    const [salt, hash] = await Promise.all([this.ctx.storage.get<string>("viewSalt"), this.ctx.storage.get<string>("viewHash")]);
    if (!salt || !hash) return false;
    return constantTimeEqual(hash, await pbkdf2(key, unhex(salt)));
  }

  private sendSnapshot(ws: WebSocket, meta: Meta, after: number) {
    ws.send(JSON.stringify({ type: "meta", meta }));
    let cursor = after;
    for (;;) {
      const batch = this.readEvents(cursor, BATCH);
      if (batch.length === 0) break;
      ws.send(JSON.stringify({ type: "events", events: batch }));
      cursor = batch[batch.length - 1].seq;
      if (batch.length < BATCH) break;
    }
    ws.send(JSON.stringify({ type: "ready" }));
  }

  private readEvents(after: number, limit: number): StoredEvent[] {
    return this.sql
      .exec<{ seq: number; ts: string; kind: string; data: string }>("SELECT seq, ts, kind, data FROM events WHERE seq > ? ORDER BY seq LIMIT ?", after, limit)
      .toArray()
      .map((r) => ({ seq: r.seq, ts: r.ts, kind: r.kind, data: safeParse(r.data) }));
  }

  private authedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ((ws.deserializeAttachment() ?? {}) as Attachment).authed);
  }

  private viewerCount(): number {
    return this.authedSockets().length;
  }

  private broadcast(msg: unknown) {
    const s = JSON.stringify(msg);
    for (const ws of this.authedSockets()) {
      try {
        ws.send(s);
      } catch {}
    }
  }

  private broadcastViewers() {
    this.broadcast({ type: "viewers", n: this.viewerCount() });
  }
}

/** Workers AI text models return { response: string }, but some return an object or an OpenAI-style shape. */
function modelText(out: unknown): string {
  if (typeof out === "string") return out;
  if (!out || typeof out !== "object") return "";
  const o = out as Record<string, unknown>;
  if (typeof o.response === "string") return o.response;
  if (o.response && typeof o.response === "object") return JSON.stringify(o.response);
  const choices = o.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (o.result && typeof o.result === "object") return modelText(o.result);
  return JSON.stringify(o);
}

function publicMeta(m: Meta): PublicMeta {
  return { id: m.id, protected: m.protected, createdAt: m.createdAt, expiresAt: m.expiresAt, endedAt: m.endedAt };
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function validIso(ts: unknown): string | null {
  if (typeof ts !== "string") return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

async function pbkdf2(pass: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return hex(bits);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
