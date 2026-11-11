# Arma la página a partir de herramientas/src y web/datos
#   web/index.html + web/app.js      -> versión web (Cloudflare Pages o cualquier hosting)
#   dist/pagina_claude.html          -> versión para publicar como página de Claude (datos en archivos aparte)
#   dist/recorrido_papa_offline.html -> un solo archivo sin internet (respaldo para el aire)
import base64, json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI)
WEB, DIST = os.path.join(RAIZ, "web"), os.path.join(RAIZ, "dist"); os.makedirs(DIST, exist_ok=True)
tpl = open(os.path.join(AQUI, "src", "template.html"), encoding="utf-8").read()
FONTS = [("Playfair Display", 700, "playfair-display-latin-700-normal.woff2"), ("Playfair Display", 900, "playfair-display-latin-900-normal.woff2"),
         ("Inter", 400, "inter-latin-400-normal.woff2"), ("Inter", 600, "inter-latin-600-normal.woff2"), ("Inter", 700, "inter-latin-700-normal.woff2")]
def css(inline):
    out = ""
    for n, w, f in FONTS:
        src = ("data:font/woff2;base64," + base64.b64encode(open(os.path.join(WEB, "fuentes", f), "rb").read()).decode()) if inline else "fuentes/" + f
        out += f'@font-face{{font-family:"{n}";font-weight:{w};font-style:normal;font-display:block;src:url({src}) format("woff2")}}\n'
    return out
r = subprocess.run(["npx", "esbuild", os.path.join(AQUI, "src", "app.js"), "--bundle", "--minify", "--format=esm", "--target=chrome103"],
                   capture_output=True, text=True, cwd=AQUI)
if r.returncode: print(r.stderr); sys.exit(1)
app = r.stdout
open(os.path.join(WEB, "app.js"), "w", encoding="utf-8").write(app)

# 1) web
open(os.path.join(WEB, "index.html"), "w", encoding="utf-8").write(tpl.replace("/*__FONTS__*/", css(False)).replace("<!--__DATA__-->", ""))
# web/radar/: página oculta con el vuelo en vivo (adsb.lol a través del servidor)
os.makedirs(os.path.join(WEB, "radar"), exist_ok=True)
open(os.path.join(WEB, "radar", "index.html"), "w", encoding="utf-8").write(
    tpl.replace("/*__FONTS__*/", css(False)).replace("<head>", '<head>\n<base href="../">\n<meta name="robots" content="noindex">', 1).replace("<!--__DATA__-->", "<script>window.__RADAR__ = true;</script>"))
# web/lector/: la misma página para insertar en la web (sin sincronización); usa los archivos de la raíz
os.makedirs(os.path.join(WEB, "lector"), exist_ok=True)
open(os.path.join(WEB, "lector", "index.html"), "w", encoding="utf-8").write(
    tpl.replace("/*__FONTS__*/", css(False)).replace("<head>", '<head>\n<base href="../">', 1).replace("<!--__DATA__-->", "<script>window.__PUBLICO__ = true;</script>"))

# 2) página de Claude: sin doctype/head/body, fuentes y código incrustados; datos y auto como archivos publicados
GF = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700;900&display=block">'
body = tpl.replace("/*__FONTS__*/", "").replace("<style>", GF + "\n<style>", 1).replace("<!--__DATA__-->", "")
body = body.replace('<script type="module" src="app.js"></script>', '<script type="module">' + app.replace("</script", "<\\/script") + "</script>")
head = body[body.index("<head>") + 6: body.index("</head>")].replace('<meta charset="utf-8">', "")
page = head.strip() + "\n" + body[body.index("<body>") + 6: body.index("</body>")].strip() + "\n"
open(os.path.join(DIST, "pagina_claude.html"), "w", encoding="utf-8").write(page)

# 3) un solo archivo sin internet
D = lambda f: json.load(open(os.path.join(WEB, "datos", f), encoding="utf-8"))
CIUDADES = {f[:-5]: D(os.path.join("ciudades", f)) for f in os.listdir(os.path.join(WEB, "datos", "ciudades")) if f.endswith(".json")}
inl = {"agenda": D("agenda.json"), "peru": D("peru.json"), "ciudades": CIUDADES, "rutas": D("rutas.json"),
       "car": open(os.path.join(WEB, "modelos", "papamovil.b64.txt")).read().strip(),
       "avion": open(os.path.join(WEB, "modelos", "avion.b64.txt")).read().strip(),
       "papa": open(os.path.join(WEB, "modelos", "papa.b64.txt")).read().strip(),
       "heli": open(os.path.join(WEB, "modelos", "helicoptero.b64.txt")).read().strip(),
       "suv": open(os.path.join(WEB, "modelos", "camioneta.b64.txt")).read().strip()}
# los mapas y la agenda van comprimidos (gzip + base64); la página los descomprime al abrir. Los modelos ya están comprimidos.
import gzip, base64
datos = {k: inl.pop(k) for k in ("agenda", "peru", "ciudades", "rutas")}
def delta(a, step):
    return a[:step] + [a[i] - a[i - step] for i in range(step, len(a))]
for c in datos["ciudades"].values():   # capas en diferencias: números cortos que se comprimen mejor
    for L in c["layers"].values():
        if L["v"] and all(isinstance(x, int) for x in L["v"]): L["v"] = delta(L["v"], 2); L["i"] = delta(L["i"], 1); L["d"] = 1
gz = base64.b64encode(gzip.compress(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)).decode()
off = tpl.replace("/*__FONTS__*/", css(True)).replace("<!--__DATA__-->", "<script>window.__INLINE__=" + json.dumps(inl, separators=(",", ":")) + ';window.__INLINE_GZ__="' + gz + '";</script>')
# el código también va comprimido: un cargador pequeño lo descomprime y lo ejecuta
appgz = base64.b64encode(gzip.compress(app.encode("utf-8"), 9)).decode()
loader = ('<script type="module">const b=Uint8Array.from(atob("' + appgz + '"),c=>c.charCodeAt(0));'
          'const t=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text();'
          'await import(URL.createObjectURL(new Blob([t],{type:"text/javascript"})));</script>')
off = off.replace('<script type="module" src="app.js"></script>', loader)
open(os.path.join(DIST, "recorrido_papa_offline.html"), "w", encoding="utf-8").write(off)
# versiones offline con formato fijo
for fmt in ("horizontal", "vertical"):
    open(os.path.join(DIST, f"recorrido_papa_offline_{fmt}.html"), "w", encoding="utf-8").write(
        off.replace("<script>window.__INLINE__=", f'<script>window.__FORMATO__="{fmt}";</script><script>window.__INLINE__=', 1))
for f in ("web/index.html", "web/app.js", "dist/pagina_claude.html", "dist/recorrido_papa_offline.html"):
    print(f, os.path.getsize(os.path.join(RAIZ, f)) // 1024, "KB")
