---
description: Rename the shared session: /agentcast:title <new title>
allowed-tools: Bash(node:*)
---
Report the result below to the user. If no title was given, ask for one.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" title $ARGUMENTS`
