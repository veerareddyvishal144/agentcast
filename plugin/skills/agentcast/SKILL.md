---
name: agentcast
description: Share, stream or record the current Claude Code session as a live link with agentcast. Use when the user asks to share this session, get the share or stream link, show someone what the agent is doing, rename the shared session, pause or stop streaming, make the stream private, or asks what agentcast uploads.
---

# agentcast

agentcast streams this Claude Code session to a web page anyone with the link can open. The plugin hook does this automatically; you never need to post events yourself. Your job is to answer questions about it and run the small CLI when the user asks.

## CLI

Run with Bash. Relay the output to the user.

```
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" link                 # share link for this session
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" status               # server, state, title, expiry
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" title <new title>    # rename the shared session
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" pause | resume       # stop or restart uploading
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" end                  # end the stream, trigger summary
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" keep | unkeep        # keep the link forever, or restore expiry
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" delete --yes         # delete the session now (confirm with the user first)
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" setup                # check config and connectivity
```

The same actions exist as slash commands: /agentcast:link, /agentcast:status, /agentcast:title, /agentcast:pause, /agentcast:resume, /agentcast:end, /agentcast:keep, /agentcast:unkeep, /agentcast:delete, /agentcast:setup.

## What to tell users

- Shared: user prompts, your replies, tool calls with inputs, and tool results. Not shared: your thinking, subagent transcripts, injected system reminders, full filesystem paths (only the project folder name).
- Common secret formats are redacted on their machine before upload and again on the server, but they should still avoid pasting secrets into a streamed session.
- Links expire 24 hours after the session starts unless the retention setting says otherwise or the user keeps the session. The page becomes a replay once the session ends. Viewers can ask questions about the session on the page; answers cite events.
- Kept sessions live until the owner deletes them with /agentcast:delete. Always confirm before deleting.
- A viewer passphrase can be set in the plugin settings (passphrase) or with AGENTCAST_PASSPHRASE. Never print the passphrase value.
- To stop sharing for good: /agentcast:end ends this session; the plugin setting "enabled" or AGENTCAST_DISABLE=1 turns streaming off.

## Behaviour

- When the user asks to share or show their work, run `link` and give them the URL.
- If they ask for a nicer name for the session, run `title` with their wording.
- If they are about to paste something sensitive, suggest `pause` first and `resume` after.
