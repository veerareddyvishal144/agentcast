---
description: Show the agentcast share link for this session
allowed-tools: Bash(node:*)
---
Relay the agentcast output below to the user exactly as printed. If it says there is no session yet, explain that streaming begins when a new Claude Code session starts and suggest /agentcast:setup.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" link`
