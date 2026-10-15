import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceMatcher } from '../../wj-includes/inputs/VoiceMatcher.js';
import { normalize, keywordMatches } from '../../wj-includes/core/text.js';

const cfg = {
  wakeWord: { enabled: true, words: ['ñaño', 'ñano', 'naño', 'nano', 'nanyo'] },
  commands: {
    NEXT: ['siguiente', 'continúa', 'avanza', 'adelante'],
    PREV: ['atrás', 'regresa', 'anterior', 'devuélvete'],
    REPEAT: ['repite', 'otra vez'],
    FORCE_NEXT: ['continuar igual', 'continúa igual', 'ya lo dije'],
    NARRATE: ['cuéntanos', 'tu turno'],
  },
};

test('normaliza tildes, ñ y signos', () => {
  assert.equal(normalize('¡Ñaño, Siguiente!'), 'nano siguiente');
  assert.equal(normalize('  Devuélvete   POR favor '), 'devuelvete por favor');
});

test('comando con palabra de activación', () => {
  const m = new VoiceMatcher(cfg);
  assert.equal(m.match('Ñaño, siguiente').action, 'NEXT');
  assert.equal(m.match('ñaño siguiente por favor').action, 'NEXT');
  assert.equal(m.match('Nano, devuélvete').action, 'PREV');
  assert.equal(m.match('Ñaño, tu turno').action, 'NARRATE');
});

test('hablar con el público no dispara comandos', () => {
  const m = new VoiceMatcher(cfg);
  assert.equal(m.match('en el siguiente paso vamos a ver proteínas').action, null);
  assert.equal(m.match('hace años atrás nadie lo sabía').action, null);
});

test('gana la frase más larga', () => {
  const m = new VoiceMatcher(cfg);
  assert.equal(m.match('Ñaño, continúa igual').action, 'FORCE_NEXT');
  assert.equal(m.match('Ñaño, ya lo dije').action, 'FORCE_NEXT');
  assert.equal(m.match('Ñaño, continúa').action, 'NEXT');
});

test('ir a escena por número', () => {
  const m = new VoiceMatcher(cfg);
  assert.deepEqual([m.match('Ñaño, ve a la escena tres').action, m.match('Ñaño, ve a la escena tres').arg], ['GOTO', 3]);
  assert.equal(m.match('ñaño escena 5').arg, 5);
});

test('ventana tras decir solo el nombre', () => {
  const m = new VoiceMatcher(cfg);
  const first = m.match('Ñaño');
  assert.equal(first.wake, true);
  assert.equal(first.action, null);
  assert.equal(m.match('siguiente', { wakeActive: true }).action, 'NEXT');
  assert.equal(m.match('siguiente', { wakeActive: false }).action, null);
});

test('sin palabra de activación cualquier frase cuenta', () => {
  const m = new VoiceMatcher({ ...cfg, wakeWord: { enabled: false, words: [] } });
  assert.equal(m.match('siguiente').action, 'NEXT');
});

test('palabras clave de datos (alternativas con |)', () => {
  const t = normalize('El modelo identificó tres nuevas familias de virus');
  assert.equal(keywordMatches(t, '3 familias|tres nuevas familias'), true);
  assert.equal(keywordMatches(t, 'virus'), true);
  assert.equal(keywordMatches(t, 'bacterias'), false);
  assert.equal(keywordMatches(t, 'vir'), false, 'debe coincidir palabra completa');
});
