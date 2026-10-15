/**
 * HUD discreto (esquina inferior derecha): estado de micrófono, cámara,
 * AirPods y conexión, número de escena y un destello con la última acción.
 * Se oculta con la tecla H o desde el panel.
 */
import { ACTION_LABELS, SOURCE_LABELS } from '../core/CommandBus.js';

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>',
  cam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 8v8H5V8h10m1-2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4V7a1 1 0 0 0-1-1Z"/></svg>',
  pods: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8v6a3 3 0 0 0 3 3h2v-7H6v-2a6 6 0 0 1 12 0v2h-3v7h2a3 3 0 0 0 3-3v-6a8 8 0 0 0-8-8Z"/></svg>',
  net: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-6.3-3.3 1.4 1.4a7 7 0 0 1 9.8 0l1.4-1.4a9 9 0 0 0-12.6 0ZM1.4 10.4l1.4 1.4a13 13 0 0 1 18.4 0l1.4-1.4a15 15 0 0 0-21.2 0Z"/></svg>',
};

const STATE_TEXT = {
  off: 'apagado', on: 'activo', listening: 'escuchando', error: 'error', loading: 'cargando', muted: 'en silencio', offline: 'sin conexión', online: 'en línea',
};

export class Hud {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-flash" aria-live="polite"></div>
      <div class="hud-bar">
        <span class="hud-pause" hidden>⏸ En pausa</span>
        <span class="hud-icon" data-k="mic" title="Micrófono">${ICONS.mic}</span>
        <span class="hud-icon" data-k="cam" title="Cámara (gestos)">${ICONS.cam}</span>
        <span class="hud-icon" data-k="pods" title="AirPods / teclas multimedia">${ICONS.pods}</span>
        <span class="hud-icon" data-k="net" title="Conexión con el servidor">${ICONS.net}</span>
        <span class="hud-scene">– / –</span>
      </div>`;
    this.flashEl = root.querySelector('.hud-flash');
    this.sceneEl = root.querySelector('.hud-scene');
    this.pauseEl = root.querySelector('.hud-pause');
    this.icons = Object.fromEntries([...root.querySelectorAll('.hud-icon')].map((el) => [el.dataset.k, el]));
    this.visible = true;
    this.flashTimer = null;
  }

  setVisible(v) {
    this.visible = v;
    this.root.classList.toggle('is-hidden', !v);
  }

  toggle() {
    this.setVisible(!this.visible);
  }

  setStatus(key, state, detail = '') {
    const el = this.icons[key];
    if (!el) return;
    el.dataset.state = state;
    const base = el.title.split(' — ')[0];
    el.title = `${base} — ${STATE_TEXT[state] || state}${detail ? ` (${detail})` : ''}`;
  }

  setScene(index, total) {
    this.sceneEl.textContent = `${index + 1} / ${total}`;
  }

  setPaused(p) {
    this.pauseEl.hidden = !p;
  }

  flash(action, source, extra = '') {
    const arrow = { NEXT: '→', FORCE_NEXT: '→', PREV: '←', REPEAT: '↻', GOTO: '⇢' }[action] || '•';
    const label = (ACTION_LABELS[action] || action).toLowerCase();
    this.flashEl.textContent = `${arrow} ${label} · ${SOURCE_LABELS[source] || source}${extra ? ` · ${extra}` : ''}`;
    this.flashEl.classList.remove('is-on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('is-on');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashEl.classList.remove('is-on'), 1600);
  }
}
