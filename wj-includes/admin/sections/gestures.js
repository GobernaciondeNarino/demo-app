/** Sección 3: gestos con cámara (MediaPipe), con vista previa y esqueleto de la mano. */
import { h } from '../../ui/dom.js';
import { GestureInput, GESTURE_LABELS, HAND_LABELS } from '../../inputs/GestureInput.js';
import { ACTION_LABELS } from '../../core/CommandBus.js';
import { card, grid, note } from './ui.js';

const HOLD_GESTURES = ['Closed_Fist', 'Open_Palm', 'Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou'];

export default {
  id: 'gestos',
  title: 'Gestos',
  intro: 'Reconocimiento de gestos local en el navegador: el video no sale del computador.',
  render(ctx) {
    const { f } = ctx;
    const canvas = h('canvas', { class: 'preview-canvas', width: 640, height: 480, 'aria-label': 'Vista previa de la cámara' });
    const status = h('p', { class: 'test-result', role: 'status' }, 'Vista previa detenida.');
    const detected = h('ol', { class: 'detected', reversed: true });
    let input = null;

    const camSel = h('select', { 'aria-label': 'Cámara' }, h('option', { value: '' }, 'Cámara predeterminada'));
    const loadCams = async () => {
      const devs = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => [])) || [];
      const cams = devs.filter((d) => d.kind === 'videoinput' && d.label);
      camSel.replaceChildren(h('option', { value: '' }, 'Cámara predeterminada'),
        ...cams.map((d) => h('option', { value: d.label, selected: d.label === ctx.draft.gestures.cameraLabel }, d.label)));
      if (ctx.draft.gestures.cameraLabel && !cams.some((d) => d.label === ctx.draft.gestures.cameraLabel)) {
        camSel.append(h('option', { value: ctx.draft.gestures.cameraLabel, selected: true }, `${ctx.draft.gestures.cameraLabel} (no conectada)`));
      }
    };
    camSel.addEventListener('change', () => f.set('gestures.cameraLabel', camSel.value));
    loadCams();

    const start = h('button', { class: 'btn btn-accent', type: 'button' }, 'Iniciar vista previa');
    start.addEventListener('click', async () => {
      if (input) {
        input.stop();
        input = null;
        start.textContent = 'Iniciar vista previa';
        status.textContent = 'Vista previa detenida.';
        return;
      }
      input = new GestureInput({ dispatch: () => {}, resolveUrl: ctx.resolveUrl, canvas });
      input.addEventListener('status', (e) => {
        status.className = `test-result ${e.detail.status === 'error' ? 'is-error' : e.detail.status === 'on' ? 'is-ok' : ''}`;
        status.textContent = {
          loading: `Cargando… ${e.detail.detail}`,
          on: 'Cámara activa. Haga el gesto dentro de la zona amarilla y deje la mano quieta hasta que el anillo se llene.',
          error: `Error: ${e.detail.detail}`,
          off: 'Vista previa detenida.',
        }[e.detail.status] || e.detail.status;
      });
      input.addEventListener('gesture', (e) => {
        const { gesture, hand, action } = e.detail;
        detected.prepend(h('li', {}, `${new Date().toLocaleTimeString()} · ${GESTURE_LABELS[gesture] || gesture} (mano ${HAND_LABELS[hand] || '?'}) → ${action && action !== 'NONE' ? ACTION_LABELS[action] : 'sin acción'}`));
        while (detected.children.length > 8) detected.lastChild.remove();
      });
      input.configure({ ...structuredClone(ctx.draft.gestures), enabled: true });
      start.textContent = 'Detener vista previa';
      await input.start();
      loadCams();
    });
    // Los cambios del borrador se reflejan en la vista previa al instante.
    const off = ctx.onDraftChange((d) => input?.configure({ ...structuredClone(d.gestures), enabled: true }));

    const row = (g) => h('div', { class: 'gesture-row' },
      h('strong', { class: 'gesture-name' }, GESTURE_LABELS[g]),
      f.action('Mano derecha', `gestures.map.${g}.Right`),
      f.action('Mano izquierda', `gestures.map.${g}.Left`),
      HOLD_GESTURES.includes(g)
        ? f.number('Quieta durante', `gestures.holdMs.${g}`, { min: 200, max: 5000, step: 100, suffix: 'ms' })
        : h('div', { class: 'field' }));

    return {
      cleanup: () => { off(); input?.stop(); },
      el: h('div', { class: 'stack' },
        note('Para que hablar con las manos no cambie de escena, un gesto solo cuenta si la mano se queda QUIETA en la misma forma el tiempo indicado. Por defecto: puño derecho = siguiente, puño izquierdo = anterior, 1 segundo quieto. Los demás gestos y el swipe vienen apagados.'),
        card('Vista previa',
          h('div', { class: 'inline' }, h('label', { class: 'field grow' }, 'Cámara', camSel), start),
          status,
          h('div', { class: 'preview' }, canvas, h('div', {}, h('h3', {}, 'Gestos reconocidos'), detected)),
          note('Verifique que diga «mano derecha» cuando levanta la derecha. Si aparece al revés (algunas cámaras ya entregan la imagen volteada), active «Invertir manos».')),
        card('Gesto → acción por mano', h('div', { class: 'gesture-grid' }, ...HOLD_GESTURES.map(row))),
        card('Cuándo cuenta un gesto',
          grid(
            f.toggle('Gestos activos', 'gestures.enabled'),
            f.range('Movimiento permitido mientras se sostiene', 'gestures.stillness', {
              min: 0.01, max: 0.15, step: 0.005, format: (v) => `${(v * 100).toFixed(1)} % del encuadre`,
              hint: 'Si la mano se mueve más que esto, el reloj del gesto vuelve a cero. Menor = más estricto.',
            }),
            f.number('Enfriamiento después de un gesto', 'gestures.cooldownMs', { min: 0, max: 10000, step: 100, suffix: 'ms', hint: 'Tiempo en el que no se acepta otro gesto.' }),
            f.number('Tolerancia a parpadeos del reconocimiento', 'gestures.graceMs', { min: 0, max: 1000, step: 50, suffix: 'ms', hint: 'Cuadros sueltos mal clasificados no reinician el gesto.' }),
            f.range('Confianza mínima', 'gestures.minConfidence', { min: 0.3, max: 0.99, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
            f.select('Manos que se analizan', 'gestures.hand', [['any', 'Ambas'], ['Right', 'Solo la derecha'], ['Left', 'Solo la izquierda']]),
            f.toggle('Invertir manos (si la vista previa las muestra al revés)', 'gestures.swapHands'),
            f.toggle('Vista previa en espejo', 'gestures.mirror'),
            f.number('Cuadros por segundo', 'gestures.fps', { min: 5, max: 60 }))),
        card('Zona activa del encuadre',
          h('p', { class: 'hint' }, 'Solo cuentan las manos dentro del rectángulo amarillo. Consejo: suba el borde inferior hasta la altura del pecho; así las manos que acompañan la conversación (más abajo) se ignoran y los gestos se hacen con la mano levantada.'),
          grid(
            f.range('Izquierda', 'gestures.zone.x0', { min: 0, max: 1, step: 0.01 }),
            f.range('Derecha', 'gestures.zone.x1', { min: 0, max: 1, step: 0.01 }),
            f.range('Arriba', 'gestures.zone.y0', { min: 0, max: 1, step: 0.01 }),
            f.range('Abajo', 'gestures.zone.y1', { min: 0, max: 1, step: 0.01 }))),
        h('details', { class: 'card' },
          h('summary', {}, 'Swipe (no recomendado al hablar con las manos)'),
          note('El swipe se dispara con movimientos rápidos de la mano, que son comunes al hablar. Úselo solo si es necesario.', 'warn'),
          grid(
            f.toggle('Detectar swipe', 'gestures.swipe.enabled'),
            f.range('Distancia mínima (fracción del ancho)', 'gestures.swipe.minDistance', { min: 0.05, max: 0.9, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
            f.number('Duración máxima', 'gestures.swipe.maxDurationMs', { min: 150, max: 1500, step: 50, suffix: 'ms' })),
          h('div', { class: 'gesture-grid' }, ['swipe_left', 'swipe_right'].map(row))),
        h('details', { class: 'card' },
          h('summary', {}, 'Avanzado: archivos de MediaPipe'),
          note('Por defecto se usan los archivos incluidos en el repositorio (funcionan sin internet). Puede apuntar a un CDN si lo prefiere.'),
          grid(
            f.text('Módulo (vision_bundle.mjs)', 'gestures.mediapipe.moduleUrl', { maxlength: 500 }),
            f.text('Carpeta wasm', 'gestures.mediapipe.wasmUrl', { maxlength: 500 }),
            f.text('Modelo (.task)', 'gestures.mediapipe.modelUrl', { maxlength: 500 }),
            f.select('Procesador', 'gestures.mediapipe.delegate', [['GPU', 'GPU (recomendado)'], ['CPU', 'CPU']])))),
    };
  },
};
