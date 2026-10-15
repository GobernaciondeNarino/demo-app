/**
 * Clase base de las escenas. Ciclo de vida:
 *   init()     crea recursos (texturas, geometrías); puede cargar medios (this.ready)
 *   enter()    la escena empieza a mostrarse (inicio de la transición de entrada)
 *   begin()    la presentación está en vivo en esta escena: arranca la cuenta
 *              regresiva del contenido (video o página web)
 *   update(dt) animación por cuadro
 *   leave(ms)  empieza la transición de salida (dura ms)
 *   exit()     la escena dejó de verse (fin de la transición de salida)
 *   dispose()  libera memoria de GPU
 */
import { THREE } from '../core/three.js';

export class BaseScene {
  /**
   * @param {object} cfg   configuración de la escena (del panel)
   * @param {object} ctx   { index, total, blockName, appConfig, resolveUrl }
   */
  constructor(cfg, ctx) {
    this.cfg = cfg;
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.camera.position.z = 1;
    this.time = 0;
    this.width = 1;
    this.height = 1;
    this.paused = false;
    this.ready = Promise.resolve();
  }

  init() {}
  enter() {}
  begin() {}
  leave() {}
  exit() {}
  restart() {}
  /** Estado del contenido para el monitor y la vista de presentador (o null). */
  mediaStatus() { return null; }
  setPaused(paused) { this.paused = paused; }

  update(dt) {
    this.time += dt;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        for (const v of Object.values(m.uniforms || {})) v.value?.isTexture && v.value.dispose();
        m.map?.dispose?.();
        m.dispose();
      }
    });
  }
}

/**
 * Cuenta regresiva con reloj real (no depende de los cuadros por segundo) que se
 * puede pausar. La usan las escenas con contenido que arranca N s después.
 */
export class Countdown {
  constructor() {
    this.deadline = null;
    this.left = null;
  }

  start(ms) {
    this.left = null;
    this.deadline = performance.now() + ms;
  }

  pause() {
    if (this.deadline === null) return;
    this.left = this.deadline - performance.now();
    this.deadline = null;
  }

  resume() {
    if (this.left === null) return;
    this.deadline = performance.now() + this.left;
    this.left = null;
  }

  clear() {
    this.deadline = null;
    this.left = null;
  }

  /** Milisegundos que faltan (o null si no hay cuenta regresiva). */
  get remainingMs() {
    if (this.deadline !== null) return Math.max(0, this.deadline - performance.now());
    return this.left !== null ? Math.max(0, this.left) : null;
  }

  get done() {
    return this.deadline !== null && performance.now() >= this.deadline;
  }
}

/** Luminancia relativa aproximada de un color HEX (0 = negro, 1 = blanco). */
export function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
