/**
 * Escena con imagen o video del mismo hosting (wj-content/media/...).
 * Se usa en la Fase 2 para los enlaces que se configuran en el panel.
 */
import { THREE } from '../core/three.js';
import { BaseScene } from './BaseScene.js';
import { TextOverlay } from './TextOverlay.js';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

export class MediaScene extends BaseScene {
  init() {
    const cfg = this.cfg;
    const url = this.ctx.resolveUrl(cfg.media.url);
    this.isVideo = VIDEO_EXT.test(cfg.media.url);

    this.scene.background = new THREE.Color(cfg.color || '#000000');
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        texAspect: { value: 16 / 9 },
        screenAspect: { value: 16 / 9 },
        cover: { value: cfg.media.fit === 'contain' ? 0 : 1 },
        bg: { value: new THREE.Color(cfg.color || '#000000') },
        loaded: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float texAspect; uniform float screenAspect; uniform float cover;
        uniform vec3 bg; uniform float loaded;
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
          if (loaded > 0.5 && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
            col = texture2D(map, uv).rgb;
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

    this.overlay = new TextOverlay({
      scene: { ...cfg, showNumber: false },
      index: this.ctx.index,
      blockName: cfg.title ? this.ctx.blockName : '',
      logoUrl: this.ctx.logoUrl,
      scrim: true,
    });
    if (cfg.title || cfg.subtitle) this.scene.add(this.overlay.mesh);

    this.ready = (this.isVideo ? this.loadVideo(url) : this.loadImage(url)).catch(async () => {
      this.error = 'No se pudo cargar el archivo multimedia.';
      this.scene.add(this.overlay.mesh);
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
    this.mat.uniforms.loaded.value = 1;
    if (this.active && this.video && !this.paused) this.video.play().catch(() => {});
  }

  enter() {
    this.active = true;
    this.overlay.startReveal();
    if (this.video) {
      if (this.video.ended) this.video.currentTime = 0;
      if (!this.paused) this.video.play().catch(() => {});
    }
  }

  exit() {
    this.active = false;
    this.video?.pause();
  }

  restart() {
    this.overlay.startReveal();
    if (this.video) {
      this.video.currentTime = 0;
      if (!this.paused) this.video.play().catch(() => {});
    }
  }

  setPaused(paused) {
    super.setPaused(paused);
    if (!this.video || !this.active) return;
    if (paused) this.video.pause();
    else this.video.play().catch(() => {});
  }

  update(dt) {
    super.update(dt);
    this.overlay.update(dt);
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
    this.overlay.dispose();
    super.dispose();
  }
}
