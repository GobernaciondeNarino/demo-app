/** Fábrica de escenas según el tipo configurado en el panel. */
import { ColorScene } from './ColorScene.js';
import { MediaScene } from './MediaScene.js';
import { WebScene } from './WebScene.js';
import { mediaKind } from './mediaKind.js';

export { mediaKind };

export function createScene(cfg, ctx) {
  if (cfg.type === 'media' && cfg.media?.url) {
    return mediaKind(cfg.media) === 'web' ? new WebScene(cfg, ctx) : new MediaScene(cfg, ctx);
  }
  return new ColorScene(cfg, ctx);
}
