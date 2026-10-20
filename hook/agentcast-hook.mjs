#!/usr/bin/env node
// agentcast hook for Claude Code.
// Wire it to SessionStart, UserPromptSubmit, PostToolUse, Stop and SessionEnd.
// On every call it tails the session transcript from the last byte offset,
// converts new lines to events, redacts secrets, and posts them to agentcast.
// It never exits non-zero and never blocks Claude Code for more than a few seconds.
//
// Environment:
//   AGENTCAST_URL         server origin (default http://localhost:8787)
//   AGENTCAST_PASSPHRASE  if set, viewers must enter this passphrase
//   AGENTCAST_NO_AI=1     skip the AI-generated title and summary at session end
//   AGENTCAST_DISABLE=1   do nothing

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactDeep, redactText } from "../shared/redact.mjs";

const BASE = (process.env.AGENTCAST_URL || "http://localhost:8787").replace(/\/+$/, "");
const HOME_DIR = path.join(os.homedir(), ".agentcast");
const STATE_DIR = path.join(HOME_DIR, "sessions");
const BACKOFF_FILE = path.join(HOME_DIR, "backoff.json");
const LIMITS = { text: 32_000, string: 6_000, toolResult: 10_000, batch: 150 };
const TIMEOUT_MS = 5_000;

main().catch(() => {}).finally(() => process.exit(0));

async function main() {
  if (process.env.AGENTCAST_DISABLE === "1") return;
  const payload = parse(await readStdin());
  if (!payload || !payload.session_id) return;
  const { session_id, transcript_path, cwd, hook_event_name } = payload;

  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (inBackoff()) return;

  const stateFile = path.join(STATE_DIR, `${session_id}.json`);
  let state = readJson(stateFile);
  if (state?.disabled) return;

  if (!state) {
    const project = cwd ? path.basename(cwd) : "";
    const passphrase = process.env.AGENTCAST_PASSPHRASE || undefined;
    const created = await http("POST", `${BASE}/api/sessions`, {
      agent: "claude-code",
      project,
      title: project ? `${project} session` : "Claude Code session",
      passphrase,
      ai: process.env.AGENTCAST_NO_AI !== "1",
    });
    if (created.status !== 201 || !created.body?.id) {
      if (created.status === 0 || created.status >= 500) setBackoff();
      return;
    }
    state = { id: created.body.id, token: created.body.token, url: created.body.url, offset: 0, titled: false, project };
    writeJson(stateFile, state);
    fs.writeFileSync(path.join(HOME_DIR, "last-url"), state.url + "\n");
    await postEvents(state, [{ ts: new Date().toISOString(), kind: "session_start", data: { agent: "claude-code", project, source: payload.source || hook_event_name } }], null);
    emit(`agentcast is live: ${state.url}${passphrase ? "  (passphrase protected)" : ""}`);
  }

  // Push the prompt immediately so viewers see it before the agent's first tool call.
  if (hook_event_name === "UserPromptSubmit" && typeof payload.prompt === "string" && payload.prompt.trim()) {
    const text = clip(cleanUserText(payload.prompt), LIMITS.text);
    const ev = { ts: new Date().toISOString(), kind: "user", data: redactDeep({ text }) };
    const patch = state.titled ? null : { title: titleOf(ev.data.text) };
    if (await postEvents(state, [ev], patch)) {
      state.lastPrompt = text;
      if (patch) state.titled = true;
      writeJson(stateFile, state);
    }
  }

  if (transcript_path && fs.existsSync(transcript_path)) {
    const { events, offset, patch } = tailTranscript(transcript_path, state.offset || 0, state);
    if (events.length > 0 || patch) {
      const ok = await postEvents(state, events, patch);
      if (ok) {
        state.offset = offset;
        if (patch?.title) state.titled = true;
        writeJson(stateFile, state);
      } else if (state.disabled) {
        writeJson(stateFile, state);
      } else if (state.reset) {
        fs.rmSync(stateFile, { force: true });
      }
    } else if (offset !== state.offset) {
      state.offset = offset;
      writeJson(stateFile, state);
    }
  }

  if (hook_event_name === "SessionEnd" && !state.disabled && !state.reset) {
    await postEvents(state, [{ ts: new Date().toISOString(), kind: "session_end", data: { reason: payload.reason || "end" } }], null);
    await http("POST", `${BASE}/api/sessions/${state.id}/end`, null, state.token);
    state.disabled = true;
    writeJson(stateFile, state);
  }
}

// ---------- transcript tailing ----------

function tailTranscript(file, offset, state) {
  const size = fs.statSync(file).size;
  if (size < offset) offset = 0;
  if (size === offset) return { events: [], offset, patch: null };

  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(size - offset);
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);

  let text = buf.toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  if (lastNl === -1) return { events: [], offset, patch: null };
  text = text.slice(0, lastNl + 1);
  const newOffset = offset + Buffer.byteLength(text, "utf8");

  const events = [];
  let patch = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const o = parse(line);
    if (!o || o.isSidechain || o.isMeta) continue;
    const ts = typeof o.timestamp === "string" ? o.timestamp : new Date().toISOString();

    if (o.type === "user") {
      const content = o.message?.content;
      if (typeof content === "string") {
        pushUser(events, ts, content, state);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text") {
            pushUser(events, ts, block.text || "", state);
          } else if (block?.type === "tool_result") {
            events.push({
              ts,
              kind: "tool_result",
              data: { tool_use_id: block.tool_use_id, is_error: !!block.is_error, content: clip(flatten(block.content), LIMITS.toolResult) },
            });
          }
        }
      }
    } else if (o.type === "assistant") {
      const model = o.message?.model;
      if (model && model !== state.model) {
        state.model = model;
        patch = { ...(patch || {}), model };
      }
      const content = o.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === "text" && block.text?.trim()) {
          events.push({ ts, kind: "assistant_text", data: { text: clip(block.text, LIMITS.text) } });
        } else if (block?.type === "tool_use") {
          events.push({ ts, kind: "tool_use", data: { id: block.id, name: block.name, input: clipDeep(block.input) } });
        }
        // thinking blocks are never uploaded
      }
    }
  }

  const redacted = events.map((e) => ({ ...e, data: redactDeep(e.data) }));
  if (!state.titled) {
    const first = redacted.find((e) => e.kind === "user");
    if (first) patch = { ...(patch || {}), title: titleOf(first.data.text) };
  }

  return { events: redacted, offset: newOffset, patch };
}

function pushUser(events, ts, raw, state) {
  const t = clip(cleanUserText(raw), LIMITS.text);
  if (!t) return;
  if (state.lastPrompt && t === state.lastPrompt) {
    state.lastPrompt = null; // already streamed from UserPromptSubmit
    return;
  }
  events.push({ ts, kind: "user", data: { text: t } });
}

function titleOf(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > 100 ? `${t.slice(0, 99)}…` : t;
}

function cleanUserText(s) {
  return String(s)
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
    .trim();
}

function flatten(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);
  return content.map((b) => (b?.type === "text" ? b.text : b?.type === "image" ? "[image]" : JSON.stringify(b))).join("\n");
}

function clip(s, n) {
  if (typeof s !== "string") return s;
  return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s;
}

function clipDeep(v, depth = 0) {
  if (depth > 12) return "[depth-limit]";
  if (typeof v === "string") return clip(v, LIMITS.string);
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clipDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = clipDeep(val, depth + 1);
    return out;
  }
  return v;
}

// ---------- network ----------

async function postEvents(state, events, patch) {
  const total = Math.max(events.length, patch ? 1 : 0);
  for (let i = 0; i < total; i += LIMITS.batch) {
    const body = { events: events.slice(i, i + LIMITS.batch) };
    if (i === 0 && patch) body.meta = patch;
    const res = await http("POST", `${BASE}/api/sessions/${state.id}/events`, body, state.token);
    if (res.status === 200) continue;
    if (res.status === 0) { setBackoff(); return false; }
    if (res.status === 404 || res.status === 401) { state.reset = true; return false; }
    if (res.status === 410 || res.status === 413) { state.disabled = true; return false; }
    return false;
  }
  return true;
}

async function http(method, url, body, token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const text = await r.text();
    return { status: r.status, body: parse(text) };
  } catch (err) {
    return { status: 0, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function inBackoff() {
  const b = readJson(BACKOFF_FILE);
  return b && typeof b.until === "number" && Date.now() < b.until;
}

function setBackoff(minutes = 10) {
  writeJson(BACKOFF_FILE, { until: Date.now() + minutes * 60_000, base: BASE });
}

// ---------- io ----------

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    const timer = setTimeout(() => resolve(data), 3_000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => { clearTimeout(timer); resolve(data); });
    process.stdin.on("error", () => resolve(data));
  });
}

function emit(message) {
  // Claude Code shows systemMessage to the user for any hook event.
  process.stdout.write(JSON.stringify({ systemMessage: redactText(message) }) + "\n");
}

function parse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJson(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
