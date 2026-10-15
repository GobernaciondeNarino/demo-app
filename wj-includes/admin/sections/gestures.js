/** Sección 3: gestos con cámara (MediaPipe), con vista previa y esqueleto de la mano. */
import { h } from '../../ui/dom.js';
import { GestureInput, GESTURE_LABELS } from '../../inputs/GestureInput.js';
import { ACTION_LABELS } from '../../core/CommandBus.js';
import { card, grid, note } from './ui.js';

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
      const preview = { ...structuredClone(ctx.draft.gestures), enabled: true };
      input = new GestureInput({
        dispatch: () => {},
        resolveUrl: ctx.resolveUrl,
        canvas,
      });
      input.addEventListener('status', (e) => {
        status.className = `test-result ${e.detail.status === 'error' ? 'is-error' : e.detail.status === 'on' ? 'is-ok' : ''}`;
        status.textContent = { loading: `Cargando… ${e.detail.detail}`, on: 'Cámara activa. Pruebe sus gestos dentro de la zona amarilla.', error: `Error: ${e.detail.detail}`, off: 'Vista previa detenida.' }[e.detail.status] || e.detail.status;
      });
      input.addEventListener('gesture', (e) => {
        const { gesture, action } = e.detail;
        detected.prepend(h('li', {}, `${new Date().toLocaleTimeString()} · ${GESTURE_LABELS[gesture] || gesture} → ${action && action !== 'NONE' ? ACTION_LABELS[action] : 'sin acción'}`));
        while (detected.children.length > 8) detected.lastChild.remove();
      });
      input.configure(preview);
      start.textContent = 'Detener vista previa';
      await input.start();
      loadCams();
    });
    // Los cambios del borrador se reflejan en la vista previa al instante.
    const off = ctx.onDraftChange((d) => input?.configure({ ...structuredClone(d.gestures), enabled: true }));

    const gestureRows = Object.keys(GESTURE_LABELS).map((g) => h('div', { class: 'gesture-row' },
      f.action(GESTURE_LABELS[g], `gestures.map.${g}`),
      g.startsWith('swipe') ? h('div', { class: 'field' }) : f.number('Sostener', `gestures.holdMs.${g}`, { min: 100, max: 5000, step: 100, suffix: 'ms' })));

    return {
      cleanup: () => { off(); input?.stop(); },
      el: h('div', { class: 'stack' },
        card('Vista previa',
          h('div', { class: 'inline' }, h('label', { class: 'field grow' }, 'Cámara', camSel), start),
          status,
          h('div', { class: 'preview' }, canvas, h('div', {}, h('h3', {}, 'Gestos detectados'), detected)),
          note('Para el auditorio: cámara web con buen zoom apuntando a donde usted se para, y buena luz frontal. Ajuste la zona activa para ignorar al público.')),
        card('Gesto → acción', h('div', { class: 'gesture-grid' }, gestureRows)),
        card('Filtros',
          grid(
            f.toggle('Gestos activos', 'gestures.enabled'),
            f.range('Confianza mínima', 'gestures.minConfidence', { min: 0.3, max: 0.99, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
            f.number('Cuadros por segundo', 'gestures.fps', { min: 5, max: 60 }),
            f.select('Mano', 'gestures.hand', [['any', 'Cualquiera'], ['Right', 'Derecha'], ['Left', 'Izquierda']]),
            f.toggle('Imagen en espejo (izquierda = su izquierda)', 'gestures.mirror'))),
        card('Swipe',
          grid(
            f.toggle('Detectar swipe', 'gestures.swipe.enabled'),
            f.range('Distancia mínima (fracción del ancho)', 'gestures.swipe.minDistance', { min: 0.05, max: 0.9, step: 0.01, format: (v) => `${Math.round(v * 100)} %` }),
            f.number('Duración máxima', 'gestures.swipe.maxDurationMs', { min: 150, max: 1500, step: 50, suffix: 'ms' }))),
        card('Zona activa del encuadre',
          h('p', { class: 'hint' }, 'Solo cuentan las manos dentro del rectángulo amarillo (valores de 0 a 1).'),
          grid(
            f.range('Izquierda', 'gestures.zone.x0', { min: 0, max: 1, step: 0.01 }),
            f.range('Derecha', 'gestures.zone.x1', { min: 0, max: 1, step: 0.01 }),
            f.range('Arriba', 'gestures.zone.y0', { min: 0, max: 1, step: 0.01 }),
            f.range('Abajo', 'gestures.zone.y1', { min: 0, max: 1, step: 0.01 }))),
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
