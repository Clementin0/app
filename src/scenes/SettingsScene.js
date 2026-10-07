import Phaser from 'phaser';
import { getLanguage, LANGUAGES, setLanguage, t } from '../i18n.js';
import { services } from '../services/services.js';
import { Button } from '../ui/Button.js';
import { bannerReserve, bindLayout } from '../ui/layout.js';
import { COLORS, glow, textStyle } from '../ui/theme.js';
import { Toggle } from '../ui/Toggle.js';

const PANEL_W = 620;

/** Settings overlay (from the menu or the pause screen): audio, vibration, language, privacy. */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  init(data) {
    this.from = data?.from ?? 'Menu';
    this.closing = false;
  }

  create() {
    const { save, sfx, music, haptics, ads } = services;
    const s = save.snapshot();
    const showPrivacy = ads.privacyOptionsRequired;
    const panelH = showPrivacy ? 720 : 640;
    this.panelH = panelH;

    this.dim = this.add.rectangle(0, 0, 10, 10, COLORS.ink, 0.7).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.panel, 0.97).fillRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 36);
    bg.lineStyle(3, COLORS.cyan, 0.9).strokeRoundedRect(-PANEL_W / 2, 0, PANEL_W, panelH, 36);
    const title = glow(this.add.text(0, 56, t('settings'), textStyle(52)).setOrigin(0.5), COLORS.cyan, 20);
    this.panel.add([bg, title]);

    const rows = [
      new Toggle(this, 0, 140, {
        label: t('music'),
        value: s.music,
        onChange: (v) => {
          save.setSetting('music', v);
          music.setEnabled(v);
        },
      }),
      new Toggle(this, 0, 215, {
        label: t('sfx'),
        value: s.sfx,
        onChange: (v) => {
          save.setSetting('sfx', v);
          sfx.setEnabled(v);
        },
      }),
      new Toggle(this, 0, 290, {
        label: t('vibration'),
        value: s.vibration,
        onChange: (v) => {
          save.setSetting('vibration', v);
          haptics.setEnabled(v);
          if (v) haptics.medium();
        },
      }),
    ];
    this.panel.add(rows);
    this.toggles = { music: rows[0], sfx: rows[1], vibration: rows[2] };

    const langLabel = this.add.text(-240, 368, t('language'), textStyle(30)).setOrigin(0, 0.5);
    this.panel.add(langLabel);
    this.langButtons = {};
    LANGUAGES.forEach((lang, i) => {
      const active = lang === getLanguage();
      const b = new Button(this, 240 - 50 - (LANGUAGES.length - 1 - i) * 112, 368, {
        label: lang.toUpperCase(),
        width: 100,
        height: 60,
        fontSize: 28,
        color: active ? COLORS.green : 0x2a1d55,
        onClick: () => this.changeLanguage(lang),
      });
      this.panel.add(b);
      this.langButtons[lang] = b;
    });

    // Graphics quality: resolution, antialiasing, scenery density, particles.
    const qLabel = this.add.text(-240, s.qualityAuto ? 436 : 446, t('quality'), textStyle(28)).setOrigin(0, 0.5);
    // "Automatic" until the player picks a level: slow devices step down by themselves.
    this.qualityAutoLabel = this.add.text(-240, 466, t('qualityAuto'), textStyle(15, '#7dffb0', { strokeThickness: 3 })).setOrigin(0, 0.5);
    this.qualityAutoLabel.setVisible(s.qualityAuto);
    this.qualityLabel = qLabel;
    this.panel.add([qLabel, this.qualityAutoLabel]);
    this.qualityButtons = {};
    ['low', 'medium', 'high'].forEach((q, i) => {
      const b = new Button(this, 240 - 50 - (2 - i) * 108, 446, {
        label: t(`q${q[0].toUpperCase()}${q.slice(1)}`),
        width: 100,
        height: 60,
        fontSize: 20,
        color: s.quality === q ? COLORS.green : 0x2a1d55,
        onClick: () => this.changeQuality(q),
      });
      this.panel.add(b);
      this.qualityButtons[q] = b;
    });

    let y = 530;
    if (showPrivacy) {
      const privacy = new Button(this, 0, y, { label: t('privacy'), icon: 'icon_privacy', width: 440, height: 70, fontSize: 28, color: COLORS.panelEdge, onClick: () => ads.showPrivacyOptions() });
      this.panel.add(privacy);
      y += 90;
    }
    this.closeButton = new Button(this, 0, y + 10, { label: t('close'), width: 300, height: 80, fontSize: 34, color: COLORS.pink, onClick: () => this.close() });
    this.panel.add(this.closeButton);

    this.panel.setAlpha(0);
    this.tweens.add({ targets: this.panel, alpha: 1, duration: 160 });
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    bindLayout(this, (w, h) => {
      this.dim.setSize(w, h);
      const avail = h - bannerReserve(this);
      const scale = Math.min(1, (avail - 24) / panelH, (w - 32) / PANEL_W);
      this.panel.setScale(scale).setPosition(w / 2, Math.max(8, (avail - panelH * scale) / 2));
    });
  }

  changeQuality(q) {
    const { save, stage } = services;
    save.setSetting('quality', q);
    stage.setQuality(q);
    this.qualityAutoLabel.setVisible(false);
    this.qualityLabel.setY(446);
    for (const [key, b] of Object.entries(this.qualityButtons)) b.setColor(key === q ? COLORS.green : 0x2a1d55);
  }

  changeLanguage(lang) {
    if (lang === getLanguage()) return;
    services.save.setLanguage(lang);
    setLanguage(lang);
    // Re-create the screens underneath so every label is translated.
    this.scene.get(this.from)?.scene.restart();
    this.scene.restart({ from: this.from });
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
