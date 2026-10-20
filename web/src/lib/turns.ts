import type { StoredEvent } from "./types";

export type ToolItem = { kind: "tool"; ev: StoredEvent; result: StoredEvent | null; durationMs: number | null };
export type TextItem = { kind: "text"; ev: StoredEvent };
export type NoticeItem = { kind: "notice"; ev: StoredEvent };
export type Item = ToolItem | TextItem | NoticeItem;
export type Turn = { key: string; user: StoredEvent | null; items: Item[] };

/** Groups a flat event list into conversational turns: one user prompt followed by the agent's text and tool calls. */
export function buildTurns(events: StoredEvent[], results: Map<string, StoredEvent>) {
  const turns: Turn[] = [];
  let start: StoredEvent | null = null;
  let end: StoredEvent | null = null;
  let current: Turn | null = null;
  const open = (user: StoredEvent | null, seq: number) => {
    current = { key: `t${seq}`, user, items: [] };
    turns.push(current);
    return current;
  };
  for (const ev of events) {
    switch (ev.kind) {
      case "session_start": start = ev; break;
      case "session_end": end = ev; break;
      case "user": open(ev, ev.seq); break;
      case "assistant_text": (current ?? open(null, ev.seq)).items.push({ kind: "text", ev }); break;
      case "notice": (current ?? open(null, ev.seq)).items.push({ kind: "notice", ev }); break;
      case "tool_use": {
        const result = results.get(String(ev.data.id)) ?? null;
        const durationMs = result ? Math.max(0, Date.parse(result.ts) - Date.parse(ev.ts)) : null;
        (current ?? open(null, ev.seq)).items.push({ kind: "tool", ev, result, durationMs });
        break;
      }
      case "tool_result": break;
    }
  }
  return { turns, start, end };
}

/** Consecutive tool items render as one grouped list; this chunks a turn's items accordingly. */
export function chunkItems(items: Item[]): Array<{ kind: "tools"; tools: ToolItem[] } | TextItem | NoticeItem> {
  const out: Array<{ kind: "tools"; tools: ToolItem[] } | TextItem | NoticeItem> = [];
  for (const it of items) {
    if (it.kind === "tool") {
      const last = out[out.length - 1];
      if (last && last.kind === "tools") last.tools.push(it);
      else out.push({ kind: "tools", tools: [it] });
    } else out.push(it);
  }
  return out;
}

export function sessionStats(events: StoredEvent[]) {
  let turns = 0, tools = 0, errors = 0;
  for (const e of events) {
    if (e.kind === "user") turns++;
    else if (e.kind === "tool_use") tools++;
    else if (e.kind === "tool_result" && e.data.is_error) errors++;
  }
  return { turns, tools, errors };
}
