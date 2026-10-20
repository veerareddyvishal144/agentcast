export type Meta = {
  id: string;
  title: string;
  summary: string | null;
  agent: string;
  project: string;
  model: string | null;
  protected: boolean;
  ai: boolean;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  expiresAt: string;
  eventCount: number;
};

export type PublicMeta = Pick<Meta, "id" | "protected" | "createdAt" | "expiresAt" | "endedAt">;

export type EventKind = "session_start" | "user" | "assistant_text" | "tool_use" | "tool_result" | "session_end" | "notice";

export type StoredEvent = {
  seq: number;
  ts: string;
  kind: EventKind;
  // Shape depends on kind; components narrow it with the helpers in tools.ts.
  data: Record<string, unknown>;
};

export type Status = "connecting" | "reconnecting" | "live" | "ended" | "expired" | "locked" | "gone";

export type ServerMessage =
  | { type: "auth_required" }
  | { type: "auth_failed" }
  | { type: "meta"; meta: Meta }
  | { type: "events"; events: StoredEvent[] }
  | { type: "event"; event: StoredEvent }
  | { type: "viewers"; n: number }
  | { type: "ready" }
  | { type: "expired" };
