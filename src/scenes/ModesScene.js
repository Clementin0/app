import Phaser from 'phaser';
import { fmt, t } from '../i18n.js';
import { CHALLENGE_REWARD, dailyChallenge } from '../services/DailyChallenge.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const PANEL_W = 920;
const PANEL_H = 545;
const CARD_W = 420;
const CARD_H = 365;

/** Extra modes from the menu: today's challenge and the boss rush. */
export class ModesScene extends Phaser.Scene {
  constructor() {
    super('Modes');
  }

  init() {
    this.closing = false;
  }

  create() {
    const { save } = services;
    const s = save.snapshot();
    const challenge = dailyChallenge(Date.now());
    const status = save.challengeStatus();

    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.72).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    bg.lineStyle(3, COLORS.purple, 0.9).strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    const title = glow(this.add.text(0, 50, t('modes'), textStyle(48)).setOrigin(0.5), COLORS.purple, 18);
    this.panel.add([bg, title]);

    // Daily challenge card.
    const daily = this._card(-CARD_W / 2 - 15, COLORS.yellow, t('modeDaily'), [
      [t('challengeToday'), '#c9b8ff', 18],
      [t(`mod_${challenge.modifier.id}`), '#ffffff', 22],
      [t('modeBest', { n: fmt(status.best) }), '#ffd23f', 20],
      [status.done ? t('challengeDone') : t('challengeReward', CHALLENGE_REWARD), status.done ? '#7dffb0' : '#9ff6ff', 17],
    ]);
    this.dailyButton = new Button(this, -CARD_W / 2 - 15, this._buttonY(daily), { label: t('play'), icon: 'icon_play', width: 260, height: 76, fontSize: 32, color: COLORS.green, onClick: () => this.play('daily') });

    // Boss rush card.
    const rush = this._card(CARD_W / 2 + 15, COLORS.pink, t('modeBossRush'), [
      [t('modeBossRushDesc'), '#ffffff', 21],
      [t('modeBestBosses', { n: s.bossRushBest.bosses }), '#ffd23f', 20],
      [s.bossRushBest.score ? t('modeBest', { n: fmt(s.bossRushBest.score) }) : '', '#c9b8ff', 17],
    ]);
    this.bossRushButton = new Button(this, CARD_W / 2 + 15, this._buttonY(rush), { label: t('play'), icon: 'icon_play', width: 260, height: 76, fontSize: 32, color: COLORS.pink, onClick: () => this.play('bossRush') });

    this.closeButton = new Button(this, 0, PANEL_H - 22, { label: t('close'), width: 220, height: 60, fontSize: 26, color: COLORS.panelEdge, onClick: () => this.close() });
    this.panel.add([...daily.items, ...rush.items, this.dailyButton, this.bossRushButton, this.closeButton]);

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const avail = h - bannerReserve(this);
      const sc = Math.min(1, (avail - 40) / PANEL_H, (w - 32) / PANEL_W);
      this.panel.setScale(sc).setPosition(w / 2, Math.max(8, (avail - (PANEL_H + 30) * sc) / 2));
    });
    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, duration: 180 });
  }

  /** Card frame with a title and lines of text (centered). */
  _card(x, color, title, lines) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 0.75).fillRoundedRect(x - CARD_W / 2, 95, CARD_W, CARD_H, 26);
    g.lineStyle(3, color, 0.9).strokeRoundedRect(x - CARD_W / 2, 95, CARD_W, CARD_H, 26);
    const head = glow(this.add.text(x, 132, title, textStyle(32, hex(color))).setOrigin(0.5), color, 12);
    const items = [g, head];
    let y = 176;
    for (const [text, c, size] of lines) {
      if (!text) continue;
      const line = this.add.text(x, y, text, textStyle(size, c, { align: 'center', wordWrap: { width: CARD_W - 40 } })).setOrigin(0.5, 0);
      items.push(line);
      y += line.height + 8;
    }
    return { items, bottom: y };
  }

  /** Play button under the card's text, inside the card. */
  _buttonY(card) {
    return Math.min(95 + CARD_H - 44, Math.max(410, card.bottom + 40));
  }

  play(mode) {
    if (this.closing) return;
    this.closing = true;
    services.sfx.unlock();
    const menu = this.scene.get('Menu');
    this.scene.stop();
    menu.startGame({ mode });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
  }

  handleBack() {
    this.close();
  }
}
