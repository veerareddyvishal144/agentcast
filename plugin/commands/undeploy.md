---
description: Remove your agentcast server from your Cloudflare account (asks for confirmation)
allowed-tools: Bash(node:*)
---
The user wants to remove their agentcast server. This deletes the Worker and, with `--delete-data`, the search index and archive bucket; every link they have shared stops working.

1. Confirm with the user explicitly, and ask whether to also delete stored data.
2. Only after they confirm, run `node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" undeploy` (add `--delete-data` if they said yes) and relay the result.
