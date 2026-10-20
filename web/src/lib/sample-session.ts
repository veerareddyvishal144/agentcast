import type { Meta, StoredEvent } from "./types";

// A small, realistic session used by the landing page demo player.
const t0 = Date.parse("2026-10-20T14:02:10Z");
const at = (s: number) => new Date(t0 + s * 1000).toISOString();

export const sampleMeta: Meta = {
  id: "demo",
  title: "Fix flaky login test and harden password check",
  summary: "Found an assignment used as a comparison in the auth path, fixed it, and confirmed the login suite passes.",
  agent: "claude-code",
  project: "acme-api",
  model: "claude-fable-5-1",
  protected: false,
  ai: true,
  createdAt: at(0),
  updatedAt: at(61),
  endedAt: null,
  expiresAt: new Date(t0 + 86400_000).toISOString(),
  eventCount: 12,
};

export const sampleEvents: StoredEvent[] = [
  { seq: 1, ts: at(0), kind: "session_start", data: { agent: "claude-code", project: "acme-api" } },
  { seq: 2, ts: at(1), kind: "user", data: { text: "The login test is flaky on CI. Find out why and fix it." } },
  { seq: 3, ts: at(4), kind: "assistant_text", data: { text: "I'll run the suite first to see the failure." } },
  { seq: 4, ts: at(5), kind: "tool_use", data: { id: "t1", name: "Bash", input: { command: "npm test -- login", description: "Run the login test suite" } } },
  { seq: 5, ts: at(9), kind: "tool_result", data: { tool_use_id: "t1", is_error: true, content: "FAIL src/auth/login.test.ts\n  ● logs in with a valid password\n    expected 200, received 401\n\nTests: 1 failed, 14 passed" } },
  { seq: 6, ts: at(12), kind: "tool_use", data: { id: "t2", name: "Grep", input: { pattern: "user.password", path: "src/auth" } } },
  { seq: 7, ts: at(13), kind: "tool_result", data: { tool_use_id: "t2", is_error: false, content: "src/auth/verify.ts:41:  if (user.password = hash(input)) {" } },
  { seq: 8, ts: at(16), kind: "assistant_text", data: { text: "There it is: line 41 uses `=` instead of `===`, so the branch always passes when the hash is truthy and the test depends on timing of the hash. Fixing the comparison." } },
  { seq: 9, ts: at(17), kind: "tool_use", data: { id: "t3", name: "Edit", input: { file_path: "src/auth/verify.ts", old_string: "if (user.password = hash(input)) {", new_string: "if (user.password === hash(input)) {" } } },
  { seq: 10, ts: at(18), kind: "tool_result", data: { tool_use_id: "t3", is_error: false, content: "The file src/auth/verify.ts has been updated." } },
  { seq: 11, ts: at(20), kind: "tool_use", data: { id: "t4", name: "Bash", input: { command: "npm test -- login", description: "Re-run the login suite" } } },
  { seq: 12, ts: at(26), kind: "tool_result", data: { tool_use_id: "t4", is_error: false, content: "PASS src/auth/login.test.ts\nTests: 15 passed, 15 total\nTime: 2.31 s" } },
  { seq: 13, ts: at(29), kind: "assistant_text", data: { text: "Fixed. The comparison in **verify.ts** was an assignment, which made the result depend on hashing time. All 15 login tests pass now." } },
];
