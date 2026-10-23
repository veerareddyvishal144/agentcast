---
description: Set up (or upgrade) your own agentcast server in your Cloudflare account
allowed-tools: Bash(node:*)
---
The user wants their own agentcast server. Run this with the Bash tool and a long timeout (at least 10 minutes), streaming output as it goes:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/agentcast.mjs" deploy
```

What to tell the user while it runs:
- If it says a browser window opened for Cloudflare login, tell them to complete the login there (a free Cloudflare account is enough) and wait; the command continues on its own.
- When it finishes, relay the server address and which features are on. Explain that sessions stream only to their own account from now on, and that re-running this command later upgrades the server without losing data.
- If it fails, show the wrangler error it printed and suggest the fix it names (usually enabling a workers.dev subdomain or R2 in the dashboard).
Never print the create token value.
