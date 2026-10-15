/**
 * Vista de presentador (presentador.html): solo la ve quien presenta, en una
 * segunda pantalla o en el celular. Muestra cronómetros por bloque y total,
 * retraso, datos clave (✅ mencionado / ⏳ pendiente), recordatorios en texto,
 * notas, escena siguiente y botones de control remoto.
 */
import { Api } from '../core/Api.js';
import { LiveSync } from '../core/LiveSync.js';
import { formatClock } from '../core/text.js';
import { h, clear, toast } from '../ui/dom.js';

const ROOT = new URL('../../', import.meta.url);
const api = new Api(new URL('wj-admin/routes/', ROOT).toString());
const app = document.getElementById('app');

let sync;
let state = null;
let receivedAt = 0;
let stateAge = 0;
let lastRenderKey = '';
const els = {};

async function boot() {
  let s;
  try {
    s = await api.session();
  } catch (err) {
    app.replaceChildren(h('p', { class: 'loading' }, `Sin conexión con el servidor: ${err.message}`));
    setTimeout(boot, 4000);
    return;
  }
  if (!s.authenticated) return showLogin();
  build();
  sync = new LiveSync(api, { role: 'presenter', intervalMs: 1000 });
  sync.addEventListener('state', (e) => {
    if (!e.detail.state) return;
    // Se prefiere el estado local (mismo navegador) si es más reciente.
    if (state && e.detail.via === 'server' && e.detail.state.t < state.t) return;
    state = e.detail.state;
    receivedAt = Date.now();
    stateAge = e.detail.age || 0;
    render();
  });
  sync.addEventListener('status', (e) => {
    els.conn.dataset.state = e.detail.online ? 'on' : 'off';
    els.conn.title = e.detail.online ? 'Conectado' : `Sin conexión: ${e.detail.error}`;
  });
  sync.start();
  setInterval(tick, 250);
}

function showLogin() {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'login card' },
    h('h1', {}, 'Vista de presentador'),
    h('label', {}, 'Usuario', h('input', { name: 'username', autocomplete: 'username', required: true })),
    h('label', {}, 'Contraseña', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Entrar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      await api.login(String(f.get('username')), String(f.get('password')));
      boot();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  app.replaceChildren(form);
}

function command(action, arg = null) {
  sync.command(action, arg).catch((err) => toast(`No se envió: ${err.message}`, 'error'));
}

function btn(label, action, cls = '', key = '') {
  return h('button', { class: `btn ${cls}`, type: 'button', onclick: () => command(action), title: key ? `Atajo: ${key}` : null }, label);
}

function build() {
  els.conn = h('span', { class: 'conn', dataset: { state: 'off' }, title: 'Conectando' });
  els.sceneNum = h('span', { class: 'scene-num' }, '–');
  els.sceneTitle = h('h1', { class: 'scene-title' }, 'Esperando la presentación…');
  els.sceneBlock = h('p', { class: 'scene-block' });
  els.swatch = h('span', { class: 'swatch' });
  els.flags = h('div', { class: 'flags' });
  els.media = h('p', { class: 'scene-media', hidden: true });

  els.blockClock = h('div', { class: 'clock-value' }, '0:00');
  els.blockPlanned = h('div', { class: 'clock-sub' });
  els.blockBar = h('div', { class: 'bar-fill' });
  els.totalClock = h('div', { class: 'clock-value' }, '0:00');
  els.totalPlanned = h('div', { class: 'clock-sub' });
  els.delay = h('div', { class: 'delay' });

  els.reminder = h('div', { class: 'reminder', hidden: true });
  els.facts = h('ul', { class: 'facts' });
  els.factsNote = h('p', { class: 'muted small' });
  els.notes = h('p', { class: 'notes' });
  els.next = h('div', { class: 'next' });
  els.inputs = h('ul', { class: 'inputs' });
  els.transcript = h('p', { class: 'transcript' });
  els.blocks = h('ol', { class: 'blocks' });

  const controls = h('nav', { class: 'controls', 'aria-label': 'Control remoto' },
    btn('◀ Anterior', 'PREV', 'btn-ghost'),
    btn('↻ Repetir', 'REPEAT', 'btn-ghost'),
    btn('⏸ Pausa', 'TOGGLE_PAUSE', 'btn-ghost'),
    btn('🗣 Narrar', 'NARRATE', 'btn-ghost'),
    btn('Continuar igual', 'FORCE_NEXT', 'btn-ghost'),
    btn('■ Negro', 'BLACK', 'btn-ghost'),
    btn('Siguiente ▶', 'NEXT', 'btn-primary btn-next'));

  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-bar' }), 'Vista de presentador'),
      h('div', { class: 'topbar-right' }, els.flags, els.conn)),
    h('main', { class: 'grid' },
      h('section', { class: 'card now' },
        h('div', { class: 'now-head' }, els.swatch, els.sceneNum, h('div', {}, els.sceneBlock, els.sceneTitle, els.media))),
      h('section', { class: 'card clocks' },
        h('div', { class: 'clock' }, h('div', { class: 'clock-label' }, 'Bloque'), els.blockClock, els.blockPlanned, h('div', { class: 'bar' }, els.blockBar)),
        h('div', { class: 'clock' }, h('div', { class: 'clock-label' }, 'Total'), els.totalClock, els.totalPlanned, els.delay)),
      els.reminder,
      h('section', { class: 'card' }, h('h2', {}, 'Datos clave de la escena'), els.facts, els.factsNote),
      h('section', { class: 'card' }, h('h2', {}, 'Notas'), els.notes, h('h2', {}, 'Siguiente escena'), els.next),
      h('section', { class: 'card' }, h('h2', {}, 'Bloques'), els.blocks,
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => command('TIMER_RESET') }, 'Reiniciar cronómetro'),
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: () => { if (confirm('¿Finalizar y guardar el resumen del ensayo?')) command('END_SESSION'); },
          }, 'Finalizar ensayo'))),
      h('section', { class: 'card' }, h('h2', {}, 'Entradas'), els.inputs, h('h2', {}, 'Transcripción de la escena'), els.transcript)),
    controls);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const map = { ArrowRight: 'NEXT', PageDown: 'NEXT', ArrowLeft: 'PREV', PageUp: 'PREV', KeyB: 'BLACK', KeyR: 'REPEAT', KeyP: 'TOGGLE_PAUSE', KeyC: 'FORCE_NEXT', KeyN: 'NARRATE' };
    const action = map[e.code];
    if (action) {
      e.preventDefault();
      command(action);
    }
  });
}

function liveSeconds(base, running) {
  if (!running) return base;
  return base + stateAge + (Date.now() - receivedAt) / 1000;
}

const MEDIA_KIND = { web: 'La película', video: 'El video', image: 'La imagen' };

function paintMedia() {
  const m = state.scene?.media;
  els.media.hidden = !m;
  if (!m) return;
  const what = MEDIA_KIND[m.kind] || 'El contenido';
  if (m.state === 'waiting' && m.startsIn !== null) {
    const left = Math.max(0, Math.ceil(m.startsIn - (Date.now() - receivedAt) / 1000));
    els.media.textContent = `▶ ${what} inicia en ${left} s`;
    els.media.dataset.state = 'waiting';
  } else if (m.state === 'loading') {
    els.media.textContent = `▶ ${what} está cargando…`;
    els.media.dataset.state = 'waiting';
  } else if (m.state === 'playing') {
    els.media.textContent = `▶ ${what} está en pantalla${m.error ? ` (${m.error})` : ''}`;
    els.media.dataset.state = 'playing';
  } else {
    els.media.textContent = `${what} inicia al entrar en vivo a esta escena`;
    els.media.dataset.state = 'idle';
  }
}

function tick() {
  if (!state) return;
  paintMedia();
  const t = state.timer;
  const running = t.running && !t.paused && !t.ended;
  const total = liveSeconds(t.total, running);
  els.totalClock.textContent = formatClock(total);
  els.totalPlanned.textContent = `de ${formatClock(t.planned)} planeados`;
  const delay = liveDelay(t, running);
  els.delay.textContent = Math.abs(delay) < 5 ? 'A tiempo' : delay > 0 ? `${formatClock(delay)} atrasado` : `${formatClock(-delay)} adelantado`;
  els.delay.dataset.state = delay > (t.behind ? 0 : 60) ? 'late' : delay > 15 ? 'warn' : 'ok';

  if (t.block) {
    const spent = liveSeconds(t.block.spent, running);
    const remaining = t.block.planned - spent;
    els.blockClock.textContent = formatClock(spent);
    els.blockPlanned.textContent = `${t.block.name} · ${remaining >= 0 ? `quedan ${formatClock(remaining)}` : `excedido ${formatClock(-remaining)}`} de ${formatClock(t.block.planned)}`;
    els.blockClock.dataset.state = remaining < 0 ? 'late' : remaining <= 60 ? 'warn' : 'ok';
    els.blockBar.style.width = `${Math.min(100, (spent / Math.max(1, t.block.planned)) * 100)}%`;
    els.blockBar.dataset.state = els.blockClock.dataset.state;
  }
  els.flags.replaceChildren(
    ...(!state.started ? [h('span', { class: 'flag' }, 'Sin iniciar')] : []),
    ...(t.paused || state.paused ? [h('span', { class: 'flag warn' }, 'En pausa')] : []),
    ...(state.black ? [h('span', { class: 'flag' }, 'Pantalla negra')] : []),
    ...(state.muted ? [h('span', { class: 'flag' }, 'Voz silenciada')] : []),
    ...(t.ended ? [h('span', { class: 'flag ok' }, 'Ensayo finalizado')] : []),
  );
  const rem = state.facts?.lastReminder;
  const warn = state.lastWarning;
  const recentRem = rem && state.t - rem.ts < 30000;
  const recentWarn = warn && state.t - warn.t < 15000;
  els.reminder.hidden = !(recentRem || recentWarn);
  if (!els.reminder.hidden) {
    els.reminder.replaceChildren(
      h('strong', {}, recentRem ? 'Recordatorio' : 'Tiempo'),
      h('span', {}, recentRem ? rem.fact : `${warn.text} (${warn.block})`));
  }
}

function liveDelay(t, running) {
  if (!running || !t.block) return t.delay;
  // Si el bloque ya excedió lo planeado, el retraso crece en tiempo real.
  const spent = liveSeconds(t.block.spent, running);
  const extra = Math.max(0, spent - t.block.planned) - Math.max(0, t.block.spent - t.block.planned);
  return t.delay + extra;
}

function render() {
  const s = state;
  els.sceneNum.textContent = String(s.index + 1).padStart(2, '0');
  els.sceneTitle.textContent = s.scene?.title || '(sin título)';
  els.sceneBlock.textContent = `${s.scene?.blockName || ''} · escena ${s.index + 1} de ${s.total}`;
  els.swatch.style.background = s.scene?.color || '#333';

  const key = JSON.stringify([s.facts?.items, s.facts?.onlyHigh, s.scene?.id]);
  if (key !== lastRenderKey) {
    lastRenderKey = key;
    clear(els.facts);
    const items = s.facts?.items || [];
    if (!items.length) els.facts.append(h('li', { class: 'muted' }, 'Esta escena no tiene datos clave.'));
    for (const f of items) {
      els.facts.append(h('li', { class: `fact ${f.covered ? 'is-covered' : ''} ${f.applies ? '' : 'is-skipped'}` },
        h('span', { class: 'fact-state', 'aria-hidden': 'true' }, f.covered ? '✅' : '⏳'),
        h('span', { class: 'fact-text' }, f.text, h('small', {}, `${f.priority === 'alta' ? 'Prioridad alta' : 'Prioridad media'}${f.covered ? ` · mencionado (${f.by})` : ''}${f.applies ? '' : ' · se omite por tiempo'}`)),
        f.covered ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => command('FACT_COVERED', f.id) }, 'Ya lo dije')));
    }
  }
  els.factsNote.textContent = s.facts?.onlyHigh ? (s.facts.behind ? 'Vas atrasado: solo se recuerdan los datos de prioridad alta.' : 'Solo se recuerdan los datos de prioridad alta.') : '';
  if (s.facts?.aiError) els.factsNote.textContent += ` IA no disponible (${s.facts.aiError}); se usa verificación local.`;
  els.notes.textContent = s.scene?.notes || 'Sin notas.';
  els.next.replaceChildren(s.next
    ? h('span', {}, h('span', { class: 'swatch sm', style: { background: s.next.color } }), s.next.title || '(sin título)')
    : h('span', { class: 'muted' }, 'Es la última escena.'));
  els.transcript.textContent = s.facts?.transcript || '—';

  clear(els.blocks);
  for (const b of s.timer.blocks) {
    const current = s.timer.block?.id === b.id;
    els.blocks.append(h('li', { class: current ? 'is-current' : '' },
      h('span', {}, b.name), h('span', { class: 'mono' }, `${formatClock(b.spent)} / ${formatClock(b.planned)}`)));
  }

  const inp = s.inputs;
  const label = { on: 'activo', off: 'apagado', error: 'error', loading: 'cargando' };
  clear(els.inputs);
  els.inputs.append(
    h('li', { dataset: { state: inp.voice.status } }, 'Micrófono: ', label[inp.voice.status] || inp.voice.status,
      h('span', { class: 'meter' }, h('span', { style: { width: `${Math.round(inp.voice.level * 100)}%` } })),
      inp.voice.detail ? h('small', {}, inp.voice.detail) : null),
    h('li', { dataset: { state: inp.gesture.status } }, 'Cámara: ', label[inp.gesture.status] || inp.gesture.status,
      inp.gesture.last?.gesture && inp.gesture.last.gesture !== 'None' ? h('small', {}, `${inp.gesture.last.gesture} ${(inp.gesture.last.score * 100).toFixed(0)}%`) : null),
    h('li', { dataset: { state: inp.media.status } }, 'AirPods: ', label[inp.media.status] || inp.media.status),
    h('li', { dataset: { state: s.audio.failed ? 'error' : s.audio.loaded === s.audio.total ? 'on' : 'loading' } },
      `Voces: ${s.audio.loaded}/${s.audio.total}`, s.audio.failed ? h('small', {}, s.audio.lastError) : null));
  tick();
}

boot();
