// Copies the hook and shared redaction module into public/dist so the Worker
// serves them for the one-line installer (curl .../install.sh | sh).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["hook/agentcast-hook.mjs", "hook/install.mjs", "shared/redact.mjs"];
for (const rel of files) {
  const dest = path.join(root, "public", "dist", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dest);
}
console.log(`synced ${files.length} files to public/dist`);
