// Motion graphics dibujados en un lienzo: subtítulos karaoke, titular, datos en pantalla, logo y firma final.
import { fuenteSubtitulos } from "./caracter.js";

const suave = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const rebote = (x, s = 1.4) => { x = Math.min(1, Math.max(0, x)); const c = s + 1; return 1 + c * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const limpiaPunt = (t) => t.replace(/[.,;:]+$/, "");
export const luminancia = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };

const POS = { "9:16": { centro: 0.56, abajo: 0.72 }, otro: { centro: 0.6, abajo: 0.82 } };
const TAMANOS = { s: 0.85, m: 1, l: 1.17 };

function fuenteCss(f, px, extra = "") {
  return `${f.cursiva ? "italic " : ""}${f.peso} ${Math.round(px)}px "${f.familia}"${extra}`;
}

/** Prepara todo lo que no cambia fotograma a fotograma. */
export function prepararGraficos(o, { W, H, editadas, claves, titulo, sellos, duracion, logo, conCierre }) {
  const s = o.subtitulos, vertical = o.formato === "9:16";
  const f = fuenteSubtitulos(o);
  const k = TAMANOS[s.tamano] || 1;
  const disenos = {
    limpio: { tam: 76 * k, mayus: s.mayusculas, contorno: 0 },
    impacto: { tam: 70 * k, mayus: s.mayusculas, contorno: s.contorno === "auto" ? 6 : { sin: 0, fino: 4, grueso: 8 }[s.contorno] ?? 6 },
    editorial: { tam: 86 * k, mayus: false, contorno: 0 },
  };
  const d = disenos[s.diseno] || disenos.limpio;
  const g = {
    o, W, H, vertical, f, d, acento: s.acento, colorTexto: s.colorTexto, claves: new Set(claves || []),
    posY: (vertical ? POS["9:16"] : POS.otro)[s.posicion] || 0.72, duracion, conCierre,
    grupos: s.diseno === "ninguno" ? [] : agrupar(editadas, s.palabras, 8 + 7 * s.palabras, duracion),
    titulo: o.titulo.modo !== "ninguno" && titulo ? titulo : null,
    sellos: (sellos || []).map((x, n) => ({ ...x, lado: n % 2 ? "izq" : "der" })),
    logo, ancho: W * 0.74,
  };
  return g;
}

function agrupar(palabras, max, maxCar, duracion) {
  const grupos = [];
  let actual = [];
  for (const w of palabras) {
    const u = actual[actual.length - 1];
    const car = actual.reduce((n, x) => n + x.t.length + 1, 0) + w.t.length;
    if (u && (actual.length >= max || car > maxCar || w.s - u.e > 0.5 || /[.?!]$/.test(u.t))) { grupos.push(actual); actual = []; }
    actual.push(w);
  }
  if (actual.length) grupos.push(actual);
  return grupos.map((ws, n) => {
    const sig = grupos[n + 1];
    const fin = Math.min(sig ? sig[0].s : ws[ws.length - 1].e + 0.4, ws[ws.length - 1].e + 0.6, duracion);
    return { ws, ini: ws[0].s, fin };
  });
}

/** Dibuja los gráficos del instante t (segundos del vídeo editado). */
export function dibujarGraficos(ctx, g, t) {
  if (g.logo) dibujarLogo(ctx, g);
  if (g.titulo && t < 3.05) dibujarTitulo(ctx, g, t);
  for (const s of g.sellos) if (t >= s.ini - 0.05 && t < s.ini + 2.4) dibujarSello(ctx, g, s, t - s.ini);
  const grupo = g.grupos.find((x) => t >= x.ini && t < x.fin);
  if (grupo) dibujarSubtitulo(ctx, g, grupo, t);
}

function dibujarSubtitulo(ctx, g, grupo, t) {
  const { d, f, W, H, o } = g, diseno = o.subtitulos.diseno;
  const pop = rebote((t - grupo.ini) / 0.16, 1.2);
  const escala = 0.86 + 0.14 * pop;
  const clave = (w) => g.claves.has(w.i) || /\d/.test(w.t);
  const items = grupo.ws.map((w) => {
    let txt = limpiaPunt(w.t);
    let fuente = fuenteCss(f, d.tam), esClave = false;
    if (diseno === "editorial" && clave(w)) {
      txt = txt.toUpperCase(); esClave = true;
      fuente = `850 ${Math.round(d.tam * 0.72)}px "b-archivo"`;
    } else if (d.mayus) txt = txt.toUpperCase();
    ctx.font = fuente;
    if ("fontStretch" in ctx) ctx.fontStretch = esClave || f.ancho === "125%" ? "expanded" : "normal";
    return { w, txt, fuente, ancho: ctx.measureText(txt).width, esClave };
  });
  const esp = d.tam * 0.26;
  const lineas = [];
  let linea = [], ancho = 0;
  for (const it of items) {
    if (linea.length && ancho + esp + it.ancho > g.ancho) { lineas.push({ items: linea, ancho }); linea = []; ancho = 0; }
    ancho += (linea.length ? esp : 0) + it.ancho;
    linea.push(it);
  }
  if (linea.length) lineas.push({ items: linea, ancho });
  const altoLinea = d.tam * 1.12;
  const y0 = H * g.posY - (altoLinea * (lineas.length - 1)) / 2;
  ctx.save();
  ctx.translate(W / 2, H * g.posY);
  ctx.scale(escala, escala);
  ctx.translate(-W / 2, -H * g.posY);
  ctx.textBaseline = "middle";
  lineas.forEach((l, n) => {
    let x = (W - l.ancho) / 2;
    const y = y0 + n * altoLinea;
    for (const it of l.items) {
      const { w } = it;
      const activa = t >= w.s && t < Math.max(w.e, w.s + 0.08);
      const dicha = t >= w.e;
      let color = g.colorTexto;
      if (activa) color = g.acento;
      else if (dicha && diseno === "impacto") color = g.acento;
      if (o.subtitulos.resaltar && clave(w)) color = g.acento;
      if (it.esClave) color = g.acento;
      // crece sin invadir a las vecinas: como mucho el 70 % del espacio entre palabras
      const crece = activa ? 1 + Math.min(0.07, (0.7 * esp) / Math.max(it.ancho, 1)) * suave((t - w.s) / 0.1) : 1;
      ctx.save();
      ctx.translate(x + it.ancho / 2, y);
      ctx.scale(crece, crece);
      ctx.font = it.fuente;
      if ("fontStretch" in ctx) ctx.fontStretch = it.esClave || f.ancho === "125%" ? "expanded" : "normal";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = d.tam * 0.28; ctx.shadowOffsetY = d.tam * 0.04;
      if (d.contorno) {
        ctx.lineJoin = "round"; ctx.lineWidth = d.contorno * 2; ctx.strokeStyle = "#0B0B0B";
        ctx.strokeText(it.txt, 0, 0);
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = color;
      ctx.fillText(it.txt, 0, 0);
      ctx.restore();
      x += it.ancho + esp;
    }
  });
  ctx.restore();
}

function partesTitulo(titulo) {
  const m = titulo.match(/^(.*?)\*([^*]+)\*(.*)$/);
  if (m) return { antes: m[1].trim(), clave: m[2].trim(), despues: m[3].trim() };
  const p = titulo.split(/\s+/);
  return { antes: p.slice(0, -1).join(" "), clave: p[p.length - 1], despues: "" };
}

function dibujarTitulo(ctx, g, t) {
  const { W, H, o } = g, dis = o.titulo.diseno;
  const entra = rebote(t / 0.35, 1.1), sale = 1 - suave((t - 2.7) / 0.3);
  const alfa = Math.min(1, t / 0.12) * sale;
  if (alfa <= 0) return;
  const { antes, clave, despues } = partesTitulo(g.titulo.replace(/~/g, " "));
  const misma = o.titulo.mismaLetra && o.subtitulos.diseno !== "ninguno";
  const fs = misma ? g.f : null;
  const yC = H * (g.vertical ? 0.2 : 0.17);
  ctx.save();
  ctx.globalAlpha = alfa;
  // degradado oscuro arriba para que se lea sobre fondos claros
  const grad = ctx.createLinearGradient(0, 0, 0, yC + H * 0.16);
  grad.addColorStop(0, "rgba(0,0,0,0.5)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, yC + H * 0.16);
  ctx.translate(W / 2, yC); ctx.scale(0.9 + 0.1 * entra, 0.9 + 0.1 * entra); ctx.translate(-W / 2, -yC);
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let tam = dis === "impacto" ? 112 : dis === "editorial" ? 124 : 100;
  const fNormal = (px) => fs ? fuenteCss(fs, px) : dis === "editorial" ? `italic 400 ${px}px "b-instrument"` : dis === "impacto" ? `900 ${px}px "b-archivo"` : `800 ${px}px "b-intertight"`;
  const fClave = (px) => fs ? fuenteCss(fs, px) : dis === "editorial" ? `850 ${Math.round(px * 0.78)}px "b-archivo"` : dis === "impacto" ? `900 ${px}px "b-archivo"` : `800 ${px}px "b-intertight"`;
  const mayus = dis === "impacto";
  const piezas = [
    ...antes.split(/\s+/).filter(Boolean).map((x) => ({ x, clave: false })),
    { x: clave, clave: true },
    ...despues.split(/\s+/).filter(Boolean).map((x) => ({ x, clave: false })),
  ].map((p) => ({ ...p, x: mayus || (p.clave && dis === "editorial") ? p.x.toUpperCase() : p.x }));
  let lineas;
  for (;;) {
    const esp = tam * 0.26;
    lineas = []; let l = [], a = 0;
    for (const p of piezas) {
      ctx.font = p.clave ? fClave(tam) : fNormal(tam);
      if ("fontStretch" in ctx) ctx.fontStretch = (dis !== "subrayador" && (p.clave || dis === "impacto")) && !fs ? "expanded" : "normal";
      p.ancho = ctx.measureText(p.x).width + (p.clave && dis === "subrayador" ? tam * 0.36 : 0);
      if (l.length && a + esp + p.ancho > W * 0.86) { lineas.push({ l, a }); l = []; a = 0; }
      a += (l.length ? esp : 0) + p.ancho; l.push(p);
    }
    if (l.length) lineas.push({ l, a });
    if (lineas.length <= 2 || tam <= 70) break;
    tam -= 8;
  }
  const esp = tam * 0.26, alto = tam * 1.12;
  const oscuro = luminancia(g.acento) > 0.55;
  lineas.forEach((ln, n) => {
    let x = (W - ln.a) / 2;
    const y = yC + (n - (lineas.length - 1) / 2) * alto;
    for (const p of ln.l) {
      ctx.font = p.clave ? fClave(tam) : fNormal(tam);
      if ("fontStretch" in ctx) ctx.fontStretch = (dis !== "subrayador" && (p.clave || dis === "impacto")) && !fs ? "expanded" : "normal";
      if (p.clave && dis === "subrayador") {
        const prog = suave((t - 0.15) / 0.3);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = g.acento;
        redondo(ctx, x, y - tam * 0.62, p.ancho * prog, tam * 1.2, 18);
        ctx.fill();
        ctx.fillStyle = oscuro ? "#0B0B0B" : "#FFFFFF";
        ctx.fillText(p.x, x + tam * 0.18, y + tam * 0.02);
      } else {
        ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 24;
        ctx.fillStyle = p.clave && dis !== "subrayador" ? g.acento : "#FFFFFF";
        ctx.fillText(p.x, x, y);
      }
      x += p.ancho + esp;
    }
  });
  ctx.restore();
}

function redondo(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, Math.max(w, 0) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function dibujarSello(ctx, g, s, dt) {
  const { W, H } = g;
  const escala = 0.6 + 0.4 * rebote(dt / 0.38, 0.8), alfa = Math.min(1, dt / 0.12) * (1 - suave((dt - 2.1) / 0.3));
  if (alfa <= 0) return;
  const alto = 128, cifraPx = 76, etPx = 22, frasePx = 27;
  ctx.save();
  ctx.font = `800 ${cifraPx}px "b-intertight"`;
  const wc = ctx.measureText(s.centro).width;
  ctx.font = `700 ${etPx}px "b-intertight"`;
  const arriba = (s.arriba || "").toUpperCase();
  const wa = ctx.measureText(arriba).width + arriba.length * 2;
  ctx.font = `500 ${frasePx}px "b-intertight"`;
  const wb = ctx.measureText(s.abajo || "").width;
  const textos = Math.max(wa, wb);
  const ancho = 42 * 2 + wc + (textos ? 40 + textos : 0);
  const cx = W * (s.lado === "izq" ? 0.34 : 0.66), cy = H * (g.vertical ? 0.43 : 0.45);
  const x0 = Math.min(Math.max(cx - ancho / 2, W * 0.04), W * 0.96 - ancho);
  ctx.globalAlpha = alfa;
  ctx.translate(x0 + ancho / 2, cy); ctx.scale(escala, escala); ctx.translate(-(x0 + ancho / 2), -cy);
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(12,10,8,0.82)";
  redondo(ctx, x0, cy - alto / 2, ancho, alto, alto / 2); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 3.5; ctx.strokeStyle = g.acento; ctx.stroke();
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let x = x0 + 42;
  ctx.fillStyle = g.acento; ctx.font = `800 ${cifraPx}px "b-intertight"`;
  ctx.fillText(s.centro, x, cy + 3);
  x += wc + 20;
  if (textos) {
    ctx.globalAlpha = alfa * 0.6; ctx.fillStyle = g.acento; ctx.fillRect(x, cy - 34, 1.5, 68); ctx.globalAlpha = alfa;
    x += 20;
    const cxT = x + textos / 2;
    ctx.textAlign = "center";
    if (arriba) {
      ctx.fillStyle = "#F6F3EC"; ctx.font = `700 ${etPx}px "b-intertight"`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
      ctx.fillText(arriba, cxT, s.abajo ? cy - 20 : cy);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    if (s.abajo) { ctx.fillStyle = g.acento; ctx.font = `500 ${frasePx}px "b-intertight"`; ctx.fillText(s.abajo, cxT, arriba ? cy + 20 : cy); }
  }
  ctx.restore();
}

function dibujarLogo(ctx, g) {
  const { W, H, o, logo } = g;
  if (!logo) return;
  const esquina = o.logo.posicion === "esquina";
  const ancho = esquina ? 120 : 140, alto = (logo.height / logo.width) * ancho;
  const x = W * (esquina ? 0.85 : 0.5) - ancho / 2, y = H * (g.vertical ? 0.17 : 0.08) - alto / 2;
  ctx.save(); ctx.globalAlpha = 0.92; ctx.drawImage(logo, x, y, ancho, alto); ctx.restore();
}

/** Firma final: el último plano desenfocado con tu @, una línea y el logo. */
export function dibujarCierre(ctx, g, fondo, dt) {
  const { W, H, o } = g, c = o.cierre;
  ctx.save();
  ctx.filter = `blur(${Math.round(28 * suave(dt / 0.45))}px)`;
  ctx.drawImage(fondo, 0, 0, W, H);
  ctx.filter = "none";
  ctx.fillStyle = `rgba(11,11,11,${0.45 * suave(dt / 0.45)})`; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const piezas = [];
  if (g.logo) piezas.push({ tipo: "logo", alto: (g.logo.height / g.logo.width) * 380 });
  if (c.texto) piezas.push({ tipo: "texto", alto: 70 });
  if (c.subtexto) piezas.push({ tipo: "sub", alto: 40 });
  const total = piezas.reduce((s, p) => s + p.alto + 30, -30);
  let y = H * 0.45 - total / 2;
  piezas.forEach((p, k) => {
    const pr = suave((dt - 0.2 - 0.16 * k) / 0.55);
    ctx.globalAlpha = pr;
    const dy = 36 * (1 - pr);
    if (p.tipo === "logo") ctx.drawImage(g.logo, W / 2 - 190, y + dy, 380, p.alto);
    if (p.tipo === "texto") { ctx.fillStyle = "#FFFFFF"; ctx.font = `850 64px "b-archivo"`; if ("fontStretch" in ctx) ctx.fontStretch = "expanded"; ctx.fillText(c.texto, W / 2, y + p.alto / 2 + dy); }
    if (p.tipo === "sub") { ctx.fillStyle = "#C9C9C5"; ctx.font = `500 34px "b-intertight"`; if ("letterSpacing" in ctx) ctx.letterSpacing = "6px"; ctx.fillText(c.subtexto.toUpperCase(), W / 2, y + p.alto / 2 + dy); if ("letterSpacing" in ctx) ctx.letterSpacing = "0px"; }
    y += p.alto + 30;
  });
  ctx.restore();
}
