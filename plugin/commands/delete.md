---
description: Permanently delete this session from agentcast (asks for confirmation first)
allowed-tools: Bash(node:*)
---
The user wants to delete the current agentcast session. This removes the shared page and all of its events for every viewer and cannot be undone.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" link` to show which link would be deleted.
2. Ask the user to confirm explicitly.
3. Only after they confirm, run `node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" delete --yes` and relay the result.
If they do not confirm, do nothing.
