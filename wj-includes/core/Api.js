/**
 * Cliente HTTP del backend PHP (wj-admin/routes/*.php).
 * Todas las rutas son relativas para que la app funcione en cualquier subcarpeta.
 */
export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class Api {
  /** @param {string} routesUrl ruta (relativa a la página) de wj-admin/routes/ */
  constructor(routesUrl) {
    this.base = new URL(routesUrl, location.href);
    this.csrf = null;
    this.onAuthLost = null;
  }

  url(name, query) {
    const u = new URL(`${name}.php`, this.base);
    if (query) for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u.toString();
  }

  async request(name, { method = 'GET', body, query, timeoutMs = 15000, raw = false } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && this.csrf) headers['X-CSRF-Token'] = this.csrf;
    try {
      const res = await fetch(this.url(name, query), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (raw && res.ok) return res;
      const data = await res.json().catch(() => ({ ok: false, error: `Respuesta inválida del servidor (HTTP ${res.status}).` }));
      if (res.status === 401 && this.onAuthLost) this.onAuthLost();
      if (!res.ok || data.ok === false) {
        throw new ApiError(data.error || data.message || `Error HTTP ${res.status}`, res.status, data);
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new ApiError('Tiempo de espera agotado.', 0);
      if (err instanceof ApiError) throw err;
      throw new ApiError('Sin conexión con el servidor.', 0);
    } finally {
      clearTimeout(timer);
    }
  }

  get(name, query, opts = {}) {
    return this.request(name, { ...opts, query });
  }

  post(name, body = {}, opts = {}) {
    return this.request(name, { ...opts, method: 'POST', body });
  }

  async session() {
    const s = await this.get('session');
    this.csrf = s.csrf || null;
    return s;
  }

  async login(username, password) {
    const r = await this.post('session', { action: 'login', username, password });
    this.csrf = r.csrf;
    return r;
  }

  async setup(code, username, password) {
    const r = await this.post('session', { action: 'setup', code, username, password });
    this.csrf = r.csrf;
    return r;
  }

  async logout() {
    await this.post('session', { action: 'logout' });
    this.csrf = null;
  }

  /** Audio mp3 de ElevenLabs (desde la caché del servidor). */
  async tts(text, { timeoutMs = 20000 } = {}) {
    const res = await this.request('tts', { method: 'POST', body: { text }, timeoutMs, raw: true });
    return res.arrayBuffer();
  }

  /** Comando remoto hacia la presentación. */
  command(action, arg = null, source = 'admin', cid = null) {
    return this.post('sync', { action: 'command', command: { action, arg, source, cid } });
  }
}
