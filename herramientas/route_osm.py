# Rutas propias sobre el grafo de OpenStreetMap (calles cerradas para la comitiva: se ignoran sentidos únicos)
# Uso: python3 herramientas/route_osm.py   (desde la raíz del repositorio)
import json, math, heapq, os, urllib.request
import osmium

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, "fuente"); os.makedirs(FUENTE, exist_ok=True)
PBF = os.path.join(FUENTE, "Lima.osm.pbf")
if not os.path.exists(PBF):   # extracto de OpenStreetMap de Lima (BBBike)
    urllib.request.urlretrieve("https://download.bbbike.org/osm/bbbike/Lima/Lima.osm.pbf", PBF)
# nombres populares que reemplazan a los de OpenStreetMap en los rótulos
ALIAS = {"Óvalo Saloom": "Óvalo La Perla"}
# lugares de Lima y Callao desde web/datos/agenda.json
_AG = json.load(open(os.path.join(AQUI, "..", "web", "datos", "agenda.json"), encoding="utf-8"))
V = {k: (v["lat"], v["lon"]) for k, v in _AG["lugares"].items() if v["ciudad"] == "lima"}
# cada tramo: lista de puntos de paso (lugar o (lat, lon)); "por" = vías que la nota menciona (se favorecen)
# Solo los recorridos confirmados. Los demás quedan en PENDIENTES hasta tener la ruta oficial.
LEGS = {
 "m1": {"pts": ["lamarina_ini", (-12.0648573, -77.1192022), (-12.0523, -77.1390), "asilo"],
        "por": ["Avenida de La Marina", "Avenida Guardia Chalaca", "Plaza Garibaldi"],
        "fuente": "Ruta de Google Maps del equipo; coincide con lo que detalló el alcalde del Callao (Perú21)"},
 "m2": {"pts": ["asilo", (-12.0600, -77.1440), (-12.0670885, -77.151524)],
        "por": ["Calle Marco Polo", "Avenida Almirante Miguel Grau"],
        "fuente": "Ruta de Google Maps del equipo (Marco Polo y Grau hasta Chucuito)"},
}
PENDIENTES = {   # rutas estimadas, sin confirmar: no se muestran
 "w1": ["base_callao", (-12.0480, -77.0983), (-12.0437, -77.0435), "palacio"], "w2": ["palacio", "teatro"], "w3": ["teatro", "nunciatura"],
 "t1": ["nunciatura", (-12.0650, -77.0478), "plaza_mayor"], "t2": ["plaza_mayor", "estadio"], "t3": ["estadio", "nunciatura"], "m3": ["las_palmas", "base_callao"],
}
COST = {"motorway": 1.0, "trunk": 1.0, "primary": 1.0, "secondary": 1.15, "tertiary": 1.35, "unclassified": 1.8,
        "residential": 2.2, "living_street": 3, "service": 4.5}
coords, adj, ename = {}, {}, {}
for o in osmium.FileProcessor(PBF).with_locations():
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

GOOD = [n for n, es in adj.items() if any(e[2] in ("trunk", "primary", "secondary", "tertiary", "residential", "unclassified") for e in es)]
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
    out[k] = {"coords": [[lo, la] for la, lo in pts], "dist": total, "dur": total / 7.0, "names": segs, "fuente": L["fuente"]}
    print(k, round(total), "m |", " → ".join(f"{n or '(s/n)'} ({d:.0f})" for n, d in segs if d > 120))
json.dump({"venues": V, "legs": out}, open(os.path.join(FUENTE, "rutas_osm.json"), "w"), ensure_ascii=False)
