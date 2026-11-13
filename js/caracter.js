// Caracteres de serie y opciones del vídeo (lo que elige el usuario).

export const FUENTES = {
  intertight: { nombre: "Inter Tight", archivo: "fuentes/InterTight.ttf", peso: 700 },
  tiktok: { nombre: "TikTok Sans", archivo: "fuentes/TikTokSans.ttf", peso: 800 },
  montserrat: { nombre: "Montserrat", archivo: "fuentes/Montserrat.ttf", peso: 800 },
  archivo: { nombre: "Archivo", archivo: "fuentes/Archivo.ttf", peso: 850, ancho: "125%" },
  anton: { nombre: "Anton", archivo: "fuentes/Anton-Regular.ttf", peso: 400 },
  bricolage: { nombre: "Bricolage", archivo: "fuentes/BricolageGrotesque.ttf", peso: 700 },
  poppins: { nombre: "Poppins", archivo: "fuentes/Poppins-Bold.ttf", peso: 700 },
  outfit: { nombre: "Outfit", archivo: "fuentes/Outfit.ttf", peso: 700 },
  instrument: { nombre: "Instrument Serif", archivo: "fuentes/InstrumentSerif-Italic.ttf", peso: 400, cursiva: true },
  gloock: { nombre: "Gloock", archivo: "fuentes/Gloock-Regular.ttf", peso: 400 },
};
export const FUENTE_POR_DISENO = { limpio: "intertight", impacto: "archivo", editorial: "instrument" };

export const LOOKS = {
  neutro: { nombre: "Natural", contraste: 1, saturacion: 1, calidez: 0, tinte: 0, negros: 0, brillo: 0, vineta: 0 },
  vivo: { nombre: "Vivo", contraste: 1.08, saturacion: 1.28, calidez: 0.01, tinte: 0, negros: -0.01, brillo: 0.01, vineta: 0 },
  cine_calido: { nombre: "Cine", contraste: 1.06, saturacion: 0.9, calidez: 0.05, tinte: 0.01, negros: 0.025, brillo: 0, vineta: 0.18, sombrasFrias: 0.035 },
  analogico: { nombre: "Analógico", contraste: 0.92, saturacion: 0.84, calidez: 0.045, tinte: 0.015, negros: 0.06, brillo: 0.01, vineta: 0.1 },
  nave_oscura: { nombre: "Noche", contraste: 1.12, saturacion: 0.78, calidez: -0.035, tinte: 0, negros: -0.01, brillo: -0.05, vineta: 0.38 },
};

export const RITMOS = {
  pausado: { silencioMax: 0.35, partirPausa: 0.9, unirHueco: 0.35, margen: 0.08 },
  natural: { silencioMax: 0.2, partirPausa: 0.6, unirHueco: 0.45, margen: 0.05 },
  rapido: { silencioMax: 0.12, partirPausa: 0.45, unirHueco: 0.3, margen: 0.04 },
};
export const MOVIMIENTOS = {
  quieto: { zoom: false, alterno: 1, lento: 0, fundido: 0 },
  suave: { zoom: true, alterno: 1.05, lento: 0.02, fundido: 0.25 },
  dinamico: { zoom: true, alterno: 1.12, lento: 0.045, fundido: 0.15 },
};
export const FORMATOS = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080] };
export const ACENTOS = ["#FFD84D", "#C8FF3D", "#FF9466", "#FF4D6D", "#8FD3FF", "#B69CFF", "#F2D49B", "#FFFFFF"];

export const BASE = {
  caracter: "limpio",
  formato: "9:16",
  subtitulos: { diseno: "limpio", acento: "#FFD84D", tamano: "m", posicion: "abajo", palabras: 3, mayusculas: false,
    fuente: "auto", colorTexto: "#FFFFFF", contorno: "auto", resaltar: true },
  titulo: { modo: "auto", texto: "", diseno: "subrayador", mismaLetra: false },
  look: "neutro",
  lut: { activo: false, id: "", intensidad: 100 },
  correccion: true,
  enfasis: true,
  ritmo: "natural",
  movimiento: "suave",
  musica: { modo: "ninguna", nivel: "suave" },
  sfx: true,
  sellos: true,
  logo: { activo: false, id: "", posicion: "arriba" },
  cierre: { activo: false, texto: "", subtexto: "" },
  duracion: "auto",
};

export const CARACTERES = {
  limpio: { nombre: "Limpio", descripcion: "Claro y sin ruido. Para casi todo.", opciones: {} },
  intenso: { nombre: "Intenso", descripcion: "Ritmo alto, letras grandes y colores vivos.",
    opciones: { subtitulos: { diseno: "impacto", acento: "#C8FF3D", palabras: 2, mayusculas: true }, titulo: { diseno: "impacto" },
      look: "vivo", ritmo: "rapido", movimiento: "dinamico", musica: { nivel: "presente" } } },
  cine: { nombre: "Cine", descripcion: "Pausado y cálido, con letra editorial.",
    opciones: { subtitulos: { diseno: "editorial", acento: "#F2D49B", palabras: 4 }, titulo: { diseno: "editorial" },
      look: "cine_calido", ritmo: "pausado", sfx: false } },
  analogico: { nombre: "Analógico", descripcion: "Tonos de película y calidez.", opciones: { subtitulos: { acento: "#FF9466" }, look: "analogico" } },
  noche: { nombre: "Noche", descripcion: "Oscuro, contrastado y frío.",
    opciones: { subtitulos: { diseno: "impacto", acento: "#8FD3FF", palabras: 2, mayusculas: true }, titulo: { diseno: "impacto" },
      look: "nave_oscura", movimiento: "dinamico", musica: { nivel: "presente" } } },
  seco: { nombre: "Seco", descripcion: "Solo cortes. Ni música ni adornos.",
    opciones: { subtitulos: { diseno: "ninguno" }, titulo: { modo: "ninguno" }, movimiento: "quieto", sfx: false, sellos: false, enfasis: false } },
};

export function mezclar(base, extra) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" ? mezclar(out[k], v) : structuredClone(v);
  }
  return out;
}

export function opcionesDe(id, propios = {}) {
  if (propios[id]) return mezclar(BASE, propios[id].opciones);
  const c = CARACTERES[id] || CARACTERES.limpio;
  return mezclar(BASE, { ...c.opciones, caracter: id in CARACTERES ? id : "limpio" });
}

export function normalizar(o) {
  return mezclar(BASE, o || {});
}

/** Tipografía de los subtítulos: { familia, peso, ancho, cursiva } (las propias se cargan con su id). */
export function fuenteSubtitulos(o) {
  let f = o.subtitulos.fuente;
  if (f.startsWith("u-")) return { familia: f, peso: 700, ancho: "100%", cursiva: false };
  if (f === "auto" || !FUENTES[f]) f = FUENTE_POR_DISENO[o.subtitulos.diseno] || "intertight";
  const x = FUENTES[f];
  return { familia: `b-${f}`, peso: x.peso, ancho: x.ancho || "100%", cursiva: !!x.cursiva };
}
