import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureLogic } from '../../wj-includes/inputs/GestureLogic.js';

// Misma configuración por defecto que wj-admin/lib/config.php
const cfg = () => ({
  minConfidence: 0.7,
  stillness: 0.04,
  graceMs: 250,
  cooldownMs: 2000,
  swipe: { enabled: false, minDistance: 0.3, maxDurationMs: 400 },
  map: {
    Closed_Fist: { Right: 'NEXT', Left: 'PREV' },
    Open_Palm: { Right: 'NONE', Left: 'NONE' },
    Thumb_Up: { Right: 'NONE', Left: 'NONE' },
    swipe_left: { Right: 'NEXT', Left: 'NEXT' },
    swipe_right: { Right: 'PREV', Left: 'PREV' },
  },
  holdMs: { Closed_Fist: 1000, Open_Palm: 1000, Thumb_Up: 1000 },
});

/** Simula cuadros a 20 fps. frames(t) → lista de manos en el instante t (ms). */
function run(logic, durationMs, frames, t0 = 0) {
  const events = [];
  for (let t = t0; t <= t0 + durationMs; t += 50) {
    events.push(...logic.update(frames(t), t).events);
  }
  return events;
}

test('puño derecho quieto 1 s → siguiente; puño izquierdo quieto → anterior', () => {
  const logic = new GestureLogic(cfg());
  let ev = run(logic, 1100, () => [{ hand: 'Right', gesture: 'Closed_Fist', score: 0.9, cx: 0.6, cy: 0.4 }]);
  assert.deepEqual(ev.map((e) => e.action), ['NEXT']);
  ev = run(logic, 1100, () => [{ hand: 'Left', gesture: 'Closed_Fist', score: 0.9, cx: 0.3, cy: 0.4 }], 5000);
  assert.deepEqual(ev.map((e) => e.action), ['PREV']);
});

test('hablar moviendo las manos (puño en movimiento) no dispara nada', () => {
  const logic = new GestureLogic(cfg());
  // La mano oscila ±8 % del encuadre mientras se habla, con el puño cerrado a ratos.
  const ev = run(logic, 6000, (t) => [{ hand: 'Right', gesture: 'Closed_Fist', score: 0.85, cx: 0.5 + 0.08 * Math.sin(t / 180), cy: 0.6 + 0.03 * Math.cos(t / 220) }]);
  assert.deepEqual(ev, []);
});

test('palma abierta y otros gestos sin acción no hacen nada', () => {
  const logic = new GestureLogic(cfg());
  const ev = run(logic, 3000, () => [
    { hand: 'Right', gesture: 'Open_Palm', score: 0.95, cx: 0.6, cy: 0.4 },
    { hand: 'Left', gesture: 'Thumb_Up', score: 0.95, cx: 0.3, cy: 0.4 },
  ]);
  assert.deepEqual(ev, []);
});

test('un puño breve (menos del tiempo de sostenido) no cuenta', () => {
  const logic = new GestureLogic(cfg());
  const ev = run(logic, 3000, (t) => [{ hand: 'Right', gesture: t % 1500 < 700 ? 'Closed_Fist' : 'Open_Palm', score: 0.9, cx: 0.6, cy: 0.4 }]);
  assert.deepEqual(ev, []);
});

test('parpadeos sueltos de la clasificación no reinician el gesto', () => {
  const logic = new GestureLogic(cfg());
  // Cada 300 ms un cuadro se clasifica mal.
  const ev = run(logic, 1300, (t) => [{ hand: 'Right', gesture: t % 300 === 0 && t > 0 ? 'None' : 'Closed_Fist', score: 0.9, cx: 0.6, cy: 0.4 }]);
  assert.deepEqual(ev.map((e) => e.action), ['NEXT']);
});

test('mantener el puño no repite: hay que soltarlo; y hay enfriamiento', () => {
  const logic = new GestureLogic(cfg());
  const fist = () => [{ hand: 'Right', gesture: 'Closed_Fist', score: 0.9, cx: 0.6, cy: 0.4 }];
  assert.equal(run(logic, 5000, fist).length, 1, 'un solo disparo aunque siga 5 s');
  // Suelta y vuelve a cerrar el puño enseguida: el enfriamiento evita un segundo disparo inmediato.
  const logic2 = new GestureLogic(cfg());
  const seq = (t) => [{ hand: 'Right', gesture: t < 1100 || t > 1500 ? 'Closed_Fist' : 'Open_Palm', score: 0.9, cx: 0.6, cy: 0.4 }];
  const ev = [];
  for (let t = 0; t <= 4000; t += 50) ev.push(...logic2.update(seq(t), t).events.map((e) => ({ ...e, t })));
  assert.equal(ev.length, 2);
  assert.ok(ev[1].t - ev[0].t >= 2000, `segundo disparo tras el enfriamiento (${ev[1].t - ev[0].t} ms)`);
});

test('confianza baja no cuenta', () => {
  const logic = new GestureLogic(cfg());
  const ev = run(logic, 2000, () => [{ hand: 'Right', gesture: 'Closed_Fist', score: 0.5, cx: 0.6, cy: 0.4 }]);
  assert.deepEqual(ev, []);
});

test('el swipe está apagado por defecto y, si se activa, respeta el enfriamiento', () => {
  const moving = (t) => [{ hand: 'Right', gesture: 'Open_Palm', score: 0.9, cx: 0.8 - (t % 600) / 600, cy: 0.5 }];
  assert.deepEqual(run(new GestureLogic(cfg()), 3000, moving), []);
  const c = cfg();
  c.swipe.enabled = true;
  const ev = run(new GestureLogic(c), 1900, moving);
  assert.equal(ev.length, 1, 'un solo swipe dentro del enfriamiento');
  assert.equal(ev[0].action, 'NEXT');
});

test('progreso: solo avanza con la mano quieta', () => {
  const logic = new GestureLogic(cfg());
  logic.update([{ hand: 'Left', gesture: 'Closed_Fist', score: 0.9, cx: 0.3, cy: 0.4 }], 0);
  const p1 = logic.update([{ hand: 'Left', gesture: 'Closed_Fist', score: 0.9, cx: 0.3, cy: 0.4 }], 500).progress[0];
  assert.ok(p1.p > 0.45 && p1.still);
  const p2 = logic.update([{ hand: 'Left', gesture: 'Closed_Fist', score: 0.9, cx: 0.4, cy: 0.4 }], 550).progress[0];
  assert.equal(p2.p, 0);
  assert.equal(p2.still, false);
});
