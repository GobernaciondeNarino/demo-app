# Arquitectura técnica

## Visión general

```
┌──────────────────── Navegador (Chrome, pantalla del auditorio) ─────────────────────┐
│  Entradas                    CommandBus                       Salidas               │
│  Voz (Web Speech)  ─┐                                   ┌──► SceneManager (Three.js) │
│  Gestos (MediaPipe) ┼──► NEXT / PREV / REPEAT / PAUSE ──┼──► VoiceResponder (audio)  │
│  AirPods (Media)   ─┤    · cooldown global             └──► HUD                     │
│  Teclado/clicker   ─┤    · cola durante transiciones                                │
│  Remoto (panel)    ─┘    · registro → monitor                                       │
│                                                                                     │
│  FactsAssistant (datos clave) · BlockTimer (tiempos) · LiveSync (sincronización)    │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │ HTTPS (JSON, ~1 s) + BroadcastChannel local
┌──────────────────────────────────────────┴──────────────────────────────────────────┐
│  Backend PHP (wj-admin/)                                                            │
│  · Sesión (cookie cifrada) · Config en JSON (validada) · Llaves cifradas            │
│  · Proxy ElevenLabs (+ caché mp3) · Proxy Claude / Gemini (intención y cobertura)    │
│  · Cola de eventos en vivo (comandos remotos, registro, estado)                      │
│  · Las llaves NUNCA llegan al navegador                                             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Frontend (wj-includes/)

Módulos ES nativos, sin compilación. `index.html` carga `presentation.js`, que crea `core/App.js`.

| Módulo | Responsabilidad |
|---|---|
| `core/CommandBus.js` | Único punto de control. `{action, arg, source, confidence}`. Cooldown global, cola (máx. 1) durante transiciones, deduplicación de comandos remotos (llegan por servidor y por BroadcastChannel), registro. |
| `core/SceneManager.js` | Instancia escenas (`init/enter/begin/update/leave/exit/dispose`; `begin` solo cuando la presentación está en vivo), precarga ±1, dibuja saliente y entrante en dos `WebGLRenderTarget` y anima `progress` con GSAP (`power2.inOut`). Aplica configuración nueva sin recargar (la difiere si hay una transición en curso). |
| `core/TransitionPass.js` | Shader de mezcla: `fade`, `wipe` (dirección según avance/retroceso), `noise` (fbm con borde luminoso), `zoom` (escala + desenfoque radial). |
| `scenes/ColorScene.js` | Color al 100 % + gradiente animado (fbm) + partículas + `TextOverlay`. |
| `scenes/MediaScene.js` | Imagen o video (cover/contain) del hosting. Tarjeta de título y arranque diferido (`media.startDelayMs`). |
| `scenes/WebScene.js` | Película web (carpeta como `fagosEvo/` o `.html`) en un iframe sobre el canvas (`#web-layer`). Tarjeta de título en WebGL durante la cuenta regresiva; el iframe se carga al terminar, aparece con fundido, se desvanece durante la transición de salida y se descarga. Reenvía las teclas al `KeyboardInput` (captura + `stopImmediatePropagation`), envía la tecla de pausa a la página y puede inyectarle CSS (mismo origen). |
| `scenes/mediaKind.js` | Deduce el tipo (`video` / `image` / `web`) por la extensión o el ajuste de la escena. |
| `scenes/TextOverlay.js` | Canvas 2D → textura: número de escena, bloque, título, subtítulo, logo opcional. Tipografías institucionales. |
| `inputs/VoiceInput.js` + `VoiceMatcher.js` | Web Speech continuo con resultados intermedios; palabra de activación, ventana tras el nombre, frase más larga gana, «escena N»; consulta `/intent` si no coincide; se silencia mientras la IA habla. |
| `inputs/GestureInput.js` | MediaPipe GestureRecognizer (VIDEO, 2 manos), filtros de zona y mano, vista previa con esqueleto y anillo de progreso. |
| `inputs/GestureLogic.js` | Decide cuándo un gesto es intencional (sin cámara, con pruebas unitarias): acción por mano, sostenido que solo corre con la mano quieta (`stillness`), tolerancia a parpadeos (`graceMs`), soltar para repetir, enfriamiento (`cooldownMs`), swipe opcional. |
| `inputs/MediaKeysInput.js` | Media Session API + WAV silencioso de 10 s generado en memoria. |
| `inputs/KeyboardInput.js` | Teclas por `event.code` (independiente del idioma del teclado). |
| `output/AudioOutputs.js` | Dos `AudioContext` («public» y «discreet») con `setSinkId`; decodificación en `OfflineAudioContext`. |
| `output/VoiceResponder.js` | Precarga y reproduce las frases (`core/phrases.js`), respaldo con `speechSynthesis`. |
| `core/FactsAssistant.js` | Transcripción por escena, verificación local y con IA, decisión antes de avanzar. |
| `core/BlockTimer.js` | Tiempo por bloque y total, avisos, retraso, resumen. |
| `core/LiveSync.js` | Consulta `routes/sync.php` (~1 s) y `BroadcastChannel` para pestañas del mismo navegador. |

Colores: `THREE.ColorManagement` desactivado y salida lineal, para que los HEX de la marca se vean exactos.

## Backend (wj-admin/)

PHP 8.0+, sin Composer. `bootstrap.php` carga `lib/util.php`, `store.php`, `auth.php` y `lib/config.php`.

### Rutas

| Ruta | Método | Descripción |
|---|---|---|
| `routes/session.php` | GET | Estado: `needsSetup`, `authenticated`, token CSRF. |
| | POST `login` · `logout` · `setup` · `password` | Acceso. `setup` exige el código de `keys.php`. |
| `routes/config.php` | GET | Configuración validada + estado enmascarado de las llaves. |
| | POST `save` · `reset` · `secret` | Guarda (valida contra el esquema), restaura, guarda/borra una llave. |
| `routes/tts.php` | POST `{text}` | mp3 desde la caché o generado en ElevenLabs. `mode:"ensure"` solo pregenera; `force` regenera; `action:"clear"` vacía. |
| `routes/intent.php` | POST `{text, current, total}` | Acción para una frase ambigua (Claude o Gemini, salida JSON con esquema). |
| `routes/coverage.php` | POST `{transcript, facts}` | Ids de los datos clave ya mencionados. La transcripción no se guarda. |
| `routes/sync.php` | POST | Presentación: publica estado y registro, recibe comandos y configuración. Panel/presentador: reciben estado, registro y avisos. `action:"command"` envía un comando remoto. |
| `routes/test.php` | POST `{provider}` | «Probar conexión» (lista voces o modelos). |
| `routes/media.php` | GET | Carpetas junto a la presentación con `index.html` (películas web), sus videos/imágenes/páginas y los archivos de `wj-content/media`. URLs relativas a la carpeta de la presentación. |
| `routes/rehearsal.php` | GET / POST | Resúmenes de ensayos. |
| `routes/status.php` | GET | Diagnóstico del servidor. |

Todas (salvo `session.php`) exigen sesión; las peticiones que modifican datos exigen el encabezado `X-CSRF-Token`.

### Almacenamiento (sin SQL)

```
wj-content/data/
├── .htaccess · web.config · index.php   Bloqueo de acceso web
├── keys.php                             Llave maestra, nombre de la carpeta de datos, código de instalación
├── canary.json                          Testigo para comprobar que la carpeta no se sirve
└── store-<24 hex aleatorios>/
    ├── config.json                      {version, updated, config}
    ├── users.json                       {users:[{id, username, password_hash (bcrypt), epoch}]}
    ├── secrets.json                     {nombre: {value: "v1:<AES-256-GCM>", updated}}
    ├── login-attempts.json              Intentos fallidos de los últimos 15 min
    ├── revoked.json                     Sesiones cerradas antes de expirar
    ├── events.json                      Cola de eventos (≤ 400, ≤ 30 min)
    ├── state.json                       Último estado de la presentación
    └── rehearsals/<fecha>-<id>.json     Resúmenes (transcripción cifrada si se guarda)
```

- Escrituras atómicas (archivo temporal + `rename`) y `flock()` para leer-modificar-escribir.
- Cifrado AES-256-GCM con datos asociados (AAD) por campo: un valor cifrado no se puede mover a otro campo.
- La sesión es una cookie cifrada `{uid, epoch, sid, csrf, exp}`; cambiar la contraseña sube `epoch` e invalida todas las sesiones; cerrar sesión agrega `sid` a `revoked.json`. No hay bloqueos de sesión de PHP entre peticiones simultáneas.

### Llamadas a la IA

- **Claude** (Messages API, cURL): modelo configurable (por defecto `claude-opus-5-5`), `output_config: {effort, format: json_schema}`, y `fallbacks: "default"` con el encabezado `anthropic-beta: server-side-fallback-2026-07-01` en los modelos que lo admiten. Se revisa `stop_reason` (`refusal`, `max_tokens`) antes de leer la respuesta. Para menor latencia se puede elegir `claude-haiku-5-5`.
- **Gemini** (`generateContent`): `responseMimeType: application/json` + esquema en las instrucciones.
- **ElevenLabs** (`/v1/text-to-speech/{voice}`, `mp3_44100_128`): `model_id`, `voice_settings` (estabilidad, similitud, estilo, velocidad) y `language_code` en los modelos que lo aceptan. Caché por hash del texto + voz + ajustes.
- La transcripción se envía delimitada y con la instrucción de tratarla como dato, nunca como órdenes; la respuesta se valida contra la lista de acciones e ids permitidos.

Se usa cURL directo (y no el SDK oficial de PHP) porque el SDK requiere Composer y el despliegue debe funcionar con solo descomprimir el ZIP en Plesk.

## Sincronización en vivo

Cada cliente hace `POST routes/sync.php` cada ~1 s (configurable):

```json
// presentación → servidor
{ "role": "presentation", "since": 128, "configVersion": 7, "state": { … }, "logs": [ … ] }
// servidor → presentación
{ "lastId": 131, "events": [{ "channel": "cmd", "payload": { "action": "NEXT", "cid": "…" } }],
  "configVersion": 8, "config": { … } }
```

En el mismo navegador, `BroadcastChannel("wj-live:<carpeta>")` entrega estado, registro y comandos al instante; el `cid` evita ejecutar dos veces un comando que llega por ambas vías.

## Extender

- **Nueva entrada** (p. ej. un pedal MIDI): cree `inputs/MidiInput.js` que llame `dispatch({action, source:'midi'})`. El CommandBus, el cooldown, el registro y las respuestas funcionan sin cambios.
- **Nueva escena** (p. ej. la del dron): cree `scenes/DroneScene.js` extendiendo `BaseScene` y regístrela en `scenes/index.js`; agregue el tipo en `wj-admin/lib/config.php` (validación) y en el editor de escenas.
- **Nueva transición**: agregue un `mode` en el shader de `TransitionPass.js`, su nombre en `TRANSITION_TYPES` / `TRANSITION_LABELS` y en `WJ_TRANSITIONS` (PHP).
