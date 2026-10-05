import { services } from '../services/services.js';

/**
 * Space to keep free at the bottom for the AdMob banner, in game pixels.
 * The banner height arrives in dp, which match CSS pixels in the WebView;
 * displayScale converts CSS pixels into game pixels.
 */
export function bannerReserve(scene) {
  const dp = services.ads?.getBannerReserveDp() ?? 0;
  if (!dp) return 0;
  const ratio = scene.scale.displayScale?.y || 1;
  return Math.ceil(dp * ratio) + 8;
}

/**
 * Runs `fn` now and every time the screen size or banner size changes, and
 * cleans the listeners up when the scene shuts down.
 */
export function bindLayout(scene, fn) {
  const run = () => {
    if (scene.sys.isActive() || scene.sys.isPaused()) fn(scene.scale.width, scene.scale.height);
  };
  scene.scale.on('resize', run);
  const offBanner = services.ads?.on('bannerChange', run);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', run);
    offBanner?.();
  });
  fn(scene.scale.width, scene.scale.height);
}
