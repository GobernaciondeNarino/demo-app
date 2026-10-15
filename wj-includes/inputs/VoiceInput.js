/**
 * Comandos por voz con la Web Speech API de Chrome (es-CO, continuo, con
 * resultados intermedios para reaccionar rápido).
 *
 * - Palabra de activación ("Ñaño") configurable: hablar con el público no
 *   cambia de escena.
 * - Diccionario de frases por acción (editable en el panel).
 * - Si la frase no coincide y está activado, se consulta /intent (Claude/Gemini).
 * - Mientras la IA habla, los resultados se ignoran: no reacciona a su propia voz.
 * - Las frases finales alimentan la transcripción del asistente de datos clave.
 *
 * Nota: el reconocimiento de Chrome usa internet. Si falla la red, el teclado,
 * el clicker, los gestos y los AirPods siguen funcionando.
 */
import { VoiceMatcher } from './VoiceMatcher.js';

export class VoiceInput extends EventTarget {
  constructor({ dispatch, api, getContext }) {
    super();
    this.dispatch = dispatch;
    this.api = api;
    this.getContext = getContext || (() => ({ current: 1, total: 1 }));
    this.active = false;
    this.session = 0;
    this.commandKeys = new Set();
    this.suppressedKeys = new Set();
    this.speakingNow = false;
    this.suppressUntil = 0;
    this.wakeUntil = 0;
    this.level = 0;
    this.status = 'off';
  }

  get supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  configure(cfg) {
    const restart = this.cfg && this.active && (cfg.lang !== this.cfg.lang || cfg.engine !== this.cfg.engine);
    this.cfg = cfg;
    this.matcher = new VoiceMatcher(cfg);
    if (!cfg.enabled && this.active) this.stop();
    else if (cfg.enabled && !this.active && this.wantStart) this.start();
    else if (restart) this.rec?.abort();
  }

  async start() {
    this.wantStart = true;
    if (!this.cfg?.enabled) return this.setStatus('off');
    if (!this.supported) return this.setStatus('error', 'este navegador no tiene reconocimiento de voz (use Chrome)');
    this.active = true;
    await this.startMeter();
    this.startRecognition();
  }

  stop() {
    this.active = false;
    this.wantStart = false;
    try { this.rec?.abort(); } catch { /* */ }
    this.stopMeter();
    this.setStatus('off');
  }

  startRecognition() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.lang = this.cfg.lang || 'es-CO';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (this.cfg.engine === 'webspeech-local' && 'processLocally' in rec) rec.processLocally = true;
    const session = ++this.session;
    this.commandKeys.clear();
    this.suppressedKeys.clear();
    rec.onstart = () => this.setStatus('on');
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        this.handle(`${session}:${i}`, r[0].transcript, r.isFinal, r[0].confidence);
      }
    };
    rec.onerror = (e) => {
      this.lastError = e.error;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.setStatus('error', 'permiso de micrófono denegado');
      } else if (e.error === 'network') {
        this.setStatus('error', 'sin conexión: el reconocimiento de Chrome usa internet');
      } else if (e.error === 'language-not-supported') {
        this.active = false;
        this.setStatus('error', `idioma no disponible (${rec.lang})`);
      }
    };
    rec.onend = () => {
      if (!this.active) return this.setStatus('off');
      const delay = this.lastError === 'network' ? 3000 : 250;
      this.lastError = null;
      setTimeout(() => { if (this.active && this.session === session) this.startRecognition(); }, delay);
    };
    try {
      rec.start();
      this.rec = rec;
    } catch (err) {
      this.setStatus('error', err.message);
    }
  }

  /** La app avisa cuando la IA empieza/termina de hablar. */
  setSpeaking(speaking) {
    if (speaking) this.speakingNow = true;
    else if (this.speakingNow) {
      this.speakingNow = false;
      this.suppressUntil = Date.now() + 500;
    }
  }

  handle(key, text, isFinal, confidence) {
    if (this.suppressedKeys.has(key) || this.speakingNow || Date.now() < this.suppressUntil) {
      this.suppressedKeys.add(key);
      this.emit('heard', { text, isFinal, ignored: true });
      return;
    }
    this.emit('heard', { text, isFinal, ignored: false });
    if (isFinal) this.emit('transcript', { text });
    if (this.commandKeys.has(key)) return;

    const wakeActive = Date.now() < this.wakeUntil;
    const m = this.matcher.match(text, { wakeActive });
    if (m.wake && !m.action) this.wakeUntil = Date.now() + (this.cfg.wakeWord.windowMs || 4000);

    if (m.action) {
      this.commandKeys.add(key);
      this.wakeUntil = 0;
      this.dispatch({
        action: m.action,
        arg: m.arg,
        source: 'voice',
        confidence: confidence || 0.9,
        meta: { heard: text.trim().slice(0, 120), phrase: m.phrase },
      });
      return;
    }
    if (!isFinal) return;

    const wakeOn = this.cfg.wakeWord.enabled;
    const addressed = m.wake || (wakeActive && m.words <= 6) || !wakeOn;
    if (!addressed || m.words === 0) return;
    const ai = this.cfg.aiIntent;
    if (ai.enabled && m.words <= ai.maxWords) {
      this.commandKeys.add(key);
      this.wakeUntil = 0;
      this.askAI(m.rest || text);
    } else if (wakeOn && m.words >= 2) {
      this.wakeUntil = 0;
      this.emit('unknown', { text });
    }
  }

  async askAI(text) {
    const ctx = this.getContext();
    try {
      const r = await this.api.post('intent', { text, current: ctx.current, total: ctx.total }, { timeoutMs: 5000 });
      if (r.action && r.action !== 'NONE') {
        this.dispatch({ action: r.action, arg: r.scene || null, source: 'voice', confidence: 0.75, meta: { heard: text.slice(0, 120), ai: r.provider } });
      } else if (this.cfg.wakeWord.enabled) {
        this.emit('unknown', { text });
      }
    } catch (err) {
      this.emit('unknown', { text, error: err.message });
    }
  }

  /** Nivel del micrófono para el monitor (independiente del reconocimiento). */
  async startMeter() {
    if (this.meter) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 6);
        this.level = Math.max(level, this.level * 0.85);
      }, 100);
      this.meter = { stream, ctx, timer };
    } catch (err) {
      this.setStatus('error', 'sin acceso al micrófono');
    }
  }

  stopMeter() {
    if (!this.meter) return;
    clearInterval(this.meter.timer);
    this.meter.stream.getTracks().forEach((t) => t.stop());
    this.meter.ctx.close().catch(() => {});
    this.meter = null;
    this.level = 0;
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.statusDetail = detail;
    this.emit('status', { status, detail });
    return status;
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
