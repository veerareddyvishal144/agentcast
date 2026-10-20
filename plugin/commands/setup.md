---
description: Check agentcast configuration and server connectivity
allowed-tools: Bash(node:*)
---
Explain the agentcast setup check below to the user in plain language: whether streaming is on, where it streams, whether a passphrase is set, and what is and is not shared. Never print a passphrase value.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" setup`
