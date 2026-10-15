/**
 * Clase base de las escenas. Ciclo de vida:
 *   init()     crea recursos (texturas, geometrías); puede cargar medios (this.ready)
 *   enter()    la escena empieza a mostrarse (inicio de la transición de entrada)
 *   update(dt) animación por cuadro
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
  exit() {}
  restart() {}
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

/** Luminancia relativa aproximada de un color HEX (0 = negro, 1 = blanco). */
export function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
