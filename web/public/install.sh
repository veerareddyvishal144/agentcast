#!/bin/sh
# agentcast installer: downloads the Claude Code hook and wires it into your settings.
#   curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh
#   curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh -s -- --project ~/my-repo
#   curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh -s -- --uninstall
set -e
BASE="${AGENTCAST_URL:-https://agentcast.agentcast.workers.dev}"
DIR="$HOME/.agentcast/bin"

command -v node >/dev/null 2>&1 || { echo "agentcast needs Node.js 18 or newer on your PATH." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "agentcast installer needs curl." >&2; exit 1; }

mkdir -p "$DIR/hook" "$DIR/shared"
curl -fsSL "$BASE/dist/hook/agentcast-hook.mjs" -o "$DIR/hook/agentcast-hook.mjs"
curl -fsSL "$BASE/dist/hook/install.mjs"        -o "$DIR/hook/install.mjs"
curl -fsSL "$BASE/dist/shared/redact.mjs"       -o "$DIR/shared/redact.mjs"

node "$DIR/hook/install.mjs" --url "$BASE" "$@"
