// Página para OBS: agenda de la visita con traslados por calles en tiempo real
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Datos: se cargan de los archivos de datos/ (o vienen incrustados en la versión sin internet)
async function J(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error("No se pudo cargar " + p); return r.json(); }
const INL = window.__INLINE__;
const [AG, MAPPE, RUTAS] = INL ? [INL.agenda, INL.peru, INL.rutas]
  : await Promise.all([J("datos/agenda.json"), J("datos/peru.json"), J("datos/rutas.json")]);
const TITULO = AG.titulo, LUGARES = AG.lugares, DURACION_MIN = AG.duracion_min, DIAS = AG.dias;
// mapas de calles por ciudad (datos/ciudades/<id>.json); si una ciudad no tiene archivo, se muestra en el mapa del Perú
const CITY_IDS = [...new Set(Object.values(LUGARES).map(l => l.ciudad))];
const CITIES = {};
await Promise.all(CITY_IDS.map(async c => { try { CITIES[c] = INL ? INL.ciudades[c] || null : await J("datos/ciudades/" + c + ".json"); } catch (e) { CITIES[c] = null; } }));
const LIMA = CITIES.lima; if (LIMA) LIMA.routes = RUTAS.tramos;
const paisDe = it => it.ciudad || (it.lugar && LUGARES[it.lugar] ? LUGARES[it.lugar].pais : "LIMA");
const CAR_BIN = INL ? Uint8Array.from(atob(INL.car), c => c.charCodeAt(0)).buffer
  : await fetch("modelos/papamovil.b64.txt").then(r => r.text()).then(t => Uint8Array.from(atob(t.trim()), c => c.charCodeAt(0)).buffer);
const PLANE_BIN = INL ? Uint8Array.from(atob(INL.avion), c => c.charCodeAt(0)).buffer
  : await fetch("modelos/avion.b64.txt").then(r => r.text()).then(t => Uint8Array.from(atob(t.trim()), c => c.charCodeAt(0)).buffer);
const HELI_BIN = INL ? Uint8Array.from(atob(INL.heli), c => c.charCodeAt(0)).buffer
  : await fetch("modelos/helicoptero.b64.txt").then(r => r.text()).then(t => Uint8Array.from(atob(t.trim()), c => c.charCodeAt(0)).buffer);
const PAPA_BIN = INL ? Uint8Array.from(atob(INL.papa), c => c.charCodeAt(0)).buffer
  : await fetch("modelos/papa.b64.txt").then(r => r.text()).then(t => Uint8Array.from(atob(t.trim()), c => c.charCodeAt(0)).buffer);
const MW = 1160, MH = 1080;
const GOLD = "#A3863E", INK = "#1D1B18";
const $ = id => document.getElementById(id);

/* ======================= pasos ======================= */
const STEPS = [{ kind: "ov" }];
DIAS.forEach((d, di) => d.items.forEach((it, ii) => {
  if (it.tramo) STEPS.push({ kind: "leg", di, ii, leg: it.tramo, to: it.a, fin: it.fin || null });
  else if (it.vuelo) STEPS.push({ kind: "air", di, ii, from: it.de, to: it.a, min: it.min || 60, heli: it.vehiculo === "helicoptero" });
  else STEPS.push({ kind: "ev", di, ii, at: it.lugar || null, city: paisDe(it), c3: it.lugar && LUGARES[it.lugar] ? LUGARES[it.lugar].ciudad : null });
}));
const LAST = STEPS.length - 1;
STEPS.forEach(s => { if (s.kind === "leg") s.c3 = "lima"; s.mode = s.kind === "leg" || (s.kind === "ev" && s.c3 && CITIES[s.c3]) ? "street" : "country"; });
const cityOf = s => s.kind === "ov" ? null : s.kind === "leg" ? "LIMA" : s.kind === "air" ? (arrived() && !INTL.has(s.to) ? s.to : null) : s.city;
const moving = s => s.kind === "leg" || s.kind === "air";

/* ======================= estado y tiempo ======================= */
let st = { step: 0, base: 0, t0: 0, speed: 1, paused: false, demo: false };
// Sincronización: en la versión de Cloudflare todas las pantallas abiertas con el enlace ven y controlan lo mismo.
// El estado es mínimo (paso, inicio, velocidad, pausa) y la hora se toma del servidor para que todas calculen igual.
let OFFSET = 0, sock = null, sockOk = false;
const clock = () => Date.now() + OFFSET;
const MY_ID = Math.random().toString(36).slice(2);
function save(local) {
  try { localStorage.setItem("papa_live_v1", JSON.stringify(st)); } catch (e) {}
  if (!local && sockOk) try { sock.send(JSON.stringify({ type: "set", state: st, id: MY_ID })); } catch (e) {}
}
function load() { try { const v = JSON.parse(localStorage.getItem("papa_live_v1")); if (v && v.step >= 0 && v.step <= LAST) return v; } catch (e) {} return null; }
// velocidad_base (agenda.json): 30 = por ahora todo corre a ×30; 1 = tiempo real. Los vuelos duran vuelo_seg segundos fijos.
const BASE = AG.velocidad_base || 1, VUELO_SEG = AG.vuelo_seg || 0, PAUSA_SEG = AG.pausa_llegada_seg ?? 3;
// ya llegó (vuelo o recorrido) y está en la pausa: se calcula del estado, igual en todas las pantallas
const arrived = () => { const s = STEPS[st.step]; return moving(s) && progMs() >= legMs(); };
const rate = () => { const s = STEPS[st.step]; if (st.paused) return 0; return s.kind === "air" && VUELO_SEG ? st.speed : st.speed * BASE * (st.demo ? 30 : 1); };
function legMs() { const s = STEPS[st.step]; if (s.kind === "air" && VUELO_SEG) return VUELO_SEG * 1000; return (s.kind === "air" ? s.min : (DURACION_MIN[s.leg] || 20)) * 60000; }
function legFrac() { const u = Math.max(0, Math.min(1, Math.max(0, progMs()) / legMs())), ea = .04, v = 1 / (1 - ea);   // arranque y llegada suaves
  return u < ea ? v * u * u / (2 * ea) : u > 1 - ea ? 1 - v * (1 - u) * (1 - u) / (2 * ea) : v * (u - ea / 2); }
function progMs(now = clock()) { return st.base + (now - st.t0) * rate(); }
function rebase(now = clock()) { st.base = progMs(now); st.t0 = now; }

/* ======================= mapa del Perú (SVG) ======================= */
const NS = "http://www.w3.org/2000/svg";
function add(par, tag, at) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); par.appendChild(e); return e; }
const svg = $("country"), g = $("cg"), ov = $("cov");
MAPPE.neighbors.forEach(n => add(g, "path", { d: n.d, class: "nb" }));
const deptEl = {}; MAPPE.depts.forEach(n => deptEl[n.name] = add(g, "path", { d: n.d, class: "dp" }));
add(g, "path", { d: MAPPE.peru, class: "pe" });
const CP = MAPPE.places; CP.ROMA = [720, 500]; CP["BUENOS AIRES"] = [700, 900];   // entradas/salidas internacionales, fuera del encuadre de Lima
const INTL = new Set(["ROMA", "BUENOS AIRES"]);
const DEPT = { LIMA: ["LIMA", "CALLAO"], CHICLAYO: ["LAMBAYEQUE"], PIMENTEL: ["LAMBAYEQUE"], "ZAÑA": ["LAMBAYEQUE"], "SANTA CRUZ": ["CAJAMARCA"], CUSCO: ["CUSCO"], PUCALLPA: ["UCAYALI"] };
const TOUR = new Set(Object.values(DEPT).flat());
const LBL = { LIMA: [16, 6, "start", 0], CHICLAYO: [-4, -16, "end", 0], PIMENTEL: [-14, 14, "end", 2.2], "ZAÑA": [0, 30, "middle", 2.2], "SANTA CRUZ": [14, 6, "start", 1.6], CUSCO: [16, 6, "start", 0], PUCALLPA: [16, 6, "start", 0] };
const CNAMES = Object.keys(LBL);
// tramos del mapa del Perú: los vuelos son pasos propios; los traslados cortos por tierra se dibujan solos
const cLegs = []; { let prev = "ROMA"; STEPS.forEach((s, i) => {
  if (s.kind === "air") { cLegs.push({ a: s.from, b: s.to, step: i, air: true }); prev = s.to; return; }
  const c = cityOf(s); if (!c) return; if (c !== prev) cLegs.push({ a: prev, b: c, step: i }); prev = c; }); }
const cLab = MAPPE.countryLabels.map(([n, p]) => { const t = add(ov, "text", { class: "cty", "text-anchor": "middle" }); t.textContent = n; return { t, p }; });
const cPlanEl = cLegs.map(() => add(ov, "path", { fill: "none", stroke: GOLD, "stroke-width": 3, "stroke-opacity": .35, "stroke-dasharray": "2 9", "stroke-linecap": "round" }));
const cLegEl = cLegs.map(() => add(ov, "path", { fill: "none", stroke: GOLD, "stroke-width": 3.5, "stroke-linecap": "round" }));
const pin = {};
CNAMES.forEach(n => {
  const grp = add(ov, "g", {});
  pin[n] = { grp, halo: add(grp, "circle", { r: 0, fill: "none", stroke: GOLD, "stroke-width": 2.5 }), dot: add(grp, "circle", { r: 6, fill: "#fff", stroke: INK, "stroke-width": 2.5 }),
    box: add(grp, "rect", { fill: INK }), tbox: add(grp, "rect", { fill: "#fff" }), lbl: add(grp, "text", { class: "lbl" }), tag: add(grp, "text", { class: "tag" }) };
  pin[n].lbl.textContent = n;
});
function frameFor(pts, minExt) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  pts.forEach(n => { const [x, y] = CP[n]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: MW / Math.max(minExt, (x1 - x0) * 1.6, (y1 - y0) * 1.6 * MW / MH) };
}
const C_OV = { cx: MW / 2, cy: MH / 2, z: 1 };
const DAYCAM = DIAS.map(d => { const ps = [...new Set(d.items.filter(i => !i.tramo && !i.vuelo).map(paisDe))]; return frameFor(ps, ps.length > 1 ? 300 : 340); });
function airCam(s) { return !INTL.has(s.from) && !INTL.has(s.to) ? frameFor([s.from, s.to], 300) : DAYCAM[s.di]; }
let ccam = { ...C_OV }, cfrom = ccam, cto = ccam, ct0 = 0, cdur = 1;
const easeIO = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function cMove(t, ms) { cfrom = { ...ccam }; cto = t; ct0 = performance.now(); cdur = ms; cfrom.dip = Math.min(1.1, Math.hypot(t.cx - cfrom.cx, t.cy - cfrom.cy) / 260); }
function cStep(now) {
  const u = Math.max(0, Math.min(1, (now - ct0) / cdur)), e = easeIO(u);
  const lz = Math.log(cfrom.z) + (Math.log(cto.z) - Math.log(cfrom.z)) * e - (cfrom.dip || 0) * Math.sin(Math.PI * e);
  ccam = { cx: cfrom.cx + (cto.cx - cfrom.cx) * e, cy: cfrom.cy + (cto.cy - cfrom.cy) * e, z: Math.exp(lz) };
}
const CS = (x, y) => [(x - ccam.cx) * ccam.z + MW / 2, (y - ccam.cy) * ccam.z + MH / 2];
function arc(a, b, k) {
  const [ax, ay] = CP[a], [bx, by] = CP[b], dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), bend = d < 30 ? .12 : .22;
  const cx = (ax + bx) / 2 - dy * bend, cy = (ay + by) / 2 + dx * bend, q = t => [(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by];
  const o = []; for (let i = 0; i <= 60 * k; i++) o.push(q(i / 60)); if (k > 0 && k < 1) o.push(q(k)); return o;
}
// posición y rumbo exactos sobre el arco (evita saltos del avión cuando dos puntos coinciden)
function arcAt(a, b, t) {
  const [ax, ay] = CP[a], [bx, by] = CP[b], dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), bend = d < 30 ? .12 : .22;
  const cx = (ax + bx) / 2 - dy * bend, cy = (ay + by) / 2 + dx * bend;
  const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx, y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
  const tx = 2 * (1 - t) * (cx - ax) + 2 * t * (bx - cx), ty = 2 * (1 - t) * (cy - ay) + 2 * t * (by - cy);
  return { x, y, ang: Math.atan2(ty, tx) };
}
let cLegAnim = { i: -1 };
function countryEnter(prevStep, instant) {
  const s = STEPS[st.step];
  const target = s.kind === "ov" ? C_OV : s.kind === "air" ? airCam(s) : DAYCAM[s.di];
  const far = Math.hypot(target.cx - ccam.cx, target.cy - ccam.cy) > 40 || Math.abs(Math.log(target.z / ccam.z)) > .2;
  cMove(target, instant ? 1 : s.kind === "air" ? 1200 : far ? 2600 : 900);
  const li = cLegs.findIndex(l => l.step === st.step);
  cLegAnim = (!instant && li >= 0 && st.step > prevStep && !cLegs[li].air) ? { i: li, t0: performance.now() + (far ? 300 : 0), dur: cLegs[li].out ? 2400 : far ? 2200 : 1100 } : { i: -1 };
  deptPaint();
}
function deptPaint() {
  const s = STEPS[st.step];
  let on = cityOf(s), soft = null;
  if (s.kind === "air" && !INTL.has(s.to) && DEPT[s.to]) { if (arrived() || legFrac() > .72) on = s.to; else soft = s.to; }
  for (const k in deptEl) {
    const a = !!on && DEPT[on] && DEPT[on].includes(k), b = !a && ((soft && DEPT[soft].includes(k)) || (TOUR.has(k) && s.kind === "ov"));
    if (deptEl[k].classList.contains("on") !== a) deptEl[k].classList.toggle("on", a);
    if (deptEl[k].classList.contains("tour") !== b) deptEl[k].classList.toggle("tour", b);
  }
}
function countryDraw(now) {
  cStep(now); if (STEPS[st.step].kind === "air") deptPaint();
  svg.setAttribute("viewBox", `${ccam.cx - MW / 2 / ccam.z} ${ccam.cy - MH / 2 / ccam.z} ${MW / ccam.z} ${MH / ccam.z}`);
  const s = STEPS[st.step], c = cityOf(s);
  cLab.forEach(({ t, p }) => { const [x, y] = CS(p[0], p[1]); t.setAttribute("x", x); t.setAttribute("y", y); t.setAttribute("opacity", ccam.z < 1.8 ? .9 : Math.max(0, 1 - (ccam.z - 1.8))); });
  const toD = pts => pts.length > 1 ? "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") : "";
  let plane = null;
  cLegs.forEach((l, i) => {
    const roma = INTL.has(l.a) || INTL.has(l.b);
    let k = s.kind === "ov" ? (roma ? 0 : 1) : l.step < st.step ? 1 : l.step === st.step ? (l.air ? legFrac() : 1) : 0;
    if (i === cLegAnim.i) k = easeIO(Math.max(0, Math.min(1, (now - cLegAnim.t0) / cLegAnim.dur)));
    const pts = k > 0 ? arc(l.a, l.b, k).map(p => CS(p[0], p[1])) : [];
    cLegEl[i].setAttribute("d", toD(pts));
    cLegEl[i].setAttribute("stroke-dasharray", roma ? "2 10" : "none");
    const cur = l.air && l.step === st.step;
    cPlanEl[i].setAttribute("d", cur ? toD(arc(l.a, l.b, 1).map(p => CS(p[0], p[1]))) : "");
    if (cur) { const q = arcAt(l.a, l.b, k), [x, y] = CS(q.x, q.y); plane = { x, y, ang: q.ang, k, heli: s.heli }; }
  });
  planeDraw(plane);
  const seen = new Set(); STEPS.slice(1, st.step + 1).forEach(x => seen.add(cityOf(x)));
  CNAMES.forEach(n => {
    const p = pin[n], [x, y] = CS(CP[n][0], CP[n][1]), cur = c === n;
    p.grp.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    p.dot.setAttribute("r", cur ? 9 : 6); p.dot.setAttribute("fill", cur ? GOLD : (seen.has(n) || s.kind === "ov") ? INK : "#fff"); p.dot.setAttribute("stroke", cur ? "#fff" : INK);
    const ph = (now % 1800) / 1800; p.halo.setAttribute("r", cur ? 10 + ph * 26 : 0); p.halo.setAttribute("opacity", cur ? 1 - ph : 0);
    let [dx, dy, anc, minz] = LBL[n], show = cur || ccam.z >= minz;
    if (!cur && c) { const [x0, y0] = CS(CP[c][0], CP[c][1]); if (Math.hypot(x - x0, y - y0) < 150) show = false; }
    const boxed = cur && s.kind !== "air";   // al aterrizar no se pone caja ni texto: solo el zoom a la ciudad
    if (cur && boxed) { dx = anc === "end" ? -22 : anc === "middle" ? 0 : 22; dy = anc === "middle" ? 44 : -14; }
    p.lbl.setAttribute("x", dx); p.lbl.setAttribute("y", dy); p.lbl.setAttribute("text-anchor", anc);
    p.lbl.setAttribute("font-size", boxed ? 30 : cur ? 22 : 19); p.lbl.setAttribute("opacity", show ? 1 : 0);
    p.lbl.setAttribute("fill", boxed ? "#fff" : cur || seen.has(n) || s.kind === "ov" ? INK : "#8C877D"); p.lbl.classList.toggle("cur", boxed);
    const it = s.kind === "ev" ? DIAS[s.di].items[s.ii] : null;   // hora bajo el nombre de la ciudad actual
    p.tag.textContent = boxed && it ? it.hora : ""; p.tag.setAttribute("font-size", 20); p.tag.setAttribute("y", dy + 48);
    if (cur && boxed) {
      const b = p.lbl.getBBox();
      p.box.setAttribute("x", b.x - 16); p.box.setAttribute("y", b.y - 8); p.box.setAttribute("width", b.width + 32); p.box.setAttribute("height", b.height + 14);
      p.tag.setAttribute("x", anc === "end" ? b.x + b.width + 4 : anc === "middle" ? dx : b.x - 4); p.tag.setAttribute("text-anchor", anc === "middle" ? "middle" : anc);
      if (p.tag.textContent) { const tb = p.tag.getBBox(); p.tbox.setAttribute("x", tb.x - 12); p.tbox.setAttribute("y", tb.y - 5); p.tbox.setAttribute("width", tb.width + 24); p.tbox.setAttribute("height", tb.height + 10); }
    }
    p.box.setAttribute("opacity", boxed ? 1 : 0); p.tbox.setAttribute("opacity", boxed && p.tag.textContent ? 1 : 0);
  });
}

/* ======================= avión 3D sobre el mapa del Perú ======================= */
const pRenderer = new THREE.WebGLRenderer({ canvas: $("planecv"), antialias: true, alpha: true });
pRenderer.setPixelRatio(1); pRenderer.setSize(MW, MH, false); pRenderer.setClearColor(0x000000, 0);
const pScene = new THREE.Scene();
const pCam = new THREE.OrthographicCamera(-MW / 2, MW / 2, MH / 2, -MH / 2, 1, 5000);
pCam.position.set(MW / 2, 2000, MH / 2); pCam.up.set(0, 0, -1); pCam.lookAt(MW / 2, 0, MH / 2);   // pantalla: x = X, y hacia abajo = Z
pScene.add(new THREE.HemisphereLight(0xffffff, 0x6f747e, 1.25));
const pSun = new THREE.DirectionalLight(0xffffff, 1.35); pSun.position.set(-300, 1000, -500); pScene.add(pSun);
const planeG = new THREE.Group(), planeYaw = new THREE.Group(), planeTilt = new THREE.Group(), shadowG = new THREE.Group();
planeTilt.add(planeYaw); planeG.add(planeTilt); pScene.add(shadowG, planeG); planeG.visible = shadowG.visible = false;
const PLANE_PX = 112, HELI_PX = 84;
// dirección de la nariz de cada modelo en su plano XZ: avión hacia -X algo +Z; helicóptero hacia -X
const NOSES = { avion: Math.atan2(0.3426, -0.9395), heli: Math.PI };
const VEH = {};
function loadVehicle(name, bin, px, len) {
  new GLTFLoader().parse(bin, "", gl => {
    const m = gl.scene, box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3());
    m.position.sub(c); const k = px / len; const wrap = new THREE.Group(); wrap.add(m); wrap.scale.setScalar(k); planeYaw.add(wrap);
    const sh = wrap.clone(true); sh.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x1d1b18, transparent: true, opacity: .16, depthWrite: false }); });
    sh.scale.y = .01 * k; shadowG.add(sh); VEH[name] = { wrap, sh };
  }, () => {});
}
loadVehicle("avion", PLANE_BIN, PLANE_PX, 1.03);
loadVehicle("heli", HELI_BIN, HELI_PX, 1.0);
function planeDraw(pl) {
  planeG.visible = shadowG.visible = !!pl;
  if (!pl) { pRenderer.clear(); return; }
  const alt = Math.min(1, pl.k / .12, (1 - pl.k) / .12);   // sube al despegar y baja al aterrizar
  const kind = pl.heli ? "heli" : "avion";
  for (const n in VEH) { VEH[n].wrap.visible = VEH[n].sh.visible = n === kind; }
  const yaw = NOSES[kind] - pl.ang, sc = .8 + (pl.heli ? .2 : .35) * alt;
  planeG.position.set(pl.x, 300, pl.y); planeYaw.rotation.y = yaw; planeTilt.rotation.x = -.42 * (.4 + .6 * alt); planeG.scale.setScalar(sc);
  shadowG.position.set(pl.x + 34 * alt, 10, pl.y + 34 * alt); shadowG.rotation.y = yaw; shadowG.scale.setScalar(sc * .95);
  pRenderer.render(pScene, pCam);
}

/* ======================= calles de Lima (three.js) ======================= */
const renderer = new THREE.WebGLRenderer({ canvas: $("street"), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(MW, MH, false);
renderer.toneMapping = THREE.NoToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color("#EEEBE5");
const cam3 = new THREE.PerspectiveCamera(34, MW / MH, 5, 40000); cam3.up.set(0, 0, 1);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958c, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-400, -300, 900); scene.add(sun);
let ro = 0;
function flatMat(hex, opacity = 1) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: opacity < 1, opacity, depthTest: false, depthWrite: false }); }
function layerMesh(L, hex, parent) {
  const geo = new THREE.BufferGeometry();
  const v = L.v, pos = new Float32Array(v.length / 2 * 3);
  for (let i = 0, j = 0; i < v.length; i += 2, j += 3) { pos[j] = v[i]; pos[j + 1] = v[i + 1]; pos[j + 2] = 0; }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(L.i);
  const m = new THREE.Mesh(geo, flatMat(hex)); m.renderOrder = ro++; m.frustumCulled = false; parent.add(m); return m;
}
const LCOL = { sea: "#A8CBE0", water: "#A8CBE0", park: "#DCE5CF", bld: "#DED9D0", minor: "#FFFFFF", major: "#FFFFFF" };
const CG = {};   // un grupo por ciudad; solo se ve el de la ciudad actual
const ro0 = ro;
for (const c in CITIES) {
  if (!CITIES[c]) continue;
  const g = CG[c] = new THREE.Group(); g.visible = false; scene.add(g); ro = ro0;
  const b = CITIES[c].bounds, gp = new THREE.Mesh(new THREE.PlaneGeometry(b[2] - b[0] + 60000, b[3] - b[1] + 60000), flatMat("#EEEBE5"));
  gp.position.set((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 0); gp.renderOrder = ro++; g.add(gp);
  ["sea", "water", "park", "bld", "minor", "major"].forEach(k => layerMesh(CITIES[c].layers[k], LCOL[k], g));
}

// trayectos: suavizado y remuestreo cada 3 m
const STEP_M = 3;
const ROUTE = {};
for (const k in (LIMA ? LIMA.routes : {})) {
  const p = LIMA.routes[k].p; let pts = []; for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  for (let it = 0; it < 2; it++) { const s = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; s.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } s.push(pts[pts.length - 1]); pts = s; }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.floor(L / STEP_M) + 1, rs = new Float32Array(n * 2); let j = 0;
  for (let i = 0; i < n; i++) { const s = i * STEP_M; while (j < cum.length - 2 && cum[j + 1] < s) j++; const t = (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]); rs[i * 2] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t; rs[i * 2 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t; }
  ROUTE[k] = { pts: rs, n, L, names: LIMA.routes[k].names };
}
function ribbon(R, width, hex, opacity, order) {
  const n = R.n, pos = new Float32Array(n * 6), idx = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
    let dx = R.pts[b * 2] - R.pts[a * 2], dy = R.pts[b * 2 + 1] - R.pts[a * 2 + 1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const x = R.pts[i * 2], y = R.pts[i * 2 + 1], w = width / 2;
    pos.set([x - dy * w, y + dx * w, 0, x + dy * w, y - dx * w, 0], i * 6);
    if (i < n - 1) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const m = new THREE.Mesh(geo, flatMat(hex, opacity)); m.renderOrder = order; m.frustumCulled = false; CG.lima.add(m); return m;
}
const ORD = { plan: 100, edge: 101, line: 102, lab: 103, pin: 104 };
const RIB = {};
for (const k in ROUTE) RIB[k] = { plan: ribbon(ROUTE[k], 9, GOLD, .35, ORD.plan), edge: ribbon(ROUTE[k], 17, "#FFFFFF", 1, ORD.edge), line: ribbon(ROUTE[k], 10, GOLD, 1, ORD.line) };
function setRib(k, planVis, frac) {
  const r = RIB[k], segs = ROUTE[k].n - 1, c = Math.round(segs * Math.max(0, Math.min(1, frac))) * 6;
  r.plan.visible = planVis; r.edge.geometry.setDrawRange(0, c); r.line.geometry.setDrawRange(0, c); r.edge.visible = r.line.visible = c > 0;
}
function routeAt(k, s) {
  const R = ROUTE[k], f = Math.max(0, Math.min(R.n - 1.001, s / STEP_M)), i = Math.floor(f), t = f - i;
  const x = R.pts[i * 2] + (R.pts[i * 2 + 2] - R.pts[i * 2]) * t, y = R.pts[i * 2 + 1] + (R.pts[i * 2 + 3] - R.pts[i * 2 + 1]) * t;
  const a = Math.max(0, i - 4), b = Math.min(R.n - 1, i + 5);
  return { x, y, h: Math.atan2(R.pts[b * 2 + 1] - R.pts[a * 2 + 1], R.pts[b * 2] - R.pts[a * 2]) };
}
function streetAt(k, s) { const nm = ROUTE[k].names.find(n => s >= n[1] && s <= n[2]); return nm && nm[0] ? nm[0] : ""; }

// textos en textura
async function fontsReady() { try { await Promise.all(['700 40px "Playfair Display"', '600 40px "Inter"', '700 40px "Inter"'].map(f => document.fonts.load(f))); } catch (e) {} }
function textTex(lines, o) {
  const cv = document.createElement("canvas"), cx = cv.getContext("2d"), S = o.px;
  cx.font = o.font(S); let w = 0; lines.forEach(l => w = Math.max(w, cx.measureText(l).width));
  const pad = o.box ? S * .55 : S * .3, H = lines.length * S * 1.25 + pad * 1.4;
  cv.width = Math.ceil(w + pad * 2); cv.height = Math.ceil(H);
  cx.font = o.font(S); cx.textBaseline = "middle";
  if (o.box) { cx.fillStyle = o.box; cx.fillRect(0, 0, cv.width, cv.height); }
  lines.forEach((l, i) => {
    const y = pad * .7 + S * 1.25 * (i + .5);
    if (o.halo) { cx.lineWidth = S * .2; cx.strokeStyle = o.halo; cx.lineJoin = "round"; cx.strokeText(l, pad, y); }
    cx.fillStyle = o.color; cx.fillText(l, pad, y);
  });
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter;
  return { tx, aspect: cv.width / cv.height };
}
function flatLabel(lines, o, heightM, parent = scene) {
  const { tx, aspect } = textTex(lines, o);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(heightM * aspect, heightM), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = o.order || ORD.lab; m.frustumCulled = false; parent.add(m); return m;
}
const serif = s => `700 ${s}px "Playfair Display", Georgia, serif`, sans = s => `600 ${s}px "Inter", Arial, sans-serif`, sansB = s => `700 ${s}px "Inter", Arial, sans-serif`;

// rótulos de calles de la ruta (se crean por tramo) y de calles vecinas (perezosos)
const routeLabels = {};
function buildRouteLabels(k) {
  if (routeLabels[k]) return routeLabels[k];
  const arr = [];
  ROUTE[k].names.forEach(([nm, a, b]) => {
    if (!nm || b - a < 150) return;
    const spots = b - a < 900 ? [(a + b) / 2] : Array.from({ length: Math.floor((b - a - 300) / 700) + 1 }, (_, i) => a + 300 + i * 700);
    spots.forEach(s => {
      const p = routeAt(k, s), m = flatLabel([nm], { px: 64, font: serif, color: INK, halo: "#fff" }, 17, CG.lima);
      const nx = -Math.sin(p.h), ny = Math.cos(p.h); m.userData = { x: p.x + nx * 30, y: p.y + ny * 30 }; arr.push(m);
    });
  });
  return routeLabels[k] = arr;
}
const sideLabels = new Map();
function dropSide(key) { const m = sideLabels.get(key); m.parent.remove(m); m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); sideLabels.delete(key); }
function updateSide(city, tx, ty) {
  for (const key of [...sideLabels.keys()]) if (!key.startsWith(city + ":")) dropSide(key);
  CITIES[city].side.forEach((l, i) => {
    const key = city + ":" + i, d = Math.hypot(l[1] - tx, l[2] - ty);
    if (d < 1300 && !sideLabels.has(key)) { const m = flatLabel([l[0]], { px: 48, font: sans, color: "#9A9DA4", halo: "#fff" }, 13, CG[city]); m.userData = { x: l[1], y: l[2] }; sideLabels.set(key, m); }
    else if (d > 2100 && sideLabels.has(key)) dropSide(key);
  });
}

// lugares: punto dorado, halo y nombre en caja negra
const VP = {};
for (const k in LUGARES) {
  const c = LUGARES[k].ciudad; if (!CITIES[c] || !CITIES[c].venues[k]) continue;
  const [x, y] = CITIES[c].venues[k];
  const dot = new THREE.Mesh(new THREE.CircleGeometry(9, 32), flatMat(GOLD)); dot.position.set(x, y, 0); dot.renderOrder = ORD.pin;
  const ring = new THREE.Mesh(new THREE.RingGeometry(10, 14, 48), flatMat(GOLD, .9)); ring.position.set(x, y, 0); ring.renderOrder = ORD.pin;
  const wr = new THREE.Mesh(new THREE.RingGeometry(9, 12, 32), flatMat("#FFFFFF")); wr.position.set(x, y, 0); wr.renderOrder = ORD.pin;
  CG[c].add(dot, ring, wr); VP[k] = { x, y, dot, ring, wr, label: null, city: c };
}
function venueLabel(k) {
  const v = VP[k]; if (v.label) return v.label;
  const name = LUGARES[k].nombre.toUpperCase(), words = name.split(" ");
  let lines = [name];
  if (name.length > 24) { const h = Math.ceil(words.length / 2); lines = [words.slice(0, h).join(" "), words.slice(h).join(" ")]; }
  const m = flatLabel(lines, { px: 60, font: serif, color: "#fff", box: INK, order: ORD.pin + 1 }, 21 * lines.length, CG[v.city]);
  m.userData = { x: v.x, y: v.y }; return v.label = m;
}

// auto 3D
const car = new THREE.Group(); scene.add(car);
const shadow = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128; const cx = cv.getContext("2d");
  const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(10,10,15,.55)"); gr.addColorStop(1, "rgba(10,10,15,0)"); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(44, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = ORD.pin + 2; return m;
})();
car.add(shadow);
// el Papa en 3D: aparece de pie en cada lugar cuando no hay recorrido confirmado
const papa = new THREE.Group(); scene.add(papa); papa.visible = false;
const PAPA_H = 40;
const papaReady = new Promise(res => {
  new GLTFLoader().parse(PAPA_BIN, "", gl => {
    const m = gl.scene; m.rotation.x = Math.PI / 2;          // de Y arriba (glTF) a Z arriba; el frente queda hacia -Y
    const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
    m.scale.setScalar(PAPA_H / sz.z);
    const b2 = new THREE.Box3().setFromObject(m); m.position.z = -b2.min.z;
    m.traverse(o => { if (o.isMesh) { o.renderOrder = 200; o.material.depthTest = true; } });
    const sh = shadow.clone(); sh.scale.set(.8, .55, 1); papa.add(sh, m); res();
  }, () => res());
});
const CAR_LEN = 42;
const carReady = new Promise(res => {
  new GLTFLoader().parse(CAR_BIN, "", gl => {
    const m = gl.scene; m.rotation.x = Math.PI / 2;
    const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new THREE.Vector3());
    const k = CAR_LEN / Math.max(sz.x, sz.y, sz.z); m.scale.setScalar(k);
    const holder = new THREE.Group(); holder.add(m); m.position.z = 0;
    m.traverse(o => { if (o.isMesh) { o.renderOrder = 200; o.material.depthTest = true; } });
    const b2 = new THREE.Box3().setFromObject(holder); m.position.z = -b2.min.z + .5; car.add(holder); res();
  }, () => res());
});

// pose de la cámara
const FRONT_YAW = THREE.MathUtils.degToRad(28), BACK = 430, HGT = 330;
let camPos = new THREE.Vector3(0, 0, 3000), camTgt = new THREE.Vector3(), camH = 0, carH = 0, orbit = 0, firstStreet = true;
const unwrapTo = (a, ref) => ref + Math.atan2(Math.sin(a - ref), Math.cos(a - ref));

function streetState() {
  const s = STEPS[st.step];
  if (s.kind === "leg") {
    const R = ROUTE[s.leg], u = Math.max(0, Math.min(1, progMs() / legMs()));
    const ea = .04, v = 1 / (1 - ea);   // arranque y frenado suaves
    const f = u < ea ? v * u * u / (2 * ea) : u > 1 - ea ? 1 - v * (1 - u) * (1 - u) / (2 * ea) : v * (u - ea / 2);
    const p = routeAt(s.leg, f * R.L);
    return { x: p.x, y: p.y, h: p.h, moving: true, frac: f, leg: s.leg, u };
  }
  // parado en un lugar: al final del último tramo que llegó aquí o en el punto del lugar
  let k = st.step, lastLeg = null;
  while (k > 0 && STEPS[k].kind !== "ov") { if (STEPS[k].kind === "leg") { lastLeg = STEPS[k].leg; break; } k--; }
  const at = s.at;
  if (lastLeg && STEPS[k].to === at) { const p = routeAt(lastLeg, ROUTE[lastLeg].L); return { x: p.x, y: p.y, h: p.h, moving: false }; }
  const nxt = STEPS[st.step + 1];
  if (nxt && nxt.kind === "leg") { const p = routeAt(nxt.leg, 0); return { x: p.x, y: p.y, h: p.h, moving: false }; }
  const v = VP[at] || { x: 0, y: 0 }; return { x: v.x, y: v.y, h: carH, moving: false };
}
function legsOfDay(di) { return STEPS.map((s, i) => ({ s, i })).filter(o => o.s.kind === "leg" && o.s.di === di); }

let lastT = performance.now(), fade = null, arrZoom = false; const finLabels = {};
function streetDraw(now) {
  const dt = Math.min(.5, (now - lastT) / 1000); lastT = now;
  const s = STEPS[st.step], S = streetState();
  for (const c in CG) CG[c].visible = c === s.c3;
  carH = unwrapTo(S.h, carH) * .25 + carH * .75;
  car.position.set(S.x, S.y, 0); car.rotation.z = carH + Math.PI / 2;
  car.visible = S.moving; papa.visible = !S.moving;
  if (!S.moving) { const v = VP[s.at]; if (v) { S.x = v.x; S.y = v.y; } papa.position.set(S.x, S.y, 0); }
  // tramos: recorridos, actual y siguiente planificado
  const day = s.di;
  for (const k in RIB) setRib(k, false, 0);
  STEPS.forEach((x, i) => {
    if (x.kind !== "leg") return;
    if (i < st.step) setRib(x.leg, false, 1);
    else if (i === st.step) setRib(x.leg, true, S.frac);
    else if (i === st.step + 1) setRib(x.leg, true, 0);
  });
  // cámara: frente al auto, 3/4; gira despacio cuando está detenido
  if (S.moving) orbit *= Math.exp(-dt * .8); else orbit += dt * THREE.MathUtils.degToRad(2.2);
  const targetH = unwrapTo(S.h, camH); camH += (targetH - camH) * (1 - Math.exp(-dt * 1.6));
  const yaw = camH + FRONT_YAW + orbit;
  const want = new THREE.Vector3(S.x + Math.cos(yaw) * BACK, S.y + Math.sin(yaw) * BACK, HGT), wantT = new THREE.Vector3(S.x, S.y, 8);
  // entre lugares sin recorrido confirmado la cámara no viaja: fundido y corte
  if (!fade && !firstStreet && camTgt.distanceTo(wantT) > 600) fade = { t0: now, cut: false };
  let k = firstStreet ? 1 : 1 - Math.exp(-dt * 2.2); firstStreet = false;
  if (fade) {
    const t = (now - fade.t0) / 1000, a = t < .35 ? t / .35 : Math.max(0, 1 - (t - .35) / .45);
    $("fade").style.opacity = a.toFixed(3);
    if (t >= .35 && !fade.cut) { fade.cut = true; camPos.copy(want); camTgt.copy(wantT); camH = targetH; }
    if (!fade.cut) k = 0;
    if (t > .8) { fade = null; $("fade").style.opacity = 0; }
  }
  camPos.lerp(want, k); camTgt.lerp(wantT, k);
  cam3.position.copy(camPos); cam3.lookAt(camTgt);
  // los textos planos se orientan para leerse horizontales en pantalla
  const look = new THREE.Vector3().subVectors(camTgt, camPos), rz = Math.atan2(look.y, look.x) - Math.PI / 2;
  const place = (m, z = 0) => { m.position.set(m.userData.x, m.userData.y, z); m.rotation.z = rz; };
  updateSide(s.c3, camTgt.x, camTgt.y); sideLabels.forEach(m => place(m));
  for (const kk in routeLabels) routeLabels[kk].forEach(m => m.visible = false);
  legsOfDay(day).forEach(({ s: x, i }) => { if (i <= st.step + 1) buildRouteLabels(x.leg).forEach(m => { m.visible = true; place(m); }); });
  // lugares del día
  const dayVenues = new Set(DIAS[day] ? DIAS[day].items.map(it => it.lugar || it.a).filter(Boolean) : []);
  const cur = s.kind === "ev" ? s.at : s.to;
  const ph = (now % 1800) / 1800;
  for (const kk in VP) {
    const v = VP[kk], on = dayVenues.has(kk) && v.city === s.c3 && !LUGARES[kk].oculto;
    v.dot.visible = v.wr.visible = on; v.ring.visible = on && kk === cur;
    v.ring.scale.setScalar(1 + ph * 2.2); v.ring.material.opacity = (1 - ph) * .9;
    if (on) {   // nombre centrado encima del punto, en pantalla
      const m = venueLabel(kk); m.visible = true;
      const fx = Math.cos(rz - Math.PI / 2), fy = Math.sin(rz - Math.PI / 2), off = m.geometry.parameters.height / 2 + 26;   // debajo del punto
      m.position.set(v.x + fx * off, v.y + fy * off, 0); m.rotation.z = rz; m.material.opacity = kk === cur ? 1 : .55;
    }
    else if (v.label) v.label.visible = false;
  }
  // rótulo del punto final del recorrido (p. ej. CIRCUITO DE PLAYAS) mientras dura la pausa de llegada
  for (const kk in finLabels) finLabels[kk].visible = false;
  if (s.kind === "leg" && s.fin && arrived()) {
    const m = finLabels[s.leg] || (finLabels[s.leg] = flatLabel([s.fin.toUpperCase()], { px: 60, font: serif, color: "#fff", box: INK, order: ORD.pin + 1 }, 21, CG.lima));
    const e = routeAt(s.leg, ROUTE[s.leg].L), fx = Math.cos(rz - Math.PI / 2), fy = Math.sin(rz - Math.PI / 2), off = 21 / 2 + 40;
    m.userData = { x: e.x + fx * off, y: e.y + fy * off }; place(m); m.visible = true;
  }
  if (papa.visible) papa.rotation.z = Math.atan2(camPos.y - S.y, camPos.x - S.x) + Math.PI / 2 + Math.sin(now / 1400) * .08;   // mira a la cámara
  renderer.render(scene, cam3);
  return S;
}

/* ======================= panel ======================= */
const body = $("body"), strip = $("strip");
$("kick").textContent = TITULO;
strip.innerHTML = DIAS.map((d, i) => `<div class="sd" data-i="${i}"><div class="a">${d.corto}</div><div class="b">${d.num}</div><div class="u"></div></div>`).join("");
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const tc = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/ Y /g, " y ");
function viasDe(k) { const seen = []; ROUTE[k].names.forEach(([n, a, b]) => { if (n && b - a > 400 && !seen.includes(n)) seen.push(n); }); return seen.slice(0, 4); }
// distancias de vuelo (km, en línea recta) entre las ciudades
const LL = { LIMA: [-12.022, -77.114], CHICLAYO: [-6.787, -79.828], "SANTA CRUZ": [-6.626, -78.944], "ZAÑA": [-6.922, -79.585], CUSCO: [-13.536, -71.939], PUCALLPA: [-8.378, -74.574], PIMENTEL: [-6.837, -79.934] };
function kmEntre(a, b) { if (!LL[a] || !LL[b]) return null; const r = Math.PI / 180, [la1, lo1] = LL[a], [la2, lo2] = LL[b];
  const h = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); }
const nombreC = c => c === "ROMA" ? "Roma" : c === "BUENOS AIRES" ? "Buenos Aires" : tc(c);
function dayHTML(di) {
  const d = DIAS[di];
  return `<div class="dayhead"><div><div class="dname">${d.dia}</div><div class="dnum">${d.num}</div></div><div class="city">${esc(d.ciudad)}</div></div>
  <div class="evs">${d.items.map((it, i) => it.tramo
    ? `<div class="ev leg" data-i="${i}"><span class="nowtag">EN CAMINO</span><div class="lt">${esc(it.titulo || "Traslado a " + LUGARES[it.a].nombre)}</div><div class="lv">${viasDe(it.tramo).map(esc).join(" · ")}</div><div class="lp"><div class="bar"><i></i></div><div class="lx"></div></div></div>`
    : it.vuelo
    ? `<div class="ev leg air" data-i="${i}"><span class="nowtag">EN VUELO</span><div class="lt">${it.hora ? "<b>" + it.hora + "</b> " : ""}${INTL.has(it.de) ? "Llegada desde " + esc(nombreC(it.de)) : (it.vehiculo === "helicoptero" ? "Helicóptero a " : "Vuelo a ") + esc(nombreC(it.a))}</div><div class="lv">${esc(nombreC(it.de))} → ${esc(nombreC(it.a))}${kmEntre(it.de, it.a) ? " · " + Math.round(kmEntre(it.de, it.a) / 10) * 10 + " km aprox." : ""}${it.min && !INTL.has(it.de) && !INTL.has(it.a) ? " · " + (it.min >= 60 ? Math.floor(it.min / 60) + " h " + String(it.min % 60).padStart(2, "0") : it.min + " min") : ""}</div><div class="lp"><div class="bar"><i></i></div><div class="lx"></div></div></div>`
    : `<div class="ev" data-i="${i}"><span class="nowtag">AHORA</span><b>${it.hora}</b> ${esc(it.texto)}</div>`).join("")}</div>`;
}
function ovHTML() {
  return `<div class="ovt">Agenda de<br>la visita</div><div class="ovsub">Seis días, siete ciudades</div>
  <div class="ovl">${DIAS.map(d => `<div class="ovr"><div class="n">${d.num}</div><div class="d">${d.dia}</div><div class="c">${esc(tc(d.ciudad))}</div></div>`).join("")}</div>`;
}
let curDay = null;
function panelEnter(instant) {
  const s = STEPS[st.step], day = s.kind === "ov" ? -1 : s.di;
  strip.querySelectorAll(".sd").forEach(el => { const i = +el.dataset.i; el.className = "sd" + (i === day ? " cur" : day >= 0 && i < day ? " done" : ""); });
  const apply = () => body.querySelectorAll(".ev").forEach(el => { const i = +el.dataset.i; el.className = "ev" + (el.classList.contains("leg") ? " leg" : "") + (i < s.ii ? " past" : i === s.ii ? " now" : i === s.ii + 1 ? " next" : ""); });
  if (day === curDay) { apply(); return; }
  curDay = day;
  const fill = () => { body.innerHTML = s.kind === "ov" ? ovHTML() : dayHTML(day); body.classList.toggle("dense", s.kind !== "ov" && DIAS[day].items.length > 5); body.classList.toggle("xdense", s.kind !== "ov" && DIAS[day].items.length > 7); if (s.kind !== "ov") apply(); };
  if (instant) { fill(); return; }
  body.classList.add("out");
  setTimeout(() => { fill(); body.classList.remove("out"); body.classList.add("pre"); void body.offsetWidth; body.classList.remove("pre"); }, 360);
}
const hhmm = d => { let h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0"); const ap = h < 12 ? "a. m." : "p. m."; h = h % 12 || 12; return `${h}:${m} ${ap}`; };
let lastPanel = 0;
function panelTick(S) {
  const now = Date.now(); if (now - lastPanel < 250) return; lastPanel = now;
  $("clock").textContent = "Lima · " + hhmm(new Date());
  $("demo").style.display = st.demo ? "block" : "none";
  const s = STEPS[st.step];
  if (s.kind === "air") {
    const el = body.querySelector(`.ev.leg[data-i="${s.ii}"]`); if (!el) return;
    const f = legFrac(), D = kmEntre(s.from, s.to), r = rate(), remain = r > 0 ? (legMs() - progMs()) / r : null;
    el.querySelector(".bar i").style.width = (f * 100).toFixed(1) + "%";
    el.querySelector(".lx").innerHTML = arrived() ? `Aterrizó${!INTL.has(s.to) ? " en " + esc(nombreC(s.to)) : ""}` : (D ? `${Math.round(f * D)} de ${Math.round(D)} km · ` : "") + (remain != null && remain > 0 ? `aterrizaje aprox. ${hhmm(new Date(now + remain))}` : st.paused ? "en pausa" : "");
    return;
  }
  if (s.kind !== "leg" || !S) return;
  const el = body.querySelector(`.ev.leg[data-i="${s.ii}"]`); if (!el) return;
  const R = ROUTE[s.leg], km = x => (x / 1000).toFixed(1).replace(".", ",");
  el.querySelector(".bar i").style.width = (S.frac * 100).toFixed(1) + "%";
  const r = rate(), remain = r > 0 ? (legMs() - progMs()) / r : null;
  const calle = streetAt(s.leg, S.frac * R.L);
  if (arrived()) { el.querySelector(".lx").innerHTML = `Llegó${s.fin ? " a " + esc(s.fin) : ""} · ${km(R.L)} km recorridos`; return; }
  el.querySelector(".lx").innerHTML = `${km(S.frac * R.L)} de ${km(R.L)} km` + (remain != null && remain > 0 ? ` · llegada aprox. ${hhmm(new Date(now + remain))}` : st.paused ? " · en pausa" : "") + (calle ? `<br><span class="cal">Ahora por ${esc(calle)}</span>` : "");
}

/* ======================= control ======================= */
let mode = null;
function go(n, instant, local) {
  n = Math.max(0, Math.min(LAST, n));
  const prev = st.step; st.step = n; arrZoom = false;
  if (moving(STEPS[n])) { st.base = 0; st.t0 = clock() + (STEPS[n].kind === "air" ? 1100 : 0); st.paused = false; st.speed = 1; }   // el avión espera un segundo en tierra mientras aparece el mapa   // cada traslado empieza a velocidad normal
  save(local); enter(prev, instant);
}
function enter(prev, instant) {
  const s = STEPS[st.step];
  const switched = s.mode !== mode;
  if (switched) { mode = s.mode; $("street").style.opacity = mode === "street" ? 1 : 0; $("countrywrap").style.opacity = mode === "country" ? 1 : 0; if (mode === "street") firstStreet = instant || prev === st.step; }
  // al pasar de las calles al mapa del Perú, el mapa aparece ya encuadrado (sin viaje de cámara)
  countryEnter(prev, instant || switched); panelEnter(instant);
}
// velocidad del traslado en niveles fijos; un aviso chico en la esquina del panel muestra el nivel
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5, 10];
let toastT = 0;
function setSpeed(dir) {
  rebase();
  let i = SPEEDS.indexOf(st.speed); if (i < 0) i = SPEEDS.indexOf(1);
  i = dir === 0 ? SPEEDS.indexOf(1) : Math.max(0, Math.min(SPEEDS.length - 1, i + dir));
  st.speed = SPEEDS[i]; save();
  const el = $("speed"); el.textContent = "Velocidad ×" + String(st.speed).replace(".", ",") + (i === SPEEDS.length - 1 && dir > 0 ? " (máx.)" : i === 0 && dir < 0 ? " (mín.)" : "");
  el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2000);
  $("hspeed").textContent = "×" + String(st.speed).replace(".", ",");
}
function firstOfDay(di) { return STEPS.findIndex(s => s.kind !== "ov" && s.di === di); }
addEventListener("keydown", e => {
  const k = e.key, s = STEPS[st.step];
  if (["ArrowRight", " ", "PageDown", "Enter"].includes(k)) go(st.step + 1);
  else if (["ArrowLeft", "PageUp", "Backspace"].includes(k)) go(st.step - 1);
  else if (k === "0" || k === "Home") go(0);
  else if (k >= "1" && k <= String(DIAS.length)) go(firstOfDay(+k - 1));
  else if ((k === "p" || k === "P") && moving(s)) { rebase(); st.paused = !st.paused; save(); }
  else if ((k === "+" || k === "=") && moving(s)) setSpeed(+1);
  else if ((k === "-" || k === "_") && moving(s)) setSpeed(-1);
  else if ((k === "n" || k === "N") && moving(s)) setSpeed(0);
  else if (k === "d" || k === "D") { rebase(); st.demo = !st.demo; save(); }
  else if (k === "f" || k === "F") toggleFull();
  else if (k === "h" || k === "H") { const h = $("help"); h.style.display = h.style.display === "block" ? "none" : "block"; }
  else return;
  e.preventDefault();
});
// pantalla completa (sin la interfaz alrededor): tecla F o doble clic
function toggleFull() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} }
addEventListener("dblclick", toggleFull);
function fit() { const k = Math.min(innerWidth / 1920, innerHeight / 1080); $("stage").style.transform = `translate(${(innerWidth - 1920 * k) / 2}px, ${(innerHeight - 1080 * k) / 2}px) scale(${k})`; }
addEventListener("resize", fit); fit();

function frame(now) {
  let S = null;
  if (mode === "street") S = streetDraw(now);
  if (mode === "country") countryDraw(now);
  const s = STEPS[st.step];
  if (moving(s) && progMs() >= legMs()) {   // llegó: pausa breve y luego pasa a la actividad siguiente
    if (!arrZoom) { arrZoom = true; if (s.kind === "air" && !INTL.has(s.to)) cMove(frameFor([s.to], 340), 1500); }
    const r = rate(); if (r > 0 && (progMs() - legMs()) / r >= PAUSA_SEG * 1000 && STEPS[st.step + 1] && !moving(STEPS[st.step + 1])) go(st.step + 1, false, true);   // cada pantalla avanza sola, sin enviar
  }
  panelTick(S);
  requestAnimationFrame(frame);
}

// conexión con el servidor de sincronización (solo cuando la página se sirve desde Cloudflare)
function connectSync() {
  if (INL || !/^https?:$/.test(location.protocol) || /claude|localhost|127\.0\.0\.1/.test(location.hostname) && !new URLSearchParams(location.search).has("sync")) return;
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/sync";
  try { sock = new WebSocket(url); } catch (e) { return; }
  let pingT = 0;
  sock.onopen = () => { sockOk = true; ping(); pingT = setInterval(ping, 20000); };
  const ping = () => { try { sock.send(JSON.stringify({ type: "ping", t: Date.now() })); } catch (e) {} };
  sock.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === "pong") { const rtt = Date.now() - m.t; OFFSET = m.now - (m.t + rtt / 2); return; }
    if (m.type === "state") {
      if (!m.state) { save(); return; }                       // sala vacía: se sube el estado de esta pantalla
      if (m.id === MY_ID) return;                              // es el eco de lo que esta pantalla envió
      const prev = st.step; st = { ...st, ...m.state }; save(true);
      arrZoom = false; enter(prev, false);
      $("hspeed").textContent = "×" + String(st.speed).replace(".", ",");
    }
  };
  sock.onclose = () => { sockOk = false; clearInterval(pingT); setTimeout(connectSync, 3000); };   // reintenta solo
  sock.onerror = () => { try { sock.close(); } catch (e) {} };
}

(async () => {
  await fontsReady(); await carReady; await papaReady;
  const q = new URLSearchParams(location.search), saved = load();
  if (q.has("paso")) { st.step = Math.max(0, Math.min(LAST, +q.get("paso"))); if (moving(STEPS[st.step])) { st.t0 = clock(); st.base = (+q.get("avance") || 0) * legMs(); } if (q.has("demo")) st.demo = true; }
  else if (saved) st = saved;
  enter(st.step, true);
  $("hspeed").textContent = "×" + String(st.speed).replace(".", ",");
  window.__ready = true;
  connectSync();
  requestAnimationFrame(frame);
})();
