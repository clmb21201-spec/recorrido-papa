# Rutas propias sobre el grafo de OpenStreetMap (calles cerradas para la comitiva: se ignoran sentidos únicos)
# Uso: python3 herramientas/route_osm.py   (desde la raíz del repositorio)
import json, math, heapq, os, urllib.request
import osmium

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, "fuente"); os.makedirs(FUENTE, exist_ok=True)
PBF = {"lima": os.path.join(FUENTE, "Lima.osm.pbf"), "cusco": os.path.join(FUENTE, "Cusco.osm.pbf")}
if not os.path.exists(PBF["lima"]):   # extracto de OpenStreetMap de Lima (BBBike)
    urllib.request.urlretrieve("https://download.bbbike.org/osm/bbbike/Lima/Lima.osm.pbf", PBF["lima"])
# nombres populares que reemplazan a los de OpenStreetMap en los rótulos
ALIAS = {"Óvalo Saloom": "Óvalo La Perla"}
# lugares de Lima y Callao desde web/datos/agenda.json
_AG = json.load(open(os.path.join(AQUI, "..", "web", "datos", "agenda.json"), encoding="utf-8"))
V = {k: (v["lat"], v["lon"]) for k, v in _AG["lugares"].items()}
# cada tramo: lista de puntos de paso (lugar o (lat, lon)); "por" = vías que la nota menciona (se favorecen)
# Solo los recorridos confirmados. Los demás quedan en PENDIENTES hasta tener la ruta oficial.
# "auto": tramo en auto cerrado (se ve la camioneta); si no, papamóvil
LEGS = {
 "w1": {"ciudad": "lima", "auto": True,
        "pts": [(-12.0106, -77.1110), (-12.05355, -77.09807), (-12.0744, -77.09942), (-12.07776, -77.08889), (-12.07777, -77.08288), (-12.07354, -77.06253),
                (-12.08935, -77.06954), (-12.09096, -77.06476), (-12.0884, -77.06464), (-12.06322, -77.04416), (-12.0610, -77.0424)],
        "por": ["Avenida Elmer Faucett", "Avenida de La Marina", "Avenida Antonio José de Sucre", "Avenida Javier Prado Oeste", "Avenida Brasil"],
        "fuente": "Monseñor Guillermo Inca (Conferencia Episcopal, 9 nov.) y general Víctor Meza (PNP): Faucett, La Marina, Sucre, Javier Prado y Brasil"},
 "w2": {"ciudad": "lima",
        "pts": [(-12.0610, -77.0424), (-12.0600, -77.0421), (-12.0582, -77.0416), (-12.05623, -77.04191), (-12.05596, -77.03891), (-12.05489, -77.03824), (-12.0483, -77.0388),
                (-12.0455, -77.0368), (-12.0426, -77.0349), (-12.0436, -77.0332), (-12.04517, -77.0307), (-12.04613, -77.03136), (-12.0467, -77.03041),
                (-12.04578, -77.02976), (-12.0453, -77.03051)],
        "por": ["Avenida Brasil", "Avenida Bolivia", "Avenida Garcilaso de la Vega", "Avenida Tacna", "Jirón Conde de Superunda",
                "Jirón de la Unión", "Jirón Huallaga", "Jirón Carabaya", "Jirón Junín"],
        "fuente": "Mapa oficial de la Conferencia Episcopal (9 nov.): Brasil, Plaza Bolognesi, Bolivia, Garcilaso de la Vega, Conde de Superunda; vuelta a la Plaza"},
 "t1": {"ciudad": "lima",
        "pts": [(-12.0575, -77.0377), (-12.05489, -77.03824), (-12.0483, -77.0388), (-12.0455, -77.0368)],
        "por": ["Avenida Garcilaso de la Vega", "Avenida Tacna"],
        "fuente": "Mapa oficial «Ruta 4» (12 nov.): Centro Cívico, Garcilaso de la Vega, Tacna"},
 "t2": {"ciudad": "lima",
        "pts": [(-12.0455, -77.0368), (-12.0426, -77.0349), (-12.0436, -77.0332), (-12.04517, -77.0307)],
        "por": ["Avenida Tacna", "Jirón Conde de Superunda"],
        "fuente": "Mapa oficial «Ruta 4» (12 nov.): Tacna y Conde de Superunda hasta la Plaza de Armas"},
 "c1": {"ciudad": "cusco",
        "pts": [(-13.5390, -71.9440), (-13.53528, -71.95557), (-13.5322, -71.9640), (-13.5226, -71.9700), (-13.5230, -71.9745), (-13.5180, -71.9787),
                (-13.5139, -71.9800), (-13.5111, -71.9845), (-13.5075, -71.9840)],
        "por": ["Avenida Velasco Astete", "Avenida 28 de Julio", "Avenida Garcilaso", "Avenida El Sol", "Don Bosco"],
        "fuente": "Mapa oficial «Ruta de Cusco» (15 nov.): Velasco Astete, 28 de Julio, Garcilaso, El Sol, Plaza de Armas, Don Bosco (8,2 km; sujeto al clima)"},
 "m1": {"ciudad": "lima", "pts": ["lamarina_ini", (-12.0648573, -77.1192022), (-12.0523, -77.1390), "asilo"],
        "por": ["Avenida de La Marina", "Avenida Guardia Chalaca", "Plaza Garibaldi"],
        "fuente": "Ruta de Google Maps del equipo; coincide con lo que detalló el alcalde del Callao (Perú21)"},
 "m2": {"ciudad": "lima", "pts": ["asilo", (-12.0600, -77.1440), (-12.0670885, -77.151524)],
        "por": ["Calle Marco Polo", "Avenida Almirante Miguel Grau"],
        "fuente": "Ruta de Google Maps del equipo (Marco Polo y Grau hasta Chucuito)"},
}
# Pendientes: Pucallpa (Plaza de Armas → La Videnita; se confirma el 13 nov.) y los traslados en auto cerrado sin ruta publicada
COST = {"motorway": 1.0, "trunk": 1.0, "primary": 1.0, "secondary": 1.15, "tertiary": 1.35, "unclassified": 1.8,
        "residential": 2.2, "living_street": 3, "service": 4.5}
def grafo(pbf):
    coords, adj = {}, {}
    for o in osmium.FileProcessor(pbf).with_locations():
        if not o.is_way(): continue
        hw = o.tags.get("highway", "").replace("_link", "")
        if hw not in COST or o.tags.get("access") in ("private", "no") or o.tags.get("area") == "yes": continue
        nm = o.tags.get("name", ""); nm = ALIAS.get(nm, nm)
        ids = []
        for n in o.nodes:
            if not n.location.valid(): continue
            coords[n.ref] = (n.location.lat, n.location.lon); ids.append(n.ref)
        for a, b in zip(ids, ids[1:]):
            (la1, lo1), (la2, lo2) = coords[a], coords[b]
            d = math.hypot((lo2 - lo1) * 108900, (la2 - la1) * 110540)
            adj.setdefault(a, []).append((b, d, hw, nm)); adj.setdefault(b, []).append((a, d, hw, nm))
    print("nodos", len(adj))
    good = [n for n, es in adj.items() if any(e[2] in ("trunk", "primary", "secondary", "tertiary", "residential", "unclassified") for e in es)]
    return coords, adj, good
G = {}

def nearest(la, lo):
    return min(GOOD, key=lambda n: (coords[n][0] - la) ** 2 + ((coords[n][1] - lo) * 0.98) ** 2)

def dijkstra(s, t, por):
    dist, prev = {s: 0}, {}
    pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dist[u]: continue
        for v, w, hw, nm in adj[u]:
            c = w * (0.6 if nm in por else COST[hw])
            nd = d + c
            if nd < dist.get(v, 1e18): dist[v] = nd; prev[v] = (u, nm); heapq.heappush(pq, (nd, v))
    path, names = [t], []
    while path[-1] != s:
        u, nm = prev[path[-1]]; names.append(nm); path.append(u)
    return path[::-1], names[::-1]

out = {}
for k, L in LEGS.items():
    if L["ciudad"] not in G: G[L["ciudad"]] = grafo(PBF[L["ciudad"]])
    coords, adj, GOOD = G[L["ciudad"]]
    ll = [V[p] if isinstance(p, str) else p for p in L["pts"]]
    snap = [nearest(*p) for p in ll]
    path, names = [snap[0]], []
    for a, b in zip(snap, snap[1:]):
        p, n = dijkstra(a, b, set(L["por"])); path += p[1:]; names += n
    pts = [coords[n] for n in path]
    segs = []
    for (a, b), nm in zip(zip(pts, pts[1:]), names):
        d = math.hypot((b[1] - a[1]) * 108900, (b[0] - a[0]) * 110540)
        if segs and segs[-1][0] == nm: segs[-1][1] += d
        else: segs.append([nm, d])
    total = sum(d for _, d in segs)
    out[k] = {"coords": [[lo, la] for la, lo in pts], "dist": total, "dur": total / 7.0, "names": segs, "fuente": L["fuente"], "ciudad": L["ciudad"], "auto": L.get("auto", False)}
    print(k, round(total), "m |", " → ".join(f"{n or '(s/n)'} ({d:.0f})" for n, d in segs if d > 120))
json.dump({"venues": V, "legs": out}, open(os.path.join(FUENTE, "rutas_osm.json"), "w"), ensure_ascii=False)
