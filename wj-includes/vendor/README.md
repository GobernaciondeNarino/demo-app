# Librerías incluidas (sin compilación)

Se incluyen localmente para que la presentación funcione al descomprimir el repositorio en Plesk
y siga operando si se cae internet.

| Ruta | Librería | Versión | Licencia |
|---|---|---|---|
| `three/three.module.js`, `three/three.core.js` | [three.js](https://threejs.org) | 0.186.1 | MIT |
| `gsap.min.js` | [GSAP](https://gsap.com) | 3.15.0 | GSAP Standard License (uso gratuito) |
| `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/*` | [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) | 0.10.35 | Apache 2.0 |
| `mediapipe/gesture_recognizer.task` | Modelo *Gesture Recognizer* (float16) | 1 | Apache 2.0 |

**Sobre MediaPipe:** se usa la versión 0.10.35 a propósito. Las versiones 1.x envían cada minuto
estadísticas de uso a un servidor de Google (`odml.pa.googleapis.com`) sin opción para desactivarlo;
la 0.10.35 tiene la misma API y no lo hace. El video de la cámara nunca sale del computador en ninguna versión.

Para actualizar una librería, reemplace el archivo y ajuste la versión en esta tabla.
Las rutas de MediaPipe se pueden cambiar a un CDN desde el panel admin (sección **Gestos**).
