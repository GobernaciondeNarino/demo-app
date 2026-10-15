/**
 * SceneManager: crea las escenas, las precarga y anima las transiciones.
 *
 * - Durante una transición dibuja la escena saliente y la entrante en dos
 *   WebGLRenderTarget y las mezcla con TransitionPass (uniforme `progress`
 *   animado con GSAP, easing power2.inOut).
 * - Precarga: al llegar a una escena inicializa la siguiente y la anterior,
 *   para que la transición arranque sin tirones. Libera las lejanas.
 */
import { THREE } from './three.js';
import { TransitionPass } from './TransitionPass.js';
import { createScene } from '../scenes/index.js';

function tween(target, props) {
  // GSAP se carga como script clásico (window.gsap). Respaldo mínimo si faltara.
  if (window.gsap) return window.gsap.to(target, props);
  const start = performance.now();
  const from = target.progress;
  const dur = props.duration * 1000;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  let killed = false;
  const step = (now) => {
    if (killed) return;
    const t = Math.min(1, (now - start) / dur);
    target.progress = from + (props.progress - from) * ease(t);
    if (t < 1) requestAnimationFrame(step);
    else props.onComplete?.();
  };
  requestAnimationFrame(step);
  return { kill: () => { killed = true; } };
}

export class SceneManager extends EventTarget {
  constructor(renderer) {
    super();
    this.renderer = renderer;
    this.pass = new TransitionPass();
    this.instances = new Map();
    this.sceneCfgs = [];
    this.index = 0;
    this.transition = null;
    this.width = 1;
    this.height = 1;
    this.paused = false;
    const opts = { depthBuffer: false, type: THREE.UnsignedByteType };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);
    this.snapshot = new THREE.WebGLRenderTarget(1, 1, opts);
  }

  get count() { return this.sceneCfgs.length; }
  get current() { return this.sceneCfgs[this.index]; }
  get isTransitioning() { return this.transition !== null; }

  /** Aplica la configuración (al inicio y cada vez que cambia en el panel). */
  configure(appConfig, { resolveUrl }) {
    if (this.transition) {
      // Se aplica al terminar la transición en curso.
      this.pendingConfig = [appConfig, { resolveUrl }];
      return;
    }
    const prevId = this.current?.id;
    const oldKeys = new Map([...this.instances.entries()]);
    this.appConfig = appConfig;
    this.resolveUrl = resolveUrl;
    this.sceneCfgs = appConfig.scenes;
    this.blockNames = Object.fromEntries(appConfig.blocks.map((b) => [b.id, b.name]));

    // Se conservan las escenas cuya configuración no cambió; el resto se libera.
    const newKeys = new Set(this.sceneCfgs.map((s, i) => this.keyFor(s, i)));
    this.instances = new Map();
    for (const [key, inst] of oldKeys) {
      if (newKeys.has(key)) this.instances.set(key, inst);
      else inst.dispose();
    }

    const newIndex = prevId ? this.sceneCfgs.findIndex((s) => s.id === prevId) : -1;
    this.index = Math.max(0, newIndex >= 0 ? newIndex : Math.min(this.index, this.count - 1));
    const fresh = !this.instances.has(this.keyFor(this.current, this.index));
    const inst = this.instance(this.index);
    if (fresh) inst.enter();
    this.preloadAround(this.index);
  }

  keyFor(cfg, index) {
    const logo = this.appConfig.general.logoUrl;
    return JSON.stringify([cfg, index, this.count, this.blockNames[cfg.blockId], logo]);
  }

  inTransition(inst) {
    return this.transition && (this.transition.from === inst || this.transition.to === inst);
  }

  instance(i) {
    const cfg = this.sceneCfgs[i];
    const key = this.keyFor(cfg, i);
    let inst = this.instances.get(key);
    if (!inst) {
      inst = createScene(cfg, {
        index: i,
        total: this.count,
        blockName: this.blockNames[cfg.blockId] || '',
        logoUrl: this.appConfig.general.logoUrl ? this.resolveUrl(this.appConfig.general.logoUrl) : '',
        resolveUrl: this.resolveUrl,
      });
      inst.init();
      inst.resize(this.width, this.height);
      inst.setPaused(this.paused);
      this.instances.set(key, inst);
    }
    return inst;
  }

  preloadAround(i) {
    const wanted = new Set();
    for (const j of [i, i + 1, i - 1]) {
      if (j >= 0 && j < this.count) {
        this.instance(j);
        wanted.add(this.keyFor(this.sceneCfgs[j], j));
      }
    }
    for (const [key, inst] of this.instances) {
      if (!wanted.has(key) && !this.inTransition(inst)) {
        inst.dispose();
        this.instances.delete(key);
      }
    }
  }

  transitionFor(targetIndex) {
    const cfg = this.sceneCfgs[targetIndex];
    return {
      type: cfg?.transition || this.appConfig.transitions.type,
      durationMs: this.appConfig.transitions.durationMs,
    };
  }

  /**
   * Va a la escena `target` con transición. Devuelve una promesa que se
   * resuelve al terminar la transición.
   */
  async goTo(target, { direction } = {}) {
    if (target < 0 || target >= this.count || target === this.index || this.transition) return false;
    const from = this.instance(this.index);
    const to = this.instance(target);
    // Si el medio de la escena entrante aún carga, se espera un momento (máx. 1,5 s).
    await Promise.race([to.ready, new Promise((r) => setTimeout(r, 1500))]);
    if (this.transition) return false;
    const dir = direction ?? Math.sign(target - this.index);
    const { type, durationMs } = this.transitionFor(target);
    this.pass.setup(type, dir);
    this.pass.setEdgeColor(this.sceneCfgs[target].color === '#FFD500' ? '#FFFFFF' : '#FFD500');
    to.enter();
    const fromIndex = this.index;
    this.index = target;
    this.transition = { from, to, progress: 0, fromIndex, snapshot: false };
    this.dispatchEvent(new CustomEvent('change', { detail: { index: target, from: fromIndex, transition: type } }));
    return new Promise((resolve) => {
      this.transition.tween = tween(this.transition, {
        progress: 1,
        duration: durationMs / 1000,
        ease: 'power2.inOut',
        onComplete: () => {
          from.exit();
          this.transition = null;
          if (this.pendingConfig) {
            const [cfg, opts] = this.pendingConfig;
            this.pendingConfig = null;
            this.configure(cfg, opts);
          } else {
            this.preloadAround(this.index);
          }
          this.dispatchEvent(new CustomEvent('transitionend', { detail: { index: this.index } }));
          resolve(true);
        },
      });
    });
  }

  next() { return this.goTo(this.index + 1, { direction: 1 }); }
  prev() { return this.goTo(this.index - 1, { direction: -1 }); }

  /** Repite la escena: congela el cuadro actual y vuelve a entrar a la misma escena. */
  async repeat() {
    if (this.transition) return false;
    const inst = this.instance(this.index);
    inst.render(this.renderer, this.snapshot);
    inst.restart();
    const { type, durationMs } = this.transitionFor(this.index);
    this.pass.setup(type === 'wipe' ? 'fade' : type, 1);
    this.transition = { from: null, to: inst, progress: 0, fromIndex: this.index, snapshot: true };
    return new Promise((resolve) => {
      this.transition.tween = tween(this.transition, {
        progress: 1,
        duration: Math.min(durationMs, 900) / 1000,
        ease: 'power2.inOut',
        onComplete: () => {
          this.transition = null;
          if (this.pendingConfig) {
            const [cfg, opts] = this.pendingConfig;
            this.pendingConfig = null;
            this.configure(cfg, opts);
          }
          this.dispatchEvent(new CustomEvent('transitionend', { detail: { index: this.index, repeat: true } }));
          resolve(true);
        },
      });
    });
  }

  setPaused(paused) {
    this.paused = paused;
    for (const inst of this.instances.values()) inst.setPaused(paused);
  }

  resize(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.snapshot.setSize(w, h);
    this.pass.setAspect(width / Math.max(1, height));
    for (const inst of this.instances.values()) inst.resize(width, height);
  }

  /** Avanza la animación y dibuja un cuadro. */
  frame(dt) {
    if (!this.count) return;
    const t = this.transition;
    if (!t) {
      const inst = this.instance(this.index);
      inst.update(dt);
      inst.render(this.renderer, null);
      return;
    }
    if (t.snapshot) {
      t.to.update(dt);
      t.to.render(this.renderer, this.rtB);
      this.pass.render(this.renderer, this.snapshot.texture, this.rtB.texture, t.progress);
      return;
    }
    t.from.update(dt);
    t.to.update(dt);
    t.from.render(this.renderer, this.rtA);
    t.to.render(this.renderer, this.rtB);
    this.pass.render(this.renderer, this.rtA.texture, this.rtB.texture, t.progress);
  }
}
