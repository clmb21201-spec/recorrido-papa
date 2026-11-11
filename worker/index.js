// Worker de Cloudflare: sirve la página (carpeta web/) y sincroniza el estado entre todas las pantallas abiertas.
// Todas las conexiones a /sync entran a la misma "sala" (un Durable Object), que guarda el último estado y lo reparte.
import { DurableObject } from "cloudflare:workers";

export class Sala extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/vuelo") return this.vuelo(url);
    const [cliente, servidor] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(servidor);            // modo hibernación: no consume mientras nadie envía nada
    const state = (await this.ctx.storage.get("st")) || null;
    servidor.send(JSON.stringify({ type: "state", state, now: Date.now() }));
    return new Response(null, { status: 101, webSocket: cliente });
  }
  async webSocketMessage(ws, msg) {
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    if (m.type === "ping") { ws.send(JSON.stringify({ type: "pong", now: Date.now(), t: m.t })); return; }
    if (m.type === "set" && m.state && typeof m.state.step === "number") {
      await this.ctx.storage.put("st", m.state);
      const out = JSON.stringify({ type: "state", state: m.state, id: m.id, now: Date.now() });
      for (const w of this.ctx.getWebSockets()) { try { w.send(out); } catch (e) {} }
    }
  }
  // vuelo en vivo: consulta adsb.lol como máximo cada 8 s (lo comparten todas las pantallas) y guarda la trayectoria
  async vuelo(url) {
    const cs = (url.searchParams.get("cs") || "").toUpperCase(), desde = +url.searchParams.get("desde") || 0;
    if (!/^[A-Z0-9]{2,8}$/.test(cs)) return Response.json({ error: "indicativo no válido" }, { status: 400 });
    const now = Date.now(), key = "trail:" + cs;
    if (!this.cache || this.cache.cs !== cs || now - this.cache.t > 8000) {
      let ac = null;
      try {
        const r = await fetch(`https://api.adsb.lol/v2/callsign/${cs}`, { headers: { "User-Agent": "recorrido-papa" }, signal: AbortSignal.timeout(6000) });
        const j = await r.json(); const a = (j.ac || [])[0];
        if (a && a.lat != null) ac = { lat: a.lat, lon: a.lon, alt: a.alt_baro, gs: a.gs, track: a.track, seen: a.seen_pos || 0, reg: a.r, tipo: a.t };
      } catch (e) {}
      let trail = (await this.ctx.storage.get(key)) || [];
      if (ac) {
        const p = [+ac.lat.toFixed(4), +ac.lon.toFixed(4), typeof ac.alt === "number" ? ac.alt : 0, now - Math.round(ac.seen * 1000)], L = trail[trail.length - 1];
        if (!L || L[0] !== p[0] || L[1] !== p[1]) {
          trail.push(p);
          if (trail.length > 1500) trail = trail.filter((x, i) => i % 2 === 0 || i > trail.length - 100);   // se aligera sin perder lo reciente
          await this.ctx.storage.put(key, trail);
        }
      }
      this.cache = { cs, t: now, ac, trail };
    }
    return Response.json({ ac: this.cache.ac, trail: this.cache.trail.filter(p => p[3] > desde), fetched: this.cache.t, now },
      { headers: { "cache-control": "no-store" } });
  }
  async webSocketClose(ws, code) { try { ws.close(code, "fin"); } catch (e) {} }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sync") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Se espera WebSocket", { status: 426 });
      return env.SALA.get(env.SALA.idFromName("principal")).fetch(request);
    }
    if (url.pathname === "/vuelo") return env.SALA.get(env.SALA.idFromName("principal")).fetch(request);
    return env.ASSETS.fetch(request);
  },
};
