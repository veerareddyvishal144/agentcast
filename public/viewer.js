(() => {
  const id = location.pathname.split("/")[2];
  const api = `/api/sessions/${id}`;
  const KEY_STORE = `agentcast:key:${id}`;
  const $ = (s) => document.querySelector(s);
  const stream = $("#stream"), empty = $("#empty"), jump = $("#jump");
  const gate = $("#gate"), gateForm = $("#gate-form"), gateInput = $("#gate-input"), gateErr = $("#gate-error");
  const replay = $("#replay"), rpPlay = $("#rp-play"), rpBack = $("#rp-back"), rpFwd = $("#rp-fwd");
  const rpRange = $("#rp-range"), rpLabel = $("#rp-label"), rpSpeed = $("#rp-speed");

  let ws = null, lastSeq = 0, meta = null, expired = false, gone = false, backoff = 1000, ready = false;
  let key = sessionStorage.getItem(KEY_STORE);
  let toolsCollapsed = location.hash !== "#tools"; // open /s/<id>#tools to expand all tool calls
  const tools = new Map();          // tool_use id -> { el, resultEl, resultSeq, resultHtml, isError }
  const pendingResults = new Map(); // tool_use_id -> tool_result event that arrived early
  const events = [];                // every event in order, for replay
  const elBySeq = new Map();        // seq -> element (tool_result events have none)
  let cursor = Infinity;            // Infinity = show everything (live)
  let playing = false, playTimer = null;

  // ---------- bootstrap ----------
  async function boot() {
    let res;
    try { res = await fetch(`${api}/meta`, { headers: key ? { "x-agentcast-key": key } : {} }); } catch { setStatus("reconnecting"); setTimeout(boot, 3000); return; }
    if (res.status === 404) {
      gone = true; setStatus("expired");
      $("#title").textContent = "Session not found or expired";
      empty.textContent = "This link has expired or never existed. agentcast links last 24 hours.";
      return;
    }
    if (!res.ok) { setStatus("reconnecting"); setTimeout(boot, 3000); return; }
    const j = await res.json();
    if (!j.authorized) { showGate(); return; }
    meta = j.meta; renderMeta(); hideGate(); connect();
  }

  function showGate(err) {
    gate.classList.remove("hidden"); gateErr.textContent = err || "";
    setStatus("locked"); $("#title").textContent = "Private session";
    setTimeout(() => gateInput.focus(), 50);
  }
  function hideGate() { gate.classList.add("hidden"); }
  gateForm.onsubmit = async (e) => {
    e.preventDefault();
    const candidate = gateInput.value;
    let res; try { res = await fetch(`${api}/meta`, { headers: { "x-agentcast-key": candidate } }); } catch { showGate("Network error, try again."); return; }
    if (!res.ok) { showGate("Something went wrong, try again."); return; }
    const j = await res.json();
    if (!j.authorized) { showGate("Wrong passphrase."); gateInput.select(); return; }
    key = candidate; sessionStorage.setItem(KEY_STORE, key);
    meta = j.meta; renderMeta(); hideGate(); connect();
  };

  // ---------- connection ----------
  function connect() {
    if (expired || gone) return;
    setStatus(lastSeq ? "reconnecting" : "connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}${api}/ws?after=${lastSeq}`);
    ws.onopen = () => { backoff = 1000; };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      handle(msg);
    };
    ws.onclose = (e) => {
      if (expired || gone) return;
      if (e.code === 4001) { sessionStorage.removeItem(KEY_STORE); key = null; showGate("Passphrase no longer valid."); return; }
      setStatus("reconnecting");
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30000);
    };
  }
  setInterval(() => { if (ws && ws.readyState === 1) ws.send("ping"); }, 25000);

  function handle(msg) {
    switch (msg.type) {
      case "auth_required": ws.send(JSON.stringify({ type: "auth", key })); break;
      case "auth_failed": break; // socket closes with 4001
      case "meta": meta = msg.meta; renderMeta(); break;
      case "events": for (const ev of msg.events) append(ev); break;
      case "event": append(msg.event); break;
      case "viewers": $("#viewers").textContent = msg.n === 1 ? "1 viewer" : `${msg.n} viewers`; break;
      case "ready": ready = true; renderMeta(); break;
      case "expired": expired = true; setStatus("expired"); maybeShowReplay(); break;
    }
  }

  // ---------- header ----------
  function setStatus(s) {
    const el = $("#status");
    el.className = `pill ${s}`;
    el.textContent = s;
    document.title = `${s === "live" ? "● " : ""}${meta?.title || "session"} · agentcast`;
  }
  function renderMeta() {
    if (!meta) return;
    $("#title").textContent = meta.title || "Untitled session";
    $("#summary").textContent = meta.summary || "";
    $("#project").textContent = meta.project ? `📁 ${meta.project}` : "";
    $("#model").textContent = meta.model ? `🧠 ${meta.model}` : "";
    $("#started").textContent = `started ${ago(meta.createdAt)}`;
    $("#expiry").textContent = meta.expiresAt ? `Link expires ${new Date(meta.expiresAt).toLocaleString()}` : "";
    if (expired) setStatus("expired");
    else if (meta.endedAt) setStatus("ended");
    else if (ready) setStatus("live");
    if (meta.endedAt) maybeShowReplay();
    for (const t of tools.values()) applyResult(t);
  }
  setInterval(() => { if (meta) $("#started").textContent = `started ${ago(meta.createdAt)}`; }, 30000);

  // ---------- events ----------
  function append(ev) {
    if (ev.seq <= lastSeq) return;
    lastSeq = ev.seq;
    events.push(ev);
    empty.classList.add("hidden");
    const atBottom = document.body.scrollHeight - window.scrollY - window.innerHeight < 160;
    let el = null;
    switch (ev.kind) {
      case "user": el = card("user", "You", ev, md(ev.data.text)); break;
      case "assistant_text": el = card("assistant", meta?.agent || "Agent", ev, md(ev.data.text)); break;
      case "tool_use": el = toolCard(ev); break;
      case "tool_result": attachResult(ev); break;
      case "session_start": el = sys(ev, `Session started${ev.data?.project ? ` in ${esc(ev.data.project)}` : ""}.`); break;
      case "session_end": el = sys(ev, "Session ended."); break;
      case "notice": el = sys(ev, esc(ev.data?.text || "")); break;
    }
    if (el) {
      el.dataset.seq = ev.seq;
      elBySeq.set(ev.seq, el);
      if (ev.seq > cursor) el.classList.add("rp-hidden");
      stream.appendChild(el);
    }
    if (!replay.classList.contains("hidden")) { rpRange.max = events.length; if (cursor === Infinity) { rpRange.value = events.length; updateLabel(events.length); } }
    if (cursor !== Infinity) return;
    if (atBottom) window.scrollTo({ top: document.body.scrollHeight });
    else if (el) jump.classList.remove("hidden");
  }

  function card(cls, who, ev, bodyHtml) {
    const d = div(`ev ${cls}`);
    d.innerHTML = `<div class="hd"><span class="who">${esc(who)}</span><time>${time(ev.ts)}</time></div><div class="body md">${bodyHtml}</div>`;
    return d;
  }
  function sys(ev, html) {
    const d = div("ev system");
    d.innerHTML = `<div class="body">${html} <time style="float:right;font-family:var(--mono);font-size:11.5px">${time(ev.ts)}</time></div>`;
    return d;
  }

  function toolCard(ev) {
    const { id: tid, name, input } = ev.data || {};
    const det = document.createElement("details");
    det.className = "tool";
    det.open = !toolsCollapsed;
    det.innerHTML = `<summary><span class="dot"></span><span class="name">${esc(name || "tool")}</span><span class="sum">${esc(summary(name, input))}</span><time>${time(ev.ts)}</time></summary>
      <div class="detail"><div class="label">Input</div>${inputHtml(name, input)}<div class="label">Result</div><div class="res"></div></div>`;
    const t = { el: det, resultEl: det.querySelector(".res"), resultSeq: null, resultHtml: "", isError: false };
    tools.set(tid, t);
    applyResult(t);
    if (pendingResults.has(tid)) { attachResult(pendingResults.get(tid)); pendingResults.delete(tid); }
    return det;
  }

  function attachResult(ev) {
    const t = tools.get(ev.data?.tool_use_id);
    if (!t) { pendingResults.set(ev.data?.tool_use_id, ev); return; }
    const content = typeof ev.data.content === "string" ? ev.data.content : JSON.stringify(ev.data.content, null, 2);
    t.resultSeq = ev.seq; t.isError = !!ev.data.is_error;
    t.resultHtml = `<pre class="${t.isError ? "error" : ""}">${esc(content || "(empty)")}</pre>`;
    applyResult(t);
  }

  function applyResult(t) {
    const visible = t.resultSeq != null && t.resultSeq <= cursor;
    t.el.classList.toggle("ok", visible && !t.isError);
    t.el.classList.toggle("err", visible && t.isError);
    if (visible) t.resultEl.innerHTML = t.resultHtml;
    else t.resultEl.innerHTML = `<span class="pending">${t.resultSeq == null && (meta?.endedAt || expired) ? "no result recorded" : "running…"}</span>`;
  }

  function summary(name, input) {
    if (!input || typeof input !== "object") return "";
    switch (name) {
      case "Bash": return input.description || input.command || "";
      case "Read": case "Edit": case "Write": case "MultiEdit": return input.file_path || "";
      case "NotebookEdit": return input.notebook_path || "";
      case "Grep": return `${input.pattern || ""}${input.path ? ` in ${input.path}` : ""}`;
      case "Glob": return input.pattern || "";
      case "WebSearch": return input.query || "";
      case "WebFetch": return input.url || "";
      case "Agent": case "Task": return input.description || "";
      case "Skill": return input.skill || "";
      case "TodoWrite": return `${(input.todos || []).length} todos`;
      default: { const v = Object.values(input).find((x) => typeof x === "string"); return v || ""; }
    }
  }

  function inputHtml(name, input) {
    if (!input || typeof input !== "object") return `<pre>${esc(String(input ?? ""))}</pre>`;
    if (name === "Bash" && input.command) return `<pre>$ ${esc(input.command)}</pre>`;
    if (name === "Edit" && (input.old_string != null || input.new_string != null)) {
      return `<pre class="diff">${esc(input.file_path || "")}\n<span class="del">${esc(prefix(input.old_string, "- "))}</span>\n<span class="add">${esc(prefix(input.new_string, "+ "))}</span></pre>`;
    }
    if (name === "Write" && input.content != null) return `<pre>${esc(input.file_path || "")}\n\n${esc(input.content)}</pre>`;
    return `<pre>${esc(JSON.stringify(input, null, 2))}</pre>`;
  }
  const prefix = (s, p) => String(s ?? "").split("\n").map((l) => p + l).join("\n");

  // ---------- replay ----------
  function maybeShowReplay() {
    if (!replay.classList.contains("hidden")) return;
    replay.classList.remove("hidden");
    rpRange.max = events.length; rpRange.value = events.length;
    updateLabel(events.length);
  }
  function countUpTo(seq) { // number of events with seq <= given
    let lo = 0, hi = events.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].seq <= seq) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function cursorIdx() { return cursor === Infinity ? events.length : countUpTo(cursor); }
  function setCursorIdx(i) {
    i = Math.max(0, Math.min(i, events.length));
    cursor = i === 0 ? 0 : events[i - 1].seq;
    if (i === events.length) cursor = Infinity;
    for (const [seq, el] of elBySeq) el.classList.toggle("rp-hidden", seq > cursor);
    for (const t of tools.values()) applyResult(t);
    rpRange.value = i; updateLabel(i);
    for (let k = i - 1; k >= 0; k--) {
      const ev = events[k];
      const el = elBySeq.get(ev.seq) || (ev.kind === "tool_result" ? tools.get(ev.data?.tool_use_id)?.el : null);
      if (el) { el.scrollIntoView({ block: "end", behavior: playing ? "auto" : "smooth" }); break; }
    }
  }
  function updateLabel(i) {
    const ev = i > 0 ? events[i - 1] : null;
    rpLabel.textContent = `${i} / ${events.length}${ev ? ` · ${time(ev.ts)}` : ""}`;
  }
  function play() {
    if (playing) return pause();
    if (cursorIdx() >= events.length) setCursorIdx(0);
    playing = true; rpPlay.textContent = "❚❚"; tick();
  }
  function pause() { playing = false; rpPlay.textContent = "▶"; clearTimeout(playTimer); }
  function tick() {
    if (!playing) return;
    const i = cursorIdx();
    if (i >= events.length) return pause();
    setCursorIdx(i + 1);
    const cur = events[i], next = events[i + 1];
    if (!next) return pause();
    const dt = Math.max(0, new Date(next.ts) - new Date(cur.ts));
    const speed = Number(rpSpeed.value) || 2;
    playTimer = setTimeout(tick, Math.min(Math.max(dt / speed, 150), 1500));
  }
  rpPlay.onclick = play;
  rpRange.oninput = () => { pause(); setCursorIdx(Number(rpRange.value)); };
  rpBack.onclick = () => { pause(); setCursorIdx(cursorIdx() - 1); };
  rpFwd.onclick = () => { pause(); setCursorIdx(cursorIdx() + 1); };
  document.addEventListener("keydown", (e) => {
    if (replay.classList.contains("hidden") || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); play(); }
    else if (e.key === "ArrowLeft") rpBack.onclick();
    else if (e.key === "ArrowRight") rpFwd.onclick();
  });

  // ---------- markdown-lite ----------
  function md(text) {
    const parts = String(text ?? "").split(/```/);
    let out = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const nl = parts[i].indexOf("\n");
        const code = nl >= 0 ? parts[i].slice(nl + 1) : parts[i];
        out += `<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`;
      } else out += inline(parts[i]);
    }
    return out;
  }
  function inline(t) {
    return t.split(/\n{2,}/).filter((p) => p.trim()).map((p) => {
      let h = esc(p);
      h = h.replace(/^(#{1,6})\s+(.+)$/gm, '<div class="h">$2</div>');
      h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
      h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
      h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return `<p>${h}</p>`;
    }).join("");
  }

  // ---------- utils ----------
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function div(cls) { const d = document.createElement("div"); d.className = cls; return d; }
  function time(ts) { const d = new Date(ts); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  function ago(ts) {
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  }

  // ---------- controls ----------
  jump.onclick = () => { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); jump.classList.add("hidden"); };
  window.addEventListener("scroll", () => { if (document.body.scrollHeight - window.scrollY - window.innerHeight < 40) jump.classList.add("hidden"); });
  $("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText(location.href.split("#")[0]); $("#copy").textContent = "Copied!"; setTimeout(() => ($("#copy").textContent = "Copy link"), 1500); } catch {}
  };
  $("#toggle-tools").onclick = () => {
    toolsCollapsed = !toolsCollapsed;
    for (const { el } of tools.values()) el.open = !toolsCollapsed;
    $("#toggle-tools").textContent = toolsCollapsed ? "Expand tools" : "Collapse tools";
  };
  if (!toolsCollapsed) $("#toggle-tools").textContent = "Collapse tools";

  boot();
})();
