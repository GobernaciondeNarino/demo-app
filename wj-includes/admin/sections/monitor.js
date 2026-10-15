/** Sección 11: monitor en vivo de la presentación + control remoto. */
import { h, clear, toast } from '../../ui/dom.js';
import { ACTION_LABELS, SOURCE_LABELS } from '../../core/CommandBus.js';
import { formatClock } from '../../core/text.js';
import { card } from './ui.js';

const STATUS_TEXT = {
  ok: 'aplicado', cooldown: 'ignorado (cooldown)', queued: 'en cola', reminder: 'recordatorio', ignored: 'ignorado',
  error: 'error', end: 'fin', unknown: 'no entendido', duplicate: 'duplicado',
};
const INPUT_TEXT = { on: 'activo', off: 'apagado', error: 'error', loading: 'cargando' };
const MEDIA_STATE = { waiting: 'inicia en', loading: 'cargando', playing: 'en pantalla', idle: 'en espera' };

function mediaText(m) {
  const what = { web: 'Película', video: 'Video', image: 'Imagen' }[m.kind] || 'Contenido';
  return `▶ ${what} «${m.url}»: ${MEDIA_STATE[m.state] || m.state}${m.state === 'waiting' && m.startsIn !== null ? ` ${m.startsIn} s` : ''}${m.error ? ` · ${m.error}` : ''}`;
}

export default {
  id: 'monitor',
  title: 'Monitor en vivo',
  intro: 'Lo que está pasando en la presentación abierta, actualizado cada segundo (al instante si está en este mismo navegador).',
  render(ctx) {
    const send = (action, arg = null) => {
      if (!ctx.app.sync) return;
      ctx.app.sync.command(action, arg, 'admin').catch((err) => toast(err.message, 'error'));
    };

    const conn = h('p', { class: 'callout' }, 'Esperando datos de la presentación…');
    const now = h('div', { class: 'now-box' });
    const inputs = h('ul', { class: 'plain inputs-list' });
    const meter = h('span', { class: 'meter-fill' });
    const heard = h('p', { class: 'heard' });
    const facts = h('ul', { class: 'plain facts-list' });
    const transcript = h('p', { class: 'transcript-box' });
    const timer = h('div', { class: 'timer-box' });
    const logBody = h('tbody');
    const gotoSel = h('select', { 'aria-label': 'Escena' });
    const seen = new Set();

    const renderState = (s, age) => {
      const fresh = age !== undefined && age < 5;
      conn.className = `callout ${fresh ? 'callout-ok' : 'callout-warn'}`;
      conn.textContent = fresh
        ? `Presentación conectada${s.started ? '' : ' (aún no ha pulsado «Iniciar presentación»)'}.`
        : `Sin noticias de la presentación desde hace ${Math.round(age ?? 0)} s. ¿Está abierta?`;
      clear(now).append(
        h('span', { class: 'swatch', style: { background: s.scene?.color || '#ccc' } }),
        h('div', {},
          h('small', {}, `${s.scene?.blockName || ''} · escena ${s.index + 1} de ${s.total}`),
          h('strong', {}, s.scene?.title || '(sin título)'),
          s.scene?.media ? h('small', {}, mediaText(s.scene.media)) : null,
          h('div', { class: 'flags' },
            s.paused ? h('span', { class: 'pill pill-warn' }, 'En pausa') : null,
            s.black ? h('span', { class: 'pill pill-off' }, 'Pantalla negra') : null,
            s.muted ? h('span', { class: 'pill pill-off' }, 'Voz silenciada') : null,
            s.transitioning ? h('span', { class: 'pill pill-ok' }, 'En transición') : null,
            !s.hud ? h('span', { class: 'pill pill-off' }, 'HUD oculto') : null)));
      if (gotoSel.options.length !== s.total) {
        gotoSel.replaceChildren(...Array.from({ length: s.total }, (_, i) => h('option', { value: i + 1 }, `Escena ${i + 1}${ctx.saved.scenes[i] ? ` · ${ctx.saved.scenes[i].title}` : ''}`)));
      }
      const i = s.inputs;
      clear(inputs).append(
        h('li', { dataset: { state: i.voice.status } }, h('strong', {}, 'Micrófono: '), INPUT_TEXT[i.voice.status] || i.voice.status, i.voice.detail ? ` — ${i.voice.detail}` : ''),
        h('li', { dataset: { state: i.gesture.status } }, h('strong', {}, 'Cámara: '), INPUT_TEXT[i.gesture.status] || i.gesture.status,
          i.gesture.detail ? ` — ${i.gesture.detail}` : '',
          i.gesture.last?.gesture && i.gesture.last.gesture !== 'None' ? ` · ${i.gesture.last.gesture} ${(i.gesture.last.score * 100).toFixed(0)} %` : ''),
        h('li', { dataset: { state: i.media.status } }, h('strong', {}, 'AirPods: '), INPUT_TEXT[i.media.status] || i.media.status),
        h('li', { dataset: { state: i.keyboard.status } }, h('strong', {}, 'Teclado: '), INPUT_TEXT[i.keyboard.status] || i.keyboard.status),
        h('li', { dataset: { state: s.audio.failed ? 'error' : s.audio.loaded === s.audio.total ? 'on' : 'loading' } },
          h('strong', {}, 'Voces precargadas: '), `${s.audio.loaded}/${s.audio.total}`,
          s.audio.failed ? ` — ${s.audio.lastError}` : '',
          s.audio.routes ? ` · parlantes: ${s.audio.routes.public} · AirPods: ${s.audio.routes.discreet}` : ''));
      meter.style.width = `${Math.round((i.voice.level || 0) * 100)}%`;
      heard.textContent = i.voice.lastHeard ? `«${i.voice.lastHeard}»` : '—';

      clear(facts);
      const items = s.facts?.items || [];
      if (!items.length) facts.append(h('li', { class: 'hint' }, 'Esta escena no tiene datos clave.'));
      for (const fa of items) {
        facts.append(h('li', { class: fa.applies ? '' : 'is-skipped' },
          fa.covered ? '✅ ' : '⏳ ', fa.text,
          h('small', {}, ` · ${fa.priority}${fa.covered ? ` · mencionado (${fa.by})` : ''}`),
          fa.covered ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => send('FACT_COVERED', fa.id) }, 'Marcar')));
      }
      if (s.facts?.lastReminder) facts.append(h('li', { class: 'hint' }, `Último recordatorio: ${s.facts.lastReminder.fact}`));
      if (s.facts?.aiError) facts.append(h('li', { class: 'hint' }, `IA: ${s.facts.aiError}`));
      transcript.textContent = s.facts?.transcript || '—';

      const t = s.timer;
      clear(timer).append(...[
        h('p', {}, h('strong', {}, 'Total: '), `${formatClock(t.total)} / ${formatClock(t.planned)}`,
          t.running ? ` · ${t.delay > 5 ? `${formatClock(t.delay)} atrasado` : t.delay < -5 ? `${formatClock(-t.delay)} adelantado` : 'a tiempo'}` : ' · cronómetro detenido'),
        t.block ? h('p', {}, h('strong', {}, 'Bloque: '), `${t.block.name} ${formatClock(t.block.spent)} / ${formatClock(t.block.planned)}`) : null,
      ].filter(Boolean));
    };

    const addLog = (log) => {
      const key = `${log.t}|${log.action}|${log.source}|${log.status}`;
      if (seen.has(key)) return;
      seen.add(key);
      const row = h('tr', { class: `log-${log.status}` },
        h('td', {}, new Date(log.t).toLocaleTimeString('es-CO')),
        h('td', {}, SOURCE_LABELS[log.source] || log.source),
        h('td', {}, `${ACTION_LABELS[log.action] || log.action}${log.arg ? ` ${log.arg}` : ''}`),
        h('td', {}, log.confidence !== undefined ? `${Math.round(log.confidence * 100)} %` : ''),
        h('td', {}, STATUS_TEXT[log.status] || log.status),
        h('td', {}, log.detail || ''));
      logBody.prepend(row);
      while (logBody.children.length > 150) logBody.lastChild.remove();
    };

    const off = ctx.onLive((live) => {
      if (live.log) return addLog(live.log);
      if (live.state) renderState(live.state, live.via === 'local' ? 0 : live.age);
    });

    const btn = (label, action, cls = 'btn-ghost') => h('button', { class: `btn ${cls}`, type: 'button', onclick: () => send(action) }, label);

    return {
      cleanup: off,
      el: h('div', { class: 'stack' },
        conn,
        card('Escena actual', now,
          h('div', { class: 'remote' },
            btn('◀ Anterior', 'PREV'), btn('↻ Repetir', 'REPEAT'), btn('⏸ Pausa', 'TOGGLE_PAUSE'), btn('🗣 Narrar', 'NARRATE'),
            btn('Continuar igual', 'FORCE_NEXT'), btn('■ Negro', 'BLACK'), btn('HUD', 'TOGGLE_HUD'), btn('🔇 Voz', 'MUTE_VOICE'),
            btn('Siguiente ▶', 'NEXT', 'btn-primary')),
          h('div', { class: 'inline' }, gotoSel, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => send('GOTO', parseInt(gotoSel.value, 10)) }, 'Ir a la escena'),
            btn('Recargar audios', 'RELOAD_AUDIO'))),
        h('div', { class: 'two-col' },
          card('Entradas', inputs, h('p', { class: 'label' }, 'Nivel del micrófono'), h('div', { class: 'meter' }, meter), h('p', { class: 'label' }, 'Último texto escuchado'), heard),
          card('Datos clave de la escena', facts, h('p', { class: 'label' }, 'Transcripción en vivo'), transcript)),
        card('Tiempo', timer),
        card('Registro de comandos',
          h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Hora', 'Fuente', 'Acción', 'Confianza', 'Resultado', 'Detalle'].map((t) => h('th', {}, t)))),
            logBody)))),
    };
  },
};
