import { useCallback, useEffect, useReducer, useRef } from "react";
import type { Meta, ServerMessage, Status, StoredEvent } from "@/lib/types";

type State = {
  meta: Meta | null;
  events: StoredEvent[];
  status: Status;
  viewers: number;
  needsKey: boolean;
  gateError: string | null;
  ready: boolean;
};

type Action =
  | { type: "meta"; meta: Meta }
  | { type: "events"; events: StoredEvent[] }
  | { type: "viewers"; n: number }
  | { type: "status"; status: Status }
  | { type: "gate"; needsKey: boolean; error?: string | null }
  | { type: "ready" };

const initial: State = { meta: null, events: [], status: "connecting", viewers: 0, needsKey: false, gateError: null, ready: false };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "meta": {
      const status = s.status === "expired" || s.status === "gone" ? s.status : a.meta.endedAt ? "ended" : s.ready ? "live" : s.status;
      return { ...s, meta: a.meta, status };
    }
    case "events": {
      const last = s.events.length ? s.events[s.events.length - 1].seq : 0;
      const fresh = a.events.filter((e) => e.seq > last);
      return fresh.length ? { ...s, events: [...s.events, ...fresh] } : s;
    }
    case "viewers": return { ...s, viewers: a.n };
    case "status": return { ...s, status: a.status };
    case "gate": return { ...s, needsKey: a.needsKey, gateError: a.error ?? null, status: a.needsKey ? "locked" : s.status };
    case "ready": return { ...s, ready: true, status: s.meta?.endedAt ? "ended" : "live" };
  }
}

/**
 * Owns the whole viewer connection: metadata bootstrap, passphrase gate,
 * WebSocket with auth handshake and reconnect, and the ordered event log.
 */
export function useSession(id: string) {
  const [state, dispatch] = useReducer(reducer, initial);
  const keyRef = useRef<string | null>(sessionStorage.getItem(`agentcast:key:${id}`));
  const connectRef = useRef<() => void>(() => {});
  const api = `/api/sessions/${id}`;

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    let lastSeq = 0;
    let backoff = 1000;
    let stopped = false; // expired or gone: no more reconnects
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (!alive || stopped) return;
      dispatch({ type: "status", status: lastSeq ? "reconnecting" : "connecting" });
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}${api}/ws?after=${lastSeq}`);
      ws.onopen = () => { backoff = 1000; };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        let msg: ServerMessage;
        try { msg = JSON.parse(e.data); } catch { return; }
        switch (msg.type) {
          case "auth_required": ws?.send(JSON.stringify({ type: "auth", key: keyRef.current })); break;
          case "auth_failed": break;
          case "meta": dispatch({ type: "meta", meta: msg.meta }); break;
          case "events":
            if (msg.events.length) lastSeq = Math.max(lastSeq, msg.events[msg.events.length - 1].seq);
            dispatch({ type: "events", events: msg.events });
            break;
          case "event": lastSeq = Math.max(lastSeq, msg.event.seq); dispatch({ type: "events", events: [msg.event] }); break;
          case "viewers": dispatch({ type: "viewers", n: msg.n }); break;
          case "ready": dispatch({ type: "ready" }); break;
          case "expired": stopped = true; dispatch({ type: "status", status: "expired" }); break;
        }
      };
      ws.onclose = (e) => {
        if (!alive || stopped) return;
        if (e.code === 4001) {
          sessionStorage.removeItem(`agentcast:key:${id}`);
          keyRef.current = null;
          dispatch({ type: "gate", needsKey: true, error: "Passphrase no longer valid." });
          return;
        }
        dispatch({ type: "status", status: "reconnecting" });
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
    };
    connectRef.current = connect;

    const boot = async () => {
      let res: Response;
      try {
        res = await fetch(`${api}/meta`, { headers: keyRef.current ? { "x-agentcast-key": keyRef.current } : {} });
      } catch {
        if (alive) setTimeout(boot, 3000);
        return;
      }
      if (!alive) return;
      if (res.status === 404) { stopped = true; dispatch({ type: "status", status: "gone" }); return; }
      if (!res.ok) { setTimeout(boot, 3000); return; }
      const j = (await res.json()) as { meta: Meta; authorized: boolean };
      if (!j.authorized) { dispatch({ type: "gate", needsKey: true }); return; }
      dispatch({ type: "meta", meta: j.meta });
      connect();
    };

    boot();
    pingTimer = setInterval(() => { if (ws && ws.readyState === 1) ws.send("ping"); }, 25_000);

    return () => {
      alive = false;
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    };
  }, [api, id]);

  const submitKey = useCallback(async (candidate: string): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(`${api}/meta`, { headers: { "x-agentcast-key": candidate } });
    } catch {
      dispatch({ type: "gate", needsKey: true, error: "Network error, try again." });
      return false;
    }
    if (!res.ok) { dispatch({ type: "gate", needsKey: true, error: "Something went wrong, try again." }); return false; }
    const j = (await res.json()) as { meta: Meta; authorized: boolean };
    if (!j.authorized) { dispatch({ type: "gate", needsKey: true, error: "Wrong passphrase." }); return false; }
    keyRef.current = candidate;
    sessionStorage.setItem(`agentcast:key:${id}`, candidate);
    dispatch({ type: "gate", needsKey: false });
    dispatch({ type: "meta", meta: j.meta });
    connectRef.current();
    return true;
  }, [api, id]);

  return { ...state, submitKey };
}
