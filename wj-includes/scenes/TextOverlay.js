/**
 * Capa de texto de cada escena, dibujada en un canvas 2D y usada como textura
 * de WebGL: número de escena, bloque, título y subtítulo con las tipografías
 * institucionales (Hind Madurai + Source Sans 3) y una barra de acento.
 */
import { THREE } from '../core/three.js';
import { luminance } from './BaseScene.js';

const FONT_TITLE = '"Hind Madurai", "Segoe UI", system-ui, sans-serif';
const FONT_TEXT = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

let fontsReady = null;
function waitFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load(`700 100px ${FONT_TITLE}`),
      document.fonts.load(`600 40px ${FONT_TEXT}`),
      document.fonts.load(`italic 400 40px ${FONT_TEXT}`),
    ]).catch(() => null);
  }
  return fontsReady;
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const logoCache = new Map();
function loadLogo(url) {
  if (!url) return Promise.resolve(null);
  if (!logoCache.has(url)) {
    logoCache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }));
  }
  return logoCache.get(url);
}

export class TextOverlay {
  /** @param {{scene:object, index:number, blockName:string, logoUrl:string, scrim:boolean}} opts */
  constructor(opts) {
    this.opts = opts;
    this.canvas = document.createElement('canvas');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, reveal: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float reveal;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          uv.y += (1.0 - reveal) * 0.025;
          vec4 c = texture2D(map, uv);
          gl_FragColor = vec4(c.rgb, c.a * reveal);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.revealT = 1;
    this.drawToken = 0;
  }

  startReveal() {
    this.revealT = 0;
    this.material.uniforms.reveal.value = 0;
  }

  update(dt) {
    if (this.revealT < 1) {
      this.revealT = Math.min(1, this.revealT + dt / 1.1);
      const t = Math.max(0, (this.revealT - 0.25) / 0.75);
      this.material.uniforms.reveal.value = 1 - Math.pow(1 - t, 3);
    }
  }

  async draw(width, height, error = '') {
    const token = ++this.drawToken;
    await waitFonts();
    const logo = await loadLogo(this.opts.logoUrl);
    if (token !== this.drawToken) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = this.opts.scene;
    const fg = s.textColor || '#FFFFFF';
    const unit = Math.min(h, (w * 9) / 16);
    const m = Math.round(unit * 0.075);
    const maxWidth = Math.min(w - 2 * m, unit * 1.55);
    const lightBg = s.type !== 'media' && luminance(s.color) > 0.6;
    const accent = lightBg ? '#10A13B' : '#FFD500';

    if (this.opts.scrim && (s.title || s.subtitle)) {
      const g = ctx.createLinearGradient(0, h, 0, h * 0.45);
      g.addColorStop(0, 'rgba(0,0,0,0.62)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Número grande de la escena (arriba a la derecha, sutil).
    if (s.showNumber) {
      const size = unit * 0.62;
      ctx.font = `700 ${size}px ${FONT_TITLE}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.16;
      ctx.fillText(String(this.opts.index + 1).padStart(2, '0'), w - m * 0.7, m * 0.4 + size * 0.74);
      ctx.globalAlpha = 1;
    }

    if (logo) {
      const lh = unit * 0.075;
      const lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, m, m, lw, lh);
    }

    // Bloque de texto (abajo a la izquierda), se arma de abajo hacia arriba.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let y = h - m;

    const subtitle = error || s.subtitle;
    if (subtitle) {
      const size = unit * 0.042;
      ctx.font = `italic 400 ${size}px ${FONT_TEXT}`;
      const lines = wrap(ctx, subtitle, maxWidth).slice(0, 3);
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.92;
      for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], m, y);
        y -= size * 1.3;
      }
      ctx.globalAlpha = 1;
      y -= unit * 0.012;
    }

    if (s.title) {
      let size = unit * 0.125;
      let lines;
      for (;;) {
        ctx.font = `700 ${size}px ${FONT_TITLE}`;
        lines = wrap(ctx, s.title, maxWidth);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if ((lines.length <= 2 && widest <= maxWidth) || size < unit * 0.05) break;
        size *= 0.92;
      }
      ctx.fillStyle = fg;
      for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], m, y);
        y -= size * 1.02;
      }
      y -= unit * 0.02;
    }

    const kicker = this.opts.blockName;
    if (kicker && kicker.trim().toLowerCase() !== String(s.title || '').trim().toLowerCase()) {
      const size = unit * 0.027;
      ctx.font = `600 ${size}px ${FONT_TEXT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(size * 0.18).toFixed(1)}px`;
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.85;
      ctx.fillText(kicker.toUpperCase(), m, y);
      ctx.globalAlpha = 1;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      y -= size * 1.6;
    }

    ctx.fillStyle = accent;
    ctx.fillRect(m, y - unit * 0.008, unit * 0.075, unit * 0.008);

    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
