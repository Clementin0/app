import Phaser from 'phaser';
import { REVIVE } from '../config/game.config.js';
import { RunnerWorld } from '../logic/RunnerWorld.js';
import { services } from '../services/services.js';
import { Background } from '../ui/Background.js';
import { Hud } from '../ui/Hud.js';
import { bindLayout } from '../ui/layout.js';
import { COLORS } from '../ui/theme.js';
import { WorldRenderer } from '../ui/WorldRenderer.js';

const SFX_FOR_EVENT = {
  jump: 'jump',
  doubleJump: 'doubleJump',
  coin: 'coin',
  gem: 'gem',
  shield: 'powerup',
  magnet: 'powerup',
  shieldBreak: 'shieldBreak',
  death: 'death',
  revive: 'revive',
};

/**
 * Gameplay scene: owns a RunnerWorld, feeds it input, renders it and runs
 * the run lifecycle (start -> pause -> death -> game over -> revive).
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init() {
    this.countdownTimer = null;
  }

  create() {
    const { save, ads } = services;
    ads.hideBanner();
    this.cameras.main.fadeIn(250, 7, 2, 26);

    this.phase = 'running';
    this.startBest = save.highScore;
    this.committed = { coins: 0, gems: 0 };
    this.jumps = 0;

    this.bg = new Background(this);
    this.world = new RunnerWorld({ width: this.scale.width, height: this.scale.height, best: save.highScore });
    this.view = new WorldRenderer(this, this.world);
    this.hud = new Hud(this, { onPause: () => this.pauseGame() });

    this.showTutorial = save.snapshot().gamesPlayed < 3;
    this.hud.showHint(this.showTutorial);
    if (this.showTutorial) this.time.delayedCall(7000, () => this.hud.showHint(false));
    this.hud.showMessage('VIA!', COLORS.cyan, 600);

    this._bindInput();
    // Scene events persist across restarts: detach on shutdown to avoid duplicates.
    const onResume = () => this._onResume();
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => this.events.off('resume', onResume));
    bindLayout(this, (w, h) => {
      this.world.setViewport(w, h);
      this.bg.layout(w, h, this.world.groundY);
      this.hud.layout(w, h);
    });
  }

  _bindInput() {
    this.input.on('pointerdown', (_pointer, over) => {
      if (over.length) return; // tapped a HUD button
      services.sfx.unlock();
      this.jump();
    });
    this.input.on('pointerup', () => this.world.releaseJump());

    const kb = this.input.keyboard;
    if (!kb) return;
    for (const key of ['SPACE', 'UP', 'W']) {
      kb.on(`keydown-${key}`, (e) => {
        if (!e.repeat) this.jump();
      });
      kb.on(`keyup-${key}`, () => this.world.releaseJump());
    }
    kb.on('keydown-P', () => this.pauseGame());
    kb.on('keydown-ESC', () => this.pauseGame());
  }

  jump() {
    if (this.phase !== 'running') return;
    if (this.world.pressJump() && this.showTutorial && ++this.jumps >= 3) {
      this.showTutorial = false;
      this.hud.showHint(false);
    }
  }

  // ---------------------------------------------------------- lifecycle

  pauseGame() {
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    this._cancelCountdown();
    this.phase = 'paused';
    this.world.releaseJump();
    this.scene.launch('Pause');
    this.scene.pause();
  }

  _onResume() {
    // Back from the pause menu: give the player a moment before running again.
    if (this.phase === 'paused') this.startCountdown(REVIVE.countdown);
  }

  startCountdown(seconds) {
    this._cancelCountdown();
    this.phase = 'countdown';
    let n = seconds;
    const tick = () => {
      if (n > 0) {
        this.hud.showMessage(String(n), COLORS.yellow, 600, 110);
        services.sfx.play('tick');
        n -= 1;
      } else {
        this.hud.showMessage('VIA!', COLORS.cyan, 500, 90);
        services.sfx.play('go');
        this.phase = 'running';
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

  /** Persists record and currency collected so far (idempotent per amount). */
  commitProgress() {
    const { save } = services;
    const summary = this.world.score.summary();
    save.submitScore(summary.score, summary.meters);
    save.addCurrency(summary.coins - this.committed.coins, summary.gems - this.committed.gems);
    this.committed = { coins: summary.coins, gems: summary.gems };
    return summary;
  }

  _onDeath() {
    this.phase = 'dying';
    this.world.releaseJump();
    this.hud.showHint(false);
    this.time.delayedCall(950, () => this.showGameOver());
  }

  showGameOver() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    const summary = this.commitProgress();
    this.scene.launch('GameOver', {
      ...summary,
      isNewBest: summary.score > this.startBest,
      previousBest: this.startBest,
      canRevive: this.world.canRevive,
    });
    this.scene.pause();
  }

  /** Called by the Game Over scene after a rewarded ad granted the reward. */
  reviveFromAd() {
    if (!this.world.revive()) return false;
    this.scene.resume();
    this.view.handleEvents(this.world.drainEvents());
    services.sfx.play('revive');
    this.startCountdown(REVIVE.countdown);
    return true;
  }

  handleBack() {
    this.pauseGame();
  }

  // --------------------------------------------------------------- loop

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    if (this.phase === 'running') this.world.step(dt);

    const events = this.view.handleEvents(this.world.drainEvents());
    for (const e of events) this._onWorldEvent(e);

    this.view.render(dt);
    this.bg.update(dt, this.phase === 'running' ? this.world.speed : 0);
    this.hud.update(this.world.hud());
  }

  _onWorldEvent(e) {
    const { sfx } = services;
    const sound = SFX_FOR_EVENT[e.type];
    if (sound) sfx.play(sound);
    switch (e.type) {
      case 'land':
        if (e.impact > 700) sfx.play('land');
        break;
      case 'coin':
        this.hud.bump(this.hud.coinIcon);
        break;
      case 'gem':
        this.hud.bump(this.hud.gemIcon);
        break;
      case 'levelUp':
        sfx.play('levelUp');
        this.hud.showMessage('VELOCITÀ +', COLORS.yellow, 900, 58);
        break;
      case 'newBest':
        sfx.play('newBest');
        this.hud.showMessage('NUOVO RECORD!', COLORS.green, 1200, 58);
        break;
      case 'death':
        this._onDeath();
        break;
      default:
        break;
    }
  }
}
