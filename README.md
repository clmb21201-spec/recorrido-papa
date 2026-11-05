# Recorrido del Papa en vivo

Página para OBS con la agenda de la visita del Papa al Perú (11–16 de noviembre de 2026): mapa del Perú con los vuelos,
mapas de calles por ciudad, el papamóvil en los recorridos confirmados y la figura del Papa en cada lugar.

## Cómo se usa
- Todas las pantallas que abren el enlace ven lo mismo y cualquiera puede avanzar (la productora y el PC de OBS).
- Teclas: → / Espacio / AvPág siguiente · ← / RePág anterior · 1–6 días · 0 vista general · P pausa ·
  + / − velocidad (×0,5 a ×10) · N velocidad normal · D modo prueba · F pantalla completa · H ayuda.

## Qué editar
- `web/datos/agenda.json`: textos, horas, lugares (con coordenadas), duración de recorridos y vuelos,
  `velocidad_base` (30 = todo a ×30, 1 = tiempo real), `vuelo_seg`, `pausa_llegada_seg`.
- Recorridos confirmados: `herramientas/route_osm.py` (LEGS). Los no confirmados quedan en PENDIENTES.

## Regenerar datos y página
```
python3 herramientas/route_osm.py                      # recorridos de Lima (descarga el extracto de Lima si falta)
python3 herramientas/prep_city.py lima herramientas/fuente/Lima.osm.pbf
python3 herramientas/prep_city.py cusco herramientas/fuente/Cusco.osm.pbf   # y así cada ciudad
python3 herramientas/build.py                          # web/index.html, web/app.js y dist/
```
Requiere Python con `osmium shapely mapbox_earcut numpy` y Node (`npm i three esbuild` en herramientas/).

## Despliegue
Cloudflare Workers con archivos estáticos (`web/`) y un Durable Object para sincronizar (`worker/index.js`, `wrangler.jsonc`).
Se conecta el repositorio en Cloudflare (Workers & Pages → Crear → Importar repositorio) y cada `git push` publica.

Datos de mapas © colaboradores de OpenStreetMap (ODbL). Departamentos del Perú: juaneladio/peru-geojson (MPL 2.0).
