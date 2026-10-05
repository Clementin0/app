import Phaser from 'phaser';
import { detectLanguage, setLanguage, t } from './i18n.js';
import { BootScene } from './scenes/BootScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GameScene } from './scenes/GameScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { createAdService } from './services/createAdService.js';
import { Haptics } from './services/Haptics.js';
import { Music } from './services/Music.js';
import { isNative, onAppStateChange, onBackButton } from './services/Platform.js';
import { SaveData } from './services/SaveData.js';
import { services } from './services/services.js';
import { Sfx } from './services/Sfx.js';
import { Stage } from './three/Stage.js';

const params = new URLSearchParams(window.location.search);
const e2e = params.has('e2e');
// ?renderer=canvas forces the Canvas renderer (used by headless tests without a GPU).
const rendererType = params.get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.AUTO;

// ------------------------------------------------------------ services
services.save = new SaveData();
const settings = services.save.snapshot();
setLanguage(settings.lang ?? detectLanguage());
services.sfx = new Sfx({ enabled: settings.sfx });
services.music = new Music(() => services.sfx.ctx, { enabled: settings.music });
// The AudioContext only exists after the first tap: start the music then.
services.sfx.onUnlock = () => {
  if (services.music.playing) services.music.start();
};
services.haptics = new Haptics({ enabled: settings.vibration });
// 3D world (Three.js) under Phaser's transparent canvas.
services.stage = new Stage(document.getElementById('stage'), settings.quality);
services.ads = createAdService({ fastMock: e2e });
services.ads.on('fullscreenOpen', () => services.sfx.suspend());
services.ads.on('fullscreenClose', () => services.sfx.resume());
services.ads.init();

if (!isNative()) document.body.classList.add('web');
const rotateLabel = document.querySelector('#rotate .label');
if (rotateLabel) rotateLabel.textContent = t('rotate');

// ---------------------------------------------------------------- game
const game = new Phaser.Game({
  type: rendererType,
  parent: 'game',
  transparent: true,
  scale: {
    // Landscape base size, expanded to fill any aspect ratio without black bars.
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  render: { antialias: true, powerPreference: 'high-performance' },
  input: { activePointers: 3 },
  // Headless test browsers render a few frames per second: use real frame
  // deltas there so timers and tweens keep wall-clock pace.
  fps: { smoothStep: !e2e },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, MenuScene, ShopScene, GameScene, PauseScene, GameOverScene, SettingsScene],
});

// One 3D frame per Phaser frame, after the scenes updated the world.
game.events.on('poststep', (_time, delta) => services.stage.frame(delta / 1000));

/** The top-most active scene handles the Android back button. */
function topScene() {
  for (const key of ['Settings', 'GameOver', 'Pause', 'Shop', 'Game', 'Menu']) {
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
