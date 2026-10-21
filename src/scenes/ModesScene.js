import Phaser from 'phaser';
import { CAMPAIGN } from '../config/campaign.js';
import { fmt, t } from '../i18n.js';
import { CHALLENGE_REWARD, dailyChallenge } from '../services/DailyChallenge.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const PANEL_W = 1200;
const PANEL_H = 636;
const CARD_W = 272;
const CARD_H = 232;
const GAP = 16;
const ROWS = [86, 86 + CARD_H + GAP];
const COLS = [0, 1, 2, 3].map((i) => (i - 1.5) * (CARD_W + GAP));

/**
 * The modes beyond the classic run, in a 4x2 grid: campaign, daily
 * challenge, boss rush, time attack, assault, chaos, parkour, hardcore.
 */
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
    const title = glow(this.add.text(0, 44, t('modes'), textStyle(42)).setOrigin(0.5), COLORS.purple, 18);
    this.panel.add([bg, title]);

    const stars = save.totalStars;
    const cards = [
      {
        key: 'campaign',
        color: COLORS.cyan,
        title: t('modeCampaign'),
        lines: [t('modeCampaignDesc', { n: CAMPAIGN.length }), `★ ${stars} / ${CAMPAIGN.length * 3}`],
        label: t('modeOpen'),
        icon: 'icon_map',
        onClick: () => this.openCampaign(),
      },
      {
        key: 'daily',
        color: COLORS.yellow,
        title: t('modeDaily'),
        lines: [`${t('challengeToday')} ${t(`mod_${challenge.modifier.id}`)}`, status.done ? t('challengeDone') : t('challengeReward', CHALLENGE_REWARD), t('modeBest', { n: fmt(status.best) })],
        onClick: () => this.play('daily'),
      },
      {
        key: 'bossRush',
        color: COLORS.pink,
        title: t('modeBossRush'),
        lines: [t('modeBossRushDesc'), t('modeBestBosses', { n: s.bossRushBest.bosses })],
        onClick: () => this.play('bossRush'),
      },
      {
        key: 'timeAttack',
        color: COLORS.green,
        title: t('modeTimeAttack'),
        lines: [t('modeTimeAttackDesc'), t('modeBest', { n: fmt(s.timeAttackBest.score) })],
        icon: 'icon_clock',
        onClick: () => this.play('timeAttack'),
      },
      {
        key: 'assault',
        color: COLORS.orange,
        title: t('modeAssault'),
        lines: [t('modeAssaultDesc'), t('modeBestWaves', { n: save.modeBest('assault').waves })],
        icon: 'icon_target',
        onClick: () => this.play('assault'),
      },
      {
        key: 'chaos',
        color: 0xb07cff,
        title: t('modeChaos'),
        lines: [t('modeChaosDesc'), t('modeBest', { n: fmt(save.modeBest('chaos').score) })],
        icon: 'icon_dice',
        onClick: () => this.play('chaos'),
      },
      {
        key: 'parkour',
        color: 0x39ffd2,
        title: t('modeParkour'),
        lines: [t('modeParkourDesc'), t('modeBest', { n: fmt(save.modeBest('parkour').score) })],
        icon: 'icon_jump',
        onClick: () => this.play('parkour'),
      },
      {
        key: 'hardcore',
        color: COLORS.red,
        title: t('modeHardcore'),
        lines: [t('modeHardcoreDesc'), t('modeBest', { n: fmt(save.modeBest('hardcore').score) })],
        icon: 'icon_skull',
        onClick: () => this.play('hardcore'),
      },
    ];
    cards.forEach((c, i) => {
      const x = COLS[i % 4];
      const y = ROWS[Math.floor(i / 4)];
      const items = this._card(x, y, c);
      const button = new Button(this, x, y + CARD_H - 38, { label: c.label ?? t('play'), icon: c.icon ?? 'icon_play', width: CARD_W - 40, height: 56, fontSize: 22, color: c.color, onClick: c.onClick });
      this[`${c.key}Button`] = button;
      this.panel.add([...items, button]);
    });

    this.closeButton = new Button(this, 0, PANEL_H - 40, { label: t('close'), width: 220, height: 56, fontSize: 24, color: COLORS.panelEdge, onClick: () => this.close() });
    this.panel.add(this.closeButton);

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const avail = h - bannerReserve(this);
      const sc = Math.min(1, (avail - 24) / PANEL_H, (w - 32) / PANEL_W);
      this.panel.setScale(sc).setPosition(w / 2, Math.max(8, (avail - PANEL_H * sc) / 2));
    });
    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, duration: 180 });
  }

  /** Card frame: title on top, short lines under it (the button sits bottom right). */
  _card(x, y, { color, title, lines }) {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 0.75).fillRoundedRect(x - CARD_W / 2, y, CARD_W, CARD_H, 24);
    g.lineStyle(3, color, 0.9).strokeRoundedRect(x - CARD_W / 2, y, CARD_W, CARD_H, 24);
    const left = x - CARD_W / 2 + 18;
    const head = glow(this.add.text(left, y + 14, title, textStyle(25, hex(color))), color, 10);
    // Long titles (some languages) shrink to fit the card.
    if (head.width > CARD_W - 36) head.setFontSize(Math.floor((25 * (CARD_W - 36)) / head.width));
    const items = [g, head];
    let ly = y + 52;
    for (const text of lines) {
      if (!text) continue;
      const line = this.add.text(left, ly, text, textStyle(15, '#e9ddff', { wordWrap: { width: CARD_W - 36 } }));
      items.push(line);
      ly += line.height + 4;
    }
    return items;
  }

  openCampaign() {
    if (this.closing) return;
    this.closing = true;
    services.sfx.unlock();
    this.scene.stop();
    this.scene.launch('Campaign');
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
