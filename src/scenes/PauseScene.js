import Phaser from 'phaser';
import { t } from '../i18n.js';
import { services } from '../services/services.js';
import { Button, IconButton } from '../ui/Button.js';
import { bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';

/** Pause overlay on top of the (paused) Game scene. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  init() {
    this.closing = false;
  }

  create() {
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.7).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.96).fillRoundedRect(-280, -250, 560, 500, 36);
    bg.lineStyle(3, COLORS.panelEdge, 1).strokeRoundedRect(-280, -250, 560, 500, 36);
    const title = glow(this.add.text(0, -180, t('pause'), textStyle(72, '#ffffff')).setOrigin(0.5), COLORS.purple, 22);

    const resume = new Button(this, 0, -60, { label: t('resume'), icon: 'icon_play', width: 400, color: COLORS.green, onClick: () => this.resumeGame() });
    const restart = new Button(this, 0, 50, { label: t('restart'), icon: 'icon_retry', width: 400, color: COLORS.pink, onClick: () => this.leave('Game') });
    const menu = new Button(this, 0, 160, { label: t('menu'), icon: 'icon_home', width: 400, color: COLORS.purple, onClick: () => this.leave('Menu') });
    this.settingsButton = new IconButton(this, 230, -200, {
      icon: 'icon_gear',
      size: 64,
      color: COLORS.panelEdge,
      onClick: () => {
        if (!this.scene.isActive('Settings')) this.scene.launch('Settings', { from: 'Pause' });
      },
    });
    this.panel.add([bg, title, resume, restart, menu, this.settingsButton]);
    this.resumeButton = resume;
    this.restartButton = restart;
    this.menuButton = menu;
    this.buttons = [resume, restart, menu];

    this.panel.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: this.panel, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const s = Math.min(1, (h - 40) / 500, (w - 40) / 560);
      this.panel.setPosition(w / 2, h / 2).setScale(s);
    });
  }

  resumeGame() {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
    this.scene.resume('Game');
  }

  /** Abandon the run: keep coins/record, then restart or go to the menu. */
  leave(target) {
    if (this.closing) return;
    this.closing = true;
    this.buttons.forEach((b) => b.setEnabled(false));
    const game = this.scene.get('Game');
    game.commitProgress?.();
    this.scene.stop('Game');
    this.scene.start(target);
  }

  handleBack() {
    this.resumeGame();
  }
}
