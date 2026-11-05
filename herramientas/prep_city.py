# Geometría de calles de Lima y Callao alrededor de los trayectos, lista para three.js
import json, math, sys
import os
import numpy as np, osmium, mapbox_earcut as earcut
from shapely.geometry import LineString, Polygon, Point, box, MultiPolygon
from shapely.ops import unary_union, linemerge, split
from shapely.prepared import prep

# Uso: python3 herramientas/prep_city.py <ciudad> <archivo .osm.pbf o .osm>
#   lima      -> además de calles, usa los recorridos de fuente/rutas_osm.json y escribe datos/rutas.json
AQUI = os.path.dirname(os.path.abspath(__file__))
CITY, PBF = sys.argv[1], sys.argv[2]
DATOS = os.path.join(AQUI, "..", "web", "datos"); os.makedirs(os.path.join(DATOS, "ciudades"), exist_ok=True)
AG = json.load(open(os.path.join(DATOS, "agenda.json"), encoding="utf-8"))
VEN = {k: (v["lat"], v["lon"]) for k, v in AG["lugares"].items() if v["ciudad"] == CITY}
R = json.load(open(os.path.join(AQUI, "fuente", "rutas_osm.json"))) if CITY == "lima" else {"legs": {}}
ALIAS = {"Óvalo Saloom": "Óvalo La Perla"}
LAT0 = round(sum(v[0] for v in VEN.values()) / len(VEN), 3) if CITY != "lima" else -12.07
LON0 = round(sum(v[1] for v in VEN.values()) / len(VEN), 3) if CITY != "lima" else -77.07
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110540
def P(lon, lat): return ((lon - LON0) * KX, (lat - LAT0) * KY)

legs = {k: LineString([P(*c) for c in v["coords"]]) for k, v in R["legs"].items()}
venues = {k: P(v[1], v[0]) for k, v in VEN.items()}
allr = unary_union(list(legs.values())) if legs else unary_union([Point(p) for p in venues.values()]).buffer(1)
vpts = unary_union([Point(p) for p in venues.values()])
corr = unary_union([allr.buffer(1100), vpts.buffer(900)]).simplify(20)
corr_b = unary_union([allr.buffer(480), vpts.buffer(450)])
pc, pcb = prep(corr), prep(corr_b)
x0, y0, x1, y1 = corr.bounds
clip = box(x0 - 300, y0 - 300, x1 + 300, y1 + 300)

W = {"motorway": 18, "trunk": 16, "primary": 14, "secondary": 12, "tertiary": 10, "residential": 6.5,
     "unclassified": 6.5, "living_street": 5.5, "pedestrian": 5, "service": 3.5}
roads = {"major": [], "minor": []}; bld, park, water, coast = [], [], [], []
named = {}
for o in osmium.FileProcessor(PBF).with_locations():
    if not o.is_way(): continue
    t = o.tags
    try: pts = [P(n.location.lon, n.location.lat) for n in o.nodes if n.location.valid()]
    except Exception: continue
    if len(pts) < 2: continue
    hw = t.get("highway")
    if hw:
        base = hw.replace("_link", "")
        if base not in W: continue
        g = LineString(pts)
        if not pc.intersects(g): continue
        w = W[base] * (0.8 if hw.endswith("_link") else 1)
        roads["major" if w >= 10 else "minor"].append(g.buffer(w / 2, cap_style=1, join_style=1, resolution=3))
        if t.get("name") and base in ("primary", "secondary", "tertiary", "trunk", "residential", "unclassified", "living_street", "pedestrian"):
            named.setdefault(ALIAS.get(t["name"], t["name"]), []).append(g)
        continue
    closed = o.nodes[0].ref == o.nodes[-1].ref and len(pts) >= 4
    if t.get("natural") == "coastline":
        coast.append(LineString(pts)); continue
    if not closed: continue
    g = Polygon(pts)
    if not g.is_valid: g = g.buffer(0)
    if g.is_empty: continue
    if "building" in t:
        if g.area > 12 and pcb.intersects(g): bld.append(g)
    elif t.get("leisure") in ("park", "garden", "pitch", "golf_course") or t.get("landuse") in ("grass", "recreation_ground", "village_green", "cemetery") or t.get("natural") in ("wood", "scrub", "grassland"):
        if pc.intersects(g): park.append(g)
    elif t.get("natural") == "water" or t.get("waterway") == "riverbank" or t.get("landuse") == "basin":
        if pc.intersects(g): water.append(g)
print("vías", sum(map(len, roads.values())), "edificios", len(bld), "parques", len(park))

# mar: trozos del recuadro partidos por la costa que tocan el borde y no contienen la Plaza Mayor
sea = []
cl = unary_union([c for c in coast if c.intersects(clip)])
if not cl.is_empty:
    cl = linemerge(cl) if cl.geom_type == "MultiLineString" else cl
    land_pt = Point(venues[next(iter(venues))])
    for pc_ in split(clip, cl).geoms:
        if pc_.contains(land_pt): continue
        if pc_.area > 2e6 and pc_.exterior.intersects(clip.exterior): sea.append(pc_)

def mesh(geoms, region, simp=0.6):
    g = unary_union(geoms).intersection(region).simplify(simp)
    polys = g.geoms if hasattr(g, "geoms") else [g]
    V, I = [], []
    for p in polys:
        if not isinstance(p, Polygon) or p.area < 3: continue
        rings = [np.array(p.exterior.coords)[:-1]] + [np.array(r.coords)[:-1] for r in p.interiors]
        rings = [r for r in rings if len(r) >= 3]
        if not rings: continue
        verts = np.vstack(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        tri = earcut.triangulate_float64(verts, ends)
        base = len(V) // 2
        V.extend(np.round(verts, 1).ravel().tolist()); I.extend((tri + base).tolist())
    return {"v": V, "i": I}

reg = corr.buffer(200)
layers = {
    "sea": mesh(sea, clip, 2), "water": mesh(water, reg, 1), "park": mesh(park, reg, 1),
    "bld": mesh(bld, corr_b, 0.6), "minor": mesh(roads["minor"], reg, 0.5), "major": mesh(roads["major"], reg, 0.5),
}
for k, v in layers.items(): print(k, len(v["v"]) // 2, "vértices")

# rótulos de calles vecinas (las de la ruta se rotulan a lo largo del trayecto en la página)
route_names = {n for v in R["legs"].values() for n, d in v["names"]}
def short(n):
    for a, b in (("Avenida ", "Av. "), ("Jirón ", "Jr. "), ("Pasaje ", "Psje. ")):
        if n.startswith(a): return b + n[len(a):]
    return n
near = unary_union([allr.buffer(600), vpts.buffer(1000)])   # calles vecinas alrededor de rutas y lugares
side = []
for nm, gs in named.items():
    if nm in route_names: continue
    u = unary_union(gs); m = linemerge(u) if u.geom_type == "MultiLineString" else u
    for ln in (m.geoms if hasattr(m, "geoms") else [m]):
        ln = ln.intersection(near)
        for part in (ln.geoms if hasattr(ln, "geoms") else [ln]):
            if part.geom_type != "LineString" or part.length < 90: continue
            for d in ([part.length / 2] if part.length < 600 else range(200, int(part.length) - 80, 420)):
                p = part.interpolate(d)
                if allr.distance(p) < 40: continue
                if any(math.dist((p.x, p.y), (x, y)) < 85 for _, x, y in side): continue
                side.append([short(nm), round(p.x, 1), round(p.y, 1)])
print("rótulos vecinos", len(side))

# trayectos en metros locales con distancia acumulada y nombres por tramo
routes = {}
for k, v in R["legs"].items():
    pts = [P(*c) for c in v["coords"]]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]): cum.append(cum[-1] + math.dist(a, b))
    # tramos con nombre: reparte las distancias de OSRM a lo largo de la línea
    names, s = [], 0.0
    for n, d in v["names"]:
        names.append([short(n), round(s), round(s + d)]); s += d
    k_ = cum[-1] / max(1, s)
    names = [[n, round(a * k_), round(b * k_)] for n, a, b in names]
    routes[k] = {"p": [round(c, 1) for xy in pts for c in xy], "len": round(cum[-1]), "dur": round(v["dur"]), "names": names}

lima = {"origin": [LAT0, LON0, KX, KY], "bounds": [round(c) for c in clip.bounds], "layers": layers, "side": side,
        "venues": {k: [round(a, 1) for a in v] for k, v in venues.items()}}
rutas = {"nota": "Generado por herramientas/route_osm.py y prep_lima.py. Coordenadas en metros locales.",
         "fuentes": {k: v.get("fuente", "") for k, v in R["legs"].items()}, "tramos": routes}
json.dump(lima, open(os.path.join(DATOS, "ciudades", CITY + ".json"), "w"), separators=(",", ":"), ensure_ascii=False)
print(CITY + ".json", os.path.getsize(os.path.join(DATOS, "ciudades", CITY + ".json")) // 1024, "KB")
if CITY == "lima":
    json.dump(rutas, open(os.path.join(DATOS, "rutas.json"), "w"), separators=(",", ":"), ensure_ascii=False)
