import Phaser from 'phaser';
import { services } from '../services/services.js';
import { COLORS, textStyle } from './theme.js';

/**
 * Neon "pill" button drawn with Graphics: drop shadow, glossy highlight,
 * optional icon, press animation, click sound and double-tap protection.
 */
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, { label = '', width = 340, height = 92, color = COLORS.pink, icon = null, fontSize = 38, sublabel = null, onClick = null } = {}) {
    super(scene, x, y);
    // Not `w`/`h`: `w` is a Phaser Transform property reset by setPosition().
    this.btnW = width;
    this.btnH = height;
    this.color = color;
    this.onClick = onClick;
    this.enabled = true;
    this.lastClick = 0;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.icon = icon ? scene.add.image(0, 0, icon).setDisplaySize(height * 0.46, height * 0.46) : null;
    if (this.icon) this.add(this.icon);

    this.text = scene.add.text(0, sublabel ? -10 : 0, label, textStyle(fontSize)).setOrigin(0.5);
    this.add(this.text);
    this.sub = sublabel ? scene.add.text(0, 24, sublabel, textStyle(fontSize * 0.5, '#ffffffcc', { strokeThickness: 3 })).setOrigin(0.5) : null;
    if (this.sub) this.add(this.sub);

    this._layoutContent();
    this._draw(false);

    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this._press(true));
    this.on('pointerout', () => this._press(false));
    this.on('pointerup', () => {
      if (!this.pressed) return;
      this._press(false);
      this._fire();
    });

    // A scene paused mid-press never receives pointerup: reset the visual state.
    const reset = () => {
      if (!this.pressed) return;
      this.pressed = false;
      this._draw(false);
      this.setScale(1);
    };
    scene.events.on('pause', reset);
    scene.events.on('resume', reset);
    this.once('destroy', () => {
      scene.events.off('pause', reset);
      scene.events.off('resume', reset);
    });

    scene.add.existing(this);
  }

  _layoutContent() {
    if (!this.icon) return;
    const gap = 14;
    const textW = Math.max(this.text.width, this.sub?.width ?? 0);
    const total = this.icon.displayWidth + (textW > 0 ? gap + textW : 0);
    const left = -total / 2;
    this.icon.setPosition(left + this.icon.displayWidth / 2, 0);
    const tx = left + this.icon.displayWidth + gap + textW / 2;
    this.text.setX(textW > 0 ? tx : 0);
    this.sub?.setX(tx);
  }

  _draw(pressed) {
    const g = this.bg;
    const { btnW: w, btnH: h } = this;
    // Radius must not exceed half of the shortest rect drawn below (h - 4).
    const r = Math.min(w, h - 4) / 2;
    const off = pressed ? 2 : 7;
    g.clear();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + off, w, h, r);
    const base = Phaser.Display.Color.IntegerToColor(this.color);
    const dark = base.clone().darken(30).color;
    g.fillStyle(dark, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + (pressed ? 2 : 4), w, h, r);
    g.fillStyle(this.color, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + (pressed ? 2 : 0), w, h - 4, r);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 10, -h / 2 + (pressed ? 6 : 4), w - 20, h * 0.38, Math.min(r, h * 0.19));
    g.lineStyle(3, 0xffffff, 0.75);
    g.strokeRoundedRect(-w / 2, -h / 2 + (pressed ? 2 : 0), w, h - 4, r);
  }

  _press(down) {
    if (!this.enabled) return;
    this.pressed = down;
    this._draw(down);
    this.scene.tweens.add({ targets: this, scale: down ? 0.95 : 1, duration: 80, ease: 'Quad.easeOut' });
  }

  _fire() {
    const now = this.scene.time.now;
    if (!this.enabled || now - this.lastClick < 350) return;
    this.lastClick = now;
    services.sfx?.unlock();
    services.sfx?.play('click');
    this.onClick?.(this);
  }

  setLabel(label, sublabel) {
    this.text.setText(label);
    if (this.sub && sublabel !== undefined) this.sub.setText(sublabel);
    this._layoutContent();
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.55);
    if (!enabled) this.pressed = false;
    return this;
  }

  setColor(color) {
    this.color = color;
    this._draw(false);
    return this;
  }

  /** Gentle attention pulse (used for the main call to action). */
  pulse() {
    this.scene.tweens.add({ targets: this, scale: { from: 1, to: 1.05 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return this;
  }
}

/** Round icon-only button (pause, sound, privacy...). */
export class IconButton extends Button {
  constructor(scene, x, y, { icon, size = 76, color = COLORS.purple, onClick } = {}) {
    super(scene, x, y, { label: '', width: size, height: size, color, icon, onClick });
    this.icon.setPosition(0, -2);
  }

  setIcon(key) {
    this.icon.setTexture(key);
    return this;
  }
}
