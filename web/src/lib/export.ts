import { dateTime, duration, time } from "./format";
import { isRecord, str, toolSummary } from "./tools";
import type { Meta, StoredEvent } from "./types";

/** Fence that cannot be broken by backticks inside the content. */
function fence(code: string, lang = ""): string {
  const longest = (code.match(/`{3,}/g) ?? []).reduce((m, s) => Math.max(m, s.length), 2);
  const f = "`".repeat(longest + 1);
  return `${f}${lang}\n${code.replace(/\n$/, "")}\n${f}`;
}

export function sessionMarkdown(meta: Meta, events: StoredEvent[], results: Map<string, StoredEvent>, url: string, clipped: boolean): string {
  const out: string[] = [];
  out.push(`# ${meta.title}${clipped ? " (clip)" : ""}`, "");
  if (meta.summary) out.push(`> ${meta.summary}`, "");
  out.push("| | |", "|---|---|");
  out.push(`| Agent | ${meta.agent} |`);
  if (meta.project) out.push(`| Project | ${meta.project} |`);
  if (meta.model) out.push(`| Model | ${meta.model} |`);
  out.push(`| Started | ${dateTime(meta.createdAt)} |`);
  if (meta.endedAt) out.push(`| Duration | ${duration(meta.createdAt, meta.endedAt)} |`);
  if (meta.kept) out.push(`| Retention | kept permanently |`);
  out.push(`| Events | ${events.filter((e) => e.kind !== "tool_result").length} |`);
  out.push(`| Link | ${url} |`, "", "---", "");

  for (const ev of events) {
    switch (ev.kind) {
      case "session_start":
        out.push(`*Session started${ev.data.project ? ` in ${String(ev.data.project)}` : ""} · ${time(ev.ts)}*`, "");
        break;
      case "session_end":
        out.push(`*Session ended · ${time(ev.ts)}*`, "");
        break;
      case "notice":
        out.push(`*${String(ev.data.text ?? "")}*`, "");
        break;
      case "user":
        out.push(`### You · ${time(ev.ts)}`, "", String(ev.data.text ?? ""), "");
        break;
      case "assistant_text":
        out.push(`### ${meta.agent} · ${time(ev.ts)}`, "", String(ev.data.text ?? ""), "");
        break;
      case "tool_use": {
        const name = String(ev.data.name ?? "tool");
        const input = ev.data.input;
        const res = results.get(String(ev.data.id));
        const status = res ? (res.data.is_error ? "failed" : "ok") : "no result";
        const summary = toolSummary(name, input);
        out.push(`#### ${name}${summary ? ` · ${summary}` : ""} · ${status} · ${time(ev.ts)}`, "");
        out.push(toolInputMarkdown(name, input), "");
        if (res) {
          const content = str(res.data.content) || "(empty)";
          out.push("<details><summary>Result</summary>", "", fence(content), "", "</details>", "");
        }
        break;
      }
      case "tool_result":
        break;
    }
  }
  out.push("---", "", `Exported from agentcast · ${url}`);
  return out.join("\n");
}

function toolInputMarkdown(name: string, input: unknown): string {
  if (!isRecord(input)) return fence(str(input));
  if (name === "Bash" && typeof input.command === "string") return fence(`$ ${input.command}`, "sh");
  if (name === "Edit" && (input.old_string != null || input.new_string != null)) {
    const file = String(input.file_path ?? "");
    const del = str(input.old_string).split("\n").map((l) => `- ${l}`);
    const add = str(input.new_string).split("\n").map((l) => `+ ${l}`);
    return fence([`--- ${file}`, `+++ ${file}`, ...del, ...add].join("\n"), "diff");
  }
  if (name === "Write" && input.content != null) return `\`${String(input.file_path ?? "")}\`\n\n${fence(str(input.content))}`;
  return fence(str(input), "json");
}

export function sessionJson(meta: Meta, events: StoredEvent[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), meta, events }, null, 2);
}

export function exportFilename(meta: Meta, ext: string, clipped: boolean): string {
  const slug = (meta.title || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "session";
  return `agentcast-${slug}${clipped ? "-clip" : ""}-${meta.id}.${ext}`;
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
