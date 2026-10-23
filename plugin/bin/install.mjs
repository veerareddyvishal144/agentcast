#!/usr/bin/env node
// Adds (or removes) the agentcast hook in Claude Code settings.
//   node hook/install.mjs --url https://agentcast.example.workers.dev            # all projects (~/.claude/settings.json)
//   node hook/install.mjs --url https://... --project ~/some/repo               # one project (<repo>/.claude/settings.json)
//   node hook/install.mjs --uninstall [--project ~/some/repo]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const urlIdx = args.indexOf("--url");
const url = urlIdx >= 0 ? args[urlIdx + 1] : null;
const tokenIdx = args.indexOf("--token");
const token = tokenIdx >= 0 ? args[tokenIdx + 1] : null;
if (!uninstall && !url) { console.log("Usage: node install.mjs --url https://agentcast.<you>.workers.dev [--token <create token>] [--project <dir>]"); process.exit(1); }
const projIdx = args.indexOf("--project");
const settingsFile = projIdx >= 0
  ? path.join(path.resolve(args[projIdx + 1]), ".claude", "settings.json")
  : path.join(os.homedir(), ".claude", "settings.json");
const hookPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "agentcast-hook.mjs");
const command = `AGENTCAST_URL=${url}${token ? ` AGENTCAST_CREATE_TOKEN=${token}` : ""} node ${JSON.stringify(hookPath)}`;
const EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"];

let settings = {};
if (fs.existsSync(settingsFile)) {
  settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  fs.copyFileSync(settingsFile, `${settingsFile}.agentcast-backup`);
}
settings.hooks ||= {};

for (const ev of EVENTS) {
  const groups = Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : [];
  const kept = groups.filter((g) => !(g.hooks || []).some((h) => String(h.command || "").includes("agentcast-hook")));
  if (!uninstall) kept.push({ hooks: [{ type: "command", command, timeout: 10 }] });
  if (kept.length) settings.hooks[ev] = kept; else delete settings.hooks[ev];
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
console.log(uninstall ? "agentcast hook removed from" : `agentcast hook installed (server ${url}) in`, settingsFile);
if (!uninstall) console.log("Start a new Claude Code session; the share link appears as a system message.");
