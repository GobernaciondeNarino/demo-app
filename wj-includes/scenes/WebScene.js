/**
 * Escena con una página web del mismo hosting, por ejemplo una «película»
 * en una carpeta junto a la presentación:
 *   https://tic.narino.gov.co/ctIA-26/  → presentación
 *   https://tic.narino.gov.co/ctIA-26/fagosEvo/ → enlace «fagosEvo/»
 *
 * - Al entrar se ve la tarjeta de presentación (color + título, en WebGL).
 * - Pasado el retraso configurado (5 s por defecto) se carga la página en un
 *   iframe a pantalla completa y aparece con un fundido: la película arranca ahí.
 * - Al salir, el iframe se desvanece durante la transición y luego se descarga
 *   (libera la GPU que usa la película).
 * - Las teclas pulsadas dentro de la página se reenvían a la presentación,
 *   así el clicker y las flechas siguen cambiando de escena.
 * - Pausa: se envía a la página la tecla configurada (Espacio por defecto).
 */
import { ColorScene } from './ColorScene.js';
import { Countdown } from './BaseScene.js';

export class WebScene extends ColorScene {
  init() {
    super.init();
    this.kind = 'web';
    this.url = this.ctx.resolveUrl(this.cfg.media.url);
    this.state = 'idle';
    this.countdown = new Countdown();
    this.frame = null;
  }

  begin() {
    this.removeFrame();
    const delay = this.cfg.media.startDelayMs ?? 5000;
    if (delay <= 0) return this.startContent();
    this.state = 'waiting';
    this.countdown.start(delay);
    if (this.paused) this.countdown.pause();
  }

  update(dt) {
    super.update(dt);
    if (this.state === 'waiting' && this.countdown.done) this.startContent();
  }

  startContent() {
    const layer = this.ctx.domLayer;
    if (!layer) return;
    this.state = 'loading';
    this.countdown.clear();
    const frame = document.createElement('iframe');
    frame.className = 'web-frame';
    if (!this.cfg.media.interactive) frame.classList.add('is-passive');
    frame.title = this.cfg.title || 'Contenido de la escena';
    frame.allow = 'autoplay; fullscreen';
    frame.tabIndex = -1;
    frame.style.background = this.cfg.color || '#000000';
    frame.addEventListener('load', () => this.onFrameLoad(frame));
    frame.src = this.url;
    layer.append(frame);
    this.frame = frame;
    // Si la página tarda en avisar que cargó, se muestra igual.
    this.showTimer = setTimeout(() => this.show(frame), 6000);
  }

  onFrameLoad(frame) {
    if (frame !== this.frame || frame.src === 'about:blank') return;
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch { /* otra procedencia: no se puede acceder */ }
    this.sameOrigin = !!doc;
    if (doc) {
      this.ctx.attachKeys?.(frame.contentWindow);
      if (this.cfg.media.css) {
        const style = doc.createElement('style');
        style.textContent = this.cfg.media.css;
        (doc.head || doc.documentElement).append(style);
      }
    }
    // El foco vuelve a la presentación (teclado y clicker).
    window.focus();
    setTimeout(() => this.show(frame), 200);
  }

  show(frame) {
    if (frame !== this.frame) return;
    clearTimeout(this.showTimer);
    frame.classList.add('is-visible');
    this.state = 'playing';
    if (this.paused) this.sendKey(this.cfg.media.pauseKey);
  }

  /** Inicio de la transición de salida: la página se desvanece mientras dura. */
  leave(durationMs = 1000) {
    if (this.frame) {
      this.frame.style.transitionDuration = `${Math.max(200, durationMs * 0.6)}ms`;
      this.frame.classList.remove('is-visible');
    }
    this.state = 'idle';
    this.countdown.clear();
  }

  exit() {
    this.removeFrame();
    this.state = 'idle';
    this.countdown.clear();
  }

  restart() {
    super.restart();
    this.removeFrame();
    this.state = 'idle';
  }

  setPaused(paused) {
    const changed = paused !== this.paused;
    super.setPaused(paused);
    if (paused) this.countdown.pause();
    else this.countdown.resume();
    if (changed && this.state === 'playing') this.sendKey(this.cfg.media.pauseKey);
  }

  /** Envía una tecla a la página (p. ej. Espacio para pausar la película). */
  sendKey(code) {
    if (!code || !this.frame || !this.sameOrigin) return;
    try {
      const win = this.frame.contentWindow;
      const key = code === 'Space' ? ' ' : code.replace(/^Key/, '').toLowerCase();
      const target = win.document.body || win.document.documentElement;
      target.dispatchEvent(new win.KeyboardEvent('keydown', { code, key, bubbles: true }));
      target.dispatchEvent(new win.KeyboardEvent('keyup', { code, key, bubbles: true }));
    } catch { /* la página ya no existe */ }
  }

  removeFrame() {
    clearTimeout(this.showTimer);
    if (!this.frame) return;
    const frame = this.frame;
    this.frame = null;
    frame.src = 'about:blank';
    frame.remove();
  }

  mediaStatus() {
    return {
      kind: 'web',
      url: this.cfg.media.url,
      state: this.state,
      startsIn: this.state === 'waiting' ? Math.ceil((this.countdown.remainingMs ?? 0) / 1000) : null,
      error: '',
    };
  }

  dispose() {
    this.removeFrame();
    super.dispose();
  }
}
