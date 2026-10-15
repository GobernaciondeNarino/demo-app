/** Piezas de interfaz compartidas por las secciones del panel. */
import { h } from '../../ui/dom.js';

export function card(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', {}, title) : null, ...children);
}

export function grid(...children) {
  return h('div', { class: 'form-grid' }, ...children);
}

export function note(text, kind = 'info') {
  return h('p', { class: `callout callout-${kind}` }, text);
}

export function statusPill(ok, textOk, textNo) {
  return h('span', { class: `pill ${ok ? 'pill-ok' : 'pill-off'}` }, ok ? textOk : textNo);
}

/** Botón que muestra "trabajando…" mientras corre una promesa. */
export function asyncButton(label, fn, cls = 'btn-ghost') {
  const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
  b.addEventListener('click', async () => {
    b.disabled = true;
    const prev = b.textContent;
    b.textContent = 'Un momento…';
    try {
      await fn(b);
    } finally {
      b.disabled = false;
      b.textContent = prev;
    }
  });
  return b;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
