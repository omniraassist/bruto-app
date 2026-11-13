// Todo se guarda en el propio móvil (IndexedDB): proyectos, tomas, resultados, tipografías, LUTs y logos.

const NOMBRE = "bruto", VERSION = 1;
let db = null;

function abrir() {
  if (db) return Promise.resolve(db);
  return new Promise((ok, mal) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("proyectos")) d.createObjectStore("proyectos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("archivos")) d.createObjectStore("archivos");
      if (!d.objectStoreNames.contains("ajustes")) d.createObjectStore("ajustes");
    };
    r.onsuccess = () => { db = r.result; ok(db); };
    r.onerror = () => mal(r.error);
  });
}

async function tx(almacen, modo, fn) {
  const d = await abrir();
  return new Promise((ok, mal) => {
    const t = d.transaction(almacen, modo);
    const s = t.objectStore(almacen);
    let res;
    const req = fn(s);
    if (req) req.onsuccess = () => { res = req.result; };
    t.oncomplete = () => ok(res);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error || new Error("Sin espacio en el móvil."));
  });
}

export const guardarProyecto = (p) => tx("proyectos", "readwrite", (s) => s.put(p));
export const leerProyecto = (id) => tx("proyectos", "readonly", (s) => s.get(id));
export const listarProyectos = async () => ((await tx("proyectos", "readonly", (s) => s.getAll())) || []).sort((a, b) => b.creado - a.creado);
export const guardarArchivo = (clave, blob) => tx("archivos", "readwrite", (s) => s.put(blob, clave));
export const leerArchivo = (clave) => tx("archivos", "readonly", (s) => s.get(clave));
export const borrarArchivo = (clave) => tx("archivos", "readwrite", (s) => s.delete(clave));
export const ajuste = (clave) => tx("ajustes", "readonly", (s) => s.get(clave));
export const guardarAjuste = (clave, v) => tx("ajustes", "readwrite", (s) => s.put(v, clave));

export async function borrarProyecto(p) {
  for (const t of p.tomas || []) await borrarArchivo(t.clave);
  for (const v of p.versiones || []) { await borrarArchivo(v.video); if (v.poster) await borrarArchivo(v.poster); }
  if (p.musica?.clave) await borrarArchivo(p.musica.clave);
  await tx("proyectos", "readwrite", (s) => s.delete(p.id));
}

/** Pide al navegador que no borre los datos solo (iOS a veces limpia almacenamiento de webs poco usadas). */
export async function persistir() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (_) { /* */ }
}

export async function espacio() {
  try {
    const e = await navigator.storage.estimate();
    return { usado: e.usage || 0, total: e.quota || 0 };
  } catch (_) { return null; }
}
