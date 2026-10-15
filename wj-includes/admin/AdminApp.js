/**
 * Panel admin: acceso con usuario y contraseña, edición de la configuración
 * (borrador → Guardar), pregeneración de audios y monitor en vivo.
 * Todo cambio guardado llega a la presentación abierta sin recargarla.
 */
import { Api } from '../core/Api.js';
import { LiveSync } from '../core/LiveSync.js';
import { collectPhrases } from '../core/phrases.js';
import { h, clear, toast } from '../ui/dom.js';
import { Fields } from './fields.js';
import { SECTIONS } from './sections/index.js';

const ROOT = new URL('../../', import.meta.url);
export const resolveUrl = (u) => new URL(u, ROOT).toString();

class AdminApp {
  constructor(root) {
    this.root = root;
    this.api = new Api(resolveUrl('wj-admin/routes/'));
    this.saved = null;
    this.draft = null;
    this.dirty = false;
    this.section = (location.hash || '#apis').slice(1);
    this.liveListeners = new Set();
    this.logBuffer = [];
    this.fields = new Fields(() => this.draft, (path) => this.markDirty(path));
  }

  async boot() {
    let s;
    try {
      s = await this.api.session();
    } catch (err) {
      this.root.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth' },
        h('h1', {}, 'Sin conexión'), h('p', {}, err.message),
        h('button', { class: 'btn btn-primary', onclick: () => this.boot() }, 'Reintentar'))));
      return;
    }
    this.session = s;
    if (s.needsSetup) return this.renderSetup();
    if (!s.authenticated) return this.renderLogin();
    this.api.onAuthLost = () => {
      toast('La sesión expiró. Inicie sesión de nuevo.', 'error');
      setTimeout(() => location.reload(), 1500);
    };
    await this.loadConfig();
    this.renderShell();
    this.startSync();
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ------------------------------------------------------------ */
  /* Acceso                                                        */
  /* ------------------------------------------------------------ */

  authCard(title, intro, fields, submitLabel, onSubmit) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, submitLabel);
    const form = h('form', { class: 'card auth', autocomplete: 'on' },
      h('div', { class: 'auth-brand' }, h('span', { class: 'brand-stripe' }), 'Gobernación de Nariño'),
      h('h1', {}, title),
      intro ? h('p', { class: 'muted' }, intro) : null,
      ...fields,
      err,
      btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        await onSubmit(new FormData(form));
        location.reload();
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
    this.root.replaceChildren(h('div', { class: 'auth-wrap' }, form));
    form.querySelector('input')?.focus();
  }

  renderLogin() {
    this.authCard('Panel de la presentación', 'Ingrese con su usuario administrador.', [
      h('label', { class: 'field' }, 'Usuario', h('input', { name: 'username', autocomplete: 'username', required: true })),
      h('label', { class: 'field' }, 'Contraseña', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
      h('p', { class: 'hint' }, 'Por seguridad, tras 5 intentos fallidos el acceso se bloquea 15 minutos.'),
    ], 'Iniciar sesión', (f) => this.api.login(String(f.get('username')), String(f.get('password'))));
  }

  renderSetup() {
    this.authCard('Crear administrador', null, [
      h('div', { class: 'callout' },
        h('strong', {}, 'Primera ejecución. '),
        'Para confirmar que usted administra el hosting, copie el código de instalación que aparece en el archivo ',
        h('code', {}, 'wj-content/data/keys.php'),
        ' (Plesk › Administrador de archivos › abrir el archivo). También puede definir ADMIN_USER y ADMIN_PASSWORD en un archivo .env.'),
      h('label', { class: 'field' }, 'Código de instalación', h('input', { name: 'code', required: true, autocomplete: 'off', placeholder: 'XXXX-XXXX-XXXX', spellcheck: false })),
      h('label', { class: 'field' }, 'Usuario', h('input', { name: 'username', autocomplete: 'username', required: true, minlength: 3 })),
      h('label', { class: 'field' }, 'Contraseña (mínimo 10 caracteres)', h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 })),
      h('label', { class: 'field' }, 'Repita la contraseña', h('input', { name: 'password2', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 })),
    ], 'Crear y entrar', (f) => {
      if (f.get('password') !== f.get('password2')) throw new Error('Las contraseñas no coinciden.');
      return this.api.setup(String(f.get('code')), String(f.get('username')), String(f.get('password')));
    });
  }

  /* ------------------------------------------------------------ */
  /* Configuración                                                 */
  /* ------------------------------------------------------------ */

  async loadConfig() {
    const r = await this.api.get('config');
    this.saved = r.config;
    this.defaults = r.defaults;
    this.secrets = r.secrets;
    this.version = r.version;
    this.draft = structuredClone(r.config);
    this.dirty = false;
  }

  markDirty() {
    this.dirty = true;
    this.saveBar?.classList.add('is-dirty');
    this.saveMsg.textContent = 'Cambios sin guardar';
    for (const fn of this.draftListeners || []) fn(this.draft);
  }

  onDraftChange(fn) {
    (this.draftListeners ||= new Set()).add(fn);
    return () => this.draftListeners.delete(fn);
  }

  async save() {
    this.saveBtn.disabled = true;
    this.saveMsg.textContent = 'Guardando…';
    try {
      const r = await this.api.post('config', { action: 'save', config: this.draft });
      this.saved = r.config;
      this.version = r.version;
      this.draft = structuredClone(r.config);
      this.dirty = false;
      this.saveBar.classList.remove('is-dirty');
      this.saveMsg.textContent = 'Guardado. La presentación se actualiza en vivo.';
      this.sync?.broadcast({ type: 'config-saved' });
      toast('Configuración guardada', 'ok');
      this.renderSection();
      this.pregenerate();
    } catch (err) {
      this.saveMsg.textContent = err.message;
      toast(err.message, 'error', 6000);
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  discard() {
    if (!this.dirty || !confirm('¿Descartar los cambios sin guardar?')) return;
    this.draft = structuredClone(this.saved);
    this.dirty = false;
    this.saveBar.classList.remove('is-dirty');
    this.saveMsg.textContent = 'Sin cambios';
    this.renderSection();
  }

  get ttsReady() {
    return this.secrets?.elevenlabs_api_key?.set && !!this.saved?.tts?.voiceId;
  }

  /** Genera en ElevenLabs los audios que falten (o todos con force). */
  async pregenerate({ force = false } = {}) {
    if (!this.ttsReady) {
      if (force) toast('Configure primero la llave de ElevenLabs y elija una voz (sección APIs).', 'error', 6000);
      return;
    }
    const items = collectPhrases(this.saved);
    if (!items.length) return;
    const run = (this.pregenRun = (this.pregenRun || 0) + 1);
    let done = 0;
    let created = 0;
    const errors = [];
    this.saveProgress.hidden = false;
    for (const item of items) {
      if (run !== this.pregenRun) return;
      this.saveProgress.value = done / items.length;
      this.saveMsg.textContent = `Generando audios con ElevenLabs… ${done}/${items.length}`;
      try {
        const r = await this.api.post('tts', { text: item.text, mode: 'ensure', force }, { timeoutMs: 45000 });
        if (!r.cached) created++;
      } catch (err) {
        errors.push(err.message);
        if (err.status === 409 || err.status === 401) break;
      }
      done++;
    }
    this.saveProgress.hidden = true;
    this.saveMsg.textContent = errors.length
      ? `Audios: ${done - errors.length}/${items.length} listos. Error: ${errors[0]}`
      : `Audios listos (${items.length}; ${created} nuevos).`;
    if (created || force) this.sync?.command('RELOAD_AUDIO').catch(() => {});
  }

  /* ------------------------------------------------------------ */
  /* Interfaz                                                      */
  /* ------------------------------------------------------------ */

  renderShell() {
    this.nav = h('nav', { class: 'sidenav', 'aria-label': 'Secciones' },
      SECTIONS.map((s) => h('a', { href: `#${s.id}`, dataset: { id: s.id } }, s.title)));
    this.content = h('main', { class: 'content', id: 'content', tabindex: '-1' });
    this.saveMsg = h('span', { class: 'save-msg', role: 'status' }, 'Sin cambios');
    this.saveProgress = h('progress', { max: 1, value: 0, hidden: true });
    this.saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.save() }, 'Guardar cambios');
    this.saveBar = h('div', { class: 'savebar' },
      this.saveMsg, this.saveProgress,
      h('div', { class: 'savebar-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.discard() }, 'Descartar'),
        this.saveBtn));
    this.liveDot = h('span', { class: 'live-dot', title: 'Presentación: sin datos' });

    this.root.replaceChildren(
      h('header', { class: 'topbar' },
        h('div', { class: 'topbar-brand' },
          h('span', { class: 'brand-stripe' }),
          h('div', {}, h('small', {}, 'Gobernación de Nariño'), h('strong', {}, 'Panel de la presentación'))),
        h('div', { class: 'topbar-links' },
          this.liveDot,
          h('a', { href: resolveUrl('index.html'), target: '_blank', rel: 'noopener' }, 'Abrir presentación'),
          h('a', { href: resolveUrl('presentador.html'), target: '_blank', rel: 'noopener' }, 'Vista de presentador'),
          h('span', { class: 'user' }, this.session.user.username),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => this.logout() }, 'Salir'))),
      h('div', { class: 'layout' }, this.nav, h('div', { class: 'main-col' }, this.content, this.saveBar)));
    window.addEventListener('hashchange', () => {
      this.section = location.hash.slice(1);
      this.renderSection();
    });
    this.renderSection();
  }

  async logout() {
    if (this.dirty && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return;
    this.dirty = false;
    await this.api.logout().catch(() => {});
    location.reload();
  }

  ctx() {
    return {
      app: this,
      api: this.api,
      f: this.fields,
      draft: this.draft,
      saved: this.saved,
      defaults: this.defaults,
      secrets: this.secrets,
      sync: this.sync,
      resolveUrl,
      markDirty: () => this.markDirty(),
      rerender: () => this.renderSection(),
      onLive: (fn) => {
        this.liveListeners.add(fn);
        for (const log of this.logBuffer) fn({ log, via: 'buffer' });
        if (this.lastLive) fn(this.lastLive);
        return () => this.liveListeners.delete(fn);
      },
      onDraftChange: (fn) => this.onDraftChange(fn),
    };
  }

  renderSection() {
    const section = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];
    this.section = section.id;
    this.cleanup?.();
    this.cleanup = null;
    this.liveListeners.clear();
    this.draftListeners?.clear();
    for (const a of this.nav.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.id === section.id ? 'page' : 'false');
    clear(this.content);
    const body = section.render(this.ctx());
    this.cleanup = body?.cleanup || null;
    this.content.append(
      h('header', { class: 'section-head' }, h('h1', {}, section.title), section.intro ? h('p', { class: 'muted' }, section.intro) : null),
      body?.el || body);
    this.content.scrollTop = 0;
    document.title = `${section.title} · Panel de la presentación`;
  }

  startSync() {
    this.sync = new LiveSync(this.api, { role: 'admin', intervalMs: 1000 });
    this.sync.addEventListener('state', (e) => {
      const live = { state: e.detail.state, age: e.detail.age, receivedAt: Date.now(), via: e.detail.via };
      if (this.lastLive?.state && live.state && live.via === 'server' && live.state.t < this.lastLive.state.t) return;
      this.lastLive = live;
      const fresh = live.state && (live.via === 'local' || (live.age ?? 99) < 5);
      this.liveDot.dataset.state = fresh ? 'on' : 'off';
      this.liveDot.title = fresh ? 'Presentación conectada' : 'Presentación no conectada';
      for (const fn of this.liveListeners) fn(live);
    });
    this.sync.addEventListener('event', (e) => {
      if (e.detail.channel === 'log') {
        this.logBuffer.push(e.detail.payload);
        if (this.logBuffer.length > 150) this.logBuffer.shift();
        for (const fn of this.liveListeners) fn({ log: e.detail.payload, via: e.detail.via });
      }
      if (e.detail.channel === 'notice' && e.detail.payload?.type === 'config' && e.detail.payload.version > this.version && !this.dirty) {
        this.loadConfig().then(() => this.renderSection());
      }
    });
    this.sync.configVersion = this.version;
    this.sync.start();
  }
}

new AdminApp(document.getElementById('admin')).boot();
