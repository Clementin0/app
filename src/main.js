import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/game.config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GameScene } from './scenes/GameScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { createAdService } from './services/createAdService.js';
import { isNative, onAppStateChange, onBackButton } from './services/Platform.js';
import { SaveData } from './services/SaveData.js';
import { services } from './services/services.js';
import { Sfx } from './services/Sfx.js';

const params = new URLSearchParams(window.location.search);
const e2e = params.has('e2e');
// ?renderer=canvas forces the Canvas renderer (used by headless tests without a GPU).
const rendererType = params.get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO;

// ------------------------------------------------------------ services
services.save = new SaveData();
services.sfx = new Sfx({ muted: services.save.muted });
services.ads = createAdService({ fastMock: e2e });
services.ads.on('fullscreenOpen', () => services.sfx.suspend());
services.ads.on('fullscreenClose', () => services.sfx.resume());
services.ads.init();

if (!isNative()) document.body.classList.add('web');

// ---------------------------------------------------------------- game
const game = new Phaser.Game({
  type: rendererType,
  parent: 'game',
  backgroundColor: '#07021a',
  scale: {
    // Landscape base size, expanded to fill any aspect ratio without black bars.
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  // Headless test browsers render a few frames per second: use real frame
  // deltas there so timers and tweens keep wall-clock pace.
  fps: { smoothStep: !e2e },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene],
});

/** The top-most active scene handles the Android back button. */
function topScene() {
  for (const key of ['GameOver', 'Pause', 'Game', 'Menu']) {
    const scene = game.scene.getScene(key);
    if (scene?.sys.isActive()) return scene;
  }
  return null;
}

onBackButton(() => {
  if (services.ads.isFullscreenShowing) return;
  topScene()?.handleBack?.();
});

onAppStateChange((active) => {
  if (active) {
    services.sfx.resume();
    return;
  }
  services.sfx.suspend();
  const gameScene = game.scene.getScene('Game');
  if (gameScene?.sys.isActive()) gameScene.pauseGame();
});

// Hook used by scripts/verify-runtime.mjs (and handy in the dev console).
if (e2e || import.meta.env.DEV) {
  window.__NEON_DASH__ = {
    game,
    services,
    ready: false,
    activeScenes: () => game.scene.getScenes(true).map((s) => s.sys.settings.key),
    scene: (key) => game.scene.getScene(key),
  };
  game.events.once('booted', () => {
    window.__NEON_DASH__.ready = true;
  });
}
