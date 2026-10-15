/**
 * Decide cuándo un gesto es intencional (sin cámara ni MediaPipe, para poder
 * probarlo). Problema que resuelve: al hablar se mueven las manos y los gestos
 * se disparaban solos.
 *
 * Reglas:
 * 1. Cada mano se analiza por separado (izquierda y derecha) y cada una tiene su
 *    propia acción: por defecto puño derecho = siguiente, puño izquierdo = anterior.
 * 2. El tiempo de sostenido solo corre mientras la mano está QUIETA: si la palma
 *    se desplaza más que `stillness` (fracción del encuadre), el reloj vuelve a cero.
 * 3. Parpadeos de la clasificación de hasta `graceMs` no reinician el gesto.
 * 4. Después de disparar, hay que soltar el gesto (cambiar de forma o bajar la
 *    mano) para volver a disparar, y hay un enfriamiento global de `cooldownMs`.
 * 5. Los swipes (si se activan) también respetan el enfriamiento.
 */
export const HANDS = ['Right', 'Left'];

export class GestureLogic {
  constructor(cfg) {
    this.cfg = cfg;
    this.holds = {};
    this.tracks = {};
    this.cooldownUntil = 0;
    this.swipeBlockUntil = 0;
  }

  configure(cfg) {
    this.cfg = cfg;
  }

  /** Acción configurada para un gesto de una mano ("Right" | "Left"). */
  actionFor(gesture, hand) {
    const entry = this.cfg.map?.[gesture];
    if (!entry) return 'NONE';
    if (typeof entry === 'string') return entry;
    return entry[hand] || 'NONE';
  }

  /**
   * Procesa un cuadro.
   * @param {Array<{hand:string, gesture:string, score:number, cx:number, cy:number}>} hands
   *   manos ya filtradas (zona activa y mano permitida); cx, cy en 0–1.
   * @param {number} now tiempo en ms
   * @returns {{events: Array<{action:string, gesture:string, hand:string, confidence:number}>,
   *            progress: Array<{hand:string, gesture:string, action:string, p:number, still:boolean}>,
   *            detected: Array<{gesture:string, hand:string, action:string}>}}
   */
  update(hands, now) {
    const out = { events: [], progress: [], detected: [] };
    const seen = new Set();
    for (const h of hands) {
      const side = HANDS.includes(h.hand) ? h.hand : 'Right';
      if (seen.has(side)) continue;
      seen.add(side);
      this.updateHold(side, h, now, out);
      this.updateSwipe(side, h, now, out);
    }
    for (const side of Object.keys(this.holds)) {
      if (!seen.has(side)) this.updateHold(side, null, now, out);
    }
    for (const side of Object.keys(this.tracks)) {
      if (!seen.has(side)) delete this.tracks[side];
    }
    return out;
  }

  updateHold(side, h, now, out) {
    const cfg = this.cfg;
    const gesture = h && h.score >= cfg.minConfidence ? h.gesture : 'None';
    let st = this.holds[side];

    if (!st || st.gesture !== gesture) {
      // Parpadeo corto de la clasificación: se ignora este cuadro.
      if (st && st.gesture !== 'None' && now - st.lastMatch <= (cfg.graceMs ?? 250)) return;
      st = this.holds[side] = {
        gesture,
        start: now,
        anchor: h ? { x: h.cx, y: h.cy } : null,
        lastMatch: now,
        fired: false,
        still: true,
      };
      if (gesture === 'None') return;
    } else {
      st.lastMatch = now;
      if (h && st.anchor) {
        const moved = Math.hypot(h.cx - st.anchor.x, h.cy - st.anchor.y);
        if (moved > cfg.stillness) {
          // La mano se movió: es parte de la conversación, no un gesto. Se reinicia.
          st.start = now;
          st.anchor = { x: h.cx, y: h.cy };
          st.still = false;
        } else {
          st.still = true;
        }
      }
    }

    if (gesture === 'None' || st.fired) return;
    const action = this.actionFor(gesture, side);
    if (!action || action === 'NONE') return;
    const need = cfg.holdMs?.[gesture] ?? 1000;
    const p = Math.min(1, (now - st.start) / need);
    out.progress.push({ hand: side, gesture, action, p, still: st.still });
    if (p >= 1 && now >= this.cooldownUntil) {
      st.fired = true;
      this.cooldownUntil = now + (cfg.cooldownMs ?? 2000);
      out.events.push({ action, gesture, hand: side, confidence: h.score });
      out.detected.push({ gesture, hand: side, action });
    }
  }

  updateSwipe(side, h, now, out) {
    const sw = this.cfg.swipe;
    if (!sw?.enabled) return;
    const track = (this.tracks[side] ||= []);
    track.push({ x: h.cx, y: h.cy, t: now });
    while (track.length && now - track[0].t > sw.maxDurationMs) track.shift();
    if (track.length < 3 || now < this.swipeBlockUntil || now < this.cooldownUntil) return;
    const dx = h.cx - track[0].x;
    const dy = h.cy - track[0].y;
    if (Math.abs(dx) < sw.minDistance || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    const gesture = dx < 0 ? 'swipe_left' : 'swipe_right';
    const action = this.actionFor(gesture, side);
    track.length = 0;
    this.swipeBlockUntil = now + 700;
    if (this.holds[side]) this.holds[side].fired = true;
    out.detected.push({ gesture, hand: side, action });
    if (action && action !== 'NONE') {
      this.cooldownUntil = now + (this.cfg.cooldownMs ?? 2000);
      out.events.push({ action, gesture, hand: side, confidence: Math.min(1, (Math.abs(dx) / sw.minDistance) * 0.8) });
    }
  }
}
