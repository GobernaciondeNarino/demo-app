/** Punto de entrada de la presentación (index.html). */
import { PresentationApp } from './core/App.js';

const $ = (id) => document.getElementById(id);
const app = new PresentationApp({
  canvas: $('stage'),
  webLayer: $('web-layer'),
  hud: $('hud'),
  black: $('black'),
  start: $('start'),
  startTitle: $('start-title'),
  startMsg: $('start-msg'),
  startChecks: $('start-checks'),
  startBtn: $('start-btn'),
  loginForm: $('login-form'),
  adminLink: $('admin-link'),
});
window.__presentation = app; // Ayuda de diagnóstico desde la consola del navegador.
app.boot().catch((err) => {
  console.error(err);
  $('start-msg').textContent = `No se pudo iniciar: ${err.message}`;
  $('start-msg').classList.add('is-error');
});

// Ocultar el cursor del mouse durante la presentación (reaparece al moverlo).
let cursorTimer;
window.addEventListener('mousemove', () => {
  document.body.classList.remove('hide-cursor');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
});
