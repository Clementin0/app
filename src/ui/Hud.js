import { BOSS_KINDS } from '../config/game3d.config.js';
import { PERKS } from '../config/perks.js';
import { zoneTheme } from '../config/zones.js';
import { fmt, t } from '../i18n.js';
import { Button, IconButton } from './Button.js';
import { COLORS, glow, hex, textStyle } from './theme.js';

const DEPTH = 100;
const POWERUPS = [
  { key: 'shield', color: COLORS.green },
  { key: 'magnet', color: COLORS.red, max: 18 },
  { key: 'rapid', color: COLORS.orange, max: 7 },
  { key: 'double', color: COLORS.yellow, max: 10 },
  { key: 'jetpack', color: COLORS.cyan, max: 7 },
];
const EVENT_COLORS = { goldRush: COLORS.yellow, meteors: COLORS.orange, ambush: COLORS.red };

/**
 * In-game HUD drawn by Phaser over the 3D view: score, best, hearts, coins,
 * gems, power-up timers, combo, boss health, zone banner, pause button.
 */
export class Hud {
  constructor(scene, { onPause, onSkipTutorial }) {
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
    // Tutorial prompt: gesture text + animated arrow, and a skip button.
    this.prompt = scene.add.container(0, 0).setDepth(DEPTH + 3).setVisible(false);
    this.promptBg = scene.add.graphics();
    this.promptText = glow(scene.add.text(0, 0, '', textStyle(38)).setOrigin(0.5), COLORS.cyan, 18);
    this.promptArrow = glow(scene.add.text(0, 92, '', textStyle(96, '#7ffcff')).setOrigin(0.5), COLORS.cyan, 24);
    this.promptRing = scene.add.circle(0, 92, 34).setStrokeStyle(8, COLORS.cyan).setFillStyle(COLORS.cyan, 0.25);
    this.prompt.add([this.promptBg, this.promptRing, this.promptArrow, this.promptText]);
    this.promptId = null;
    this.skipButton = new Button(scene, 0, 0, { label: t('tutSkip'), width: 220, height: 52, fontSize: 19, color: COLORS.panelEdge, onClick: () => onSkipTutorial?.() });
    this.skipButton.setDepth(DEPTH + 2).setVisible(false);
    this.vignette = scene.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH - 1).setAlpha(0);
    // Mode label (daily challenge / boss rush) under the score panel.
    this.modeLabel = scene.add.text(0, 0, '', textStyle(17, '#ffd23f', { strokeThickness: 4 })).setDepth(DEPTH + 1).setVisible(false);
    // Event in progress: name and time left under the wallet.
    this.eventLabel = scene.add.text(0, 0, '', textStyle(18, '#ffd23f', { strokeThickness: 4 })).setOrigin(0.5).setDepth(DEPTH + 1).setVisible(false);
    this.eventBar = scene.add.graphics().setDepth(DEPTH);
    // Active perks: small badges with their level, bottom-left.
    this.perkIcons = PERKS.map((p) => ({
      id: p.id,
      icon: scene.add.image(0, 0, `perk_${p.id}`).setScale(0.62).setDepth(DEPTH + 1).setVisible(false),
      level: scene.add.text(0, 0, '', textStyle(16, '#ffffff', { strokeThickness: 4 })).setOrigin(0.5).setDepth(DEPTH + 2).setVisible(false),
    }));
    this.lastPerks = '';
    // Reused "+points" popups over killed enemies.
    this.popups = Array.from({ length: 8 }, () => scene.add.text(0, 0, '', textStyle(30, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH - 1).setVisible(false));
    this.nextPopup = 0;
  }

  /** Floating points at a normalized screen position (0..1). */
  popup(nx, ny, text, color = '#ffd23f', size = 30) {
    const p = this.popups[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % this.popups.length;
    const x = nx * this.width;
    const y = ny * this.height;
    this.scene.tweens.killTweensOf(p);
    p.setText(text).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
    this.scene.tweens.add({ targets: p, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: p, y: y - 70, alpha: 0, delay: 250, duration: 550, onComplete: () => p.setVisible(false) });
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

    this.powerups.forEach((p, i) => p.icon.setPosition(m + 30 + i * 64, m + 182));
    this.combo.setPosition(width - m, height * 0.42);
    this.pauseButton.setPosition(width - m - 38, m + 38);
    this.message.setPosition(width / 2, height * 0.32);
    this.subMessage.setPosition(width / 2, height * 0.32 + 62);
    // Above the obstacles and the runner, under the wallet.
    this.prompt.setPosition(width / 2, Math.max(150, height * 0.27));
    this.skipButton.setPosition(width - m - 110, m + 112);
    this.vignette.setDisplaySize(width, height);
    this.modeLabel.setPosition(m + 4, m + 134);
    this.eventLabel.setPosition(width / 2, m + 84);
    this.lastPerks = ''; // re-place the perk badges
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

    // Zone progress bar (towards the boss), or the time left of an event.
    const z = this.zoneBarRect;
    const theme = zoneTheme(state.zone);
    this.zoneBar.clear();
    this.zoneBar.fillStyle(COLORS.ink, 0.7).fillRoundedRect(z.x, z.y, z.w, 8, 4);
    const ev = state.event;
    if (ev) {
      const color = EVENT_COLORS[ev.type] ?? COLORS.yellow;
      this.zoneBar.fillStyle(color, 1).fillRoundedRect(z.x, z.y, Math.max(8, z.w * (ev.left / ev.duration)), 8, 4);
      if (this.eventType !== ev.type) {
        this.eventType = ev.type;
        this.eventLabel.setText(t(`event_${ev.type}`).replace('!', '')).setColor(hex(color));
      }
      this.eventLabel.setVisible(!state.boss);
    } else {
      this.eventType = null;
      this.eventLabel.setVisible(false);
      this.zoneBar.fillStyle(state.boss ? COLORS.pink : theme.line, 1).fillRoundedRect(z.x, z.y, Math.max(8, z.w * (state.boss ? 1 : state.zoneProgress)), 8, 4);
    }

    // Active perks (only re-laid out when they change).
    const perkKey = JSON.stringify(state.perks ?? {});
    if (perkKey !== this.lastPerks) {
      this.lastPerks = perkKey;
      let i = 0;
      for (const p of this.perkIcons) {
        const level = state.perks?.[p.id] ?? 0;
        p.icon.setVisible(level > 0);
        p.level.setVisible(level > 1);
        if (!level) continue;
        const x = this.margin + 22 + i * 44;
        const y = this.height - this.margin - 22;
        p.icon.setPosition(x, y);
        p.level.setText(String(level)).setPosition(x + 15, y - 15);
        i += 1;
      }
    }

    // Power-up timers.
    let slot = 0;
    for (const p of this.powerups) {
      const value = state[p.key];
      const active = p.key === 'shield' ? value : value > 0;
      p.icon.setVisible(!!active);
      p.bar.clear();
      if (!active) continue;
      const x = this.margin + 30 + slot * 64;
      const y = this.margin + 182;
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
      this.combo.fading = false; // a killed fade never runs its onComplete
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
    if (state.boss && state.boss.kind !== this.bossKind) {
      this.bossKind = state.boss.kind;
      const kind = BOSS_KINDS.find((k) => k.id === state.boss.kind);
      this.bossLabel.setText(kind ? t(kind.nameKey) : 'BOSS');
      this.bossColor = kind?.ring ?? COLORS.pink;
      this.bossLabel.setColor(hex(this.bossColor));
    }
    if (state.boss) {
      const b = this.bossRect;
      const ratio = state.boss.hp / state.boss.maxHp;
      this.bossPanel.fillStyle(COLORS.ink, 0.75).fillRoundedRect(b.x, b.y, b.w, 18, 9);
      this.bossPanel.fillStyle(this.bossColor ?? COLORS.pink, 1).fillRoundedRect(b.x + 2, b.y + 2, Math.max(8, (b.w - 4) * ratio), 14, 7);
      this.bossPanel.lineStyle(2, COLORS.white, 0.6).strokeRoundedRect(b.x, b.y, b.w, 18, 9);
    }
  }

  hurtFlash() {
    this.scene.tweens.killTweensOf(this.vignette);
    this.vignette.setAlpha(0.9);
    this.scene.tweens.add({ targets: this.vignette, alpha: 0, duration: 450 });
  }

  /** Pops an icon; overlapping bumps (a line of coins) restart from its base scale. */
  bump(target) {
    target.baseScale ??= target.scale;
    this.scene.tweens.killTweensOf(target);
    this.scene.tweens.add({ targets: target, scale: { from: target.baseScale * 1.35, to: target.baseScale }, duration: 180, ease: 'Back.easeOut' });
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

  clearMessage() {
    this.scene.tweens.killTweensOf([this.message, this.subMessage]);
    this.message.setAlpha(0);
    this.subMessage.setAlpha(0);
  }

  /** Shows the gesture for a tutorial step ({ id, hint, gesture }), or hides it with null. */
  showPrompt(step) {
    const id = step?.id ?? null;
    if (id === this.promptId) return;
    this.promptId = id;
    const tweens = this.scene.tweens;
    tweens.killTweensOf([this.promptArrow, this.promptRing, this.prompt]);
    if (!step) {
      tweens.add({ targets: this.prompt, alpha: 0, duration: 150, onComplete: () => this.prompt.setVisible(false) });
      return;
    }
    this.promptText.setText(t(step.hint));
    const w = this.promptText.width + 60;
    this.promptBg.clear();
    this.promptBg.fillStyle(COLORS.ink, 0.7).fillRoundedRect(-w / 2, -34, w, 68, 22);
    this.promptBg.lineStyle(3, COLORS.cyan, 0.8).strokeRoundedRect(-w / 2, -34, w, 68, 22);
    const glyph = { horizontal: '←   →', up: '↑', down: '↓' }[step.gesture] ?? '';
    this.promptArrow.setText(glyph).setPosition(0, 92).setVisible(!!glyph);
    this.promptRing.setVisible(step.gesture === 'hold').setScale(1);
    this.prompt.setVisible(true).setAlpha(0);
    tweens.add({ targets: this.prompt, alpha: 1, duration: 160 });
    // The arrow mimics the swipe; the ring pulses like a finger held down.
    if (step.gesture === 'up') tweens.add({ targets: this.promptArrow, y: 62, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    else if (step.gesture === 'down') tweens.add({ targets: this.promptArrow, y: 122, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    else if (step.gesture === 'horizontal') tweens.add({ targets: this.promptArrow, scaleX: 1.25, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    else tweens.add({ targets: this.promptRing, scale: 1.35, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  setModeLabel(text, color = COLORS.yellow) {
    this.modeLabel.setText(text).setColor(hex(color)).setVisible(!!text);
  }

  showSkip(visible) {
    this.skipButton.setVisible(visible);
  }
}
