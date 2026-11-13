// Transcripción en el propio dispositivo (Whisper con tiempos por palabra), en un hilo aparte.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELOS = { rapido: "onnx-community/whisper-base_timestamped", preciso: "onnx-community/whisper-small_timestamped" };
let actual = { nombre: null, asr: null, dispositivo: null };

async function cargar(calidad) {
  const nombre = MODELOS[calidad] || MODELOS.rapido;
  if (actual.nombre === nombre && actual.asr) return actual.asr;
  const avisar = (x) => { if (x.status === "progress" && x.total) postMessage({ tipo: "descarga", archivo: x.file, cargado: x.loaded, total: x.total }); };
  // primero la gráfica del dispositivo (mucho más rápida); si no puede, el procesador
  if (self.navigator?.gpu) {
    try {
      const asr = await pipeline("automatic-speech-recognition", nombre, {
        device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback: avisar });
      actual = { nombre, asr, dispositivo: "webgpu" };
      return asr;
    } catch (_) { /* sigue con el procesador */ }
  }
  const asr = await pipeline("automatic-speech-recognition", nombre, { dtype: "q8", progress_callback: avisar });
  actual = { nombre, asr, dispositivo: "wasm" };
  return asr;
}

self.onmessage = async (ev) => {
  const { id, audio, calidad } = ev.data;
  try {
    const asr = await cargar(calidad);
    postMessage({ tipo: "escuchando", id, dispositivo: actual.dispositivo });
    const r = await asr(audio, { language: "spanish", task: "transcribe", return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
    const palabras = (r.chunks || [])
      .map((c) => ({ t: c.text.trim(), s: c.timestamp[0] ?? 0, e: c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.2 }))
      .filter((w) => w.t);
    postMessage({ tipo: "listo", id, palabras });
  } catch (e) {
    postMessage({ tipo: "error", id, mensaje: String(e?.message || e) });
  }
};
