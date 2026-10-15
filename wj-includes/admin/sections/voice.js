/** Sección 2: reconocimiento de voz, palabra de activación y diccionario. */
import { h } from '../../ui/dom.js';
import { ACTION_LABELS } from '../../core/CommandBus.js';
import { VoiceMatcher } from '../../inputs/VoiceMatcher.js';
import { card, grid, note } from './ui.js';

const ACTIONS = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE'];
const ACTION_HINTS = {
  FORCE_NEXT: 'Avanza aunque falte un dato clave, sin repetir el recordatorio.',
  NARRATE: 'Ñaño dice la narración de la escena (cuando usted le da la palabra).',
  MUTE_VOICE: 'Silencia / reactiva la voz de la IA en los parlantes.',
};

export default {
  id: 'voz',
  title: 'Voz',
  intro: 'Comandos hablados con el reconocimiento de voz de Google Chrome (es-CO).',
  render(ctx) {
    const { f } = ctx;
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    const testInput = h('input', { type: 'text', placeholder: 'Ej.: Ñaño, siguiente por favor', 'aria-label': 'Frase de prueba' });
    const testOut = h('p', { class: 'test-result', role: 'status' }, 'Escriba una frase para ver qué acción detecta.');
    const runTest = () => {
      const text = testInput.value.trim();
      if (!text) return;
      const m = new VoiceMatcher(ctx.draft.voice).match(text);
      if (m.action) {
        testOut.className = 'test-result is-ok';
        testOut.textContent = `→ ${ACTION_LABELS[m.action]}${m.arg ? ` ${m.arg}` : ''} (frase: «${m.phrase}»)`;
      } else if (ctx.draft.voice.wakeWord.enabled && !m.wake) {
        testOut.className = 'test-result';
        testOut.textContent = 'Sin acción: no se dijo la palabra de activación (se toma como conversación con el público).';
      } else {
        testOut.className = 'test-result is-error';
        testOut.textContent = ctx.draft.voice.aiIntent.enabled
          ? 'No coincide con el diccionario: se consultaría a la IA para interpretarla.'
          : 'No coincide con el diccionario: Ñaño respondería «No te entendí».';
      }
    };
    testInput.addEventListener('input', runTest);
    const off = ctx.onDraftChange(runTest);

    return {
      cleanup: off,
      el: h('div', { class: 'stack' },
        supported ? null : note('Este navegador no tiene reconocimiento de voz. Use Google Chrome de escritorio en el computador de la presentación.', 'warn'),
        card('General',
          grid(
            f.toggle('Comandos por voz activos', 'voice.enabled'),
            f.select('Idioma', 'voice.lang', [['es-CO', 'Español (Colombia)'], ['es-419', 'Español (Latinoamérica)'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)']]),
            f.select('Motor de reconocimiento', 'voice.engine', [
              ['webspeech', 'Chrome (en la nube, requiere internet)'],
              ['webspeech-local', 'Chrome en el dispositivo (si está disponible)'],
            ], { hint: 'El modo "en el dispositivo" usa el modelo local de Chrome cuando el navegador lo ofrece; si no, se comporta como el normal.' }),
            f.select('Mientras la IA habla', 'voice.ignoreWhileSpeaking', [
              ['all', 'Ignorar siempre (recomendado)'],
              ['public', 'Ignorar solo si suena por los parlantes'],
            ], { hint: 'Evita que la IA reaccione a su propia voz.' }))),
        card('Palabra de activación',
          note('Recomendado: así, decir «siguiente» hablando con el público no cambia de escena. Diga «Ñaño, siguiente». El reconocimiento puede escribir el nombre de varias formas; agréguelas todas.'),
          grid(
            f.toggle('Exigir palabra de activación', 'voice.wakeWord.enabled'),
            f.commas('Palabra(s) de activación', 'voice.wakeWord.words', { hint: 'Variantes separadas por comas. Las tildes y la ñ no importan (ñaño = nano).' }),
            f.number('Ventana tras decir solo el nombre', 'voice.wakeWord.windowMs', { min: 1000, max: 15000, step: 500, suffix: 'ms', hint: 'Si dice «Ñaño» y hace una pausa, el comando puede llegar en la frase siguiente.' }))),
        card('Diccionario de comandos',
          h('p', { class: 'hint' }, 'Frases por acción, separadas por comas. Gana la frase más larga (por eso «continúa igual» no se confunde con «continúa»). También funciona «escena 3» para ir a una escena.'),
          grid(...ACTIONS.map((a) => f.commas(ACTION_LABELS[a], `voice.commands.${a}`, { hint: ACTION_HINTS[a] || ' ' })))),
        card('Probar frase', h('div', { class: 'inline' }, testInput), testOut),
        card('IA para frases ambiguas',
          note('Si la frase no coincide con el diccionario, se envía a Claude o Gemini (por el servidor) para interpretarla. Agrega algo de latencia y costo por consulta.'),
          grid(
            f.toggle('Usar IA para frases que no coinciden', 'voice.aiIntent.enabled'),
            f.select('Proveedor', 'voice.aiIntent.provider', [['claude', 'Claude'], ['gemini', 'Gemini']]),
            f.number('Máximo de palabras a consultar', 'voice.aiIntent.maxWords', { min: 2, max: 40, hint: 'Frases más largas se consideran conversación, no órdenes.' })))),
    };
  },
};
