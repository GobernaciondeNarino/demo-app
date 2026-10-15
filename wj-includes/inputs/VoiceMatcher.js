/**
 * Reconoce comandos en una frase transcrita:
 *   "Ñaño, siguiente"          → NEXT
 *   "Ñaño, continuar igual"    → FORCE_NEXT (gana la frase más larga)
 *   "Ñaño, ve a la escena 3"   → GOTO 3
 * Con palabra de activación, el comando debe venir justo después de ella
 * (o en la frase siguiente, dentro de la ventana configurada).
 */
import { tokens, findPhrase, parseNumber } from '../core/text.js';

const SCENE_WORDS = new Set(['escena', 'diapositiva', 'slide', 'lamina']);
const WINDOW_WORDS = 8;

export class VoiceMatcher {
  constructor(voiceCfg) {
    this.wakeEnabled = !!voiceCfg.wakeWord?.enabled;
    this.wakeWords = (voiceCfg.wakeWord?.words || []).map(tokens).filter((t) => t.length);
    this.phrases = [];
    for (const [action, list] of Object.entries(voiceCfg.commands || {})) {
      for (const phrase of list || []) {
        const t = tokens(phrase);
        if (t.length) this.phrases.push({ action, tokens: t });
      }
    }
    this.phrases.sort((a, b) => b.tokens.length - a.tokens.length);
  }

  /**
   * @param {string} text
   * @param {{wakeActive?: boolean}} opts wakeActive: la palabra de activación se dijo hace poco
   * @returns {{wake:boolean, action:string|null, arg:any, phrase:string, rest:string, words:number}}
   */
  match(text, { wakeActive = false } = {}) {
    const t = tokens(text);
    let wakeIdx = -1;
    let wakeEnd = 0;
    for (const w of this.wakeWords) {
      const i = findPhrase(t, w);
      if (i >= 0 && (wakeIdx < 0 || i < wakeIdx)) {
        wakeIdx = i;
        wakeEnd = i + w.length;
      }
    }
    const wake = wakeIdx >= 0;
    const from = wake ? wakeEnd : 0;
    const restTokens = t.slice(from);
    const base = { wake, action: null, arg: null, phrase: '', rest: restTokens.join(' '), words: restTokens.length };
    if (this.wakeEnabled && !wake && !wakeActive) return base;
    const to = wake || wakeActive ? Math.min(t.length, from + WINDOW_WORDS) : t.length;

    for (let i = from; i < to - 1; i++) {
      if (SCENE_WORDS.has(t[i])) {
        const n = parseNumber(t[i + 1]);
        if (n) return { ...base, action: 'GOTO', arg: n, phrase: `${t[i]} ${t[i + 1]}` };
      }
    }
    let best = null;
    for (const p of this.phrases) {
      if (best && p.tokens.length < best.p.tokens.length) break;
      const i = findPhrase(t, p.tokens, from, to);
      if (i >= 0 && (!best || i < best.i)) best = { p, i };
    }
    if (!best) return base;
    return { ...base, action: best.p.action, phrase: best.p.tokens.join(' ') };
  }
}
