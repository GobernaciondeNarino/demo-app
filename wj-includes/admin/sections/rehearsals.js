/** Sección 12: resúmenes de ensayos (tiempo real por bloque vs. planeado). */
import { h, toast } from '../../ui/dom.js';
import { formatClock } from '../../core/text.js';
import { card, note } from './ui.js';

export default {
  id: 'ensayos',
  title: 'Ensayos',
  intro: 'Se guarda un resumen al pasar de la última escena o al pulsar «Finalizar ensayo» en la vista de presentador.',
  render(ctx) {
    const box = h('div', { class: 'stack' }, h('p', { class: 'hint' }, 'Cargando…'));
    const load = async () => {
      try {
        const r = await ctx.api.get('rehearsal');
        if (!r.items.length) {
          box.replaceChildren(note('Todavía no hay ensayos guardados.'));
          return;
        }
        box.replaceChildren(...r.items.map((it) => {
          const s = it.summary;
          const diff = s.actualSeconds - s.plannedSeconds;
          const transcriptBtn = it.hasTranscript ? h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: async () => {
              const d = await ctx.api.get('rehearsal', { id: it.id });
              const pre = h('div', { class: 'transcript-box' }, (d.rehearsal.transcript || []).map((t) => h('p', {}, h('strong', {}, `${t.title}: `), t.text)));
              transcriptBtn.replaceWith(pre);
            },
          }, 'Ver transcripción') : null;
          return card(`${new Date(it.created).toLocaleString('es-CO')}${s.reason === 'fin' ? '' : ' · finalizado manualmente'}`,
            h('p', { class: diff > 60 ? 'callout callout-warn' : 'callout callout-ok' },
              `Total: ${formatClock(s.actualSeconds)} de ${formatClock(s.plannedSeconds)} planeados (${diff >= 0 ? '+' : '−'}${formatClock(Math.abs(diff))}).`),
            h('table', { class: 'table' },
              h('thead', {}, h('tr', {}, h('th', {}, 'Bloque'), h('th', {}, 'Planeado'), h('th', {}, 'Real'), h('th', {}, 'Diferencia'))),
              h('tbody', {}, s.blocks.map((b) => h('tr', { class: b.diff > 30 ? 'is-late' : '' },
                h('td', {}, b.name), h('td', {}, formatClock(b.planned)), h('td', {}, formatClock(b.spent)),
                h('td', {}, `${b.diff >= 0 ? '+' : '−'}${formatClock(Math.abs(b.diff))}`))))),
            h('div', { class: 'inline' },
              transcriptBtn,
              h('button', {
                class: 'btn btn-ghost btn-sm btn-danger', type: 'button',
                onclick: async () => {
                  if (!confirm('¿Eliminar este ensayo?')) return;
                  await ctx.api.post('rehearsal', { action: 'delete', id: it.id });
                  toast('Ensayo eliminado.');
                  load();
                },
              }, 'Eliminar')));
        }));
      } catch (err) {
        box.replaceChildren(note(err.message, 'warn'));
      }
    };
    load();
    return box;
  },
};
