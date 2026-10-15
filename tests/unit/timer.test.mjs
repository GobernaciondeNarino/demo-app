import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlockTimer } from '../../wj-includes/core/BlockTimer.js';

function fakeClock(timer) {
  let t = 1000;
  timer.now = () => t;
  return (s) => { t += s; };
}

const blocks = [
  { id: 'b1', name: 'Apertura', minutes: 3 },
  { id: 'b2', name: 'Salud', minutes: 4 },
];
const timing = { enabled: true, behindSeconds: 60 };

test('avisos de un minuto y de tiempo cumplido, una vez por bloque', () => {
  const timer = new BlockTimer();
  const advance = fakeClock(timer);
  timer.configure(blocks, timing);
  const warnings = [];
  timer.addEventListener('warning', (e) => warnings.push(`${e.detail.kind}:${e.detail.block.id}`));
  timer.start('b1');
  advance(119); timer.tick();
  assert.deepEqual(warnings, []);
  advance(2); timer.tick();
  assert.deepEqual(warnings, ['oneMinute:b1']);
  advance(30); timer.tick();
  assert.deepEqual(warnings, ['oneMinute:b1']);
  advance(30); timer.tick();
  assert.deepEqual(warnings, ['oneMinute:b1', 'timeUp:b1']);
});

test('retraso y resumen por bloque', () => {
  const timer = new BlockTimer();
  const advance = fakeClock(timer);
  timer.configure(blocks, timing);
  timer.start('b1');
  advance(250); // 70 s de más en el bloque 1
  timer.setBlock('b2');
  advance(30);
  assert.equal(Math.round(timer.delay()), 70);
  assert.equal(timer.behind, true);
  timer.pause();
  advance(500);
  timer.resume();
  advance(10);
  const s = timer.end();
  assert.equal(s.actualSeconds, 290);
  assert.deepEqual(s.blocks.map((b) => [b.id, b.spent, b.diff]), [['b1', 250, 70], ['b2', 40, -200]]);
});
