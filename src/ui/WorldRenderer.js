import Phaser from 'phaser';
import { DEFAULT_SKIN, getSkin, skinTextureKey } from '../config/skins.js';
import { t } from '../i18n.js';
import { blockTextureKey } from './textures.js';
import { COLORS, glow, hex, textStyle } from './theme.js';

const TILE = 128;
const SAW_TEXTURE_RADIUS = 38;

/**
 * Draws a RunnerWorld: ground tiles, obstacles, pickups, the player and all
 * particle effects. Shared by the game and by the menu's demo run.
 */
export class WorldRenderer {
  /**
   * @param {object} opts
   * @param {boolean} opts.effects  camera shake/flash and floating texts
   * @param {string}  opts.skin     skin id of the runner
   * @param {number}  opts.recordPx best distance in px (0 = no marker)
   */
  constructor(scene, world, { effects = true, skin = DEFAULT_SKIN, recordPx = 0 } = {}) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.skin = getSkin(skin);
    this.recordPx = recordPx;
    this.time = 0;
    this.groundSprites = new Map();
    this.sprites = new Map();
    this.pool = new Map();

    this.edges = scene.add.graphics().setDepth(1);

    this.player = scene.add.image(0, 0, skinTextureKey(this.skin.id)).setOrigin(0.5, 0.875).setDepth(10);
    this.bubble = scene.add.image(0, 0, 'bubble').setDepth(11).setVisible(false);
    this.magnetRing = scene.add.graphics().setDepth(9);
    this.squash = 0;
    this.spin = 0;

    this.trail = scene.add
      .particles(0, 0, 'spark', {
        speedX: { min: -260, max: -140 },
        speedY: { min: -30, max: 30 },
        lifespan: 360,
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: this.skin.trail,
        frequency: 28,
        blendMode: 'ADD',
      })
      .setDepth(8);

    const burst = (tint, speed = [120, 420]) =>
      scene.add
        .particles(0, 0, 'spark', {
          speed: { min: speed[0], max: speed[1] },
          angle: { min: 0, max: 360 },
          lifespan: { min: 300, max: 650 },
          scale: { start: 0.9, end: 0 },
          alpha: { start: 1, end: 0 },
          tint,
          blendMode: 'ADD',
          emitting: false,
        })
        .setDepth(12);
    this.bursts = {
      coin: burst([COLORS.yellow, COLORS.white], [60, 190]),
      gem: burst([COLORS.cyan, COLORS.purple, COLORS.white], [90, 300]),
      green: burst([COLORS.green, COLORS.cyan, COLORS.white], [100, 380]),
      red: burst([COLORS.red, COLORS.orange, COLORS.white], [90, 300]),
      cyan: burst([COLORS.cyan, COLORS.white], [70, 250]),
      death: burst([COLORS.cyan, COLORS.pink, COLORS.yellow, COLORS.white], [150, 520]),
    };

    this.dust = scene.add
      .particles(0, 0, 'spark', {
        speedX: { min: -220, max: 60 },
        speedY: { min: -120, max: -20 },
        lifespan: 320,
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: 0xd8c8ff,
        emitting: false,
      })
      .setDepth(9);

    // Neon post marking the best distance ever reached.
    this.recordMarker = scene.add.graphics().setDepth(3).setVisible(false);
    this.recordLabel = glow(scene.add.text(0, 0, t('record'), textStyle(22, '#eafff2')).setOrigin(0.5, 1).setDepth(3), COLORS.green, 12).setVisible(false);
  }

  // ------------------------------------------------------------- effects

  burstAt(kind, x, y, count = 14) {
    if (!this.effects) return;
    this.bursts[kind]?.explode(count, x, y);
  }

  floatText(x, y, text, color = COLORS.yellow, size = 30) {
    if (!this.effects) return;
    const label = this.scene.add.text(x, y, text, textStyle(size, hex(color))).setOrigin(0.5).setDepth(20);
    glow(label, color, 10);
    this.scene.tweens.add({ targets: label, y: y - 70, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => label.destroy() });
  }

  /** Visual reactions to world events. Returns the events for further handling. */
  handleEvents(events) {
    const p = this.world.player;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
          this.dust.explode(6, p.x, p.y);
          this.squash = -0.6;
          break;
        case 'doubleJump':
          this.burstAt('cyan', p.x, p.y - 20, 10);
          this.spin = 1;
          break;
        case 'land':
          this.dust.explode(e.impact > 900 ? 10 : 5, p.x, p.y);
          this.squash = Math.min(1, e.impact / 1100);
          break;
        case 'coin':
          this.burstAt('coin', e.x, e.y, 6);
          break;
        case 'gem':
          this.burstAt('gem', e.x, e.y, 16);
          this.floatText(e.x, e.y - 20, '+50', COLORS.cyan);
          break;
        case 'shield':
          this.burstAt('green', e.x, e.y, 16);
          this.floatText(e.x, e.y - 30, t('shield'), COLORS.green);
          break;
        case 'magnet':
          this.burstAt('red', e.x, e.y, 16);
          this.floatText(e.x, e.y - 30, t('magnet'), COLORS.red);
          break;
        case 'shieldBreak':
          this.burstAt('green', e.x, e.y, 26);
          this.scene.cameras.main.shake(160, 0.006);
          break;
        case 'death':
          this.burstAt('death', p.x, p.y - 28, 40);
          this.player.setVisible(false);
          this.bubble.setVisible(false);
          this.trail.stop();
          if (this.effects) {
            this.scene.cameras.main.shake(320, 0.012);
            this.scene.cameras.main.flash(180, 255, 43, 214);
          }
          break;
        case 'revive':
          this.player.setVisible(true).setAlpha(1);
          this.trail.start();
          this.burstAt('green', p.x, p.y - 30, 30);
          this.scene.cameras.main.flash(250, 57, 255, 136);
          break;
        default:
          break;
      }
    }
    return events;
  }

  // ------------------------------------------------------------- drawing

  _acquire(key) {
    const list = this.pool.get(key);
    if (list?.length) return list.pop().setActive(true).setVisible(true);
    return this.scene.add.image(0, 0, key);
  }

  _release(sprite) {
    sprite.setActive(false).setVisible(false);
    const key = sprite.texture.key;
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key).push(sprite);
  }

  _spriteFor(e) {
    let key = e.type;
    if (e.type === 'block') key = blockTextureKey(this.scene, e.w, e.h);
    const s = this._acquire(key);
    s.setOrigin(0.5).setAngle(0).setScale(1).setAlpha(1);
    s.setDepth(e.type === 'coin' || e.type === 'gem' ? 6 : e.type === 'shield' || e.type === 'magnet' ? 7 : 5);
    if (e.type === 'saw') s.setScale(e.r / SAW_TEXTURE_RADIUS);
    s.phase = (e.id * 0.37) % (Math.PI * 2);
    return s;
  }

  render(dt) {
    this.time += dt;
    const w = this.world;
    const { width, height } = this.scene.scale;
    const t = this.time;

    // Ground (tile-aligned so the texture never jumps).
    const seenGround = new Set();
    this.edges.clear();
    for (const s of w.segments) {
      const skip = Math.max(0, Math.floor((-TILE / 2 - s.x) / TILE)) * TILE;
      const left = s.x + skip;
      const right = Math.min(s.x + s.w, width + TILE);
      if (right <= left || left > width) continue;
      let ts = this.groundSprites.get(s.id);
      if (!ts) {
        ts = this.scene.add.tileSprite(0, 0, TILE, TILE, 'ground').setOrigin(0, 0).setDepth(0);
        this.groundSprites.set(s.id, ts);
      }
      const tw = right - left;
      const th = height - w.groundY + 4;
      ts.setPosition(left, w.groundY);
      if (ts.width !== tw || ts.height !== th) ts.setSize(tw, th);
      seenGround.add(s.id);

      // Neon edges around pits.
      this.edges.fillStyle(COLORS.cyan, 0.9);
      if (s.x > -10 && s.x < width + 10) this.edges.fillRect(s.x, w.groundY, 4, height - w.groundY);
      const end = s.x + s.w;
      if (end > -10 && end < width + 10) this.edges.fillRect(end - 4, w.groundY, 4, height - w.groundY);
    }
    for (const [id, ts] of this.groundSprites) {
      if (!seenGround.has(id)) {
        ts.destroy();
        this.groundSprites.delete(id);
      }
    }

    // Obstacles and pickups.
    const seen = new Set();
    for (const e of w.entities) {
      let s = this.sprites.get(e.id);
      if (!s) {
        s = this._spriteFor(e);
        this.sprites.set(e.id, s);
      }
      seen.add(e.id);
      let y = e.y;
      switch (e.type) {
        case 'saw':
          s.angle -= 540 * dt;
          break;
        case 'coin':
          s.scaleX = Math.max(0.15, Math.abs(Math.cos(t * 4 + s.phase)));
          y += Math.sin(t * 5 + s.phase) * 3;
          break;
        case 'gem':
          y += Math.sin(t * 3 + s.phase) * 6;
          s.setScale(1 + Math.sin(t * 6) * 0.05);
          break;
        case 'shield':
        case 'magnet':
          y += Math.sin(t * 3 + s.phase) * 8;
          s.setScale(1 + Math.sin(t * 5) * 0.08);
          break;
        default:
          break;
      }
      s.setPosition(e.x, y);
    }
    for (const [id, s] of this.sprites) {
      if (!seen.has(id)) {
        this._release(s);
        this.sprites.delete(id);
      }
    }

    this._renderRecord();
    this._renderPlayer(dt);
  }

  _renderRecord() {
    const w = this.world;
    const x = w.player.x + (this.recordPx - w.score.distancePx);
    const visible = this.recordPx > 0 && x > -40 && x < this.scene.scale.width + 40;
    this.recordMarker.setVisible(visible);
    this.recordLabel.setVisible(visible);
    if (!visible) return;
    const top = w.groundY - 250;
    const g = this.recordMarker;
    g.clear();
    g.lineStyle(10, COLORS.green, 0.18).lineBetween(x, w.groundY, x, top);
    g.lineStyle(4, COLORS.green, 0.95).lineBetween(x, w.groundY, x, top);
    g.fillStyle(COLORS.green, 0.9).fillTriangle(x, top, x + 46, top + 16, x, top + 32);
    this.recordLabel.setPosition(x, top - 6);
  }

  _renderPlayer(dt) {
    const w = this.world;
    const p = w.player;
    const pl = this.player;
    if (w.state === 'dead') {
      this.magnetRing.clear();
      return;
    }

    // Squash & stretch.
    this.squash += (0 - this.squash) * Math.min(1, dt * 12);
    let sx = 1 + this.squash * 0.28;
    let sy = 1 - this.squash * 0.24;
    if (p.grounded) {
      sy += Math.sin(this.time * 22) * 0.035;
    } else {
      const stretch = Phaser.Math.Clamp(-p.vy / 5000, -0.08, 0.14);
      sx -= stretch;
      sy += stretch;
    }
    pl.setScale(sx, sy);

    // Front flip on double jump, tilt otherwise.
    if (this.spin > 0) {
      this.spin = Math.max(0, this.spin - dt / 0.42);
      pl.setAngle((1 - this.spin) * 360);
    } else {
      const target = p.grounded ? 0 : Phaser.Math.Clamp(p.vy * 0.012, -12, 16);
      pl.setAngle(pl.angle + (target - pl.angle) * Math.min(1, dt * 14));
    }
    pl.setPosition(p.x, p.y);
    pl.setAlpha(p.invulnerable > 0 ? (Math.floor(this.time * 14) % 2 ? 0.35 : 1) : 1);

    const cy = p.y - 30;
    this.trail.setPosition(p.x - 18, cy + 10);
    this.bubble.setVisible(p.shield).setPosition(p.x, cy).setScale(1 + Math.sin(this.time * 6) * 0.04);

    this.magnetRing.clear();
    if (p.magnet > 0) {
      const r = 46 + Math.sin(this.time * 10) * 4;
      this.magnetRing.lineStyle(3, COLORS.red, 0.35 + 0.25 * Math.sin(this.time * 10));
      this.magnetRing.strokeCircle(p.x, cy, r);
      this.magnetRing.lineStyle(2, COLORS.white, 0.18);
      this.magnetRing.strokeCircle(p.x, cy, r + 10);
    }
  }

  /** Call after world.reset(): restores the player visuals. */
  reset() {
    this.player.setVisible(true).setAlpha(1).setAngle(0).setScale(1);
    this.squash = 0;
    this.spin = 0;
    this.trail.start();
  }

  setVisible(visible) {
    this.player.setVisible(visible);
    for (const s of this.sprites.values()) s.setVisible(visible);
  }
}
