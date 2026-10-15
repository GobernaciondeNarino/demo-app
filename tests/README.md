# Pruebas automáticas

Solo para desarrollo: el servidor de producción (Plesk) no las necesita y la carpeta está bloqueada por `.htaccess`.

```bash
cd tests
npm install                      # instala Playwright
npx playwright install chromium  # navegador para las pruebas
bash run.sh
```

`run.sh` copia el sitio a `tests/output/site` (sin datos privados), levanta dos servidores PHP
(el sitio y un **servidor simulado** de ElevenLabs/Claude/Gemini en `mock-api/`) y ejecuta:

1. Sintaxis de todos los archivos PHP.
2. Pruebas unitarias (`unit/`, con `node --test`): comandos de voz, gestos (mano quieta, puño derecho/izquierdo, hablar gesticulando no dispara), CommandBus (cooldown, cola, duplicados), cronómetros y asistente de datos clave.
3. Prueba de punta a punta (`e2e/run.mjs`, Playwright + Chromium con cámara y micrófono simulados): instalación, llaves cifradas, pregeneración de audios, navegación, recordatorios, intención con IA, AirPods, modo sin internet, monitor, cambios en vivo, vista de presentador (escritorio y celular), las 4 transiciones, película web en una subcarpeta (arranque diferido, pausa y teclas), resumen del ensayo, bloqueo por intentos fallidos, CSRF y que ninguna llave llegue al navegador.

Las capturas quedan en `tests/output/screens/` y las peticiones recibidas por el servidor simulado en `tests/output/mock-requests.jsonl`.

Lo que requiere hardware real (micrófono con voz humana, AirPods, manos frente a la cámara, dos salidas de audio) se verifica con la lista de `docs/GUIA-DEL-EVENTO.md`.
