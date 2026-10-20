# agentcast

Share a live, link-viewable stream of a Claude Code session: prompts, replies, tool calls, diffs and results, as they happen. When the session ends the link becomes a replay with a timeline scrubber. Links expire after 24 hours.

Runs on Cloudflare Workers: one Worker, one Durable Object per session, Workers AI for titles, static assets for the viewer. No database to run. Production: https://agentcast.agentcast.workers.dev

## Layout

```
src/index.ts              Worker: HTTP API, viewer route with link-preview tags, rate limiting, static assets
src/session.ts            SessionDO: per-session event log (SQLite), WebSocket fan-out, passphrase auth, rename, AI summary, 24h expiry alarm
plugin/                   Claude Code plugin (also the canonical home of the hook)
  .claude-plugin/plugin.json  Manifest with userConfig (server_url, passphrase, ai_summary, enabled)
  hooks/hooks.json            SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
  bin/agentcast-hook.mjs      The hook: tails the transcript, redacts, posts events
  bin/agentcast.mjs           CLI behind the slash commands: link, status, title, pause, resume, end, setup
  bin/install.mjs             Curl-install path: adds/removes the hook in Claude Code settings
  commands/*.md               /agentcast:link, :status, :title, :pause, :resume, :end, :setup
  skills/agentcast/SKILL.md   Teaches Claude when to offer the link and how to use the CLI
  shared/redact.mjs           Secret redaction, shared with the Worker
.claude-plugin/marketplace.json   Marketplace listing so people can /plugin install agentcast@agentcast
scripts/sync-dist.mjs     Copies plugin hook files into public/dist for the curl installer (runs before dev/deploy)
web/                      Frontend: Vite + React 19 + Tailwind v4 + shadcn/ui (Radix "nova" style)
  src/pages/landing-app.tsx   Landing page with a self-playing demo session
  src/pages/viewer-app.tsx    Session viewer: timeline, outline, replay dock, passphrase gate
  src/hooks/use-session.ts    WebSocket connection, auth handshake, reconnect, event log
  src/hooks/use-replay.ts     Replay cursor, play/pause, speed
  src/components/             Timeline, tool cards with diff rendering, markdown, header, dock
  public/                     install.sh, og.png, favicon (copied into the build)
public/                   Build output served by the Worker (generated, not committed)
```

## Frontend

The UI is a two-page Vite app in `web/` that compiles into `public/`. `npm run dev` and `npm run deploy` at the repo root build it first.

```sh
cd web && npm install
npm run build        # or: npm run watch, while wrangler dev runs in another terminal
npx shadcn@latest add <component>   # add more shadcn components
```

Dark theme by default with a light toggle, Geist font self-hosted, no runtime CSS-in-JS. The viewer page gets its Open Graph tags injected by the Worker, so the HTML template keeps a plain `<title>` placeholder.

## Install (users)

**As a Claude Code plugin (recommended).** Until the repo is public on GitHub, point the marketplace at a local checkout:

```
/plugin marketplace add /path/to/agentcast     # or: /plugin marketplace add <github-user>/agentcast
/plugin install agentcast@agentcast
```

Then start a new session. The share link appears as a system message. Configure in the plugin settings: `server_url`, `passphrase`, `ai_summary`, `enabled`.

Slash commands: `/agentcast:link`, `/agentcast:status`, `/agentcast:title <name>`, `/agentcast:pause`, `/agentcast:resume`, `/agentcast:end`, `/agentcast:setup`. The bundled skill also lets you just ask Claude to "share this session" or "rename the shared session".

To try the plugin from a checkout without installing: `claude --plugin-dir ./plugin`.

**With curl (no plugin system).**

```sh
curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh                      # every project
curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh -s -- --project ~/repo  # one project
curl -fsSL https://agentcast.agentcast.workers.dev/install.sh | sh -s -- --uninstall
```

Environment variables read by the hook (plugin settings take precedence):

| Variable | Effect |
|---|---|
| `AGENTCAST_PASSPHRASE` | Viewers must enter this passphrase before anything loads |
| `AGENTCAST_NO_AI=1` | Skip the AI-generated title and summary at session end |
| `AGENTCAST_DISABLE=1` | Do nothing |
| `AGENTCAST_URL` | Point at a different server (set by the installer) |

## Viewer features

- Live stream with reconnect, turn outline, collapsible tool cards with diff rendering.
- Replay dock on ended sessions: play, step, scrub, 1× to 8× speed. Keyboard: Space, ←, →, Home, End.
- **Clips**: press the scissors (or `C`) in the dock, pick a range, copy the link. Clip links look like `/s/<id>?from=<seq>&to=<seq>` and get their own link preview.
- **Export**: download the current view (full session or clip) as Markdown or JSON, or copy Markdown to the clipboard.
- **Rename**: `/agentcast:title <name>` or `PATCH /api/sessions/:id` with the writer token. A manual title is locked so the AI summary does not replace it.
- Passphrase gate, light and dark themes, `#tools` to open every tool call.

## Develop

```sh
npm install && (cd web && npm install)
npm run dev                                  # builds the frontend, syncs public/dist, starts wrangler on :8787
node hook/install.mjs --url http://127.0.0.1:8787 --project ~/some-repo
```

## Deploy

```sh
npx wrangler login
npm run deploy
```

Config lives in `wrangler.jsonc`: Durable Object binding, Workers AI binding, a rate limiter (20 session creations per IP per minute), and vars for TTL, event cap, AI model, and public URL.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/sessions` | none, rate limited | Create session. Body `{ title?, agent?, project?, model?, passphrase?, ai? }`. Returns `{ id, token, url, expiresAt, protected }` |
| POST | `/api/sessions/:id/events` | `Authorization: Bearer <token>` | Append `{ events: [...], meta?: { title?, model? } }` |
| POST | `/api/sessions/:id/end` | Bearer token | Mark ended; triggers the AI summary |
| PATCH | `/api/sessions/:id` | Bearer token | Rename: `{ title }`. Locks the title against AI renaming |
| GET | `/api/sessions/:id/meta` | viewer key if protected | `{ meta, authorized }`. Unauthorized viewers get a stripped meta |
| GET | `/api/sessions/:id?after=N` | viewer key if protected | Metadata plus events after sequence N |
| GET | `/api/sessions/:id/ws?after=N` | see below | WebSocket stream |
| GET | `/s/:id[?from=N&to=M]` | none | Viewer page with Open Graph tags; `from`/`to` render a clip |

Viewer key is sent as the `x-agentcast-key` header. Over WebSocket, a protected session first sends `{type:"auth_required"}`; the client replies `{type:"auth", key}`; a wrong key closes the socket with code 4001. Then: `meta`, `events` batches, `ready`, and live `events`, `meta`, `viewers`, `expired` messages.

Event kinds: `session_start`, `user`, `assistant_text`, `tool_use`, `tool_result`, `session_end`, `notice`.

## Privacy defaults

- Thinking blocks are never read from the transcript.
- Subagent (sidechain) lines and injected system reminders are dropped.
- Common secret formats are redacted on the sender's machine before upload, and again in the Worker.
- Only the project directory name is sent, not the full path.
- Viewer pages carry `noindex`. Links expire after 24 hours and the Durable Object deletes its storage.
- Passphrases are stored as PBKDF2-SHA256 hashes with a per-session salt.
- The AI summary runs on Workers AI inside Cloudflare, over already-redacted text, and can be disabled per session.
- If the server is unreachable the hook backs off for 10 minutes so it never slows Claude Code.

## Limits

- 20,000 events per session, 64 KB per event (hook truncates earlier: 32 KB text, 10 KB tool results).
- Prompts stream immediately via the UserPromptSubmit hook. Assistant text appears after the next tool call or at the end of the turn, since Claude Code writes the transcript at those points.
- 20 session creations per IP per minute.

## Not yet built

Accounts (needs an identity provider decision), R2 archival past 24 hours, comments, approval mode, adapters for Codex and Cursor, custom domain, GitHub publication of the marketplace.
