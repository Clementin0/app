import Phaser from 'phaser';
import { Autopilot } from '../logic/Autopilot.js';
import { RunnerWorld } from '../logic/RunnerWorld.js';
import { exitApp } from '../services/Platform.js';
import { services } from '../services/services.js';
import { Background } from '../ui/Background.js';
import { Button, IconButton } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';
import { WorldRenderer } from '../ui/WorldRenderer.js';

const APP_VERSION = '1.0.0';

/** Main menu: title, play button, records, sound toggle, banner ad. */
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
    const { save, ads } = services;
    ads.showBanner();
    this.cameras.main.fadeIn(250, 7, 2, 26);

    // Demo run played by the autopilot behind the menu.
    this.bg = new Background(this);
    this.demo = new RunnerWorld({ width: this.scale.width, height: this.scale.height });
    this.pilot = new Autopilot(this.demo);
    this.demoView = new WorldRenderer(this, this.demo, { effects: true });
    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.45).setOrigin(0).setDepth(50);

    this.ui = this.add.container(0, 0).setDepth(60);
    this.titleNeon = glow(this.add.text(0, 0, 'NEON', textStyle(120, '#7ffcff')).setOrigin(1, 0.5), COLORS.cyan, 26);
    this.titleDash = glow(this.add.text(0, 0, 'DASH', textStyle(120, '#ff8ef0')).setOrigin(0, 0.5), COLORS.pink, 26);
    this.tagline = this.add.text(0, 0, 'Corri. Salta. Non fermarti.', textStyle(28, '#e9ddff')).setOrigin(0.5);
    this.playButton = new Button(this, 0, 0, {
      label: 'GIOCA',
      icon: 'icon_play',
      width: 380,
      height: 108,
      fontSize: 50,
      color: COLORS.pink,
      onClick: () => this.startGame(),
    }).pulse();

    const s = save.snapshot();
    this.statsPanel = this.add.graphics();
    this.trophy = this.add.image(0, 0, 'icon_trophy').setTint(COLORS.yellow).setScale(0.55);
    this.bestText = this.add.text(0, 0, `RECORD  ${s.highScore.toLocaleString('it-IT')}`, textStyle(30, '#ffd23f')).setOrigin(0, 0.5);
    this.coinIcon = this.add.image(0, 0, 'coin').setScale(0.75);
    this.coinText = this.add.text(0, 0, s.totalCoins.toLocaleString('it-IT'), textStyle(28, '#ffe68a')).setOrigin(0, 0.5);
    this.gemIcon = this.add.image(0, 0, 'gem').setScale(0.6);
    this.gemText = this.add.text(0, 0, s.totalGems.toLocaleString('it-IT'), textStyle(28, '#9ff6ff')).setOrigin(0, 0.5);
    this.ui.add([this.titleNeon, this.titleDash, this.tagline, this.playButton, this.statsPanel, this.trophy, this.bestText, this.coinIcon, this.coinText, this.gemIcon, this.gemText]);

    this.soundButton = new IconButton(this, 0, 0, {
      icon: save.muted ? 'icon_sound_off' : 'icon_sound_on',
      size: 76,
      color: COLORS.purple,
      onClick: () => this.toggleSound(),
    }).setDepth(70);

    this.privacyButton = new IconButton(this, 0, 0, {
      icon: 'icon_privacy',
      size: 64,
      color: COLORS.panelEdge,
      onClick: () => ads.showPrivacyOptions(),
    })
      .setDepth(70)
      .setVisible(ads.privacyOptionsRequired);
    const offReady = ads.on('ready', () => this.privacyButton?.setVisible(ads.privacyOptionsRequired));
    this.events.once('shutdown', offReady);

    this.version = this.add.text(0, 0, `v${APP_VERSION}`, textStyle(18, '#a99bd6', { strokeThickness: 3 })).setOrigin(0, 1).setDepth(70);

    this.tweens.add({ targets: [this.titleNeon, this.titleDash], y: '-=10', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());

    bindLayout(this, (w, h) => this.layout(w, h));
  }

  layout(width, height) {
    this.demo.setViewport(width, height);
    this.bg.layout(width, height, this.demo.groundY);
    this.dim.setSize(width, height);

    const reserve = bannerReserve(this);
    const avail = height - reserve;
    // Content is designed for 600px of height and scaled down if needed.
    const scale = Math.min(1, avail / 600);
    this.ui.setScale(scale).setPosition(width / 2, avail / 2 - 300 * scale);

    this.titleNeon.setPosition(-8, 95);
    this.titleDash.setPosition(8, 95);
    this.tagline.setPosition(0, 185);
    this.playButton.setPosition(0, 300);

    const panelW = 640;
    this.statsPanel.clear();
    this.statsPanel.fillStyle(COLORS.ink, 0.6).fillRoundedRect(-panelW / 2, 400, panelW, 76, 24);
    this.statsPanel.lineStyle(2, COLORS.panelEdge, 0.8).strokeRoundedRect(-panelW / 2, 400, panelW, 76, 24);
    this.trophy.setPosition(-panelW / 2 + 40, 438);
    this.bestText.setPosition(-panelW / 2 + 66, 438);
    this.coinIcon.setPosition(60, 438);
    this.coinText.setPosition(84, 438);
    this.gemIcon.setPosition(200, 438);
    this.gemText.setPosition(222, 438);

    this.soundButton.setPosition(width - 60, 60);
    this.privacyButton.setPosition(60, 56);
    this.version.setPosition(16, avail - 8);
  }

  toggleSound() {
    const { save, sfx } = services;
    save.setMuted(!save.muted);
    sfx.setMuted(save.muted);
    this.soundButton.setIcon(save.muted ? 'icon_sound_off' : 'icon_sound_on');
  }

  startGame() {
    if (this.starting) return;
    this.starting = true;
    services.sfx.unlock();
    services.ads.hideBanner();
    // force=true: a tap during the fade-in must not cancel the transition.
    const go = () => {
      if (this.leaving) return;
      this.leaving = true;
      this.scene.start('Game');
    };
    this.cameras.main.fade(220, 7, 2, 26, true);
    this.cameras.main.once('camerafadeoutcomplete', go);
    this.time.delayedCall(450, go);
  }

  handleBack() {
    exitApp();
  }

  update(_time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    this.pilot.update();
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
    this.demoView.render(dt);
    this.bg.update(dt, this.demo.state === 'running' ? this.demo.speed : 0);
  }
}
