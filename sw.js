// BRUTO: la app funciona sin conexión una vez abierta. El reconocimiento de voz lo guarda su propia caché.
const CACHE = "bruto-v1";
const BASE = ["./", "index.html", "app.css", "manifest.webmanifest", "favicon.png", "icono-192.png", "icono-512.png", "apple-touch-icon.png",
  "js/app.js", "js/almacen.js", "js/caracter.js", "js/montaje.js", "js/motor.js", "js/graficos.js", "js/asr.js",
  "fuentes/InterTight.ttf", "fuentes/Archivo.ttf", "fuentes/TikTokSans.ttf", "fuentes/Montserrat.ttf", "fuentes/Anton-Regular.ttf",
  "fuentes/BricolageGrotesque.ttf", "fuentes/Poppins-Bold.ttf", "fuentes/Outfit.ttf", "fuentes/InstrumentSerif-Italic.ttf", "fuentes/Gloock-Regular.ttf"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("bruto-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // primero la red (para recibir versiones nuevas); sin conexión, la copia guardada
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
