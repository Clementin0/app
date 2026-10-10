import Phaser from 'phaser';
import { xpToNext } from '../logic/Progression.js';
import { fmt, t } from '../i18n.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';

const PANEL_W = 720;

/**
 * Run summary with three actions:
 *  - CONTINUA: rewarded video -> revive (once per run)
 *  - RIGIOCA / MENU: end the run; every 3rd completed game shows an interstitial.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.result = {
      score: 0,
      best: 0,
      previousBest: 0,
      isNewBest: false,
      meters: 0,
      coins: 0,
      gems: 0,
      canRevive: false,
      kills: 0,
      zone: 1,
      missions: [],
      mode: 'endless',
      bosses: 0,
      xp: 0,
      level: 1,
      levelXp: 0,
      levelsUp: [],
      challengeReward: null,
      ...data,
    };
    this.busy = false;
    this.continueButton = null;
  }

  create() {
    const { ads } = services;
    const r = this.result;
    ads.showBanner();
    ads.preloadRewarded();

    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.72).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);

    // Offer the revive unless ads are known to be unavailable (init failed / no consent).
    const canContinue = r.canRevive && !ads.initFailed && !(ads.initialized && !ads.canRequestAds);
    // Notices (level up, challenge, missions) get their own line at the bottom.
    this.notices = this._notices(r);
    const missionLine = this.notices.length ? 54 : 0;
    const XP_ROW = 52;
    const panelH = (canContinue ? 560 : 450) + missionLine + XP_ROW;
    this.panelH = panelH;

    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.96).fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 36);
    bg.lineStyle(3, r.isNewBest ? COLORS.green : COLORS.pink, 1).strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 36);

    const titleColor = r.isNewBest ? COLORS.green : COLORS.pink;
    const title = glow(this.add.text(0, 58, r.isNewBest ? t('newRecord') : t('gameOver'), textStyle(64)).setOrigin(0.5), titleColor, 24);

    this.scoreText = glow(this.add.text(0, 150, '0', textStyle(84, '#ffffff')).setOrigin(0.5), COLORS.cyan, 16);
    const best = this.add.text(-PANEL_W / 2 + 60, 222, `${t('record')}  ${fmt(r.best)}`, textStyle(28, '#ffd23f')).setOrigin(0, 0.5);
    const dist = this.add.text(PANEL_W / 2 - 60, 222, `${fmt(r.meters)} m`, textStyle(28, '#c9b8ff')).setOrigin(1, 0.5);

    const coinIcon = this.add.image(-270, 278, 'coin').setScale(0.8);
    const coinText = this.add.text(-246, 278, `+${r.coins}`, textStyle(30, '#ffd23f')).setOrigin(0, 0.5);
    const gemIcon = this.add.image(-110, 278, 'gem').setScale(0.65);
    const gemText = this.add.text(-86, 278, `+${r.gems}`, textStyle(30, '#7ff3ff')).setOrigin(0, 0.5);
    const killIcon = this.add.image(40, 278, 'icon_target').setScale(0.55).setTint(COLORS.red);
    const killText = this.add.text(66, 278, String(r.kills ?? 0), textStyle(30, '#ff9ab0')).setOrigin(0, 0.5);
    const zoneLabel = r.mode === 'bossRush' ? t('bossesBeaten', { n: r.bosses }) : `${t('zoneReached')} ${r.zone ?? 1}`;
    const zoneText = this.add.text(PANEL_W / 2 - 60, 278, zoneLabel, textStyle(30, '#c9b8ff')).setOrigin(1, 0.5);

    // XP of the run and the level bar.
    const xpY = 328;
    const lvText = glow(this.add.text(-PANEL_W / 2 + 60, xpY, t('level', { n: r.level }), textStyle(28, '#7ffcff')).setOrigin(0, 0.5), COLORS.cyan, 8);
    const xpBar = this.add.graphics();
    const bx = -PANEL_W / 2 + 175;
    const bw = 330;
    xpBar.fillStyle(0x2a1d55, 1).fillRoundedRect(bx, xpY - 8, bw, 16, 8);
    xpBar.fillStyle(COLORS.cyan, 1).fillRoundedRect(bx, xpY - 8, Math.max(12, (bw * r.levelXp) / xpToNext(r.level)), 16, 8);
    const xpText = this.add.text(PANEL_W / 2 - 60, xpY, t('xpGain', { n: fmt(r.xp) }), textStyle(26, '#7ffcff')).setOrigin(1, 0.5);

    this.panel.add([bg, title, this.scoreText, best, dist, coinIcon, coinText, gemIcon, gemText, killIcon, killText, zoneText, lvText, xpBar, xpText]);

    const rowY = (canContinue ? 476 : 370) + XP_ROW;
    if (canContinue) {
      this.continueButton = new Button(this, 0, 362 + XP_ROW, {
        label: t('continue'),
        sublabel: t('watchVideo'),
        icon: 'icon_video',
        width: 460,
        height: 104,
        fontSize: 42,
        color: COLORS.green,
        onClick: () => this.onContinue(),
      });
      this.panel.add(this.continueButton);
      this._refreshContinue();
      const off = ads.on('rewardedChange', () => this._refreshContinue());
      this.events.once('shutdown', off);
      this.time.addEvent({ delay: 500, loop: true, callback: () => this._refreshContinue() });
    }

    this.retryButton = new Button(this, -150, rowY, { label: t('retry'), icon: 'icon_retry', width: 280, height: 92, fontSize: 36, color: COLORS.pink, onClick: () => this.finish('Game') });
    this.menuButton = new Button(this, 150, rowY, { label: t('menu'), icon: 'icon_home', width: 280, height: 92, fontSize: 36, color: COLORS.purple, onClick: () => this.finish('Menu') });
    this.panel.add([this.retryButton, this.menuButton]);

    if (missionLine) {
      this.missionText = this.add.text(0, panelH - 44, '', textStyle(22, '#7dffb0')).setOrigin(0.5);
      this.panel.add(this.missionText);
    }

    this.toast = this.add.text(0, 0, '', textStyle(26, '#ffffff', { backgroundColor: '#140934cc', padding: { x: 18, y: 10 } })).setOrigin(0.5).setAlpha(0).setDepth(10);

    // Animated score count-up.
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: r.score,
      duration: Math.min(1200, 300 + r.score),
      ease: 'Cubic.easeOut',
      onUpdate: () => this.scoreText.setText(fmt(Math.round(counter.v))),
    });
    if (r.isNewBest) {
      services.sfx.play('newBest');
      this.tweens.add({ targets: title, scale: { from: 1, to: 1.08 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, duration: 220 });
    this.input.keyboard?.on('keydown-ENTER', () => this.finish('Game'));

    bindLayout(this, (w, h) => this.layout(w, h));

    // Notices, shown one after the other.
    this.notices.forEach((text, i) => {
      this.time.delayedCall(700 + i * 2300, () => {
        services.sfx.play('levelUp');
        this.missionText.setText(text);
        this.missionText.setScale(Math.min(1, (PANEL_W - 60) / this.missionText.width));
        this.tweens.add({ targets: this.missionText, alpha: { from: 0, to: 1 }, duration: 250 });
      });
    });
  }

  _notices(r) {
    const reward = (x) => [x.coins ? `+${x.coins} ${t('coins')}` : '', x.gems ? `+${x.gems} ${t('gems')}` : ''].filter(Boolean).join('  ');
    const out = [];
    if (r.challengeReward) out.push(`${t('challengeWon')}  ${reward(r.challengeReward)}`);
    for (const l of r.levelsUp) out.push(`${t('levelUp', { n: l.level })}  ${reward(l.reward)}`);
    for (const m of r.missions) out.push(`${t('missionDone')}  ${t(`mission_${m.id}`, { n: m.target })}  ${reward(m.reward)}`);
    return out;
  }

  layout(width, height) {
    this.dim.setSize(width, height);
    const avail = height - bannerReserve(this);
    const s = Math.min(1, (avail - 24) / this.panelH, (width - 32) / PANEL_W);
    this.panel.setScale(s).setPosition(width / 2, Math.max(12, (avail - this.panelH * s) / 2));
    this.toast.setPosition(width / 2, Math.max(40, this.panel.y - 4 + 20));
  }

  _refreshContinue() {
    const b = this.continueButton;
    if (!b || this.busy || !b.active) return;
    if (services.ads.isRewardedReady()) b.setEnabled(true).setLabel(t('continue'), t('watchVideo'));
    else b.setEnabled(false).setLabel(t('continue'), t('loadingVideo'));
  }

  showToast(text) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 2200, duration: 400 });
  }

  _setBusy(busy) {
    this.busy = busy;
    for (const b of [this.continueButton, this.retryButton, this.menuButton]) b?.setEnabled(!busy);
    if (!busy) this._refreshContinue();
  }

  async onContinue() {
    if (this.busy) return;
    this._setBusy(true);
    const { ads } = services;
    const result = await ads.showRewarded();
    if (!this.sys.isActive()) return;
    if (result.rewarded) {
      ads.hideBanner();
      const game = this.scene.get('Game');
      this.scene.stop();
      game.reviveFromAd();
      return;
    }
    this._setBusy(false);
    this.showToast(result.shown ? t('watchToEnd') : t('videoUnavailable'));
  }

  /** Ends the run for good: counts the game for the interstitial frequency. */
  async finish(target) {
    if (this.busy) return;
    this._setBusy(true);
    const { ads, save } = services;
    save.incrementGamesPlayed();
    this.scene.get('Game')?.finalizeRun?.();
    await ads.registerCompletedGame();
    if (target === 'Game') ads.hideBanner();
    const mode = this.result.mode ?? 'endless';
    this.scene.stop('Game');
    this.scene.start(target, target === 'Game' ? { mode } : undefined);
  }

  handleBack() {
    this.finish('Menu');
  }
}
