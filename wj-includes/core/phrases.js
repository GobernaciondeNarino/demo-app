/**
 * Lista de frases que la IA puede decir según la configuración. La usan:
 * - el panel, para pregenerar los mp3 con ElevenLabs al guardar;
 * - la presentación, para precargarlos en memoria y responder al instante.
 */
export function reminderText(cfg, fact) {
  return String(cfg.reminders.template || '').replace('{dato}', fact.text).trim();
}

export function collectPhrases(cfg) {
  const items = [];
  const seen = new Set();
  const add = (key, text, kind) => {
    const t = String(text || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    items.push({ key, text: t, kind });
  };

  if (cfg.responses?.enabled) {
    for (const [action, list] of Object.entries(cfg.responses.phrases || {})) {
      (list || []).forEach((text, i) => add(`resp:${action}:${i}`, text, 'respuesta'));
    }
  }
  if (cfg.timing?.enabled && cfg.timing.output !== 'text') {
    add('time:oneMinute', cfg.timing.oneMinute, 'tiempo');
    add('time:timeUp', cfg.timing.timeUp, 'tiempo');
  }
  for (const scene of cfg.scenes || []) {
    if (cfg.reminders?.enabled && cfg.reminders.output !== 'text') {
      for (const fact of scene.facts || []) add(`rem:${fact.id}`, reminderText(cfg, fact), 'recordatorio');
    }
    if (scene.narration?.mode && scene.narration.mode !== 'off') {
      add(`narr:${scene.id}`, scene.narration.text, 'narración');
    }
  }
  return items;
}
