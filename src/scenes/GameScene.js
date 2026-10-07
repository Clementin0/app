import Phaser from 'phaser';
import { bossKind } from '../config/game3d.config.js';
import { zoneTheme } from '../config/zones.js';
import { loadoutFrom } from '../config/upgrades.js';
import { t } from '../i18n.js';
import { createRng } from '../logic/rng.js';
import { LaneWorld } from '../logic3d/LaneWorld.js';
import { Missions } from '../logic3d/Missions.js';
import { Tutorial } from '../logic3d/Tutorial.js';
import { AutoQuality, lowerQuality } from '../services/AutoQuality.js';
import { services } from '../services/services.js';
import { GameView } from '../three/GameView.js';
import { Hud } from '../ui/Hud.js';
import { bindLayout } from '../ui/layout.js';
import { COLORS } from '../ui/theme.js';

const SWIPE = 42; // game pixels
const HOLD_TO_FIRE = 0.2; // seconds
const COUNTDOWN = 3;

const SFX_FOR_EVENT = {
  jump: 'jump',
  slide: 'slide',
  bump: 'bump',
  shoot: 'shoot',
  hit: 'hit',
  kill: 'explode',
  smash: 'explode',
  hurt: 'hurt',
  coin: 'coin',
  gem: 'gem',
  powerup: 'powerup',
  shieldBreak: 'shieldBreak',
  enemyShot: 'enemyShot',
  plasmaDestroyed: 'hit',
  death: 'death',
  bossSpawn: 'alarm',
  bossDefeated: 'newBest',
  bossDrop: 'enemyShot',
  bossSummon: 'alarm',
  zone: 'levelUp',
};

/**
 * Gameplay: a LaneWorld rendered in 3D, controlled with swipes (lanes,
 * jump, slide) and taps (shoot, hold for auto-fire), with the Phaser HUD
 * on top. Handles pause, death, game over and the rewarded revive.
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    this.countdownTimer = null;
    this.gestures = new Map();
    this.autoQuality = new AutoQuality();
    this.slowMo = 0;
    this.popupPoint = { x: 0, y: 0, visible: false };
  }

  create() {
    const { save, ads, music, stage } = services;
    ads.hideBanner();
    this.cameras.main.fadeIn(250, 7, 2, 26);

    const snap = save.snapshot();
    this.phase = 'running';
    this.startBest = save.highScore;
    this.committed = { coins: 0, gems: 0, stats: {} };
    this.completedMissions = [];

    this.world = new LaneWorld({ rng: createRng(Date.now() >>> 0), best: save.highScore, loadout: loadoutFrom(snap) });
    this.view = stage.setView(new GameView(stage, this.world, { equipped: snap.equipped }));
    this.hud = new Hud(this, { onPause: () => this.pauseGame(), onSkipTutorial: () => this.tutorial?.finish() });

    music.setZone(0);
    music.start(1);
    music.setIntensity(1);
    music.duck(false);

    // First run: an interactive tutorial before the real thing.
    this.tutorial = snap.tutorialDone ? null : new Tutorial(this.world);
    this.hud.showSkip(!!this.tutorial);
    if (!this.tutorial) this._showZoneTitle(0, 0);

    this._bindInput();
    const onResume = () => this._onResume();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
    bindLayout(this, (w, h) => this.hud.layout(w, h));
  }

  // -------------------------------------------------------------- input

  _bindInput() {
    this.input.on('pointerdown', (pointer, over) => {
      if (over.length) return; // HUD button
      services.sfx.unlock();
      this.gestures.set(pointer.id, { x: pointer.x, y: pointer.y, start: this.time.now, swiped: false, holding: false, dir: null });
    });
    this.input.on('pointermove', (pointer) => {
      const g = this.gestures.get(pointer.id);
      if (g && this.phase === 'running') this._swipe(g, pointer.x, pointer.y);
    });
    const release = (pointer) => {
      const g = this.gestures.get(pointer.id);
      if (!g) return;
      this.gestures.delete(pointer.id);
      // A fast flick may deliver no move events at all: judge it on release.
      if (!g.swiped && !g.holding && this.phase === 'running' && !this._swipe(g, pointer.x, pointer.y)) this.world.fire();
      if (![...this.gestures.values()].some((x) => x.holding)) this.world.setFiring(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard;
    if (!kb) return;
    const on = (keys, fn) => keys.forEach((k) => kb.on(`keydown-${k}`, (e) => !e.repeat && this.phase === 'running' && fn()));
    on(['LEFT', 'A'], () => this.world.moveLeft());
    on(['RIGHT', 'D'], () => this.world.moveRight());
    on(['UP', 'W'], () => this.world.jump());
    on(['DOWN', 'S'], () => this.world.slide());
    for (const k of ['SPACE', 'J', 'K']) {
      kb.on(`keydown-${k}`, () => this.world.setFiring(true));
      kb.on(`keyup-${k}`, () => this.world.setFiring(false));
    }
    kb.on('keydown-P', () => this.pauseGame());
    kb.on('keydown-ESC', () => this.pauseGame());
  }

  /**
   * Turns finger travel into a lane change / jump / slide. One touch can
   * chain different directions (e.g. left then up), but a long swipe in the
   * same direction counts once. Returns true if the travel was a swipe.
   */
  _swipe(g, x, y) {
    const dx = x - g.x;
    const dy = y - g.y;
    if (Math.hypot(dx, dy) < SWIPE) return false;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    g.x = x;
    g.y = y;
    g.swiped = true;
    if (dir === g.dir) return true;
    g.dir = dir;
    if (dir === 'left') this.world.moveLeft();
    else if (dir === 'right') this.world.moveRight();
    else if (dir === 'up') this.world.jump();
    else this.world.slide();
    return true;
  }

  _updateHolds() {
    if (this.phase !== 'running') return;
    for (const g of this.gestures.values()) {
      if (!g.swiped && !g.holding && (this.time.now - g.start) / 1000 > HOLD_TO_FIRE) {
        g.holding = true;
        this.world.setFiring(true);
      }
    }
  }

  // ---------------------------------------------------------- lifecycle

  _freeze(frozen) {
    this.view.frozen = frozen;
    if (frozen) {
      this.world.setFiring(false);
      this.gestures.clear();
    }
  }

  pauseGame() {
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    this._cancelCountdown();
    this.phase = 'paused';
    this._freeze(true);
    services.music.duck(true);
    this.scene.launch('Pause');
    this.scene.pause();
  }

  _onResume() {
    if (this.phase === 'paused') {
      services.music.duck(false);
      this.startCountdown(COUNTDOWN);
    }
  }

  startCountdown(seconds) {
    this._cancelCountdown();
    this.phase = 'countdown';
    this._freeze(true);
    let n = seconds;
    const tick = () => {
      if (n > 0) {
        this.hud.showMessage(String(n), COLORS.yellow, 600, 110);
        services.sfx.play('tick');
        n -= 1;
      } else {
        this.hud.showMessage(t('go'), COLORS.cyan, 500, 90);
        services.sfx.play('go');
        this.phase = 'running';
        this._freeze(false);
        this._cancelCountdown();
      }
    };
    tick();
    this.countdownTimer = this.time.addEvent({ delay: 800, repeat: seconds, callback: tick });
  }

  _cancelCountdown() {
    this.countdownTimer?.remove(false);
    this.countdownTimer = null;
  }

  runStats() {
    const w = this.world;
    return {
      ...w.stats,
      coins: w.score.coins,
      gems: w.score.gems,
      meters: Math.floor(w.distance),
      score: w.score.score,
      bestCombo: w.combo.best,
    };
  }

  /** Persists record, currency, lifetime stats and missions (idempotent per amount). */
  commitProgress() {
    const { save } = services;
    const w = this.world;
    const summary = w.score.summary();
    summary.meters = Math.floor(w.distance);
    save.submitScore(summary.score, summary.meters);
    save.addCurrency(summary.coins - this.committed.coins, summary.gems - this.committed.gems);

    const stats = this.runStats();
    const missions = new Missions(save.data.missions);
    const done = missions.applyRun(stats, this.committed.stats);
    for (const m of done) save.addCurrency(m.reward.coins, m.reward.gems);
    this.completedMissions.push(...done);
    save.persist();

    this.committed = { coins: summary.coins, gems: summary.gems, stats };
    return summary;
  }

  /** Called once when the run is over for good (retry / menu). */
  finalizeRun() {
    const s = this.world.stats;
    services.save.addLifetime({ kills: s.kills, bosses: s.bosses });
  }

  _onDeath() {
    this.phase = 'dying';
    this._freeze(false);
    this.world.setFiring(false);
    this.hud.showPrompt(null);
    this.time.delayedCall(1100, () => this.showGameOver());
  }

  showGameOver() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this._freeze(true);
    services.music.duck(true);
    const summary = this.commitProgress();
    this.scene.launch('GameOver', {
      ...summary,
      isNewBest: summary.score > this.startBest,
      previousBest: this.startBest,
      canRevive: this.world.canRevive,
      kills: this.world.stats.kills,
      zone: this.world.zone.index + 1,
      missions: this.completedMissions.splice(0),
    });
    this.scene.pause();
  }

  /** Called by the Game Over scene after a rewarded ad granted the reward. */
  reviveFromAd() {
    if (!this.world.revive()) return false;
    this.scene.resume();
    this.view.handleEvents(this.world.drainEvents());
    services.sfx.play('revive');
    services.music.duck(false);
    services.haptics.success();
    this.startCountdown(COUNTDOWN);
    return true;
  }

  handleBack() {
    this.pauseGame();
  }

  // --------------------------------------------------------------- loop

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this._updateHolds();
    if (this.phase === 'running') {
      let scale = this.tutorial ? this.tutorial.update(dt) : 1;
      // Brief slow motion for dramatic moments (boss down).
      if (this.slowMo > 0) {
        this.slowMo = Math.max(0, this.slowMo - dt);
        scale *= 0.35;
      }
      this.world.step(dt * scale);
      this._adaptQuality(delta / 1000);
    }

    const events = this.view.handleEvents(this.world.drainEvents());
    for (const e of events) {
      this.tutorial?.onEvent(e);
      this._onWorldEvent(e);
    }
    if (this.tutorial) this._updateTutorial();
    this.hud.update(this.world.hud());
  }

  _showZoneTitle(index, delay) {
    const theme = zoneTheme(index);
    this.time.delayedCall(delay, () => this.hud.showMessage(t('zone', { n: index + 1 }), theme.line, 1500, 56, t(theme.nameKey)));
  }

  _updateTutorial() {
    const tut = this.tutorial;
    const { sfx, haptics } = services;
    for (const e of tut.drainEvents()) {
      if (e.type === 'tutorialStep') {
        sfx.play('powerup');
        haptics.light();
        this.hud.showMessage(t('tutNice'), COLORS.green, 500, 54);
      } else if (e.type === 'tutorialRetry') {
        this.hud.showMessage(t('tutRetry'), COLORS.yellow, 1800, 34);
      } else if (e.type === 'tutorialDone') {
        sfx.play('newBest');
        this.hud.showMessage(t('tutDone'), COLORS.cyan, 1300, 50);
      }
    }
    this.hud.showPrompt(tut.hint);
    if (tut.finished) {
      this.tutorial = null;
      services.save.completeTutorial();
      this.hud.showPrompt(null);
      this.hud.showSkip(false);
      this._showZoneTitle(0, 600);
    }
  }

  /** Steps the graphics down when the device can't keep a smooth frame rate. */
  _adaptQuality(frameTime) {
    const { save, stage } = services;
    if (!save.data.qualityAuto || !this.autoQuality.sample(frameTime)) return;
    const lower = lowerQuality(stage.qualityName);
    if (!lower) return;
    stage.setQuality(lower);
    save.setAutoQuality(lower);
  }

  _onWorldEvent(e) {
    const { sfx, haptics, music } = services;
    const sound = SFX_FOR_EVENT[e.type];
    if (sound) sfx.play(sound);
    switch (e.type) {
      case 'kill': {
        haptics.light();
        const pt = this.view.screenPoint(e.x, e.y + 0.6, e.z, this.popupPoint);
        if (pt.visible) this.hud.popup(pt.x, pt.y, e.combo >= 2 ? `+${e.points} ×${e.combo}` : `+${e.points}`, e.combo >= 2 ? '#ffb347' : '#ffd23f', e.combo >= 2 ? 34 : 28);
        break;
      }
      case 'hurt':
      case 'smash':
      case 'shieldBreak':
        haptics.medium();
        break;
      case 'coin':
        this.hud.bump(this.hud.coinIcon);
        break;
      case 'gem':
        this.hud.bump(this.hud.gemIcon);
        break;
      case 'powerup':
        haptics.light();
        this.hud.showMessage(t(e.kind), COLORS.green, 800, 46);
        break;
      case 'bossSpawn':
        music.setIntensity(2);
        haptics.heavy();
        this.hud.showMessage(t('bossIncoming'), COLORS.pink, 1800, 60, t(bossKind(e.zone).nameKey));
        break;
      case 'bossDefeated':
        this.slowMo = 0.9;
        music.setIntensity(1);
        haptics.success();
        this.hud.showMessage(t('bossDefeated'), COLORS.green, 1600, 60, `+${e.coins}  +${e.gems}`);
        break;
      case 'bossFled':
        music.setIntensity(1);
        this.hud.showMessage(t('bossFled'), COLORS.purple, 1300, 46);
        break;
      case 'zone':
        music.setZone(e.index);
        this.cameras.main.flash(400, 255, 255, 255);
        this._showZoneTitle(e.index, 1700);
        break;
      case 'newBest':
        sfx.play('newBest');
        this.hud.showMessage(t('newRecord'), COLORS.green, 1200, 54);
        break;
      case 'death':
        haptics.heavy();
        this._onDeath();
        break;
      default:
        break;
    }
  }
}
