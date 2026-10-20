import Phaser from 'phaser';
import { CAMPAIGN, getLevel, levelReward } from '../config/campaign.js';
import { zoneTheme } from '../config/zones.js';
import { t } from '../i18n.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const PANEL_W = 1000;
const PANEL_H = 600;
const TILE_W = 140;
const TILE_H = 92;
const ZONES = 6;
const PER_ZONE = 4;

/** Goal of a level as text ("Percorri 600 m"). */
export function goalText(level) {
  return t(`goal_${level.goal.type}`, { n: level.goal.value });
}

/**
 * Campaign map: six zones (columns) of four levels. Tapping an open level
 * shows its goal, twist and stars, and plays it.
 */
export class CampaignScene extends Phaser.Scene {
  constructor() {
    super('Campaign');
  }

  init() {
    this.closing = false;
    this.selected = null;
  }

  create() {
    const { save } = services;
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.76).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    bg.lineStyle(3, COLORS.cyan, 0.9).strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, PANEL_H, 36);
    const title = glow(this.add.text(-PANEL_W / 2 + 40, 26, t('modeCampaign'), textStyle(42)), COLORS.cyan, 16);
    const stars = this.add.text(PANEL_W / 2 - 40, 34, `★ ${save.totalStars} / ${CAMPAIGN.length * 3}`, textStyle(30, '#ffd23f')).setOrigin(1, 0);
    this.panel.add([bg, title, stars]);

    // Columns of zones, rows of levels.
    this.tiles = [];
    const gx = (PANEL_W - ZONES * (TILE_W + 14) + 14) / 2;
    for (let z = 0; z < ZONES; z++) {
      const theme = zoneTheme(z);
      const x = -PANEL_W / 2 + gx + z * (TILE_W + 14) + TILE_W / 2;
      const head = this.add.text(x, 102, t(theme.nameKey), textStyle(17, hex(theme.line), { align: 'center', wordWrap: { width: TILE_W } })).setOrigin(0.5);
      this.panel.add(head);
      for (let r = 0; r < PER_ZONE; r++) {
        const level = CAMPAIGN[z * PER_ZONE + r];
        const y = 130 + r * (TILE_H + 12);
        this.panel.add(this._tile(level, x, y, theme));
      }
    }

    this.closeButton = new Button(this, 0, PANEL_H - 40, { label: t('close'), width: 220, height: 56, fontSize: 24, color: COLORS.panelEdge, onClick: () => this.close() });
    this.panel.add(this.closeButton);

    this.detail = this.add.container(0, 0).setVisible(false);
    this.detailDim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.6).setOrigin(0).setInteractive().setVisible(false);
    this.detailDim.on('pointerup', () => this.hideDetail());

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      this.detailDim.setSize(w, h);
      const avail = h - bannerReserve(this);
      const sc = Math.min(1, (avail - 24) / PANEL_H, (w - 32) / PANEL_W);
      this.panel.setScale(sc).setPosition(w / 2, Math.max(8, (avail - PANEL_H * sc) / 2));
      this.detail.setScale(sc).setPosition(w / 2, Math.max(8, (avail - 430 * sc) / 2));
    });
    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, duration: 180 });
  }

  _tile(level, x, y, theme) {
    const { save } = services;
    const open = save.isLevelUnlocked(level.id);
    const stars = save.levelStars(level.id);
    const g = this.add.graphics();
    g.fillStyle(open ? COLORS.ink : 0x0b0620, open ? 0.85 : 0.7).fillRoundedRect(-TILE_W / 2, 0, TILE_W, TILE_H, 16);
    g.lineStyle(3, open ? theme.line : 0x3a2c66, open ? 0.95 : 0.8).strokeRoundedRect(-TILE_W / 2, 0, TILE_W, TILE_H, 16);
    const c = this.add.container(x, y, [g]);
    if (open) {
      c.add(this.add.text(0, 30, String(level.id), textStyle(34, '#ffffff')).setOrigin(0.5));
      stars.forEach((on, i) => c.add(this.add.image(-28 + i * 28, 70, 'icon_star').setScale(0.36).setTint(on ? COLORS.yellow : 0x3a2c66)));
      c.setSize(TILE_W, TILE_H);
      c.setInteractive(new Phaser.Geom.Rectangle(-TILE_W / 2, 0, TILE_W, TILE_H), Phaser.Geom.Rectangle.Contains);
      c.on('pointerup', () => this.showDetail(level.id));
    } else {
      c.add(this.add.image(0, TILE_H / 2, 'icon_lock').setScale(0.6).setTint(0x5a4a8a));
    }
    this.tiles.push({ id: level.id, container: c });
    return c;
  }

  showDetail(id) {
    if (this.closing) return;
    const level = getLevel(id);
    if (!level || !services.save.isLevelUnlocked(id)) return;
    services.sfx.play('click');
    this.selected = id;
    const theme = zoneTheme(level.zone);
    const stars = services.save.levelStars(id);
    const W = 640;
    const H = 430;
    this.detail.removeAll(true);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.98).fillRoundedRect(-W / 2, 0, W, H, 30);
    bg.lineStyle(3, theme.line, 1).strokeRoundedRect(-W / 2, 0, W, H, 30);
    const head = glow(this.add.text(0, 44, t('levelTitle', { n: level.id }), textStyle(40)).setOrigin(0.5), theme.line, 14);
    const zone = this.add.text(0, 84, t(theme.nameKey), textStyle(20, hex(theme.line))).setOrigin(0.5);
    const goal = this.add.text(0, 128, goalText(level), textStyle(28, '#ffffff')).setOrigin(0.5);
    const twist = this.add.text(0, 166, level.twist ? t(`twist_${level.twist}`) : '', textStyle(22, '#ff8ef0')).setOrigin(0.5);
    this.detail.add([bg, head, zone, goal, twist]);
    const req = [t('star_1'), level.starTime ? t('star_time', { n: level.starTime }) : t('star_2', { n: level.starCoins }), t('star_3')];
    req.forEach((text, i) => {
      const y = 214 + i * 38;
      this.detail.add(this.add.image(-W / 2 + 70, y, 'icon_star').setScale(0.45).setTint(stars[i] ? COLORS.yellow : 0x4a3a7a));
      this.detail.add(this.add.text(-W / 2 + 100, y, text, textStyle(22, stars[i] ? '#ffd23f' : '#c9b8ff')).setOrigin(0, 0.5));
    });
    if (!stars[0]) this.detail.add(this.add.text(0, 330, t('levelRewardText', { n: levelReward(level).coins }), textStyle(19, '#7dffb0')).setOrigin(0.5));
    this.playButton = new Button(this, 110, H - 52, { label: t('play'), icon: 'icon_play', width: 240, height: 72, fontSize: 30, color: COLORS.green, onClick: () => this.play(id) });
    this.backButton = new Button(this, -150, H - 52, { label: t('close'), width: 180, height: 60, fontSize: 24, color: COLORS.panelEdge, onClick: () => this.hideDetail() });
    this.detail.add([this.playButton, this.backButton]);
    this.detailDim.setVisible(true).setDepth(10);
    this.detail.setVisible(true).setDepth(11).setAlpha(0);
    this.tweens.add({ targets: this.detail, alpha: 1, duration: 150 });
  }

  hideDetail() {
    this.selected = null;
    this.detail.setVisible(false);
    this.detailDim.setVisible(false);
  }

  play(id) {
    if (this.closing) return;
    this.closing = true;
    services.sfx.unlock();
    const menu = this.scene.get('Menu');
    this.scene.stop();
    menu.startGame({ mode: 'campaign', level: id });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.scene.stop();
  }

  handleBack() {
    if (this.selected !== null) this.hideDetail();
    else this.close();
  }
}
