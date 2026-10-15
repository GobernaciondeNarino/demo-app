/**
 * Asistente de datos clave: escucha lo que dice el presentador y, si pide
 * avanzar sin haber mencionado un dato importante de la escena, se lo recuerda.
 *
 * - Transcripción por escena, solo en memoria; se descarta al cambiar de escena
 *   (salvo que en el panel se active "guardar transcripciones" para ensayos).
 * - Verificación en segundo plano (al terminar cada frase y cada ~20 s) con
 *   Claude o Gemini (/coverage), que entiende el dato aunque se diga con otras
 *   palabras. Así, al decir "siguiente", la respuesta ya está lista.
 * - Respaldo local inmediato: palabras clave de cada dato ("a|b" = alternativas;
 *   deben aparecer todas las entradas de la lista).
 * - Si vas atrasado más del umbral, solo se recuerdan los datos de prioridad alta.
 */
import { normalize, keywordMatches } from './text.js';
import { reminderText } from './phrases.js';

export class FactsAssistant extends EventTarget {
  constructor(api) {
    super();
    this.api = api;
    this.scene = null;
    this.items = [];
    this.segments = [];
    this.checkedUpTo = 0;
    this.remindersGiven = 0;
    this.lastReminder = null;
    this.behind = false;
    this.sessionTranscript = [];
    this.aiPending = null;
    this.lastAiAt = 0;
    this.aiError = '';
  }

  configure(cfg) {
    this.cfg = cfg;
    clearInterval(this.interval);
    this.interval = setInterval(() => this.maybeCheckAI('intervalo'), cfg.reminders.checkIntervalMs);
    if (this.scene) {
      const fresh = cfg.scenes.find((s) => s.id === this.scene.id);
      if (fresh) this.setScene(fresh, { keepTranscript: true });
    }
  }

  get rcfg() {
    return this.cfg.reminders;
  }

  setScene(scene, { keepTranscript = false } = {}) {
    if (!keepTranscript) {
      if (this.rcfg?.saveTranscripts && this.scene && this.segments.length) {
        this.sessionTranscript.push({ sceneId: this.scene.id, title: this.scene.title, text: this.segments.map((s) => s.text).join(' ') });
      }
      this.segments = [];
      this.checkedUpTo = 0;
      this.remindersGiven = 0;
      this.lastReminder = null;
    }
    const prev = new Map(this.items.map((i) => [i.id, i]));
    this.scene = scene;
    this.items = (scene.facts || []).map((f) => ({
      id: f.id,
      text: f.text,
      keywords: f.keywords || [],
      priority: f.priority,
      covered: keepTranscript ? prev.get(f.id)?.covered || false : false,
      by: keepTranscript ? prev.get(f.id)?.by || '' : '',
    }));
    this.localCheck();
    this.emit();
  }

  setBehind(behind) {
    if (behind !== this.behind) {
      this.behind = behind;
      this.emit();
    }
  }

  /** Datos que aplican ahora (todos, o solo prioridad alta). */
  relevant() {
    const onlyHigh = this.rcfg.onlyHigh || this.behind;
    return this.items.filter((i) => !onlyHigh || i.priority === 'alta');
  }

  pending() {
    return this.relevant().filter((i) => !i.covered);
  }

  addTranscript(text) {
    const t = String(text || '').trim();
    if (!t || !this.scene) return;
    this.segments.push({ t: Date.now(), text: t });
    this.localCheck();
    this.emit();
    // Verificar al terminar cada frase (con un mínimo de 6 s entre consultas).
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.maybeCheckAI('frase'), 1200);
  }

  transcriptText() {
    return this.segments.map((s) => s.text).join(' ');
  }

  localCheck() {
    const norm = normalize(this.transcriptText());
    if (!norm) return;
    for (const item of this.items) {
      if (item.covered || !item.keywords.length) continue;
      if (item.keywords.every((k) => keywordMatches(norm, k))) {
        item.covered = true;
        item.by = 'palabras clave';
      }
    }
  }

  get aiEnabled() {
    return this.rcfg.enabled && this.rcfg.provider !== 'local';
  }

  maybeCheckAI(reason) {
    if (!this.aiEnabled || !this.pending().length) return null;
    if (this.segments.length <= this.checkedUpTo) return null;
    if (reason !== 'avance' && Date.now() - this.lastAiAt < 6000) return null;
    return this.checkAI();
  }

  /** Consulta /coverage con la transcripción completa de la escena. */
  checkAI(timeoutMs = 10000) {
    if (this.aiPending) return this.aiPending;
    const sceneId = this.scene?.id;
    const upTo = this.segments.length;
    const facts = this.items.filter((i) => !i.covered).map((i) => ({ id: i.id, text: i.text }));
    if (!facts.length || !upTo) return Promise.resolve();
    this.lastAiAt = Date.now();
    this.aiPending = this.api.post('coverage', { transcript: this.transcriptText(), facts, timeoutMs }, { timeoutMs: timeoutMs + 1000 })
      .then((r) => {
        if (this.scene?.id !== sceneId) return;
        this.checkedUpTo = Math.max(this.checkedUpTo, upTo);
        this.aiError = '';
        for (const id of r.covered || []) {
          const item = this.items.find((i) => i.id === id);
          if (item && !item.covered) {
            item.covered = true;
            item.by = 'IA';
          }
        }
        this.emit();
      })
      .catch((err) => {
        this.aiError = err.message;
        this.aiErrorAt = Date.now();
        this.emit();
      })
      .finally(() => {
        this.aiPending = null;
      });
    return this.aiPending;
  }

  markCovered(id) {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.covered = true;
      item.by = 'manual';
      this.emit();
    }
  }

  /**
   * Se llama al pedir "siguiente". Devuelve { ok:true } para avanzar o
   * { ok:false, fact, text } con el recordatorio que debe sonar.
   */
  async checkBeforeAdvance(source) {
    const r = this.rcfg;
    if (!r?.enabled || !this.scene) return { ok: true };
    if (r.applyTo === 'voice' && source !== 'voice') return { ok: true };
    if (!this.pending().length || this.remindersGiven >= r.maxPerScene) return { ok: true };

    // Si hay frases sin verificar, se da a la IA un margen corto (≤ 800 ms por defecto).
    // (Si la IA falló hace poco —p. ej. sin llave o sin internet— se usa solo la verificación local.)
    const aiDown = this.aiError && Date.now() - (this.aiErrorAt || 0) < 30000;
    if (this.aiEnabled && !aiDown && this.segments.length > this.checkedUpTo) {
      const check = this.aiPending || this.checkAI(Math.max(1500, r.timeoutMs));
      await Promise.race([check, new Promise((res) => setTimeout(res, r.timeoutMs))]);
    }
    this.localCheck();
    const pending = this.pending();
    if (!pending.length) return { ok: true };
    const fact = pending.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'alta' ? -1 : 1))[0];
    this.remindersGiven++;
    this.lastReminder = { id: fact.id, text: reminderText(this.cfg, fact), fact: fact.text, ts: Date.now() };
    this.emit();
    return { ok: false, fact, text: this.lastReminder.text };
  }

  snapshot() {
    const onlyHigh = this.rcfg?.onlyHigh || this.behind;
    return {
      sceneId: this.scene?.id || null,
      onlyHigh,
      behind: this.behind,
      remindersGiven: this.remindersGiven,
      lastReminder: this.lastReminder,
      aiError: this.aiError,
      items: this.items.map((i) => ({
        id: i.id, text: i.text, priority: i.priority, covered: i.covered, by: i.by,
        applies: !onlyHigh || i.priority === 'alta',
      })),
      transcript: this.transcriptText().slice(-800),
    };
  }

  takeSessionTranscript() {
    if (this.rcfg?.saveTranscripts && this.scene && this.segments.length) {
      this.sessionTranscript.push({ sceneId: this.scene.id, title: this.scene.title, text: this.transcriptText() });
      this.segments = [];
    }
    const out = this.sessionTranscript;
    this.sessionTranscript = [];
    return out;
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }
}
