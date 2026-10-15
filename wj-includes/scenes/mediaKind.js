/**
 * Tipo de contenido de una escena de medios. En modo «auto» se deduce del enlace:
 * video o imagen por la extensión; cualquier otra cosa (una carpeta como
 * «fagosEvo/» o un .html) es una página web.
 */
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/;
const IMAGE = /\.(jpe?g|png|webp|gif|avif|svg)$/;

export function mediaKind(media) {
  if (media?.kind && media.kind !== 'auto') return media.kind;
  const path = String(media?.url || '').split(/[?#]/)[0].toLowerCase();
  if (VIDEO.test(path)) return 'video';
  if (IMAGE.test(path)) return 'image';
  return 'web';
}
