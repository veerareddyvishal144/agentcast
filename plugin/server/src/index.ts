import { SessionDO, type Env, type IncomingEvent, type Meta, type MetaPatch, type PublicMeta, type Result, type StoredEvent } from "./session";

export { SessionDO };

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-agentcast-key,x-agentcast-create-token",
};
const ID_RE = /^[a-z0-9]{6,32}$/;
const MAX_BODY = 5 * 1024 * 1024;

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path.startsWith("/s/")) {
      const id = path.slice(3).split("/")[0];
      if (!ID_RE.test(id)) return text("Not found", 404);
      return viewerPage(env, url, id);
    }

    if (path.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url);
      } catch (err) {
        return json({ error: "internal error", detail: String(err) }, 500);
      }
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;

// ---------- viewer page with link-preview tags ----------

async function viewerPage(env: Env, url: URL, id: string): Promise<Response> {
  const [htmlRes, metaRes] = await Promise.all([
    env.ASSETS.fetch(new Request(new URL("/viewer.html", url).toString())),
    env.SESSIONS.get(env.SESSIONS.idFromName(id)).getMeta(null).catch(() => null),
  ]);
  let html = await htmlRes.text();

  const origin = url.origin;
  const from = Number(url.searchParams.get("from") || "");
  const to = Number(url.searchParams.get("to") || "");
  const isClip = Number.isInteger(from) && Number.isInteger(to) && from > 0 && to >= from;
  let title = "agentcast session";
  let desc = "Watch a coding agent work, live from a link.";
  if (metaRes?.ok) {
    const m = metaRes.value.meta;
    if (metaRes.value.authorized) {
      const full = m as Meta;
      title = isClip ? `Clip from ${full.title || "a session"}` : full.title || title;
      desc = full.summary || `${full.agent}${full.project ? ` in ${full.project}` : ""}${full.endedAt ? " · finished" : " · live"} session on agentcast.`;
      if (isClip) desc = `Events ${from} to ${to}. ${desc}`;
    } else {
      title = "Private agentcast session";
      desc = "This session needs a passphrase to view.";
    }
  } else if (metaRes && !metaRes.ok && metaRes.status === 404) {
    title = "Session not found";
    desc = "This agentcast link has expired or was deleted by its owner.";
  }

  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="agentcast" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(desc)}" />`,
    `<meta property="og:url" content="${attr(`${origin}/s/${id}${isClip ? `?from=${from}&to=${to}` : ""}`)}" />`,
    `<meta property="og:image" content="${attr(`${origin}/og.png`)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(desc)}" />`,
    `<meta name="twitter:image" content="${attr(`${origin}/og.png`)}" />`,
  ].join("\n");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)} · agentcast</title>\n${tags}`);

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

// ---------- API ----------

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean); // ["api","sessions",id?,sub?]
  if (parts[1] === "version" && req.method === "GET") {
    return json({ version: env.AGENTCAST_VERSION ?? "dev", requiresCreateToken: !!env.CREATE_TOKEN, features: { ai: !!env.AI, search: !!env.VECTORS, archive: !!env.ARCHIVE } });
  }
  if (parts[1] !== "sessions") return json({ error: "not found" }, 404);

  if (parts.length === 2) {
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (env.CREATE_TOKEN) {
      const presented = req.headers.get("x-agentcast-create-token") || "";
      if (!constantTimeEqual(presented, env.CREATE_TOKEN)) return json({ error: "this server requires a create token; run /agentcast:deploy or set create_token in the plugin settings" }, 401);
    }
    return createSession(req, env, url);
  }

  const id = parts[2];
  if (!ID_RE.test(id)) return json({ error: "bad id" }, 400);
  const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
  const sub = parts[3];
  const key = viewerKey(req, url);

  if (!sub && req.method === "GET") {
    const after = Number(url.searchParams.get("after") || "0") || 0;
    const limit = Number(url.searchParams.get("limit") || "1000") || 1000;
    return fromResult(await stub.getState(after, limit, key));
  }

  if (!sub && req.method === "DELETE") {
    return fromResult(await stub.destroy(bearer(req)));
  }

  if (sub === "keep" && req.method === "POST") {
    const body = (await readJson(req)) as { kept?: unknown } | null;
    return fromResult(await stub.keep(bearer(req), body?.kept !== false));
  }

  if (sub === "ask" && req.method === "POST") {
    if (env.ASK_LIMITER) {
      const ip = req.headers.get("cf-connecting-ip") || "unknown";
      const { success } = await env.ASK_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "too many questions from this address; try again in a minute" }, 429);
    }
    if (tooLarge(req)) return json({ error: "body too large" }, 413);
    const body = (await readJson(req)) as { question?: unknown } | null;
    return fromResult(await stub.ask(key, body?.question));
  }

  if (!sub && req.method === "PATCH") {
    if (tooLarge(req)) return json({ error: "body too large" }, 413);
    const body = (await readJson(req)) as { title?: unknown } | null;
    return fromResult(await stub.rename(bearer(req), body?.title));
  }

  if (sub === "export.html" && req.method === "GET") {
    // Standalone, self-contained replay: the single-file viewer build with the session data inlined.
    type State = Result<{ meta: Meta; events: StoredEvent[]; viewers: number }>;
    const first = (await stub.getState(0, 5000, key)) as State;
    if (!first.ok) return fromResult(first);
    const events = [...first.value.events];
    while (events.length && events.length % 5000 === 0) {
      const more = (await stub.getState(events[events.length - 1].seq, 5000, key)) as State;
      if (!more.ok || more.value.events.length === 0) break;
      events.push(...more.value.events);
    }
    const tpl = await env.ASSETS.fetch(new Request(new URL("/standalone.html", url).toString()));
    if (!tpl.ok) return json({ error: "standalone template missing" }, 500);
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), url: `${url.origin}/s/${id}`, meta: first.value.meta, events }).replace(/</g, "\\u003c");
    const html = (await tpl.text()).replace("__AGENTCAST_DATA__", () => payload);
    const slug = (first.value.meta.title || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "session";
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="agentcast-${slug}-${id}.html"`, "cache-control": "no-store", ...CORS },
    });
  }

  if (sub === "meta" && req.method === "GET") {
    return fromResult(await stub.getMeta(key));
  }

  if (sub === "events" && req.method === "POST") {
    if (tooLarge(req)) return json({ error: "body too large" }, 413);
    const body = (await readJson(req)) as { events?: IncomingEvent[]; meta?: MetaPatch } | null;
    if (!body || !Array.isArray(body.events)) return json({ error: "expected { events: [] }" }, 400);
    return fromResult(await stub.append(bearer(req), body.events, body.meta));
  }

  if (sub === "end" && req.method === "POST") {
    return fromResult(await stub.end(bearer(req)));
  }

  if (sub === "ws" && req.method === "GET") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "expected websocket" }, 426);
    return stub.fetch(req);
  }

  return json({ error: "not found" }, 404);
}

async function createSession(req: Request, env: Env, url: URL): Promise<Response> {
  if (tooLarge(req)) return json({ error: "body too large" }, 413);

  if (env.CREATE_LIMITER) {
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.CREATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "too many sessions created from this address; try again in a minute" }, 429);
  }

  const body = ((await readJson(req)) ?? {}) as { title?: string; agent?: string; project?: string; model?: string; passphrase?: string; ai?: boolean; keep?: boolean; ttlHours?: number };
  if (body.passphrase !== undefined && (typeof body.passphrase !== "string" || body.passphrase.length < 4 || body.passphrase.length > 200)) {
    return json({ error: "passphrase must be 4 to 200 characters" }, 400);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = shortId(10);
    const token = randomHex(32);
    const stub = env.SESSIONS.get(env.SESSIONS.idFromName(id));
    const res = await stub.create(
      { id, title: str(body.title), agent: str(body.agent), project: str(body.project), model: str(body.model), passphrase: str(body.passphrase), ai: body.ai !== false, keep: body.keep === true, ttlHours: typeof body.ttlHours === "number" ? body.ttlHours : undefined },
      token,
    );
    if (res.ok) {
      return json({ id, token, url: `${url.origin}/s/${id}`, expiresAt: res.value.expiresAt, kept: res.value.kept, protected: res.value.protected }, 201);
    }
    if (res.status !== 409) return fromResult(res);
  }
  return json({ error: "could not allocate id" }, 500);
}

// ---------- helpers ----------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function fromResult<T>(r: Result<T>): Response {
  return r.ok ? json(r.value, 200) : json({ error: r.error }, r.status);
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function tooLarge(req: Request): boolean {
  return Number(req.headers.get("content-length") || "0") > MAX_BODY;
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");
  return m ? m[1].trim() : null;
}

function viewerKey(req: Request, url: URL): string | null {
  return req.headers.get("x-agentcast-key") || url.searchParams.get("key") || null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function attr(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function shortId(len: number): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 symbols, no 0/o/1/l
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}

function randomHex(n: number): string {
  return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type { PublicMeta };
