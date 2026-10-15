import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FactsAssistant } from '../../wj-includes/core/FactsAssistant.js';

const scene = {
  id: 's2', title: 'IA y salud',
  facts: [
    { id: 'f1', text: 'El modelo identificó 3 nuevas familias de virus', keywords: ['3 familias|tres familias', 'virus'], priority: 'alta' },
    { id: 'f2', text: 'Se probaron en ratones', keywords: ['ratones'], priority: 'media' },
  ],
};
const cfg = (over = {}) => ({
  scenes: [scene],
  reminders: { enabled: true, onlyHigh: false, maxPerScene: 1, provider: 'local', checkIntervalMs: 60000, timeoutMs: 200, applyTo: 'voice', template: 'Recuerda: {dato}', ...over },
});

test('recuerda el dato faltante solo una vez por escena', async () => {
  const fa = new FactsAssistant({ post: async () => ({ covered: [] }) });
  fa.configure(cfg());
  fa.setScene(scene);
  fa.addTranscript('Hoy hablamos de inteligencia artificial y salud');
  const r1 = await fa.checkBeforeAdvance('voice');
  assert.equal(r1.ok, false);
  assert.equal(r1.fact.id, 'f1', 'primero la prioridad alta');
  assert.equal(r1.text, 'Recuerda: El modelo identificó 3 nuevas familias de virus');
  const r2 = await fa.checkBeforeAdvance('voice');
  assert.equal(r2.ok, true, 'al segundo «siguiente» avanza');
  clearInterval(fa.interval);
});

test('si el dato se mencionó (palabras clave), no interrumpe', async () => {
  const fa = new FactsAssistant({ post: async () => ({ covered: [] }) });
  fa.configure(cfg({ onlyHigh: true }));
  fa.setScene(scene);
  fa.addTranscript('el sistema encontró tres familias nuevas de virus en muestras');
  assert.equal((await fa.checkBeforeAdvance('voice')).ok, true);
  clearInterval(fa.interval);
});

test('la IA reconoce un dato dicho con otras palabras', async () => {
  let calls = 0;
  const api = { post: async (route, body) => { calls++; assert.equal(route, 'coverage'); return { covered: body.facts.map((f) => f.id) }; } };
  const fa = new FactsAssistant(api);
  fa.configure(cfg({ provider: 'claude', timeoutMs: 500 }));
  fa.setScene(scene);
  fa.addTranscript('descubrió un trío de grupos virales desconocidos y lo validaron en roedores');
  const r = await fa.checkBeforeAdvance('voice');
  assert.equal(r.ok, true);
  assert.ok(calls >= 1);
  clearTimeout(fa.debounce);
  clearInterval(fa.interval);
});

test('con «solo voz», el clicker no se detiene por recordatorios', async () => {
  const fa = new FactsAssistant({ post: async () => ({ covered: [] }) });
  fa.configure(cfg());
  fa.setScene(scene);
  assert.equal((await fa.checkBeforeAdvance('keyboard')).ok, true);
  clearInterval(fa.interval);
});

test('si va atrasado, solo cuentan los datos de prioridad alta', async () => {
  const fa = new FactsAssistant({ post: async () => ({ covered: [] }) });
  fa.configure(cfg());
  fa.setScene(scene);
  fa.addTranscript('tres familias de virus');
  fa.setBehind(true);
  assert.equal((await fa.checkBeforeAdvance('voice')).ok, true, 'f2 (media) se omite por tiempo');
  clearTimeout(fa.debounce);
  clearInterval(fa.interval);
});
