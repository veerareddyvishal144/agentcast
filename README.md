# agentcast

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/veerareddyvishal144/agentcast/tree/main/plugin/server)


Share a live, link-viewable stream of a Claude Code session: prompts, replies, tool calls, diffs and results, as they happen. When the session ends the link becomes a replay with a timeline scrubber. Links expire after 24 hours by default (see [Link expiration](#link-expiration)).

**Self-hosted by design.** There is no shared agentcast service. Each user deploys the server into their own Cloudflare account with one command, and their sessions never leave it. The free plan is enough for personal use. Under the hood: one Worker, one Durable Object per session, Workers AI for titles and questions, Vectorize for search, R2 for kept sessions, static assets for the viewer.

## Layout

```
plugin/                   Claude Code plugin: hook, CLI, commands, skill, and the server it deploys
  server/wrangler.jsonc       Worker config (deploy generates wrangler.generated.jsonc minus unavailable bindings)
  server/src/index.ts         Worker: HTTP API, viewer route with link-preview tags, rate limiting, create-token check, static assets
  server/src/session.ts       SessionDO: event log (SQLite), WebSocket fan-out, passphrase auth, rename, keep/delete, Vectorize indexing, ask, AI summary, R2 archive/evict/rehydrate, expiry alarm
  server/public/              Built viewer (committed, so deploys need no build toolchain)
  .claude-plugin/plugin.json  Manifest with userConfig (server_url, passphrase, ai_summary, enabled)
  hooks/hooks.json            SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
  bin/agentcast-hook.mjs      The hook: tails the transcript, redacts, posts events
  bin/agentcast.mjs           CLI behind the slash commands, including deploy/undeploy (runs wrangler for the user)
  bin/install.mjs             Curl-install path: adds/removes the hook in Claude Code settings (--url, --token)
  commands/*.md               /agentcast:link, :status, :title, :pause, :resume, :end, :keep, :unkeep, :delete, :list, :restore, :deploy, :undeploy, :setup
  skills/agentcast/SKILL.md   Teaches Claude when to offer the link and how to use the CLI
  shared/redact.mjs           Secret redaction, shared with the Worker
.claude-plugin/marketplace.json   Marketplace listing so people can /plugin install agentcast@agentcast
scripts/sync-dist.mjs     Copies hook files into plugin/server/public/dist for the curl installer (maintainer dev/deploy)
web/                      Frontend: Vite + React 19 + Tailwind v4 + shadcn/ui (Radix "nova" style)
  src/pages/landing-app.tsx   Landing page with a self-playing demo session
  src/pages/viewer-app.tsx    Session viewer: transcript, outline, replay dock, ask panel, passphrase gate
  src/pages/standalone-app.tsx  Offline replay used by the single-file HTML export (vite.standalone.config.ts)
  src/hooks/use-session.ts    WebSocket connection, auth handshake, reconnect, event log
  src/hooks/use-replay.ts     Replay cursor, play/pause, speed
  src/components/             Timeline, tool cards with diff rendering, markdown, header, dock
  public/                     install.sh, og.png, favicon (copied into the build)
```

## Frontend

The UI is a Vite app in `web/` that compiles into `plugin/server/public/` (committed, so the plugin can deploy without a build step). `npm run dev` and `npm run deploy` at the repo root build it first; remember to commit the rebuilt assets.

```sh
cd web && npm install
npm run build        # or: npm run watch, while wrangler dev runs in another terminal
npx shadcn@latest add <component>   # add more shadcn components
```

Dark theme by default with a light toggle, Geist font self-hosted, no runtime CSS-in-JS. The viewer page gets its Open Graph tags injected by the Worker, so the HTML template keeps a plain `<title>` placeholder.

## Install and deploy (users)

Prerequisites: Claude Code and Node 18+. A Cloudflare account is created during the deploy step if you do not have one (free).

```
/plugin marketplace add veerareddyvishal144/agentcast
/plugin install agentcast@agentcast
/agentcast:deploy
```

`/agentcast:deploy` runs wrangler from the plugin's bundled server directory: it logs you into Cloudflare in the browser if needed, creates the Vectorize index and R2 bucket (skipping either if your account cannot have it), deploys the Worker to `https://agentcast.<your-subdomain>.workers.dev`, generates a private **create token** and stores it as a Worker secret, and writes `server_url` and `create_token` into the plugin settings. Re-run it any time to upgrade; data is kept. `/agentcast:undeploy` removes the Worker (add `--delete-data` for the index and bucket).

Until a server is configured the hook prints one reminder per session and streams nothing.

Plugin settings: `server_url`, `create_token` (both set by deploy), `passphrase`, `ai_summary`, `enabled`, `retention` (`24h`, `7d`, `30d`, or `forever`).

Slash commands: `/agentcast:link`, `/agentcast:status`, `/agentcast:title <name>`, `/agentcast:pause`, `/agentcast:resume`, `/agentcast:end`, `/agentcast:keep`, `/agentcast:unkeep`, `/agentcast:delete`, `/agentcast:list`, `/agentcast:restore`, `/agentcast:deploy`, `/agentcast:undeploy`, `/agentcast:setup`. The bundled skill also lets you just ask Claude to "share this session" or "rename the shared session".

To try the plugin from a checkout without installing: `claude --plugin-dir ./plugin`.

**Deploy button (no Claude Code needed).** The button above deploys the server from this repo into your own Cloudflare account through the dashboard. Afterwards set the `CREATE_TOKEN` secret on the Worker (Settings → Variables and Secrets) to any long random string, then install the hook with the curl command below using that token, or enter the URL and token in the plugin settings.

**Without the plugin system (curl).** Deploy the server first (`npm run deploy` from a checkout, or the plugin's deploy), then install the hook from your own server, passing your create token:

```sh
curl -fsSL https://agentcast.<you>.workers.dev/install.sh | sh -s -- --url https://agentcast.<you>.workers.dev --token <create token>
curl -fsSL https://agentcast.<you>.workers.dev/install.sh | sh -s -- --url ... --token ... --project ~/repo   # one project
curl -fsSL https://agentcast.<you>.workers.dev/install.sh | sh -s -- --uninstall
```

Environment variables read by the hook (plugin settings take precedence):

| Variable | Effect |
|---|---|
| `AGENTCAST_URL` | Your server. Nothing streams without it |
| `AGENTCAST_CREATE_TOKEN` | The create token your server requires |
| `AGENTCAST_PASSPHRASE` | Viewers must enter this passphrase before anything loads |
| `AGENTCAST_RETENTION` | `24h` (default), `7d`, `30d`, `forever`, or a number of hours; capped by the server's `MAX_TTL_HOURS` |
| `AGENTCAST_NO_AI=1` | Skip the AI-generated title, summary and question box |
| `AGENTCAST_DISABLE=1` | Do nothing |

**Create token.** When the `CREATE_TOKEN` secret is set on a server, `POST /api/sessions` requires the `x-agentcast-create-token` header. Viewers never need it; links stay shareable. Without it anyone who learns your Worker address could use it as a free agentcast server.

## Viewer features

- Live stream with reconnect, turn outline, collapsible tool cards with diff rendering.
- Replay dock on ended sessions: play, step, scrub, 1× to 8× speed. Keyboard: Space, ←, →, Home, End.
- **Clips**: press the scissors (or `C`) in the dock, pick a range, copy the link. Clip links look like `/s/<id>?from=<seq>&to=<seq>` and get their own link preview.
- **Export**: download the current view (full session or clip) as Markdown or JSON, copy Markdown to the clipboard, or download a **standalone HTML** file: the whole viewer with the session inlined, about 750 KB, which opens offline from any disk or static host with replay and outline intact.
- **Rename**: `/agentcast:title <name>` or `PATCH /api/sessions/:id` with the writer token. A manual title is locked so the AI summary does not replace it.
- **Ask the session**: a question box (header button, sidebar input, or `?ask=<question>` in the URL). Answers come only from this session's events and cite them; clicking a citation jumps to the event. Retrieval is hybrid: Vectorize semantic search over events indexed incrementally during the session, plus keyword and recency matches, so it works on live sessions too. Protected sessions require the passphrase; sessions with AI off have no question box.
- **Keep and delete**: `/agentcast:keep` makes a link permanent, `/agentcast:unkeep` restores the expiry, `/agentcast:delete` removes the session for everyone immediately (asks for confirmation).
- Passphrase gate, light and dark themes, `#tools` to open every tool call.

## Develop

```sh
npm install && (cd web && npm install)
npm run dev                                  # builds the frontend, syncs public/dist, starts wrangler on :8787
node hook/install.mjs --url http://127.0.0.1:8787 --project ~/some-repo
```

## Deploy (maintainer / from a checkout)

```sh
npx wrangler login
npx wrangler vectorize create agentcast-sessions --dimensions=384 --metric=cosine
npx wrangler r2 bucket create agentcast-archive
npm run deploy
npx wrangler secret put CREATE_TOKEN -c plugin/server/wrangler.jsonc   # paste a long random string
```

Users do not do this; `/agentcast:deploy` does the equivalent for them.

Config lives in `plugin/server/wrangler.jsonc`: Durable Object binding, Workers AI binding, a Vectorize index (`agentcast-sessions`, 384 dimensions, cosine; create it once with `npx wrangler vectorize create agentcast-sessions --dimensions=384 --metric=cosine`), an R2 bucket (`agentcast-archive`) for kept sessions, two rate limiters (20 session creations and 30 questions per IP per minute), and vars for TTL, max TTL, archive eviction delay, event cap, and the answer and embedding models.

## Session lifecycle

What the hook does at each point in a Claude Code session:

| You do | What happens to the link |
|---|---|
| Start Claude Code | A new session and link are created; the link is shown as a system message |
| Work, interrupt with Esc, keep going | Same link keeps streaming. Interrupting a reply is not a session boundary |
| `/compact` | Same link; compaction summaries are not uploaded |
| `/clear` | The current link ends; the next prompt starts a new session and a new link |
| Quit Claude Code | The link ends (replay mode, AI summary runs) |
| `claude --resume` or `--continue` after a quit | A **continuation link** is created, holding only what happens from the resume onward. Its first line links back to the earlier part, and the hook names both links in the system message |
| `/agentcast:end` or `agentcast end` | The link ends and the hook stays silent for the rest of that Claude session, even across resumes |
| `/agentcast:keep` | The link never expires until you delete it. `/agentcast:unkeep` puts the expiry back |
| `/agentcast:delete` | The session is removed from the server immediately, viewers see "deleted", and the hook stays silent for the rest of that Claude session |
| Terminal closed or crash (no session-end signal) | The link stays "live" until it expires. There is no inactivity timeout yet |
| Two Claude Code windows at once | Two independent links. The CLI acts on whichever session's hook ran most recently |

## Link expiration

Every session link has a fixed lifetime, counted from the moment the session **starts**, not from when it ends. The default is 24 hours.

**What happens at expiry.** A Durable Object alarm fires, sends every connected viewer an `expired` message and closes their sockets, then deletes the session's storage. From then on the API returns 404 and the page shows "This session is gone." Ending a session early with `/agentcast:end` does not shorten this; the replay stays available until the expiry time.

**Where the value lives.** The lifetime is the `SESSION_TTL_HOURS` variable in `wrangler.jsonc`:

```jsonc
"vars": {
  "SESSION_TTL_HOURS": "24",
  ...
}
```

It is read once when a session is created and stored on the session as `expiresAt`, so changing it affects only sessions created after the change. Existing sessions keep the expiry they were given.

**How to change it.**

| Where | How |
|---|---|
| Production, permanently | Edit the value in `wrangler.jsonc` and run `npm run deploy` |
| Production, one deploy | `npx wrangler deploy --var SESSION_TTL_HOURS:72` |
| Local development | Create `.dev.vars` containing `SESSION_TTL_HOURS=1` (the file is gitignored), or run `npx wrangler dev --var SESSION_TTL_HOURS:1` |

Fractional hours work (`"0.5"` is 30 minutes). Values set in the Cloudflare dashboard are overwritten on the next deploy unless `keep_vars` is set in the config, so prefer the config file.

**Seeing a session's expiry.** `GET /api/sessions/:id/meta` returns `expiresAt`; the viewer sidebar shows it under "Session"; `node plugin/bin/agentcast.mjs status` prints it.

**Storage implications.** Longer lifetimes keep more sessions on disk at once. A typical session is 50 KB to 2 MB of SQLite storage. The Workers free plan allows 5 GB in total across all Durable Objects, so a 7-day lifetime is comfortable for personal use; a 30-day lifetime at team scale calls for the paid plan or the R2 archival item on the roadmap.

**Per-session lifetime.** The plugin setting `retention` (or `AGENTCAST_RETENTION`) sends a `ttlHours` or `keep` flag when the session is created. Hours are capped by `MAX_TTL_HOURS` (default 8760, one year); `forever` creates a kept session with no expiry.

**Restoring an expired or deleted session.** The server keeps nothing after expiry or delete, but Claude Code's own transcript is still on the machine that ran the session. `/agentcast:restore <old link or id> [--keep]` (or `agentcast restore --link <id> --keep`) re-reads that transcript through the hook and publishes it under a **new** link with the original timestamps; the old id cannot be reused. Only sessions created on this machine can be restored.

**Keeping and deleting.** `/agentcast:keep` (`POST /api/sessions/:id/keep` with the writer token) removes the expiry from an existing session; `/agentcast:unkeep` restores it, with at least an hour of grace. `/agentcast:delete` (`DELETE /api/sessions/:id`) removes the session, its events, its archive, and its search index immediately.

**Where kept sessions live (R2 archival).** A kept session that has ended is written to the `agentcast-archive` R2 bucket once its summary and indexing are done: `sessions/<id>/meta.json` (metadata plus the private token and passphrase hashes) and `sessions/<id>/events.json`. After `ARCHIVE_EVICT_HOURS` (default 24) without a visit, the Durable Object drops its local copy and keeps only a pointer. The next visit rehydrates from R2 transparently, so links, replay, export and the question box keep working; vectors stay in Vectorize throughout. Live sessions and sessions with an expiry are never archived. R2 costs about 1.5¢ per GB-month with 10 GB free, versus about 20¢ per GB-month for Durable Object storage. Create the bucket once with `npx wrangler r2 bucket create agentcast-archive`.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/version` | none | `{ version, requiresCreateToken, features }` |
| POST | `/api/sessions` | create token if set, rate limited | Create session. Body `{ title?, agent?, project?, model?, passphrase?, ai?, keep?, ttlHours? }`. Returns `{ id, token, url, expiresAt, kept, protected }` |
| POST | `/api/sessions/:id/events` | `Authorization: Bearer <token>` | Append `{ events: [...], meta?: { title?, model? } }` |
| POST | `/api/sessions/:id/end` | Bearer token | Mark ended; triggers the AI summary |
| PATCH | `/api/sessions/:id` | Bearer token | Rename: `{ title }`. Locks the title against AI renaming |
| POST | `/api/sessions/:id/keep` | Bearer token | `{ kept: true|false }`. Keep forever or restore the expiry |
| DELETE | `/api/sessions/:id` | Bearer token | Delete the session, its events and its vectors now |
| POST | `/api/sessions/:id/ask` | viewer key if protected, rate limited | `{ question }` → `{ answer, citations: [{ seq, kind, label, ts }], indexed }` |
| GET | `/api/sessions/:id/export.html` | viewer key if protected | Standalone single-file HTML replay (download) |
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
- Viewer pages carry `noindex`. Links expire after `SESSION_TTL_HOURS` (default 24) and the Durable Object deletes its storage. See [Link expiration](#link-expiration).
- Passphrases are stored as PBKDF2-SHA256 hashes with a per-session salt.
- The AI summary, the search index and question answering run on Workers AI and Vectorize inside Cloudflare, over already-redacted text, and are all disabled together when AI is off for a session. Vectors are deleted when the session expires or is deleted.
- If the server is unreachable the hook backs off for 10 minutes so it never slows Claude Code.

## Limits

- 20,000 events per session, 64 KB per event (hook truncates earlier: 32 KB text, 10 KB tool results).
- Prompts stream immediately via the UserPromptSubmit hook. Assistant text appears after the next tool call or at the end of the turn, since Claude Code writes the transcript at those points.
- 20 session creations per IP per minute.

## Not yet built

Accounts (needs an identity provider decision), comments, approval mode, inactivity auto-end for crashed sessions, adapters for Codex and Cursor, custom domain, hosted marketplace listing beyond this repo.
