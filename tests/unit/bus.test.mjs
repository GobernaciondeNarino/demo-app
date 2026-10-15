import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandBus } from '../../wj-includes/core/CommandBus.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('cooldown: un gesto y una palabra casi simultáneos producen una sola acción', async () => {
  const bus = new CommandBus({ cooldownMs: 300 });
  const handled = [];
  bus.setHandler(async (c) => { handled.push(`${c.action}/${c.source}`); return { status: 'ok' }; });
  await bus.dispatch({ action: 'NEXT', source: 'gesture' });
  const r = await bus.dispatch({ action: 'NEXT', source: 'voice' });
  assert.equal(r.status, 'cooldown');
  assert.deepEqual(handled, ['NEXT/gesture']);
  await sleep(320);
  await bus.dispatch({ action: 'NEXT', source: 'keyboard' });
  assert.deepEqual(handled, ['NEXT/gesture', 'NEXT/keyboard']);
});

test('durante una transición se encola un solo comando', async () => {
  const bus = new CommandBus({ cooldownMs: 0 });
  let busy = true;
  bus.setBusyCheck(() => busy);
  const handled = [];
  bus.setHandler(async (c) => { handled.push(c.action); return { status: 'ok' }; });
  assert.equal((await bus.dispatch({ action: 'NEXT', source: 'voice' })).status, 'queued');
  assert.equal((await bus.dispatch({ action: 'PREV', source: 'voice' })).status, 'queued');
  assert.deepEqual(handled, []);
  busy = false;
  bus.flushQueue();
  await sleep(5);
  assert.deepEqual(handled, ['PREV'], 'solo el último encolado');
});

test('comandos remotos duplicados (servidor + canal local) se ignoran', async () => {
  const bus = new CommandBus({ cooldownMs: 0 });
  let n = 0;
  bus.setHandler(async () => { n++; return { status: 'ok' }; });
  await bus.dispatch({ id: 'abc', action: 'NEXT', source: 'admin' });
  const r = await bus.dispatch({ id: 'abc', action: 'NEXT', source: 'admin' });
  assert.equal(r.status, 'duplicate');
  assert.equal(n, 1);
});

test('el registro guarda fuente, acción, confianza y resultado', async () => {
  const bus = new CommandBus({ cooldownMs: 0 });
  bus.setHandler(async () => ({ status: 'reminder', detail: 'dato' }));
  const logs = [];
  bus.addEventListener('log', (e) => logs.push(e.detail));
  await bus.dispatch({ action: 'NEXT', source: 'voice', confidence: 0.93 });
  assert.equal(logs[0].source, 'voice');
  assert.equal(logs[0].confidence, 0.93);
  assert.equal(logs[0].status, 'reminder');
});
