/**
 * Campos de formulario del panel, enlazados a una ruta dentro del borrador
 * de configuración ("voice.wakeWord.enabled"). Cada cambio llama a onChange.
 */
import { h } from '../ui/dom.js';
import { ACTION_LABELS } from '../core/CommandBus.js';

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

let uid = 0;
const nextId = () => `f${++uid}`;

export class Fields {
  /** @param {() => object} getDraft  @param {() => void} onChange */
  constructor(getDraft, onChange) {
    this.getDraft = getDraft;
    this.onChange = onChange;
  }

  get(path) { return getPath(this.getDraft(), path); }

  set(path, value) {
    setPath(this.getDraft(), path, value);
    this.onChange(path, value);
  }

  wrap(label, control, hint, id) {
    return h('div', { class: 'field' },
      h('label', { for: id }, label),
      control,
      hint ? h('p', { class: 'hint', id: `${id}-hint` }, hint) : null);
  }

  text(label, path, { hint, placeholder, type = 'text', maxlength = 300, list } = {}) {
    const id = nextId();
    const input = h('input', {
      id, type, placeholder, maxlength, list, value: this.get(path) ?? '',
      'aria-describedby': hint ? `${id}-hint` : null,
      oninput: () => this.set(path, input.value),
    });
    return this.wrap(label, input, hint, id);
  }

  textarea(label, path, { hint, rows = 3, maxlength = 2000, placeholder } = {}) {
    const id = nextId();
    const ta = h('textarea', { id, rows, maxlength, placeholder, 'aria-describedby': hint ? `${id}-hint` : null, oninput: () => this.set(path, ta.value) });
    ta.value = this.get(path) ?? '';
    return this.wrap(label, ta, hint, id);
  }

  number(label, path, { hint, min, max, step = 1, suffix } = {}) {
    const id = nextId();
    const input = h('input', {
      id, type: 'number', min, max, step, value: this.get(path),
      oninput: () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) this.set(path, v);
      },
    });
    return this.wrap(label, suffix ? h('div', { class: 'with-suffix' }, input, h('span', {}, suffix)) : input, hint, id);
  }

  range(label, path, { hint, min = 0, max = 1, step = 0.01, format = (v) => v } = {}) {
    const id = nextId();
    const out = h('output', { for: id }, format(this.get(path)));
    const input = h('input', {
      id, type: 'range', min, max, step, value: this.get(path),
      oninput: () => {
        const v = parseFloat(input.value);
        out.textContent = format(v);
        this.set(path, v);
      },
    });
    return this.wrap(label, h('div', { class: 'range' }, input, out), hint, id);
  }

  toggle(label, path, { hint } = {}) {
    const id = nextId();
    const input = h('input', { id, type: 'checkbox', role: 'switch', checked: !!this.get(path), onchange: () => this.set(path, input.checked) });
    return h('div', { class: 'field field-toggle' },
      h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', {}, label)),
      hint ? h('p', { class: 'hint' }, hint) : null);
  }

  select(label, path, options, { hint, onchange } = {}) {
    const id = nextId();
    const current = this.get(path);
    const sel = h('select', {
      id,
      onchange: () => {
        this.set(path, sel.value);
        onchange?.(sel.value);
      },
    }, options.map(([value, text]) => h('option', { value, selected: value === current }, text)));
    return this.wrap(label, sel, hint, id);
  }

  action(label, path, { hint, allowed } = {}) {
    const actions = allowed || ['NONE', 'NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'TOGGLE_PAUSE', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE', 'TOGGLE_HUD', 'FULLSCREEN'];
    return this.select(label, path, actions.map((a) => [a, a === 'NONE' ? '— Ninguna —' : ACTION_LABELS[a] || a]), { hint });
  }

  color(label, path, { hint } = {}) {
    const id = nextId();
    const text = h('input', { type: 'text', value: this.get(path), maxlength: 7, class: 'color-text', 'aria-label': `${label} (HEX)` });
    const picker = h('input', { id, type: 'color', value: this.get(path) });
    picker.addEventListener('input', () => {
      text.value = picker.value.toUpperCase();
      this.set(path, text.value);
    });
    text.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(text.value)) {
        picker.value = text.value;
        this.set(path, text.value.toUpperCase());
      }
    });
    return this.wrap(label, h('div', { class: 'color' }, picker, text), hint, id);
  }

  /** Lista de textos editada como una línea por elemento. */
  lines(label, path, { hint, rows = 3, placeholder } = {}) {
    const id = nextId();
    const ta = h('textarea', {
      id, rows, placeholder,
      oninput: () => this.set(path, ta.value.split('\n').map((s) => s.trim()).filter(Boolean)),
    });
    ta.value = (this.get(path) || []).join('\n');
    return this.wrap(label, ta, hint || 'Una por línea.', id);
  }

  /** Lista de textos editada separada por comas. */
  commas(label, path, { hint, placeholder } = {}) {
    const id = nextId();
    const input = h('input', {
      id, type: 'text', placeholder, value: (this.get(path) || []).join(', '),
      oninput: () => this.set(path, input.value.split(',').map((s) => s.trim()).filter(Boolean)),
    });
    return this.wrap(label, input, hint || 'Separadas por comas.', id);
  }
}

export const ACTION_OPTIONS_VOICE = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE'];
