#!/usr/bin/env node
// agentcast CLI, used by the plugin's slash commands and usable directly.
//   node agentcast.mjs link                show the share link for the current session
//   node agentcast.mjs status              server, session, streaming state
//   node agentcast.mjs title <new title>   rename the session (locks the title against AI renaming)
//   node agentcast.mjs pause | resume      stop/start uploading events for this session
//   node agentcast.mjs end                 end the stream now (triggers the AI summary)
//   node agentcast.mjs keep | unkeep       keep this link forever, or restore its expiry
//   node agentcast.mjs delete --yes        delete the session from the server immediately
//   node agentcast.mjs list [--hours 24] [--all] [--titles]
//                                          links this machine created recently (newest first)
//   node agentcast.mjs setup               check Node, server reachability and configuration
// Options: --session <claude-session-id>  (default: the most recent session the hook saw)

import fs from "node:fs";
import path from "node:path";
import { HOME_DIR, STATE_DIR, endSession, http, readJson, resolveConfig, writeJson } from "./agentcast-hook.mjs";

const args = process.argv.slice(2);
const cmd = args[0] || "status";
const sessionIdx = args.indexOf("--session");
const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : null;
const rest = args.slice(1).filter((a, i, all) => a !== "--session" && all[i - 1] !== "--session");
const cfg = resolveConfig();

main().catch((err) => { console.log(`agentcast: ${err.message}`); process.exit(0); });

async function main() {
  switch (cmd) {
    case "link": return link();
    case "status": return status();
    case "title": return title(rest.join(" ").trim());
    case "pause": return setPaused(true);
    case "resume": return setPaused(false);
    case "end": return end();
    case "keep": return keep(true);
    case "unkeep": return keep(false);
    case "delete": return del();
    case "list": return list();
    case "setup": return setup();
    default: console.log(`Unknown command "${cmd}". Use link, status, title, pause, resume, end, keep, unkeep, delete, list or setup.`);
  }
}

function current() {
  const id = sessionId || readText(path.join(HOME_DIR, "current"));
  if (!id) return { id: null, state: null, file: null };
  const file = path.join(STATE_DIR, `${id}.json`);
  return { id, state: readJson(file), file };
}

function link() {
  const { state } = current();
  if (!state) return console.log("No agentcast session yet. Streaming starts when a new Claude Code session begins. Run `agentcast setup` to check configuration.");
  console.log(`${state.url}${state.protected ? "  (passphrase protected)" : ""}`);
  if (state.disabled) console.log("This session has ended; the link stays available for 24 hours after it started.");
  else if (state.paused) console.log("Streaming is paused. Use `agentcast resume` to continue.");
}

async function status() {
  const { id, state } = current();
  console.log(`server:   ${cfg.serverUrl}`);
  console.log(`enabled:  ${cfg.enabled}   passphrase: ${cfg.passphrase ? "set" : "none"}   ai summary: ${cfg.aiSummary}`);
  if (!state) return console.log("session:  none yet");
  console.log(`session:  ${id}`);
  console.log(`link:     ${state.url}`);
  console.log(`state:    ${state.disabled ? "ended" : state.paused ? "paused" : "streaming"}   transcript bytes uploaded: ${state.offset || 0}`);
  const meta = await http("GET", `${cfg.serverUrl}/api/sessions/${state.id}/meta`, null, null);
  if (meta.status === 200 && meta.body?.meta?.title) {
    console.log(`title:    ${meta.body.meta.title}`);
    console.log(`events:   ${meta.body.meta.eventCount ?? "?"}   expires: ${meta.body.meta.kept ? "never (kept)" : meta.body.meta.expiresAt ?? "?"}`);
  }
}

async function title(newTitle) {
  if (!newTitle) return console.log("Usage: agentcast title <new title>");
  const { state } = current();
  if (!state) return console.log("No agentcast session to rename yet.");
  if (state.disabled) return console.log("This session has ended and can no longer be renamed.");
  const res = await http("PATCH", `${cfg.serverUrl}/api/sessions/${state.id}`, { title: newTitle }, state.token);
  if (res.status === 200) console.log(`Renamed to: ${res.body?.title ?? newTitle}\n${state.url}`);
  else console.log(`Rename failed (${res.status}): ${res.body?.error ?? res.error ?? "unknown error"}`);
}

function setPaused(paused) {
  const { state, file } = current();
  if (!state) return console.log("No agentcast session yet.");
  if (state.disabled) return console.log("This session has already ended.");
  state.paused = paused;
  writeJson(file, state);
  console.log(paused ? `Paused. Nothing from this session is uploaded until you run \`agentcast resume\`. Viewers keep ${state.url}` : `Resumed. New events stream to ${state.url}`);
}

async function end() {
  const { state, file } = current();
  if (!state) return console.log("No agentcast session yet.");
  if (state.disabled) return console.log("This session has already ended.");
  await endSession(cfg, state, file, "manual");
  console.log(`Ended. The replay stays at ${state.url} until it expires.`);
}

async function keep(kept) {
  const { state } = current();
  if (!state) return console.log("No agentcast session yet.");
  const res = await http("POST", `${cfg.serverUrl}/api/sessions/${state.id}/keep`, { kept }, state.token);
  if (res.status !== 200) return console.log(`Could not update (${res.status}): ${res.body?.error ?? res.error ?? "unknown error"}`);
  if (kept) console.log(`Kept. ${state.url} will not expire. Use \`agentcast unkeep\` to restore an expiry, or \`agentcast delete --yes\` to remove it.`);
  else console.log(`Expiry restored. ${state.url} now expires ${res.body?.expiresAt ?? "later"}.`);
}

async function del() {
  const { state, file } = current();
  if (!state) return console.log("No agentcast session yet.");
  if (!rest.includes("--yes")) return console.log(`This permanently deletes ${state.url} and everything in it for every viewer. Re-run with --yes to confirm.`);
  const res = await http("DELETE", `${cfg.serverUrl}/api/sessions/${state.id}`, null, state.token);
  if (res.status === 200 || res.status === 404) {
    state.disabled = true; state.endReason = "manual"; state.deleted = true;
    writeJson(file, state);
    console.log(`Deleted. ${state.url} is gone. Streaming for this Claude session is off; a new session will get a new link.`);
  } else console.log(`Delete failed (${res.status}): ${res.body?.error ?? res.error ?? "unknown error"}`);
}

async function list() {
  const hoursIdx = rest.indexOf("--hours");
  const hours = rest.includes("--all") ? Infinity : hoursIdx >= 0 ? Number(rest[hoursIdx + 1]) || 24 : 24;
  const withTitles = rest.includes("--titles");
  const since = Date.now() - hours * 3_600_000;
  let files = [];
  try { files = fs.readdirSync(STATE_DIR).filter((f) => f.endsWith(".json")); } catch { return console.log("No agentcast sessions on this machine yet."); }
  const rows = [];
  for (const f of files) {
    const file = path.join(STATE_DIR, f);
    const st = readJson(file);
    if (!st?.id) continue;
    const created = Date.parse(st.createdAt || "") || fs.statSync(file).mtimeMs;
    if (created < since) continue;
    rows.push({ st, created, session: f.replace(/\.json$/, "") });
  }
  rows.sort((a, b) => b.created - a.created);
  if (rows.length === 0) return console.log(hours === Infinity ? "No agentcast sessions on this machine." : `No agentcast links created in the last ${hours} hours. Try --hours 168 or --all.`);
  for (const r of rows) {
    const { st } = r;
    let state = st.deleted ? "deleted" : st.disabled ? "ended" : st.paused ? "paused" : "streaming";
    let extra = "";
    if (withTitles && !st.deleted) {
      const meta = await http("GET", `${st.server || cfg.serverUrl}/api/sessions/${st.id}/meta`, null, null);
      if (meta.status === 404) state = "gone";
      else if (meta.body?.meta) {
        const m = meta.body.meta;
        extra = m.title ? `  "${m.title}"` : "";
        if (m.kept) extra += "  [kept]";
        else if (m.expiresAt && Date.parse(m.expiresAt) < Date.now()) state = "expiring";
      }
    }
    const when = new Date(r.created).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const flags = [st.protected ? "lock" : "", st.continues ? "cont." : ""].filter(Boolean).join(",");
    console.log(`${when}  ${state.padEnd(9)}  ${(st.project || "").padEnd(14).slice(0, 14)}  ${st.url}${flags ? `  (${flags})` : ""}${extra}`);
  }
  console.log(`\n${rows.length} link${rows.length === 1 ? "" : "s"}${hours === Infinity ? "" : ` in the last ${hours} hours`}. Add --titles to fetch titles and keep/expiry state from the server.`);
}

async function setup() {
  const [major] = process.versions.node.split(".").map(Number);
  console.log(`node:       v${process.versions.node} ${major >= 18 ? "ok" : "too old, need 18+"}`);
  console.log(`server:     ${cfg.serverUrl}`);
  const ping = await http("GET", `${cfg.serverUrl}/`, null, null);
  console.log(`reachable:  ${ping.status === 200 ? "yes" : `no (${ping.status || ping.error})`}`);
  console.log(`enabled:    ${cfg.enabled}`);
  console.log(`passphrase: ${cfg.passphrase ? "set (viewers must enter it)" : "none (anyone with the link can view)"}`);
  console.log(`ai summary: ${cfg.aiSummary ? "on" : "off"}`);
  console.log(`retention:  ${cfg.retention.keep ? "forever" : cfg.retention.ttlHours ? `${cfg.retention.ttlHours} hours` : "server default (24 hours)"}`);
  console.log(`state dir:  ${HOME_DIR}`);
  console.log("shared:     prompts, replies, tool calls and results. Never shared: thinking, subagent chatter, full paths. Secrets are redacted before upload.");
  const { state } = current();
  if (state) console.log(`current:    ${state.url}`);
}

function readText(file) {
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return null; }
}
