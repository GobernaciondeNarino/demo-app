/**
 * CommandBus: único punto por el que pasa todo control de la presentación.
 *
 * Voz, gestos, AirPods, teclado y comandos remotos producen el mismo objeto
 * { action, arg, source, confidence } y obtienen exactamente el mismo efecto.
 *
 * - Cooldown global (por defecto 1,2 s): un gesto y una palabra casi
 *   simultáneos no saltan dos escenas.
 * - Durante una transición, los comandos de navegación se encolan (máx. 1).
 * - Cada comando queda en el registro (fuente, acción, confianza, resultado),
 *   que se envía al monitor del panel.
 */
import { randomId } from './text.js';

export const ACTION_LABELS = {
  NEXT: 'Siguiente',
  PREV: 'Anterior',
  REPEAT: 'Repetir',
  PAUSE: 'Pausa',
  RESUME: 'Reanudar',
  TOGGLE_PAUSE: 'Pausa / reanudar',
  FORCE_NEXT: 'Continuar igual',
  NARRATE: 'Narrar',
  BLACK: 'Pantalla negra',
  MUTE_VOICE: 'Silenciar voz',
  TOGGLE_HUD: 'Mostrar/ocultar HUD',
  FULLSCREEN: 'Pantalla completa',
  GOTO: 'Ir a escena',
  TIMER_START: 'Iniciar cronómetro',
  TIMER_RESET: 'Reiniciar cronómetro',
  END_SESSION: 'Finalizar ensayo',
  FACT_COVERED: 'Marcar dato',
  RELOAD_AUDIO: 'Recargar audios',
  UNKNOWN: 'No entendido',
  NONE: 'Ninguna',
};

export const SOURCE_LABELS = {
  voice: 'voz',
  gesture: 'gesto',
  media: 'AirPods',
  keyboard: 'teclado',
  admin: 'panel',
  presenter: 'presentador',
  system: 'sistema',
};

/** Acciones que mueven la presentación: se encolan durante una transición. */
const NAV_ACTIONS = new Set(['NEXT', 'PREV', 'REPEAT', 'FORCE_NEXT', 'GOTO']);
/** Acciones que no consumen el cooldown (interfaz y gestión). */
const FREE_ACTIONS = new Set(['TOGGLE_HUD', 'FULLSCREEN', 'TIMER_START', 'TIMER_RESET', 'END_SESSION', 'FACT_COVERED', 'RELOAD_AUDIO', 'MUTE_VOICE']);

export class CommandBus extends EventTarget {
  constructor({ cooldownMs = 1200 } = {}) {
    super();
    this.cooldownMs = cooldownMs;
    this.lastAt = -Infinity;
    this.handler = async () => ({ status: 'ignored' });
    this.isBusy = () => false;
    this.queued = null;
    this.seen = new Map();
    this.log = [];
  }

  setHandler(fn) { this.handler = fn; }
  setBusyCheck(fn) { this.isBusy = fn; }
  setCooldown(ms) { this.cooldownMs = ms; }

  /**
   * @param {{action:string, arg?:any, source:string, confidence?:number, id?:string, bypassCooldown?:boolean}} input
   */
  async dispatch(input) {
    const cmd = {
      id: input.id || randomId('c'),
      action: input.action,
      arg: input.arg ?? null,
      source: input.source || 'system',
      confidence: typeof input.confidence === 'number' ? input.confidence : 1,
      ts: Date.now(),
      meta: input.meta || null,
    };
    if (!cmd.action || cmd.action === 'NONE') return { status: 'ignored' };

    // Un mismo comando remoto puede llegar por dos vías (servidor y BroadcastChannel).
    if (this.seen.has(cmd.id)) return { status: 'duplicate' };
    this.seen.set(cmd.id, cmd.ts);
    if (this.seen.size > 300) {
      for (const key of [...this.seen.keys()].slice(0, 100)) this.seen.delete(key);
    }

    const now = performance.now();
    const free = FREE_ACTIONS.has(cmd.action);
    if (!free && !input.bypassCooldown && now - this.lastAt < this.cooldownMs) {
      return this.record(cmd, 'cooldown', `${Math.round(now - this.lastAt)} ms desde el anterior`);
    }
    if (NAV_ACTIONS.has(cmd.action) && this.isBusy()) {
      this.queued = cmd;
      this.lastAt = now;
      return this.record(cmd, 'queued', 'transición en curso');
    }
    if (!free) this.lastAt = now;

    let result;
    try {
      result = (await this.handler(cmd)) || { status: 'ok' };
    } catch (err) {
      console.error(err);
      result = { status: 'error', detail: err.message };
    }
    return this.record(cmd, result.status || 'ok', result.detail);
  }

  /** Ejecuta el comando encolado (se llama al terminar una transición). */
  flushQueue() {
    if (!this.queued) return;
    const cmd = this.queued;
    this.queued = null;
    this.dispatch({ ...cmd, id: `${cmd.id}-q`, bypassCooldown: true });
  }

  record(cmd, status, detail = '') {
    const entry = {
      t: cmd.ts,
      action: cmd.action,
      arg: cmd.arg,
      source: cmd.source,
      confidence: Math.round(cmd.confidence * 100) / 100,
      status,
      detail: detail ? String(detail).slice(0, 200) : '',
    };
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
    this.dispatchEvent(new CustomEvent('log', { detail: entry }));
    return { status, detail };
  }
}
