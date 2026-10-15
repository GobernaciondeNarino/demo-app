# Presentación IA interactiva — Fase 1

Presentación a pantalla completa (escenas de color al 100 % en WebGL) que **avanza y retrocede con voz, gestos, AirPods y teclado/clicker**, responde con la voz de **Ñaño** (ElevenLabs), **recuerda los datos clave** que se olvidaron antes de avanzar, controla el **tiempo por bloque** y se configura desde un **panel admin con usuario y contraseña**.

Funciona en **Plesk** con solo descargar el ZIP del repositorio y descomprimirlo en cualquier carpeta del dominio: PHP sin Composer, JavaScript sin compilación y **sin base de datos** (todo se guarda en archivos JSON, con cifrado donde hace falta).

| Página | Ruta | Quién la usa |
|---|---|---|
| Presentación | `/<carpeta>/` | Pantalla del auditorio (Chrome, pantalla completa) |
| Vista de presentador | `/<carpeta>/presentador.html` | Quien presenta: segunda pantalla o celular |
| Panel admin | `/<carpeta>/wj-admin/` | Configuración, llaves API, monitor en vivo |

---

## Instalación rápida en Plesk

1. En GitHub: **Code › Download ZIP**.
2. En Plesk: **Archivos** › entre a `httpdocs` (o a la subcarpeta que quiera, p. ej. `httpdocs/ponencia`) › **Cargar** el ZIP › clic derecho › **Extraer archivos**. Si el ZIP crea una carpeta `demo-app-main`, puede renombrarla (p. ej. `ponencia`).
3. **PHP 8.0 o superior** con `openssl` y `curl` (Plesk › Dominio › Configuración de PHP). Ya vienen activas en casi todos los servidores.
4. **HTTPS activo** (Plesk › SSL/TLS, Let's Encrypt). La cámara y el micrófono solo funcionan con HTTPS.
5. Abra `https://su-dominio/ponencia/wj-admin/`. La primera vez pide un **código de instalación**: está en el archivo `wj-content/data/keys.php` (Plesk › Archivos › abrir el archivo). Cree el usuario administrador.
6. En el panel, sección **APIs**: pegue las llaves de ElevenLabs (y Claude o Gemini), pulse **Probar conexión**, elija la voz masculina y **Guarde**. Los audios se generan solos.
7. Abra la presentación en Chrome, inicie sesión y pulse **Iniciar presentación**.

Guía detallada, permisos y solución de problemas: **[docs/INSTALACION-PLESK.md](docs/INSTALACION-PLESK.md)**.
Cómo usarla el día del evento: **[docs/GUIA-DEL-EVENTO.md](docs/GUIA-DEL-EVENTO.md)**.
Detalles técnicos: **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

---

## Controles

| Acción | Voz (con «Ñaño», …) | Gesto | AirPods | Teclado / clicker |
|---|---|---|---|---|
| Siguiente | «siguiente», «continúa», «avanza», «adelante» | Swipe a la izquierda · puño sostenido 0,8 s | Doble toque | → ↓ AvPág Espacio |
| Anterior | «atrás», «regresa», «anterior», «devuélvete» | Swipe a la derecha | Triple toque | ← ↑ RePág |
| Repetir escena | «repite», «otra vez» | Pulgar arriba sostenido | — | R |
| Pausa / reanudar | «pausa», «espera» / «reanuda» | Palma abierta 1,5 s | (opcional) un toque | P |
| Avanzar sin el recordatorio | «continuar igual», «ya lo dije» | — | — | C |
| Que Ñaño narre | «cuéntanos», «tu turno» | — | — | N |
| Ir a una escena | «escena tres» | — | — | (panel o vista de presentador) |
| Pantalla negra | «pantalla negra» | — | — | B o . |
| Silenciar la voz de la IA | «silencio» | — | — | M |
| Mostrar/ocultar HUD · pantalla completa | — | — | — | H · F |

Todo es editable en el panel (diccionario de voz, gesto → acción, teclas, botones de los AirPods).

---

## Qué incluye la Fase 1

- **CommandBus único**: voz, gestos, AirPods, teclado y comandos remotos producen el mismo efecto; cooldown global (1,2 s), cola de 1 comando durante las transiciones y registro de eventos para el monitor.
- **Motor de escenas Three.js** con dos render targets y 4 transiciones en shader: fundido, barrido direccional, disolución con ruido (borde luminoso) y zoom + desenfoque. Precarga de la escena siguiente y anterior.
- **Escenas de color** con gradiente animado, partículas, número de escena y textos con las tipografías institucionales. Escenas de **imagen o video** del mismo hosting (`wj-content/media/`) listas para la Fase 2.
- **Voz**: Web Speech de Chrome (es-CO), palabra de activación «Ñaño» con variantes, diccionario editable, «escena 3», IA (Claude/Gemini) para frases ambiguas, y silencio del reconocimiento mientras la IA habla.
- **Gestos**: MediaPipe GestureRecognizer local (incluido en el repositorio, funciona sin internet), swipe, tiempos de sostenido, confianza mínima, mano y zona activa; vista previa con esqueleto en el panel.
- **AirPods** por Media Session API (pista silenciosa en bucle) con botón de prueba en el panel.
- **Respuestas con ElevenLabs** pregeneradas al guardar y precargadas en memoria: suenan al instante y siguen funcionando sin internet. Salidas separadas: parlantes del auditorio y AirPods (modo discreto) con `setSinkId`. Voz del navegador como respaldo.
- **Asistente de datos clave**: transcripción por escena en memoria, verificación en segundo plano con IA (entiende otras palabras), respaldo por palabras clave, recordatorio antes de avanzar, «continuar igual», máximo por escena, prioridad alta cuando va atrasado.
- **Tiempo**: cronómetro por bloque y total, avisos «te queda un minuto» / «tiempo cumplido», retraso acumulado y resumen de cada ensayo (real vs. planeado).
- **Narración**: cada escena puede tener un texto que Ñaño dice al terminar la transición o cuando se le da la palabra.
- **Vista de presentador** (segunda pantalla o celular) y **monitor en vivo** en el panel, con control remoto.
- **Panel admin** con 13 secciones: APIs, Voz, Gestos, AirPods y teclado, Respuestas, Escenas, Recordatorios, Bloques y tiempos, Dron (en pausa), General, Monitor en vivo, Ensayos y Seguridad.

## Seguridad y datos

- **Sin SQL**: todo se guarda en archivos JSON dentro de `wj-content/data/store-<aleatorio>/`, carpeta bloqueada con `.htaccess`, `web.config` e `index.php`, con nombre impredecible.
- **Cifrado AES-256-GCM** de las llaves API, de la cookie de sesión y de las transcripciones (si se decide guardarlas). La llave maestra se genera sola en `wj-content/data/keys.php` (o se toma de `ENCRYPTION_KEY` en `.env`).
- Contraseñas con **bcrypt**, bloqueo de 15 min tras **5 intentos fallidos**, sesión de **8 h** (cookie httpOnly, SameSite=Strict, Secure en HTTPS) y **token CSRF** en cada cambio.
- **Las llaves nunca llegan al navegador**: ElevenLabs, Claude y Gemini se llaman desde PHP (proxy). El panel solo muestra versiones enmascaradas.
- Encabezados de seguridad y CSP en el panel; `robots.txt` y `noindex` en todas las páginas.

## Estructura

```
/ (cualquier carpeta del dominio)
├── index.html                 Presentación (pantalla completa)
├── presentador.html           Vista de presentador
├── .htaccess · web.config     Reglas para Apache (Plesk Linux) e IIS (Plesk Windows)
├── robots.txt
├── wj-admin/                  Backend PHP + panel
│   ├── index.php              Panel admin
│   ├── bootstrap.php · auth.php · store.php
│   ├── lib/                   config.php (esquema y validación), providers.php (ElevenLabs/Claude/Gemini), util.php
│   ├── routes/                session, config, tts, intent, coverage, sync, test, media, rehearsal, status
│   └── cache/tts/             mp3 generados (no se versionan)
├── wj-includes/               Frontend (módulos ES, sin compilación)
│   ├── core/                  App, CommandBus, SceneManager, TransitionPass, FactsAssistant, BlockTimer, LiveSync…
│   ├── inputs/                VoiceInput, VoiceMatcher, GestureInput, MediaKeysInput, KeyboardInput
│   ├── output/                VoiceResponder, AudioOutputs, Hud
│   ├── scenes/                ColorScene, MediaScene, TextOverlay
│   ├── admin/ · presenter/    Interfaces del panel y de la vista de presentador
│   ├── css/ · fonts/          Estilos e identidad (Hind Madurai, Source Sans 3)
│   └── vendor/                three.js, GSAP, MediaPipe (incluidos, sin CDN)
├── wj-content/
│   ├── media/                 Imágenes y videos de la Fase 2
│   └── data/                  Datos privados (se crean solos; no se versionan)
├── docs/                      Documentación
└── tests/                     Pruebas automáticas (solo desarrollo)
```

## Adaptaciones respecto al documento de la Fase 1

| Documento | Implementado | Motivo |
|---|---|---|
| Backend Node.js + Express + `ws` | **PHP 8** sin dependencias | Debe funcionar en Plesk al descomprimir el ZIP. |
| Vite (build) | **Módulos ES nativos** + librerías incluidas | Sin paso de compilación ni Node en el servidor. |
| SQLite (`better-sqlite3`) | **Archivos JSON** (cifrados donde hace falta) | Pedido explícito: sin SQL. |
| WebSocket | **Sincronización HTTP cada ~1 s** + `BroadcastChannel` (instantáneo en el mismo navegador) | El hosting compartido no mantiene WebSockets con PHP. |
| `.env` con usuario y contraseña | `.env` opcional **o** creación del administrador con un código de instalación | Más seguro y sencillo en Plesk. |
| Palabra de activación «Nova» | **«Ñaño»** (con variantes: ñano, naño, nano, nanyo) | El personaje se llama Ñaño. |

## Decisiones pendientes (sección 15) y cómo quedaron

1. **Palabra de activación**: «Ñaño», con variantes editables (el reconocimiento puede escribirlo de varias formas).
2. **Alojamiento**: en una subcarpeta del dominio; todas las rutas son relativas.
3. **Voz de ElevenLabs**: se elige en el panel tras «Probar conexión» (las voces masculinas aparecen primero) o pegando el voice ID.
4. **Narración**: sí; cada escena tiene un texto opcional que Ñaño dice al terminar la transición o cuando usted le da la palabra («Ñaño, cuéntanos»).
5. **Recordatorios**: las dos opciones (AirPods discreto, parlantes, ambos o solo texto). Por defecto: discreto en AirPods + texto en la vista de presentador.
6. **Dron**: DJI Mini (sección en pausa; la arquitectura de escenas ya admite video).
7. **Identificar hombres y mujeres por colores**: clasificar por sexo/género desde la imagen es una inferencia biométrica sobre datos sensibles (Ley 1581 de 2012) y se equivoca más con algunos grupos. Propuesta: tarjetas o manillas de dos colores que el público levanta; la IA cuenta colores, no personas. Detalle en el panel, sección **Dron**.
8. **Capacidad e iluminación del auditorio**: pendiente (afecta el conteo con dron y los gestos).

## Pruebas

```bash
cd tests && npm install && npx playwright install chromium   # solo la primera vez
bash run.sh
```

Ejecuta: sintaxis PHP, 19 pruebas unitarias (comandos de voz, CommandBus, cronómetros, datos clave) y una prueba de punta a punta con Playwright contra el sitio PHP real y un servidor simulado de ElevenLabs/Claude/Gemini (instalación, llaves cifradas, pregeneración de audios, navegación, cooldown, recordatorios, «continuar igual», intención con IA, AirPods, sin internet, monitor, cambios en vivo, vista de presentador, las 4 transiciones, resumen de ensayo, bloqueo por intentos, CSRF y que ninguna llave llegue al navegador). Lo que requiere hardware real (micrófono, AirPods, cámara con manos) está en la lista de verificación de [docs/GUIA-DEL-EVENTO.md](docs/GUIA-DEL-EVENTO.md).

## Licencias de terceros

three.js (MIT), GSAP (licencia estándar gratuita), MediaPipe Tasks Vision y su modelo (Apache 2.0), Hind Madurai y Source Sans 3 (SIL OFL 1.1). Ver `wj-includes/vendor/README.md` y `wj-includes/fonts/LICENSE.md`.
