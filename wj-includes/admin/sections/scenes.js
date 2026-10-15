/**
 * Sección 6: escenas (lista ordenable), transiciones, enlaces a medios del
 * mismo hosting (wj-content/media), narración y datos clave por escena.
 */
import { h, toast } from '../../ui/dom.js';
import { TRANSITION_LABELS } from '../../core/TransitionPass.js';
import { card, grid, note, fmtBytes } from './ui.js';
import { mediaKind } from '../../scenes/mediaKind.js';

const KIND_LABELS = { web: 'página web (película)', video: 'video', image: 'imagen' };
const KIND_ICONS = { web: '🎞', video: '🎬', image: '🖼' };

/**
 * Convierte una dirección completa dentro de la carpeta de la presentación en
 * relativa: «https://tic.narino.gov.co/ctIA-26/fagosEvo/» → «fagosEvo/».
 * Así la escena funciona igual si el sitio cambia de carpeta o de dominio.
 */
export function toRelative(value, appRoot) {
  if (!value) return value;
  const root = new URL(appRoot);
  const noProto = (u) => u.replace(/^https?:/i, '');
  if (noProto(value).startsWith(noProto(root.href))) return value.slice(value.indexOf(root.host) + root.host.length + root.pathname.length);
  if (value.startsWith(root.pathname) && root.pathname !== '/') return value.slice(root.pathname.length);
  return value;
}

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
  intro: 'Escenas de color al 100 % o con contenido del mismo hosting: películas web en carpetas junto a la presentación (p. ej. «fagosEvo/»), videos o imágenes.',
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
      const typeSel = f.select('Tipo de escena', `${base}.type`, [['color', 'Color al 100 %'], ['media', 'Película (página web), video o imagen del hosting']], {
        onchange: (v) => { mediaBox.hidden = v !== 'media'; },
      });

      // Enlace: relativo a la carpeta de la presentación (p. ej. «fagosEvo/»).
      const urlPreview = h('p', { class: 'url-preview' });
      const webOpts = h('div', {});
      const fileOpts = h('div', {});
      const paintUrl = () => {
        const u = s.media.url;
        const kind = mediaKind(s.media);
        urlPreview.replaceChildren(...(u
          ? ['Se abrirá: ', h('a', { href: ctx.resolveUrl(u), target: '_blank', rel: 'noopener' }, ctx.resolveUrl(u)), ` · ${KIND_LABELS[kind]}`]
          : ['Sin enlace.']));
        webOpts.hidden = kind !== 'web';
        fileOpts.hidden = kind === 'web';
      };
      const urlField = f.text('Enlace', `${base}.media.url`, {
        maxlength: 500,
        placeholder: 'fagosEvo/',
        hint: 'Carpeta o archivo junto a la presentación, p. ej. «fagosEvo/» o «wj-content/media/video.mp4». Si pega la dirección completa (https://…/fagosEvo/) se convierte sola en relativa.',
      });
      const urlInput = urlField.querySelector('input');
      urlInput.addEventListener('input', paintUrl);
      urlInput.addEventListener('change', () => {
        const rel = toRelative(urlInput.value.trim(), ctx.resolveUrl(''));
        if (rel !== urlInput.value) {
          urlInput.value = rel;
          f.set(`${base}.media.url`, rel);
        }
        paintUrl();
      });

      // Selector: carpetas junto a la presentación y wj-content/media.
      const picker = h('div', { class: 'media-picker', hidden: true });
      const choose = (x) => {
        s.media.url = x.url;
        s.media.kind = 'auto';
        urlInput.value = x.url;
        kindField.querySelector('select').value = 'auto';
        ctx.markDirty();
        picker.hidden = true;
        paintUrl();
      };
      const pickBtn = h('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: async () => {
          picker.hidden = !picker.hidden;
          if (picker.hidden) return;
          picker.replaceChildren(h('p', { class: 'hint' }, 'Cargando…'));
          try {
            const files = await loadMedia(ctx.api);
            const groups = [['folder', 'Carpetas junto a la presentación'], ['media', 'wj-content/media']];
            const blocks = groups.map(([g, title]) => {
              const items = files.filter((x) => x.group === g);
              return items.length ? [h('h4', {}, title), h('ul', {}, items.map((x) => h('li', {},
                h('button', { type: 'button', class: 'link', onclick: () => choose(x) }, `${KIND_ICONS[x.kind] || '•'} ${x.name}`),
                h('small', {}, x.kind === 'web' ? 'página' : fmtBytes(x.bytes)))))] : [];
            }).flat();
            picker.replaceChildren(...(blocks.length ? blocks : [h('p', { class: 'hint' },
              'No se encontraron películas ni archivos. Suba la carpeta de la película (con su index.html) junto a la presentación, o los videos a wj-content/media, con el Administrador de archivos de Plesk o por FTP.')]));
          } catch (err) {
            picker.replaceChildren(h('p', { class: 'hint' }, err.message));
          }
        },
      }, 'Elegir película o archivo…');

      const kindField = f.select('Tipo de contenido', `${base}.media.kind`, [
        ['auto', 'Automático (según el enlace)'],
        ['web', 'Página web / película (carpeta o .html)'],
        ['video', 'Video'],
        ['image', 'Imagen'],
      ], { onchange: paintUrl });

      // Retraso de inicio, en segundos.
      const delayId = `delay-${s.id}`;
      const delayInput = h('input', {
        id: delayId, type: 'number', min: 0, max: 120, step: 0.5, value: (s.media.startDelayMs ?? 5000) / 1000,
        oninput: () => {
          const v = parseFloat(delayInput.value);
          if (Number.isFinite(v) && v >= 0) f.set(`${base}.media.startDelayMs`, Math.round(v * 1000));
        },
      });
      const delayField = h('div', { class: 'field' },
        h('label', { for: delayId }, 'Iniciar el contenido después de (segundos)'),
        delayInput,
        h('p', { class: 'hint' }, 'Segundos desde que se cambia a esta escena o se inicia la presentación en ella. Mientras tanto se ve la tarjeta con el título (0 = de inmediato).'));

      webOpts.append(
        note('La página se carga en pantalla completa sobre la presentación. Las flechas, el clicker, la voz, los gestos y los AirPods siguen controlando la presentación (las teclas no llegan a la película). Debe estar en este mismo hosting.'),
        grid(
          f.select('Al pausar la presentación, enviar a la página', `${base}.media.pauseKey`, [['Space', 'Tecla Espacio (pausa la película)'], ['KeyP', 'Tecla P'], ['KeyK', 'Tecla K'], ['', 'Nada']]),
          f.toggle('Permitir usar el mouse dentro de la página', `${base}.media.interactive`)),
        h('details', {},
          h('summary', {}, 'CSS adicional para la página (avanzado)'),
          f.textarea('CSS', `${base}.media.css`, { rows: 3, maxlength: 2000, placeholder: '#bar { display: none !important; }', hint: 'Se agrega a la página al cargarla, por ejemplo para ocultar sus controles durante la presentación.' })));
      fileOpts.append(grid(
        f.select('Ajuste', `${base}.media.fit`, [['cover', 'Llenar la pantalla (recorta)'], ['contain', 'Mostrar completo (bandas)']]),
        f.toggle('Repetir video en bucle', `${base}.media.loop`),
        f.toggle('Video sin sonido', `${base}.media.muted`)));
      mediaBox.append(urlField, urlPreview, h('div', { class: 'inline' }, pickBtn), picker, grid(kindField, delayField), webOpts, fileOpts);
      paintUrl();

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
        media: { url: '', kind: 'auto', fit: 'cover', loop: true, muted: false, startDelayMs: 5000, interactive: false, pauseKey: 'Space', css: '' },
        notes: '', narration: { text: '', mode: 'off' }, facts: [],
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
      card('Películas y archivos',
        h('p', {}, 'Películas web: suba cada carpeta (con su index.html) junto a la presentación, por ejemplo ',
          h('code', {}, `${ctx.resolveUrl('')}fagosEvo/`), '. Videos (.mp4, .webm) e imágenes (.jpg, .png, .webp): dentro de esas carpetas o en ',
          h('code', {}, 'wj-content/media/'), '. Se suben con el Administrador de archivos de Plesk o por FTP. Para videos, use MP4 (H.264) de máximo 1920×1080.'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { mediaCache = null; toast('Lista de archivos actualizada.'); } }, 'Actualizar lista de archivos')));
  },
};
