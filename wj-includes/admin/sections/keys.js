/** Sección 4: AirPods (Media Session) y teclado / clicker. */
import { h } from '../../ui/dom.js';
import { MediaKeysInput } from '../../inputs/MediaKeysInput.js';
import { card, grid, note } from './ui.js';

const MEDIA_LABELS = {
  nexttrack: 'Doble toque (siguiente pista)',
  previoustrack: 'Triple toque (pista anterior)',
  play: 'Un toque (reproducir)',
  pause: 'Un toque (pausar)',
  seekforward: 'Adelantar',
  seekbackward: 'Retroceder',
};

const KEY_LABELS = {
  ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', PageDown: 'AvPág', PageUp: 'RePág', Space: 'Espacio', Period: '.', Enter: 'Enter',
};
const keyName = (code) => KEY_LABELS[code] || code.replace(/^Key/, '').replace(/^Digit/, '');

export default {
  id: 'teclas',
  title: 'AirPods y teclado',
  intro: 'Controles físicos: no dependen de internet. El clicker es el respaldo recomendado para el día del evento.',
  render(ctx) {
    const { f } = ctx;

    // Prueba de AirPods
    const log = h('ol', { class: 'detected', reversed: true });
    const status = h('p', { class: 'test-result', role: 'status' }, 'Empareje los AirPods con este computador y pulse «Probar».');
    let tester = null;
    const testBtn = h('button', { class: 'btn btn-accent', type: 'button' }, 'Probar AirPods');
    testBtn.addEventListener('click', async () => {
      if (tester) {
        tester.stop();
        tester = null;
        testBtn.textContent = 'Probar AirPods';
        status.textContent = 'Prueba detenida.';
        return;
      }
      tester = new MediaKeysInput(() => {}, { title: 'Prueba de AirPods', artist: 'Panel' });
      tester.configure({ enabled: true, map: ctx.draft.mediaKeys.map });
      tester.addEventListener('action', (e) => {
        const action = ctx.draft.mediaKeys.map[e.detail.name];
        log.prepend(h('li', {}, `${new Date().toLocaleTimeString()} · ${MEDIA_LABELS[e.detail.name] || e.detail.name} → ${action && action !== 'NONE' ? action : 'sin acción'}`));
      });
      const st = await tester.start();
      status.className = `test-result ${st === 'on' ? 'is-ok' : 'is-error'}`;
      status.textContent = st === 'on'
        ? 'Escuchando: toque dos veces (o presione el tallo) en los AirPods. Cierre la presentación si está abierta, para que no reciba las teclas.'
        : 'No se pudo activar la sesión multimedia en este navegador.';
      testBtn.textContent = 'Detener prueba';
    });

    // Teclado
    const kbList = h('div', { class: 'key-grid' });
    const paintKeys = () => {
      kbList.replaceChildren(...Object.keys(ctx.draft.keyboard.map).map((code) => h('div', { class: 'key-row' },
        h('kbd', {}, keyName(code)),
        f.action(`Tecla ${keyName(code)}`, `keyboard.map.${code}`),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Quitar tecla ${keyName(code)}`,
          onclick: () => { delete ctx.draft.keyboard.map[code]; ctx.markDirty(); paintKeys(); },
        }, 'Quitar'))));
    };
    paintKeys();
    const addBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Agregar tecla…');
    addBtn.addEventListener('click', () => {
      addBtn.textContent = 'Pulse la tecla (o el botón del clicker)…';
      const onKey = (e) => {
        e.preventDefault();
        window.removeEventListener('keydown', onKey, true);
        addBtn.textContent = 'Agregar tecla…';
        const code = e.code || e.key;
        if (!/^[A-Za-z0-9]{1,24}$/.test(code)) return;
        ctx.draft.keyboard.map[code] ??= 'NEXT';
        ctx.markDirty();
        paintKeys();
      };
      window.addEventListener('keydown', onKey, true);
    });

    return {
      cleanup: () => tester?.stop(),
      el: h('div', { class: 'stack' },
        card('AirPods',
          note('Los botones de volumen no son accesibles desde una página web. Se usan las acciones multimedia: el sistema operativo las envía a la página porque reproduce una pista silenciosa en bucle.'),
          grid(
            f.toggle('AirPods / teclas multimedia activas', 'mediaKeys.enabled'),
            ...Object.keys(MEDIA_LABELS).map((k) => f.action(MEDIA_LABELS[k], `mediaKeys.map.${k}`))),
          h('div', { class: 'inline' }, testBtn), status, log),
        card('Teclado y clicker',
          grid(f.toggle('Teclado activo', 'keyboard.enabled')),
          kbList,
          h('div', { class: 'inline' }, addBtn))),
    };
  },
};
