// Pantalla de inicio (elegir contenido) y especial «Los papas en el Perú»
// Vistas: "home" (pantalla dividida), "ruta" (recorrido en vivo), "hist" (especial). Se elige con clic; Esc vuelve al inicio.
// Enlace directo: #ruta o #historia (para OBS, sin pasar por el inicio).

const NS = "http://www.w3.org/2000/svg";
function add(par, tag, at = {}) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); par.appendChild(e); return e; }
const tc = c => c.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

/* ======================= datos del especial ======================= */
// Fuentes: vatican.va (discursos de llegada y despedida 1985 y 1988), Andina (2018), El Comercio, programa oficial 2026
const CIU = {   // lon, lat · departamento
  LIMA: [-77.043, -12.046, ["LIMA", "CALLAO"]], AREQUIPA: [-71.537, -16.409, ["AREQUIPA"]], CUSCO: [-71.978, -13.516, ["CUSCO"]],
  AYACUCHO: [-74.224, -13.159, ["AYACUCHO"]], PIURA: [-80.633, -5.194, ["PIURA"]], TRUJILLO: [-79.029, -8.112, ["LA LIBERTAD"]],
  IQUITOS: [-73.254, -3.749, ["LORETO"]], "PUERTO MALDONADO": [-69.189, -12.593, ["MADRE DE DIOS"]],
  CHICLAYO: [-79.841, -6.771, ["LAMBAYEQUE"], "l"], "SANTA CRUZ": [-78.944, -6.626, ["CAJAMARCA"], "r"], PUCALLPA: [-74.583, -8.393, ["UCAYALI"]],
};
const VISITAS = [
  { anio: "1985", papa: "Juan Pablo II", fechas: "1 – 5 DE FEBRERO", corto: "JUAN PABLO II", dato: "5 días · 8 ciudades",
    nota: "Primera visita de un papa al Perú",
    paradas: [
      ["1 feb", "LIMA", "Llegada al Callao; lo recibe el presidente Fernando Belaúnde"],
      ["2 feb", "AREQUIPA", "Beatifica a sor Ana de los Ángeles Monteagudo"],
      ["2 feb", "LIMA", "Misa con los jóvenes en el Hipódromo de Monterrico"],
      ["3 feb", "CUSCO", "Liturgia de la Palabra en Sacsayhuamán"],
      ["3 feb", "AYACUCHO", "Llamado a la paz a quienes habían tomado las armas"],
      ["3 feb", "LIMA", "Misa por las familias en Monterrico"],
      ["4 feb", "LIMA", "Encuentro con enfermos y ancianos en el Callao"],
      ["4 feb", "PIURA", "Liturgia de la Palabra"],
      ["4 feb", "TRUJILLO", "Misa por los trabajadores en el actual Óvalo Papal"],
      ["5 feb", "LIMA", "Encuentro con los pobres en Villa El Salvador"],
      ["5 feb", "IQUITOS", "Encuentro con pueblos amazónicos y partida"],
    ] },
  { anio: "1988", papa: "Juan Pablo II", fechas: "14 – 16 DE MAYO", corto: "JUAN PABLO II", dato: "Unas 40 horas · Lima",
    nota: "Clausura del Congreso Eucarístico y Mariano Bolivariano",
    paradas: [
      ["14 may", "LIMA", "Llegada; lo recibe el presidente Alan García. Rosa de Oro a la Virgen de la Evangelización"],
      ["15 may", "LIMA", "Misa de clausura del congreso en la explanada de Plaza San Miguel, en la Av. La Marina"],
      ["16 may", "LIMA", "Despedida en el aeropuerto Jorge Chávez y partida a Paraguay"],
    ] },
  { anio: "2018", papa: "Francisco", fechas: "18 – 21 DE ENERO", corto: "FRANCISCO", dato: "4 días · 3 ciudades",
    nota: "Lema: «Unidos por la esperanza»",
    paradas: [
      ["18 ene", "LIMA", "Llegada; lo recibe el presidente Pedro Pablo Kuczynski"],
      ["19 ene", "PUERTO MALDONADO", "Encuentro con pueblos amazónicos"],
      ["19 ene", "LIMA", "En Palacio de Gobierno: «la corrupción es evitable»"],
      ["20 ene", "TRUJILLO", "Misa en la playa de Huanchaco"],
      ["21 ene", "LIMA", "Misa de clausura en la Base Aérea Las Palmas, con más de un millón de fieles"],
    ] },
  { anio: "2026", papa: "León XIV", fechas: "11 – 16 DE NOVIEMBRE", corto: "LEÓN XIV", dato: "6 días · 7 ciudades",
    nota: "Programa oficial de la visita",
    paradas: [
      ["11 nov", "LIMA", "Llegada a la Base Aérea del Callao y bienvenida en Palacio"],
      ["12 nov", "LIMA", "Catedral de Lima y vigilia con jóvenes en el Estadio Nacional"],
      ["13 nov", "CHICLAYO", "Misa en las Pampas de Pimentel y encuentro en la USAT"],
      ["14 nov", "SANTA CRUZ", "Misa en Santa Cruz de Succhabamba, Cajamarca"],
      ["14 nov", "CHICLAYO", "Clausura del Año Jubilar de Santo Toribio, en Zaña"],
      ["15 nov", "CUSCO", "Encuentro en Saqsaywaman y Ángelus frente a la Catedral"],
      ["15 nov", "PUCALLPA", "Encuentro con pueblos amazónicos y misa"],
      ["16 nov", "LIMA", "Misa en Las Palmas y despedida rumbo a Roma"],
    ] },
];

// pasos: portada, y por cada visita una vista general seguida de cada parada; al final, el resumen
const PASOS = [{ k: "portada" }];
VISITAS.forEach((v, vi) => { PASOS.push({ k: "visita", vi, pi: -1 }); v.paradas.forEach((p, pi) => PASOS.push({ k: "visita", vi, pi })); });
PASOS.push({ k: "resumen" });
const RESUMEN = (() => { const m = {}; VISITAS.forEach(v => v.paradas.forEach(([, c]) => { (m[c] = m[c] || new Set()).add(v.anio); }));
  return Object.entries(m).map(([c, s]) => [c, [...s]]).sort((a, b) => b[1].length - a[1].length || a[1][0].localeCompare(b[1][0])); })();

/* ======================= estilos ======================= */
const CSS = `
#home,#hist{position:absolute;left:0;top:0;width:1920px;height:1080px;background:var(--paper);transition:opacity .6s ease;z-index:6}
.vhide{opacity:0;pointer-events:none}
#home{display:flex}
.hh{position:relative;width:960px;height:1080px;cursor:pointer;user-select:none;transition:background .4s;overflow:hidden}
.hh:hover{background:#FAF8F3}
.hh+.hh{border-left:1px solid #E7E3DA}
.hh svg{position:absolute;left:150px;top:70px;width:660px;height:614px}
.hh .tx{position:absolute;left:110px;right:110px;top:720px}
.hh .k{font:600 15px/1 var(--sans);letter-spacing:.24em;color:var(--mute)}
.hh .t{font:900 72px/1.04 var(--serif);color:var(--ink);margin-top:20px}
.hh .s{font:400 24px/1.4 var(--sans);color:var(--mute);margin-top:18px}
.hh .u{height:3px;width:72px;background:var(--gold);margin-top:28px;transition:width .5s ease}
.hh:hover .u{width:180px}
.hh .live{display:inline-block;width:10px;height:10px;border-radius:50%;background:#B3261E;margin-right:10px;vertical-align:1px}
.hh .nb{fill:var(--land2);stroke:#fff;stroke-width:1}
.hh .dp{fill:var(--land);stroke:#fff;stroke-width:.8}
.hh .dp.tour{fill:var(--gold-soft)}
.hh .pe{fill:none;stroke:#A9A59B;stroke-width:1.2}
#hmap{position:absolute;left:0;top:0;width:1160px;height:1080px}
#hmap .nb{fill:var(--land2);stroke:#fff;stroke-width:1.2;vector-effect:non-scaling-stroke}
#hmap .dp{fill:var(--land);stroke:#fff;stroke-width:1.1;vector-effect:non-scaling-stroke;transition:fill .9s}
#hmap .dp.tour{fill:var(--gold-soft)}
#hmap .dp.on{fill:var(--gold)}
#hmap .pe{fill:none;stroke:#A9A59B;stroke-width:1.4;vector-effect:non-scaling-stroke}
#hmap .arc{fill:none;stroke:var(--ink);stroke-linecap:round;transition:stroke-dashoffset 1.1s ease,opacity .6s}
#hmap .cl{font-family:var(--serif);font-weight:700;letter-spacing:.08em;fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-linejoin:round;transition:opacity .5s}
#hmap .cy{font-family:var(--sans);font-weight:700;fill:var(--gold);letter-spacing:.06em;paint-order:stroke;stroke:#fff;stroke-linejoin:round}
#hmap .cl.cur{fill:#fff;stroke:none}
#hmap .dot{fill:#fff;stroke:var(--ink);vector-effect:non-scaling-stroke;stroke-width:2.4;transition:opacity .5s}
#hmap .dot.cur{fill:var(--ink);stroke:#fff;stroke-width:3}
#hpanel{position:absolute;left:1160px;top:0;width:760px;height:1080px;padding:70px 72px 0 64px;border-left:1px solid #E7E3DA;background:var(--paper)}
#hbody{position:absolute;left:64px;right:72px;top:150px;bottom:150px;transition:opacity .35s ease,transform .35s ease}
#hbody.out{opacity:0;transform:translateY(-14px)}
#hbody.pre{opacity:0;transform:translateY(18px);transition:none}
#hbody .dnum{font-size:132px}
#hbody .city{font-size:34px;max-width:none}
.hdato{font:600 17px/1.5 var(--sans);color:var(--gold);margin-top:16px;letter-spacing:.02em}
.hnota{font:400 20px/1.4 var(--sans);color:var(--mute);margin-top:4px}
#hbody .evs{margin-top:34px}
#hbody .ev{font-size:21px;margin-bottom:12px}
#hbody.dense .ev{font-size:18px;margin-bottom:7px;line-height:1.3}
#hbody.dense .ev:before{top:5px;width:13px;height:13px;left:-44px}
#hbody.dense .dnum{font-size:104px}
#hbody .ev .cc{font-weight:700;letter-spacing:.06em;font-size:.82em;color:var(--gold)}
#hbody .ovr .d{width:auto;flex:1;text-align:right;letter-spacing:.12em}
#hbody .ovr .c{flex:none}
#hbody .ovl{margin-top:36px}
#hbody .ovr{padding:12px 0}
#hstrip{position:absolute;left:64px;right:72px;bottom:58px;display:flex;justify-content:space-between;border-top:1px solid #E7E3DA;padding-top:20px}
#hstrip .sd{width:19%}
#hstrip .sd .a{font-size:12px;letter-spacing:.1em}
`;

/* ======================= mapa ======================= */
export function initHistoria(MAPPE, onView) {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const k = MAPPE.scale, [tx, ty] = MAPPE.translate, r = Math.PI / 180;
  const P = c => { const [lo, la] = CIU[c]; return [tx + k * lo * r, ty - k * Math.log(Math.tan(Math.PI / 4 + la * r / 2))]; };
  const stage = document.getElementById("stage");
  function peru(svg, cls = "") {
    const g = add(svg, "g", { class: cls });
    MAPPE.neighbors.forEach(n => add(g, "path", { d: n.d, class: "nb" }));
    const dep = {}; MAPPE.depts.forEach(n => dep[n.name] = add(g, "path", { d: n.d, class: "dp" }));
    add(g, "path", { d: MAPPE.peru, class: "pe" });
    return dep;
  }
  const arcD = (a, b) => { const [ax, ay] = P(a), [bx, by] = P(b), dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), bend = .2;
    return `M${ax.toFixed(1)},${ay.toFixed(1)} Q${((ax + bx) / 2 - dy * bend).toFixed(1)},${((ay + by) / 2 + dx * bend).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`; };

  /* ---------- inicio ---------- */
  const home = document.createElement("div"); home.id = "home";
  home.innerHTML = `<div class="hh" data-v="ruta"><svg viewBox="150 40 900 840"></svg><div class="tx"><div class="k"><span class="live"></span>EN VIVO · 11 – 16 DE NOVIEMBRE</div>
    <div class="t">Recorrido<br>del Papa</div><div class="s">La agenda de León XIV en el Perú, paso a paso</div><div class="u"></div></div></div>
    <div class="hh" data-v="hist"><svg viewBox="150 40 900 840"></svg><div class="tx"><div class="k">ESPECIAL · 1985 – 2026</div>
    <div class="t">Los papas<br>en el Perú</div><div class="s">Tres papas, cuatro visitas</div><div class="u"></div></div></div>`;
  stage.appendChild(home);
  const [sL, sR] = home.querySelectorAll("svg");
  const thumb = (svg, ciudades) => {
    const dep = peru(svg);
    ciudades.forEach(c => CIU[c][2].forEach(d => dep[d] && dep[d].classList.add("tour")));
    for (let i = 1; i < ciudades.length; i++) add(svg, "path", { d: arcD(ciudades[i - 1], ciudades[i]), fill: "none", stroke: "#1D1B18", "stroke-width": 2.4, "stroke-linecap": "round" });
    ciudades.forEach(c => { const [x, y] = P(c); add(svg, "circle", { cx: x, cy: y, r: 7, fill: "#fff", stroke: "#1D1B18", "stroke-width": 2.6 }); });
  };
  thumb(sL, ["LIMA", "CHICLAYO", "SANTA CRUZ", "CHICLAYO", "CUSCO", "PUCALLPA", "LIMA"]);
  (() => { const dep = peru(sR); RESUMEN.forEach(([c, ys]) => { CIU[c][2].forEach(d => dep[d] && dep[d].classList.add("tour")); const [x, y] = P(c);
    add(sR, "circle", { cx: x, cy: y, r: 5 + ys.length * 2.5, fill: "#A3863E", "fill-opacity": .9, stroke: "#fff", "stroke-width": 2 }); }); })();

  /* ---------- especial ---------- */
  const hist = document.createElement("div"); hist.id = "hist";
  hist.innerHTML = `<svg id="hmap" viewBox="0 0 1160 1080" preserveAspectRatio="xMidYMid slice"></svg>
    <div id="hpanel"><div class="kick">Los papas en el Perú</div><div class="rule"></div><div id="hbody"></div><div id="hstrip"></div></div>`;
  stage.appendChild(hist);
  const svg = hist.querySelector("#hmap"), dep = peru(svg);
  const gArc = add(svg, "g"), gDot = add(svg, "g"), gLab = add(svg, "g");
  const NODES = {};
  Object.keys(CIU).forEach(c => {
    const [x, y] = P(c);
    const dot = add(gDot, "circle", { cx: x, cy: y, r: 8, class: "dot" });
    const g = add(gLab, "g"), box = add(g, "rect", { fill: "#1D1B18", opacity: 0 }), t = add(g, "text", { class: "cl", "text-anchor": "middle" }), yrs = add(g, "text", { class: "cy", "text-anchor": "middle" });
    t.textContent = c;
    NODES[c] = { x, y, dot, g, box, t, yrs, show: false, cur: false };
  });
  const hbody = hist.querySelector("#hbody"), hstrip = hist.querySelector("#hstrip");
  hstrip.innerHTML = VISITAS.map((v, i) => `<div class="sd" data-p="${PASOS.findIndex(p => p.k === "visita" && p.vi === i)}"><div class="a">${v.corto}</div><div class="b">${v.anio}</div><div class="u"></div></div>`).join("")
    + `<div class="sd" data-p="${PASOS.length - 1}"><div class="a">LAS CUATRO</div><div class="b">Todas</div><div class="u"></div></div>`;
  hstrip.addEventListener("click", e => { const el = e.target.closest(".sd"); if (el) hgo(+el.dataset.p); });
  hstrip.addEventListener("dblclick", e => e.stopPropagation());

  // cámara: viewBox animado
  let vb = [0, 0, 1160, 1080], vf = vb, vt = vb, v0 = 0, vd = 1;
  function frameOn(cs) {
    if (!cs.length) return [0, 0, 1160, 1080];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    cs.forEach(c => { const [x, y] = P(c); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    let w = Math.max(x1 - x0 + 260, 620), h = Math.max(y1 - y0 + 260, 620 * 1080 / 1160);
    if (w / h > 1160 / 1080) h = w * 1080 / 1160; else w = h * 1160 / 1080;
    w = Math.min(w, 1160); h = Math.min(h, 1080);
    return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
  }
  const cam = (t, ms) => { vf = vb.slice(); vt = t; v0 = performance.now(); vd = ms; };

  let paso = 0, curV = null;
  function paint() {
    const p = PASOS[paso], v = p.k === "visita" ? VISITAS[p.vi] : null;
    // ciudades visibles y actual
    let vis = [], cur = null, ruta = [];
    if (p.k === "portada" || p.k === "resumen") vis = Object.keys(CIU);
    else { ruta = v.paradas.map(x => x[1]); vis = [...new Set(ruta)]; if (p.pi >= 0) cur = ruta[p.pi]; }
    const hasta = p.k === "visita" ? (p.pi < 0 ? ruta.length - 1 : p.pi) : -1;
    // departamentos
    const on = cur ? CIU[cur][2] : [], soft = vis.flatMap(c => CIU[c][2]);
    for (const d in dep) { dep[d].classList.toggle("on", on.includes(d)); dep[d].classList.toggle("tour", !on.includes(d) && soft.includes(d) && p.k !== "portada"); }
    // trazos de la visita (se dibujan hasta la parada actual)
    if (v !== curV) { gArc.innerHTML = ""; curV = v;
      if (v) for (let i = 1; i < ruta.length; i++) if (ruta[i] !== ruta[i - 1]) { const a = add(gArc, "path", { d: arcD(ruta[i - 1], ruta[i]), class: "arc", pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 }); a.dataset.i = i; } }
    gArc.querySelectorAll(".arc").forEach(a => a.setAttribute("stroke-dashoffset", +a.dataset.i <= hasta ? 0 : 1));
    for (const c in NODES) {
      const n = NODES[c]; n.show = vis.includes(c); n.cur = c === cur;
      n.dot.style.opacity = n.show ? 1 : 0; n.g.style.opacity = n.show ? 1 : 0;
      n.dot.classList.toggle("cur", n.cur); n.t.classList.toggle("cur", n.cur);
      const ys = RESUMEN.find(x => x[0] === c)[1];
      n.yrs.textContent = p.k === "resumen" ? ys.join(" · ") : "";
      n.dot.setAttribute("r", p.k === "resumen" ? 6 + ys.length * 3 : 8);
      n.dot.style.fill = p.k === "resumen" ? "#A3863E" : ""; n.dot.style.stroke = p.k === "resumen" ? "#fff" : "";
    }
    cam(frameOn(p.k === "visita" ? vis : []), 1300);
    // panel
    hstrip.querySelectorAll(".sd").forEach((el, i) => { const vi = p.k === "resumen" ? 4 : p.k === "visita" ? p.vi : -1;
      el.className = "sd" + (i === vi ? " cur" : vi >= 0 && i < vi ? " done" : ""); });
    const key = p.k === "visita" ? "v" + p.vi : p.k;
    const apply = () => hbody.querySelectorAll(".ev").forEach(el => { const i = +el.dataset.i;
      el.className = "ev" + (p.pi < 0 ? "" : i < p.pi ? " past" : i === p.pi ? " now" : i === p.pi + 1 ? " next" : ""); });
    if (key === hbody.dataset.key) { apply(); return; }
    hbody.dataset.key = key;
    const fill = () => {
      if (p.k === "portada") hbody.innerHTML = `<div class="ovt">Los papas<br>en el Perú</div><div class="ovsub">Tres papas, cuatro visitas en 41 años</div>
        <div class="ovl">${VISITAS.map(v => `<div class="ovr"><div class="n">${v.anio.slice(2)}</div><div class="c">${esc(v.papa)}</div><div class="d">${v.fechas.replace(" DE ", " ").replace("DE ", "")}</div></div>`).join("")}</div>`;
      else if (p.k === "resumen") hbody.innerHTML = `<div class="ovt">Las cuatro<br>visitas</div><div class="ovsub">Lima recibió al Papa en todas</div>
        <div class="ovl">${RESUMEN.filter(x => x[1].length > 1).map(([c, ys]) => `<div class="ovr"><div class="n">${ys.length}</div><div class="c">${esc(tc(c))}</div><div class="d">${ys.join(" · ")}</div></div>`).join("")}</div>
        <div class="kick" style="margin-top:44px">Una visita</div><div class="hnota" style="margin-top:14px;line-height:1.6;color:var(--text)">${RESUMEN.filter(x => x[1].length === 1).map(([c, ys]) => `${esc(tc(c))} <span style="color:var(--gold);font-weight:600;font-size:.85em">${ys[0]}</span>`).join(" · ")}</div>`;
      else hbody.innerHTML = `<div class="dayhead"><div><div class="dname">${v.fechas}</div><div class="dnum">${v.anio}</div></div></div>
        <div class="city">${esc(v.papa)}</div><div class="hdato">${esc(v.dato)}</div><div class="hnota">${esc(v.nota)}</div>
        <div class="evs">${v.paradas.map(([f, c, t], i) => `<div class="ev" data-i="${i}"><b>${esc(f)}</b> <span class="cc">${esc(c)}</span> ${esc(t)}</div>`).join("")}</div>`;
      hbody.classList.toggle("dense", !!v && v.paradas.length > 6);
      apply();
    };
    hbody.classList.add("out");
    setTimeout(() => { fill(); hbody.classList.remove("out"); hbody.classList.add("pre"); void hbody.offsetWidth; hbody.classList.remove("pre"); }, 360);
  }
  function hgo(n) { paso = Math.max(0, Math.min(PASOS.length - 1, n)); paint(); }

  function tick(now) {
    const u = Math.min(1, (now - v0) / vd), e = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    vb = vf.map((a, i) => a + (vt[i] - a) * e);
    svg.setAttribute("viewBox", vb.map(x => x.toFixed(1)).join(" "));
    const s = vb[2] / 1160;   // tamaño de texto constante en pantalla
    for (const c in NODES) {
      const n = NODES[c]; if (!n.show) continue;
      const fs = (n.cur ? 26 : 21) * s, off = 22 * s, side = CIU[c][3];
      const lx = side === "l" ? n.x - off : side === "r" ? n.x + off : n.x, ly = side ? n.y + fs * .35 : n.y + off + fs, an = side === "l" ? "end" : side === "r" ? "start" : "middle";
      n.t.setAttribute("x", lx); n.t.setAttribute("y", ly); n.t.setAttribute("text-anchor", an); n.t.setAttribute("font-size", fs); n.t.setAttribute("stroke-width", 6 * s);
      n.yrs.setAttribute("x", lx); n.yrs.setAttribute("y", ly + fs * 1.05); n.yrs.setAttribute("text-anchor", an); n.yrs.setAttribute("font-size", 15 * s); n.yrs.setAttribute("stroke-width", 5 * s);
      n.dot.setAttribute("transform", `translate(${n.x} ${n.y}) scale(${s}) translate(${-n.x} ${-n.y})`);
      if (n.cur) { const b = n.t.getBBox(), px = 14 * s, py = 8 * s; n.box.setAttribute("x", b.x - px); n.box.setAttribute("y", b.y - py); n.box.setAttribute("width", b.width + 2 * px); n.box.setAttribute("height", b.height + 2 * py); n.box.setAttribute("opacity", 1); }
      else n.box.setAttribute("opacity", 0);
    }
    gArc.querySelectorAll(".arc").forEach(a => a.setAttribute("stroke-width", 2.6 * s));
    requestAnimationFrame(tick);
  }

  /* ---------- vistas ---------- */
  let view = null;
  function setView(v) {
    view = v; document.body.dataset.view = v;
    home.classList.toggle("vhide", v !== "home"); hist.classList.toggle("vhide", v !== "hist");
    if (v === "hist") paint();
    try { history.replaceState(null, "", v === "home" ? location.pathname + location.search : "#" + (v === "hist" ? "historia" : "ruta")); } catch (e) {}
    onView && onView(v);
  }
  home.addEventListener("click", e => { const el = e.target.closest(".hh"); if (el) setView(el.dataset.v); });
  home.addEventListener("dblclick", e => e.stopPropagation());
  hist.addEventListener("dblclick", e => { if (e.target.closest("#hpanel")) e.stopPropagation(); });
  addEventListener("keydown", e => {
    if (e.key === "Escape") { if (view !== "home") { setView("home"); e.preventDefault(); } return; }
    if (view === "home") {
      if (e.key === "ArrowLeft" || e.key === "r" || e.key === "R") setView("ruta");
      else if (e.key === "ArrowRight" || e.key === "e" || e.key === "E") setView("hist");
      else return;
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (view !== "hist") return;
    const kk = e.key;
    if (["ArrowRight", " ", "PageDown", "Enter"].includes(kk)) hgo(paso + 1);
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(kk)) hgo(paso - 1);
    else if (kk === "0" || kk === "Home") hgo(0);
    else if (kk >= "1" && kk <= "4") hgo(PASOS.findIndex(p => p.k === "visita" && p.vi === +kk - 1));
    else if (kk === "5") hgo(PASOS.length - 1);
    else if (kk === "f" || kk === "F") return;   // pantalla completa: lo maneja la página
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  const h = location.hash.replace("#", "");
  setView(h === "ruta" ? "ruta" : h === "historia" ? "hist" : "home");
  requestAnimationFrame(tick);
  return { setView, get view() { return view; } };
}
