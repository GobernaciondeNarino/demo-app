/**
 * Sincronización en vivo entre presentación, panel y vista de presentador.
 *
 * - Servidor (PHP): consulta periódica a routes/sync.php (~1 s). En hosting
 *   compartido no se pueden mantener WebSockets, así que se usa HTTP. Sirve
 *   entre dispositivos (p. ej. vista de presentador en el celular).
 * - Mismo navegador: BroadcastChannel, instantáneo (presentación ↔ vista de
 *   presentador ↔ panel abiertos en el mismo computador).
 *
 * Eventos emitidos: "config" (nueva configuración), "event" (comando/registro),
 * "state" (estado de la presentación), "status" ({online, error}).
 */
export class LiveSync extends EventTarget {
  /**
   * @param {import('./Api.js').Api} api
   * @param {{role:'presentation'|'admin'|'presenter', intervalMs?:number, collect?:Function}} opts
   *   collect(): datos a publicar en cada consulta (solo la presentación).
   */
  constructor(api, { role, intervalMs = 1000, collect = null }) {
    super();
    this.api = api;
    this.role = role;
    this.intervalMs = intervalMs;
    this.collect = collect;
    this.since = -1;
    this.configVersion = 0;
    this.online = null;
    this.running = false;
    this.timer = null;
    const scope = new URL('.', api.base).pathname.replace(/wj-admin\/routes\/$/, '');
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(`wj-live:${scope}`) : null;
    this.channel?.addEventListener('message', (e) => this.onLocal(e.data));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
  }

  setInterval(ms) {
    this.intervalMs = ms;
  }

  /** Fuerza una consulta inmediata (p. ej. tras guardar en el panel). */
  now() {
    clearTimeout(this.timer);
    if (this.running && !this.inFlight) this.poll();
  }

  async poll() {
    if (!this.running) return;
    this.inFlight = true;
    const body = { role: this.role, since: this.since, configVersion: this.configVersion };
    if (this.collect) Object.assign(body, this.collect());
    try {
      const r = await this.api.post('sync', body, { timeoutMs: 8000 });
      this.setOnline(true);
      if (r.config) {
        this.configVersion = r.configVersion;
        this.dispatchEvent(new CustomEvent('config', { detail: { config: r.config, version: r.configVersion } }));
      }
      for (const ev of r.events || []) this.dispatchEvent(new CustomEvent('event', { detail: { ...ev, via: 'server' } }));
      this.since = r.lastId;
      if ('state' in r) this.dispatchEvent(new CustomEvent('state', { detail: { state: r.state, age: r.stateAge, via: 'server' } }));
      if (r.sessionExpires) this.sessionExpires = r.sessionExpires;
    } catch (err) {
      this.setOnline(false, err.message, err.status);
    } finally {
      this.inFlight = false;
      if (this.running) {
        const wait = this.online ? this.intervalMs : Math.min(5000, this.intervalMs * 3);
        this.timer = setTimeout(() => this.poll(), document.hidden && this.role !== 'presentation' ? Math.max(wait, 4000) : wait);
      }
    }
  }

  setOnline(online, error = '', status = 0) {
    if (online !== this.online || error !== this.lastError) {
      this.online = online;
      this.lastError = error;
      this.dispatchEvent(new CustomEvent('status', { detail: { online, error, status } }));
    }
  }

  /** Publica por el canal local (mismo navegador). */
  broadcast(message) {
    try {
      this.channel?.postMessage(message);
    } catch { /* objeto no clonable */ }
  }

  onLocal(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'state' && this.role !== 'presentation') {
      this.dispatchEvent(new CustomEvent('state', { detail: { state: msg.state, age: 0, via: 'local' } }));
    } else if (msg.type === 'cmd' && this.role === 'presentation') {
      this.dispatchEvent(new CustomEvent('event', { detail: { channel: 'cmd', payload: msg.cmd, via: 'local' } }));
    } else if (msg.type === 'log' && this.role === 'admin') {
      this.dispatchEvent(new CustomEvent('event', { detail: { channel: 'log', payload: msg.log, via: 'local' } }));
    } else if (msg.type === 'config-saved') {
      this.now();
    }
  }

  /** Envía un comando remoto a la presentación por ambas vías. */
  async command(action, arg = null, source = this.role === 'presenter' ? 'presenter' : 'admin') {
    const cid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    this.broadcast({ type: 'cmd', cmd: { action, arg, source, cid } });
    return this.api.command(action, arg, source, cid);
  }
}
