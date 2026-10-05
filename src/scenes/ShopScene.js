import Phaser from 'phaser';
import { FREE_COINS, SKINS, skinTextureKey } from '../config/skins.js';
import { fmt, t } from '../i18n.js';
import { services } from '../services/services.js';
import { Background } from '../ui/Background.js';
import { Button, IconButton } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const CARD_W = 250;
const CARD_H = 220;
const GAP = 22;
const COLS = 4;
const CONTENT_W = COLS * CARD_W + (COLS - 1) * GAP;
const CONTENT_H = 710;

/** One skin in the shop grid: preview, name and price / state. */
class SkinCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, skin, onTap) {
    super(scene, x, y);
    this.skin = skin;
    this.enabled = true;
    this.bg = scene.add.graphics();
    this.preview = scene.add.image(0, -30, skinTextureKey(skin.id)).setScale(1.25);
    this.nameText = scene.add.text(0, 44, skin.name, textStyle(26)).setOrigin(0.5);
    this.priceIcon = scene.add.image(0, 84, skin.currency === 'gems' ? 'gem' : 'coin').setScale(skin.currency === 'gems' ? 0.55 : 0.65);
    this.status = scene.add.text(0, 84, '', textStyle(26)).setOrigin(0.5);
    this.add([this.bg, this.preview, this.nameText, this.priceIcon, this.status]);
    this.setSize(CARD_W, CARD_H);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => onTap(this));
    scene.tweens.add({ targets: this.preview, y: -38, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.add.existing(this);
  }

  refresh() {
    const { save } = services;
    const owned = save.ownsSkin(this.skin.id);
    const selected = save.snapshot().selectedSkin === this.skin.id;
    const border = selected ? COLORS.green : owned ? COLORS.cyan : COLORS.panelEdge;
    const g = this.bg;
    g.clear();
    g.fillStyle(selected ? 0x123a2e : COLORS.panel, 0.95).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 24);
    g.lineStyle(selected ? 5 : 3, border, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 24);
    this.preview.setAlpha(owned ? 1 : 0.55);

    if (selected) {
      this.priceIcon.setVisible(false);
      this.status.setText(t('equipped')).setColor(hex(COLORS.green)).setX(0);
    } else if (owned) {
      this.priceIcon.setVisible(false);
      this.status.setText(t('equip')).setColor('#ffffff').setX(0);
    } else {
      this.status.setText(fmt(this.skin.price)).setColor(this.skin.currency === 'gems' ? '#7ff3ff' : '#ffd23f');
      const total = this.priceIcon.displayWidth + 8 + this.status.width;
      this.priceIcon.setVisible(true).setX(-total / 2 + this.priceIcon.displayWidth / 2);
      this.status.setX(-total / 2 + this.priceIcon.displayWidth + 8 + this.status.width / 2);
    }
  }
}

/** Skin shop: spend coins and gems, or watch a video for free coins. */
export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  init() {
    this.busy = false;
    this.leaving = false;
  }

  create() {
    const { ads } = services;
    ads.showBanner();
    ads.preloadRewarded();
    this.cameras.main.fadeIn(200, 7, 2, 26);

    this.bg = new Background(this);
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.55).setOrigin(0);
    this.content = this.add.container(0, 0);

    const title = glow(this.add.text(0, 50, t('shop'), textStyle(60)).setOrigin(0.5), COLORS.yellow, 22);
    this.backButton = new IconButton(this, -CONTENT_W / 2 + 40, 50, { icon: 'icon_back', size: 76, color: COLORS.purple, onClick: () => this.leave() });

    this.wallet = this.add.graphics();
    this.wallet.fillStyle(COLORS.ink, 0.7).fillRoundedRect(CONTENT_W / 2 - 300, 18, 300, 64, 22);
    this.wallet.lineStyle(2, COLORS.yellow, 0.6).strokeRoundedRect(CONTENT_W / 2 - 300, 18, 300, 64, 22);
    const coinIcon = this.add.image(CONTENT_W / 2 - 266, 50, 'coin').setScale(0.75);
    this.coinText = this.add.text(CONTENT_W / 2 - 242, 50, '', textStyle(30, '#ffd23f')).setOrigin(0, 0.5);
    const gemIcon = this.add.image(CONTENT_W / 2 - 112, 50, 'gem').setScale(0.6);
    this.gemText = this.add.text(CONTENT_W / 2 - 90, 50, '', textStyle(30, '#7ff3ff')).setOrigin(0, 0.5);
    this.content.add([title, this.backButton, this.wallet, coinIcon, this.coinText, gemIcon, this.gemText]);

    this.cards = SKINS.map((skin, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = -CONTENT_W / 2 + CARD_W / 2 + col * (CARD_W + GAP);
      const y = 120 + CARD_H / 2 + row * (CARD_H + GAP);
      return new SkinCard(this, x, y, skin, (card) => this.onCard(card));
    });
    this.content.add(this.cards);

    this.freeButton = new Button(this, 0, CONTENT_H - 50, {
      label: t('freeCoins', { n: FREE_COINS.amount }),
      sublabel: t('watchVideo'),
      icon: 'icon_video',
      width: 420,
      height: 92,
      fontSize: 34,
      color: COLORS.green,
      onClick: () => this.onFreeCoins(),
    });
    this.content.add(this.freeButton);

    this.toast = this.add.text(0, 0, '', textStyle(28, '#ffffff', { backgroundColor: '#140934f5', padding: { x: 24, y: 12 } })).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.sparkles = this.add
      .particles(0, 0, 'spark', { speed: { min: 80, max: 320 }, lifespan: 600, scale: { start: 0.9, end: 0 }, tint: [COLORS.yellow, COLORS.cyan, COLORS.white], blendMode: 'ADD', emitting: false })
      .setDepth(9);

    this.refresh();
    this.time.addEvent({ delay: 500, loop: true, callback: () => this._refreshFreeButton() });
    const off = ads.on('rewardedChange', () => this._refreshFreeButton());
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown-ESC', () => this.leave());

    bindLayout(this, (w, h) => this.layout(w, h));
  }

  layout(width, height) {
    this.bg.layout(width, height, height - 120);
    this.dim.setSize(width, height);
    const avail = height - bannerReserve(this);
    const scale = Math.min(1, (avail - 16) / CONTENT_H, (width - 32) / CONTENT_W);
    this.content.setScale(scale).setPosition(width / 2, Math.max(8, (avail - CONTENT_H * scale) / 2));
    this.toast.setPosition(width / 2, avail / 2);
  }

  refresh() {
    const s = services.save.snapshot();
    this.coinText.setText(fmt(s.totalCoins));
    this.gemText.setText(fmt(s.totalGems));
    for (const c of this.cards) c.refresh();
    this._refreshFreeButton();
  }

  _refreshFreeButton() {
    const b = this.freeButton;
    if (!b?.active || this.busy) return;
    const wait = services.save.freeCoinsCooldownLeft();
    if (wait > 0) {
      const sec = Math.ceil(wait / 1000);
      b.setEnabled(false).setLabel(t('freeCoins', { n: FREE_COINS.amount }), t('freeCoinsWait', { t: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }));
    } else if (services.ads.isRewardedReady()) {
      b.setEnabled(true).setLabel(t('freeCoins', { n: FREE_COINS.amount }), t('watchVideo'));
    } else {
      b.setEnabled(false).setLabel(t('freeCoins', { n: FREE_COINS.amount }), t('loadingVideo'));
    }
  }

  showToast(text) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }

  _cardWorldPos(card) {
    const m = card.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  onCard(card) {
    if (this.busy) return;
    const { save, sfx, haptics } = services;
    const skin = card.skin;
    if (save.ownsSkin(skin.id)) {
      save.selectSkin(skin.id);
      sfx.play('click');
    } else {
      const result = save.buySkin(skin.id);
      if (result === 'bought') {
        sfx.play('newBest');
        haptics.success();
        const p = this._cardWorldPos(card);
        this.sparkles.explode(36, p.x, p.y);
        this.tweens.add({ targets: card, scale: { from: 1.12, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        this.showToast(t('unlocked', { name: skin.name }));
      } else {
        sfx.play('shieldBreak');
        haptics.light();
        this.tweens.add({ targets: card, x: card.x + 10, duration: 50, yoyo: true, repeat: 3 });
        this.showToast(t('notEnough', { currency: t(skin.currency) }));
      }
    }
    this.refresh();
  }

  async onFreeCoins() {
    if (this.busy) return;
    this.busy = true;
    this.freeButton.setEnabled(false);
    const result = await services.ads.showRewarded();
    if (!this.sys.isActive()) return;
    this.busy = false;
    if (result.rewarded) {
      const amount = services.save.claimFreeCoins();
      if (amount > 0) {
        services.sfx.play('coin');
        services.haptics.success();
        const m = this.freeButton.getWorldTransformMatrix();
        this.sparkles.explode(30, m.tx, m.ty);
        this.showToast(t('rewardCoins', { n: amount }));
      }
    } else {
      this.showToast(result.shown ? t('watchToEnd') : t('videoUnavailable'));
    }
    this.refresh();
  }

  leave() {
    if (this.leaving || this.busy) return;
    this.leaving = true;
    this.scene.start('Menu');
  }

  handleBack() {
    this.leave();
  }

  update(_time, delta) {
    this.bg.update(Math.min(delta / 1000, 0.05), 120);
  }
}
