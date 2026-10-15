/**
 * AirPods (y cualquier control multimedia) mediante la Media Session API.
 *
 * Los botones de volumen no son accesibles desde una página web; lo que sí
 * llega son las acciones multimedia:
 *   doble toque / doble presión  → nexttrack      (por defecto: Siguiente)
 *   triple toque / presión       → previoustrack  (por defecto: Anterior)
 *   un toque                     → play / pause   (opcional)
 *
 * Requisito del sistema: la página debe estar reproduciendo audio, así que se
 * mantiene una pista silenciosa en bucle. Los AirPods deben estar emparejados
 * con el computador que corre la presentación.
 */

/** WAV silencioso de 10 s generado en memoria (no se descarga nada). */
function silentWavUrl(seconds = 10, rate = 8000) {
  const samples = seconds * rate;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export const MEDIA_ACTIONS = ['nexttrack', 'previoustrack', 'play', 'pause', 'seekforward', 'seekbackward'];

export class MediaKeysInput extends EventTarget {
  constructor(dispatch, { title = 'Presentación IA', artist = 'Gobernación de Nariño' } = {}) {
    super();
    this.dispatch = dispatch;
    this.map = {};
    this.enabled = true;
    this.meta = { title, artist };
    this.status = 'off';
  }

  get supported() {
    return 'mediaSession' in navigator;
  }

  configure(cfg) {
    this.enabled = cfg.enabled;
    this.map = cfg.map || {};
    if (!this.enabled) this.stop();
  }

  /** Debe llamarse dentro de un gesto del usuario. */
  async start() {
    if (!this.enabled || !this.supported) return this.setStatus(this.supported ? 'off' : 'error');
    if (!this.audio) {
      this.audio = new Audio(silentWavUrl());
      this.audio.loop = true;
      this.audio.volume = 1;
    }
    try {
      await this.audio.play();
    } catch (err) {
      return this.setStatus('error', 'el navegador no permitió reproducir audio');
    }
    navigator.mediaSession.metadata = new MediaMetadata(this.meta);
    navigator.mediaSession.playbackState = 'playing';
    for (const name of MEDIA_ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(name, () => this.onAction(name));
      } catch { /* acción no soportada por este navegador */ }
    }
    return this.setStatus('on');
  }

  stop() {
    if (!this.supported) return;
    for (const name of MEDIA_ACTIONS) {
      try { navigator.mediaSession.setActionHandler(name, null); } catch { /* */ }
    }
    this.audio?.pause();
    this.setStatus('off');
  }

  onAction(name) {
    // Mantener la sesión multimedia activa aunque el sistema haya pedido pausa.
    if (this.audio?.paused) this.audio.play().catch(() => {});
    navigator.mediaSession.playbackState = 'playing';
    this.dispatchEvent(new CustomEvent('action', { detail: { name } }));
    const action = this.map[name];
    if (!this.enabled || !action || action === 'NONE') return;
    this.dispatch({ action, source: 'media', confidence: 1, meta: { key: name } });
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, detail } }));
    return status;
  }
}
