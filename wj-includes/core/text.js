/**
 * Utilidades de texto en español: normalización para comparar frases dichas
 * por voz (sin tildes, sin signos, minúsculas) y números en palabras.
 */

/** "¡Ñaño, Siguiente!" → "nano siguiente" */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(text) {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

/** Posición (en palabras) donde aparece la frase completa, o -1. */
export function findPhrase(textTokens, phraseTokens, from = 0, to = textTokens.length) {
  if (!phraseTokens.length) return -1;
  const end = Math.min(to, textTokens.length) - phraseTokens.length;
  for (let i = Math.max(0, from); i <= end; i++) {
    let ok = true;
    for (let j = 0; j < phraseTokens.length; j++) {
      if (textTokens[i + j] !== phraseTokens[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

const NUMBER_WORDS = {
  uno: 1, una: 1, primera: 1, primero: 1, dos: 2, segunda: 2, tres: 3, tercera: 3, cuatro: 4, cuarta: 4,
  cinco: 5, quinta: 5, seis: 6, sexta: 6, siete: 7, septima: 7, ocho: 8, octava: 8, nueve: 9, novena: 9,
  diez: 10, decima: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
};

/** "3" o "tres" → 3; si no es número → null */
export function parseNumber(token) {
  if (/^\d{1,3}$/.test(token)) return parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

/**
 * Palabra clave de un dato: admite alternativas separadas por "|".
 * "3 familias|tres familias" coincide si aparece cualquiera.
 */
export function keywordMatches(textNorm, keyword) {
  const padded = ` ${textNorm} `;
  return String(keyword).split('|').some((alt) => {
    const k = normalize(alt);
    return k !== '' && padded.includes(` ${k} `);
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function formatClock(seconds, { sign = false } = {}) {
  const neg = seconds < 0;
  const s = Math.floor(Math.abs(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${neg ? '−' : sign ? '+' : ''}${m}:${String(r).padStart(2, '0')}`;
}

export function randomId(prefix = '') {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
