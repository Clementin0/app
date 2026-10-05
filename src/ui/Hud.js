import { zoneTheme } from '../config/zones.js';
import { fmt, t } from '../i18n.js';
import { IconButton } from './Button.js';
import { COLORS, glow, hex, textStyle } from './theme.js';

const DEPTH = 100;
const POWERUPS = [
  { key: 'shield', color: COLORS.green },
  { key: 'magnet', color: COLORS.red, max: 18 },
  { key: 'rapid', color: COLORS.orange, max: 7 },
  { key: 'double', color: COLORS.yellow, max: 10 },
];

/**
 * In-game HUD drawn by Phaser over the 3D view: score, best, hearts, coins,
 * gems, power-up timers, combo, boss health, zone banner, pause button.
 */
export class Hud {
  constructor(scene, { onPause }) {
    this.scene = scene;
    this.lastScore = -1;
    this.lastHp = -1;
    this.lastCombo = 0;
    this.margin = 22;

    this.scorePanel = scene.add.graphics().setDepth(DEPTH);
    this.scoreText = glow(scene.add.text(0, 0, '0', textStyle(46)).setDepth(DEPTH + 1), COLORS.cyan, 12);
    this.bestText = scene.add.text(0, 0, '', textStyle(19, '#ffd23f')).setDepth(DEPTH + 1);
    this.hearts = [];

    this.walletPanel = scene.add.graphics().setDepth(DEPTH);
    this.coinIcon = scene.add.image(0, 0, 'coin').setScale(0.75).setDepth(DEPTH + 1);
    this.coinText = scene.add.text(0, 0, '0', textStyle(30, '#ffd23f')).setOrigin(0, 0.5).setDepth(DEPTH + 1);
    this.gemIcon = scene.add.image(0, 0, 'gem').setScale(0.58).setDepth(DEPTH + 1);
    this.gemText = scene.add.text(0, 0, '0', textStyle(30, '#7ff3ff')).setOrigin(0, 0.5).setDepth(DEPTH + 1);
    this.zoneBar = scene.add.graphics().setDepth(DEPTH);

    this.powerups = POWERUPS.map((p) => ({
      ...p,
      icon: scene.add.image(0, 0, p.key).setScale(0.62).setDepth(DEPTH + 1).setVisible(false),
      bar: scene.add.graphics().setDepth(DEPTH + 1),
    }));

    this.combo = glow(scene.add.text(0, 0, '', textStyle(44, '#ffd23f')).setOrigin(1, 0.5).setDepth(DEPTH + 2).setAlpha(0), COLORS.orange, 16);

    this.bossPanel = scene.add.graphics().setDepth(DEPTH);
    this.bossLabel = scene.add.text(0, 0, 'BOSS', textStyle(22, '#ff8ef0')).setOrigin(0.5).setDepth(DEPTH + 1).setVisible(false);

    this.pauseButton = new IconButton(scene, 0, 0, { icon: 'icon_pause', size: 76, color: COLORS.purple, onClick: onPause });
    this.pauseButton.setDepth(DEPTH + 2);

    this.message = scene.add.text(0, 0, '', textStyle(64)).setOrigin(0.5).setDepth(DEPTH + 3).setAlpha(0);
    this.subMessage = scene.add.text(0, 0, '', textStyle(30, '#e9ddff')).setOrigin(0.5).setDepth(DEPTH + 3).setAlpha(0);
    this.hint = scene.add.text(0, 0, t('hintControls'), textStyle(22, '#ffffff', { align: 'center', wordWrap: { width: 1100 } })).setOrigin(0.5).setDepth(DEPTH + 1).setVisible(false);
    this.vignette = scene.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH - 1).setAlpha(0);
  }

  layout(width, height) {
    const m = this.margin;
    this.width = width;
    this.height = height;
    this._drawScorePanel(this.scorePanelW ?? 250);
    this.scoreText.setPosition(m + 18, m + 4);
    this.bestText.setPosition(m + 20, m + 58);
    this._layoutHearts();

    const wx = width / 2 - 150;
    this.walletPanel.clear();
    this.walletPanel.fillStyle(COLORS.ink, 0.55).fillRoundedRect(wx, m, 300, 60, 20);
    this.walletPanel.lineStyle(2, COLORS.yellow, 0.45).strokeRoundedRect(wx, m, 300, 60, 20);
    this.coinIcon.setPosition(wx + 34, m + 30);
    this.coinText.setPosition(wx + 58, m + 30);
    this.gemIcon.setPosition(wx + 176, m + 30);
    this.gemText.setPosition(wx + 198, m + 30);
    this.zoneBarRect = { x: wx + 16, y: m + 66, w: 268 };

    this.powerups.forEach((p, i) => p.icon.setPosition(m + 30 + i * 64, m + 168));
    this.combo.setPosition(width - m, height * 0.42);
    this.pauseButton.setPosition(width - m - 38, m + 38);
    this.message.setPosition(width / 2, height * 0.32);
    this.subMessage.setPosition(width / 2, height * 0.32 + 62);
    this.hint.setPosition(width / 2, height - 46).setWordWrapWidth(width - 80);
    this.vignette.setDisplaySize(width, height);
    this.bossRect = { x: width / 2 - 260, y: m + 104, w: 520 };
    this.bossLabel.setPosition(width / 2, m + 96);
  }

  _drawScorePanel(w) {
    const m = this.margin;
    this.scorePanelW = w;
    this.scorePanel.clear();
    this.scorePanel.fillStyle(COLORS.ink, 0.55).fillRoundedRect(m, m, w, 128, 20);
    this.scorePanel.lineStyle(2, COLORS.cyan, 0.5).strokeRoundedRect(m, m, w, 128, 20);
  }

  _layoutHearts() {
    const m = this.margin;
    this.hearts.forEach((h, i) => h.setPosition(m + 34 + i * 40, m + 104));
  }

  _ensureHearts(maxHp) {
    while (this.hearts.length < maxHp) this.hearts.push(this.scene.add.image(0, 0, 'heart').setScale(0.72).setDepth(DEPTH + 1));
    this._layoutHearts();
  }

  update(state) {
    if (state.score !== this.lastScore) {
      this.scoreText.setText(fmt(state.score));
      this.bestText.setText(t('recordValue', { n: fmt(state.best) }));
      this.lastScore = state.score;
      const needed = Math.ceil(Math.max(250, this.scoreText.width + 40, this.bestText.width + 40) / 20) * 20;
      if (needed !== this.scorePanelW) this._drawScorePanel(needed);
    }
    this.coinText.setText(String(state.coins));
    this.gemText.setText(String(state.gems));

    if (state.hp !== this.lastHp || this.hearts.length < state.maxHp) {
      this._ensureHearts(state.maxHp);
      this.hearts.forEach((h, i) => {
        h.setVisible(i < state.maxHp);
        h.setTexture(i < state.hp ? 'heart' : 'heart_empty');
      });
      if (state.hp < this.lastHp && this.lastHp > 0) this.hurtFlash();
      this.lastHp = state.hp;
    }

    // Zone progress bar (towards the boss).
    const z = this.zoneBarRect;
    const theme = zoneTheme(state.zone);
    this.zoneBar.clear();
    this.zoneBar.fillStyle(COLORS.ink, 0.7).fillRoundedRect(z.x, z.y, z.w, 8, 4);
    this.zoneBar.fillStyle(state.boss ? COLORS.pink : theme.line, 1).fillRoundedRect(z.x, z.y, Math.max(8, z.w * (state.boss ? 1 : state.zoneProgress)), 8, 4);

    // Power-up timers.
    let slot = 0;
    for (const p of this.powerups) {
      const value = state[p.key];
      const active = p.key === 'shield' ? value : value > 0;
      p.icon.setVisible(!!active);
      p.bar.clear();
      if (!active) continue;
      const x = this.margin + 30 + slot * 64;
      const y = this.margin + 168;
      p.icon.setPosition(x, y);
      if (p.max) {
        p.bar.fillStyle(COLORS.ink, 0.7).fillRoundedRect(x - 24, y + 28, 48, 7, 3);
        p.bar.fillStyle(p.color, 1).fillRoundedRect(x - 24, y + 28, Math.max(5, 48 * Math.min(1, value / p.max)), 7, 3);
      }
      slot += 1;
    }

    // Combo.
    if (state.combo >= 2 && state.combo !== this.lastCombo) {
      this.combo.setText(t('combo', { n: state.combo })).setAlpha(1);
      this.scene.tweens.killTweensOf(this.combo);
      this.combo.setScale(1.4);
      this.scene.tweens.add({ targets: this.combo, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }
    if (state.combo < 2 && this.combo.alpha > 0 && !this.combo.fading) {
      this.combo.fading = true;
      this.scene.tweens.add({ targets: this.combo, alpha: 0, duration: 300, onComplete: () => (this.combo.fading = false) });
    }
    this.lastCombo = state.combo;

    // Boss health.
    this.bossPanel.clear();
    this.bossLabel.setVisible(!!state.boss);
    if (state.boss) {
      const b = this.bossRect;
      const ratio = state.boss.hp / state.boss.maxHp;
      this.bossPanel.fillStyle(COLORS.ink, 0.75).fillRoundedRect(b.x, b.y, b.w, 18, 9);
      this.bossPanel.fillStyle(COLORS.pink, 1).fillRoundedRect(b.x + 2, b.y + 2, Math.max(8, (b.w - 4) * ratio), 14, 7);
      this.bossPanel.lineStyle(2, COLORS.white, 0.6).strokeRoundedRect(b.x, b.y, b.w, 18, 9);
    }
  }

  hurtFlash() {
    this.scene.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(0.9);
    this.scene.tweens.add({ targets: this.vignette, alpha: 0, duration: 450 });
  }

  bump(target) {
    this.scene.tweens.add({ targets: target, scale: { from: target.scale * 1.35, to: target.scale }, duration: 180, ease: 'Back.easeOut' });
  }

  showMessage(text, color = COLORS.pink, duration = 1100, size = 64, sub = '') {
    const m = this.message;
    this.scene.tweens.killTweensOf([m, this.subMessage]);
    m.setText(text).setFontSize(size).setAlpha(1).setScale(0.4);
    glow(m, color, 22);
    this.subMessage.setText(sub).setAlpha(sub ? 1 : 0).setColor(hex(0xe9ddff));
    this.scene.tweens.add({ targets: m, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: [m, this.subMessage], alpha: 0, delay: duration, duration: 300 });
  }

  showHint(visible) {
    this.hint.setVisible(visible).setAlpha(visible ? 1 : 0);
    if (visible) this.scene.tweens.add({ targets: this.hint, alpha: { from: 1, to: 0.5 }, duration: 800, yoyo: true, repeat: -1 });
    else this.scene.tweens.killTweensOf(this.hint);
  }
}
