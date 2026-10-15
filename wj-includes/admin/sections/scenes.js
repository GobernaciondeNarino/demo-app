/**
 * Sección 6: escenas (lista ordenable), transiciones, enlaces a medios del
 * mismo hosting (wj-content/media), narración y datos clave por escena.
 */
import { h, toast } from '../../ui/dom.js';
import { TRANSITION_LABELS } from '../../core/TransitionPass.js';
import { card, grid, note, fmtBytes } from './ui.js';

const uid = (p) => p + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
const TRANSITIONS = Object.entries(TRANSITION_LABELS);
const PALETTE = ['#FFD500', '#10A13B', '#0071AC', '#055684', '#50398E', '#003366', '#DA1925', '#8D5213', '#000000', '#FFFFFF'];

let mediaCache = null;
async function loadMedia(api) {
  if (!mediaCache) mediaCache = api.get('media').then((r) => r.files).catch((err) => { mediaCache = null; throw err; });
  return mediaCache;
}

export default {
  id: 'escenas',
  title: 'Escenas',
  intro: 'Fase 1: escenas de color al 100 %. Para la Fase 2, cada escena puede mostrar una imagen o un video alojado en este mismo hosting.',
  render(ctx) {
    const { f, draft } = ctx;
    const list = h('div', { class: 'scene-list' });
    const open = new Set(ctx.app.openScenes || []);
    ctx.app.openScenes = open;

    const move = (i, d) => {
      const j = i + d;
      if (j < 0 || j >= draft.scenes.length) return;
      [draft.scenes[i], draft.scenes[j]] = [draft.scenes[j], draft.scenes[i]];
      ctx.markDirty();
      paint();
    };

    const paint = () => {
      list.replaceChildren(...draft.scenes.map((s, i) => sceneCard(s, i)));
    };

    const sceneCard = (s, i) => {
      const base = `scenes.${i}`;
      const block = draft.blocks.find((b) => b.id === s.blockId);
      const isOpen = open.has(s.id);
      const head = h('div', { class: 'scene-head' },
        h('span', { class: 'swatch', style: { background: s.color } }),
        h('span', { class: 'scene-num' }, String(i + 1).padStart(2, '0')),
        h('button', {
          class: 'scene-toggle', type: 'button', 'aria-expanded': String(isOpen),
          onclick: () => { if (isOpen) open.delete(s.id); else open.add(s.id); paint(); },
        }, h('strong', {}, s.title || '(sin título)'), h('small', {}, `${block?.name || 'sin bloque'} · ${s.type === 'media' ? 'medio' : 'color'}${s.facts.length ? ` · ${s.facts.length} dato(s) clave` : ''}`)),
        h('div', { class: 'scene-actions' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === 0, 'aria-label': 'Subir', onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === draft.scenes.length - 1, 'aria-label': 'Bajar', onclick: () => move(i, 1) }, '↓'),
          h('button', {
            class: 'btn btn-ghost btn-sm', type: 'button',
            onclick: () => {
              const copy = structuredClone(s);
              copy.id = uid('s');
              copy.title = `${s.title} (copia)`;
              copy.facts = copy.facts.map((fa) => ({ ...fa, id: uid('f') }));
              draft.scenes.splice(i + 1, 0, copy);
              open.add(copy.id);
              ctx.markDirty();
              paint();
            },
          }, 'Duplicar'),
          h('button', {
            class: 'btn btn-ghost btn-sm btn-danger', type: 'button', disabled: draft.scenes.length <= 1,
            onclick: () => {
              if (!confirm(`¿Eliminar la escena «${s.title}»?`)) return;
              draft.scenes.splice(i, 1);
              ctx.markDirty();
              paint();
            },
          }, 'Eliminar')));
      if (!isOpen) return h('article', { class: 'scene-card' }, head);

      const refresh = () => {
        head.querySelector('.swatch').style.background = s.color;
      };
      const mediaBox = h('div', { class: 'media-box', hidden: s.type !== 'media' });
      const typeSel = f.select('Tipo de escena', `${base}.type`, [['color', 'Color al 100 %'], ['media', 'Imagen o video del hosting']], {
        onchange: (v) => { mediaBox.hidden = v !== 'media'; },
      });

      // Selector de archivos de wj-content/media
      const picker = h('div', { class: 'media-picker', hidden: true });
      const urlField = f.text('Enlace del archivo', `${base}.media.url`, { maxlength: 500, placeholder: 'wj-content/media/mi-video.mp4', hint: 'Ruta relativa dentro de este hosting (recomendado) o URL completa.' });
      const pickBtn = h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: async () => {
          picker.hidden = !picker.hidden;
          if (picker.hidden) return;
          picker.replaceChildren(h('p', { class: 'hint' }, 'Cargando archivos…'));
          try {
            const files = (await loadMedia(ctx.api)).filter((x) => x.kind !== 'audio');
            picker.replaceChildren(files.length
              ? h('ul', {}, files.map((x) => h('li', {}, h('button', {
                type: 'button', class: 'link',
                onclick: () => {
                  s.media.url = x.url;
                  urlField.querySelector('input').value = x.url;
                  ctx.markDirty();
                  picker.hidden = true;
                },
              }, `${x.kind === 'video' ? '🎬' : '🖼'} ${x.name}`), h('small', {}, fmtBytes(x.bytes)))))
              : h('p', { class: 'hint' }, 'No hay archivos en wj-content/media. Súbalos con el Administrador de archivos de Plesk o por FTP.'));
          } catch (err) {
            picker.replaceChildren(h('p', { class: 'hint' }, err.message));
          }
        },
      }, 'Elegir de wj-content/media');
      mediaBox.append(urlField, h('div', { class: 'inline' }, pickBtn), picker,
        grid(
          f.select('Ajuste', `${base}.media.fit`, [['cover', 'Llenar la pantalla (recorta)'], ['contain', 'Mostrar completo (bandas)']]),
          f.toggle('Repetir video en bucle', `${base}.media.loop`),
          f.toggle('Video sin sonido', `${base}.media.muted`)));

      // Datos clave
      const factsBox = h('div', { class: 'facts-editor' });
      const paintFacts = () => {
        factsBox.replaceChildren(...s.facts.map((fact, k) => h('div', { class: 'fact-edit' },
          f.textarea(`Dato ${k + 1}`, `${base}.facts.${k}.text`, { rows: 2, maxlength: 400 }),
          f.commas('Palabras clave de respaldo', `${base}.facts.${k}.keywords`, { hint: 'Si la IA no responde, el dato cuenta como mencionado cuando aparecen todas. Use «|» para alternativas: 3 familias|tres familias' }),
          f.select('Prioridad', `${base}.facts.${k}.priority`, [['alta', 'Alta'], ['media', 'Media']]),
          h('button', { class: 'btn btn-ghost btn-sm btn-danger', type: 'button', onclick: () => { s.facts.splice(k, 1); ctx.markDirty(); paintFacts(); } }, 'Quitar dato'))),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', disabled: s.facts.length >= 12,
          onclick: () => { s.facts.push({ id: uid('f'), text: '', keywords: [], priority: 'alta' }); ctx.markDirty(); paintFacts(); },
        }, '+ Agregar dato clave'));
      };
      paintFacts();

      const swatches = h('div', { class: 'palette', role: 'group', 'aria-label': 'Colores de la marca' },
        PALETTE.map((c) => h('button', {
          type: 'button', class: 'palette-chip', style: { background: c }, title: c, 'aria-label': `Usar ${c}`,
          onclick: () => {
            s.color = c;
            const light = ['#FFD500', '#FFFFFF'].includes(c);
            s.textColor = light ? '#1F1F1F' : '#FFFFFF';
            ctx.markDirty();
            paint();
          },
        })));

      const body = h('div', { class: 'scene-body' },
        grid(
          f.text('Título', `${base}.title`, { maxlength: 160 }),
          f.text('Subtítulo', `${base}.subtitle`, { maxlength: 300 }),
          f.select('Bloque', `${base}.blockId`, draft.blocks.map((b) => [b.id, b.name])),
          typeSel),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Colores de la marca'), swatches),
        grid(
          f.color('Color de fondo', `${base}.color`),
          f.color('Color del texto', `${base}.textColor`),
          f.select('Efecto en vivo', `${base}.effect`, [['both', 'Gradiente + partículas'], ['particles', 'Solo partículas'], ['gradient', 'Solo gradiente'], ['none', 'Color plano']]),
          f.select('Transición al entrar', `${base}.transition`, [['', 'La predeterminada'], ...TRANSITIONS]),
          f.toggle('Mostrar número de escena', `${base}.showNumber`)),
        mediaBox,
        f.textarea('Notas para el presentador (solo en la vista de presentador)', `${base}.notes`, { rows: 3 }),
        h('h3', {}, 'Narración de Ñaño'),
        grid(
          f.select('Cuándo narrar', `${base}.narration.mode`, [['off', 'No narrar'], ['auto', 'Al terminar la transición'], ['cue', 'Cuando le doy la palabra («Ñaño, cuéntanos»)']]),
          f.textarea('Texto (lo más interesante de la escena)', `${base}.narration.text`, { rows: 3, maxlength: 1500 })),
        h('h3', {}, 'Datos clave'),
        h('p', { class: 'hint' }, 'Si pide avanzar sin haberlos mencionado, Ñaño se lo recuerda. Se verifican con IA aunque los diga con otras palabras.'),
        factsBox);
      const article = h('article', { class: 'scene-card is-open' }, head, body);
      article.addEventListener('input', refresh);
      return article;
    };

    paint();

    const addScene = () => {
      const last = draft.scenes[draft.scenes.length - 1];
      const s = {
        id: uid('s'), blockId: last?.blockId || draft.blocks[0].id, type: 'color', title: 'Nueva escena', subtitle: '',
        color: '#10A13B', textColor: '#FFFFFF', effect: 'both', showNumber: true, transition: '',
        media: { url: '', fit: 'cover', loop: true, muted: false }, notes: '', narration: { text: '', mode: 'off' }, facts: [],
      };
      draft.scenes.push(s);
      open.add(s.id);
      ctx.markDirty();
      paint();
    };

    return h('div', { class: 'stack' },
      card('Transición predeterminada',
        grid(
          f.select('Tipo', 'transitions.type', TRANSITIONS),
          f.number('Duración', 'transitions.durationMs', { min: 200, max: 5000, step: 100, suffix: 'ms', hint: 'Por defecto 1200 ms con easing power2.inOut.' }))),
      note('Use las flechas para ordenar. Los cambios se ven en la presentación abierta al guardar, sin recargarla.'),
      list,
      h('div', { class: 'inline' }, h('button', { class: 'btn btn-accent', type: 'button', onclick: addScene }, '+ Agregar escena')),
      card('Archivos multimedia',
        h('p', {}, 'Suba imágenes (.jpg, .png, .webp) y videos (.mp4, .webm) a la carpeta ', h('code', {}, 'wj-content/media/'),
          ' con el Administrador de archivos de Plesk o por FTP. Para videos, use MP4 (H.264) de máximo 1920×1080 para que carguen rápido.'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { mediaCache = null; toast('Lista de archivos actualizada.'); } }, 'Actualizar lista de archivos')));
  },
};
