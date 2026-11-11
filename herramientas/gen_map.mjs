// Genera los trazos SVG estáticos del mapa (Perú por departamentos + países vecinos)
import fs from "fs";
import { geoMercator, geoPath, geoArea } from "d3-geo";
import { feature } from "topojson-client";

const [deptFile, outFile] = process.argv.slice(2);
const W = 1160, H = 1080;

const world = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-10m.json"));
const countries = feature(world, world.objects.countries).features;
const peru = countries.find(f => f.id === "604");
const depts = JSON.parse(fs.readFileSync(deptFile)).features;

// d3 espera anillos exteriores en sentido horario: corrige los que vienen al revés
function fixWinding(f) {
  if (geoArea(f) > 2 * Math.PI) {
    const g = f.geometry;
    const rev = poly => poly.map(r => r.slice().reverse());
    if (g.type === "Polygon") g.coordinates = rev(g.coordinates);
    else g.coordinates = g.coordinates.map(rev);
  }
  return f;
}
depts.forEach(fixWinding);

const proj = geoMercator().fitExtent([[150, 70], [W - 120, H - 60]], peru);
const path = geoPath(proj).digits(1);

// recuadro amplio para recortar vecinos (lon/lat)
// vecinos; Argentina, Paraguay y Uruguay se agregaron para el vuelo desde Buenos Aires
const near = countries.filter(f => ["218", "170", "076", "068", "152", "032", "600", "858"].includes(f.id));
const out = {
  W, H,
  scale: proj.scale(), translate: proj.translate(),
  neighbors: near.map(f => ({ name: f.properties.name, d: path(f) })),
  peru: path(peru),
  depts: depts.map(f => ({ name: f.properties.NOMBDEP, d: path(f) })),
  // centroides proyectados para etiquetas de países vecinos
};
const places = {
  LIMA: [-77.043, -12.046], CHICLAYO: [-79.8409, -6.7714], PIMENTEL: [-79.9342, -6.8367],
  "SANTA CRUZ": [-78.9442, -6.6264], "ZAÑA": [-79.5847, -6.9225], CUSCO: [-71.9786, -13.5163],
  PUCALLPA: [-74.5826, -8.3929], "BUENOS AIRES": [-58.5375, -34.8222],   // Ezeiza
};
out.places = Object.fromEntries(Object.entries(places).map(([k, ll]) => [k, proj(ll).map(v => +v.toFixed(1))]));
out.countryLabels = [
  ["ECUADOR", [-78.6, -1.4]], ["COLOMBIA", [-73.0, 0.9]], ["BRASIL", [-68.5, -7.5]],
  ["BOLIVIA", [-67.6, -16.0]], ["CHILE", [-69.6, -19.2]], ["OCÉANO PACÍFICO", [-82.0, -11.5]],
  ["ARGENTINA", [-65.0, -30.0]], ["PARAGUAY", [-58.4, -23.3]], ["URUGUAY", [-56.0, -32.8]],
].map(([n, ll]) => [n, proj(ll).map(v => +v.toFixed(1))]);
fs.writeFileSync(outFile, JSON.stringify(out));
console.log("bytes", JSON.stringify(out).length, out.places);
