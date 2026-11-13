# BRUTO

Edición automática de vídeo, entera en el móvil. Sube tus tomas tal cual salen de la cámara y BRUTO te devuelve el vídeo montado.

**Abrir:** https://omniraassist.github.io/bruto-app/ → en el iPhone, Compartir → «Añadir a pantalla de inicio».

## Qué hace

- **Escucha** lo que dices con Whisper dentro del navegador (se descarga una vez, ~120 MB) y con tiempos por palabra.
- **Monta:** se queda con la última toma buena de cada frase, quita cuentas atrás, comentarios al cámara, muletillas y silencios (medidos en la voz real).
- **Edita:** corrección automática de luz y balance de blancos, looks de color o tu LUT `.cube`, subtítulos karaoke (3 estilos, 10 tipografías o la tuya), titular de entrada, datos en pantalla solo con cifras dichas en el vídeo, golpes de zoom, fundidos, música con ducking, efectos de sonido, logo y firma final.
- **Exporta** MP4 (H.264 + AAC) fotograma a fotograma con WebCodecs; si el navegador no puede, graba en tiempo real.
- Portada, subtítulos `.srt`, texto para publicar, titulares alternativos y versiones para comparar.

Nada sale del dispositivo: los vídeos, las tomas y los resultados se guardan en el navegador (IndexedDB).

## Código

Web estática, sin compilar: `index.html`, `app.css`, `sw.js` y `js/`:

| Archivo | Qué hace |
|---|---|
| `js/app.js` | Pantallas y proceso de edición |
| `js/asr.js` | Reconocimiento de voz (hilo aparte, transformers.js 4.3.2) |
| `js/montaje.js` | Reglas de montaje, titular, datos contrastados, cortes y `.srt` |
| `js/motor.js` | Carga de tomas, audio, color en WebGL, mezcla y render |
| `js/graficos.js` | Subtítulos, titular, datos, logo y firma |
| `js/caracter.js` | Caracteres de serie y opciones |
| `js/almacen.js` | Almacenamiento local |

Para probarla en local: `python3 -m http.server` en esta carpeta y abrir `http://localhost:8000`.

Las tipografías de `fuentes/` son de Google Fonts con licencia SIL Open Font License 1.1 (ver `fuentes/LICENCIAS.md`).
