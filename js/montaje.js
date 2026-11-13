// Montaje automático: qué se queda, titular, palabras clave, datos contrastados, texto y cortes con silencios medidos.

const quitaTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (t) => quitaTildes(String(t).toLowerCase()).replace(/[^a-z0-9ñ%€ ]+/g, " ").split(/\s+/).filter(Boolean);
const limpia = (t) => String(t).replace(/^[.,;:!¡?¿«»"'…]+|[.,;:!¡?¿«»"'…]+$/g, "");
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

const VACIAS = new Set(`a al algo ante con contra de del desde el en entre era es esa ese eso esta este esto estos estas fue ha hay la las le les lo
los me mi mis mucho muy nada ni no nos o os para pero por que qué se si sí sin sobre son su sus te ti tu tus un una uno unos unas y ya yo él ella
ellos ellas vosotros nosotros como cómo cuando donde porque pues más menos tan tanto todo toda todos todas también aquí ahí allí vale bueno oye
mira hola tía tío entonces así eh em vamos va ver puedes puede podéis podemos tengo tiene tienes tenemos hace hacer nuestra nuestro nuestras nuestros
vuestra vuestro vuestras vuestros cual cuales quien tambien solo además ademas alguna alguno algunas algunos vaya cosa cosas momento`.split(/\s+/).map(quitaTildes));
const INICIO_FUERA = new Set(["y", "que", "pues", "bueno", "vale", "oye", "mira", "entonces", "porque", "pero", "tia", "tio", "hola", "a", "o", "e", "ya", "eh"]);
const MULETILLAS = new Set(["eh", "ehh", "ehm", "em", "emm", "mm", "mmm", "hmm"]);
const CUENTA = new Set(["tres", "dos", "uno", "1", "2", "3", "cuatro", "cinco", "4", "5", "accion", "va", "ya", "vale"]);
const SUELTAS = new Set(["bien", "vale", "venga", "ok", "okay", "listo", "ya", "perfecto", "genial", "si", "no", "eh", "vamos", "va", "dale", "valee", "fuera", "corten"]);
const NUM_CUENTA = new Set(["tres", "dos", "uno", "1", "2", "3", "4", "5", "cuatro", "cinco"]);
const AL_CAMARA = ["otra vez", "corta", "repito", "vuelvo a empezar", "espera", "graba", "grabando", "va va", "venga va", "desde el principio",
  "me muevo", "ya esta", "se ha grabado", "lo repito", "empiezo"];
const MESES = { enero: "ENE", febrero: "FEB", marzo: "MAR", abril: "ABR", mayo: "MAY", junio: "JUN", julio: "JUL", agosto: "AGO",
  septiembre: "SEP", setiembre: "SEP", octubre: "OCT", noviembre: "NOV", diciembre: "DIC" };
const DIAS = new Set(["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]);
const UNIDADES = { horas: "H", hora: "H", h: "H", minutos: "MIN", min: "MIN", dias: "DÍAS", euros: "€", euro: "€", kilos: "KG", kg: "KG", km: "KM" };
const LISTAS = new Set(["cosas", "consejos", "razones", "trucos", "pasos", "errores", "claves", "tips", "motivos", "ejercicios"]);
const VERBALES = ["ar", "er", "ir", "amos", "emos", "imos", "ando", "iendo", "aba", "ado", "ido", "as", "an"];
const NUMEROS = { cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11,
  doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, mil: 1000 };

const primera = (t) => norm(t)[0] || "";
const esVacia = (t) => VACIAS.has(primera(t));
const esCuenta = (t) => { const w = norm(t); return w.length > 0 && w.length <= 6 && w.every((x) => CUENTA.has(x)); };

/** Frases: se parten por pausa larga, punto final o cambio de toma. */
export function frasesDe(palabras) {
  const frases = [];
  let actual = [];
  for (const w of palabras) {
    const prev = actual[actual.length - 1];
    if (prev && (w.s - prev.e > 0.5 || /[.?!]$/.test(prev.t) || w.toma !== prev.toma)) { frases.push(actual); actual = []; }
    actual.push(w);
  }
  if (actual.length) frases.push(actual);
  return frases.map((f, id) => ({ id, s: f[0].s, e: f[f.length - 1].e, a: f[0].i, b: f[f.length - 1].i, toma: f[0].toma,
    texto: f.map((w) => w.t).join(" ") }));
}

/** Volumen de cada frase respecto a quien más habla (0 = igual; −9 dB = mucho más bajo). `energia` en dB cada 10 ms. */
export function nivelesFrases(frases, energia) {
  const niv = {}, peso = {};
  for (const f of frases) {
    const a = Math.floor(f.s * 100), b = Math.min(energia.length, Math.ceil(f.e * 100));
    if (b - a < 10) continue;
    const v = Array.from(energia.subarray(a, b)).sort((x, y) => x - y);
    niv[f.id] = v[Math.floor(v.length * 0.8)];
    peso[f.id] = f.e - f.s;
  }
  const ids = Object.keys(niv).sort((x, y) => niv[x] - niv[y]);
  if (!ids.length) return {};
  const total = ids.reduce((s, k) => s + peso[k], 0);
  let acum = 0, ref = niv[ids[ids.length - 1]];
  for (const k of ids) { acum += peso[k]; if (acum >= total / 2) { ref = niv[k]; break; } }
  const out = {};
  for (const k of ids) out[k] = Math.round((niv[k] - ref) * 10) / 10;
  return out;
}

function candidatosTitular(frases, vivas) {
  const frec = {};
  for (const n of vivas) for (const w of norm(frases[n].texto)) if (!VACIAS.has(w) && w.length > 4) frec[w] = (frec[w] || 0) + 1;
  const tema = Object.keys(frec).sort((a, b) => frec[b] - frec[a])[0] || "";
  const cands = [];
  vivas.forEach((n, orden) => {
    const texto = frases[n].texto;
    if (texto.includes("?") && orden < 2) {
      const preg = texto.includes("¿") ? texto.slice(texto.indexOf("¿")) : texto;
      const pal = preg.split(/\s+/).map(limpia).filter(Boolean);
      if (pal.length >= 4 && pal.length <= 8) cands.push([9 - orden, "¿" + pal.join(" ") + "?"]);
    }
    const trozos = [texto, ...texto.split(/[,;:]| y | que | porque | pero /).filter((x) => x.trim())];
    // de una frase larga, también sus comienzos («3 cosas que nadie te cuenta»)
    const todas = texto.split(/\s+/).map(limpia).filter(Boolean);
    for (let L = 4; L <= 6 && L < todas.length; L++) if (!esVacia(todas[L - 1])) trozos.push(todas.slice(0, L).join(" "));
    for (const t of trozos) {
      let pal = t.split(/\s+/).map(limpia).filter(Boolean);
      while (pal.length > 3 && INICIO_FUERA.has(primera(pal[0]))) pal = pal.slice(1);
      if (pal.length > 3 && /^[A-ZÁÉÍÓÚÑ]/.test(pal[pal.length - 1]) && ["ya", "no", "eh", "vale", "si"].includes(primera(pal[pal.length - 2]))) pal = pal.slice(0, -1);
      while (pal.length > 2 && esVacia(pal[pal.length - 1])) pal = pal.slice(0, -1);
      if (pal.length < 2 || pal.length > 7) continue;
      const n2 = norm(pal.join(" "));
      let p = pal.length >= 3 && pal.length <= 6 ? 4 : 1;
      p += orden === 0 ? 3 : orden < 3 ? 1.5 : 0;
      p += n2.some((x) => /\d/.test(x)) ? 2 : 0;
      p += pal.slice(1).some((x) => /^[A-ZÁÉÍÓÚÑ]/.test(x)) ? 2 : 0;
      p += tema && n2.includes(tema) ? 2 : 0;
      p += 0.5 * pal.filter((x) => !esVacia(x)).length;
      cands.push([p, pal.join(" ")]);
    }
  });
  cands.sort((a, b) => b[0] - a[0]);
  const vistos = new Set(), unicos = [];
  for (const [, t] of cands) { const k = norm(t).join(" "); if (!vistos.has(k)) { vistos.add(k); unicos.push(t); } }
  return unicos;
}

export function marcarClave(titulo) {
  titulo = titulo.trim();
  if (titulo.startsWith("¿")) return "¿" + marcarClave(titulo.replace(/^¿|\?$/g, "")) + "?";
  const pal = cap(titulo).split(/\s+/);
  const num = pal.findIndex((w) => /\d/.test(w));
  if (num >= 0) {
    const sig = num + 1 < pal.length ? primera(pal[num + 1]) : "";
    const fin = sig && (!VACIAS.has(sig) || LISTAS.has(sig)) ? num + 1 : num;
    return [...pal.slice(0, num), `*${pal.slice(num, fin + 1).join(" ")}*`, ...pal.slice(fin + 1)].join(" ");
  }
  const propios = pal.map((w, k) => (k > 0 && /^[A-ZÁÉÍÓÚÑ]/.test(w) ? k : -1)).filter((k) => k >= 0);
  let k = propios.length ? propios[propios.length - 1] : -1;
  if (k < 0) {
    const cont = pal.map((w, j) => (!esVacia(w) ? j : -1)).filter((j) => j >= 0);
    k = cont.length ? cont.reduce((a, b) => (pal[b].length > pal[a].length ? b : a)) : pal.length - 1;
  }
  pal[k] = `*${pal[k]}*`;
  return pal.join(" ");
}

/** Cifras, fechas, horarios, precios y ofertas dichos literalmente en lo que se queda (información contrastada). */
function sellosLocales(palabras, vivas, frases) {
  const fraseDe = {};
  for (const f of frases) for (let i = f.a; i <= f.b; i++) fraseDe[i] = f.id;
  const lista = palabras.filter((w) => vivas.has(w.i));
  const misma = (a, b) => fraseDe[a.i] === fraseDe[b.i];
  const etiqueta = (x) => cap(limpia(x.t));
  const sellos = [];
  lista.forEach((w, k) => {
    const t = primera(w.t);
    if (!t) return;
    const sig = lista.slice(k + 1, k + 5).filter((x) => misma(x, w)).map((x) => primera(x.t));
    const ant = lista.slice(Math.max(0, k - 4), k).filter((x) => misma(x, w)).map((x) => primera(x.t));
    const previas = lista.slice(Math.max(0, k - 12), k).filter((x) => misma(x, w) && !esVacia(x.t) && !/\d/.test(x.t) &&
      limpia(x.t).length > 3 && !VERBALES.some((v) => primera(x.t).endsWith(v)));
    let arriba = previas.length ? etiqueta(previas.reduceRight((a, b) => (limpia(b.t).length > limpia(a.t).length ? b : a))) : "";
    if (t === "gratis") { sellos.push({ palabra: w.i, centro: "GRATIS", arriba: (arriba || "Sin coste").slice(0, 16), abajo: "" }); return; }
    let num = t.replace(/[^\d]/g, "");
    if (!num) return;
    if (num.length > 6) return;
    const valor = parseInt(num, 10);
    if (sig.length >= 2 && sig[0] === "de" && MESES[sig[1]] && valor >= 1 && valor <= 31) {
      const dia = lista.slice(Math.max(0, k - 3), k).find((x) => DIAS.has(primera(x.t)));
      sellos.push({ palabra: w.i, centro: `${valor} ${MESES[sig[1]]}`, arriba: dia ? etiqueta(dia) : "Fecha", abajo: "" });
      return;
    }
    if (sig[0] && LISTAS.has(sig[0])) return;
    if (valor >= 1900 && valor <= 2100) return;
    const mas = ant.slice(-2).join(" ") === "mas de" ? "+" : "";
    let unidad = t.includes("%") || (sig[0] === "por" && sig[1] === "ciento") ? "%" : w.t.includes("€") || ["euros", "euro"].includes(sig[0]) ? "€" : null;
    if (!unidad && UNIDADES[sig[0]]) unidad = UNIDADES[sig[0]];
    const sustantivo = lista.slice(k + 1, k + 3).find((x) => misma(x, w) && !esVacia(x.t));
    if (!unidad && valor < 10 && !ant.some((x) => ["maximo", "minimo", "solo", "hasta"].includes(x))) return;
    let centro, abajo = "";
    if (unidad) {
      centro = unidad === "%" ? `${mas}${valor}%` : `${mas}${valor} ${unidad}`;
      if (centro === "24 H" && !arriba) arriba = "Abierto";
    } else { centro = `${mas}${valor}`; abajo = sustantivo ? limpia(sustantivo.t) : ""; }
    sellos.push({ palabra: w.i, centro, arriba: arriba.slice(0, 16), abajo: abajo.slice(0, 26) });
  });
  const vistos = new Set();
  return sellos.filter((s) => (vistos.has(s.centro) ? false : vistos.add(s.centro)));
}

/** Decide el montaje con reglas (todo en el móvil). */
export function decidir(palabras, frases, niveles, opciones) {
  const normas = frases.map((f) => norm(f.texto));
  const motivos = {};
  normas.forEach((t, n) => {
    if (!t.length) return;
    const frase = ` ${t.join(" ")} `;
    if (esCuenta(frases[n].texto)) { motivos[n] = "cuenta atrás"; return; }
    if (t.length <= 2 && t.every((x) => SUELTAS.has(x))) { motivos[n] = "comentario al cámara"; return; }
    if (t.length <= 7 && AL_CAMARA.some((x) => frase.includes(` ${norm(x).join(" ")} `))) { motivos[n] = "comentario al cámara"; return; }
    const nivel = niveles[frases[n].id];
    if (nivel !== undefined && nivel <= -8 && t.length <= 10) { motivos[n] = "voz de fondo"; return; }
    for (let m = n + 1; m < Math.min(n + 7, normas.length); m++) {
      const otra = normas[m];
      if (!otra.length || esCuenta(frases[m].texto)) continue;
      const ini = Math.min(t.length, otra.length, 5);
      const comunes = new Set(t.filter((x) => !VACIAS.has(x) && otra.includes(x))).size;
      const contenido = Math.max(1, t.filter((x) => !VACIAS.has(x)).length);
      const parecido = similitud(t, otra);
      const empieza = ini >= 3 && t.slice(0, ini).join(" ") === otra.slice(0, ini).join(" ");
      if (parecido > 0.6 || empieza || (comunes / contenido >= 0.6 && comunes >= 2)) {
        motivos[n] = parecido > 0.6 || comunes / contenido >= 0.6 ? "toma repetida" : "arranque en falso";
        break;
      }
    }
    if (!motivos[n] && t.length <= 3 && ["y", "que", "de", "la", "el", "en", "a"].includes(t[t.length - 1])) motivos[n] = "frase cortada";
  });
  const quitarFrases = Object.entries(motivos).map(([n, motivo]) => ({ id: frases[n].id, motivo }));
  const fuera = new Set();
  for (const q of quitarFrases) for (let i = frases[q.id].a; i <= frases[q.id].b; i++) fuera.add(i);
  const quitarPalabras = palabras.filter((w) => !fuera.has(w.i) && norm(w.t).length === 1 && MULETILLAS.has(norm(w.t)[0])).map((w) => w.i);
  // cuenta atrás pegada al principio de una frase («3, 2, 1 Tres cosas que…»)
  let cuentas = 0;
  frases.forEach((f, n) => {
    if (motivos[n]) return;
    const ws = palabras.slice(f.a, f.b + 1);
    // solo una secuencia que baja (3, 2, 1): el «3» de «3 cosas» se queda
    const valor = (w) => { const x = norm(w.t); return x.length === 1 && NUM_CUENTA.has(x[0]) ? (NUMEROS[x[0]] ?? Number(x[0])) : null; };
    let k = 0, previo = Infinity;
    while (k < ws.length && valor(ws[k]) !== null && valor(ws[k]) < previo) { previo = valor(ws[k]); k++; }
    if (k >= 2 && ws.length - k >= 2) { for (let j = 0; j < k; j++) quitarPalabras.push(ws[j].i); cuentas++; }
  });
  // la frase recortada empieza donde empieza lo que se queda
  for (const f of frases) { while (quitarPalabras.includes(f.a) && f.a < f.b) { f.a++; } f.texto = palabras.slice(f.a, f.b + 1).map((w) => w.t).join(" "); }
  const vivas = new Set(palabras.map((w) => w.i).filter((i) => !fuera.has(i) && !quitarPalabras.includes(i)));
  const idsVivas = frases.map((f, n) => n).filter((n) => !motivos[n]);

  const cands = candidatosTitular(frases, idsVivas);
  const titulo = opciones.titulo.modo === "propio" && opciones.titulo.texto ? opciones.titulo.texto : cands.length ? marcarClave(cands[0]) : "";
  const nt = norm(titulo.replace(/\*/g, "")).join(" ");
  const alternativos = cands.slice(1).filter((c) => { const n = norm(c).join(" "); return !nt.includes(n) && !n.includes(nt); }).slice(0, 2).map(marcarClave);

  const claves = [];
  for (const n of idsVivas) {
    const ws = palabras.slice(frases[n].a, frases[n].b + 1).filter((w) => vivas.has(w.i));
    let e = ws.find((w) => /\d/.test(w.t)) || ws.find((w, k) => k > 0 && /^[A-ZÁÉÍÓÚÑ]/.test(w.t) && limpia(w.t).length > 2);
    if (!e) { const c = ws.filter((w) => !esVacia(w.t) && limpia(w.t).length >= 7); e = c.sort((a, b) => b.t.length - a.t.length)[0]; }
    if (e) claves.push(e.i);
  }
  const sellos = opciones.sellos ? sellosLocales(palabras, vivas, frases) : [];

  const limpio = titulo.replace(/\*/g, "").trim();
  const prim = idsVivas.length ? frases[idsVivas[0]].texto.trim() : "";
  const ult = idsVivas.length ? frases[idsVivas[idsVivas.length - 1]].texto.trim() : "";
  const etiquetas = [];
  for (const n of idsVivas) {
    palabras.slice(frases[n].a, frases[n].b + 1).forEach((w, k, arr) => {
      if (k === 0 || !vivas.has(w.i) || !/^[A-ZÁÉÍÓÚÑ]/.test(w.t) || limpia(w.t).length < 3) return;
      const sig = arr[k + 1] && /^[A-ZÁÉÍÓÚÑ]/.test(arr[k + 1].t) ? limpia(arr[k + 1].t) : "";
      const e = "#" + norm(limpia(w.t) + sig).join("");
      if (e.length > 3 && !etiquetas.includes(e) && !VACIAS.has(e.slice(1))) etiquetas.push(e);
    });
  }
  const temas = norm(idsVivas.map((n) => frases[n].texto).join(" ")).filter((x) => !VACIAS.has(x) && x.length > 5);
  const cuenta = (x) => temas.filter((y) => y === x).length;
  for (const x of [...new Set(temas)].filter((x) => cuenta(x) >= 2).sort((a, b) => cuenta(b) - cuenta(a))) {
    if (etiquetas.length >= 4) break;
    if (!etiquetas.includes("#" + x)) etiquetas.push("#" + x);
  }
  const cuerpo = limpio ? [limpio + (/[.?!]$/.test(limpio) ? "" : ".")] : [];
  const ct = norm(limpio).join(" ");
  if (prim && !norm(prim).join(" ").includes(ct)) cuerpo.push(cap(prim));
  if (ult && ult !== prim && !norm(ult).join(" ").includes(ct)) cuerpo.push(cap(ult));
  const publicacion = [cuerpo.join(" "), [...etiquetas.slice(0, 5), "#reels"].join(" ")].join("\n\n").trim();

  const porMotivo = {};
  for (const q of quitarFrases) porMotivo[q.motivo] = (porMotivo[q.motivo] || 0) + 1;
  const nombres = { "toma repetida": "tomas repetidas", "arranque en falso": "arranques en falso", "cuenta atrás": "cuentas atrás",
    "comentario al cámara": "comentarios al cámara", "voz de fondo": "frases de voz de fondo", "frase cortada": "frases cortadas" };
  const resumen = Object.entries(porMotivo).map(([m, n]) => (n > 1 ? `Quitadas ${n} ${nombres[m] || m}.` : `Quitada 1 ${m}.`));
  if (cuentas) resumen.push(cuentas > 1 ? `Quitadas ${cuentas} cuentas atrás al principio de frase.` : "Quitada la cuenta atrás del principio.");
  const muletillas = quitarPalabras.length - palabras.filter((w) => quitarPalabras.includes(w.i) && norm(w.t).every((x) => NUM_CUENTA.has(x))).length;
  if (muletillas > 0) resumen.push(`Fuera ${muletillas} muletillas.`);
  if (sellos.length) resumen.push(`${sellos.length} ${sellos.length === 1 ? "dato destacado" : "datos destacados"} en pantalla.`);
  if (!resumen.length) resumen.push("No había tomas repetidas: solo he quitado silencios.");
  return { quitarFrases, quitarPalabras, titulo, alternativos, claves, sellos, resumen, publicacion };
}

function similitud(a, b) { // parecido de dos listas de palabras (0-1), como SequenceMatcher
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return (2 * d[m][n]) / (m + n);
}

/** Si hay duración objetivo, quita las frases con menos contenido (nunca la primera ni la última). */
export function ajustarDuracion(frases, quitadas, objetivo) {
  if (!objetivo) return quitadas;
  const fuera = new Set(quitadas);
  const vivas = () => frases.filter((f) => !fuera.has(f.id));
  const dur = () => vivas().reduce((s, f) => s + (f.e - f.s) + 0.1, 0);
  const valor = (f) => norm(f.texto).filter((x) => !VACIAS.has(x)).length + (/\d/.test(f.texto) ? 4 : 0);
  while (dur() > objetivo && vivas().length > 2) {
    const vs = vivas();
    const cand = vs.slice(1, -1).sort((a, b) => valor(a) / (a.e - a.s) - valor(b) / (b.e - b.s))[0];
    if (!cand) break;
    fuera.add(cand.id);
  }
  return [...fuera];
}

/** Cortes del vídeo (segundos de la línea de tiempo bruta) y palabras recolocadas en el tiempo editado. */
export function cortes(palabras, frases, quitarFrases, quitarPalabras, energia, ritmo, tomas) {
  const fuera = new Set(quitarPalabras);
  for (const id of quitarFrases) { const f = frases[id]; if (f) for (let i = f.a; i <= f.b; i++) fuera.add(i); }
  let vivas = palabras.filter((w) => !fuera.has(w.i));
  const finToma = (k) => tomas[k].inicio + tomas[k].duracion;
  // tomas sin voz (fotos, recursos): van enteras hasta 4 s
  const mantener = tomas.map((t, k) => (!palabras.some((w) => w.toma === k) ? [t.inicio, t.inicio + Math.min(t.duracion, 4)] : null)).filter(Boolean);
  if (!vivas.length && !mantener.length) vivas = palabras.slice();

  // la última sílaba se la come a veces el reconocimiento: alarga el final hasta que la voz se apaga de verdad
  const { umbral } = umbrales(energia);
  const inicios = palabras.map((w) => w.s).sort((a, b) => a - b);
  vivas = vivas.map((w) => {
    const sig = inicios.find((s) => s > w.s + 0.01) ?? Infinity;
    const tope = Math.min(w.e + 0.45, sig - 0.06, finToma(w.toma));
    let k = Math.floor(w.e * 100);
    while (k / 100 < tope && k < energia.length && energia[k] > umbral) k++;
    return { ...w, e: Math.max(w.e, Math.min(k / 100, tope)) };
  });

  const bloques = [];
  for (const w of vivas) {
    const b = bloques[bloques.length - 1];
    if (b && w.i === b.ultima + 1 && w.toma === b.toma && w.s - b.e <= ritmo.silencioMax) { b.e = w.e; b.ultima = w.i; }
    else bloques.push({ s: w.s, e: w.e, ultima: w.i, toma: w.toma });
  }
  let tramos = bloques.map((b) => [Math.max(tomas[b.toma].inicio, b.s - ritmo.margen), Math.min(finToma(b.toma), b.e + ritmo.margen), b.toma]);
  tramos.push(...mantener.map(([a, b]) => [a, b, tomas.findIndex((t) => t.inicio <= a + 0.01 && a < t.inicio + t.duracion)]));
  tramos.sort((a, b) => a[0] - b[0]);
  let cs = [];
  for (const t of tramos) {
    const u = cs[cs.length - 1];
    if (u && u[2] === t[2] && t[0] <= u[1] + 0.01) u[1] = Math.max(u[1], t[1]);
    else cs.push([...t]);
  }
  // pegado a la voz junto a lo quitado, sin arrastrar restos
  const quitadas = palabras.filter((w) => fuera.has(w.i));
  for (const c of cs) {
    const dentro = vivas.filter((w) => c[0] <= w.s && w.s < c[1]);
    if (!dentro.length) continue;
    if (quitadas.some((q) => c[0] - 0.45 < q.e && q.e <= dentro[0].s + 0.01)) c[0] = Math.max(c[0], dentro[0].s - 0.03);
    if (quitadas.some((q) => dentro[dentro.length - 1].e - 0.01 <= q.s && q.s < c[1] + 0.45)) c[1] = Math.min(c[1], dentro[dentro.length - 1].e + 0.04);
  }
  cs = recortarSilencios(cs, energia, ritmo, mantener);
  // una respiración no se corta: hace saltar la imagen a media frase
  for (let k = cs.length - 1; k > 0; k--) {
    const e0 = cs[k - 1][1], s1 = cs[k][0];
    if (cs[k][2] === cs[k - 1][2] && s1 - e0 < ritmo.unirHueco && !quitadas.some((q) => q.s < s1 && q.e > e0)) {
      cs[k - 1][1] = cs[k][1];
      cs.splice(k, 1);
    }
  }
  cs = cs.filter((c) => c[1] - c[0] > 0.08);
  // palabras en el tiempo editado
  const editadas = [];
  let off = 0, j = 0;
  const vs = vivas.slice().sort((a, b) => a.s - b.s);
  for (const [s, e] of cs) {
    while (j < vs.length && vs[j].s < e) {
      const w = vs[j];
      if (w.e > s) {
        const ws = Math.max(w.s, s);
        editadas.push({ i: w.i, t: w.t, s: off + ws - s, e: off + Math.max(Math.min(w.e, e), ws + 0.08) - s });
      }
      j++;
    }
    off += e - s;
  }
  return { cortes: cs.map((c) => ({ s: +c[0].toFixed(3), e: +c[1].toFixed(3), toma: c[2] })), editadas, duracion: off };
}

export function umbrales(energia) {
  const v = Array.from(energia).filter((x) => x > -50).sort((a, b) => a - b);
  if (!v.length) return { umbral: -45, p95: -20 };
  const med = v[Math.floor(v.length / 2)];
  const todos = Array.from(energia).sort((a, b) => a - b);
  const p95 = todos[Math.floor(todos.length * 0.95)];
  return { umbral: Math.max(med - 25, p95 - 30), p95 };
}

function recortarSilencios(cs, energia, ritmo, intocables) {
  const { p95 } = umbrales(energia);
  const base = p95 - 24, antes = 0.05, despues = 0.08, salida = [];
  for (const [s, e, toma] of cs) {
    if (intocables.some(([a, b]) => a < e && b > s)) { salida.push([s, e, toma]); continue; }
    const k0 = Math.floor(s * 100), k1 = Math.min(Math.floor(e * 100), energia.length);
    const ventana = Array.from(energia.subarray(Math.max(k0 - 50, 0), Math.min(k1 + 50, energia.length))).sort((a, b) => a - b);
    const piso = ventana.length ? ventana[Math.floor(ventana.length * 0.1)] : -80;
    const um = Math.max(base, piso + 6);
    const voz = [];
    for (let k = k0; k < k1; k++) if (energia[k] > um) voz.push(k);
    if (!voz.length) { salida.push([s, e, toma]); continue; }
    let partes = [], ini = voz[0], prev = voz[0];
    for (const k of voz.slice(1)) { if ((k - prev - 1) / 100 > ritmo.silencioMax) { partes.push([ini, prev]); ini = k; } prev = k; }
    partes.push([ini, prev]);
    const fuertes = partes.filter(([a, b]) => b - a >= 5 || Math.max(...Array.from(energia.subarray(a, b + 1))) > um + 8);
    partes = fuertes.length ? fuertes : partes;
    const juntas = [partes[0]];
    for (const [a, b] of partes.slice(1)) {
      const u = juntas[juntas.length - 1];
      if ((a - u[1] - 1) / 100 <= ritmo.partirPausa) u[1] = b; else juntas.push([a, b]);
    }
    for (const [a, b] of juntas) salida.push([Math.max(s, a / 100 - antes), Math.min(e, (b + 1) / 100 + despues), toma]);
  }
  return salida;
}

/** Subtítulos en .srt a partir de las palabras del vídeo editado. */
export function srt(editadas, max = 7) {
  const bloques = [];
  let actual = [];
  for (const w of editadas) {
    const u = actual[actual.length - 1];
    if (u && (actual.length >= max || w.s - u.e > 0.45 || /[.?!]$/.test(u.t))) { bloques.push(actual); actual = []; }
    actual.push(w);
  }
  if (actual.length) bloques.push(actual);
  const ts = (t) => { const ms = Math.round(t * 1000); const p = (n, l = 2) => String(n).padStart(l, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  return bloques.map((b, n) => {
    let fin = b[b.length - 1].e + 0.15;
    if (bloques[n + 1]) fin = Math.min(fin, bloques[n + 1][0].s - 0.01);
    return `${n + 1}\n${ts(b[0].s)} --> ${ts(fin)}\n${b.map((w) => w.t).join(" ")}\n`;
  }).join("\n");
}
