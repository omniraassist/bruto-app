// Motor de BRUTO en el dispositivo: carga de tomas, audio, color (WebGL), render en tiempo real y grabación.
import { LOOKS, MOVIMIENTOS, FORMATOS } from "./caracter.js";
import { prepararGraficos, dibujarGraficos, dibujarCierre } from "./graficos.js";

let audioCtx = null;
export function contextoAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  return audioCtx;
}
/** Hay que llamarlo dentro de un toque del usuario (iOS no deja sonar audio sin gesto). */
export async function despertarAudio() { const c = contextoAudio(); if (c.state !== "running") await c.resume(); }

const esperar = (el, ev) => new Promise((ok, mal) => {
  const f = () => { el.removeEventListener(ev, f); el.removeEventListener("error", e); ok(); };
  const e = () => { el.removeEventListener(ev, f); el.removeEventListener("error", e); mal(new Error("Este clip no ha entrado. Prueba con otro.")); };
  el.addEventListener(ev, f); el.addEventListener("error", e);
});

function nuevoVideo(url) {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  v.src = url;
  return v;
}

async function buscar(v, t) {
  if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return;
  const p = esperar(v, "seeked");
  v.currentTime = Math.max(0, t);
  await p;
}

/** Carga una toma: elementos de vídeo (o la imagen), su audio y su duración. */
export async function cargarToma(blob, tipo) {
  const url = URL.createObjectURL(blob);
  if (tipo === "foto") {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = contextoAudio();
    return { tipo, url, img, ancho: img.naturalWidth, alto: img.naturalHeight, duracion: 3, audio: c.createBuffer(2, 3 * 48000, 48000) };
  }
  const v = nuevoVideo(url);
  await esperar(v, "loadedmetadata");
  if (v.readyState < 2) { const p = esperar(v, "loadeddata"); v.load(); await p.catch(() => {}); }
  let audio;
  try { audio = await contextoAudio().decodeAudioData(await blob.arrayBuffer()); }
  catch (_) { audio = contextoAudio().createBuffer(2, Math.max(1, Math.ceil(v.duration * 48000)), 48000); }
  return { tipo, url, els: [v, nuevoVideo(url)], ancho: v.videoWidth, alto: v.videoHeight, duracion: v.duration || audio.duration, audio };
}

export function liberar(media) { for (const m of media || []) { m.els?.forEach((v) => { v.removeAttribute("src"); v.load(); }); URL.revokeObjectURL(m.url); } }

/** Audio a 16 kHz mono (para el reconocimiento de voz y para medir la energía). */
export async function audio16k(buffer, duracion) {
  const n = Math.max(1, Math.ceil(duracion * 16000));
  const off = new OfflineAudioContext(1, n, 16000);
  const s = off.createBufferSource(); s.buffer = buffer; s.connect(off.destination); s.start(0);
  return (await off.startRendering()).getChannelData(0);
}

/** Energía en dB cada 10 ms. */
export function energia(muestras16k, frames) {
  const out = new Float32Array(frames).fill(-90);
  const n = Math.min(frames, Math.floor(muestras16k.length / 160));
  for (let k = 0; k < n; k++) {
    let s = 0; for (let j = 0; j < 160; j++) { const x = muestras16k[k * 160 + j]; s += x * x; }
    out[k] = 10 * Math.log10(s / 160 + 1e-12);
  }
  return out;
}

// ---------- color: corrección automática ----------

export function calcularAjuste(pix) { // pix: Uint8ClampedArray RGBA
  let n = 0, sr = 0, sg = 0, sb = 0, gr = 0, gg = 0, gb = 0, ng = 0;
  const lums = [];
  for (let k = 0; k < pix.length; k += 4) {
    const r = pix[k] / 255, g = pix[k + 1] / 255, b = pix[k + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l <= 0.05 || l >= 0.95) continue;
    n++; sr += r; sg += g; sb += b; lums.push(l);
    if (Math.max(r, g, b) - Math.min(r, g, b) < 0.1 && l > 0.18 && l < 0.85) { ng++; gr += r; gg += g; gb += b; }
  }
  if (n < 500) return null;
  let m, peso;
  if (ng > 0.03 * n) { m = [gr / ng, gg / ng, gb / ng]; peso = 0.7; } else { m = [sr / n, sg / n, sb / n]; peso = 0.3; }
  const media = (m[0] + m[1] + m[2]) / 3;
  let gan = m.map((x) => Math.min(1.08, Math.max(0.92, 1 + (media / Math.max(x, 1e-6) - 1) * peso)));
  const lg = 0.2126 * gan[0] + 0.7152 * gan[1] + 0.0722 * gan[2];
  gan = gan.map((x) => x / lg);
  lums.sort((a, b) => a - b);
  const med = lums[Math.floor(lums.length / 2)];
  let medio = 0.5;
  if (med < 0.34) medio = 0.5 + Math.min(0.1, (0.43 - med) * 0.7);
  else if (med > 0.62) medio = 0.5 - Math.min(0.07, (med - 0.55) * 0.5);
  if (gan.every((x) => Math.abs(x - 1) < 0.012) && medio === 0.5) return null;
  return { r: gan[0], g: gan[1], b: gan[2], medio, luz: med };
}

/** Mide la luz y el color de las tomas (un fotograma de cada una, sin look). */
export async function medirAjuste(media) {
  const c = document.createElement("canvas"); c.width = 135; c.height = 240;
  const x = c.getContext("2d", { willReadFrequently: true });
  const pix = [];
  for (const m of media) {
    if (m.tipo === "foto") x.drawImage(m.img, 0, 0, c.width, c.height);
    else { const v = m.els[1]; await buscar(v, m.duracion / 2); x.drawImage(v, 0, 0, c.width, c.height); }
    pix.push(x.getImageData(0, 0, c.width, c.height).data);
  }
  const todo = new Uint8ClampedArray(pix.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of pix) { todo.set(p, o); o += p.length; }
  return calcularAjuste(todo);
}

// ---------- color: WebGL ----------

const VS = `attribute vec2 a; varying vec2 v; void main(){ v = vec2(a.x*0.5+0.5, 0.5-a.y*0.5); gl_Position = vec4(a,0.,1.); }`;
const FS = `precision mediump float;
varying vec2 v; uniform sampler2D u_img, u_lut; uniform vec4 u_rect; uniform vec3 u_gan;
uniform float u_p, u_con, u_sat, u_cal, u_tin, u_neg, u_bri, u_vin, u_som, u_lutN, u_lutMix, u_asp;
vec3 lut3(vec3 c){ float n=u_lutN; float b=c.b*(n-1.); float b0=floor(b); float b1=min(b0+1.,n-1.); float f=b-b0;
  float x=c.r*(n-1.)+.5, y=(c.g*(n-1.)+.5)/n;
  return mix(texture2D(u_lut, vec2((b0*n+x)/(n*n), y)).rgb, texture2D(u_lut, vec2((b1*n+x)/(n*n), y)).rgb, f); }
void main(){
  vec3 c = texture2D(u_img, u_rect.xy + v*u_rect.zw).rgb;
  c = pow(clamp(c*u_gan, 0., 1.), vec3(u_p));
  c = u_neg + (1.-u_neg)*c;
  c = (c-.45)*u_con + .45 + u_bri;
  float l = dot(clamp(c,0.,1.), vec3(.2126,.7152,.0722));
  c = mix(vec3(l), c, u_sat);
  c.r += u_cal*l; c.b -= u_cal*l; c.g -= u_tin*l*.5;
  c.b += u_som*(1.-l)*.6; c.r -= u_som*(1.-l)*.3;
  c = clamp(c, 0., 1.);
  if (u_lutMix > 0.) c = mix(c, lut3(c), u_lutMix);
  vec2 d = (v-.5)*vec2(u_asp,1.);
  c *= 1. - u_vin*smoothstep(.3, .9, length(d)*1.25);
  gl_FragColor = vec4(c, 1.);
}`;

export class Color {
  constructor(W, H) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W; this.canvas.height = H;
    const gl = this.gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("Este móvil no puede montar vídeo (sin WebGL).");
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p); gl.useProgram(p);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(p, "a"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["u_img", "u_lut", "u_rect", "u_gan", "u_p", "u_con", "u_sat", "u_cal", "u_tin", "u_neg", "u_bri", "u_vin", "u_som", "u_lutN", "u_lutMix", "u_asp"])
      this.u[n] = gl.getUniformLocation(p, n);
    this.tex = this.textura(0); this.lut = this.textura(1);
    gl.uniform1i(this.u.u_img, 0); gl.uniform1i(this.u.u_lut, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3));
    gl.uniform1f(this.u.u_asp, W / H);
  }
  textura(unidad) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unidad); gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  configurar(o, ajuste, lut) {
    const gl = this.gl, L = LOOKS[o.lut.activo && lut ? "neutro" : o.look] || LOOKS.neutro;
    const aj = o.correccion && ajuste ? ajuste : { r: 1, g: 1, b: 1, medio: 0.5 };
    gl.uniform3f(this.u.u_gan, aj.r, aj.g, aj.b);
    gl.uniform1f(this.u.u_p, Math.log(aj.medio) / Math.log(0.5));
    gl.uniform1f(this.u.u_con, L.contraste); gl.uniform1f(this.u.u_sat, L.saturacion); gl.uniform1f(this.u.u_cal, L.calidez);
    gl.uniform1f(this.u.u_tin, L.tinte); gl.uniform1f(this.u.u_neg, L.negros); gl.uniform1f(this.u.u_bri, L.brillo);
    gl.uniform1f(this.u.u_vin, L.vineta); gl.uniform1f(this.u.u_som, L.sombrasFrias || 0);
    if (o.lut.activo && lut) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, lut.n * lut.n, lut.n, 0, gl.RGB, gl.UNSIGNED_BYTE, lut.datos);
      gl.uniform1f(this.u.u_lutN, lut.n); gl.uniform1f(this.u.u_lutMix, o.lut.intensidad / 100);
    } else gl.uniform1f(this.u.u_lutMix, 0);
  }
  /** Dibuja la fuente recortada al formato, con zoom `z`. */
  pintar(fuente, ancho, alto, z = 1) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    const sa = ancho / alto, oa = W / H;
    let w = 1, h = 1;
    if (sa > oa) w = oa / sa; else h = sa / oa;
    w /= z; h /= z;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, fuente); } catch (_) { return false; }
    gl.uniform4f(this.u.u_rect, 0.5 - w / 2, 0.5 - h / 2, w, h);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}

/** LUT .cube → { n, datos } listo para la gráfica (como mucho 33³). */
export function leerCube(texto) {
  let n = 0, min = [0, 0, 0], max = [1, 1, 1];
  const filas = [];
  for (const l of texto.split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const k = t.split(/\s+/);
    const c = k[0].toUpperCase();
    if (c === "LUT_3D_SIZE") n = parseInt(k[1], 10);
    else if (c === "LUT_1D_SIZE") throw new Error("Es un LUT 1D. Usa uno 3D.");
    else if (c === "DOMAIN_MIN") min = k.slice(1, 4).map(Number);
    else if (c === "DOMAIN_MAX") max = k.slice(1, 4).map(Number);
    else if (/^[-\d.]/.test(k[0]) && k.length >= 3) filas.push(k.slice(0, 3).map(Number));
  }
  if (!n || n < 2 || filas.length !== n * n * n) throw new Error("No es un LUT .cube 3D válido.");
  const val = (r, g, b) => filas[r + g * n + b * n * n];
  const N = Math.min(n, 33);
  const datos = new Uint8Array(N * N * N * 3);
  const muestra = (x) => x * (n - 1) / (N - 1);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const [fr, fg, fb] = [muestra(r), muestra(g), muestra(b)];
    const [r0, g0, b0] = [Math.floor(fr), Math.floor(fg), Math.floor(fb)];
    const [r1, g1, b1] = [Math.min(r0 + 1, n - 1), Math.min(g0 + 1, n - 1), Math.min(b0 + 1, n - 1)];
    const [dr, dg, db] = [fr - r0, fg - g0, fb - b0];
    for (let ch = 0; ch < 3; ch++) {
      const c00 = val(r0, g0, b0)[ch] * (1 - dr) + val(r1, g0, b0)[ch] * dr, c10 = val(r0, g1, b0)[ch] * (1 - dr) + val(r1, g1, b0)[ch] * dr;
      const c01 = val(r0, g0, b1)[ch] * (1 - dr) + val(r1, g0, b1)[ch] * dr, c11 = val(r0, g1, b1)[ch] * (1 - dr) + val(r1, g1, b1)[ch] * dr;
      const v = (c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db;
      const norm = (v - min[ch]) / Math.max(max[ch] - min[ch], 1e-9);
      datos[(b * N * N + g * N + r) * 3 + ch] = Math.round(Math.min(1, Math.max(0, norm)) * 255);
    }
  }
  // en la textura: x = b·N + r, y = g
  const tex = new Uint8Array(N * N * N * 3);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = (b * N * N + g * N + r) * 3, d = (g * N * N + b * N + r) * 3;
    tex[d] = datos[o]; tex[d + 1] = datos[o + 1]; tex[d + 2] = datos[o + 2];
  }
  return { n: N, datos: tex };
}

const colores = {};
function colorPara(W, H) { return (colores[`${W}x${H}`] ||= new Color(W, H)); }

// ---------- plan de montaje ----------

/** Une cortes, movimiento y gráficos en un plan listo para pintar. */
export function planDe({ o, media, tomas, corte, editadas, montaje, sellos, ajuste, lut, logo, musica }) {
  const [W, H] = FORMATOS[o.formato] || FORMATOS["9:16"];
  const mov = MOVIMIENTOS[o.movimiento] || MOVIMIENTOS.suave;
  const segs = [];
  let off = 0, grupo = -1, ultimaToma = -1, usos = {};
  for (const c of corte.cortes) {
    if (c.toma !== ultimaToma) { grupo++; ultimaToma = c.toma; }
    usos[c.toma] = (usos[c.toma] || 0) + 1;
    segs.push({ ...c, off, largo: c.e - c.s, grupo, el: usos[c.toma] % 2, cambio: segs.length > 0 && segs[segs.length - 1].toma !== c.toma });
    off += c.e - c.s;
  }
  const largoGrupo = {}, inicioGrupo = {};
  for (const s of segs) { largoGrupo[s.grupo] = (largoGrupo[s.grupo] || 0) + s.largo; if (!(s.grupo in inicioGrupo)) inicioGrupo[s.grupo] = s.off; }
  const conCierre = o.cierre.activo && (o.cierre.texto || o.cierre.subtexto || (o.logo.activo && logo));
  const g = prepararGraficos(o, { W, H, editadas, claves: montaje.claves, titulo: montaje.tituloFinal, sellos, duracion: off,
    logo: o.logo.activo ? logo : null, conCierre });
  const golpes = [];
  if (o.enfasis && mov.zoom) {
    const cand = [...sellos.map((s) => s.ini), ...montaje.claves.map((i) => editadas.find((w) => w.i === i)?.s).filter((x) => x !== undefined)];
    for (const t of cand) { if (t >= 3.2 && !golpes.some((x) => Math.abs(x - t) < 3.5) && golpes.length < 6) golpes.push(t + 0.04); }
    golpes.sort((a, b) => a - b);
  }
  return { o, W, H, media, tomas, segs, total: off, cierre: conCierre ? 2.4 : 0, mov, g, golpes, ajuste, lut, musica, editadas, largoGrupo, inicioGrupo };
}

function zoomEn(plan, s, T) {
  const { mov } = plan;
  if (!mov.zoom) return 1;
  const base = s.grupo % 2 === 1 ? mov.alterno : 1;
  const lento = mov.lento * (T - plan.inicioGrupo[s.grupo]) / Math.max(plan.largoGrupo[s.grupo], 0.5);
  let golpe = 0;
  for (const x of plan.golpes) golpe += 0.06 * Math.pow(Math.max(0, 1 - Math.abs(T - x) / 0.32), 2);
  return base + lento + golpe;
}

// ---------- sonido: mezcla fuera de tiempo real ----------

const db = (x) => Math.pow(10, x / 20);
function rms(buf, desde = 0, hasta = buf.duration) {
  const d = buf.getChannelData(0), a = Math.floor(desde * buf.sampleRate), b = Math.min(d.length, Math.floor(hasta * buf.sampleRate));
  let s = 0, n = 0; for (let k = a; k < b; k += 4) { s += d[k] * d[k]; n++; }
  return 10 * Math.log10(s / Math.max(n, 1) + 1e-12);
}

function ruido(ctx, seg) {
  const b = ctx.createBuffer(1, Math.ceil(seg * ctx.sampleRate), ctx.sampleRate), d = b.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  return b;
}
function pop(ctx, t, nivel) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(950, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.07);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(nivel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.13);
}
function whoosh(ctx, t, nivel, dur = 0.32) {
  const s = ctx.createBufferSource(); s.buffer = ruido(ctx, dur);
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.4;
  f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.7);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(nivel, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t);
}
function impacto(ctx, t, nivel) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
  g.gain.setValueAtTime(nivel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.55);
  whoosh(ctx, t - 0.02, nivel * 0.35, 0.2);
}

/** Pista final: voz cortada (con microfundidos), música con ducking, efectos y volumen normalizado. */
export async function mezclar(plan) {
  const sr = 48000, total = plan.total + plan.cierre, n = Math.ceil((total + 0.2) * sr);
  const voz = new OfflineAudioContext(2, n, sr);
  for (const s of plan.segs) {
    const m = plan.media[s.toma], t0 = plan.tomas[s.toma].inicio;
    const src = voz.createBufferSource(); src.buffer = m.audio;
    const g = voz.createGain(), f = Math.min(0.012, s.largo / 4);
    g.gain.setValueAtTime(0, s.off); g.gain.linearRampToValueAtTime(1, s.off + f);
    g.gain.setValueAtTime(1, s.off + s.largo - f); g.gain.linearRampToValueAtTime(0, s.off + s.largo);
    src.connect(g).connect(voz.destination);
    src.start(s.off, Math.max(0, s.s - t0), s.largo);
  }
  const vozBuf = await voz.startRendering();
  const nivelVoz = plan.editadas.length ? plan.editadas.reduce((acc, w) => acc + rms(vozBuf, w.s, w.e), 0) / plan.editadas.length : -24;

  const mix = new OfflineAudioContext(2, n, sr);
  const v = mix.createBufferSource(); v.buffer = vozBuf; v.connect(mix.destination); v.start(0);
  const { o } = plan;
  if (plan.musica && o.musica.modo === "propia") {
    const mus = plan.musica;
    const inicio = arranqueMusica(mus);
    const objetivo = nivelVoz - (o.musica.nivel === "presente" ? 7 : 12);
    const base = db(objetivo - rms(mus, inicio, Math.min(mus.duration, inicio + 30)));
    const src = mix.createBufferSource(); src.buffer = mus; src.loop = true; src.loopStart = inicio;
    const g = mix.createGain();
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(base, 0.25);
    // baja mientras se habla y sube en los huecos
    let hablando = false;
    for (const w of plan.editadas) {
      if (!hablando) { g.gain.setTargetAtTime(base * 0.55, Math.max(0.26, w.s - 0.08), 0.05); hablando = true; }
      const sig = plan.editadas.find((x) => x.s > w.e);
      if (!sig || sig.s - w.e > 0.9) { g.gain.setTargetAtTime(base, w.e + 0.15, 0.2); hablando = false; }
    }
    g.gain.setTargetAtTime(0, Math.max(0.3, total - 1.2), 0.35);
    src.connect(g).connect(mix.destination);
    src.start(0, inicio);
  }
  if (o.sfx) {
    const nv = db(nivelVoz) * 1.4;
    if (plan.g.titulo) { pop(mix, 0.05, nv * 0.9); whoosh(mix, 0.18, nv * 0.35); }
    for (const s of plan.g.sellos) pop(mix, s.ini + 0.1, nv * 0.8);
    for (const s of plan.segs) if (s.cambio && plan.mov.fundido) whoosh(mix, Math.max(0, s.off - 0.12), nv * 0.25, 0.26);
    for (const x of plan.golpes) whoosh(mix, Math.max(0, x - 0.1), nv * 0.18, 0.2);
    if (plan.cierre) impacto(mix, plan.total + 0.08, nv * 1.2);
  }
  const buf = await mix.startRendering();
  // volumen final: voz hacia -16 dBFS RMS (≈ -14 LUFS) sin pasar de -1 dB de pico
  const actual = nivelVoz + 0.5, ganancia = db(-16 - actual);
  let pico = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let k = 0; k < d.length; k += 2) pico = Math.max(pico, Math.abs(d[k])); }
  const gF = Math.min(ganancia, 0.89 / Math.max(pico, 1e-6));
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let k = 0; k < d.length; k++) d[k] *= gF; }
  return buf;
}

function arranqueMusica(buf) { // se salta la intro en silencio
  const d = buf.getChannelData(0), sr = buf.sampleRate, ventana = Math.floor(sr * 0.25);
  const ref = Math.sqrt(d.reduce((s, x, k) => (k % 64 ? s : s + x * x), 0) / (d.length / 64));
  for (let k = 0; k + ventana < d.length; k += ventana) {
    let s = 0; for (let j = k; j < k + ventana; j += 32) s += d[j] * d[j];
    if (Math.sqrt(s / (ventana / 32)) > ref * 0.6) return k / sr;
  }
  return 0;
}

// ---------- pintar y grabar ----------

function lienzo(W, H) { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }

/** Un fotograma fijo del plan (vista previa, portada, póster). */
export async function fotograma(plan, T, { graficos = true } = {}) {
  const color = colorPara(plan.W, plan.H);
  color.configurar(plan.o, plan.ajuste, plan.lut);
  const out = lienzo(plan.W, plan.H), ctx = out.getContext("2d");
  T = Math.min(Math.max(T, 0), Math.max(plan.total - 0.05, 0));
  const s = plan.segs.find((x) => T >= x.off && T < x.off + x.largo) || plan.segs[plan.segs.length - 1];
  const m = plan.media[s.toma];
  const tf = s.s - plan.tomas[s.toma].inicio + (T - s.off);
  if (m.tipo === "foto") color.pintar(m.img, m.ancho, m.alto, zoomEn(plan, s, T));
  else { const v = m.els[0]; await buscar(v, tf); color.pintar(v, m.ancho, m.alto, zoomEn(plan, s, T)); }
  ctx.drawImage(color.canvas, 0, 0);
  if (graficos) dibujarGraficos(ctx, plan.g, T);
  return out;
}

export function tipoGrabacion() {
  const tipos = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4",
    "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return tipos.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}

/**
 * Monta el vídeo en tiempo real y lo graba. Tarda lo que dura el vídeo.
 * Devuelve { blob, tipo, poster }.
 */
export async function grabar(plan, audioFinal, { alProgreso = () => {}, señal, mostrar } = {}) {
  const { W, H, segs, media, tomas } = plan;
  const ctxA = contextoAudio();
  await ctxA.resume().catch(() => {});
  if (ctxA.state !== "running") throw Object.assign(new Error("audio"), { necesitaToque: true });
  const color = colorPara(W, H);
  color.configurar(plan.o, plan.ajuste, plan.lut);
  const out = lienzo(W, H), ctx = out.getContext("2d");
  const fundido = lienzo(W, H), fctx = fundido.getContext("2d");
  const ultimo = lienzo(W, H), uctx = ultimo.getContext("2d");
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  mostrar?.(out);

  const elDe = (s) => media[s.toma].els?.[s.el];
  const tLocal = (s) => s.s - tomas[s.toma].inicio;
  // prepara los dos primeros
  for (const s of segs.slice(0, 2)) { const v = elDe(s); if (v) await buscar(v, tLocal(s)); }

  const destino = ctxA.createMediaStreamDestination();
  const fuente = ctxA.createBufferSource(); fuente.buffer = audioFinal; fuente.connect(destino);
  const flujo = out.captureStream(30);
  const pistas = new MediaStream([...flujo.getVideoTracks(), ...destino.stream.getAudioTracks()]);
  const tipo = tipoGrabacion();
  const rec = new MediaRecorder(pistas, { ...(tipo ? { mimeType: tipo } : {}), videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
  const trozos = [];
  rec.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
  const terminado = new Promise((ok) => { rec.onstop = ok; });

  let bloqueo = null;
  try { bloqueo = await navigator.wakeLock?.request("screen"); } catch (_) { /* */ }
  const total = plan.total + plan.cierre;
  rec.start(500);
  const t0 = ctxA.currentTime + 0.15;
  fuente.start(t0);
  let k = -1, anterior = null, error = null, dibujado = false;
  // arranca el reproductor del siguiente corte un poco antes, para que no haya parón al cambiar de toma
  const precalentar = (T) => {
    const sig = segs[k + 1], actual = k >= 0 ? elDe(segs[k]) : null;
    if (!sig) return;
    const vs = elDe(sig);
    if (vs && vs !== actual && vs.paused && sig.off - T < 0.3) {
      vs.currentTime = Math.max(0, tLocal(sig) - Math.max(0, sig.off - T));
      vs.play().catch(() => {});
    }
  };

  await new Promise((ok) => {
    const paso = () => {
      if (señal?.aborted) { error = new Error("Cancelado."); return ok(); }
      if (document.hidden) { error = new Error("Vuelve a BRUTO: el vídeo se monta con la app abierta y la pantalla encendida."); return ok(); }
      const T = ctxA.currentTime - t0;
      if (T >= total + 0.05) return ok();
      if (T < 0) { precalentar(T); requestAnimationFrame(paso); return; }
      alProgreso(Math.min(1, T / total));
      if (T < plan.total) {
        // segmento que toca ahora
        let nk = k < 0 ? 0 : k;
        while (nk < segs.length - 1 && T >= segs[nk].off + segs[nk].largo) nk++;
        if (nk !== k) {
          if (k >= 0) { const v = elDe(segs[k]); if (v && v !== elDe(segs[nk])) v.pause(); }
          const s = segs[nk];
          if (s.cambio && plan.mov.fundido && dibujado) { fctx.drawImage(color.canvas, 0, 0); anterior = { hasta: s.off + plan.mov.fundido, desde: s.off }; }
          const v = elDe(s);
          if (v) { const objetivo = tLocal(s) + (T - s.off); if (Math.abs(v.currentTime - objetivo) > 0.2) v.currentTime = objetivo; v.play().catch(() => {}); }
          k = nk;
          // deja buscado el siguiente en el otro reproductor
          const sig = segs[k + 1];
          if (sig && sig.off - T > 0.6) { const vs = elDe(sig); if (vs && vs !== v) { vs.pause(); vs.currentTime = Math.max(0, tLocal(sig) - 0.3); } }
        }
        precalentar(T);
        const s = segs[k], m = media[s.toma];
        const ok2 = m.tipo === "foto" ? color.pintar(m.img, m.ancho, m.alto, zoomEn(plan, s, T))
          : elDe(s).readyState >= 2 && color.pintar(elDe(s), m.ancho, m.alto, zoomEn(plan, s, T));
        if (ok2) dibujado = true;
        ctx.drawImage(color.canvas, 0, 0);
        if (anterior && T < anterior.hasta) {
          ctx.globalAlpha = 1 - (T - anterior.desde) / (anterior.hasta - anterior.desde);
          ctx.drawImage(fundido, 0, 0); ctx.globalAlpha = 1;
        }
        dibujarGraficos(ctx, plan.g, T);
        if (T > plan.total - 0.12) uctx.drawImage(color.canvas, 0, 0);
      } else {
        segs.forEach((s) => elDe(s)?.pause());
        dibujarCierre(ctx, plan.g, ultimo, T - plan.total);
      }
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  try { fuente.stop(); } catch (_) { /* */ }
  segs.forEach((s) => elDe(s)?.pause());
  rec.stop();
  await terminado;
  try { await bloqueo?.release(); } catch (_) { /* */ }
  if (error) throw error;
  const blob = new Blob(trozos, { type: (tipo || "video/mp4").split(";")[0] });
  const poster = await new Promise((ok) => (plan.total > 1 ? fotograma(plan, Math.min(1, plan.total / 2)) : Promise.resolve(out))
    .then((c) => c.toBlob(ok, "image/jpeg", 0.85)));
  return { blob, tipo: blob.type, poster };
}

// ---------- render fotograma a fotograma (WebCodecs): exacto y sin parones ----------

const CODEC_VIDEO = "avc1.640028", CODEC_AUDIO = "mp4a.40.2";

export async function soportaFotogramas(W, H) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame || !window.AudioData) return false;
  try {
    const v = await VideoEncoder.isConfigSupported({ codec: CODEC_VIDEO, width: W, height: H, bitrate: 12_000_000, framerate: 30 });
    const a = await AudioEncoder.isConfigSupported({ codec: CODEC_AUDIO, sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });
    return !!(v.supported && a.supported);
  } catch (_) { return false; }
}

async function buscarExacto(v, t) {
  t = Math.max(0, Math.min(t, (v.duration || t) - 0.01));
  if (Math.abs(v.currentTime - t) < 0.004 && v.readyState >= 2) return;
  await new Promise((ok) => {
    let hecho = false;
    const fin = () => { if (hecho) return; hecho = true; v.removeEventListener("seeked", fin); ok(); };
    v.addEventListener("seeked", fin);
    v.currentTime = t;
    setTimeout(fin, 3000);
  });
  if (v.requestVideoFrameCallback && v.readyState < 2) await new Promise((ok) => { v.requestVideoFrameCallback(() => ok()); setTimeout(ok, 500); });
}

export async function grabarFotogramas(plan, audioFinal, { alProgreso = () => {}, señal, mostrar } = {}) {
  const { Muxer, ArrayBufferTarget } = await import("https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm");
  const { W, H, segs, media, tomas } = plan, fps = 30;
  const color = colorPara(W, H);
  color.configurar(plan.o, plan.ajuste, plan.lut);
  const out = lienzo(W, H), ctx = out.getContext("2d");
  const fundido = lienzo(W, H), fctx = fundido.getContext("2d");
  const ultimo = lienzo(W, H), uctx = ultimo.getContext("2d");
  const poster = lienzo(W, H);
  mostrar?.(out);
  const destino = new ArrayBufferTarget();
  const muxer = new Muxer({ target: destino, fastStart: "in-memory", firstTimestampBehavior: "offset",
    video: { codec: "avc", width: W, height: H, frameRate: fps }, audio: { codec: "aac", numberOfChannels: 2, sampleRate: 48000 } });
  let fallo = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { fallo = e; } });
  venc.configure({ codec: CODEC_VIDEO, width: W, height: H, bitrate: 12_000_000, framerate: fps, latencyMode: "quality" });
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { fallo = e; } });
  aenc.configure({ codec: CODEC_AUDIO, sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 });

  // audio entero, en trozos
  const total = plan.total + plan.cierre, nA = Math.min(audioFinal.length, Math.ceil(total * 48000));
  const L = audioFinal.getChannelData(0), R = audioFinal.numberOfChannels > 1 ? audioFinal.getChannelData(1) : L;
  for (let a = 0; a < nA; a += 4800) {
    const n = Math.min(4800, nA - a), datos = new Float32Array(n * 2);
    datos.set(L.subarray(a, a + n), 0); datos.set(R.subarray(a, a + n), n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((a / 48000) * 1e6), data: datos });
    aenc.encode(ad); ad.close();
  }

  const N = Math.round(total * fps);
  let k = 0, anterior = null;
  const tPoster = Math.min(1, plan.total / 2);
  for (let n = 0; n < N; n++) {
    if (fallo) throw fallo;
    if (señal?.aborted) throw new Error("Cancelado.");
    const T = n / fps;
    if (T < plan.total) {
      while (k < segs.length - 1 && T >= segs[k].off + segs[k].largo) k++;
      const s = segs[k], m = media[s.toma];
      if (k > 0 && s.cambio && plan.mov.fundido && (!anterior || anterior.k !== k)) { fctx.drawImage(color.canvas, 0, 0); anterior = { k, desde: s.off, hasta: s.off + plan.mov.fundido }; }
      if (m.tipo === "foto") color.pintar(m.img, m.ancho, m.alto, zoomEn(plan, s, T));
      else { const v = m.els[0]; await buscarExacto(v, s.s - tomas[s.toma].inicio + (T - s.off)); color.pintar(v, m.ancho, m.alto, zoomEn(plan, s, T)); }
      ctx.drawImage(color.canvas, 0, 0);
      if (anterior && T < anterior.hasta) { ctx.globalAlpha = 1 - (T - anterior.desde) / (anterior.hasta - anterior.desde); ctx.drawImage(fundido, 0, 0); ctx.globalAlpha = 1; }
      dibujarGraficos(ctx, plan.g, T);
      if (T >= plan.total - 1 / fps - 1e-6) uctx.drawImage(color.canvas, 0, 0);
      if (Math.abs(T - tPoster) < 0.5 / fps) poster.getContext("2d").drawImage(out, 0, 0);
    } else dibujarCierre(ctx, plan.g, ultimo, T - plan.total);
    const fr = new VideoFrame(out, { timestamp: Math.round(T * 1e6), duration: Math.round(1e6 / fps) });
    venc.encode(fr, { keyFrame: n % 60 === 0 });
    fr.close();
    while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
    if (n % 3 === 0) { alProgreso(n / N); await new Promise((r) => setTimeout(r, 0)); }
  }
  await venc.flush(); await aenc.flush();
  if (fallo) throw fallo;
  muxer.finalize();
  const blob = new Blob([destino.buffer], { type: "video/mp4" });
  const posterBlob = await new Promise((ok) => poster.toBlob(ok, "image/jpeg", 0.85));
  return { blob, tipo: "video/mp4", poster: posterBlob };
}
