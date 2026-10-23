#!/bin/sh
# agentcast installer for people who do not use the Claude Code plugin system.
# Point it at YOUR agentcast server (deployed with /agentcast:deploy or `wrangler deploy`):
#   curl -fsSL https://agentcast.<you>.workers.dev/install.sh | sh -s -- --url https://agentcast.<you>.workers.dev --token <create token>
#   ... | sh -s -- --url <url> --token <token> --project ~/my-repo
#   ... | sh -s -- --uninstall [--project ~/my-repo]
set -e
BASE="${AGENTCAST_URL:-}"
prev=""
for a in "$@"; do
  if [ "$prev" = "--url" ]; then BASE="$a"; fi
  prev="$a"
done
UNINSTALL=""
case " $* " in *" --uninstall "*) UNINSTALL=1;; esac
if [ -z "$BASE" ] && [ -z "$UNINSTALL" ]; then
  echo "Pass --url https://agentcast.<you>.workers.dev (your own agentcast server) or set AGENTCAST_URL." >&2; exit 1
fi
DIR="$HOME/.agentcast/bin"
command -v node >/dev/null 2>&1 || { echo "agentcast needs Node.js 18 or newer on your PATH." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "agentcast installer needs curl." >&2; exit 1; }
if [ -z "$UNINSTALL" ]; then
  mkdir -p "$DIR/hook" "$DIR/shared"
  curl -fsSL "$BASE/dist/hook/agentcast-hook.mjs" -o "$DIR/hook/agentcast-hook.mjs"
  curl -fsSL "$BASE/dist/hook/install.mjs"        -o "$DIR/hook/install.mjs"
  curl -fsSL "$BASE/dist/shared/redact.mjs"       -o "$DIR/shared/redact.mjs"
fi
node "$DIR/hook/install.mjs" "$@"
