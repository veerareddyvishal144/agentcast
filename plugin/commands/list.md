---
description: List agentcast links created on this machine (default: last 24 hours)
allowed-tools: Bash(node:*)
---
Show the user the list below as a short table: when, state, project, link. If they asked for a different window, re-run with `--hours <n>` or `--all`; add `--titles` if they want titles.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" list --titles`
