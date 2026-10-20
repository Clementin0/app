import Phaser from 'phaser';
import { CAMPAIGN } from '../config/campaign.js';
import { fmt, t } from '../i18n.js';
import { CHALLENGE_REWARD, dailyChallenge } from '../services/DailyChallenge.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, hex, textStyle } from '../ui/theme.js';

const PANEL_W = 940;
const PANEL_H = 590;
const CARD_W = 440;
const CARD_H = 200;
const ROWS = [92, 306];
const COLS = [-CARD_W / 2 - 12, CARD_W / 2 + 12];

/** The modes beyond the classic run: campaign, daily challenge, boss rush, time attack. */
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
    const title = glow(this.add.text(0, 46, t('modes'), textStyle(44)).setOrigin(0.5), COLORS.purple, 18);
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
    ];
    cards.forEach((c, i) => {
      const x = COLS[i % 2];
      const y = ROWS[Math.floor(i / 2)];
      const items = this._card(x, y, c);
      const button = new Button(this, x + CARD_W / 2 - 112, y + CARD_H - 44, { label: c.label ?? t('play'), icon: c.icon ?? 'icon_play', width: 196, height: 60, fontSize: 24, color: c.color, onClick: c.onClick });
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
    const left = x - CARD_W / 2 + 24;
    const head = glow(this.add.text(left, y + 18, title, textStyle(30, hex(color))), color, 10);
    const items = [g, head];
    let ly = y + 62;
    for (const text of lines) {
      if (!text) continue;
      const line = this.add.text(left, ly, text, textStyle(17, '#e9ddff', { wordWrap: { width: CARD_W - 48 } }));
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
