/**
 * Respuestas por voz con ElevenLabs.
 *
 * Al cargar la presentación se descargan (desde la caché del servidor) y
 * decodifican en memoria todas las frases configuradas: confirmaciones,
 * recordatorios, avisos de tiempo y narraciones. Así cada respuesta suena en
 * pocos milisegundos y sigue funcionando aunque se caiga internet.
 * Si ElevenLabs no está configurado se usa la voz del navegador como respaldo.
 */
import { collectPhrases } from '../core/phrases.js';

export class VoiceResponder extends EventTarget {
  constructor(api, outputs) {
    super();
    this.api = api;
    this.outputs = outputs;
    this.buffers = new Map();
    this.failed = new Map();
    this.items = [];
    this.muted = false;
    this.current = null;
    this.lastPick = {};
    this.synthSpeaking = false;
    this.preloadRun = 0;
    outputs.addEventListener('activity', () => this.emitSpeaking());
  }

  configure(cfg) {
    this.cfg = cfg;
    this.items = collectPhrases(cfg);
    this.outputs.volume = cfg.tts.volume;
    return this.preload();
  }

  stats() {
    const loaded = this.items.filter((i) => this.buffers.has(i.text)).length;
    return { loaded, total: this.items.length, failed: this.items.filter((i) => this.failed.has(i.text)).length, lastError: this.lastError || '' };
  }

  async load(text, timeoutMs = 20000) {
    const ab = await this.api.tts(text, { timeoutMs });
    const buf = await this.outputs.decode(ab);
    this.buffers.set(text, buf);
    this.failed.delete(text);
    return buf;
  }

  /** Precarga en paralelo (3 a la vez) todo lo que falte. */
  async preload({ retryFailed = false } = {}) {
    const run = ++this.preloadRun;
    const pending = this.items.filter((i) => !this.buffers.has(i.text) && (retryFailed || !this.failed.has(i.text)));
    const worker = async () => {
      while (pending.length && run === this.preloadRun) {
        const item = pending.shift();
        try {
          await this.load(item.text);
        } catch (err) {
          this.failed.set(item.text, err.message);
          this.lastError = err.message;
          // Falta configurar ElevenLabs (llave o voz): no tiene sentido seguir intentando.
          if (err.status === 409) {
            for (const rest of pending.splice(0)) this.failed.set(rest.text, err.message);
          }
        }
        this.dispatchEvent(new CustomEvent('progress', { detail: this.stats() }));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this.dispatchEvent(new CustomEvent('progress', { detail: this.stats() }));
    return this.stats();
  }

  get speaking() {
    return this.outputs.active.size > 0 || this.synthSpeaking;
  }

  get publicAudible() {
    return this.outputs.publicAudible || this.synthSpeaking;
  }

  emitSpeaking() {
    this.dispatchEvent(new CustomEvent('speaking', { detail: { speaking: this.speaking, publicAudible: this.publicAudible } }));
  }

  stop() {
    this.current?.stop();
    this.current = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.stop();
  }

  /**
   * Dice un texto por el canal indicado ("public", "discreet", "both").
   * En silencio (MUTE_VOICE) se omite lo que va a los parlantes.
   */
  async speak(text, channel = 'public', { interrupt = true } = {}) {
    if (!text) return false;
    if (this.muted) {
      if (channel === 'public') return false;
      if (channel === 'both') channel = 'discreet';
    }
    if (interrupt) this.stop();
    let buf = this.buffers.get(text);
    if (!buf) {
      try {
        buf = await this.load(text, 4000);
      } catch (err) {
        this.failed.set(text, err.message);
        return this.speakWithBrowser(text);
      }
    }
    const handle = this.outputs.play(buf, channel);
    this.current = handle;
    await handle.done;
    if (this.current === handle) this.current = null;
    return true;
  }

  speakWithBrowser(text) {
    if (!('speechSynthesis' in window)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.cfg?.voice?.lang || 'es-CO';
      const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith('es'));
      if (voice) u.voice = voice;
      u.onstart = () => { this.synthSpeaking = true; this.emitSpeaking(); };
      u.onend = u.onerror = () => { this.synthSpeaking = false; this.emitSpeaking(); resolve(true); };
      speechSynthesis.speak(u);
    });
  }

  pick(key) {
    const list = this.cfg?.responses?.phrases?.[key] || [];
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    let text;
    do { text = list[Math.floor(Math.random() * list.length)]; } while (text === this.lastPick[key]);
    this.lastPick[key] = text;
    return text;
  }

  /** Confirmación de una acción ("Claro, avanzamos."). */
  respond(action, source) {
    const r = this.cfg?.responses;
    if (!r?.enabled) return;
    if (r.respondTo === 'voice' && source !== 'voice') return;
    const key = action === 'FORCE_NEXT' ? 'NEXT' : action;
    const text = this.pick(key);
    if (text) this.speak(text, r.output);
  }
}
