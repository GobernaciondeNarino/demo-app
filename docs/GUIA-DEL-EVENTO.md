# Guía del día del evento

## Montaje recomendado

```
 Computador de la presentación (Chrome)
 ├── Pantalla 1 (proyector)  → index.html en pantalla completa
 ├── Pantalla 2 (laptop)     → presentador.html (o en el celular)
 ├── Micrófono               → el de solapa o de mano conectado al computador
 ├── Cámara web              → apuntando a donde usted se para, buena luz frontal
 ├── Salida de audio 1       → parlantes del auditorio (HDMI / consola)
 ├── Salida de audio 2       → AirPods emparejados con ESTE computador
 └── Clicker Bluetooth       → respaldo si falla todo lo demás
```

> Use un micrófono distinto a los AirPods: si el micrófono es el de los AirPods, el reconocimiento puede captar los recordatorios discretos.

## Antes de salir al escenario (30 minutos antes)

1. **Inicie sesión** en el panel poco antes del evento (la sesión dura 8 horas).
2. Panel › **General › Diagnóstico**: todo en OK.
3. Panel › **Respuestas › Salidas de audio** › *Detectar dispositivos*: elija parlantes y AirPods. Guarde.
4. Abra la **presentación** en la pantalla del proyector › *Iniciar presentación* (acepte micrófono y cámara). Verifique en la pantalla de inicio: «Voces de la IA precargadas: N/N».
5. Abra la **vista de presentador** en la laptop o el celular.
6. Prueba rápida, en este orden:
   - Clicker: → y ←.
   - Voz: «Ñaño, siguiente» y «Ñaño, atrás». Debe sonar la confirmación por los parlantes.
   - Hablar normal: «en la siguiente parte…» **no** debe avanzar.
   - Gestos: puño derecho quieto 1 s → siguiente; puño izquierdo quieto 1 s → anterior. Hable moviendo las manos un minuto: no debe cambiar nada.
   - Película: entre a la escena de la película y verifique que arranca a los 5 s y que → la deja (no la adelanta).
   - AirPods: doble toque → siguiente; triple toque → anterior.
   - Recordatorio: en una escena con dato clave, diga «Ñaño, siguiente» sin mencionarlo: debe oírlo en los AirPods y verlo en la vista de presentador. Diga «Ñaño, continuar igual».
7. Vista de presentador › **Reiniciar cronómetro** justo antes de empezar (el cronómetro arranca con «Iniciar presentación»).
8. Panel › **Monitor en vivo** abierto en otra pestaña (útil para quien le ayude con la técnica).

## Cómo hacer los gestos

- **Siguiente**: levante la mano **derecha**, cierre el puño y déjelo **quieto** ~1 s (el anillo del HUD se llena).
- **Anterior**: lo mismo con la mano **izquierda**.
- Si mueve la mano mientras sostiene el puño, el reloj vuelve a cero: por eso hablar gesticulando no cambia de escena.
- Después de un gesto hay 2 s de enfriamiento; para repetir, abra la mano y vuelva a cerrarla.
- Ajuste en el panel (Gestos): tiempo de quietud, movimiento permitido y la zona activa (suba el borde inferior hasta el pecho para ignorar las manos bajas).
- Si la vista previa muestra las manos al revés, active «Invertir manos».

## Películas web

- Suba la carpeta de cada película (con su `index.html`) junto a la presentación: `/ctIA-26/fagosEvo/`.
- Escenas › Tipo «Película…» › *Elegir película o archivo…* › elija la carpeta. Retraso de inicio por escena (5 s por defecto).
- Si la película carga librerías desde internet (por ejemplo three.js desde cdn.jsdelivr.net), necesita conexión. Para ensayar sin internet, copie esas librerías dentro de la carpeta de la película.

## Durante la ponencia

- **«Ñaño, siguiente»** avanza; **«Ñaño, atrás»** retrocede; **«Ñaño, cuéntanos»** le da la palabra a la IA.
- Si suena un recordatorio y usted ya lo había dicho: **«Ñaño, ya lo dije»** o **«continuar igual»**.
- **B** deja la pantalla en negro (otra tecla de avance la devuelve sin cambiar de escena).
- **H** oculta el HUD de la esquina.
- La vista de presentador muestra: bloque y tiempo restante (amarillo en el último minuto, rojo excedido), total y retraso, datos clave ✅/⏳, notas y la escena siguiente.
- Si se cae internet: el clicker, el teclado, los gestos, los AirPods y las voces ya precargadas siguen funcionando. El reconocimiento de voz de Chrome necesita internet; el HUD lo indica con el ícono de conexión en rojo.

## Al terminar

- Al pasar de la última escena (o con *Finalizar ensayo* en la vista de presentador) se guarda el resumen: panel › **Ensayos** muestra el tiempo real de cada bloque contra lo planeado.

## Lista de verificación de aceptación (Fase 1)

| Criterio | Cómo se verifica | Automatizado |
|---|---|---|
| Las 4 entradas avanzan y retroceden | Prueba rápida del punto 6 | Teclado, AirPods (acción multimedia), voz (texto simulado), remoto: sí. Micrófono, cámara con manos y AirPods físicos: manual |
| Ningún comando dispara dos transiciones | Gesto + palabra a la vez | Sí (cooldown y cola) |
| Confirmación por voz en < 300 ms | Audios precargados en memoria | Sí (precarga); percepción: manual |
| La IA no reacciona a su propia voz | Recordatorio en parlantes con micrófono abierto | Sí (lógica); manual con parlantes reales |
| Hablar con el público no cambia de escena | «en la siguiente parte…» | Sí |
| Cambios del panel en vivo | Cambiar un título y guardar | Sí |
| Ninguna llave en el navegador | DevTools › Network | Sí (se revisan todas las respuestas) |
| Funciona con teclado sin internet | Desconectar el wifi | Sí (modo sin conexión de Chrome) |
| Recordatorio si se omite un dato; no interrumpe si se dijo con otras palabras | Punto 6 | Sí (con IA simulada) |
| «Continuar igual» avanza sin repetir | Punto 6 | Sí |
| Recordatorio solo en los AirPods en modo discreto | Escuchar parlantes vs. AirPods | Manual (requiere dos salidas de audio) |
| Bloques suman 15 min y avisos de tiempo | Panel › Bloques; ensayo completo | Sí (lógica de avisos); manual en ensayo |
| Video del dron, conteo, plan B | — | En pausa |
