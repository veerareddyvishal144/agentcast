// Copies the plugin's hook files into public/dist so the Worker serves them
// for the one-line installer (curl .../install.sh | sh). The dist layout keeps
// hook/ and shared/ side by side so the hook's relative import still resolves.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["plugin/bin/agentcast-hook.mjs", "hook/agentcast-hook.mjs"],
  ["plugin/bin/install.mjs", "hook/install.mjs"],
  ["plugin/shared/redact.mjs", "shared/redact.mjs"],
];
for (const [src, rel] of files) {
  const dest = path.join(root, "public", "dist", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, src), dest);
}
console.log(`synced ${files.length} files to public/dist`);
