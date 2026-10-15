/**
 * Teclado y clicker de presentaciones. Los clickers Bluetooth envían
 * flechas / AvPág / RePág / B, así que funcionan sin configuración.
 * Respaldo recomendado el día del evento: no depende de internet.
 */
export class KeyboardInput {
  constructor(dispatch) {
    this.dispatch = dispatch;
    this.map = {};
    this.enabled = true;
    this.onKey = this.onKey.bind(this);
  }

  configure(cfg) {
    this.enabled = cfg.enabled;
    this.map = cfg.map || {};
  }

  start(target = window) {
    target.addEventListener('keydown', this.onKey);
  }

  stop(target = window) {
    target.removeEventListener('keydown', this.onKey);
  }

  onKey(e) {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    const code = e.code || (e.key === ' ' ? 'Space' : e.key);
    const action = this.map[code];
    if (!action || action === 'NONE') return;
    e.preventDefault();
    if (e.repeat) return;
    this.dispatch({ action, source: 'keyboard', confidence: 1, meta: { key: code } });
  }
}
