import Phaser from 'phaser';
import { fmt, t } from '../i18n.js';
import { DAILY_REWARDS } from '../services/DailyReward.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';

const PANEL_W = 820;
const PANEL_H = 470;
const TILE_W = 100;
const TILE_H = 136;
const GAP = 12;

/**
 * Daily login reward overlay, shown by the menu once per day: a 7-day
 * ladder, claim now or double it with a rewarded video.
 */
export class DailyScene extends Phaser.Scene {
  constructor() {
    super('Daily');
  }

  init() {
    this.busy = false;
    this.claimed = false;
  }

  create() {
    const { save, ads } = services;
    const status = save.dailyStatus();
    this.status = status;
    ads.preloadRewarded();

    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.72).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    bg.lineStyle(3, COLORS.yellow, 0.9).strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    const title = glow(this.add.text(0, 54, t('dailyTitle'), textStyle(44, '#ffd23f')).setOrigin(0.5), COLORS.orange, 18);
    const sub = this.add.text(0, 104, status.streak > 1 ? t('dailyStreak', { n: status.streak }) : t('dailyFirst'), textStyle(24, '#e9ddff')).setOrigin(0.5);
    this.panel.add([bg, title, sub]);

    // The 7-day ladder: past days ticked, today highlighted.
    const x0 = -((TILE_W + GAP) * DAILY_REWARDS.length - GAP) / 2 + TILE_W / 2;
    this.tiles = DAILY_REWARDS.map((r, i) => {
      const day = i + 1;
      const x = x0 + i * (TILE_W + GAP);
      const y = 222;
      const past = day < status.day;
      const today = day === status.day;
      const g = this.add.graphics();
      g.fillStyle(today ? 0x3a2a12 : COLORS.ink, past ? 0.5 : 0.9).fillRoundedRect(x - TILE_W / 2, y - TILE_H / 2, TILE_W, TILE_H, 18);
      g.lineStyle(today ? 5 : 2, today ? COLORS.yellow : past ? COLORS.green : COLORS.panelEdge, 1).strokeRoundedRect(x - TILE_W / 2, y - TILE_H / 2, TILE_W, TILE_H, 18);
      const label = this.add.text(x, y - 46, t('dayN', { n: day }), textStyle(20, today ? '#ffd23f' : '#c9b8ff')).setOrigin(0.5);
      const gemDay = r.gems > 0;
      const icon = this.add.image(x, y - 2, gemDay ? 'gem' : 'coin').setScale(gemDay ? 0.62 : 0.78);
      const amount = this.add.text(x, y + 40, `+${fmt(gemDay ? r.gems : r.coins)}`, textStyle(24, gemDay ? '#7ff3ff' : '#ffd23f')).setOrigin(0.5);
      const parts = [g, label, icon, amount];
      if (gemDay && r.coins > 0) parts.push(this.add.text(x, y + 62, `+${fmt(r.coins)}`, textStyle(15, '#ffd23f')).setOrigin(0.5));
      if (past) {
        icon.setAlpha(0.35);
        amount.setAlpha(0.35);
        parts.push(this.add.text(x, y - 2, '✔', textStyle(48, '#39ff88')).setOrigin(0.5));
      }
      if (today) this.tweens.add({ targets: [icon], scale: icon.scale * 1.15, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.panel.add(parts);
      return { x, y, icon };
    });

    this.claimButton = new Button(this, -180, 382, { label: t('dailyClaim'), width: 320, height: 92, fontSize: 36, color: COLORS.green, onClick: () => this.claim(1) });
    this.doubleButton = new Button(this, 180, 382, { label: t('dailyDouble'), sublabel: t('watchVideo'), icon: 'icon_video', width: 320, height: 92, fontSize: 34, color: COLORS.purple, onClick: () => this.claimDoubled() });
    this.panel.add([this.claimButton, this.doubleButton]);
    // Without ads (no consent / init failed) only the plain claim remains.
    if (ads.initFailed || (ads.initialized && !ads.canRequestAds)) {
      this.doubleButton.setVisible(false);
      this.claimButton.setX(0);
    }

    this.sparkles = this.add
      .particles(0, 0, 'spark', { speed: { min: 80, max: 340 }, lifespan: 700, scale: { start: 0.9, end: 0 }, tint: [COLORS.yellow, COLORS.cyan, COLORS.white], blendMode: 'ADD', emitting: false })
      .setDepth(9);
    this.toast = this.add.text(0, 0, '', textStyle(26, '#ffffff', { backgroundColor: '#140934f0', padding: { x: 20, y: 10 } })).setOrigin(0.5).setAlpha(0).setDepth(10);

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const avail = h - bannerReserve(this);
      const s = Math.min(1, (avail - 24) / PANEL_H, (w - 32) / PANEL_W);
      this.panelScale = s;
      this.panel.setScale(s).setPosition(w / 2, Math.max(8, (avail - PANEL_H * s) / 2));
      this.toast.setPosition(w / 2, Math.max(30, this.panel.y - 4 + 24));
    });
    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, scale: { from: this.panelScale * 0.9, to: this.panelScale }, duration: 220, ease: 'Back.easeOut' });
    services.sfx.play('powerup');
  }

  async claimDoubled() {
    if (this.busy || this.claimed) return;
    this.busy = true;
    this.claimButton.setEnabled(false);
    this.doubleButton.setEnabled(false);
    const result = await services.ads.showRewarded();
    if (!this.sys.isActive()) return;
    this.busy = false;
    // A video that was not watched to the end still gives the normal reward.
    if (!result.rewarded) this.showToast(result.shown ? t('watchToEnd') : t('videoUnavailable'));
    this.claim(result.rewarded ? 2 : 1);
  }

  claim(multiplier) {
    if (this.busy || this.claimed) return;
    const granted = services.save.claimDaily(multiplier);
    this.claimed = true;
    this.claimButton.setEnabled(false);
    this.doubleButton.setEnabled(false);
    if (granted) {
      const tile = this.tiles[granted.day - 1];
      const m = this.panel.getWorldTransformMatrix();
      this.sparkles.explode(46, m.tx + tile.x * this.panel.scaleX, m.ty + tile.y * this.panel.scaleY);
      services.sfx.play('newBest');
      services.haptics.success();
      const parts = [granted.coins ? `+${fmt(granted.coins)} ${t('coins')}` : '', granted.gems ? `+${fmt(granted.gems)} ${t('gems')}` : ''].filter(Boolean);
      if (multiplier === 2 || !this.toast.alpha) this.showToast(parts.join('  '));
    }
    this.scene.get('Menu')?.refreshWallet?.();
    this.time.delayedCall(1100, () => this.close());
  }

  showToast(text) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 300 });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
  }

  /** Back button: take the plain reward and close. */
  handleBack() {
    if (!this.claimed) this.claim(1);
  }
}
