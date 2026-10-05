import Phaser from 'phaser';
import { generateTextures } from '../ui/textures.js';

/** Generates all procedural textures, then opens the main menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    document.getElementById('loader')?.classList.add('hidden');
    this.game.events.emit('booted');
    this.scene.start('Menu');
  }
}
