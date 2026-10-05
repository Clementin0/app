import Phaser from 'phaser';
import { services } from '../services/services.js';
import { COLORS, textStyle } from './theme.js';

const TRACK_W = 100;
const TRACK_H = 50;

/** Labelled on/off switch row used in the settings panel. */
export class Toggle extends Phaser.GameObjects.Container {
  constructor(scene, x, y, { label, value = false, width = 480, onChange } = {}) {
    super(scene, x, y);
    this.value = value;
    this.enabled = true;
    this.onChange = onChange;
    this.rowW = width;

    this.text = scene.add.text(-width / 2, 0, label, textStyle(30, '#ffffff')).setOrigin(0, 0.5);
    this.track = scene.add.graphics();
    this.knob = scene.add.circle(0, 0, TRACK_H / 2 - 6, COLORS.white);
    this.add([this.text, this.track, this.knob]);
    this._draw(false);

    this.setSize(width, TRACK_H + 16);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerup', () => this.toggle());
    scene.add.existing(this);
  }

  _knobX() {
    const right = this.rowW / 2 - TRACK_W / 2;
    return right + (this.value ? TRACK_W / 2 - TRACK_H / 2 : -TRACK_W / 2 + TRACK_H / 2);
  }

  _draw(animate) {
    const cx = this.rowW / 2 - TRACK_W / 2;
    const g = this.track;
    g.clear();
    g.fillStyle(this.value ? COLORS.green : 0x2a1d55, 1).fillRoundedRect(cx - TRACK_W / 2, -TRACK_H / 2, TRACK_W, TRACK_H, TRACK_H / 2);
    g.lineStyle(3, 0xffffff, this.value ? 0.9 : 0.35).strokeRoundedRect(cx - TRACK_W / 2, -TRACK_H / 2, TRACK_W, TRACK_H, TRACK_H / 2);
    if (animate) this.scene.tweens.add({ targets: this.knob, x: this._knobX(), duration: 120, ease: 'Quad.easeOut' });
    else this.knob.setX(this._knobX());
  }

  toggle() {
    this.setValue(!this.value);
    services.sfx?.play('click');
    this.onChange?.(this.value);
  }

  setValue(value) {
    this.value = !!value;
    this._draw(true);
    return this;
  }
}
