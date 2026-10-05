import Phaser from 'phaser';
import { CATALOG, currencyOf, FREE_COINS, getItem, itemName } from '../config/cosmetics.js';
import { nextCost, UPGRADES } from '../config/upgrades.js';
import { fmt, getLanguage, t } from '../i18n.js';
import { services } from '../services/services.js';
import { PreviewView } from '../three/PreviewView.js';
import { Button, IconButton } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const DESIGN_W = 1240;
const DESIGN_H = 640;
const PANEL_X = -DESIGN_W / 2 + 470; // right panel left edge
const PANEL_W = DESIGN_W / 2 - PANEL_X;
const CARD_W = 172;
const CARD_H = 150;
const GAP = 12;

const TABS = [
  { id: 'skin', label: 'tabSkins' },
  { id: 'hat', label: 'tabHats' },
  { id: 'weapon', label: 'tabWeapons' },
  { id: 'trail', label: 'tabTrails' },
  { id: 'upgrades', label: 'tabUpgrades' },
];

const iconFor = (category, item) => (category === 'trail' ? 'icon_trail' : `${category}_${item.id}`);

function itemColor(category, item) {
  if (category === 'trail') return item.colors[0];
  const color = item.color ?? item.body ?? 0xffffff;
  // Very dark items (the top hat) would vanish on the dark card.
  return Phaser.Display.Color.IntegerToColor(color).v < 0.35 ? 0x8f86d9 : color;
}

/** One item card in the grid. */
class ItemCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, category, item, onTap) {
    super(scene, x, y);
    this.category = category;
    this.item = item;
    this.enabled = true;
    this.bg = scene.add.graphics();
    const icon =
      category === 'skin'
        ? scene.add.image(0, -24, `swatch_${item.id}`).setScale(0.9)
        : scene.add.image(0, -26, iconFor(category, item)).setScale(0.85).setTint(itemColor(category, item)).setAlpha(item.id === 'none' ? 0.6 : 1);
    this.nameText = scene.add.text(0, 30, itemName(item, getLanguage()), textStyle(20)).setOrigin(0.5);
    this.priceIcon = scene.add.image(0, 58, currencyOf(item) === 'gems' ? 'gem' : 'coin').setScale(currencyOf(item) === 'gems' ? 0.45 : 0.55);
    this.status = scene.add.text(0, 58, '', textStyle(20)).setOrigin(0.5);
    this.add([this.bg, icon, this.nameText, this.priceIcon, this.status]);
    this.setSize(CARD_W, CARD_H);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => onTap(this));
    scene.add.existing(this);
  }

  refresh(selected) {
    const { save } = services;
    const owned = save.owns(this.category, this.item.id);
    const equipped = save.equippedId(this.category) === this.item.id;
    const g = this.bg;
    g.clear();
    g.fillStyle(equipped ? 0x123a2e : COLORS.panel, 0.95).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 20);
    g.lineStyle(selected ? 5 : 3, selected ? COLORS.yellow : equipped ? COLORS.green : owned ? COLORS.cyan : COLORS.panelEdge, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 20);
    if (equipped || owned) {
      this.priceIcon.setVisible(false);
      this.status.setText(equipped ? t('equipped') : t('owned')).setColor(equipped ? hex(COLORS.green) : '#ffffff').setX(0);
    } else {
      this.status.setText(fmt(this.item.price)).setColor(currencyOf(this.item) === 'gems' ? '#7ff3ff' : '#ffd23f');
      const total = this.priceIcon.displayWidth + 6 + this.status.width;
      this.priceIcon.setVisible(true).setX(-total / 2 + this.priceIcon.displayWidth / 2);
      this.status.setX(-total / 2 + this.priceIcon.displayWidth + 6 + this.status.width / 2);
    }
  }
}

/** Shop: cosmetics with a live 3D try-on, permanent upgrades, free coins video. */
export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  init() {
    this.busy = false;
    this.leaving = false;
    this.tab = 'skin';
  }

  create() {
    const { ads, save, stage } = services;
    ads.showBanner();
    ads.preloadRewarded();
    services.music.setIntensity(0);
    this.cameras.main.fadeIn(200, 7, 2, 26);

    this.preview = stage.setView(new PreviewView(stage, { equipped: save.snapshot().equipped }));
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.25).setOrigin(0);
    this.content = this.add.container(0, 0);

    const panel = this.add.graphics();
    panel.fillStyle(COLORS.ink, 0.82).fillRoundedRect(PANEL_X - 16, 70, PANEL_W + 16, DESIGN_H - 70, 28);
    panel.lineStyle(2, COLORS.panelEdge, 0.9).strokeRoundedRect(PANEL_X - 16, 70, PANEL_W + 16, DESIGN_H - 70, 28);
    this.backButton = new IconButton(this, -DESIGN_W / 2 + 40, 36, { icon: 'icon_back', size: 72, color: COLORS.purple, onClick: () => this.leave() });
    const title = glow(this.add.text(-DESIGN_W / 2 + 92, 36, t('shop'), textStyle(46)).setOrigin(0, 0.5), COLORS.yellow, 20);

    const wallet = this.add.graphics();
    wallet.fillStyle(COLORS.ink, 0.75).fillRoundedRect(DESIGN_W / 2 - 290, 8, 290, 56, 20);
    wallet.lineStyle(2, COLORS.yellow, 0.6).strokeRoundedRect(DESIGN_W / 2 - 290, 8, 290, 56, 20);
    const coinIcon = this.add.image(DESIGN_W / 2 - 258, 36, 'coin').setScale(0.7);
    this.coinText = this.add.text(DESIGN_W / 2 - 236, 36, '', textStyle(26, '#ffd23f')).setOrigin(0, 0.5);
    const gemIcon = this.add.image(DESIGN_W / 2 - 110, 36, 'gem').setScale(0.55);
    this.gemText = this.add.text(DESIGN_W / 2 - 90, 36, '', textStyle(26, '#7ff3ff')).setOrigin(0, 0.5);

    this.tabButtons = TABS.map((tab, i) => {
      const w = (PANEL_W - GAP * (TABS.length - 1)) / TABS.length;
      const b = new Button(this, PANEL_X + w / 2 + i * (w + GAP), 110, { label: t(tab.label), width: w, height: 54, fontSize: 19, color: COLORS.purple, onClick: () => this.setTab(tab.id) });
      b.tabId = tab.id;
      return b;
    });

    this.grid = this.add.container(0, 0);
    this.infoName = this.add.text(PANEL_X, 492, '', textStyle(26, '#ffffff')).setOrigin(0, 0.5);
    this.infoDesc = this.add.text(PANEL_X, 524, '', textStyle(19, '#c9b8ff')).setOrigin(0, 0.5);
    this.actionButton = new Button(this, DESIGN_W / 2 - 150, 586, { label: t('buy'), width: 280, height: 74, fontSize: 30, color: COLORS.green, onClick: () => this.onAction() });

    this.freeButton = new Button(this, -DESIGN_W / 2 + 230, 586, {
      label: t('freeCoins', { n: FREE_COINS.amount }),
      sublabel: t('watchVideo'),
      icon: 'icon_video',
      width: 380,
      height: 82,
      fontSize: 30,
      color: COLORS.green,
      onClick: () => this.onFreeCoins(),
    });

    this.content.add([panel, this.backButton, title, wallet, coinIcon, this.coinText, gemIcon, this.gemText, ...this.tabButtons, this.grid, this.infoName, this.infoDesc, this.actionButton, this.freeButton]);

    this.toast = this.add.text(0, 0, '', textStyle(26, '#ffffff', { backgroundColor: '#140934f5', padding: { x: 22, y: 12 } })).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.sparkles = this.add
      .particles(0, 0, 'spark', { speed: { min: 80, max: 320 }, lifespan: 600, scale: { start: 0.9, end: 0 }, tint: [COLORS.yellow, COLORS.cyan, COLORS.white], blendMode: 'ADD', emitting: false })
      .setDepth(9);

    this.setTab('skin');
    this.time.addEvent({ delay: 500, loop: true, callback: () => this._refreshFreeButton() });
    const off = ads.on('rewardedChange', () => this._refreshFreeButton());
    this.events.once('shutdown', off);
    this.input.keyboard?.on('keydown-ESC', () => this.leave());

    bindLayout(this, (w, h) => this.layout(w, h));
  }

  layout(width, height) {
    this.dim.setSize(width, height);
    const avail = height - bannerReserve(this);
    const scale = Math.min(1, (avail - 8) / DESIGN_H, (width - 24) / DESIGN_W);
    const x = width / 2;
    const y = Math.max(4, (avail - DESIGN_H * scale) / 2);
    this.content.setScale(scale).setPosition(x, y);
    // Center the 3D pedestal over the free area left of the panel.
    const pedestalX = x + (-DESIGN_W / 2 + 230) * scale;
    this.preview.screenX = (pedestalX - width / 2) / (width / 2);
    // Toasts float above the character, clear of the tabs.
    this.toast.setPosition(pedestalX, y + 150 * scale);
  }

  // --------------------------------------------------------------- tabs

  setTab(id) {
    this.tab = id;
    for (const b of this.tabButtons) b.setColor(b.tabId === id ? COLORS.pink : COLORS.purple);
    this.grid.removeAll(true);
    this.cards = [];
    this.upgradeRows = [];
    const save = services.save;

    if (id === 'upgrades') {
      this.selected = null;
      UPGRADES.forEach((u, i) => this._buildUpgradeRow(u, 176 + i * 62));
      this.actionButton.setVisible(false);
      this.infoName.setText('');
      this.infoDesc.setText('');
    } else {
      const list = CATALOG[id];
      list.forEach((item, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const card = new ItemCard(this, PANEL_X + CARD_W / 2 + col * (CARD_W + GAP), 222 + row * (CARD_H + GAP), id, item, (c) => this.select(c.item.id));
        this.grid.add(card);
        this.cards.push(card);
      });
      this.actionButton.setVisible(true);
      this.select(save.equippedId(id));
    }
    this.refresh();
  }

  _buildUpgradeRow(u, y) {
    const save = services.save;
    const name = this.add.text(PANEL_X, y - 12, t(u.nameKey), textStyle(24)).setOrigin(0, 0.5);
    const desc = this.add.text(PANEL_X, y + 14, t(u.descKey), textStyle(17, '#c9b8ff')).setOrigin(0, 0.5);
    const pips = this.add.graphics();
    const button = new Button(this, DESIGN_W / 2 - 100, y, { label: '0', icon: 'coin', width: 190, height: 52, fontSize: 22, color: COLORS.green, onClick: () => this.onUpgrade(u.id) });
    const row = { u, pips, button, refresh: null };
    row.refresh = () => {
      const level = save.upgradeLevel(u.id);
      const cost = nextCost(u.id, level);
      pips.clear();
      const px = DESIGN_W / 2 - 230 - u.costs.length * 26;
      for (let i = 0; i < u.costs.length; i++) {
        pips.fillStyle(i < level ? COLORS.yellow : 0x2a1d55, 1).fillRoundedRect(px + i * 26, y - 9, 20, 18, 5);
      }
      button.icon.setVisible(cost !== null);
      if (cost === null) button.setLabel(t('maxed')).setColor(COLORS.panelEdge).setEnabled(false);
      else button.setLabel(`${fmt(cost)}`).setColor(save.snapshot().totalCoins >= cost ? COLORS.green : 0x6b5a8f).setEnabled(true);
    };
    this.grid.add([name, desc, pips, button]);
    this.upgradeRows.push(row);
  }

  select(id) {
    this.selected = id;
    const tried = { ...services.save.snapshot().equipped, [this.tab]: id };
    this.preview.setEquipped(tried);
    this.refresh();
  }

  refresh() {
    const s = services.save.snapshot();
    this.coinText.setText(fmt(s.totalCoins));
    this.gemText.setText(fmt(s.totalGems));
    for (const c of this.cards ?? []) c.refresh(c.item.id === this.selected);
    for (const r of this.upgradeRows ?? []) r.refresh();
    this._refreshAction();
    this._refreshFreeButton();
  }

  _refreshAction() {
    if (this.tab === 'upgrades' || !this.selected) return;
    const save = services.save;
    const item = getItem(this.tab, this.selected);
    this.infoName.setText(itemName(item, getLanguage()));
    this.infoDesc.setText(item.descKey ? t(item.descKey) : '');
    const b = this.actionButton;
    if (save.equippedId(this.tab) === item.id) {
      b.setLabel(t('equipped')).setColor(COLORS.panelEdge).setEnabled(false);
    } else if (save.owns(this.tab, item.id)) {
      b.setLabel(t('equip')).setColor(COLORS.cyan).setEnabled(true);
    } else {
      const wallet = currencyOf(item) === 'gems' ? save.snapshot().totalGems : save.snapshot().totalCoins;
      b.setLabel(`${t('buy')}  ${fmt(item.price)}`).setColor(wallet >= item.price ? COLORS.green : 0x6b5a8f).setEnabled(true);
    }
  }

  _refreshFreeButton() {
    const b = this.freeButton;
    if (!b?.active || this.busy) return;
    const wait = services.save.freeCoinsCooldownLeft();
    const label = t('freeCoins', { n: FREE_COINS.amount });
    if (wait > 0) {
      const sec = Math.ceil(wait / 1000);
      b.setEnabled(false).setLabel(label, t('freeCoinsWait', { t: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }));
    } else if (services.ads.isRewardedReady()) b.setEnabled(true).setLabel(label, t('watchVideo'));
    else b.setEnabled(false).setLabel(label, t('loadingVideo'));
  }

  showToast(text) {
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1600, duration: 400 });
  }

  _celebrate(target) {
    const m = target.getWorldTransformMatrix();
    this.sparkles.explode(34, m.tx, m.ty);
    services.sfx.play('newBest');
    services.haptics.success();
  }

  // ------------------------------------------------------------ actions

  onAction() {
    if (this.busy || !this.selected) return;
    const { save, sfx, haptics } = services;
    const item = getItem(this.tab, this.selected);
    if (save.owns(this.tab, item.id)) {
      save.equip(this.tab, item.id);
      sfx.play('click');
    } else {
      const result = save.buy(this.tab, item.id);
      if (result === 'bought') {
        this._celebrate(this.actionButton);
        this.showToast(t('unlocked', { name: itemName(item, getLanguage()) }));
      } else {
        sfx.play('bump');
        haptics.light();
        this.tweens.add({ targets: this.actionButton, x: this.actionButton.x + 10, duration: 50, yoyo: true, repeat: 3 });
        this.showToast(t('notEnough', { currency: t(currencyOf(item)) }));
      }
    }
    this.preview.setEquipped(save.snapshot().equipped);
    this.refresh();
  }

  onUpgrade(id) {
    if (this.busy) return;
    const { save, sfx, haptics } = services;
    const result = save.buyUpgrade(id);
    const row = this.upgradeRows.find((r) => r.u.id === id);
    if (result === 'bought') {
      this._celebrate(row.button);
    } else if (result === 'insufficient') {
      sfx.play('bump');
      haptics.light();
      this.showToast(t('notEnough', { currency: t('coins') }));
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
        this._celebrate(this.freeButton);
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
}
