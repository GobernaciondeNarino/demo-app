/** Sección 1: llaves API (cifradas en el servidor) y voz de ElevenLabs. */
import { h, toast } from '../../ui/dom.js';
import { card, grid, note, statusPill, asyncButton } from './ui.js';

const PROVIDERS = [
  { name: 'elevenlabs_api_key', test: 'elevenlabs', title: 'ElevenLabs (voz de la IA)', placeholder: 'sk_…', help: 'Panel de ElevenLabs › Developers › API Keys. Permisos mínimos: Text to Speech y Voices (lectura).' },
  { name: 'claude_api_key', test: 'claude', title: 'Claude (Anthropic)', placeholder: 'sk-ant-…', help: 'console.anthropic.com › API Keys. Se usa para frases ambiguas y para verificar datos clave.' },
  { name: 'gemini_api_key', test: 'gemini', title: 'Gemini (Google)', placeholder: 'AIza…', help: 'aistudio.google.com › Get API key. Alternativa a Claude.' },
];

const TTS_MODELS = [
  ['eleven_flash_v2_5', 'Flash v2.5 — baja latencia (recomendado)'],
  ['eleven_turbo_v2_5', 'Turbo v2.5 — equilibrio'],
  ['eleven_multilingual_v2', 'Multilingual v2 — máxima calidad'],
  ['eleven_v3', 'Eleven v3 — más expresivo'],
];

function keyCard(ctx, p, extra) {
  const s = ctx.secrets[p.name];
  const status = h('div', { class: 'key-status' });
  const paint = () => {
    const cur = ctx.secrets[p.name];
    status.replaceChildren(...[
      statusPill(cur.set, 'Configurada', 'Sin configurar'),
      cur.set ? h('code', {}, cur.masked) : null,
      cur.unreadable ? h('span', { class: 'pill pill-warn' }, 'No se puede descifrar (¿cambió la llave maestra?)') : null,
    ].filter(Boolean));
  };
  paint();
  const input = h('input', { type: 'password', placeholder: s.set ? 'Escriba una nueva llave para reemplazarla' : p.placeholder, autocomplete: 'off', spellcheck: false, 'aria-label': `Llave de ${p.title}` });
  const result = h('div', { class: 'test-result', role: 'status' });

  const saveKey = asyncButton('Guardar llave', async () => {
    const value = input.value.trim();
    if (!value) return toast('Escriba la llave primero.', 'error');
    try {
      const r = await ctx.api.post('config', { action: 'secret', name: p.name, value });
      Object.assign(ctx.secrets, r.secrets);
      ctx.app.secrets = r.secrets;
      input.value = '';
      input.placeholder = 'Escriba una nueva llave para reemplazarla';
      paint();
      toast('Llave guardada y cifrada en el servidor.', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  }, 'btn-primary');
  const removeKey = asyncButton('Borrar', async () => {
    if (!confirm('¿Borrar esta llave del servidor?')) return;
    const r = await ctx.api.post('config', { action: 'secret', name: p.name, value: null });
    Object.assign(ctx.secrets, r.secrets);
    ctx.app.secrets = r.secrets;
    paint();
  });
  const test = asyncButton('Probar conexión', async () => {
    result.className = 'test-result';
    result.textContent = 'Probando…';
    try {
      const r = await ctx.api.post('test', { provider: p.test }, { timeoutMs: 25000 });
      result.classList.add(r.ok ? 'is-ok' : 'is-error');
      result.textContent = r.message + (r.ms ? ` (${r.ms} ms)` : '');
      extra?.onTest?.(r);
    } catch (err) {
      result.classList.add('is-error');
      result.textContent = err.message;
    }
  }, 'btn-accent');

  return card(p.title,
    h('p', { class: 'hint' }, p.help),
    status,
    h('div', { class: 'inline' }, input, saveKey, removeKey),
    h('div', { class: 'inline' }, test),
    result,
    extra?.el || null);
}

export default {
  id: 'apis',
  title: 'APIs',
  intro: 'Las llaves se guardan cifradas (AES-256-GCM) en el servidor y nunca se envían al navegador: aquí solo se ven enmascaradas.',
  render(ctx) {
    const { f } = ctx;
    const voiceList = h('div', { class: 'voice-list' });
    const voicePick = (voices) => {
      const males = voices.filter((v) => /male/i.test(v.gender) && !/female/i.test(v.gender));
      const ordered = [...males, ...voices.filter((v) => !males.includes(v))];
      const sel = h('select', { 'aria-label': 'Voz de ElevenLabs' },
        h('option', { value: '' }, '— Elegir voz —'),
        ordered.map((v) => h('option', { value: v.id, selected: v.id === ctx.draft.tts.voiceId },
          `${v.name}${v.gender ? ` · ${v.gender === 'male' ? 'masculina' : v.gender === 'female' ? 'femenina' : v.gender}` : ''}${v.accent ? ` · ${v.accent}` : ''}`)));
      sel.addEventListener('change', () => {
        const v = voices.find((x) => x.id === sel.value);
        f.set('tts.voiceId', sel.value);
        f.set('tts.voiceName', v?.name || '');
        voiceIdInput.querySelector('input').value = sel.value;
      });
      voiceList.replaceChildren(h('label', { class: 'field' }, 'Voces disponibles (las masculinas primero)', sel));
    };
    const voiceIdInput = f.text('ID de voz (voice ID)', 'tts.voiceId', { hint: 'Se completa al elegir una voz de la lista, o péguelo desde ElevenLabs › Voices.', maxlength: 64 });

    const sample = h('input', { type: 'text', value: 'Hola, soy Ñaño. Claro, avanzamos.', 'aria-label': 'Texto de prueba' });
    const player = h('audio', { controls: true, hidden: true });
    const tryVoice = asyncButton('Escuchar voz guardada', async () => {
      if (ctx.app.dirty) toast('La prueba usa la configuración guardada. Guarde primero si cambió la voz.', 'info', 5000);
      try {
        const ab = await ctx.api.tts(sample.value);
        player.src = URL.createObjectURL(new Blob([ab], { type: 'audio/mpeg' }));
        player.hidden = false;
        await player.play();
      } catch (err) {
        toast(err.message, 'error', 6000);
      }
    });

    const eleven = keyCard(ctx, PROVIDERS[0], {
      onTest: (r) => r.voices && voicePick(r.voices),
      el: h('div', {},
        h('h3', {}, 'Voz'),
        voiceList,
        grid(
          voiceIdInput,
          f.select('Modelo', 'tts.modelId', TTS_MODELS, { hint: 'Las frases se pregeneran y se guardan en caché, así que la latencia del modelo solo importa la primera vez.' }),
          f.range('Velocidad', 'tts.speed', { min: 0.7, max: 1.2, step: 0.05, format: (v) => `${Number(v).toFixed(2)}×` }),
          f.range('Estabilidad', 'tts.stability', { min: 0, max: 1, step: 0.05 }),
          f.range('Similitud', 'tts.similarity', { min: 0, max: 1, step: 0.05 }),
          f.range('Estilo', 'tts.style', { min: 0, max: 1, step: 0.05 }),
          f.range('Volumen', 'tts.volume', { min: 0, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)} %` }),
          f.text('Idioma (código ISO)', 'tts.languageCode', { maxlength: 2, hint: 'es = español.' })),
        h('div', { class: 'inline' }, sample, tryVoice),
        player),
    });

    const aiModels = card('Modelos de IA',
      note('Claude o Gemini se usan para entender frases que no están en el diccionario y para saber si ya mencionó un dato clave aunque lo haya dicho con otras palabras. Si no responden a tiempo, se usa la verificación local por palabras clave.'),
      grid(
        f.text('Modelo de Claude', 'ai.claudeModel', { list: 'claude-models', hint: 'Por defecto claude-opus-5-5. Para menor latencia puede usar claude-haiku-5-5.' }),
        f.select('Esfuerzo de Claude', 'ai.claudeEffort', [['low', 'Bajo (más rápido)'], ['medium', 'Medio'], ['high', 'Alto']]),
        f.text('Modelo de Gemini', 'ai.geminiModel', { list: 'gemini-models', hint: 'Use «Probar conexión» de Gemini para ver los modelos disponibles.' })),
      h('datalist', { id: 'claude-models' }, ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map((m) => h('option', { value: m }))),
      h('datalist', { id: 'gemini-models' }));

    const fillGemini = (r) => {
      const dl = aiModels.querySelector('#gemini-models');
      dl.replaceChildren(...(r.models || []).map((m) => h('option', { value: m.id }, m.name)));
    };

    return h('div', { class: 'stack' },
      eleven,
      keyCard(ctx, PROVIDERS[1]),
      keyCard(ctx, PROVIDERS[2], { onTest: fillGemini }),
      aiModels);
  },
};
