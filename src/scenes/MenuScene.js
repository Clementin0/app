import Phaser from 'phaser';
import { fmt, t } from '../i18n.js';
import { createRng } from '../logic/rng.js';
import { Autopilot3D } from '../logic3d/Autopilot3D.js';
import { LaneWorld } from '../logic3d/LaneWorld.js';
import { Missions } from '../logic3d/Missions.js';
import { xpToNext } from '../logic/Progression.js';
import { exitApp } from '../services/Platform.js';
import { services } from '../services/services.js';
import { GameView } from '../three/GameView.js';
import { Button, IconButton } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const DESIGN_W = 1040;
const DESIGN_H = 620;

/** Main menu over a live 3D demo run: play / shop / settings, records, missions, banner ad. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  init() {
    // Scene instances are reused: reset per-visit state.
    this.starting = false;
    this.leaving = false;
    this.deadFor = 0;
  }

  create() {
    const { save, ads, music, stage } = services;
    ads.showBanner();
    music.setZone(0);
    music.start(0);
    music.setIntensity(0);
    music.duck(false);
    this.cameras.main.fadeIn(250, 7, 2, 26);
    const s = save.snapshot();

    // Demo run played by the autopilot, wearing the player's items.
    this.demo = new LaneWorld({ rng: createRng(Date.now() >>> 0), loadout: { weapon: s.equipped.weapon } });
    this.pilot = new Autopilot3D(this.demo);
    this.demoView = stage.setView(new GameView(stage, this.demo, { equipped: s.equipped, effects: false }));
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.38).setOrigin(0).setDepth(50);

    this.ui = this.add.container(0, 0).setDepth(60);
    const titleNeon = glow(this.add.text(-8, 80, 'NEON', textStyle(112, '#7ffcff')).setOrigin(1, 0.5), COLORS.cyan, 26);
    const titleDash = glow(this.add.text(8, 80, 'DASH', textStyle(112, '#ff8ef0')).setOrigin(0, 0.5), COLORS.pink, 26);
    const tagline = this.add.text(0, 158, t('tagline'), textStyle(26, '#e9ddff')).setOrigin(0.5);
    this.titles = [titleNeon, titleDash];

    this.playButton = new Button(this, 0, 262, { label: t('play'), icon: 'icon_play', width: 360, height: 104, fontSize: 48, color: COLORS.pink, onClick: () => this.startGame() }).pulse();
    this.shopButton = new IconButton(this, -300, 256, { icon: 'icon_shop', size: 94, color: COLORS.orange, onClick: () => this.openShop() });
    const shopLabel = this.add.text(-300, 322, t('shop'), textStyle(21, '#ffd9b8')).setOrigin(0.5);
    this.settingsButton = new IconButton(this, 300, 256, { icon: 'icon_gear', size: 94, color: COLORS.purple, onClick: () => this.openSettings() });
    const settingsLabel = this.add.text(300, 322, t('settings'), textStyle(21, '#dccbff')).setOrigin(0.5);
    this.modesButton = new Button(this, 0, 343, { label: t('modes'), icon: 'icon_trophy', width: 300, height: 52, fontSize: 24, color: COLORS.purple, onClick: () => this.openModes() });

    // "!" badge on the shop button when something new is affordable.
    this.shopBadge = this.add.container(-262, 218, [this.add.circle(0, 0, 17, COLORS.red).setStrokeStyle(3, COLORS.white), this.add.text(0, 0, '!', textStyle(24)).setOrigin(0.5)]);
    this.shopBadge.setVisible(save.canAffordSomething());
    this.tweens.add({ targets: this.shopBadge, scale: { from: 1, to: 1.2 }, duration: 500, yoyo: true, repeat: -1 });

    // Records panel (left).
    const stats = this.add.graphics();
    stats.fillStyle(COLORS.ink, 0.65).fillRoundedRect(-DESIGN_W / 2, 372, 330, 230, 24);
    stats.lineStyle(2, COLORS.panelEdge, 0.9).strokeRoundedRect(-DESIGN_W / 2, 372, 330, 230, 24);
    const x0 = -DESIGN_W / 2 + 34;
    // Player level with its XP bar.
    const levelText = glow(this.add.text(x0 - 10, 404, t('level', { n: s.level }), textStyle(26, '#7ffcff')).setOrigin(0, 0.5), COLORS.cyan, 8);
    const xpBar = this.add.graphics();
    const bx = x0 + 86;
    const bw = 190;
    xpBar.fillStyle(0x2a1d55, 1).fillRoundedRect(bx, 397, bw, 14, 7);
    xpBar.fillStyle(COLORS.cyan, 1).fillRoundedRect(bx, 397, Math.max(10, (bw * s.xp) / xpToNext(s.level)), 14, 7);
    const trophy = this.add.image(x0, 452, 'icon_trophy').setTint(COLORS.yellow).setScale(0.45);
    const best = this.add.text(x0 + 28, 452, `${t('record')}  ${fmt(s.highScore)}`, textStyle(24, '#ffd23f')).setOrigin(0, 0.5);
    const coin = this.add.image(x0, 502, 'coin').setScale(0.65);
    const coins = (this.coinsText = this.add.text(x0 + 28, 502, fmt(s.totalCoins), textStyle(24, '#ffe68a')).setOrigin(0, 0.5));
    const gem = this.add.image(x0, 552, 'gem').setScale(0.5);
    const gems = (this.gemsText = this.add.text(x0 + 28, 552, fmt(s.totalGems), textStyle(24, '#9ff6ff')).setOrigin(0, 0.5));

    // Missions panel (right).
    const mx = -DESIGN_W / 2 + 350;
    const mw = DESIGN_W - 350;
    const missionsBg = this.add.graphics();
    missionsBg.fillStyle(COLORS.ink, 0.65).fillRoundedRect(mx, 372, mw, 230, 24);
    missionsBg.lineStyle(2, COLORS.yellow, 0.7).strokeRoundedRect(mx, 372, mw, 230, 24);
    const missionsTitle = this.add.text(mx + 24, 398, t('missions'), textStyle(24, '#ffd23f')).setOrigin(0, 0.5);
    const rows = [];
    new Missions(save.data.missions).list().forEach((m, i) => {
      const y = 444 + i * 52;
      const label = this.add.text(mx + 24, y, t(`mission_${m.id}`, { n: fmt(m.target) }), textStyle(20)).setOrigin(0, 0.5);
      const bar = this.add.graphics();
      const bw = 170;
      const bx = mx + mw - bw - 110;
      bar.fillStyle(0x2a1d55, 1).fillRoundedRect(bx, y - 7, bw, 14, 7);
      bar.fillStyle(COLORS.green, 1).fillRoundedRect(bx, y - 7, Math.max(10, (bw * Math.min(m.progress, m.target)) / m.target), 14, 7);
      const reward = m.reward.gems ? `+${m.reward.gems}` : `+${m.reward.coins}`;
      const rIcon = this.add.image(mx + mw - 82, y, m.reward.gems ? 'gem' : 'coin').setScale(m.reward.gems ? 0.42 : 0.5);
      const rText = this.add.text(mx + mw - 64, y, reward, textStyle(20, m.reward.gems ? '#9ff6ff' : '#ffe68a')).setOrigin(0, 0.5);
      rows.push(label, bar, rIcon, rText);
    });
    save.persist(); // new missions may have been drawn

    this.ui.add([titleNeon, titleDash, tagline, this.playButton, this.modesButton, this.shopButton, shopLabel, this.shopBadge, this.settingsButton, settingsLabel, stats, levelText, xpBar, trophy, best, coin, coins, gem, gems, missionsBg, missionsTitle, ...rows]);

    this.version = this.add.text(0, 0, `v${APP_VERSION}`, textStyle(18, '#a99bd6', { strokeThickness: 3 })).setOrigin(1, 1).setDepth(70);
    this.tweens.add({ targets: this.titles, y: '-=10', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());

    bindLayout(this, (w, h) => this.layout(w, h));

    // Daily reward: offered once per day, right after the menu appears.
    if (save.dailyStatus().available) this.time.delayedCall(450, () => !this.starting && !this.scene.isActive('Daily') && this.scene.launch('Daily'));
  }

  /** Called by overlays (daily reward) after the wallet changed. */
  refreshWallet() {
    const s = services.save.snapshot();
    this.coinsText.setText(fmt(s.totalCoins));
    this.gemsText.setText(fmt(s.totalGems));
    this.shopBadge.setVisible(services.save.canAffordSomething());
    this.tweens.add({ targets: [this.coinsText, this.gemsText], scale: { from: 1.3, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  layout(width, height) {
    this.dim.setSize(width, height);
    const avail = height - bannerReserve(this);
    const scale = Math.min(1, (avail - 10) / DESIGN_H, (width - 30) / DESIGN_W);
    this.ui.setScale(scale).setPosition(width / 2, Math.max(4, (avail - DESIGN_H * scale) / 2));
    this.version.setPosition(width - 12, avail - 6);
  }

  _leaveTo(target, data) {
    if (this.starting || this.scene.isActive('Daily')) return;
    this.starting = true;
    services.sfx.unlock();
    // force=true: a tap during the fade-in must not cancel the transition.
    const go = () => {
      if (this.leaving) return;
      this.leaving = true;
      this.scene.start(target, data);
    };
    this.cameras.main.fade(220, 7, 2, 26, true);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(450, go);
  }

  /** data.mode: 'endless' (default), 'daily' or 'bossRush'. */
  startGame(data = {}) {
    if (this.starting || this.scene.isActive('Daily')) return;
    services.ads.hideBanner();
    this._leaveTo('Game', { mode: data.mode ?? 'endless' });
  }

  openModes() {
    if (this.starting || this.scene.isActive('Modes') || this.scene.isActive('Daily')) return;
    services.sfx.unlock();
    this.scene.launch('Modes');
  }

  openShop() {
    this._leaveTo('Shop');
  }

  openSettings() {
    if (this.scene.isActive('Settings')) return;
    services.sfx.unlock();
    this.scene.launch('Settings', { from: 'Menu' });
  }

  handleBack() {
    // A transition is under way (Play / Shop tapped): do not quit.
    if (this.starting) return;
    exitApp();
  }

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.pilot.update(dt);
    this.demo.step(dt);
    this.demoView.handleEvents(this.demo.drainEvents());
    if (this.demo.state === 'dead') {
      this.deadFor += dt;
      if (this.deadFor > 1.2) {
        this.deadFor = 0;
        this.demo.reset();
        this.demoView.reset();
      }
    }
  }
}
