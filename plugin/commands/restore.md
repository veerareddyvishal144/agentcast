---
description: Re-publish an expired or deleted session from its local transcript: /agentcast:restore <old link or id> [--keep]
allowed-tools: Bash(node:*)
---
The user wants to bring back a session whose link expired or was deleted. agentcast can re-publish it from the Claude Code transcript still on this machine, under a new link.

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" restore --link $ARGUMENTS` (pass `--keep` through if the user asked for it to be permanent) and relay the output. If no link or id was given, ask for one; `/agentcast:list --all` shows candidates.
