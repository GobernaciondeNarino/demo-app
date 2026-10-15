/**
 * Prueba de punta a punta con Playwright (Chromium, cámara y micrófono simulados)
 * contra el sitio PHP real y el servidor simulado de ElevenLabs/Claude/Gemini.
 * Recorre los criterios de aceptación de la Fase 1 que se pueden automatizar.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8092/';
const SITE = process.env.SITE;
const OUT = process.env.OUT || '.';
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const KEYS = { eleven: 'test-eleven-key', claude: 'test-claude-key', gemini: 'test-gemini-key' };
const USER = 'admin';
const PASS = 'clave-de-prueba-123';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ✗ ${name}\n      ${String(err.message).split('\n').join('\n      ')}`);
  }
}

async function waitFor(fn, { timeout = 8000, every = 100, msg = 'condición' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) { last = e; }
    await sleep(every);
  }
  throw new Error(`Tiempo agotado esperando: ${msg} (último valor: ${JSON.stringify(last)?.slice(0, 200)})`);
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await context.grantPermissions(['microphone', 'camera']);

// Todo el tráfico se revisa: ninguna respuesta puede contener una llave API.
const bodies = [];
context.on('response', async (res) => {
  try {
    const type = res.headers()['content-type'] || '';
    if (/json|text|javascript|html/.test(type)) bodies.push({ url: res.url(), text: await res.text() });
  } catch { /* respuesta sin cuerpo */ }
});
const consoleErrors = [];
const watch = (page, label) => {
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`);
  });
};

const admin = await context.newPage();
watch(admin, 'admin');
let pres;
let presenter;
const P = (fn, arg) => pres.evaluate(fn, arg);

console.log('Panel admin');

await step('Instalación: crea el administrador con el código de keys.php', async () => {
  await admin.goto(`${BASE}wj-admin/`);
  await admin.waitForSelector('input[name=code]');
  const keys = fs.readFileSync(path.join(SITE, 'wj-content/data/keys.php'), 'utf8');
  const code = keys.match(/administrador\): ([A-F0-9-]+)/)[1];
  await admin.fill('input[name=code]', 'MAL-CODIGO');
  await admin.fill('input[name=username]', USER);
  await admin.fill('input[name=password]', PASS);
  await admin.fill('input[name=password2]', PASS);
  await admin.click('button[type=submit]');
  await admin.waitForSelector('.form-error:has-text("Código de instalación incorrecto")');
  await admin.fill('input[name=code]', code);
  await admin.click('button[type=submit]');
  await admin.waitForSelector('.sidenav');
  const users = fs.readFileSync(path.join(SITE, 'wj-content/data', fs.readdirSync(path.join(SITE, 'wj-content/data')).find((d) => d.startsWith('store-')), 'users.json'), 'utf8');
  assert.match(users, /\$2y\$12\$/, 'contraseña con bcrypt');
  assert.ok(!users.includes(PASS));
});

await step('APIs: guarda las tres llaves (cifradas) y muestra solo la versión enmascarada', async () => {
  await admin.goto(`${BASE}wj-admin/#apis`);
  const cards = admin.locator('section.card');
  for (const [i, key] of [[0, KEYS.eleven], [1, KEYS.claude], [2, KEYS.gemini]]) {
    await cards.nth(i).locator('input[type=password]').fill(key);
    await cards.nth(i).getByRole('button', { name: 'Guardar llave' }).click();
    await cards.nth(i).locator('.pill-ok').waitFor();
  }
  const store = path.join(SITE, 'wj-content/data', fs.readdirSync(path.join(SITE, 'wj-content/data')).find((d) => d.startsWith('store-')));
  const secrets = fs.readFileSync(path.join(store, 'secrets.json'), 'utf8');
  for (const k of Object.values(KEYS)) assert.ok(!secrets.includes(k), 'la llave no está en texto plano en el disco');
  assert.match(secrets, /"value": "v1:/);
  assert.equal(await admin.locator('code', { hasText: 'test••••••••' }).count(), 3);
});

await step('APIs: «Probar conexión» de ElevenLabs lista voces y se elige una masculina', async () => {
  const eleven = admin.locator('section.card').first();
  await eleven.getByRole('button', { name: 'Probar conexión' }).click();
  await eleven.locator('.test-result.is-ok').waitFor();
  const sel = eleven.locator('.voice-list select');
  const firstVoice = await sel.locator('option').nth(1).textContent();
  assert.match(firstVoice, /Mateo · masculina/, 'las voces masculinas aparecen primero');
  await sel.selectOption('VozMasc456');
  assert.equal(await eleven.locator('input[maxlength="64"]').inputValue(), 'VozMasc456');
});

await step('APIs: «Probar conexión» de Claude y Gemini', async () => {
  for (const i of [1, 2]) {
    const c = admin.locator('section.card').nth(i);
    await c.getByRole('button', { name: 'Probar conexión' }).click();
    await c.locator('.test-result.is-ok').waitFor();
    assert.match(await c.locator('.test-result').textContent(), /disponible/);
  }
});

await step('Guardar: valida en el servidor y pregenera los audios con ElevenLabs', async () => {
  await admin.click('button:has-text("Guardar cambios")');
  await admin.locator('.save-msg', { hasText: /Audios listos/ }).waitFor({ timeout: 20000 });
  const files = fs.readdirSync(path.join(SITE, 'wj-admin/cache/tts')).filter((f) => f.endsWith('.mp3'));
  assert.ok(files.length >= 10, `audios en caché: ${files.length}`);
});

await step('Voz: «Probar frase» usa el mismo diccionario que la presentación', async () => {
  await admin.goto(`${BASE}wj-admin/#voz`);
  const input = admin.getByPlaceholder('Ej.: Ñaño, siguiente por favor');
  await input.fill('Ñaño, continúa igual');
  await admin.locator('.test-result', { hasText: 'Continuar igual' }).waitFor();
  await input.fill('en el siguiente paso veremos');
  await admin.locator('.test-result', { hasText: 'palabra de activación' }).waitFor();
});

await step('Voz: activa la IA para frases ambiguas y guarda', async () => {
  await admin.getByText('Usar IA para frases que no coinciden').click();
  await admin.click('button:has-text("Guardar cambios")');
  await admin.locator('.save-msg', { hasText: /Audios listos|Guardado/ }).waitFor({ timeout: 20000 });
});

await step('Gestos: la vista previa carga MediaPipe y la cámara (con la CSP del panel)', async () => {
  await admin.goto(`${BASE}wj-admin/#gestos`);
  await admin.click('button:has-text("Iniciar vista previa")');
  await admin.locator('.test-result', { hasText: 'Cámara activa' }).waitFor({ timeout: 30000 });
  await sleep(800);
  await admin.screenshot({ path: path.join(SHOTS, 'a-gestos.png') });
  await admin.click('button:has-text("Detener vista previa")');
});

console.log('Presentación');

await step('Abre la presentación, precarga las voces y arranca', async () => {
  pres = await context.newPage();
  watch(pres, 'presentación');
  await pres.goto(BASE);
  await pres.waitForSelector('#start-btn:not([hidden]):not([disabled])');
  await waitFor(() => P(() => { const s = window.__presentation.responder.stats(); return s.total > 0 && s.loaded === s.total; }), { msg: 'voces precargadas', timeout: 15000 });
  await pres.screenshot({ path: path.join(SHOTS, 'p01-inicio.png') });
  await pres.click('#start-btn');
  await waitFor(() => P(() => window.__presentation.started), { msg: 'iniciada' });
  await sleep(1500);
  await pres.screenshot({ path: path.join(SHOTS, 'p02-escena1.png') });
});

const index = () => P(() => window.__presentation.sceneManager.index);
const idle = () => waitFor(() => P(() => !window.__presentation.sceneManager.isTransitioning), { msg: 'fin de transición' });
const lastLog = () => P(() => window.__presentation.bus.log.at(-1));
const dispatch = (cmd) => P((c) => window.__presentation.bus.dispatch(c), cmd);
const cooldown = () => sleep(1300);

await step('Teclado: → avanza y ← retrocede', async () => {
  await pres.keyboard.press('ArrowRight');
  await waitFor(async () => (await index()) === 1, { msg: 'escena 2' });
  await idle();
  await cooldown();
  await pres.keyboard.press('ArrowLeft');
  await waitFor(async () => (await index()) === 0, { msg: 'escena 1' });
  await idle();
  await cooldown();
});

await step('Cooldown: dos entradas casi simultáneas producen una sola transición', async () => {
  await dispatch({ action: 'NEXT', source: 'gesture' });
  const r = await dispatch({ action: 'NEXT', source: 'voice' });
  assert.equal(r.status, 'cooldown');
  await idle();
  assert.equal(await index(), 1);
  await cooldown();
});

await step('Recordatorio: falta un dato clave → no avanza y la IA lo recuerda', async () => {
  // Escena 2 tiene un dato de ejemplo de prioridad alta.
  const r = await dispatch({ action: 'NEXT', source: 'voice' });
  assert.equal(r.status, 'reminder');
  assert.equal(await index(), 1);
  const st = await P(() => window.__presentation.facts.snapshot());
  assert.match(st.lastReminder.text, /^Antes de continuar, recuerda/);
  await cooldown();
});

await step('«Continuar igual» avanza sin repetir el recordatorio', async () => {
  const r = await dispatch({ action: 'FORCE_NEXT', source: 'voice' });
  assert.equal(r.status, 'ok');
  await idle();
  assert.equal(await index(), 2);
  await cooldown();
});

await step('Si el dato se mencionó con otras palabras (IA), no interrumpe', async () => {
  await dispatch({ action: 'GOTO', arg: 4, source: 'admin' });
  await idle();
  await cooldown();
  await P(() => window.__presentation.facts.addTranscript('Esto ya lo expliqué con otras palabras hace un momento'));
  const r = await dispatch({ action: 'NEXT', source: 'voice' });
  assert.equal(r.status, 'ok', JSON.stringify(r));
  await idle();
  assert.equal(await index(), 4);
  const mock = fs.readFileSync(path.join(OUT, 'mock-requests.jsonl'), 'utf8');
  assert.match(mock, /"path":"\\\/v1\\\/messages"/, 'se consultó a Claude por /coverage');
  await cooldown();
});

await step('La IA no reacciona a su propia voz', async () => {
  const before = await P(() => window.__presentation.bus.log.length);
  await P(() => {
    const v = window.__presentation.voice;
    v.setSpeaking(true);
    v.handle('t:1', 'Ñaño, siguiente', true, 0.95);
    v.setSpeaking(false);
  });
  assert.equal(await P(() => window.__presentation.bus.log.length), before, 'ignorado mientras habla');
  await sleep(650);
  await P(() => window.__presentation.voice.handle('t:2', 'Ñaño, atrás', true, 0.95));
  await waitFor(async () => (await lastLog())?.action === 'PREV', { msg: 'comando tras terminar de hablar' });
  await idle();
  assert.equal(await index(), 3);
  await cooldown();
});

await step('Hablar con el público no cambia de escena (palabra de activación)', async () => {
  const before = await P(() => window.__presentation.bus.log.length);
  await P(() => window.__presentation.voice.handle('t:3', 'en el siguiente paso vamos a ver', true, 0.9));
  await sleep(300);
  assert.equal(await P(() => window.__presentation.bus.log.length), before);
  assert.equal(await index(), 3);
});

await step('Frase ambigua → intención con IA (Claude) → avanza', async () => {
  // Esta escena tiene un dato clave: se menciona antes para que no haya recordatorio.
  await P(() => window.__presentation.facts.addTranscript('ya lo conté con otras palabras'));
  await P(() => window.__presentation.voice.handle('t:4', 'Ñaño, pasemos a lo que viene', true, 0.9));
  await waitFor(async () => (await index()) === 4, { msg: 'avance por intención IA' });
  await idle();
  const log = await lastLog();
  assert.equal(log.source, 'voice');
  await cooldown();
  await dispatch({ action: 'GOTO', arg: 2, source: 'admin' });
  await idle();
  await cooldown();
});

await step('AirPods: acción multimedia «nexttrack» avanza', async () => {
  await P(() => window.__presentation.media.onAction('nexttrack'));
  await waitFor(async () => (await index()) === 2, { msg: 'avance por AirPods' });
  await idle();
  assert.equal((await lastLog()).source, 'media');
  await cooldown();
});

await step('Pantalla negra (B) y HUD (H)', async () => {
  await pres.keyboard.press('KeyB');
  assert.equal(await P(() => document.getElementById('black').classList.contains('is-on')), true);
  await cooldown();
  await pres.keyboard.press('ArrowRight');
  assert.equal(await P(() => document.getElementById('black').classList.contains('is-on')), false, '→ quita el negro sin avanzar');
  assert.equal(await index(), 2);
  await pres.keyboard.press('KeyH');
  assert.equal(await P(() => window.__presentation.hud.visible), false);
  await pres.keyboard.press('KeyH');
  await cooldown();
});

await step('Sin internet: el teclado sigue funcionando y el HUD lo indica', async () => {
  await context.setOffline(true);
  await waitFor(() => P(() => document.querySelector('.hud-icon[data-k="net"]').dataset.state === 'offline'), { msg: 'HUD sin conexión', timeout: 10000 });
  const before = await index();
  await pres.keyboard.press('ArrowLeft');
  await waitFor(async () => (await index()) === before - 1, { msg: 'retroceso sin internet' });
  await idle();
  await cooldown();
  await pres.keyboard.press('ArrowRight');
  await waitFor(async () => (await index()) === before, { msg: 'avance sin internet' });
  await idle();
  await context.setOffline(false);
  await waitFor(() => P(() => document.querySelector('.hud-icon[data-k="net"]').dataset.state === 'on'), { msg: 'reconexión', timeout: 10000 });
  await cooldown();
});

console.log('Sincronización en vivo');

await step('Monitor del panel: ve la escena actual y envía «Siguiente» remoto', async () => {
  await admin.goto(`${BASE}wj-admin/#monitor`);
  await admin.locator('.now-box strong').waitFor();
  await waitFor(async () => /Proteínas/.test(await admin.locator('.now-box strong').textContent()), { msg: 'monitor con escena 3' });
  await admin.click('.remote button:has-text("Siguiente")');
  await waitFor(async () => (await index()) === 3, { msg: 'avance remoto' });
  await idle();
  await admin.locator('.table tbody tr').first().waitFor();
  assert.match(await admin.locator('.table tbody').textContent(), /panel/);
  await admin.screenshot({ path: path.join(SHOTS, 'a-monitor.png'), fullPage: true });
  await cooldown();
});

await step('Cambios del panel se reflejan en la presentación sin recargar', async () => {
  await P(() => { window.__noReload = true; });
  await admin.goto(`${BASE}wj-admin/#escenas`);
  await admin.locator('.scene-toggle').nth(3).click();
  const title = admin.locator('.scene-card.is-open input[maxlength="160"]').first();
  await title.fill('Matemáticas con IA (editado)');
  await admin.click('button:has-text("Guardar cambios")');
  await waitFor(() => P(() => window.__presentation.sceneManager.current.title === 'Matemáticas con IA (editado)'), { msg: 'título actualizado en vivo' });
  assert.equal(await P(() => window.__noReload), true, 'la página no se recargó');
  await sleep(500);
  await pres.screenshot({ path: path.join(SHOTS, 'p03-editado-en-vivo.png') });
});

await step('Vista de presentador: cronómetros, datos clave y control remoto', async () => {
  presenter = await context.newPage();
  watch(presenter, 'presentador');
  await presenter.setViewportSize({ width: 1200, height: 900 });
  await presenter.goto(`${BASE}presentador.html`);
  await waitFor(async () => /Matemáticas con IA/.test(await presenter.locator('.scene-title').textContent()), { msg: 'título en presentador' });
  assert.match(await presenter.locator('.facts').textContent(), /Dato de ejemplo/);
  assert.match(await presenter.locator('.clock-value').first().textContent(), /^\d+:\d\d$/);
  await presenter.screenshot({ path: path.join(SHOTS, 'v-presentador.png'), fullPage: true });
  await presenter.click('.controls button:has-text("Anterior")');
  await waitFor(async () => (await index()) === 2, { msg: 'retroceso desde presentador' });
  await idle();
  await cooldown();
});

await step('Vista de presentador en celular (390 px, sin desplazamiento horizontal)', async () => {
  await presenter.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  const overflow = await presenter.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `desborde horizontal de ${overflow}px`);
  await presenter.screenshot({ path: path.join(SHOTS, 'v-presentador-movil.png') });
});

console.log('Transiciones');

for (const type of ['fade', 'wipe', 'noise', 'zoom']) {
  await step(`Transición «${type}» (captura congelada al 50 %)`, async () => {
    await P((t) => {
      const sm = window.__presentation.sceneManager;
      sm.appConfig.transitions = { type: t, durationMs: 60000 };
      for (const s of sm.sceneCfgs) s.transition = '';
    }, type);
    const target = (await index()) === 2 ? 3 : 2;
    await dispatch({ action: 'GOTO', arg: target + 1, source: 'admin' });
    await waitFor(() => P(() => !!window.__presentation.sceneManager.transition?.tween), { msg: 'inicio de transición', every: 30 });
    // El render por software de las pruebas va lento: se congela el progreso para capturar.
    await P(async () => {
      const t = window.__presentation.sceneManager.transition;
      t.tween.pause();
      t.progress = 0.5;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await pres.screenshot({ path: path.join(SHOTS, `t-${type}.png`) });
    await P(() => window.__presentation.sceneManager.transition.tween.progress(1));
    await idle();
    assert.equal(await index(), target);
    await cooldown();
  });
}

console.log('Películas web en subcarpetas');

await step('Panel: el selector lista «peliculaDemo/» y la dirección completa se vuelve relativa', async () => {
  await admin.goto(`${BASE}wj-admin/#escenas`);
  await admin.click('button:has-text("+ Agregar escena")');
  const card = admin.locator('.scene-card.is-open').last();
  await card.getByLabel('Título', { exact: true }).fill('Película: vida diseñada');
  await card.getByLabel('Tipo de escena', { exact: true }).selectOption('media');
  const url = card.getByLabel('Enlace', { exact: true });
  await url.fill(`${BASE}peliculaDemo/`);
  await url.press('Tab');
  assert.equal(await url.inputValue(), 'peliculaDemo/');
  await card.locator('.url-preview', { hasText: 'página web' }).waitFor();
  await url.fill('');
  await card.getByRole('button', { name: 'Elegir película o archivo…' }).click();
  await card.locator('.media-picker h4', { hasText: 'Carpetas junto a la presentación' }).waitFor();
  await card.locator('.media-picker button', { hasText: 'peliculaDemo/' }).click();
  assert.equal(await url.inputValue(), 'peliculaDemo/');
  await card.getByLabel('Iniciar el contenido después de (segundos)').fill('1.5');
  await admin.click('button:has-text("Guardar cambios")');
  await admin.locator('.save-msg', { hasText: /Audios listos|Guardado/ }).waitFor({ timeout: 20000 });
  await admin.screenshot({ path: path.join(SHOTS, 'a-escena-pelicula.png'), fullPage: true });
});

await step('Película web: tarjeta de título y arranque N s después de entrar a la escena', async () => {
  const total = await waitFor(async () => {
    const n = await P(() => window.__presentation.sceneManager.count);
    return n >= 7 ? n : 0;
  }, { msg: 'nueva escena en la presentación' });
  const t0 = Date.now();
  await dispatch({ action: 'GOTO', arg: total, source: 'admin' });
  await sleep(400);
  assert.equal(await pres.locator('.web-frame').count(), 0, 'la película aún no se carga');
  assert.equal((await P(() => window.__presentation.buildState().scene.media)).state, 'waiting');
  await pres.screenshot({ path: path.join(SHOTS, 'w1-tarjeta.png') });
  await pres.locator('.web-frame.is-visible').waitFor({ timeout: 12000 });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 1400, `arrancó a los ${elapsed} ms`);
  assert.ok(await P(() => !!document.querySelector('.web-frame').contentWindow.startedAt), 'la película cargó');
  await sleep(900);
  await pres.screenshot({ path: path.join(SHOTS, 'w2-pelicula.png') });
  assert.equal((await P(() => window.__presentation.buildState().scene.media)).state, 'playing');
  await cooldown();
});

await step('Película web: pausar la presentación pausa la película (tecla Espacio)', async () => {
  const frame = () => P(() => { const w = document.querySelector('.web-frame').contentWindow; return { playing: w.playing, keys: w.keysReceived }; });
  await dispatch({ action: 'TOGGLE_PAUSE', source: 'voice' });
  assert.deepEqual(await frame(), { playing: false, keys: ['Space'] });
  await cooldown();
  await dispatch({ action: 'TOGGLE_PAUSE', source: 'voice' });
  assert.equal((await frame()).playing, true);
  await cooldown();
});

await step('Película web: las flechas pulsadas dentro de la película cambian de escena (no la adelantan)', async () => {
  const before = await index();
  await P(() => document.querySelector('.web-frame').contentWindow.focus());
  await pres.keyboard.press('ArrowLeft');
  await waitFor(async () => (await index()) === before - 1, { msg: 'retroceso desde dentro de la película' });
  const keys = await P(() => document.querySelector('.web-frame')?.contentWindow.keysReceived || []);
  assert.ok(!keys.includes('ArrowLeft'), `la película no recibió la flecha (${keys})`);
  await idle();
  assert.equal(await pres.locator('.web-frame').count(), 0, 'la película se descarga al salir');
  await cooldown();
});

console.log('Cierre y seguridad');

await step('Al pasar la última escena se guarda el resumen del ensayo', async () => {
  const total = await P(() => window.__presentation.sceneManager.count);
  await P((n) => { window.__presentation.sceneManager.appConfig.transitions.durationMs = 300; return n; }, total);
  await dispatch({ action: 'GOTO', arg: total, source: 'admin' });
  await idle();
  await cooldown();
  const r = await dispatch({ action: 'NEXT', source: 'keyboard' });
  assert.equal(r.status, 'end');
  await admin.goto(`${BASE}wj-admin/#ensayos`);
  await admin.locator('table.table').first().waitFor();
  assert.match(await admin.locator('.stack').textContent(), /Apertura en vivo/);
  await admin.screenshot({ path: path.join(SHOTS, 'a-ensayos.png'), fullPage: true });
});

await step('Ninguna llave API viaja al navegador', async () => {
  const leaks = bodies.filter((b) => Object.values(KEYS).some((k) => b.text.includes(k)));
  assert.deepEqual(leaks.map((l) => l.url), []);
});

await step('Bloqueo tras 5 intentos fallidos', async () => {
  const other = await browser.newContext();
  const page = await other.newPage();
  await page.goto(`${BASE}wj-admin/`);
  const statuses = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch('routes/session.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', username: 'admin', password: `mala-${i}` }) });
      out.push(r.status);
    }
    return out;
  });
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  await other.close();
});

await step('Sin sesión, las rutas protegidas responden 401 y sin CSRF 403', async () => {
  const other = await browser.newContext();
  const page = await other.newPage();
  await page.goto(`${BASE}wj-admin/`);
  const s1 = await page.evaluate(async () => (await fetch('routes/config.php')).status);
  assert.equal(s1, 401);
  const s2 = await admin.evaluate(async () => (await fetch('routes/config.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"reset"}' })).status);
  assert.equal(s2, 403);
  await other.close();
});

await step('Formato de las peticiones a Claude (salida estructurada + fallbacks)', async () => {
  const reqs = fs.readFileSync(path.join(OUT, 'mock-requests.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const msgs = reqs.filter((r) => r.path === '/v1/messages');
  assert.ok(msgs.length >= 2);
  for (const m of msgs) {
    assert.equal(m.body.model, 'claude-opus-5-5');
    assert.equal(m.body.fallbacks, 'default');
    assert.equal(m.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
    assert.equal(m.body.output_config.format.type, 'json_schema');
    assert.equal(m.body.output_config.effort, 'low');
  }
});

await step('Sin errores de JavaScript en consola', async () => {
  assert.deepEqual(consoleErrors.filter((e) => !/GL Driver|XNNPACK|TensorFlow Lite/.test(e)), []);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} pasos correctos. Capturas: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
