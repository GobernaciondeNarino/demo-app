/** Sección 5: frases de respuesta, salidas de audio (parlantes / AirPods) y narración. */
import { h, toast } from '../../ui/dom.js';
import { ACTION_LABELS } from '../../core/CommandBus.js';
import { collectPhrases } from '../../core/phrases.js';
import { card, grid, note, asyncButton } from './ui.js';

const KEYS = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'UNKNOWN'];

export default {
  id: 'respuestas',
  title: 'Respuestas',
  intro: 'Lo que dice Ñaño al confirmar cada acción. Se elige una frase al azar. Al guardar, el servidor genera los audios y los guarda en caché.',
  render(ctx) {
    const { f } = ctx;
    const outputs = [['public', 'Parlantes del auditorio'], ['discreet', 'AirPods (discreto)'], ['both', 'Ambos']];

    // Dispositivos de salida
    const devBox = h('div', { class: 'form-grid' });
    const supported = 'setSinkId' in (window.AudioContext?.prototype || {});
    const paintDevices = (labels) => {
      const opts = [['', 'Salida predeterminada del sistema'], ...labels.map((l) => [l, l])];
      for (const key of ['publicSinkLabel', 'discreetSinkLabel']) {
        const cur = ctx.draft.audio[key];
        if (cur && !opts.some(([v]) => v === cur)) opts.push([cur, labels.length ? `${cur} (no conectado)` : cur]);
      }
      devBox.replaceChildren(
        f.select('Parlantes del auditorio', 'audio.publicSinkLabel', opts),
        f.select('AirPods del presentador (modo discreto)', 'audio.discreetSinkLabel', opts));
    };
    paintDevices([]);
    const detect = asyncButton('Detectar dispositivos de audio', async () => {
      try {
        // Las etiquetas de los dispositivos solo están disponibles con permiso de micrófono.
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch { /* sin permiso: se listan sin nombre */ }
      const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.label);
      paintDevices(outs.map((d) => d.label));
    });

    const preview = h('ul', { class: 'phrase-list' });
    const paintPreview = () => {
      const items = collectPhrases(ctx.draft);
      preview.replaceChildren(...items.map((i) => h('li', {}, h('span', { class: 'pill pill-off' }, i.kind), i.text)));
    };
    paintPreview();
    const off = ctx.onDraftChange(paintPreview);

    return {
      cleanup: off,
      el: h('div', { class: 'stack' },
        card('Respuestas',
          grid(
            f.toggle('Responder con voz', 'responses.enabled'),
            f.select('Responder a', 'responses.respondTo', [['voice', 'Solo comandos de voz'], ['all', 'Todos los comandos (voz, gesto, AirPods, teclado)']]),
            f.select('Salida', 'responses.output', outputs, { hint: 'Las confirmaciones suelen ir a los parlantes, para el efecto en el público.' })),
          h('div', { class: 'form-grid' }, KEYS.map((k) => f.lines(k === 'UNKNOWN' ? 'No entendido' : ACTION_LABELS[k], `responses.phrases.${k}`, { rows: 3 })))),
        card('Narración de escenas',
          note('El texto de cada escena se configura en «Escenas». Ñaño lo dice al terminar la transición (modo automático) o cuando usted le da la palabra («Ñaño, cuéntanos»).'),
          grid(
            f.select('Salida de la narración', 'narration.output', outputs),
            f.number('Espera tras la transición', 'narration.delayMs', { min: 0, max: 5000, step: 100, suffix: 'ms' }))),
        card('Salidas de audio',
          supported ? note('Chrome permite elegir un dispositivo distinto para los parlantes y para los AirPods. Los nombres deben coincidir con los del computador de la presentación.') : note('Este navegador no permite elegir la salida de audio (use Chrome 110 o superior).', 'warn'),
          h('div', { class: 'inline' }, detect),
          devBox),
        card('Audios generados',
          h('p', { class: 'hint' }, 'Todas las frases que la IA puede decir (respuestas, recordatorios, avisos de tiempo y narraciones).'),
          preview,
          h('div', { class: 'inline' },
            asyncButton('Regenerar audios', async () => {
              if (ctx.app.dirty) return toast('Guarde los cambios antes de regenerar.', 'error');
              await ctx.app.pregenerate({ force: true });
            }, 'btn-accent'),
            asyncButton('Generar los que falten', () => ctx.app.pregenerate()))),
      ),
    };
  },
};
