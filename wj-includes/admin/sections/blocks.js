/** Sección 8: bloques de la ponencia, duración y avisos de tiempo. */
import { h } from '../../ui/dom.js';
import { formatClock } from '../../core/text.js';
import { card, grid, note } from './ui.js';

const uid = () => `b${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

export default {
  id: 'bloques',
  title: 'Bloques y tiempos',
  intro: 'Cada bloque es una transición principal. El cronómetro por bloque y el total se ven solo en la vista de presentador.',
  render(ctx) {
    const { f, draft } = ctx;
    const list = h('div', { class: 'block-list' });
    const totalBox = h('p', { class: 'callout', role: 'status' });

    const paintTotal = () => {
      const total = draft.blocks.reduce((s, b) => s + Number(b.minutes || 0), 0);
      const target = draft.timing.targetMinutes;
      const over = total > target + 1e-9;
      totalBox.className = `callout ${over ? 'callout-warn' : 'callout-ok'}`;
      totalBox.textContent = `Total planeado: ${formatClock(total * 60)} de ${formatClock(target * 60)}.${over ? ` Se pasa por ${formatClock((total - target) * 60)}: ajuste los bloques.` : ''}`;
    };

    const paint = () => {
      list.replaceChildren(...draft.blocks.map((b, i) => {
        const scenes = draft.scenes.filter((s) => s.blockId === b.id).length;
        return h('div', { class: 'block-row' },
          h('span', { class: 'scene-num' }, i + 1),
          f.text('Nombre', `blocks.${i}.name`, { maxlength: 120 }),
          f.number('Minutos', `blocks.${i}.minutes`, { min: 0.25, max: 120, step: 0.25 }),
          h('span', { class: 'hint' }, `${scenes} escena(s)`),
          h('div', { class: 'scene-actions' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === 0, 'aria-label': 'Subir', onclick: () => { [draft.blocks[i - 1], draft.blocks[i]] = [draft.blocks[i], draft.blocks[i - 1]]; ctx.markDirty(); paint(); } }, '↑'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === draft.blocks.length - 1, 'aria-label': 'Bajar', onclick: () => { [draft.blocks[i + 1], draft.blocks[i]] = [draft.blocks[i], draft.blocks[i + 1]]; ctx.markDirty(); paint(); } }, '↓'),
            h('button', {
              class: 'btn btn-ghost btn-sm btn-danger', type: 'button', disabled: draft.blocks.length <= 1 || scenes > 0,
              title: scenes ? 'Mueva primero sus escenas a otro bloque' : null,
              onclick: () => { draft.blocks.splice(i, 1); ctx.markDirty(); paint(); },
            }, 'Eliminar')));
      }));
      paintTotal();
    };
    paint();
    const off = ctx.onDraftChange(paintTotal);

    return {
      cleanup: off,
      el: h('div', { class: 'stack' },
        card('Bloques', list, totalBox,
          h('button', {
            class: 'btn btn-ghost', type: 'button', disabled: draft.blocks.length >= 12,
            onclick: () => { draft.blocks.push({ id: uid(), name: 'Nuevo bloque', minutes: 2 }); ctx.markDirty(); paint(); },
          }, '+ Agregar bloque')),
        card('Avisos de tiempo',
          note('Llegan por los AirPods (modo discreto): «Te queda un minuto en este bloque» y «Tiempo cumplido». Si va atrasado más del umbral, el asistente solo recuerda los datos de prioridad alta.'),
          grid(
            f.toggle('Avisos activos', 'timing.enabled'),
            f.select('Salida', 'timing.output', [['discreet', 'AirPods (discreto)'], ['public', 'Parlantes'], ['both', 'Ambos'], ['text', 'Solo texto en la vista de presentador']]),
            f.text('Aviso de un minuto', 'timing.oneMinute', { maxlength: 200 }),
            f.text('Aviso de tiempo cumplido', 'timing.timeUp', { maxlength: 200 }),
            f.number('Umbral de atraso', 'timing.behindSeconds', { min: 10, max: 600, step: 5, suffix: 's' }),
            f.number('Duración objetivo de la ponencia', 'timing.targetMinutes', { min: 1, max: 240, step: 0.5, suffix: 'min' }))),
        note('El cronómetro arranca al pulsar «Iniciar presentación». Se puede reiniciar desde la vista de presentador. Al pasar de la última escena (o con «Finalizar ensayo») se guarda el resumen: tiempo real por bloque vs. planeado (sección Ensayos).')),
    };
  },
};
