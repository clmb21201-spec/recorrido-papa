// Worker de Cloudflare: sirve la página (carpeta web/) y sincroniza el estado entre todas las pantallas abiertas.
// Todas las conexiones a /sync entran a la misma "sala" (un Durable Object), que guarda el último estado y lo reparte.
import { DurableObject } from "cloudflare:workers";

export class Sala extends DurableObject {
  async fetch(request) {
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
  async webSocketClose(ws, code) { try { ws.close(code, "fin"); } catch (e) {} }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/sync") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Se espera WebSocket", { status: 426 });
      return env.SALA.get(env.SALA.idFromName("principal")).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
