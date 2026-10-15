/**
 * Escena con imagen o video del mismo hosting (wj-content/media/... o una
 * carpeta junto a la presentación).
 *
 * Al entrar muestra una tarjeta de presentación (color + título) y el contenido
 * aparece y arranca después del retraso configurado («inicia N segundos después
 * de cambiar o iniciar la escena»).
 */
import { THREE } from '../core/three.js';
import { BaseScene, Countdown } from './BaseScene.js';
import { TextOverlay } from './TextOverlay.js';
import { mediaKind } from './mediaKind.js';

export class MediaScene extends BaseScene {
  init() {
    const cfg = this.cfg;
    const url = this.ctx.resolveUrl(cfg.media.url);
    this.kind = mediaKind(cfg.media);
    this.state = 'idle';
    this.countdown = new Countdown();
    this.reveal = 0;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        texAspect: { value: 16 / 9 },
        screenAspect: { value: 16 / 9 },
        cover: { value: cfg.media.fit === 'contain' ? 0 : 1 },
        bg: { value: new THREE.Color(cfg.color || '#000000') },
        reveal: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float texAspect; uniform float screenAspect; uniform float cover;
        uniform vec3 bg; uniform float reveal;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv - 0.5;
          float r = screenAspect / texAspect;
          bool wide = r > 1.0;
          if (cover > 0.5) {
            if (wide) uv.y /= r; else uv.x *= r;
          } else {
            if (wide) uv.x *= r; else uv.y /= r;
          }
          uv += 0.5;
          vec3 col = bg;
          if (reveal > 0.0 && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            col = mix(bg, texture2D(map, uv).rgb, reveal);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);

    // Tarjeta de presentación mientras corre la cuenta regresiva.
    this.overlay = new TextOverlay({
      scene: cfg,
      index: this.ctx.index,
      blockName: this.ctx.blockName,
      logoUrl: this.ctx.logoUrl,
      scrim: false,
    });
    this.scene.add(this.overlay.mesh);

    this.ready = (this.kind === 'video' ? this.loadVideo(url) : this.loadImage(url)).catch(async () => {
      this.error = 'No se pudo cargar el archivo multimedia.';
      await this.overlay.draw(this.width, this.height, this.error);
    });
  }

  async loadImage(url) {
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.setTexture(tex, tex.image.width / tex.image.height);
  }

  loadVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      if (new URL(url, location.href).origin !== location.origin) v.crossOrigin = 'anonymous';
      v.src = url;
      v.loop = this.cfg.media.loop;
      v.muted = this.cfg.media.muted;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('loadeddata', () => {
        const tex = new THREE.VideoTexture(v);
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.video = v;
        this.setTexture(tex, v.videoWidth / Math.max(1, v.videoHeight));
        resolve();
      }, { once: true });
      v.addEventListener('error', () => reject(new Error('video')), { once: true });
      v.load();
    });
  }

  setTexture(tex, aspect) {
    this.texture = tex;
    this.mat.uniforms.map.value = tex;
    this.mat.uniforms.texAspect.value = aspect || 16 / 9;
    if (this.state === 'playing') this.play();
  }

  enter() {
    this.overlay.startReveal();
  }

  /** La presentación está en vivo en esta escena: arranca la cuenta regresiva. */
  begin() {
    const delay = this.cfg.media.startDelayMs ?? 5000;
    if (delay <= 0) return this.startContent();
    this.state = 'waiting';
    this.countdown.start(delay);
    if (this.paused) this.countdown.pause();
  }

  startContent() {
    this.state = 'playing';
    this.countdown.clear();
    if (this.video) this.video.currentTime = 0;
    this.play();
  }

  play() {
    if (this.video && !this.paused && this.state === 'playing') this.video.play().catch(() => {});
  }

  exit() {
    this.state = 'idle';
    this.countdown.clear();
    this.reveal = 0;
    this.mat.uniforms.reveal.value = 0;
    this.overlay.material.uniforms.reveal.value = 1;
    this.video?.pause();
  }

  restart() {
    this.exit();
    this.overlay.startReveal();
  }

  setPaused(paused) {
    super.setPaused(paused);
    if (paused) this.countdown.pause();
    else this.countdown.resume();
    if (!this.video || this.state !== 'playing') return;
    if (paused) this.video.pause();
    else this.play();
  }

  update(dt) {
    super.update(dt);
    if (this.state === 'waiting' && this.countdown.done) this.startContent();
    // El contenido aparece (y la tarjeta se desvanece) en 0,8 s.
    if (this.state === 'playing' && this.texture) {
      if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.8);
      this.overlay.material.uniforms.reveal.value = 1 - this.reveal;
    } else {
      this.reveal = 0;
      this.overlay.update(dt);
    }
    this.mat.uniforms.reveal.value = this.reveal;
  }

  mediaStatus() {
    return {
      kind: this.kind,
      url: this.cfg.media.url,
      state: this.state,
      startsIn: this.state === 'waiting' ? Math.ceil((this.countdown.remainingMs ?? 0) / 1000) : null,
      error: this.error || '',
    };
  }

  resize(width, height) {
    super.resize(width, height);
    this.mat.uniforms.screenAspect.value = width / Math.max(1, height);
    this.overlay.draw(width, height, this.error || '');
  }

  dispose() {
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.texture?.dispose();
    this.overlay.dispose();
    super.dispose();
  }
}
