import Phaser from 'phaser';
import { getPerk } from '../config/perks.js';
import { t } from '../i18n.js';
import { services } from '../services/services.js';
import { bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const CARD_W = 300;
const CARD_H = 330;
const GAP = 28;
const DESIGN_W = CARD_W * 3 + GAP * 2;
const DESIGN_H = 470;

/** One perk card: icon, name, description, level pips. */
class PerkCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, id, level, onPick) {
    super(scene, x, y);
    const perk = getPerk(id);
    this.perkId = id;
    this.enabled = true;
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 28);
    bg.lineStyle(4, perk.color, 1).strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 28);
    const icon = scene.add.image(0, -88, `perk_${id}`).setScale(1.6);
    const name = glow(scene.add.text(0, 6, t(`perk_${id}`), textStyle(30, hex(perk.color))).setOrigin(0.5), perk.color, 12);
    const desc = scene.add.text(0, 72, t(`perkDesc_${id}`), textStyle(21, '#e9ddff', { align: 'center', wordWrap: { width: CARD_W - 40 } })).setOrigin(0.5);
    const pips = scene.add.graphics();
    const pw = 26;
    const x0 = -((perk.max - 1) * (pw + 8)) / 2;
    for (let i = 0; i < perk.max; i++) {
      pips.fillStyle(i < level ? perk.color : i === level ? COLORS.white : 0x2a1d55, 1).fillRoundedRect(x0 + i * (pw + 8) - pw / 2, 132, pw, 12, 6);
    }
    this.add([bg, icon, name, desc, pips]);
    this.setSize(CARD_W, CARD_H);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.setScale(0.96));
    this.on('pointerout', () => this.setScale(1));
    this.on('pointerup', () => {
      this.setScale(1);
      if (this.enabled) onPick(id);
    });
    scene.add.existing(this);
  }
}

/** After a boss: pick 1 of 3 perks for the rest of the run (the game waits). */
export class PerkScene extends Phaser.Scene {
  constructor() {
    super('Perk');
  }

  init(data) {
    this.options = data?.options ?? [];
    this.levels = data?.levels ?? {};
    this.picked = false;
  }

  create() {
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.75).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const title = glow(this.add.text(0, 30, t('perkTitle'), textStyle(46, '#ffd23f')).setOrigin(0.5), COLORS.orange, 18);
    const sub = this.add.text(0, 78, t('perkSub'), textStyle(22, '#e9ddff')).setOrigin(0.5);
    this.panel.add([title, sub]);
    this.cards = this.options.map((id, i) => new PerkCard(this, -DESIGN_W / 2 + CARD_W / 2 + i * (CARD_W + GAP), 290, id, this.levels[id] ?? 0, (pick) => this.pick(pick)));
    this.panel.add(this.cards);
    this.cards.forEach((c, i) => {
      c.setAlpha(0).setY(c.y + 40);
      this.tweens.add({ targets: c, alpha: 1, y: c.y - 40, duration: 260, delay: 80 + i * 90, ease: 'Back.easeOut' });
    });
    services.sfx.play('powerup');
    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const s = Math.min(1, (h - 20) / DESIGN_H, (w - 30) / DESIGN_W);
      this.panel.setScale(s).setPosition(w / 2, Math.max(8, (h - DESIGN_H * s) / 2));
    });
  }

  pick(id) {
    if (this.picked) return;
    this.picked = true;
    for (const c of this.cards) c.enabled = false;
    services.sfx.play('newBest');
    services.haptics.success();
    const card = this.cards.find((c) => c.perkId === id);
    this.tweens.add({ targets: card, scale: 1.12, duration: 160, yoyo: true });
    this.time.delayedCall(320, () => {
      this.scene.get('Game')?.choosePerk(id);
      this.scene.stop();
    });
  }

  /** Back button: take the first card. */
  handleBack() {
    if (this.options.length) this.pick(this.options[0]);
  }
}
