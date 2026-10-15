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

  /**
   * Escucha también el teclado de una página incrustada (escena web del mismo
   * hosting). Se usa la fase de captura y se detiene el evento, así la página no
   * reacciona a las teclas de control (p. ej. las flechas no adelantan la película).
   */
  attach(win) {
    try {
      win.addEventListener('keydown', (e) => {
        if (!e.isTrusted) return; // teclas enviadas por la propia presentación (pausa)
        if (this.onKey(e)) e.stopImmediatePropagation();
      }, true);
    } catch { /* página de otra procedencia */ }
  }

  /** @returns {boolean} true si la tecla se usó para un comando */
  onKey(e) {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return false;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return false;
    const code = e.code || (e.key === ' ' ? 'Space' : e.key);
    const action = this.map[code];
    if (!action || action === 'NONE') return false;
    e.preventDefault();
    if (!e.repeat) this.dispatch({ action, source: 'keyboard', confidence: 1, meta: { key: code } });
    return true;
  }
}
