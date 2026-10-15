/**
 * Escena de Fase 1: color sólido a pantalla completa con un gradiente animado
 * muy sutil y partículas en movimiento (evidencia de que es WebGL en vivo),
 * más el número de escena y los textos.
 */
import { THREE } from '../core/three.js';
import { BaseScene, luminance } from './BaseScene.js';
import { TextOverlay } from './TextOverlay.js';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
`;

export class ColorScene extends BaseScene {
  init() {
    const cfg = this.cfg;
    const effect = cfg.effect || 'both';
    const gradient = effect === 'both' || effect === 'gradient' ? 1 : 0;
    const light = luminance(cfg.color) > 0.6;

    this.bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(cfg.color) },
          time: { value: 0 },
          aspect: { value: 16 / 9 },
          amount: { value: gradient },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 color; uniform float time; uniform float aspect; uniform float amount;
          varying vec2 vUv;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
            float n1 = fbm(p * 1.4 + vec2(time * 0.035, time * 0.02));
            float n2 = fbm(p * 2.8 - vec2(time * 0.02, -time * 0.03) + 7.0);
            float l = (n1 - 0.5) * 0.20 + (n2 - 0.5) * 0.08;
            vec2 c = vec2(sin(time * 0.07) * 0.55 * aspect * 0.5, cos(time * 0.05) * 0.25);
            float glow = 1.0 - smoothstep(0.0, 0.9, length(p - c));
            vec3 col = color * (1.0 + l * amount) + vec3(glow * 0.07 + l * 0.04) * amount;
            float v = smoothstep(1.25, 0.25, length(p));
            col *= mix(1.0, 0.84 + 0.16 * v, amount);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.bg.frustumCulled = false;
    this.scene.add(this.bg);

    if (effect === 'both' || effect === 'particles') {
      this.particles = this.createParticles(light ? '#FFFFFF' : '#FFFFFF', light ? 0.55 : 0.32);
      this.scene.add(this.particles);
    }

    this.overlay = new TextOverlay({
      scene: cfg,
      index: this.ctx.index,
      blockName: this.ctx.blockName,
      logoUrl: this.ctx.logoUrl,
      scrim: false,
    });
    this.scene.add(this.overlay.mesh);
    this.ready = this.overlay.draw(this.width, this.height);
  }

  createParticles(hex, alpha) {
    const count = 360;
    const base = new Float32Array(count * 3);
    const extra = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = Math.random() * 2 - 1;
      base[i * 3 + 1] = Math.random() * 2 - 1;
      base[i * 3 + 2] = 0;
      extra[i * 3] = 0.015 + Math.random() * 0.045; // velocidad vertical
      extra[i * 3 + 1] = Math.random() * Math.PI * 2; // fase
      extra[i * 3 + 2] = 1.5 + Math.random() * 4.5; // tamaño
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('extra', new THREE.BufferAttribute(extra, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(hex) },
        alpha: { value: alpha },
        pixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        scale: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 extra;
        uniform float time; uniform float pixelRatio; uniform float scale;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + 1.0 + time * extra.x, 2.0) - 1.0;
          p.x += sin(time * 0.3 + extra.y) * 0.03;
          vTwinkle = 0.55 + 0.45 * sin(time * 1.3 + extra.y * 3.0);
          float edge = smoothstep(1.0, 0.8, abs(p.y));
          vTwinkle *= edge;
          gl_PointSize = extra.z * pixelRatio * scale;
          gl_Position = vec4(p.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float alpha;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * alpha * vTwinkle;
          gl_FragColor = vec4(color, a);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  enter() {
    this.overlay.startReveal();
  }

  restart() {
    this.overlay.startReveal();
  }

  update(dt) {
    super.update(dt);
    this.bg.material.uniforms.time.value = this.time;
    if (this.particles) this.particles.material.uniforms.time.value = this.time;
    this.overlay.update(dt);
  }

  resize(width, height) {
    super.resize(width, height);
    this.bg.material.uniforms.aspect.value = width / Math.max(1, height);
    if (this.particles) this.particles.material.uniforms.scale.value = Math.max(0.6, Math.min(2, height / 900));
    this.ready = this.overlay.draw(width, height);
  }

  dispose() {
    this.overlay.dispose();
    super.dispose();
  }
}
