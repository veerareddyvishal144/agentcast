import {
  Bot,
  FilePen,
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  Link2,
  ListChecks,
  Search,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function toolIcon(name: string): LucideIcon {
  switch (name) {
    case "Bash": return Terminal;
    case "Read": return FileText;
    case "Edit": case "MultiEdit": case "NotebookEdit": return FilePen;
    case "Write": return FilePlus;
    case "Grep": return Search;
    case "Glob": return FolderSearch;
    case "WebSearch": return Globe;
    case "WebFetch": return Link2;
    case "Agent": case "Task": return Bot;
    case "Skill": return Sparkles;
    case "TodoWrite": return ListChecks;
    default: return Wrench;
  }
}

export function toolSummary(name: string, input: unknown): string {
  if (!isRecord(input)) return "";
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
  switch (name) {
    case "Bash": return s("description") || s("command");
    case "Read": case "Edit": case "Write": case "MultiEdit": return s("file_path");
    case "NotebookEdit": return s("notebook_path");
    case "Grep": return `${s("pattern")}${s("path") ? ` in ${s("path")}` : ""}`;
    case "Glob": return s("pattern");
    case "WebSearch": return s("query");
    case "WebFetch": return s("url");
    case "Agent": case "Task": return s("description");
    case "Skill": return s("skill");
    case "TodoWrite": return Array.isArray(input.todos) ? `${input.todos.length} todos` : "";
    default: {
      const first = Object.values(input).find((v) => typeof v === "string");
      return typeof first === "string" ? first : "";
    }
  }
}

/** Shorten a file path to its last two segments for compact display. */
export function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}
