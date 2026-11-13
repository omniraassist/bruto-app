/* BRUTO — edición automática de vídeo, todo en el móvil. Pantallas: inicio · tomas · carácter · editando · resultado · ayuda · ajustes. */
import * as A from "./almacen.js";
import * as C from "./caracter.js";
import * as M from "./montaje.js";
import * as V from "./motor.js";
import { dibujarGraficos } from "./graficos.js";

const $app = document.getElementById("app");
const $selector = document.getElementById("selector");
const E = { proyecto: null, opciones: null, pestana: "letra", pila: [], media: null, mediaDe: null, ocupado: false,
  propios: {}, fuentesPropias: [], luts: [], logos: [], ajustes: {} };

const ESTADO_APP = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (ESTADO_APP) document.documentElement.classList.add("app");

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seg = (s) => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const FLECHA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`;
const CRUZ = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ASPECTOS = { "9:16": "9 / 16", "4:5": "4 / 5", "1:1": "1 / 1" };
const PASOS = ["Preparando tomas", "Escuchando", "Eligiendo las mejores tomas", "Quitando lo que sobra", "Corrigiendo luz y color", "Mezclando el sonido", "Montando"];

function avisar(texto) {
  const a = document.getElementById("aviso");
  a.textContent = texto; a.hidden = false;
  requestAnimationFrame(() => a.classList.add("ver"));
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { a.classList.remove("ver"); setTimeout(() => (a.hidden = true), 250); }, 2800);
}
const ir = (r) => { if (location.hash !== r) location.hash = r; else router(); };

function cabecera({ atras = null, titulo = "", derecha = "ayuda", tituloFijo = false } = {}) {
  const izq = document.getElementById("cab-izq"), cen = document.getElementById("cab-titulo"), der = document.getElementById("cab-der");
  if (atras) {
    izq.innerHTML = `<button class="atras" aria-label="Volver">${atras.cerrar ? CRUZ : FLECHA}</button>`;
    izq.firstElementChild.onclick = () => (atras.accion ? atras.accion() : volver(atras.ruta));
  } else izq.innerHTML = `<a href="#/" class="logo" aria-label="BRUTO, inicio">BRUTO</a>`;
  cen.textContent = titulo; cen.dataset.fijo = tituloFijo ? "1" : ""; cen.classList.toggle("ver", tituloFijo);
  der.innerHTML = derecha === "ayuda"
    ? `<a href="#/ayuda" class="etiqueta enlace-perfil">Ayuda</a><span class="etiqueta" style="color:var(--niebla)">·</span><a href="#/ajustes" class="etiqueta enlace-perfil">Ajustes</a>`
    : derecha || "";
}
window.addEventListener("scroll", () => { const c = document.getElementById("cab-titulo"); if (!c.dataset.fijo) c.classList.toggle("ver", scrollY > 70); }, { passive: true });
function volver(ruta) { const p = E.pila; if (p.length > 1 && p[p.length - 2] === ruta) history.back(); else ir(ruta); }

function hoja(html, alAbrir) {
  const fondo = document.getElementById("hoja");
  fondo.innerHTML = `<div class="hoja" role="dialog" aria-modal="true"><div class="asa"></div>${html}</div>`;
  fondo.hidden = false;
  requestAnimationFrame(() => fondo.classList.add("ver"));
  const cerrar = () => { fondo.classList.remove("ver"); setTimeout(() => { fondo.hidden = true; fondo.innerHTML = ""; }, 300); };
  fondo.onclick = (e) => { if (e.target === fondo) { cerrar(); alAbrir?.(null); } };
  return cerrar;
}
function confirmar({ titulo, texto, si, peligro = false }) {
  return new Promise((ok) => {
    const cerrar = hoja(`<h3>${esc(titulo)}</h3><p>${esc(texto)}</p><button class="boton ${peligro ? "peligro" : ""}" data-r="1">${esc(si)}</button>
      <button class="boton claro" data-r="0">Cancelar</button>`, () => ok(false));
    document.querySelectorAll("#hoja [data-r]").forEach((b) => b.onclick = () => { cerrar(); ok(b.dataset.r === "1"); });
  });
}
function pedirTexto({ titulo, valor = "", si = "Guardar", max = 60 }) {
  return new Promise((ok) => {
    const cerrar = hoja(`<h3>${esc(titulo)}</h3><input class="campo" id="hoja-campo" maxlength="${max}" value="${esc(valor)}" style="margin:8px 0 18px">
      <button class="boton" data-r="1">${esc(si)}</button><button class="boton claro" data-r="0">Cancelar</button>`, () => ok(null));
    const campo = document.getElementById("hoja-campo"); setTimeout(() => campo.focus(), 50);
    const fin = (r) => { const v = campo.value.trim(); cerrar(); ok(r ? v : null); };
    document.querySelectorAll("#hoja [data-r]").forEach((b) => b.onclick = () => fin(b.dataset.r === "1"));
    campo.onkeydown = (e) => { if (e.key === "Enter") fin(true); };
  });
}
async function copiar(t) {
  try { await navigator.clipboard.writeText(t); } catch (_) { const a = document.createElement("textarea"); a.value = t; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); }
}
function elegirArchivo(accept, multiple = false) {
  return new Promise((ok) => {
    const s = document.createElement("input"); s.type = "file"; s.accept = accept; s.multiple = multiple;
    s.onchange = () => ok([...s.files]); s.click();
  });
}

/* ---------- tipografías ---------- */
async function cargarFuentes() {
  const cargas = Object.entries(C.FUENTES).map(([id, f]) => {
    const ff = new FontFace(`b-${id}`, `url(${f.archivo})`, { weight: "100 900", style: f.cursiva ? "italic" : "normal", stretch: "62% 125%" });
    return ff.load().then((x) => document.fonts.add(x)).catch(() => {});
  });
  E.fuentesPropias = (await A.ajuste("fuentes")) || [];
  for (const f of E.fuentesPropias) cargas.push(cargarFuentePropia(f));
  await Promise.all(cargas);
}
async function cargarFuentePropia(f) {
  if ([...document.fonts].some((x) => x.family === f.id)) return;
  const blob = await A.leerArchivo(f.clave);
  if (!blob) return;
  const ff = new FontFace(f.id, await blob.arrayBuffer());
  document.fonts.add(await ff.load());
}

async function cargarBiblioteca() {
  E.propios = (await A.ajuste("caracteres")) || {};
  E.luts = (await A.ajuste("luts")) || [];
  E.logos = (await A.ajuste("logos")) || [];
  E.ajustes = (await A.ajuste("preferencias")) || { calidad: "rapido" };
}
const listaCaracteres = () => [
  ...Object.entries(C.CARACTERES).map(([id, c]) => ({ id, nombre: c.nombre, descripcion: c.descripcion, opciones: C.opcionesDe(id) })),
  ...Object.entries(E.propios).map(([id, c]) => ({ id, nombre: c.nombre, descripcion: "Tuyo.", opciones: C.opcionesDe(id, E.propios), propio: true })),
];

/* ---------- router ---------- */
const RAICES = ["#/", "#/ajustes", "#/ayuda"];
let direccion = "fundido";
async function router() {
  const hash = location.hash || "#/", pila = E.pila;
  if (RAICES.includes(hash)) { direccion = pila.length && pila[pila.length - 2] === hash ? "hacia-atras" : "fundido"; E.pila = [hash]; }
  else if (pila.length > 1 && pila[pila.length - 2] === hash) { pila.pop(); direccion = "hacia-atras"; }
  else if (pila[pila.length - 1] !== hash) { pila.push(hash); direccion = "adelante"; }
  const p = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  scrollTo(0, 0);
  if (E.ocupado && !(p[0] === "v" && p[2] === "editando")) { avisar("Espera a que termine de montarse."); location.replace(`#/v/${E.proyecto.id}/editando`); return; }
  try {
    if (!p.length) return await pInicio();
    if (p[0] === "ajustes") return await pAjustes();
    if (p[0] === "ayuda") return pAyuda();
    if (p[0] === "v" && p[1]) {
      // el mismo objeto en memoria mientras se trabaja con él (se guarda en cada cambio)
      if (E.proyecto?.id !== p[1]) E.proyecto = await A.leerProyecto(p[1]);
      if (!E.proyecto) throw new Error("no está");
      const vista = p[2] || "";
      if (vista === "tomas") return pTomas();
      if (vista === "caracter") return await pCaracter(p[3] === "reajustar");
      if (vista === "editando") return pEditando();
      if (E.proyecto.resultado) return await pResultado();
      return ir(`#/v/${p[1]}/${E.proyecto.tomas.length ? "caracter" : "tomas"}`);
    }
    ir("#/");
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<section><h1 class="titular">Este vídeo no está.<br><span class="tenue">Vuelve al inicio.</span></h1><a class="boton" href="#/">Inicio</a></section>`;
  }
}
addEventListener("hashchange", router);
new MutationObserver(() => {
  const s = $app.querySelector(":scope > section");
  if (s && !s.dataset.animada) { s.dataset.animada = "1"; s.classList.add(direccion); }
}).observe($app, { childList: true });

/* ---------- 01 · inicio ---------- */
async function pInicio() {
  cabecera();
  const proyectos = await A.listarProyectos();
  let oculto = false;
  try { oculto = localStorage.getItem("bruto-instalar") === "no"; } catch (_) { /* */ }
  const movil = /iPhone|iPad|Android/i.test(navigator.userAgent);
  const posters = {};
  for (const p of proyectos) {
    const v = p.versiones?.[0];
    if (v?.poster) { const b = await A.leerArchivo(v.poster); if (b) posters[p.id] = URL.createObjectURL(b); }
  }
  $app.innerHTML = `
    <section>
      <h1 class="titular">Sube tu material<br><span class="tenue">en bruto.</span></h1>
      ${movil && !ESTADO_APP && !oculto ? `<div class="instalar" id="instalar"><img src="icono-192.png" alt="">
        <p>Tenla como app.<br><span>Toca Compartir y «Añadir a pantalla de inicio».</span></p>
        <button class="icono-boton" id="no-instalar" aria-label="Cerrar">×</button></div>` : ""}
      <div class="zona" id="zona" role="button" tabindex="0" aria-label="Elegir vídeos y fotos">
        <span class="mas">+</span><span>Vídeos y fotos</span><small>Todas las tomas, tal cual salen de la cámara</small>
      </div>
      <div class="lineas-fantasma"><span class="fantasma">Sube. Espera. Listo.</span><span class="fantasma">Made in Barcelona</span></div>
      <div class="seccion-titulo"><h2>Tus vídeos</h2><span class="etiqueta">${proyectos.length || ""}</span></div>
      ${proyectos.length ? `<div class="galeria">${proyectos.map((p) => tarjeta(p, posters[p.id])).join("")}</div>`
        : `<p class="vacio">Aquí irán tus vídeos.</p>
           <ol class="guia-mini"><li><b>01</b><span>Sube todas las tomas, tal cual.</span></li>
             <li><b>02</b><span>Elige un carácter y ajústalo.</span></li><li><b>03</b><span>Listo para publicar.</span></li></ol>
           <a class="enlace" href="#/ayuda">Cómo funciona y cómo grabar mejor</a>`}
    </section>
    <div class="barra-accion"><div><button class="boton" id="nuevo">Nuevo vídeo</button></div></div>`;
  const nuevo = () => abrirSelector(null);
  document.getElementById("nuevo").onclick = nuevo;
  const zona = document.getElementById("zona");
  zona.onclick = nuevo;
  zona.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); nuevo(); } };
  arrastrar(zona, (f) => empezar(f));
  const no = document.getElementById("no-instalar");
  if (no) no.onclick = () => { try { localStorage.setItem("bruto-instalar", "no"); } catch (_) { /* */ } document.getElementById("instalar").remove(); };
}

function tarjeta(p, poster) {
  const r = p.resultado;
  const img = poster || p.tomas[0]?.miniatura || "";
  return `<a class="tarjeta" href="#/v/${p.id}"><div class="marco">${img ? `<img src="${img}" alt="">` : ""}
    <div class="estado">${r ? `<span class="pildora oscura">${seg(r.duracion)}</span>` : `<span class="pildora borde">Sin editar</span>`}</div></div>
    <h3>${esc(p.nombre)}</h3><p>${p.tomas.length} ${p.tomas.length === 1 ? "toma" : "tomas"}</p></a>`;
}
function arrastrar(el, alSoltar) {
  ["dragenter", "dragover"].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); el.classList.add("encima"); }));
  ["dragleave", "drop"].forEach((t) => el.addEventListener(t, (e) => { e.preventDefault(); el.classList.remove("encima"); }));
  el.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) alSoltar([...e.dataTransfer.files]); });
}
function abrirSelector(pid) {
  $selector.value = "";
  $selector.onchange = () => { const f = [...$selector.files]; if (f.length) pid ? anadir(f) : empezar(f); };
  $selector.click();
}

async function empezar(files) {
  await A.persistir();
  const p = { id: uid(), nombre: new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", ","),
    creado: Date.now(), tomas: [], opciones: C.opcionesDe("limpio", E.propios), versiones: [] };
  p.nombre = `Vídeo del ${p.nombre}`;
  await A.guardarProyecto(p);
  E.proyecto = p;
  ir(`#/v/${p.id}/tomas`);
  anadir(files);
}

/** Guarda las tomas en el móvil con su duración y miniatura. */
async function anadir(files) {
  const p = E.proyecto;
  if (!p) return;
  E.subiendo = (E.subiendo || 0) + files.length;
  repintarTomas();
  for (const f of files) {
    try {
      const tipo = f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name) ? "foto" : "video";
      if (/\.heic$/i.test(f.name) && !f.type) throw new Error("heic");
      const { duracion, miniatura } = await examinar(f, tipo);
      const clave = `${p.id}/toma/${uid()}`;
      await A.guardarArchivo(clave, f);
      p.tomas.push({ clave, nombre: f.name.slice(0, 60), tipo, duracion, miniatura });
      p.transcripcion = null; p.montaje = null; p.frasesQuitadas = null;
      await A.guardarProyecto(p);
    } catch (e) { console.error(e); avisar("Este clip no ha entrado. Prueba con otro."); }
    if (E.proyecto?.id === p.id) E.proyecto = p;
    E.subiendo--;
    repintarTomas();
  }
}

async function examinar(f, tipo) {
  const url = URL.createObjectURL(f);
  const c = document.createElement("canvas"); c.width = 180; c.height = 240;
  const x = c.getContext("2d");
  const cubrir = (w, h) => { const k = Math.max(180 / w, 240 / h); return [(180 - w * k) / 2, (240 - h * k) / 2, w * k, h * k]; };
  try {
    if (tipo === "foto") {
      const img = new Image(); img.src = url; await img.decode();
      x.drawImage(img, ...cubrir(img.naturalWidth, img.naturalHeight));
      return { duracion: 3, miniatura: c.toDataURL("image/jpeg", 0.7) };
    }
    const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    await new Promise((ok, mal) => { v.onloadedmetadata = ok; v.onerror = mal; });
    await new Promise((ok) => { v.onseeked = ok; v.currentTime = Math.min(0.5, v.duration / 2); setTimeout(ok, 3000); });
    x.drawImage(v, ...cubrir(v.videoWidth || 9, v.videoHeight || 16));
    const r = { duracion: v.duration, miniatura: c.toDataURL("image/jpeg", 0.7) };
    v.removeAttribute("src"); v.load();
    return r;
  } finally { URL.revokeObjectURL(url); }
}

/* ---------- 02 · tomas ---------- */
function pTomas() {
  cabecera({ atras: { ruta: "#/" }, titulo: "Tomas", derecha: "" });
  $app.innerHTML = `<section><h1 class="titular medio">Tus tomas.<br><span class="tenue">En el orden del vídeo.</span></h1><div id="tomas"></div></section>
    <div class="barra-accion"><div><button class="boton" id="seguir">Dale carácter</button></div></div>`;
  document.getElementById("seguir").onclick = () => ir(`#/v/${E.proyecto.id}/caracter`);
  arrastrar(document.getElementById("tomas"), anadir);
  repintarTomas();
}

function repintarTomas() {
  const cont = document.getElementById("tomas");
  if (!cont || !E.proyecto) return;
  const p = E.proyecto, total = p.tomas.reduce((s, t) => s + t.duracion, 0);
  cont.innerHTML = `<ul class="lista-tomas">${p.tomas.map((t, n) => `
      <li class="toma" data-n="${n}">
        <span class="num">${String(n + 1).padStart(2, "0")}</span>
        <img class="mini" src="${t.miniatura}" alt="">
        <div class="nombre"><b>${esc(t.nombre)}</b><span>${t.tipo === "foto" ? "Foto · 3 s" : seg(t.duracion)}</span></div>
        <div class="acciones">
          <button class="icono-boton" data-mover="-1" aria-label="Subir" ${n === 0 ? "disabled" : ""}>↑</button>
          <button class="icono-boton" data-mover="1" aria-label="Bajar" ${n === p.tomas.length - 1 ? "disabled" : ""}>↓</button>
          <button class="icono-boton" data-quitar aria-label="Quitar">×</button>
        </div></li>`).join("")}
      ${E.subiendo > 0 ? `<li class="toma"><span class="num">·</span><div class="mini"></div><div class="nombre"><b>Guardando ${E.subiendo}…</b>
        <div class="subida"><i style="width:60%"></i></div></div></li>` : ""}</ul>
    <button class="anadir" id="anadir"><span class="mas">+</span>Añadir más tomas</button>
    <p class="ayuda">${p.tomas.length ? `${p.tomas.length} ${p.tomas.length === 1 ? "toma" : "tomas"} · ${seg(total)} en bruto. ` : ""}Las tomas se quedan en tu móvil.${total > 180 ? " Mejor menos de 3 minutos en total: el montaje tarda lo que dura el vídeo." : ""}</p>`;
  document.getElementById("anadir").onclick = () => abrirSelector(p.id);
  const guardarOrden = async () => { p.transcripcion = null; p.montaje = null; p.frasesQuitadas = null; await A.guardarProyecto(p); repintarTomas(); };
  cont.querySelectorAll("[data-mover]").forEach((b) => b.onclick = () => {
    const i = Number(b.closest("li").dataset.n), j = i + Number(b.dataset.mover);
    [p.tomas[i], p.tomas[j]] = [p.tomas[j], p.tomas[i]];
    guardarOrden();
  });
  cont.querySelectorAll("[data-quitar]").forEach((b) => b.onclick = async () => {
    const [t] = p.tomas.splice(Number(b.closest("li").dataset.n), 1);
    await A.borrarArchivo(t.clave);
    guardarOrden();
  });
  const seguir = document.getElementById("seguir");
  if (seguir) { seguir.disabled = !p.tomas.length || E.subiendo > 0; seguir.textContent = E.subiendo > 0 ? "Guardando…" : "Dale carácter"; }
}

/* ---------- 03 · carácter ---------- */
const PESTANAS = [["letra", "Subtítulos"], ["titular", "Titular"], ["imagen", "Imagen"], ["musica", "Música"], ["mas", "Más"]];
const AYUDAS = {
  letra: "El texto de lo que dices, palabra a palabra. La palabra que suena se pinta del color de resalte.",
  titular: "La frase grande de los 3 primeros segundos. Es el gancho: lo que hace que no pasen de largo.",
  imagen: "Formato, corrección de luz, color del vídeo, cuánto se mueve el encuadre y lo rápidos que son los cortes.",
  musica: "La música baja sola cuando hablas y sube en los huecos.",
  mas: "Efectos, datos en pantalla, tu logo, firma final, duración y guardar tu carácter.",
};
const DESC = {
  diseno: { limpio: "Frase natural, la palabra que suena en color.", impacto: "Mayúsculas gruesas con contorno, para ritmo alto.", editorial: "Cursiva elegante y las palabras clave en grande.", ninguno: "Sin subtítulos." },
  look: { neutro: "Los colores tal cual.", vivo: "Más color y contraste.", cine_calido: "Luces cálidas y sombras frías, de película.", analogico: "Tonos de carrete: cálido y suave.", nave_oscura: "Oscuro y frío, con viñeta.", lut: "Tu propio LUT de color." },
  movimiento: { quieto: "Sin zoom ni transiciones.", suave: "Acercamiento lento y fundidos entre tomas.", dinamico: "Más zoom y cambios de encuadre entre tomas." },
  ritmo: { pausado: "Deja respirar las frases.", natural: "Quita los silencios, respeta las pausas cortas.", rapido: "Sin aire: ritmo de reel." },
  formato: { "9:16": "Reels, TikTok y Shorts.", "4:5": "Publicación del feed de Instagram.", "1:1": "Cuadrado." },
  tituloDiseno: { subrayador: "La palabra clave sobre un bloque de color.", impacto: "Grande, en mayúsculas.", editorial: "Cursiva con la palabra clave en grande." },
};
const desc = (g, v) => (DESC[g]?.[v] ? `<p class="ayuda desc">${DESC[g][v]}</p>` : "");
const segmentos = (ruta, valores, actual) => `<div class="segmentos" role="group">${valores.map(([v, t]) =>
  `<button data-ruta="${ruta}" data-valor="${esc(JSON.stringify(v))}" aria-pressed="${actual === v}">${t}</button>`).join("")}</div>`;
const interruptor = (ruta, valor, etiqueta) => `<div class="fila"><label for="i-${ruta}">${etiqueta}</label>
  <span class="interruptor"><input type="checkbox" id="i-${ruta}" data-ruta-check="${ruta}" ${valor ? "checked" : ""}><span></span></span></div>`;

async function pCaracter(reajustar) {
  const p = E.proyecto;
  E.opciones = C.normalizar(structuredClone(p.opciones));
  E.reajustar = reajustar;
  cabecera({ atras: { ruta: reajustar ? `#/v/${p.id}` : `#/v/${p.id}/tomas` }, titulo: "Carácter", derecha: "", tituloFijo: matchMedia("(max-width: 899px)").matches });
  $app.innerHTML = `
    <section>
      <h1 class="titular medio titular-editor">Dale carácter.<br><span class="tenue">Elige uno y ajústalo.</span></h1>
      <div class="rejilla-caracter">
        <div class="vista-col"><div class="vista cargando" id="vista"><canvas id="vista-lienzo"></canvas><span class="pildora">Vista previa</span></div>
          <p class="vista-pie">Con un fotograma de tu primera toma.</p></div>
        <div><div class="caracteres" id="caracteres" role="group" aria-label="Carácter"></div>
          <div class="pestanas" id="pestanas" role="tablist"></div><p class="ayuda-pestana" id="ayuda-pestana"></p><div id="panel"></div></div>
      </div>
    </section>
    <div class="barra-accion"><div><button class="boton" id="editar">${reajustar ? "Volver a montar" : "Editar"}</button></div></div>`;
  pintarCaracteres(); pintarPanel(); pedirVista();
  document.getElementById("editar").onclick = async () => {
    await V.despertarAudio();
    p.opciones = E.opciones; p.reajuste = !!reajustar;
    if (!reajustar) p.frasesQuitadas = null;
    await A.guardarProyecto(p);
    ir(`#/v/${p.id}/editando`);
  };
}

function pintarCaracteres() {
  const cont = document.getElementById("caracteres");
  cont.innerHTML = listaCaracteres().map((c) => `<button class="caracter" data-c="${esc(c.id)}" aria-pressed="${E.opciones.caracter === c.id}">
    <b>${esc(c.nombre)}</b><span>${esc(c.descripcion)}</span></button>`).join("");
  cont.querySelectorAll("button").forEach((b) => b.onclick = () => {
    const c = listaCaracteres().find((x) => x.id === b.dataset.c), o = E.opciones;
    const conservar = { duracion: o.duracion, cierre: o.cierre, logo: o.logo, musica: { ...c.opciones.musica, modo: o.musica.modo } };
    if (o.titulo.modo === "propio") conservar.titulo = { ...c.opciones.titulo, modo: "propio", texto: o.titulo.texto };
    E.opciones = C.mezclar(c.opciones, { ...conservar, caracter: c.id });
    pintarCaracteres(); pintarPanel(); cambio();
  });
}

function pintarPanel() {
  const o = E.opciones, s = o.subtitulos, t = o.titulo, m = o.musica, c = o.cierre;
  const propio = !C.ACENTOS.includes(s.acento.toUpperCase());
  const fuentes = [...Object.entries(C.FUENTES).map(([id, f]) => ({ id, nombre: f.nombre, familia: `b-${id}`, cursiva: f.cursiva })),
    ...E.fuentesPropias.map((f) => ({ id: f.id, nombre: f.nombre, familia: f.id }))];
  const logo = E.logos.find((x) => x.id === o.logo.id);
  document.getElementById("panel").innerHTML = `
    <div class="grupo" data-p="letra"><span class="etiqueta">Subtítulos</span>
      <div class="fila"><span class="rotulo">Estilo</span>${segmentos("subtitulos.diseno", [["limpio", "Limpio"], ["impacto", "Impacto"], ["editorial", "Editorial"], ["ninguno", "Sin"]], s.diseno)}</div>
      ${desc("diseno", s.diseno)}
      ${s.diseno !== "ninguno" ? `
      <div class="fila apilada"><span class="rotulo">Tipografía</span><div class="fuentes">
        <button class="fuente" data-ruta="subtitulos.fuente" data-valor='"auto"' aria-pressed="${s.fuente === "auto"}"><b>Aa</b><span>La del estilo</span></button>
        ${fuentes.map((f) => `<button class="fuente" data-ruta="subtitulos.fuente" data-valor='${esc(JSON.stringify(f.id))}' aria-pressed="${s.fuente === f.id}">
          <b style="font-family:'${f.familia}';${f.cursiva ? "font-style:italic" : ""}">Aa</b><span>${esc(f.nombre)}</span></button>`).join("")}
        <button class="fuente subir" id="subir-fuente"><b>+</b><span>Subir la tuya</span></button></div></div>
      <div class="fila"><span class="rotulo">Color del texto</span><div class="colores">
        ${["#FFFFFF", "#F5F5F3", "#0B0B0B", "#FFD84D"].map((a) => `<button class="color" style="background:${a}" data-ruta="subtitulos.colorTexto" data-valor='${JSON.stringify(a)}' aria-pressed="${s.colorTexto.toUpperCase() === a}" aria-label="Texto ${a}"></button>`).join("")}
        <label class="color-propio" aria-label="Otro color de texto">+<input type="color" id="color-texto" value="${s.colorTexto}"></label></div></div>
      <div class="fila"><span class="rotulo">Color de resalte</span><div class="colores">
        ${C.ACENTOS.map((a) => `<button class="color" style="background:${a}" data-ruta="subtitulos.acento" data-valor='${JSON.stringify(a)}' aria-pressed="${s.acento.toUpperCase() === a}" aria-label="Resalte ${a}"></button>`).join("")}
        <label class="color-propio" style="${propio ? `background:${s.acento};border-style:solid` : ""}" aria-label="Otro color">${propio ? "" : "+"}<input type="color" id="acento" value="${s.acento}"></label></div></div>
      <div class="fila"><span class="rotulo">Tamaño</span>${segmentos("subtitulos.tamano", [["s", "S"], ["m", "M"], ["l", "L"]], s.tamano)}</div>
      <div class="fila"><span class="rotulo">Posición</span>${segmentos("subtitulos.posicion", [["centro", "Centro"], ["abajo", "Abajo"]], s.posicion)}</div>
      <div class="fila"><span class="rotulo">Palabras a la vez</span>${segmentos("subtitulos.palabras", [[1, "1"], [2, "2"], [3, "3"], [4, "4"]], s.palabras)}</div>
      ${interruptor("subtitulos.mayusculas", s.mayusculas, "Mayúsculas")}
      ${interruptor("subtitulos.resaltar", s.resaltar, "Palabras clave siempre en color")}
      ${s.diseno === "impacto" ? `<div class="fila"><span class="rotulo">Contorno</span>${segmentos("subtitulos.contorno", [["auto", "Normal"], ["sin", "Sin"], ["fino", "Fino"], ["grueso", "Grueso"]], s.contorno)}</div>` : ""}` : ""}
    </div>
    <div class="grupo" data-p="titular"><span class="etiqueta">Titular de entrada</span>
      <div class="fila"><span class="rotulo">Texto</span>${segmentos("titulo.modo", [["auto", "Automático"], ["propio", "El mío"], ["ninguno", "Sin"]], t.modo)}</div>
      ${t.modo === "propio" ? `<input class="campo" id="titulo-texto" maxlength="80" placeholder="Gym sin *agobios*" value="${esc(t.texto)}"><p class="ayuda">Pon la palabra clave entre *asteriscos*.</p>` : ""}
      ${t.modo === "auto" ? `<p class="ayuda">BRUTO lo saca de la frase con más gancho de tu vídeo.</p>` : ""}
      ${t.modo !== "ninguno" ? `<div class="fila"><span class="rotulo">Diseño</span>${segmentos("titulo.diseno", [["subrayador", "Subrayado"], ["impacto", "Impacto"], ["editorial", "Editorial"]], t.diseno)}</div>
        ${desc("tituloDiseno", t.diseno)}${s.diseno !== "ninguno" ? interruptor("titulo.mismaLetra", t.mismaLetra, "Misma tipografía que los subtítulos") : ""}` : ""}
    </div>
    <div class="grupo" data-p="imagen"><span class="etiqueta">Imagen</span>
      <div class="fila"><span class="rotulo">Formato</span>${segmentos("formato", [["9:16", "9:16 Reels"], ["4:5", "4:5 Feed"], ["1:1", "1:1"]], o.formato)}</div>
      ${desc("formato", o.formato)}
      ${interruptor("correccion", o.correccion, "Corregir luz y balance de blancos")}
      <div class="fila apilada"><span class="rotulo">Color</span><div class="segmentos">
        ${Object.entries(C.LOOKS).map(([v, l]) => `<button data-look="${v}" aria-pressed="${!o.lut.activo && o.look === v}">${l.nombre}</button>`).join("")}
        ${E.luts.map((l) => `<button data-lut="${esc(l.id)}" aria-pressed="${o.lut.activo && o.lut.id === l.id}">${esc(l.nombre)}</button>`).join("")}
        <button id="subir-lut">+ Tu LUT</button></div></div>
      ${o.lut.activo ? `${desc("look", "lut")}<div class="fila"><span class="rotulo">Intensidad</span><span class="deslizador">
        <input type="range" id="lut-intensidad" min="10" max="100" step="5" value="${o.lut.intensidad}"><b id="lut-valor">${o.lut.intensidad} %</b></span></div>` : desc("look", o.look)}
      <div class="fila"><span class="rotulo">Movimiento</span>${segmentos("movimiento", [["quieto", "Quieto"], ["suave", "Suave"], ["dinamico", "Dinámico"]], o.movimiento)}</div>
      ${desc("movimiento", o.movimiento)}${o.movimiento !== "quieto" ? interruptor("enfasis", o.enfasis, "Golpes de zoom en lo importante") : ""}
      <div class="fila"><span class="rotulo">Ritmo</span>${segmentos("ritmo", [["pausado", "Pausado"], ["natural", "Natural"], ["rapido", "Rápido"]], o.ritmo)}</div>
      ${desc("ritmo", o.ritmo)}
    </div>
    <div class="grupo" data-p="musica"><span class="etiqueta">Música</span>
      <div class="fila"><span class="rotulo">Pista</span>${segmentos("musica.modo", [["ninguna", "Sin música"], ["propia", "La mía"]], m.modo)}</div>
      ${m.modo === "propia" ? `<div class="fila"><span class="rotulo texto-gris">${esc(E.proyecto.musica?.nombre || "Ninguna aún")}</span>
        <button class="boton claro peq" id="subir-musica">${E.proyecto.musica ? "Cambiar" : "Elegir canción"}</button></div>
        <div class="fila"><span class="rotulo">Volumen</span>${segmentos("musica.nivel", [["suave", "Suave"], ["presente", "Presente"]], m.nivel)}</div>
        <p class="ayuda">Usa música con derechos para redes. Si no, Instagram puede silenciar el vídeo.</p>` : ""}
    </div>
    <div class="grupo" data-p="mas"><span class="etiqueta">Detalles</span>
      ${interruptor("sfx", o.sfx, "Efectos de sonido")}${interruptor("sellos", o.sellos, "Datos en pantalla (cifras que dices)")}
      ${interruptor("cierre.activo", c.activo, "Firma al final")}
      ${c.activo ? `<input class="campo" id="cierre-texto" maxlength="60" placeholder="@tucuenta" value="${esc(c.texto)}" style="margin-top:8px">
        <input class="campo" id="cierre-subtexto" maxlength="60" placeholder="Una línea debajo (opcional)" value="${esc(c.subtexto)}" style="margin-top:8px">` : ""}
    </div>
    <div class="grupo" data-p="mas"><span class="etiqueta">Tu logo</span>
      <div class="fila"><span class="logo-actual">${logo ? `<img src="${logo.miniatura}" alt="Tu logo">` : `<span class="texto-gris">Sin logo</span>`}</span>
        <button class="boton claro peq" id="subir-logo">${logo ? "Cambiar" : "Subir logo"}</button></div>
      ${logo ? `${interruptor("logo.activo", o.logo.activo, "Poner mi logo")}${o.logo.activo ? `<div class="fila"><span class="rotulo">Dónde</span>${segmentos("logo.posicion", [["arriba", "Arriba"], ["esquina", "Esquina"]], o.logo.posicion)}</div>` : ""}` : ""}
      <p class="ayuda">Mejor un PNG con fondo transparente. Sale también en la firma final.</p>
    </div>
    <div class="grupo" data-p="mas"><span class="etiqueta">Duración</span>
      <div class="fila"><span class="rotulo">Como mucho</span>${segmentos("duracion", [["auto", "Libre"], ["30", "30 s"], ["60", "60 s"], ["90", "90 s"]], String(o.duracion))}</div>
    </div>
    <div class="grupo" data-p="mas"><span class="etiqueta">Guardar este carácter</span>
      <div class="fila" style="flex-wrap:nowrap"><input class="campo" id="nombre-caracter" maxlength="28" placeholder="Nombre, por ejemplo «Mi canal»">
        <button class="boton claro peq" id="guardar-caracter">Guardar</button></div>
    </div>`;
  const panel = document.getElementById("panel");
  pintarPestanas();
  panel.querySelectorAll("[data-ruta]").forEach((b) => b.onclick = () => { poner(b.dataset.ruta, JSON.parse(b.dataset.valor)); pintarPanel(); cambio(); });
  panel.querySelectorAll("[data-ruta-check]").forEach((i) => i.onchange = () => { poner(i.dataset.rutaCheck, i.checked); pintarPanel(); cambio(); });
  panel.querySelectorAll("[data-look]").forEach((b) => b.onclick = () => { o.look = b.dataset.look; o.lut.activo = false; pintarPanel(); cambio(); });
  panel.querySelectorAll("[data-lut]").forEach((b) => b.onclick = () => { o.lut = { ...o.lut, activo: true, id: b.dataset.lut }; pintarPanel(); cambio(); });
  const li = document.getElementById("lut-intensidad");
  if (li) li.oninput = () => { document.getElementById("lut-valor").textContent = `${li.value} %`; o.lut.intensidad = Number(li.value); cambio(); };
  for (const [id, ruta] of [["acento", "subtitulos.acento"], ["color-texto", "subtitulos.colorTexto"]]) {
    const el = document.getElementById(id);
    if (el) el.oninput = debounce(() => { poner(ruta, el.value.toUpperCase()); pintarPanel(); cambio(); }, 120);
  }
  for (const [id, ruta, vista] of [["titulo-texto", "titulo.texto", true], ["cierre-texto", "cierre.texto", false], ["cierre-subtexto", "cierre.subtexto", false]]) {
    const el = document.getElementById(id);
    if (el) el.oninput = () => { poner(ruta, el.value); cambio(vista); };
  }
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on("subir-fuente", subirFuente); on("subir-lut", subirLut); on("subir-logo", subirLogo); on("subir-musica", subirMusica);
  on("guardar-caracter", guardarCaracter);
  const caja = document.getElementById("vista");
  if (caja) { caja.style.aspectRatio = ASPECTOS[o.formato]; caja.style.setProperty("--r", { "9:16": 0.5625, "4:5": 0.8, "1:1": 1 }[o.formato]); }
}

function pintarPestanas() {
  const cont = document.getElementById("pestanas");
  if (!cont) return;
  cont.innerHTML = PESTANAS.map(([id, t]) => `<button role="tab" data-pestana="${id}" aria-selected="${E.pestana === id}">${t}</button>`).join("");
  cont.querySelectorAll("button").forEach((b) => b.onclick = () => { E.pestana = b.dataset.pestana; pintarPestanas(); });
  document.getElementById("ayuda-pestana").textContent = AYUDAS[E.pestana];
  let primera = true;
  document.querySelectorAll("#panel .grupo").forEach((g) => {
    const a = g.dataset.p === E.pestana;
    g.classList.toggle("activa", a); g.classList.toggle("primera", a && primera);
    if (a) primera = false;
  });
}
function poner(ruta, valor) { const k = ruta.split("."); let o = E.opciones; while (k.length > 1) o = o[k.shift()]; o[k[0]] = valor; }
const guardarOpciones = debounce(async () => { const p = E.proyecto; p.opciones = E.opciones; await A.guardarProyecto(p); }, 400);
const vistaLuego = debounce(() => pedirVista(), 250);
function cambio(conVista = true) { guardarOpciones(); if (conVista) vistaLuego(); }

async function subirFuente() {
  const [f] = await elegirArchivo(".ttf,.otf,font/ttf,font/otf");
  if (!f) return;
  try {
    const id = `u-${uid()}`, nombre = f.name.replace(/\.(ttf|otf)$/i, "").slice(0, 28);
    const ff = new FontFace(id, await f.arrayBuffer());
    document.fonts.add(await ff.load());
    const clave = `fuente/${id}`;
    await A.guardarArchivo(clave, f);
    E.fuentesPropias.push({ id, nombre, clave });
    await A.guardarAjuste("fuentes", E.fuentesPropias);
    E.opciones.subtitulos.fuente = id;
    pintarPanel(); cambio(); avisar(`Tipografía «${nombre}» lista.`);
  } catch (_) { avisar("Esta tipografía no ha entrado. Usa un archivo TTF u OTF."); }
}
async function subirLut() {
  const [f] = await elegirArchivo(".cube");
  if (!f) return;
  try {
    const texto = await f.text();
    V.leerCube(texto);
    const id = `l-${uid()}`, nombre = f.name.replace(/\.cube$/i, "").slice(0, 24), clave = `lut/${id}`;
    await A.guardarArchivo(clave, new Blob([texto], { type: "text/plain" }));
    E.luts.push({ id, nombre, clave });
    await A.guardarAjuste("luts", E.luts);
    E.opciones.lut = { activo: true, id, intensidad: 100 };
    pintarPanel(); cambio(); avisar(`LUT «${nombre}» listo.`);
  } catch (e) { avisar(e.message || "Este LUT no ha entrado."); }
}
async function subirLogo() {
  const [f] = await elegirArchivo("image/png,image/jpeg,image/webp");
  if (!f) return;
  try {
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const c = document.createElement("canvas"), k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    const id = `g-${uid()}`, clave = `logo/${id}`;
    await A.guardarArchivo(clave, blob);
    E.logos.push({ id, clave, miniatura: c.toDataURL("image/png") });
    await A.guardarAjuste("logos", E.logos);
    E.opciones.logo = { ...E.opciones.logo, activo: true, id };
    pintarPanel(); cambio(); avisar("Logo listo.");
  } catch (_) { avisar("Este logo no ha entrado. Prueba con un PNG."); }
}
async function subirMusica() {
  const [f] = await elegirArchivo("audio/*,.mp3,.m4a,.wav,.aac");
  if (!f) return;
  const p = E.proyecto;
  if (p.musica?.clave) await A.borrarArchivo(p.musica.clave);
  const clave = `${p.id}/musica`;
  await A.guardarArchivo(clave, f);
  p.musica = { clave, nombre: f.name.slice(0, 60) };
  E.opciones.musica.modo = "propia";
  p.opciones = E.opciones;
  await A.guardarProyecto(p);
  pintarPanel(); avisar("Canción lista.");
}
async function guardarCaracter() {
  const nombre = document.getElementById("nombre-caracter").value.trim();
  if (!nombre) return avisar("Ponle un nombre.");
  const id = `p-${uid()}`;
  E.propios[id] = { nombre, opciones: { ...structuredClone(E.opciones), caracter: id } };
  await A.guardarAjuste("caracteres", E.propios);
  E.opciones.caracter = id; pintarCaracteres(); guardarOpciones(); avisar(`Guardado como «${nombre}».`);
}

/* recursos del proyecto para pintar */
async function cargarMedia(p, soloPrimera = false) {
  const firma = p.id + ":" + p.tomas.map((t) => t.clave).join(",") + (soloPrimera ? ":1" : "");
  if (E.mediaDe === firma && E.media) return E.media;
  if (E.media) V.liberar(E.media);
  const tomas = soloPrimera ? [p.tomas.find((t) => t.tipo === "video") || p.tomas[0]] : p.tomas;
  const media = [];
  for (const t of tomas) media.push(await V.cargarToma(await A.leerArchivo(t.clave), t.tipo));
  E.media = media; E.mediaDe = firma;
  return media;
}
async function lutDe(o) {
  if (!o.lut.activo) return null;
  const l = E.luts.find((x) => x.id === o.lut.id);
  if (!l) return null;
  return V.leerCube(await (await A.leerArchivo(l.clave)).text());
}
async function logoDe(o) {
  if (!o.logo.activo) return null;
  const l = E.logos.find((x) => x.id === o.logo.id);
  if (!l) return null;
  const img = new Image(); img.src = URL.createObjectURL(await A.leerArchivo(l.clave)); await img.decode();
  return img;
}

let vistaN = 0;
async function pedirVista() {
  const caja = document.getElementById("vista"), lz = document.getElementById("vista-lienzo");
  if (!caja || !E.proyecto?.tomas.length) return;
  const n = ++vistaN;
  caja.classList.add("cargando");
  try {
    const media = await cargarMedia(E.proyecto, true);
    const m = media[0], o = E.opciones;
    if (!E.ajusteVista || E.ajusteVista.de !== E.mediaDe) E.ajusteVista = { de: E.mediaDe, v: await V.medirAjuste([m]) };
    const t0 = m.duracion / 3;
    const palabras = "Así quedan tus 3 subtítulos en el vídeo".split(" ").map((t, i) => ({ i, t, s: 1.0 + i * 0.3, e: 1.28 + i * 0.3 }));
    const titulo = o.titulo.modo === "propio" && o.titulo.texto ? o.titulo.texto : "Tu vídeo, *sin lo que sobra*";
    const plan = V.planDe({ o, media, tomas: [{ inicio: 0, duracion: m.duracion }], corte: { cortes: [{ s: t0, e: t0 + 4, toma: 0 }] },
      editadas: palabras, montaje: { claves: [3], tituloFinal: o.titulo.modo === "ninguno" ? null : titulo },
      sellos: o.sellos ? [{ centro: "+40%", arriba: "Retención", abajo: "con BRUTO", ini: 0.2 }] : [],
      ajuste: E.ajusteVista.v, lut: await lutDe(o), logo: await logoDe(o) });
    const c = await V.fotograma(plan, 1.35);
    if (n !== vistaN) return;
    lz.width = c.width / 2; lz.height = c.height / 2;
    lz.getContext("2d").drawImage(c, 0, 0, lz.width, lz.height);
  } catch (e) { console.error(e); }
  if (n === vistaN) caja.classList.remove("cargando");
}

/* ---------- 04 · editando ---------- */
let asr = null;
function transcribir(audio, calidad, alAviso) {
  if (!asr) asr = new Worker(new URL("./asr.js", import.meta.url), { type: "module" });
  return new Promise((ok, mal) => {
    const id = uid();
    asr.onmessage = (ev) => {
      const d = ev.data;
      if (d.tipo === "descarga") alAviso({ descarga: d });
      if (d.id !== id) return;
      if (d.tipo === "escuchando") alAviso({ escuchando: true });
      if (d.tipo === "listo") ok(d.palabras);
      if (d.tipo === "error") mal(new Error(d.mensaje));
    };
    asr.onerror = (e) => mal(new Error(e.message || "No se ha podido cargar el reconocimiento de voz."));
    asr.postMessage({ id, audio, calidad }, [audio.buffer]);
  });
}

function pEditando() {
  const p = E.proyecto;
  const cancelar = async () => {
    if (!E.ocupado) return ir(`#/v/${p.id}`);
    if (await confirmar({ titulo: "¿Parar el montaje?", texto: "Tendrás que volver a darle a Editar.", si: "Parar", peligro: true })) E.parar?.abort();
  };
  cabecera({ atras: { cerrar: true, accion: cancelar }, derecha: "" });
  $app.innerHTML = `<section class="editando">
      <div class="lienzo-vivo" id="vivo" hidden></div>
      <ul class="pasos" id="pasos"></ul><p class="fase" id="fase">Preparando.</p>
      <div class="progreso"><i id="barra"></i></div><div class="porcentaje" id="pct">0 %</div>
      <p class="nota-pantalla" id="nota">Deja BRUTO abierto y la pantalla encendida hasta que termine.</p><div id="error"></div></section>`;
  if (!E.ocupado) montar(p);
}

function fase(texto, pct, paso) {
  const f = document.getElementById("fase");
  if (!f) return;
  if (paso) {
    E.pasos = E.pasos || [];
    if (!E.pasos.includes(paso)) E.pasos.push(paso);
    const hechos = E.pasos, ultimo = hechos[hechos.length - 1];
    document.getElementById("pasos").innerHTML = PASOS.filter((x) => x !== ultimo && (hechos.includes(x) || PASOS.indexOf(x) > PASOS.indexOf(ultimo)))
      .slice(-4).map((x) => `<li class="${hechos.includes(x) ? "hecho" : ""}">${x}</li>`).join("");
  }
  if (texto) f.innerHTML = esc(texto).replace(/ ([^ ]+\.)$/, "<br>$1");
  if (pct !== undefined) {
    const v = Math.round(Math.max(0, Math.min(100, pct)));
    document.getElementById("barra").style.width = `${v}%`;
    document.getElementById("pct").textContent = `${v} %`;
    document.title = `${v} % · BRUTO`;
  }
}

async function montar(p) {
  E.ocupado = true; E.pasos = []; E.parar = new AbortController();
  const o = C.normalizar(p.opciones);
  try {
    fase("Preparando tomas.", 1, "Preparando tomas");
    const media = await cargarMedia(p);
    let inicio = 0;
    const tomas = p.tomas.map((t, k) => { const x = { inicio, duracion: media[k].duracion, nombre: t.nombre }; inicio += media[k].duracion; return x; });
    const totalBruto = inicio;
    // energía de la voz cada 10 ms (para cortes, voces de fondo y silencios)
    const energia = new Float32Array(Math.ceil(totalBruto * 100)).fill(-90);
    const audios = [];
    for (const [k, m] of media.entries()) {
      const a = await V.audio16k(m.audio, m.duracion);
      audios.push(a);
      energia.set(V.energia(a, Math.round(m.duracion * 100)).subarray(0, energia.length - Math.round(tomas[k].inicio * 100)), Math.round(tomas[k].inicio * 100));
    }
    // 1. escuchar (solo si no se ha hecho ya con estas tomas)
    if (!p.transcripcion) {
      fase("Escuchando.", 4, "Escuchando");
      const palabras = [];
      for (const [k, m] of media.entries()) {
        if (m.tipo === "foto") continue;
        const ws = await transcribir(new Float32Array(audios[k]), E.ajustes.calidad || "rapido", (x) => {
          if (x.descarga) fase(`Preparando el oído de BRUTO (${Math.round(x.descarga.total / 1e6)} MB, solo la primera vez).`, 4 + 20 * (x.descarga.cargado / x.descarga.total));
          if (x.escuchando) fase(media.length > 1 ? `Escuchando la toma ${k + 1} de ${media.length}.` : "Escuchando.", 25 + (15 * k) / media.length);
        });
        for (const w of ws) palabras.push({ i: palabras.length, t: w.t, s: tomas[k].inicio + Math.max(0, w.s), e: tomas[k].inicio + Math.min(w.e, m.duracion), toma: k });
        if (E.parar.signal.aborted) throw new Error("Cancelado.");
      }
      p.transcripcion = { palabras };
      p.montaje = null;
    }
    const palabras = p.transcripcion.palabras;
    const frases = M.frasesDe(palabras);
    // 2. decidir el montaje
    fase("Eligiendo las mejores tomas.", 42, "Eligiendo las mejores tomas");
    if (!p.montaje) p.montaje = M.decidir(palabras, frases, M.nivelesFrases(frases, energia), o);
    const mj = p.montaje;
    let quitadas = p.frasesQuitadas ?? mj.quitarFrases.map((q) => q.id);
    if (o.duracion !== "auto") quitadas = M.ajustarDuracion(frases, quitadas, Number(o.duracion));
    // 3. cortes y silencios
    fase("Quitando lo que sobra.", 46, "Quitando lo que sobra");
    const corte = M.cortes(palabras, frases, quitadas, mj.quitarPalabras, energia, C.RITMOS[o.ritmo], tomas);
    if (!corte.cortes.length) throw new Error("No ha quedado nada que montar. Revisa las tomas.");
    const inicioDe = new Map(corte.editadas.map((w) => [w.i, w.s]));
    const sellos = [];
    if (o.sellos) for (const s of mj.sellos) {
      const ini = inicioDe.get(s.palabra);
      if (ini === undefined || ini < 3.2 || sellos.some((x) => Math.abs(x.ini - ini) < 4)) continue;
      if (sellos.length < 3) sellos.push({ ...s, ini });
    }
    const tituloFinal = o.titulo.modo === "ninguno" ? null : o.titulo.modo === "propio" && o.titulo.texto ? o.titulo.texto : mj.titulo || null;
    // 4. color
    fase("Corrigiendo luz y color.", 50, "Corrigiendo luz y color");
    const ajuste = o.correccion ? (p.ajuste !== undefined && p.ajusteDe === E.mediaDe ? p.ajuste : await V.medirAjuste(media)) : null;
    if (o.correccion) { p.ajuste = ajuste; p.ajusteDe = E.mediaDe; }
    const musica = o.musica.modo === "propia" && p.musica ? await V.contextoAudio().decodeAudioData(await (await A.leerArchivo(p.musica.clave)).arrayBuffer()).catch(() => null) : null;
    const plan = V.planDe({ o, media, tomas, corte, editadas: corte.editadas, montaje: { claves: mj.claves, tituloFinal }, sellos, ajuste,
      lut: await lutDe(o), logo: await logoDe(o), musica });
    // 5. sonido
    fase("Mezclando el sonido.", 54, "Mezclando el sonido");
    const audioFinal = await V.mezclar(plan);
    // 6. montar y grabar en tiempo real
    fase("Montando.", 58, "Montando");
    const vivo = document.getElementById("vivo");
    // fotograma a fotograma si el navegador sabe codificar vídeo (exacto); si no, en tiempo real
    const exacto = await V.soportaFotogramas(plan.W, plan.H);
    if (!exacto && V.contextoAudio().state !== "running") await pedirToque();
    const { blob, poster } = await (exacto ? V.grabarFotogramas : V.grabar)(plan, audioFinal, {
      señal: E.parar.signal,
      mostrar: (c) => { if (vivo) { vivo.hidden = false; vivo.style.aspectRatio = ASPECTOS[o.formato]; vivo.innerHTML = ""; vivo.append(c); } },
      alProgreso: (x) => fase(null, 58 + 41 * x),
    });
    // 7. guardar
    const vid = uid();
    await A.guardarArchivo(`${p.id}/v/${vid}`, blob);
    await A.guardarArchivo(`${p.id}/p/${vid}`, poster);
    const pausas = corte.editadas.slice(1).filter((w, k) => w.s - corte.editadas[k].e > 0.6).length;
    const limite = { pausado: 3, natural: 1, rapido: 0 }[o.ritmo];
    const calidad = [
      { nombre: "Pausas de más de 0,6 s", valor: pausas ? String(pausas) : "Ninguna", ok: pausas <= limite },
      { nombre: "Volumen", valor: "Normalizado para redes", ok: true },
      { nombre: "Cortes", valor: String(Math.max(0, corte.cortes.length - 1)), ok: true },
      { nombre: "Corrección de color", valor: !o.correccion ? "Desactivada" : ajuste ? [ajuste.medio > 0.5 ? "más luz" : ajuste.medio < 0.5 ? "menos luz" : "", Math.max(Math.abs(ajuste.r - 1), Math.abs(ajuste.g - 1), Math.abs(ajuste.b - 1)) >= 0.012 ? "balance de blancos" : ""].filter(Boolean).join(", ").replace(/^./, (x) => x.toUpperCase()) || "Mínima" : "No hacía falta", ok: true },
      { nombre: "Datos en pantalla", valor: sellos.length ? `${sellos.length} ${sellos.length === 1 ? "contrastado" : "contrastados"}` : "Ninguno", ok: true },
      ...(plan.golpes.length ? [{ nombre: "Golpes de énfasis", valor: String(plan.golpes.length), ok: true }] : []),
    ];
    const caracterNombre = listaCaracteres().find((x) => x.id === o.caracter)?.nombre || "Personalizado";
    p.versiones = [{ id: vid, video: `${p.id}/v/${vid}`, poster: `${p.id}/p/${vid}`, tipo: blob.type, caracter: caracterNombre, formato: o.formato,
      duracion: plan.total + plan.cierre, titulo: tituloFinal, fecha: Date.now() }, ...(p.versiones || [])];
    for (const v of p.versiones.slice(4)) { await A.borrarArchivo(v.video); await A.borrarArchivo(v.poster); }
    p.versiones = p.versiones.slice(0, 4);
    p.resultado = {
      duracion: plan.total + plan.cierre, bruto: totalBruto, tomas: p.tomas.length,
      tomasUsadas: new Set(corte.cortes.map((c) => c.toma)).size, formato: o.formato, titulo: tituloFinal,
      alternativos: mj.alternativos, publicacion: mj.publicacion, resumen: mj.resumen, calidad, sellos: sellos.map((s) => s.centro),
      frases: frases.map((f) => ({ id: f.id, texto: f.texto, quitada: quitadas.includes(f.id), motivo: mj.quitarFrases.find((q) => q.id === f.id)?.motivo || "" })),
      srt: M.srt(corte.editadas),
    };
    p.frasesQuitadas = quitadas;
    p.corte = { cortes: corte.cortes, tomas };
    await A.guardarProyecto(p);
    E.ocupado = false;
    document.title = "Listo · BRUTO";
    ir(`#/v/${p.id}`);
  } catch (e) {
    console.error(e);
    E.ocupado = false;
    await A.guardarProyecto(p).catch(() => {});
    const err = document.getElementById("error");
    if (err) {
      err.innerHTML = `<div class="error-caja"><p>${esc(e.message === "Cancelado." ? "Montaje parado." : traducirError(e))}</p>
        <div class="dos-botones"><button class="boton claro" id="e-tomas">Revisar tomas</button><button class="boton" id="e-otra">Probar otra vez</button></div></div>`;
      document.getElementById("e-tomas").onclick = () => ir(`#/v/${p.id}/tomas`);
      document.getElementById("e-otra").onclick = async () => { await V.despertarAudio(); document.getElementById("error").innerHTML = ""; montar(p); };
    }
  }
}
/** iOS a veces duerme el sonido mientras se espera: hace falta un toque para seguir. */
function pedirToque() {
  return new Promise((ok) => {
    fase("Toca para montar.", undefined);
    const err = document.getElementById("error");
    err.innerHTML = `<button class="boton ancho" id="seguir-toque" style="margin-top:22px">Montar ahora</button>`;
    document.getElementById("seguir-toque").onclick = async () => { await V.despertarAudio(); err.innerHTML = ""; ok(); };
  });
}

function traducirError(e) {
  const m = String(e.message || e);
  if (/Vuelve a BRUTO|No ha quedado|no ha entrado|WebGL/.test(m)) return m;
  if (/fetch|network|Failed to load|NetworkError/i.test(m)) return "Hace falta conexión la primera vez para preparar el reconocimiento de voz. Prueba otra vez con wifi.";
  if (/memory|memoria|allocation/i.test(m)) return "El móvil se ha quedado sin memoria. Prueba con menos tomas o más cortas.";
  return "Algo ha fallado al montar. Prueba otra vez.";
}

/* ---------- 05 · resultado ---------- */
async function pResultado() {
  const p = E.proyecto, r = p.resultado, v0 = p.versiones[0];
  const blob = await A.leerArchivo(v0.video);
  const url = URL.createObjectURL(blob), posterUrl = URL.createObjectURL(await A.leerArchivo(v0.poster));
  const quitadas = new Set(r.frases.filter((f) => f.quitada).map((f) => f.id)), original = new Set(quitadas);
  const usadas = r.tomasUsadas === r.tomas ? `${r.tomas} ${r.tomas === 1 ? "toma" : "tomas"}` : `${r.tomasUsadas} de ${r.tomas} tomas`;
  cabecera({ atras: { ruta: "#/" }, titulo: p.nombre, derecha: "" });
  $app.innerHTML = `
    <section><div class="rejilla-resultado">
      <div class="resultado-video"><div class="reproductor" style="aspect-ratio:${ASPECTOS[r.formato]}">
        <video id="video" src="${url}" poster="${posterUrl}" controls playsinline preload="metadata"></video></div></div>
      <div>
        <h1 class="listo">Listo.</h1>
        <p class="meta">${Math.round(r.duracion)} segundos · ${usadas} · ${esc(r.formato)} · de ${seg(r.bruto)} en bruto</p>
        <p class="nombre-video"><span id="nombre-video">${esc(p.nombre)}</span> <button class="enlace" id="renombrar">Cambiar nombre</button></p>
        <div class="dos-botones"><button class="boton claro" id="guardar">Guardar</button><button class="boton" id="compartir">Compartir</button></div>

        <div class="seccion-titulo"><h2>Lo que he hecho</h2><span class="chip">Montado en tu móvil</span></div>
        <ul class="resumen">${r.resumen.map((x) => `<li>${esc(x)}</li>`).join("")}
          ${r.titulo ? `<li><span class="texto-gris">Titular:</span> ${esc(r.titulo.replace(/\*/g, ""))}</li>` : ""}</ul>
        ${r.sellos.length ? `<p class="ayuda">Datos destacados (dichos en el vídeo): ${r.sellos.map((x) => `<span class="chip">${esc(x)}</span>`).join(" ")}</p>` : ""}

        <div class="seccion-titulo"><h2>Control de calidad</h2></div>
        <ul class="resumen calidad">${r.calidad.map((x) => `<li class="fila"><span>${esc(x.nombre)}</span><span class="${x.ok ? "" : "aviso-calidad"}">${esc(x.valor)} ${x.ok ? "✓" : "·"}</span></li>`).join("")}</ul>

        ${r.publicacion ? `<div class="seccion-titulo"><h2>Para publicar</h2><button class="enlace" id="copiar">Copiar</button></div><div class="publicacion">${esc(r.publicacion)}</div>` : ""}
        ${r.alternativos?.length ? `<div class="seccion-titulo"><h2>Otros titulares</h2><span class="etiqueta">Para probar</span></div>
          <ul class="resumen">${r.alternativos.map((t, n) => `<li class="fila"><span>${esc(t.replace(/\*/g, ""))}</span><button class="enlace" data-alt="${n}">Usar este</button></li>`).join("")}</ul>` : ""}

        <div class="seccion-titulo"><h2>Portada</h2><span class="etiqueta">Elige el fotograma</span></div>
        <div class="portada"><div class="portada-img" style="aspect-ratio:${ASPECTOS[r.formato]}"><canvas id="portada-lienzo" style="width:100%;height:100%"></canvas></div>
          <div class="portada-ajustes">
            <input type="range" id="portada-t" min="0" max="${Math.max(0, r.duracion - 2.5)}" step="0.1" value="${Math.min(1, r.duracion / 2)}" aria-label="Momento del vídeo">
            <p class="ayuda" id="portada-seg">Segundo ${seg(Math.min(1, r.duracion / 2))}</p>
            <input class="campo" id="portada-titulo" maxlength="80" placeholder="Texto de la portada" value="${esc(r.titulo || "")}">
            <p class="ayuda">Usa *asteriscos* para la palabra clave. Vacío: portada sin texto.</p>
            <button class="boton claro ancho" id="portada-hacer" style="margin-top:12px">Ver portada</button>
            <button class="boton claro ancho" id="portada-bajar" style="margin-top:8px" disabled>Guardar portada</button></div></div>

        <div class="seccion-titulo"><h2>Montaje</h2><span class="etiqueta">Toca para quitar o volver a poner</span></div>
        <ul class="frases">${r.frases.map((f) => `<li class="frase ${f.quitada ? "fuera" : ""}" data-id="${f.id}" role="checkbox" aria-checked="${!f.quitada}" tabindex="0">
          <span class="marca">✓</span><span class="texto">${esc(f.texto)}${f.motivo && f.quitada ? `<small>${esc(f.motivo)}</small>` : ""}</span></li>`).join("")}</ul>

        <div class="seccion-titulo"><h2>Ajustar</h2></div>
        <div class="dos-botones"><a class="boton claro" href="#/v/${p.id}/caracter/reajustar">Cambiar carácter</a><button class="boton" id="remontar" disabled>Volver a montar</button></div>
        <p class="ayuda">Volver a montar no vuelve a escuchar el vídeo: tarda lo que dura el vídeo.</p>

        ${p.versiones.length > 1 ? `<div class="seccion-titulo"><h2>Versiones</h2><span class="etiqueta">Compara y quédate con una</span></div>
          <ul class="versiones">${p.versiones.map((v, n) => `<li class="version"><img data-poster="${v.poster}" alt="">
            <div><b>${esc(v.caracter)}${n === 0 ? ` <span class="chip">Actual</span>` : ""}</b><span>${esc(v.formato)} · ${seg(v.duracion)}${v.titulo ? ` · ${esc(v.titulo.replace(/\*/g, ""))}` : ""}</span></div>
            <div class="acciones"><button class="enlace" data-ver="${n}">Ver</button><button class="enlace" data-bajar="${n}">Guardar</button></div></li>`).join("")}</ul>` : ""}

        <div class="seccion-titulo"><h2>Más descargas</h2></div>
        <ul class="resumen"><li class="fila"><span>Subtítulos en archivo (.srt)<br><span class="texto-gris pequeno">Para YouTube, TikTok o editarlos aparte.</span></span><button class="enlace" id="srt">Descargar</button></li></ul>
        <p class="ayuda" style="margin-top:28px"><button class="enlace" id="borrar">Borrar este vídeo</button></p>
      </div></div></section>`;

  const ext = (t) => (t.includes("mp4") ? "mp4" : "webm");
  const archivo = async (n) => { const v = p.versiones[n]; return new File([await A.leerArchivo(v.video)], `BRUTO_${p.nombre.replace(/[^A-Za-z0-9]+/g, "_")}.${ext(v.tipo)}`, { type: v.tipo }); };
  const bajar = (f) => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.append(a); a.click(); a.remove(); };
  const compartirArchivo = async (f, texto) => {
    try { if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text: texto || "" }); return true; } }
    catch (e) { if (e.name === "AbortError") return true; }
    return false;
  };
  document.getElementById("guardar").onclick = async () => { const f = await archivo(0); if (!(await compartirArchivo(f))) { bajar(f); avisar("Descargado."); } };
  document.getElementById("compartir").onclick = async () => {
    const f = await archivo(0);
    if (r.publicacion) await copiar(r.publicacion);
    if (!(await compartirArchivo(f, r.publicacion))) { bajar(f); avisar(r.publicacion ? "Descargado. El texto está copiado." : "Descargado."); }
  };
  document.getElementById("renombrar").onclick = async () => {
    const n = await pedirTexto({ titulo: "Nombre del vídeo", valor: p.nombre });
    if (!n) return;
    p.nombre = n; await A.guardarProyecto(p);
    document.getElementById("nombre-video").textContent = n; document.getElementById("cab-titulo").textContent = n;
  };
  const cp = document.getElementById("copiar");
  if (cp) cp.onclick = async () => { await copiar(r.publicacion); avisar("Copiado."); };
  document.querySelectorAll("[data-alt]").forEach((b) => b.onclick = async () => {
    const t = r.alternativos[Number(b.dataset.alt)];
    if (!(await confirmar({ titulo: "¿Montar con este titular?", texto: `«${t.replace(/\*/g, "")}». Se guarda como otra versión.`, si: "Montar" }))) return;
    await V.despertarAudio();
    p.opciones.titulo = { ...p.opciones.titulo, modo: "propio", texto: t };
    await A.guardarProyecto(p); ir(`#/v/${p.id}/editando`);
  });
  const remontar = document.getElementById("remontar");
  const iguales = () => original.size === quitadas.size && [...original].every((x) => quitadas.has(x));
  document.querySelectorAll(".frase").forEach((li) => {
    const alternar = () => {
      const id = Number(li.dataset.id);
      quitadas.has(id) ? quitadas.delete(id) : quitadas.add(id);
      li.classList.toggle("fuera", quitadas.has(id)); li.setAttribute("aria-checked", String(!quitadas.has(id)));
      remontar.disabled = iguales();
    };
    li.onclick = alternar;
    li.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); alternar(); } };
  });
  remontar.onclick = async () => { await V.despertarAudio(); p.frasesQuitadas = [...quitadas]; await A.guardarProyecto(p); ir(`#/v/${p.id}/editando`); };
  for (const img of document.querySelectorAll("[data-poster]")) { const b = await A.leerArchivo(img.dataset.poster); if (b) img.src = URL.createObjectURL(b); }
  document.querySelectorAll("[data-ver]").forEach((b) => b.onclick = async () => {
    const v = p.versiones[Number(b.dataset.ver)], el = document.getElementById("video");
    el.src = URL.createObjectURL(await A.leerArchivo(v.video)); el.poster = URL.createObjectURL(await A.leerArchivo(v.poster));
    el.play().catch(() => {}); scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelectorAll("[data-bajar]").forEach((b) => b.onclick = async () => { const f = await archivo(Number(b.dataset.bajar)); if (!(await compartirArchivo(f))) bajar(f); });
  document.getElementById("srt").onclick = async () => {
    const f = new File([r.srt], `BRUTO_${p.id}.srt`, { type: "text/plain" });
    if (!(await compartirArchivo(f))) bajar(f);
  };
  document.getElementById("borrar").onclick = async () => {
    if (!(await confirmar({ titulo: "¿Borrar este vídeo?", texto: "Se borran el vídeo montado y sus tomas de este móvil. No se puede deshacer.", si: "Borrar", peligro: true }))) return;
    await A.borrarProyecto(p); ir("#/");
  };
  // portada: fotograma sin subtítulos con el titular
  const pt = document.getElementById("portada-t"), ptit = document.getElementById("portada-titulo"), plz = document.getElementById("portada-lienzo");
  let portada = null;
  const hacerPortada = async () => {
    const b = document.getElementById("portada-hacer"); b.disabled = true; b.textContent = "Preparando…";
    try {
      const o = C.normalizar(p.opciones), media = await cargarMedia(p);
      const plan = V.planDe({ o, media, tomas: p.corte.tomas, corte: p.corte, editadas: [], montaje: { claves: [], tituloFinal: ptit.value.trim() || null }, sellos: [],
        ajuste: o.correccion ? p.ajuste : null, lut: await lutDe(o), logo: null });
      const c = await V.fotograma(plan, Number(pt.value), { graficos: false });
      if (plan.g.titulo) dibujarGraficos(c.getContext("2d"), { ...plan.g, grupos: [], sellos: [], logo: null }, 1.6);
      portada = c;
      plz.width = c.width / 2; plz.height = c.height / 2; plz.getContext("2d").drawImage(c, 0, 0, plz.width, plz.height);
      document.getElementById("portada-bajar").disabled = false;
    } catch (e) { console.error(e); avisar("No se ha podido sacar la portada."); }
    b.disabled = false; b.textContent = "Ver portada";
  };
  pt.oninput = () => { document.getElementById("portada-seg").textContent = `Segundo ${seg(Number(pt.value))}`; };
  document.getElementById("portada-hacer").onclick = hacerPortada;
  document.getElementById("portada-bajar").onclick = async () => {
    if (!portada) return;
    const f = new File([await new Promise((ok) => portada.toBlob(ok, "image/jpeg", 0.92))], "BRUTO_portada.jpg", { type: "image/jpeg" });
    if (!(await compartirArchivo(f))) bajar(f);
  };
}

/* ---------- ayuda ---------- */
function pAyuda() {
  cabecera({ atras: { ruta: "#/" }, titulo: "Cómo funciona", derecha: "" });
  const q = (p, r) => `<details class="pregunta"><summary>${p}</summary><p>${r}</p></details>`;
  $app.innerHTML = `<section class="guia" style="max-width:720px">
    <h1 class="titular">Tú grabas en bruto.<br><span class="tenue">BRUTO lo deja listo.</span></h1>
    <ol class="pasos-guia">
      <li><b>01</b><div><h3>Sube tus tomas</h3><p>Todos los vídeos tal cual salen del móvil, también los fallidos, en el orden del vídeo. Puedes añadir fotos: salen 3 segundos.</p></div></li>
      <li><b>02</b><div><h3>Dale carácter</h3><p>Elige uno de los caracteres de serie y ajústalo: letra, colores, titular, color de imagen, ritmo, música… La vista previa usa tu vídeo.</p></div></li>
      <li><b>03</b><div><h3>Espera</h3><p>BRUTO escucha lo que dices, se queda con la mejor versión de cada frase, quita silencios, cuentas atrás y muletillas, corrige la luz y monta el vídeo con letras, datos y música.</p></div></li>
      <li><b>04</b><div><h3>Listo</h3><p>Guárdalo en Fotos o compártelo. Si algo no te convence, quita o recupera frases, cambia el carácter o prueba otro titular.</p></div></li>
    </ol>
    <div class="seccion-titulo"><h2>Graba mejor</h2></div>
    <ul class="consejos">
      <li><b>Si te equivocas, repite la frase entera.</b> BRUTO se queda con la última toma buena.</li>
      <li><b>Deja un segundo de silencio entre frases.</b> Así los cortes caen limpios.</li>
      <li><b>Empieza fuerte.</b> Lo primero que digas es el gancho.</li>
      <li><b>Graba en vertical</b>, con el móvil a la altura de los ojos y luz de frente.</li>
      <li><b>Micro cerca.</b> Si hay ruido, uno de solapa.</li>
      <li><b>Mejor varias tomas cortas</b> que una muy larga: menos de 3 minutos en total.</li>
    </ul>
    <div class="seccion-titulo"><h2>Los caracteres</h2></div>
    <ul class="resumen">${Object.values(C.CARACTERES).map((c) => `<li><b style="font-weight:500">${c.nombre}.</b> <span class="texto-gris">${c.descripcion}</span></li>`).join("")}
      <li><b style="font-weight:500">Los tuyos.</b> <span class="texto-gris">Ajusta uno y guárdalo con tu nombre en la pestaña «Más».</span></li></ul>
    <div class="seccion-titulo"><h2>Cada ajuste</h2></div>
    <dl class="ajustes">
      <dt>Subtítulos</dt><dd>Estilo limpio, impacto o editorial; diez tipografías o la tuya (TTF u OTF); color del texto y de resalte; tamaño, posición, palabras a la vez, mayúsculas y contorno.</dd>
      <dt>Titular</dt><dd>La frase grande de los 3 primeros segundos. «Automático» la saca de tu frase con más gancho. Marca la clave entre *asteriscos*.</dd>
      <dt>Imagen</dt><dd>Formato 9:16, 4:5 o 1:1. Corrección automática de luz y balance de blancos. Color natural, vivo, cine, analógico, noche o tu LUT (.cube) con intensidad. Movimiento y golpes de zoom en lo importante. Ritmo de los cortes.</dd>
      <dt>Música</dt><dd>Elige una canción de tu móvil: baja sola cuando hablas y sube en los huecos.</dd>
      <dt>Datos en pantalla</dt><dd>BRUTO destaca solo información contrastada: cifras, precios, fechas u horarios que dices literalmente. Nunca se inventa un dato.</dd>
      <dt>Más</dt><dd>Efectos de sonido, firma final con tu @, tu logo y duración máxima.</dd>
    </dl>
    <div class="seccion-titulo"><h2>Preguntas</h2></div>
    ${q("¿Mis vídeos se suben a algún sitio?", "No. Todo pasa dentro de tu móvil: tus vídeos no salen de él. Solo la primera vez se descarga el reconocimiento de voz (unos 80 MB) y se queda guardado.")}
    ${q("¿Cuánto tarda?", "Escuchar el vídeo tarda unos segundos por cada minuto. Montarlo tarda lo que dura el vídeo final, porque se graba en directo: deja la app abierta y la pantalla encendida.")}
    ${q("¿Qué archivos acepta?", "Vídeos MOV y MP4 del móvil y fotos JPG, PNG y WEBP.")}
    ${q("¿Cómo la instalo en el iPhone?", "En Safari, toca Compartir → «Añadir a pantalla de inicio». Se abre a pantalla completa, como una app.")}
    ${q("¿Puedo pasársela a un amigo?", "Sí: mándale el enlace. Cada uno tiene sus vídeos en su móvil.")}
    ${q("¿Dónde se guardan los vídeos?", "En el propio navegador del móvil. Guarda en Fotos los que quieras conservar: si borras los datos de Safari, se borran.")}
    <div style="margin-top:70px" class="lineas-fantasma"><span class="fantasma">Sube. Espera. Listo.</span><span class="fantasma">Founded ©2026</span></div>
  </section><div class="barra-accion"><div><button class="boton" id="empezar">Empezar un vídeo</button></div></div>`;
  document.getElementById("empezar").onclick = () => abrirSelector(null);
}

/* ---------- ajustes ---------- */
async function pAjustes() {
  cabecera({ atras: { ruta: "#/" }, titulo: "Ajustes", derecha: "" });
  const esp = await A.espacio();
  const url = location.href.split("#")[0];
  $app.innerHTML = `<section style="max-width:640px">
    <h1 class="titular medio">Ajustes.</h1>
    <div class="seccion-titulo"><h2>Reconocimiento de voz</h2></div>
    <div class="fila"><span class="rotulo">Calidad</span>${segmentos("calidad", [["rapido", "Rápida"], ["preciso", "Precisa"]], E.ajustes.calidad || "rapido")}</div>
    <p class="ayuda">«Precisa» acierta más con nombres y palabras raras, pero descarga 250 MB y tarda el doble.</p>
    <div class="seccion-titulo"><h2>Compartir BRUTO</h2></div>
    <p class="texto-gris">Mándale este enlace a quien quieras. Cada uno tiene sus vídeos en su móvil.</p>
    <div class="fila" style="flex-wrap:nowrap"><input class="campo" readonly value="${esc(url)}"><button class="boton peq" id="compartir-app">Compartir</button></div>
    <div class="seccion-titulo"><h2>Tus caracteres</h2></div>
    ${Object.keys(E.propios).length ? `<ul class="resumen">${Object.entries(E.propios).map(([id, c]) => `<li class="fila"><span>${esc(c.nombre)}</span><button class="enlace" data-borrar-c="${id}">Borrar</button></li>`).join("")}</ul>` : `<p class="vacio">Aquí irán los caracteres que guardes.</p>`}
    <div class="seccion-titulo"><h2>Tus recursos</h2></div>
    <ul class="resumen">
      ${E.fuentesPropias.map((f) => `<li class="fila"><span>Tipografía · ${esc(f.nombre)}</span><button class="enlace" data-borrar-r="fuentes:${f.id}">Borrar</button></li>`).join("")}
      ${E.luts.map((l) => `<li class="fila"><span>LUT · ${esc(l.nombre)}</span><button class="enlace" data-borrar-r="luts:${l.id}">Borrar</button></li>`).join("")}
      ${E.logos.map((l) => `<li class="fila"><span class="logo-actual"><img src="${l.miniatura}" alt="Logo"></span><button class="enlace" data-borrar-r="logos:${l.id}">Borrar</button></li>`).join("")}
      ${!E.fuentesPropias.length && !E.luts.length && !E.logos.length ? `<li class="texto-gris">Las tipografías, LUTs y logos que subas.</li>` : ""}
    </ul>
    ${esp ? `<p class="ayuda" style="margin-top:22px">Espacio usado: ${(esp.usado / 1e6).toFixed(0)} MB${esp.total ? ` de ${(esp.total / 1e9).toFixed(1)} GB` : ""}.</p>` : ""}
    <div style="margin-top:70px" class="lineas-fantasma"><span class="fantasma">BRUTO® Edición automática</span><span class="fantasma">hola@bruto.app</span></div>
  </section>`;
  document.querySelectorAll("[data-ruta]").forEach((b) => b.onclick = async () => {
    E.ajustes.calidad = JSON.parse(b.dataset.valor); await A.guardarAjuste("preferencias", E.ajustes); pAjustes();
  });
  document.getElementById("compartir-app").onclick = async () => {
    try { if (navigator.share) { await navigator.share({ title: "BRUTO", text: "Edita tus vídeos solo con subirlos.", url }); return; } } catch (_) { return; }
    await copiar(url); avisar("Enlace copiado.");
  };
  document.querySelectorAll("[data-borrar-c]").forEach((b) => b.onclick = async () => { delete E.propios[b.dataset.borrarC]; await A.guardarAjuste("caracteres", E.propios); pAjustes(); });
  document.querySelectorAll("[data-borrar-r]").forEach((b) => b.onclick = async () => {
    const [lista, id] = b.dataset.borrarR.split(":");
    const prop = { fuentes: "fuentesPropias", luts: "luts", logos: "logos" }[lista];
    const item = E[prop].find((x) => x.id === id);
    if (item) await A.borrarArchivo(item.clave);
    E[prop] = E[prop].filter((x) => x.id !== id);
    await A.guardarAjuste(lista, E[prop]); pAjustes();
  });
}

/* ---------- arranque ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
await cargarBiblioteca();
await cargarFuentes();
router();
