// Secret redaction shared by the local hook (Node) and the Worker (defense in depth).
// Bias toward over-redaction: a false positive costs a few characters, a leak costs a key.

const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, "[REDACTED:anthropic-key]"],
  [/sk-(?:proj-|live_|test_)?[A-Za-z0-9_-]{20,}/g, "[REDACTED:api-key]"],
  [/AKIA[0-9A-Z]{16}/g, "[REDACTED:aws-key-id]"],
  [/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, "[REDACTED:github-token]"],
  [/github_pat_[A-Za-z0-9_]{50,}/g, "[REDACTED:github-token]"],
  [/glpat-[A-Za-z0-9_-]{20,}/g, "[REDACTED:gitlab-token]"],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/g, "[REDACTED:slack-token]"],
  [/AIza[0-9A-Za-z_-]{35}/g, "[REDACTED:google-key]"],
  [/npm_[A-Za-z0-9]{36}/g, "[REDACTED:npm-token]"],
  [/hf_[A-Za-z0-9]{30,}/g, "[REDACTED:hf-token]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED:jwt]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED:private-key]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{16,}/g, "$1 [REDACTED:auth-header]"],
  // KEY=value or key: value where the key name looks sensitive and the value is 8+ chars.
  [
    /\b([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|private[_-]?key|access[_-]?key|authorization|credential)[A-Za-z0-9_.-]*)(\s*[=:]\s*["']?)([^\s"'`,;]{8,})/gi,
    "$1$2[REDACTED]",
  ],
  // user:password@ in URLs
  [/(https?:\/\/)([^\s\/:@]+):([^\s\/@]+)@/gi, "$1$2:[REDACTED]@"],
];

export function redactText(s) {
  if (typeof s !== "string" || s.length === 0) return s;
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redactDeep(v, depth = 0) {
  if (depth > 24) return "[depth-limit]";
  if (typeof v === "string") return redactText(v);
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = redactDeep(val, depth + 1);
    return out;
  }
  return v;
}
