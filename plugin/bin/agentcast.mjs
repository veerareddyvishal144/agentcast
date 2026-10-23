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
//   node agentcast.mjs restore --session <claude-session-id> | --link <agentcast-id-or-url> [--keep]
//                                          re-publish an expired/deleted session from the local Claude Code transcript (new link)
//   node agentcast.mjs deploy [--name agentcast]
//                                          set up or upgrade YOUR agentcast server in your own Cloudflare account
//   node agentcast.mjs undeploy [--name agentcast] [--delete-data]
//                                          remove it again
//   node agentcast.mjs setup               check Node, server reachability and configuration
// Options: --session <claude-session-id>  (default: the most recent session the hook saw)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOME_DIR, PLUGIN_VERSION, STATE_DIR, endSession, http, readJson, resolveConfig, writeJson } from "./agentcast-hook.mjs";
import { randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const cmd = args[0] || "status";
const sessionIdx = args.indexOf("--session");
const sessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : null;
const rest = args.slice(1).filter((a, i, all) => a !== "--session" && all[i - 1] !== "--session");
const cfg = resolveConfig();
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "server");
const SETTINGS_FILE = path.join(os.homedir(), ".claude", "settings.json");

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
    case "restore": return restore();
    case "deploy": return deploy();
    case "undeploy": return undeploy();
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
  if (!state || state.deleted) return console.log("No agentcast session yet. Streaming starts when a new Claude Code session begins. Run `agentcast setup` to check configuration.");
  console.log(`${state.url}${state.protected ? "  (passphrase protected)" : ""}`);
  if (state.disabled) console.log("This session has ended; the link stays available for 24 hours after it started.");
  else if (state.paused) console.log("Streaming is paused. Use `agentcast resume` to continue.");
}

async function status() {
  const { id, state } = current();
  console.log(`server:   ${cfg.serverUrl || "none configured (run /agentcast:deploy)"}`);
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

async function restore() {
  // Resolve which Claude session to re-publish.
  let sid = sessionId;
  const linkIdx = rest.indexOf("--link");
  if (!sid && linkIdx >= 0) {
    const ref = String(rest[linkIdx + 1] || "").split("/").pop().split("?")[0];
    const match = fs.readdirSync(STATE_DIR).find((f) => f.endsWith(".json") && readJson(path.join(STATE_DIR, f))?.id === ref);
    if (!match) return console.log(`No local record of an agentcast link "${ref}". Only sessions created on this machine can be restored.`);
    sid = match.replace(/\.json$/, "");
  }
  if (!sid) return console.log("Usage: agentcast restore --session <claude-session-id> | --link <agentcast-id-or-url> [--keep]");

  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  let transcript = null;
  try {
    for (const dir of fs.readdirSync(projectsDir)) {
      const candidate = path.join(projectsDir, dir, `${sid}.jsonl`);
      if (fs.existsSync(candidate)) { transcript = candidate; break; }
    }
  } catch {}
  if (!transcript) return console.log(`No Claude Code transcript found for session ${sid} under ${projectsDir}.`);

  const stateFile = path.join(STATE_DIR, `${sid}.json`);
  const old = readJson(stateFile);
  const project = old?.project || "restored";
  if (old) fs.renameSync(stateFile, `${stateFile}.replaced-${Date.now()}`);

  const hookPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "agentcast-hook.mjs");
  const env = { ...process.env };
  if (rest.includes("--keep")) env.AGENTCAST_RETENTION = "forever";
  const run = (payload) => spawnSync(process.execPath, [hookPath], { input: JSON.stringify(payload), env, encoding: "utf8", timeout: 120_000 });
  const base = { session_id: sid, transcript_path: transcript, cwd: `/${project}` };
  const start = run({ ...base, hook_event_name: "SessionStart", source: "startup" });
  run({ ...base, hook_event_name: "SessionEnd", reason: "restore" });

  const fresh = readJson(stateFile);
  if (!fresh?.url) {
    if (old) fs.renameSync(`${stateFile}.replaced-${Date.now()}`.replace(/\d+$/, ""), stateFile); // best effort; fine if it fails
    return console.log(`Restore failed. Hook output: ${(start.stdout || start.stderr || "").trim().slice(0, 300)}`);
  }
  const size = fs.statSync(transcript).size;
  console.log(`Restored from ${path.basename(transcript)} (${Math.round(size / 1024)} KB of transcript).`);
  console.log(`New link: ${fresh.url}${rest.includes("--keep") ? "  (kept permanently)" : ""}`);
  if (old?.url) console.log(`The old link ${old.url} stays gone; its id cannot be reused.`);
  console.log("The title and summary will appear once the AI pass finishes, usually within a few seconds.");
}

// ---------- self-hosting ----------

function wrangler(args, { interactive = false, input, timeout = 240_000 } = {}) {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  if (!interactive) env.CI = "true";
  const r = spawnSync("npx", ["-y", "wrangler@4", ...args], { cwd: SERVER_DIR, encoding: "utf8", env, input, stdio: interactive ? "inherit" : "pipe", timeout });
  return { status: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

function readSettings() { return readJson(SETTINGS_FILE) || {}; }
function pluginConfig() { return readSettings().pluginConfigs?.agentcast || {}; }
function writePluginConfig(patch) {
  const settings = readSettings();
  settings.pluginConfigs ||= {};
  settings.pluginConfigs.agentcast = { ...(settings.pluginConfigs.agentcast || {}), ...patch };
  for (const k of Object.keys(settings.pluginConfigs.agentcast)) if (settings.pluginConfigs.agentcast[k] === undefined) delete settings.pluginConfigs.agentcast[k];
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

function loadServerConfig() {
  const raw = fs.readFileSync(path.join(SERVER_DIR, "wrangler.jsonc"), "utf8");
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")); }
}

function syncDist() {
  for (const [src, rel] of [["bin/agentcast-hook.mjs", "hook/agentcast-hook.mjs"], ["bin/install.mjs", "hook/install.mjs"], ["shared/redact.mjs", "shared/redact.mjs"]]) {
    const dest = path.join(SERVER_DIR, "public", "dist", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SERVER_DIR, "..", src), dest);
  }
}

async function deploy() {
  const nameIdx = rest.indexOf("--name");
  const name = (nameIdx >= 0 && rest[nameIdx + 1]) || "agentcast";
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 18) return console.log(`Node ${process.versions.node} is too old; agentcast needs Node 18 or newer.`);
  if (!fs.existsSync(path.join(SERVER_DIR, "public", "viewer.html"))) return console.log(`The plugin is missing its server build (${SERVER_DIR}/public). Reinstall or update the plugin.`);

  console.log(`agentcast ${PLUGIN_VERSION}: deploying "${name}" to your Cloudflare account. First run downloads wrangler, so give it a minute.`);

  // 1. Login
  let who = wrangler(["whoami"]);
  if (!/logged in/i.test(who.out)) {
    console.log("Not logged in to Cloudflare. A browser window will open; finish the login there (a free account is enough).");
    wrangler(["login"], { interactive: true, timeout: 600_000 });
    who = wrangler(["whoami"]);
    if (!/logged in/i.test(who.out)) return console.log("Cloudflare login did not complete. Run `npx wrangler login` yourself, then re-run deploy.");
  }
  const email = /email ([^\s]+@[^\s.]+(?:\.[^\s.]+)+)/i.exec(who.out)?.[1];
  console.log(`Logged in${email ? ` as ${email}` : ""}.`);

  // 2. Provision optional resources; each one that fails is simply left out of the deploy.
  const features = { vectorize: false, archive: false };
  if (wrangler(["vectorize", "get", "agentcast-sessions"]).status === 0) features.vectorize = true;
  else {
    const vx = wrangler(["vectorize", "create", "agentcast-sessions", "--dimensions=384", "--metric=cosine"]);
    features.vectorize = vx.status === 0 || /duplicate|already exists/i.test(vx.out);
  }
  console.log(features.vectorize ? "Search index: ready (Vectorize)." : "Search index: unavailable on this account; questions will use keyword search only.");
  const r2 = wrangler(["r2", "bucket", "create", "agentcast-archive"]);
  features.archive = r2.status === 0 || /duplicate|already exists|already own/i.test(r2.out);
  console.log(features.archive ? "Archive bucket: ready (R2)." : "Archive bucket: unavailable (R2 may need to be enabled in the dashboard); kept sessions will stay in Durable Object storage.");

  // 3. Generated config = committed config minus whatever this account cannot have.
  const cfg0 = loadServerConfig();
  cfg0.name = name;
  delete cfg0.$schema;
  if (!features.vectorize) delete cfg0.vectorize;
  if (!features.archive) delete cfg0.r2_buckets;
  const genPath = path.join(SERVER_DIR, "wrangler.generated.jsonc");
  const writeGen = () => fs.writeFileSync(genPath, JSON.stringify(cfg0, null, 2));
  writeGen();
  syncDist();

  // 4. Deploy, dropping bindings the account rejects.
  let dep;
  for (let attempt = 0; attempt < 4; attempt++) {
    dep = wrangler(["deploy", "-c", "wrangler.generated.jsonc"], { timeout: 300_000 });
    if (dep.status === 0) break;
    const o = dep.out.toLowerCase();
    if (cfg0.ratelimits && /ratelimit|rate limit/.test(o)) { delete cfg0.ratelimits; console.log("Rate limiting binding not available; continuing without it."); }
    else if (cfg0.ai && /workers ai|\bai\b.*binding|binding.*\bai\b/.test(o)) { delete cfg0.ai; console.log("Workers AI not available; continuing without summaries and questions."); }
    else if (cfg0.vectorize && /vectorize/.test(o)) { delete cfg0.vectorize; console.log("Vectorize rejected; continuing without semantic search."); }
    else if (cfg0.r2_buckets && /\br2\b|bucket/.test(o)) { delete cfg0.r2_buckets; console.log("R2 rejected; continuing without archival."); }
    else break;
    writeGen();
  }
  if (!dep || dep.status !== 0) {
    console.log("Deploy failed. wrangler said:\n" + dep?.out.trim().split("\n").slice(-25).join("\n"));
    return;
  }
  const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(dep.out)?.[0];
  if (!url) {
    console.log("Deployed, but no workers.dev address was reported. Enable a workers.dev subdomain in the Cloudflare dashboard (Workers & Pages → Overview → your subdomain), then re-run `/agentcast:deploy`.");
    return;
  }

  // 5. Create token: reuse the one in plugin settings so upgrades do not invalidate hooks.
  const existing = pluginConfig().create_token;
  const token = existing || randomBytes(24).toString("hex");
  const sec = wrangler(["secret", "put", "CREATE_TOKEN", "-c", "wrangler.generated.jsonc"], { input: token + "\n" });
  const tokenOk = sec.status === 0;
  if (!tokenOk) console.log("Warning: could not store the create token as a secret; the server will accept session creation from anyone until you set CREATE_TOKEN.");

  // 6. Point the plugin at the new server.
  writePluginConfig({ server_url: url, ...(tokenOk ? { create_token: token } : {}) });

  // 7. Verify, waiting briefly for the secret to propagate.
  let ver = await http("GET", `${url}/api/version`, null, null);
  for (let i = 0; i < 10 && tokenOk && ver.body && !ver.body.requiresCreateToken; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    ver = await http("GET", `${url}/api/version`, null, null);
  }
  console.log("");
  console.log(`Done. Your agentcast server is ${url}`);
  console.log(`  version ${ver.body?.version ?? "?"} · search ${ver.body?.features?.search ? "on" : "off"} · archive ${ver.body?.features?.archive ? "on" : "off"} · AI ${ver.body?.features?.ai ? "on" : "off"} · create token ${ver.body?.requiresCreateToken ? "required" : "NOT set"}`);
  console.log(`  plugin settings updated (server_url${tokenOk ? ", create_token" : ""}) in ${SETTINGS_FILE}`);
  console.log("Start a new Claude Code session and the share link will appear. Re-run deploy any time to upgrade; data is kept.");
  if (tokenOk) console.log(`If you also use the curl-installed hook: curl -fsSL ${url}/install.sh | sh -s -- --url ${url} --token <create token from your plugin settings>`);
}

async function undeploy() {
  const nameIdx = rest.indexOf("--name");
  const name = (nameIdx >= 0 && rest[nameIdx + 1]) || "agentcast";
  const genPath = path.join(SERVER_DIR, "wrangler.generated.jsonc");
  if (!fs.existsSync(genPath)) { const c = loadServerConfig(); c.name = name; delete c.$schema; fs.writeFileSync(genPath, JSON.stringify(c, null, 2)); }
  const del = wrangler(["delete", "-c", "wrangler.generated.jsonc", "--name", name, "--force"], { timeout: 180_000 });
  console.log(del.status === 0 ? `Worker "${name}" deleted.` : `Could not delete Worker "${name}":\n${del.out.trim().split("\n").slice(-6).join("\n")}`);
  if (rest.includes("--delete-data")) {
    const vx = wrangler(["vectorize", "delete", "agentcast-sessions", "--force"]);
    console.log(vx.status === 0 ? "Search index deleted." : "Search index not deleted (it may not exist).");
    const r2 = wrangler(["r2", "bucket", "delete", "agentcast-archive"]);
    console.log(r2.status === 0 ? "Archive bucket deleted." : "Archive bucket not deleted: empty it in the dashboard first (Cloudflare refuses to delete non-empty buckets), then re-run.");
  } else {
    console.log("Kept the search index and archive bucket. Add --delete-data to remove them too.");
  }
  const cfg = pluginConfig();
  if (cfg.server_url) { writePluginConfig({ server_url: undefined, create_token: undefined }); console.log("Plugin settings cleared; nothing will stream until you deploy again."); }
}

async function setup() {
  const [major] = process.versions.node.split(".").map(Number);
  console.log(`plugin:     ${PLUGIN_VERSION}   node v${process.versions.node} ${major >= 18 ? "ok" : "too old, need 18+"}`);
  if (!cfg.serverUrl) {
    console.log("server:     none configured. Run /agentcast:deploy to create one in your own Cloudflare account (free). Nothing streams until then.");
    return;
  }
  console.log(`server:     ${cfg.serverUrl}`);
  const ver = await http("GET", `${cfg.serverUrl}/api/version`, null, null);
  console.log(`reachable:  ${ver.status === 200 ? `yes, server version ${ver.body?.version ?? "?"}` : `no (${ver.status || ver.error})`}`);
  if (ver.status === 200) {
    console.log(`features:   search ${ver.body?.features?.search ? "on" : "off"} · archive ${ver.body?.features?.archive ? "on" : "off"} · AI ${ver.body?.features?.ai ? "on" : "off"}`);
    console.log(`token:      server ${ver.body?.requiresCreateToken ? "requires" : "does not require"} a create token; plugin has ${cfg.createToken ? "one" : "none"}${ver.body?.requiresCreateToken && !cfg.createToken ? "  <- sessions will be refused; re-run /agentcast:deploy" : ""}`);
    if (ver.body?.version && ver.body.version !== "dev" && ver.body.version !== PLUGIN_VERSION) console.log(`note:       server ${ver.body.version} differs from plugin ${PLUGIN_VERSION}; run /agentcast:deploy to upgrade the server`);
  }
  console.log(`enabled:    ${cfg.enabled}`);
  console.log(`passphrase: ${cfg.passphrase ? "set (viewers must enter it)" : "none (anyone with the link can view)"}`);
  console.log(`ai summary: ${cfg.aiSummary ? "on" : "off"}`);
  console.log(`retention:  ${cfg.retention.keep ? "forever" : cfg.retention.ttlHours ? `${cfg.retention.ttlHours} hours` : "server default (24 hours)"}`);
  console.log(`state dir:  ${HOME_DIR}`);
  console.log("shared:     prompts, replies, tool calls and results. Never shared: thinking, subagent chatter, full paths. Secrets are redacted before upload.");
  const { state } = current();
  if (state && !state.deleted) console.log(`current:    ${state.url}${state.disabled ? " (ended)" : ""}`);
}

function readText(file) {
  try { return fs.readFileSync(file, "utf8").trim(); } catch { return null; }
}
