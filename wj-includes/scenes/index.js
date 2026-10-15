/** Fábrica de escenas según el tipo configurado en el panel. */
import { ColorScene } from './ColorScene.js';
import { MediaScene } from './MediaScene.js';

export function createScene(cfg, ctx) {
  if (cfg.type === 'media' && cfg.media?.url) return new MediaScene(cfg, ctx);
  return new ColorScene(cfg, ctx);
}
