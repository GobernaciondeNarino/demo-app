/**
 * Presentación (pantalla del auditorio): conecta entradas, CommandBus,
 * escenas, voz, asistente de datos clave, cronómetros y sincronización.
 *
 *   Voz ─┐                                    ┌─► SceneManager (Three.js)
 *   Gestos ─┼─► CommandBus (cooldown, cola, log) ─┼─► VoiceResponder (ElevenLabs)
 *   AirPods ─┤                                    └─► HUD
 *   Teclado ─┘
 */
import { THREE } from './three.js';
import { Api } from './Api.js';
import { CommandBus } from './CommandBus.js';
import { SceneManager } from './SceneManager.js';
import { LiveSync } from './LiveSync.js';
import { FactsAssistant } from './FactsAssistant.js';
import { BlockTimer } from './BlockTimer.js';
import { randomId } from './text.js';
import { Hud } from '../output/Hud.js';
import { AudioOutputs } from '../output/AudioOutputs.js';
import { VoiceResponder } from '../output/VoiceResponder.js';
import { KeyboardInput } from '../inputs/KeyboardInput.js';
import { MediaKeysInput } from '../inputs/MediaKeysInput.js';
import { VoiceInput } from '../inputs/VoiceInput.js';
import { GestureInput } from '../inputs/GestureInput.js';

/** Raíz de la aplicación (carpeta que contiene index.html), sirve en cualquier subcarpeta. */
export const APP_ROOT = new URL('../../', import.meta.url);
export const resolveUrl = (u) => new URL(u, APP_ROOT).toString();

export class PresentationApp {
  constructor(dom) {
    this.dom = dom;
    this.clientId = randomId('p');
    this.api = new Api(resolveUrl('wj-admin/routes/'));
    this.bus = new CommandBus();
    this.pendingLogs = [];
    this.started = false;
    this.ended = false;
    this.paused = false;
    this.black = false;
    this.lastCommand = null;
    this.lastWarning = null;
    this.lastHeard = '';
    this.audioRoutes = null;
  }

  /* ------------------------------------------------------------ */
  /* Arranque                                                      */
  /* ------------------------------------------------------------ */

  async boot() {
    this.setupRenderer();
    this.hud = new Hud(this.dom.hud);
    this.setupModules();
    this.setupStartScreen();
    requestAnimationFrame((t) => this.loop(t));
    await this.connect();
  }

  setupRenderer() {
    const canvas = this.dom.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.sceneManager = new SceneManager(this.renderer, {
      domLayer: this.dom.webLayer,
      // Las teclas pulsadas dentro de una página incrustada también controlan la presentación.
      attachKeys: (win) => this.keyboard?.attach(win),
    });
    this.sceneManager.addEventListener('change', (e) => this.onSceneChange(e.detail));
    this.sceneManager.addEventListener('transitionend', (e) => this.onTransitionEnd(e.detail));
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.showStartMessage('Se perdió el contexto gráfico. Recargando…');
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    const resize = () => {
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.sceneManager.resize(window.innerWidth, window.innerHeight, pr);
    };
    window.addEventListener('resize', resize);
    resize();
  }

  setupModules() {
    const dispatch = (input) => this.bus.dispatch(input);
    this.bus.setHandler((cmd) => this.handleCommand(cmd));
    this.bus.setBusyCheck(() => this.sceneManager.isTransitioning || this.checkingFacts);
    this.bus.addEventListener('log', (e) => {
      this.pendingLogs.push(e.detail);
      if (this.pendingLogs.length > 100) this.pendingLogs.shift();
      this.sync?.broadcast({ type: 'log', log: e.detail });
      this.publishLocal();
    });

    this.outputs = new AudioOutputs();
    this.responder = new VoiceResponder(this.api, this.outputs);
    this.responder.addEventListener('progress', () => this.updateStartChecks());
    this.responder.addEventListener('speaking', (e) => {
      const ignoreAll = this.cfg?.voice.ignoreWhileSpeaking !== 'public';
      this.voice.setSpeaking(ignoreAll ? e.detail.speaking : e.detail.publicAudible);
    });

    this.facts = new FactsAssistant(this.api);
    this.facts.addEventListener('change', () => this.publishLocal());
    this.timer = new BlockTimer();
    this.timer.addEventListener('warning', (e) => this.onTimeWarning(e.detail));

    this.keyboard = new KeyboardInput(dispatch);
    this.keyboard.start();
    this.media = new MediaKeysInput(dispatch);
    this.media.addEventListener('status', (e) => this.hud.setStatus('pods', e.detail.status, e.detail.detail));
    this.voice = new VoiceInput({
      dispatch,
      api: this.api,
      getContext: () => ({ current: this.sceneManager.index + 1, total: this.sceneManager.count }),
    });
    this.voice.addEventListener('status', (e) => this.hud.setStatus('mic', e.detail.status, e.detail.detail));
    this.voice.addEventListener('transcript', (e) => this.facts.addTranscript(e.detail.text));
    this.voice.addEventListener('heard', (e) => { this.lastHeard = e.detail.text; });
    this.voice.addEventListener('unknown', (e) => {
      this.bus.record({ ts: Date.now(), action: 'UNKNOWN', arg: null, source: 'voice', confidence: 0 }, 'unknown', e.detail.text);
      this.responder.respond('UNKNOWN', 'voice');
    });
    this.gestures = new GestureInput({ dispatch, resolveUrl });
    this.gestures.addEventListener('status', (e) => this.hud.setStatus('cam', e.detail.status, e.detail.detail));
    this.gestures.addEventListener('progress', (e) => {
      this.gestureProgress = e.detail;
      this.hud.setGestureProgress(e.detail?.p || 0);
    });
    for (const k of ['mic', 'cam', 'pods']) this.hud.setStatus(k, 'off');
  }

  async connect() {
    let session;
    try {
      session = await this.api.session();
    } catch (err) {
      this.showStartMessage(`No hay conexión con el servidor. ${err.message}`, true);
      setTimeout(() => this.connect(), 4000);
      return;
    }
    if (session.needsSetup) {
      this.showStartMessage('Primero cree el usuario administrador en el panel.', true);
      this.dom.adminLink.classList.add('is-highlight');
      return;
    }
    if (!session.authenticated) {
      this.showLogin();
      return;
    }
    this.api.onAuthLost = () => this.hud.setStatus('net', 'error', 'sesión expirada');
    this.sync = new LiveSync(this.api, { role: 'presentation', intervalMs: 1000, collect: () => this.collectSync() });
    this.sync.addEventListener('config', (e) => this.applyConfig(e.detail.config));
    this.sync.addEventListener('event', (e) => this.onRemoteEvent(e.detail));
    this.sync.addEventListener('status', (e) => {
      this.hud.setStatus('net', e.detail.online ? 'on' : 'offline', e.detail.error);
      this.updateStartChecks();
    });
    this.showStartMessage('Cargando configuración…');
    this.sync.start();
  }

  /* ------------------------------------------------------------ */
  /* Configuración (se aplica en vivo)                             */
  /* ------------------------------------------------------------ */

  applyConfig(cfg) {
    const first = !this.cfg;
    const prev = this.cfg;
    this.cfg = cfg;
    this.blockNames = Object.fromEntries(cfg.blocks.map((b) => [b.id, b.name]));
    this.bus.setCooldown(cfg.general.cooldownMs);
    this.sync.setInterval(cfg.general.syncIntervalMs);
    if (first || prev.general.hudVisible !== cfg.general.hudVisible) this.hud.setVisible(cfg.general.hudVisible);
    this.sceneManager.configure(cfg, { resolveUrl });
    this.keyboard.configure(cfg.keyboard);
    this.media.configure(cfg.mediaKeys);
    this.media.meta = { title: cfg.general.title, artist: 'Gobernación de Nariño' };
    this.voice.configure(cfg.voice);
    this.gestures.configure(cfg.gestures);
    this.responder.configure(cfg);
    this.facts.configure(cfg);
    this.timer.configure(cfg.blocks, cfg.timing);
    const scene = this.sceneManager.current;
    if (first) this.facts.setScene(scene);
    this.timer.setBlock(scene.blockId);
    this.hud.setScene(this.sceneManager.index, this.sceneManager.count);
    if (this.started) {
      this.outputs.configure(cfg.audio, cfg.tts.volume).then((r) => { this.audioRoutes = r; });
    }
    document.title = cfg.general.title || 'Presentación IA';
    this.dom.startTitle.textContent = cfg.general.title || 'Presentación IA';
    if (first) this.showReady();
    this.publishLocal(true);
  }

  /* ------------------------------------------------------------ */
  /* Pantalla de inicio                                            */
  /* ------------------------------------------------------------ */

  setupStartScreen() {
    this.dom.startBtn.addEventListener('click', () => this.start());
    this.dom.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(this.dom.loginForm);
      const err = this.dom.loginForm.querySelector('.form-error');
      err.textContent = '';
      try {
        await this.api.login(String(f.get('username')), String(f.get('password')));
        this.dom.loginForm.hidden = true;
        await this.connect();
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
    this.updateStartChecks();
  }

  showLogin() {
    this.dom.loginForm.hidden = false;
    this.dom.startBtn.hidden = true;
    this.showStartMessage('Inicie sesión con el usuario del panel para usar la voz y la IA.');
    this.dom.loginForm.querySelector('input')?.focus();
  }

  showStartMessage(text, isError = false) {
    this.dom.startMsg.textContent = text;
    this.dom.startMsg.classList.toggle('is-error', isError);
  }

  showReady() {
    this.dom.startBtn.hidden = false;
    this.dom.startBtn.disabled = false;
    this.showStartMessage('');
    this.updateStartChecks();
    this.dom.startBtn.focus();
  }

  updateStartChecks() {
    const ul = this.dom.startChecks;
    if (!ul || this.started) return;
    const st = this.responder?.stats() || { loaded: 0, total: 0, failed: 0 };
    const checks = [
      ['Conexión con el servidor', this.sync?.online ? 'ok' : this.sync ? 'pending' : 'pending', this.sync?.online === false ? this.sync.lastError : ''],
      ['HTTPS / contexto seguro (cámara y micrófono)', window.isSecureContext ? 'ok' : 'error', window.isSecureContext ? '' : 'abra la página con https://'],
      ['Reconocimiento de voz (Chrome)', this.voice?.supported ? 'ok' : 'warn', this.voice?.supported ? '' : 'use Google Chrome de escritorio'],
      ['Voces de la IA precargadas', !st.total ? 'pending' : st.loaded === st.total ? 'ok' : st.failed ? 'warn' : 'pending',
        st.total ? `${st.loaded}/${st.total}${st.failed ? ` · ${st.failed} con error: ${this.responder.stats().lastError}` : ''}` : ''],
    ];
    const c = this.cfg;
    if (c && [c.reminders.output, c.timing.output, c.responses.output, c.narration.output].some((o) => o === 'discreet' || o === 'both')) {
      const ok = !!c.audio.discreetSinkLabel && this.outputs.supportsSink;
      checks.push(['Salida discreta (AirPods)', ok ? 'ok' : 'warn', ok ? c.audio.discreetSinkLabel
        : !this.outputs.supportsSink ? 'este navegador no permite elegir la salida de audio (use Chrome)'
          : 'sin configurar: lo «discreto» sonará por la salida predeterminada. Panel › Respuestas › Salidas de audio']);
    }
    ul.replaceChildren(...checks.map(([label, state, detail]) => {
      const li = document.createElement('li');
      li.dataset.state = state;
      li.textContent = label;
      if (detail) {
        const small = document.createElement('small');
        small.textContent = detail;
        li.append(small);
      }
      return li;
    }));
  }

  async start() {
    if (this.started) return;
    this.dom.startBtn.disabled = true;
    document.documentElement.requestFullscreen?.().catch(() => {});
    await this.outputs.unlock();
    this.audioRoutes = await this.outputs.configure(this.cfg.audio, this.cfg.tts.volume);
    this.started = true;
    this.dom.start.classList.add('is-hidden');
    document.body.classList.add('is-running');
    await this.media.start();
    this.voice.start();
    this.gestures.start();
    this.timer.start(this.sceneManager.current.blockId);
    this.sceneManager.setLive(true);
    this.responder.preload({ retryFailed: true });
    this.maybeNarrate();
    this.publishLocal(true);
  }

  /* ------------------------------------------------------------ */
  /* Comandos                                                      */
  /* ------------------------------------------------------------ */

  onRemoteEvent(ev) {
    if (ev.channel !== 'cmd' || !ev.payload) return;
    const p = ev.payload;
    this.bus.dispatch({ id: p.cid, action: p.action, arg: p.arg, source: p.source || 'admin', confidence: 1 });
  }

  async handleCommand(cmd) {
    this.lastCommand = { action: cmd.action, source: cmd.source, arg: cmd.arg, t: Date.now() };
    const needsStart = ['NEXT', 'PREV', 'FORCE_NEXT', 'GOTO', 'REPEAT', 'NARRATE', 'PAUSE', 'RESUME', 'TOGGLE_PAUSE'];
    if (!this.started && needsStart.includes(cmd.action)) {
      return { status: 'ignored', detail: 'la presentación no se ha iniciado' };
    }
    switch (cmd.action) {
      case 'NEXT': return this.navigate(1, cmd);
      case 'FORCE_NEXT': return this.navigate(1, cmd, { force: true });
      case 'PREV': return this.navigate(-1, cmd);
      case 'GOTO': return this.goto(cmd);
      case 'REPEAT': return this.repeat(cmd);
      case 'PAUSE': return this.setPaused(!this.paused, cmd);
      case 'RESUME': return this.setPaused(false, cmd);
      case 'TOGGLE_PAUSE': return this.setPaused(!this.paused, cmd);
      case 'NARRATE': return this.narrate(cmd);
      case 'BLACK': return this.setBlack(!this.black, cmd);
      case 'MUTE_VOICE':
        this.responder.setMuted(!this.responder.muted);
        this.hud.flash('MUTE_VOICE', cmd.source, this.responder.muted ? 'silenciada' : 'activa');
        return { status: 'ok', detail: this.responder.muted ? 'voz silenciada' : 'voz activa' };
      case 'TOGGLE_HUD':
        this.hud.toggle();
        return { status: 'ok' };
      case 'FULLSCREEN':
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
        return { status: 'ok' };
      case 'TIMER_START':
        this.timer.start(this.sceneManager.current.blockId);
        return { status: 'ok' };
      case 'TIMER_RESET':
        this.timer.reset();
        this.timer.start(this.sceneManager.current.blockId);
        this.ended = false;
        return { status: 'ok', detail: 'cronómetro reiniciado' };
      case 'END_SESSION':
        return this.endSession('manual');
      case 'FACT_COVERED':
        this.facts.markCovered(String(cmd.arg));
        return { status: 'ok' };
      case 'RELOAD_AUDIO':
        this.responder.preload({ retryFailed: true });
        return { status: 'ok' };
      default:
        return { status: 'ignored', detail: 'acción desconocida' };
    }
  }

  async navigate(delta, cmd, { force = false } = {}) {
    if (this.black) {
      this.setBlack(false);
      return { status: 'ok', detail: 'se quitó la pantalla negra' };
    }
    if (this.paused) this.setPaused(false, null);
    const sm = this.sceneManager;
    const target = sm.index + delta;
    if (target < 0) return { status: 'ignored', detail: 'ya está en la primera escena' };
    if (target >= sm.count) {
      await this.endSession('fin');
      return { status: 'end', detail: 'fin de la presentación' };
    }
    if (delta > 0 && !force) {
      this.checkingFacts = true;
      let check;
      try {
        check = await this.facts.checkBeforeAdvance(cmd.source);
      } finally {
        this.checkingFacts = false;
      }
      if (!check.ok) {
        this.playReminder(check.text);
        this.hud.flash('NEXT', cmd.source, 'recordatorio');
        return { status: 'reminder', detail: check.fact.text };
      }
    }
    this.responder.respond(cmd.action, cmd.source);
    this.hud.flash(cmd.action, cmd.source);
    sm.goTo(target, { direction: Math.sign(delta) });
    return { status: 'ok', detail: `escena ${target + 1}` };
  }

  goto(cmd) {
    const n = parseInt(cmd.arg, 10);
    const sm = this.sceneManager;
    if (!n || n < 1 || n > sm.count) return { status: 'ignored', detail: `no existe la escena ${cmd.arg}` };
    if (n - 1 === sm.index) return { status: 'ignored', detail: 'ya está en esa escena' };
    if (this.black) this.setBlack(false);
    if (this.paused) this.setPaused(false, null);
    this.hud.flash('GOTO', cmd.source, String(n));
    sm.goTo(n - 1);
    return { status: 'ok', detail: `escena ${n}` };
  }

  repeat(cmd) {
    if (this.black) this.setBlack(false);
    this.responder.respond('REPEAT', cmd.source);
    this.hud.flash('REPEAT', cmd.source);
    this.sceneManager.repeat();
    return { status: 'ok' };
  }

  setPaused(paused, cmd) {
    if (paused === this.paused) return { status: 'ignored' };
    this.paused = paused;
    this.sceneManager.setPaused(paused);
    this.hud.setPaused(paused);
    if (paused) this.timer.pause();
    else this.timer.resume();
    if (cmd) {
      this.responder.respond(paused ? 'PAUSE' : 'RESUME', cmd.source);
      this.hud.flash(paused ? 'PAUSE' : 'RESUME', cmd.source);
    }
    this.publishLocal(true);
    return { status: 'ok', detail: paused ? 'en pausa' : 'reanudado' };
  }

  setBlack(black, cmd = null) {
    this.black = black;
    this.dom.black.classList.toggle('is-on', black);
    if (cmd) this.hud.flash('BLACK', cmd.source, black ? 'activada' : 'desactivada');
    this.publishLocal(true);
    return { status: 'ok', detail: black ? 'pantalla negra' : 'pantalla visible' };
  }

  narrate(cmd) {
    const n = this.sceneManager.current?.narration;
    if (!n?.text || n.mode === 'off') return { status: 'ignored', detail: 'esta escena no tiene narración' };
    this.hud.flash('NARRATE', cmd.source);
    this.responder.speak(n.text, this.cfg.narration.output);
    return { status: 'ok' };
  }

  maybeNarrate() {
    const scene = this.sceneManager.current;
    if (!this.started || scene?.narration?.mode !== 'auto' || !scene.narration.text) return;
    clearTimeout(this.narrateTimer);
    this.narrateTimer = setTimeout(() => {
      if (this.sceneManager.current?.id === scene.id && !this.paused) {
        this.responder.speak(scene.narration.text, this.cfg.narration.output, { interrupt: false });
      }
    }, this.cfg.narration.delayMs);
  }

  playReminder(text) {
    const out = this.cfg.reminders.output;
    if (out !== 'text') this.responder.speak(text, out);
    this.publishLocal(true);
  }

  onTimeWarning({ kind, block }) {
    const text = this.cfg.timing[kind];
    this.lastWarning = { kind, text, block: block.name, t: Date.now() };
    const out = this.cfg.timing.output;
    if (out !== 'text') this.responder.speak(text, out, { interrupt: false });
    this.publishLocal(true);
  }

  async endSession(reason) {
    if (this.ended) return { status: 'ignored', detail: 'el ensayo ya terminó' };
    const summary = this.timer.end();
    this.ended = true;
    this.hud.flash('END_SESSION', 'system', reason === 'fin' ? 'fin' : 'guardado');
    this.publishLocal(true);
    if (!summary) return { status: 'ok' };
    try {
      await this.api.post('rehearsal', {
        action: 'save',
        summary: { ...summary, reason, title: this.cfg.general.title },
        transcript: this.cfg.reminders.saveTranscripts ? this.facts.takeSessionTranscript() : undefined,
      });
      return { status: 'ok', detail: 'resumen del ensayo guardado' };
    } catch (err) {
      return { status: 'error', detail: `no se pudo guardar el resumen: ${err.message}` };
    }
  }

  /* ------------------------------------------------------------ */
  /* Escenas                                                       */
  /* ------------------------------------------------------------ */

  onSceneChange({ index }) {
    const scene = this.sceneManager.sceneCfgs[index];
    clearTimeout(this.narrateTimer);
    this.facts.setScene(scene);
    this.timer.setBlock(scene.blockId);
    this.hud.setScene(index, this.sceneManager.count);
    this.publishLocal(true);
  }

  onTransitionEnd() {
    this.bus.flushQueue();
    this.maybeNarrate();
    this.publishLocal(true);
  }

  /* ------------------------------------------------------------ */
  /* Estado publicado (monitor del panel y vista de presentador)   */
  /* ------------------------------------------------------------ */

  buildState() {
    const sm = this.sceneManager;
    const cur = sm.current;
    const next = sm.sceneCfgs[sm.index + 1];
    const prev = sm.sceneCfgs[sm.index - 1];
    return {
      clientId: this.clientId,
      t: Date.now(),
      started: this.started,
      ended: this.ended,
      index: sm.index,
      total: sm.count,
      scene: cur ? {
        id: cur.id, title: cur.title, subtitle: cur.subtitle, color: cur.color, blockId: cur.blockId,
        blockName: this.blockNames?.[cur.blockId] || '', notes: cur.notes,
        narration: cur.narration?.mode !== 'off' ? cur.narration : null,
        media: sm.currentInstance?.mediaStatus() || null,
      } : null,
      next: next ? { title: next.title, color: next.color } : null,
      prev: prev ? { title: prev.title, color: prev.color } : null,
      paused: this.paused,
      black: this.black,
      muted: this.responder.muted,
      transitioning: sm.isTransitioning,
      hud: this.hud.visible,
      inputs: {
        voice: { status: this.voice.status, detail: this.voice.statusDetail || '', level: Math.round(this.voice.level * 100) / 100, lastHeard: this.lastHeard.slice(-160) },
        gesture: { status: this.gestures.status, detail: this.gestures.statusDetail || '', last: this.gestures.last, progress: this.gestureProgress || null },
        media: { status: this.media.status },
        keyboard: { status: this.cfg?.keyboard.enabled ? 'on' : 'off' },
      },
      audio: { ...this.responder.stats(), routes: this.audioRoutes, sinkSupported: this.outputs.supportsSink, speaking: this.responder.speaking },
      timer: this.timer.snapshot(),
      lastWarning: this.lastWarning,
      facts: this.facts.snapshot(),
      lastCommand: this.lastCommand,
    };
  }

  collectSync() {
    const logs = this.pendingLogs.splice(0, this.pendingLogs.length);
    return { clientId: this.clientId, state: this.cfg ? this.buildState() : null, logs };
  }

  /** Estado al instante para pestañas del mismo navegador (máx. cada 200 ms). */
  publishLocal(force = false) {
    if (!this.sync || !this.cfg) return;
    const now = performance.now();
    if (!force && now - (this.lastLocal || 0) < 200) return;
    this.lastLocal = now;
    this.sync.broadcast({ type: 'state', state: this.buildState() });
  }

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, Math.max(0, (t - (this.lastT || t)) / 1000));
    this.lastT = t;
    if (this.cfg) this.sceneManager.frame(dt);
    if (t - (this.lastTick || 0) > 250) {
      this.lastTick = t;
      this.timer.tick();
      this.facts.setBehind(this.timer.behind);
      if (this.started && t - (this.lastLocal || 0) > 1000) this.publishLocal();
    }
  }
}
