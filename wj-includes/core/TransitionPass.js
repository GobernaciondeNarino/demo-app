/**
 * TransitionPass: mezcla la escena saliente y la entrante (cada una dibujada
 * en su propio WebGLRenderTarget) con un shader controlado por `progress` (0→1).
 *
 * Transiciones:
 *   fade   Fundido (crossfade)
 *   wipe   Barrido direccional (derecha→izquierda al avanzar, al revés al retroceder)
 *   noise  Disolución con ruido y borde luminoso ("cinematográfica")
 *   zoom   Zoom + desenfoque radial
 */
import { THREE } from './three.js';

export const TRANSITION_TYPES = { fade: 0, wipe: 1, noise: 2, zoom: 3 };
export const TRANSITION_LABELS = {
  fade: 'Fundido',
  wipe: 'Barrido direccional',
  noise: 'Disolución con ruido',
  zoom: 'Zoom + desenfoque',
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tFrom;
  uniform sampler2D tTo;
  uniform float progress;
  uniform int mode;
  uniform float dir;
  uniform float seed;
  uniform float aspect;
  uniform vec3 edgeColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
  vec4 radialBlur(sampler2D tex, vec2 uv, float strength) {
    vec2 d = (uv - vec2(0.5)) * strength / 14.0;
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 14; i++) {
      acc += texture2D(tex, clamp(uv - d * float(i), 0.0, 1.0));
    }
    return acc / 14.0;
  }

  void main() {
    float p = clamp(progress, 0.0, 1.0);
    vec2 uv = vUv;
    vec4 col;

    if (mode == 0) {
      col = mix(texture2D(tFrom, uv), texture2D(tTo, uv), p);

    } else if (mode == 1) {
      float x = dir > 0.0 ? uv.x : 1.0 - uv.x;
      float soft = 0.12;
      float edge = 1.0 - p * (1.0 + soft);
      float m = smoothstep(edge, edge + soft, x);
      vec4 a = texture2D(tFrom, clamp(uv + vec2(dir * p * 0.18, 0.0), 0.0, 1.0));
      vec4 b = texture2D(tTo, clamp(uv - vec2(dir * (1.0 - p) * 0.18, 0.0), 0.0, 1.0));
      col = mix(a, b, m);
      float glow = (1.0 - smoothstep(0.0, soft * 0.6, abs(x - edge - soft * 0.5))) * sin(p * 3.14159);
      col.rgb += edgeColor * glow * 0.45;

    } else if (mode == 2) {
      vec2 q = vec2(uv.x * aspect, uv.y) * 2.6 + seed;
      float n = clamp((fbm(q) - 0.18) / 0.64, 0.0, 1.0);
      float w = 0.07;
      float t = p * (1.0 + 2.0 * w) - w;
      float keepFrom = smoothstep(t - w * 0.35, t + w * 0.35, n);
      col = mix(texture2D(tTo, uv), texture2D(tFrom, uv), keepFrom);
      float band = 1.0 - smoothstep(0.0, w, abs(n - t));
      vec3 burn = mix(edgeColor, vec3(1.0), band * band);
      col.rgb += burn * band * 0.9 * sin(p * 3.14159);

    } else {
      vec2 c = vec2(0.5);
      vec2 uvA = c + (uv - c) / (1.0 + p * 0.8);
      vec2 uvB = c + (uv - c) / (1.3 - 0.3 * p);
      vec4 a = radialBlur(tFrom, uvA, p * 0.55);
      vec4 b = radialBlur(tTo, uvB, (1.0 - p) * 0.55);
      col = mix(a, b, smoothstep(0.2, 0.8, p));
    }

    gl_FragColor = vec4(col.rgb, 1.0);
  }
`;

export class TransitionPass {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tFrom: { value: null },
        tTo: { value: null },
        progress: { value: 0 },
        mode: { value: TRANSITION_TYPES.noise },
        dir: { value: 1 },
        seed: { value: 0 },
        aspect: { value: 16 / 9 },
        edgeColor: { value: new THREE.Color('#FFD500') },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Prepara una transición nueva. */
  setup(type, direction) {
    const u = this.material.uniforms;
    u.mode.value = TRANSITION_TYPES[type] ?? TRANSITION_TYPES.fade;
    u.dir.value = direction < 0 ? -1 : 1;
    u.seed.value = Math.random() * 50;
  }

  setAspect(aspect) {
    this.material.uniforms.aspect.value = aspect;
  }

  setEdgeColor(hex) {
    this.material.uniforms.edgeColor.value.set(hex);
  }

  render(renderer, fromTexture, toTexture, progress) {
    const u = this.material.uniforms;
    u.tFrom.value = fromTexture;
    u.tTo.value = toTexture;
    u.progress.value = progress;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
  }
}
