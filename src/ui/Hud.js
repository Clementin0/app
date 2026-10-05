import { IconButton } from './Button.js';
import { COLORS, glow, hex, textStyle } from './theme.js';

const DEPTH = 100;

/** In-game HUD: score, best, coins, gems, power-up timers, pause button, messages. */
export class Hud {
  constructor(scene, { onPause }) {
    this.scene = scene;
    this.lastScore = -1;

    this.scorePanel = scene.add.graphics().setDepth(DEPTH);
    this.scoreText = glow(scene.add.text(0, 0, '0', textStyle(50)).setDepth(DEPTH + 1), COLORS.cyan, 12);
    this.bestText = scene.add.text(0, 0, '', textStyle(20, '#ffd23f')).setDepth(DEPTH + 1);

    this.walletPanel = scene.add.graphics().setDepth(DEPTH);
    this.coinIcon = scene.add.image(0, 0, 'coin').setScale(0.8).setDepth(DEPTH + 1);
    this.coinText = scene.add.text(0, 0, '0', textStyle(32, '#ffd23f')).setOrigin(0, 0.5).setDepth(DEPTH + 1);
    this.gemIcon = scene.add.image(0, 0, 'gem').setScale(0.62).setDepth(DEPTH + 1);
    this.gemText = scene.add.text(0, 0, '0', textStyle(32, '#7ff3ff')).setOrigin(0, 0.5).setDepth(DEPTH + 1);

    this.shieldIcon = scene.add.image(0, 0, 'shield').setScale(0.7).setDepth(DEPTH + 1).setVisible(false);
    this.magnetIcon = scene.add.image(0, 0, 'magnet').setScale(0.7).setDepth(DEPTH + 1).setVisible(false);
    this.magnetBar = scene.add.graphics().setDepth(DEPTH + 1);

    this.pauseButton = new IconButton(scene, 0, 0, { icon: 'icon_pause', size: 78, color: COLORS.purple, onClick: onPause });
    this.pauseButton.setDepth(DEPTH + 2);

    this.message = scene.add.text(0, 0, '', textStyle(64)).setOrigin(0.5).setDepth(DEPTH + 3).setAlpha(0);
    this.hint = scene.add
      .text(0, 0, 'TOCCA per saltare  •  TIENI PREMUTO per saltare più in alto  •  TOCCA in aria per il DOPPIO SALTO', textStyle(24, '#ffffff', { align: 'center', wordWrap: { width: 1100 } }))
      .setOrigin(0.5)
      .setDepth(DEPTH + 1)
      .setVisible(false);
  }

  layout(width, height) {
    const m = 22;
    this.width = width;
    this.height = height;

    this.margin = m;
    this._drawScorePanel(this.scorePanelW ?? 250);
    this.scoreText.setPosition(m + 20, m + 6);
    this.bestText.setPosition(m + 22, m + 64);

    const wx = width / 2 - 150;
    this.walletPanel.clear();
    this.walletPanel.fillStyle(COLORS.ink, 0.55).fillRoundedRect(wx, m, 300, 64, 20);
    this.walletPanel.lineStyle(2, COLORS.yellow, 0.45).strokeRoundedRect(wx, m, 300, 64, 20);
    this.coinIcon.setPosition(wx + 36, m + 32);
    this.coinText.setPosition(wx + 62, m + 32);
    this.gemIcon.setPosition(wx + 176, m + 32);
    this.gemText.setPosition(wx + 200, m + 32);

    this.shieldIcon.setPosition(wx + 40, m + 108);
    this.magnetIcon.setPosition(wx + 110, m + 108);
    this.pauseButton.setPosition(width - m - 39, m + 39);
    this.message.setPosition(width / 2, height * 0.36);
    this.hint.setPosition(width / 2, height - 52).setWordWrapWidth(width - 80);
  }

  _drawScorePanel(w) {
    const m = this.margin;
    this.scorePanelW = w;
    this.scorePanel.clear();
    this.scorePanel.fillStyle(COLORS.ink, 0.55).fillRoundedRect(m, m, w, 96, 20);
    this.scorePanel.lineStyle(2, COLORS.cyan, 0.5).strokeRoundedRect(m, m, w, 96, 20);
  }

  update(state) {
    if (state.score !== this.lastScore) {
      this.scoreText.setText(state.score.toLocaleString('it-IT'));
      this.bestText.setText(`RECORD ${state.best.toLocaleString('it-IT')}`);
      this.lastScore = state.score;
      const needed = Math.ceil(Math.max(250, this.scoreText.width + 44, this.bestText.width + 44) / 20) * 20;
      if (needed !== this.scorePanelW) this._drawScorePanel(needed);
    }
    this.coinText.setText(String(state.coins));
    this.gemText.setText(String(state.gems));
    this.shieldIcon.setVisible(state.shield);
    this.magnetIcon.setVisible(state.magnet > 0);

    this.magnetBar.clear();
    if (state.magnet > 0) {
      const x = this.magnetIcon.x - 26;
      const y = this.magnetIcon.y + 30;
      this.magnetBar.fillStyle(COLORS.ink, 0.7).fillRoundedRect(x, y, 52, 8, 4);
      this.magnetBar.fillStyle(COLORS.red, 1).fillRoundedRect(x, y, Math.max(6, 52 * state.magnetRatio), 8, 4);
    }
  }

  bump(target) {
    this.scene.tweens.add({ targets: target, scale: { from: target.scale * 1.35, to: target.scale }, duration: 180, ease: 'Back.easeOut' });
  }

  showMessage(text, color = COLORS.pink, duration = 1100, size = 64) {
    const m = this.message;
    this.scene.tweens.killTweensOf(m);
    m.setText(text).setFontSize(size).setColor('#ffffff').setAlpha(1).setScale(0.4);
    glow(m, color, 22);
    m.setColor(hex(0xffffff));
    this.scene.tweens.add({ targets: m, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: m, alpha: 0, delay: duration, duration: 300 });
  }

  showHint(visible) {
    this.hint.setVisible(visible).setAlpha(visible ? 1 : 0);
    if (visible) this.scene.tweens.add({ targets: this.hint, alpha: { from: 1, to: 0.45 }, duration: 700, yoyo: true, repeat: -1 });
    else this.scene.tweens.killTweensOf(this.hint);
  }

  setVisible(visible) {
    for (const o of [this.scorePanel, this.scoreText, this.bestText, this.walletPanel, this.coinIcon, this.coinText, this.gemIcon, this.gemText, this.pauseButton]) o.setVisible(visible);
    if (!visible) {
      this.shieldIcon.setVisible(false);
      this.magnetIcon.setVisible(false);
      this.magnetBar.clear();
    }
  }
}
