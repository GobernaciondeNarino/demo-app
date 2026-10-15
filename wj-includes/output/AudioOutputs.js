/**
 * Salidas de audio: "public" (parlantes del auditorio) y "discreet" (AirPods
 * del presentador). Cada una es un AudioContext con su propio dispositivo de
 * salida (AudioContext.setSinkId, Chrome 110+). Los audios se decodifican una
 * vez y se reproducen al instante desde memoria.
 */
export class AudioOutputs extends EventTarget {
  constructor() {
    super();
    this.contexts = { public: null, discreet: null };
    this.sinks = { public: '', discreet: '' };
    this.active = new Map();
    this.volume = 1;
    this.unlocked = false;
  }

  /** Debe llamarse dentro de un gesto del usuario (clic en "Iniciar"). */
  async unlock() {
    for (const name of ['public', 'discreet']) {
      if (!this.contexts[name]) this.contexts[name] = new AudioContext({ latencyHint: 'interactive' });
      await this.contexts[name].resume().catch(() => {});
    }
    this.unlocked = true;
  }

  get supportsSink() {
    return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  }

  /** Elige los dispositivos por nombre (las etiquetas se guardan en el panel). */
  async configure({ publicSinkLabel = '', discreetSinkLabel = '' } = {}, volume = 1) {
    this.volume = volume;
    if (!this.unlocked || !this.supportsSink) return { public: 'predeterminado', discreet: 'predeterminado' };
    let devices = [];
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    } catch { /* sin permiso: se usa la salida predeterminada */ }
    const result = {};
    for (const [name, label] of [['public', publicSinkLabel], ['discreet', discreetSinkLabel]]) {
      const dev = label ? devices.find((d) => d.label === label) || devices.find((d) => d.label.includes(label)) : null;
      const id = dev ? dev.deviceId : '';
      if (id !== this.sinks[name]) {
        try {
          await this.contexts[name].setSinkId(id);
          this.sinks[name] = id;
        } catch (err) {
          console.warn('setSinkId', err);
        }
      }
      result[name] = dev ? dev.label : label ? `no encontrado: ${label}` : 'predeterminado';
    }
    return result;
  }

  get sameDevice() {
    return this.sinks.public === this.sinks.discreet;
  }

  /** Decodifica sin necesidad de un gesto del usuario (contexto fuera de línea). */
  async decode(arrayBuffer) {
    if (!this.decoder) this.decoder = new OfflineAudioContext(2, 44100, 44100);
    return this.decoder.decodeAudioData(arrayBuffer);
  }

  /**
   * Reproduce un AudioBuffer. channel: "public" | "discreet" | "both".
   * Devuelve { done: Promise, stop() }.
   */
  play(buffer, channel = 'public') {
    let names = channel === 'both' ? ['public', 'discreet'] : [channel];
    if (channel === 'both' && this.sameDevice) names = ['public'];
    const sources = [];
    for (const name of names) {
      const ctx = this.contexts[name];
      if (!ctx) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      src.connect(gain).connect(ctx.destination);
      src.start();
      sources.push({ src, name });
    }
    const token = Symbol('audio');
    this.active.set(token, names);
    this.emit();
    const done = Promise.all(sources.map(({ src }) => new Promise((r) => { src.onended = r; }))).then(() => {
      this.active.delete(token);
      this.emit();
    });
    return {
      channels: names,
      done,
      stop: () => sources.forEach(({ src }) => { try { src.stop(); } catch { /* ya terminó */ } }),
    };
  }

  /** ¿Suena algo que el micrófono podría captar (parlantes)? */
  get publicAudible() {
    for (const names of this.active.values()) {
      if (names.includes('public') || this.sameDevice) return true;
    }
    return false;
  }

  emit() {
    this.dispatchEvent(new CustomEvent('activity', { detail: { speaking: this.active.size > 0, publicAudible: this.publicAudible } }));
  }
}
