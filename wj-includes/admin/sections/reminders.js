/** Sección 7: asistente de datos clave (recordatorios). */
import { h } from '../../ui/dom.js';
import { card, grid, note } from './ui.js';

export default {
  id: 'recordatorios',
  title: 'Recordatorios',
  intro: 'Ñaño escucha mientras presenta. Si pide «siguiente» y olvidó un dato clave de la escena, se lo recuerda antes de avanzar.',
  render(ctx) {
    const { f } = ctx;
    const total = ctx.draft.scenes.reduce((n, s) => n + s.facts.length, 0);
    return h('div', { class: 'stack' },
      note(`Hay ${total} dato(s) clave en ${ctx.draft.scenes.filter((s) => s.facts.length).length} escena(s). Se editan en «Escenas».`),
      card('Funcionamiento',
        grid(
          f.toggle('Asistente de datos clave activo', 'reminders.enabled'),
          f.select('Verificar con', 'reminders.provider', [['claude', 'Claude (entiende otras palabras)'], ['gemini', 'Gemini (entiende otras palabras)'], ['local', 'Solo palabras clave (sin internet)']]),
          f.select('Aplicar al pedir avanzar con', 'reminders.applyTo', [['voice', 'Solo voz'], ['all', 'Cualquier entrada (voz, gesto, AirPods, clicker)']]),
          f.number('Máximo de recordatorios por escena', 'reminders.maxPerScene', { min: 1, max: 5, hint: 'Por defecto 1, para no interrumpir de más. Al segundo «siguiente» avanza.' }),
          f.toggle('Recordar solo datos de prioridad alta', 'reminders.onlyHigh', { hint: 'Si va atrasado más del umbral (sección Bloques), esto se activa solo.' }),
          f.number('Espera máxima de la IA al pedir avanzar', 'reminders.timeoutMs', { min: 200, max: 5000, step: 100, suffix: 'ms', hint: 'Si la IA no responde en ese tiempo, se usan las palabras clave.' }),
          f.number('Verificación en segundo plano cada', 'reminders.checkIntervalMs', { min: 5000, max: 120000, step: 1000, suffix: 'ms' }))),
      card('Cómo suena',
        grid(
          f.select('Salida del recordatorio', 'reminders.output', [
            ['discreet', 'Solo en mis AirPods (discreto, recomendado)'],
            ['public', 'Parlantes del auditorio'],
            ['both', 'Ambos'],
            ['text', 'Solo texto en la vista de presentador'],
          ], { hint: 'El texto siempre aparece en la vista de presentador.' }),
          f.text('Frase del recordatorio', 'reminders.template', { maxlength: 200, hint: '{dato} se reemplaza por el texto del dato.' })),
        note('Para salir del recordatorio: hable del dato y vuelva a decir «siguiente», o diga «Ñaño, continuar igual» / «ya lo dije».')),
      card('Privacidad',
        grid(f.toggle('Guardar transcripciones con el resumen del ensayo (cifradas)', 'reminders.saveTranscripts')),
        h('p', { class: 'hint' }, 'Por defecto la transcripción vive en memoria durante la escena y se descarta al avanzar. Para verificar los datos se envía (por el servidor) a la IA elegida, que no la guarda. Para el monitor en vivo, el servidor conserva solo el fragmento actual, que se sobrescribe cada segundo; no se guarda un historial.')));
  },
};
